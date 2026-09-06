'use strict'

// Оркестрация чата AI-ассистента — main получает историю сообщений +
// JSON-схему доступных инструментов от renderer'а (renderer/assistant-tools.js
// формирует allowlist, renderer/assistant-bind.js их исполняет), гоняет их
// через выбранного провайдера (main/services/aiProviders/index.js) и
// пинг-понгом возвращает tool-call'ы обратно в renderer на исполнение —
// см. .claude/plans/ai-assistant.plan.md §3 за диаграммой и обоснованием,
// почему main НЕ решает сам, что делать в UI (тот же урок, что уже был на
// диплинках): main только оркестрирует сеть, renderer — единственный, кто
// знает state.activeMessengers/todos/settings и может их менять.
const { ipcMain, net } = require('electron')
const { safeSendToWindow } = require('../utils/window')
const { getChatStream, hasByokKey } = require('../services/aiProviders')
const { assertSafeUrl } = require('../utils/urlSafety')

const MAX_TOOL_ROUNDS = 8 // защита от зацикливания модели на бесконечных tool-call'ах
const OLLAMA_TEST_TIMEOUT_MS = 5000

function safeHandle(channel, handler) {
    try { ipcMain.removeHandler(channel) } catch {}
    ipcMain.handle(channel, handler)
}

function registerAssistantIpc({ getMainWindow }) {
    // requestId -> { controller, pendingToolResults: Map<toolCallId, {resolve}> }
    const activeRequests = new Map()

    safeHandle('assistant:get-status', async () => {
        return {
            success: true,
            data: {
                byok: {
                    openai: hasByokKey('openai'),
                    anthropic: hasByokKey('anthropic'),
                    gemini: hasByokKey('gemini'),
                    deepseek: hasByokKey('deepseek')
                }
            }
        }
    })

    // "Проверить подключение" в Настройки → AI-ассистент → Локальная модель —
    // CSP index.html (connect-src 'self' + centrio.me) не пускает renderer
    // напрямую дёрнуть http://localhost:11434, поэтому запрос уходит сюда
    // (тот же приём, что и в main/ipc/weather.js — net.fetch с таймаутом,
    // уважает пользовательский прокси через Chromium-стек). URL пришёл из
    // store-ключа assistant.ollamaUrl — ALLOWED_STORE_ROOTS в main.js гейтит
    // только верхний сегмент ('assistant'), не конкретное под-поле, так что
    // доверять этому значению как заведомо введённому самим пользователем в
    // этой же вкладке настроек нельзя (см. main/utils/urlSafety.js) —
    // assertSafeUrl() блокирует cloud-metadata/link-local адреса перед
    // сетевым запросом из main-процесса.
    safeHandle('assistant:ollama-test', async (_event, payload) => {
        const rawUrl = typeof payload?.url === 'string' ? payload.url.trim() : ''
        if (!rawUrl) return { success: false, error: 'invalid_request' }

        try {
            await assertSafeUrl(rawUrl)
        } catch (e) {
            return { success: false, error: e?.message || 'invalid_url' }
        }

        const baseUrl = rawUrl.replace(/\/+$/, '')
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), OLLAMA_TEST_TIMEOUT_MS)
        try {
            const res = await net.fetch(`${baseUrl}/api/tags`, { signal: controller.signal })
            if (!res.ok) return { success: false, error: `http_${res.status}` }
            const data = await res.json()
            const models = Array.isArray(data?.models)
                ? data.models.map(m => m?.name).filter(n => typeof n === 'string')
                : []
            return { success: true, data: { models } }
        } catch (e) {
            const message = e?.name === 'AbortError' ? 'timeout' : (e?.message || 'unreachable')
            return { success: false, error: message }
        } finally {
            clearTimeout(timer)
        }
    })

    safeHandle('assistant:chat', async (_event, payload) => {
        const requestId = payload?.requestId
        const messages = Array.isArray(payload?.messages) ? payload.messages : []
        const tools = Array.isArray(payload?.tools) ? payload.tools : []

        if (!requestId || messages.length === 0) {
            return { success: false, error: 'invalid_request' }
        }
        if (activeRequests.has(requestId)) {
            return { success: false, error: 'duplicate_request' }
        }

        const controller = new AbortController()
        const pendingToolResults = new Map()
        activeRequests.set(requestId, { controller, pendingToolResults })

        try {
            // Рабочая копия истории — дописываем tool-call/tool-result пары по
            // мере прохождения раундов, не мутируя payload.messages пришедший
            // от renderer'а.
            let conversation = messages.slice()
            let round = 0

            while (round < MAX_TOOL_ROUNDS) {
                round += 1
                let assistantText = ''
                const toolCalls = []
                let finishReason = 'stop'
                let streamError = null

                for await (const chunk of getChatStream({ messages: conversation, tools, signal: controller.signal })) {
                    if (chunk.type === 'text-delta') {
                        assistantText += chunk.text
                        safeSendToWindow(getMainWindow, 'assistant:stream-chunk', { requestId, text: chunk.text })
                    } else if (chunk.type === 'tool-call') {
                        toolCalls.push({ id: chunk.id, name: chunk.name, arguments: chunk.arguments })
                    } else if (chunk.type === 'error') {
                        streamError = chunk.message
                    } else if (chunk.type === 'done') {
                        finishReason = chunk.finishReason
                    }
                }

                if (streamError) {
                    safeSendToWindow(getMainWindow, 'assistant:error', { requestId, message: streamError })
                    return { success: false, error: streamError }
                }

                if (toolCalls.length === 0 || finishReason !== 'tool_calls') {
                    safeSendToWindow(getMainWindow, 'assistant:done', { requestId, finishReason })
                    return { success: true, data: { text: assistantText } }
                }

                // Модель попросила вызвать инструмент(ы) — записываем
                // assistant-сообщение с toolCalls в историю, затем просим
                // renderer выполнить каждый вызов и ждём результата.
                conversation = conversation.concat([{ role: 'assistant', content: assistantText || null, toolCalls }])

                for (const call of toolCalls) {
                    safeSendToWindow(getMainWindow, 'assistant:tool-call', {
                        requestId,
                        toolCallId: call.id,
                        name: call.name,
                        arguments: call.arguments
                    })

                    const resultText = await new Promise((resolve) => {
                        pendingToolResults.set(call.id, { resolve })
                    })

                    conversation = conversation.concat([{
                        role: 'tool',
                        toolCallId: call.id,
                        name: call.name,
                        content: resultText
                    }])
                }
            }

            safeSendToWindow(getMainWindow, 'assistant:error', { requestId, message: 'too_many_tool_rounds' })
            return { success: false, error: 'too_many_tool_rounds' }
        } catch (e) {
            const message = e?.name === 'AbortError' ? 'cancelled' : (e?.message || 'unknown_error')
            safeSendToWindow(getMainWindow, 'assistant:error', { requestId, message })
            return { success: false, error: message }
        } finally {
            activeRequests.delete(requestId)
        }
    })

    // Renderer вызывает это после локального исполнения инструмента
    // (switchTab/addTodo/... — см. renderer/assistant-tools.js) чтобы
    // разбудить ожидающий Promise внутри цикла выше и продолжить диалог.
    safeHandle('assistant:tool-result', async (_event, payload) => {
        const requestId = payload?.requestId
        const toolCallId = payload?.toolCallId
        const active = activeRequests.get(requestId)
        if (!active) return { success: false, error: 'unknown_request' }

        const pending = active.pendingToolResults.get(toolCallId)
        if (!pending) return { success: false, error: 'unknown_tool_call' }

        active.pendingToolResults.delete(toolCallId)
        // Инструменты всегда возвращают текст (JSON.stringify для объектов) —
        // это то, что уходит обратно в модель как содержимое tool-сообщения.
        const resultText = typeof payload?.result === 'string' ? payload.result : JSON.stringify(payload?.result ?? null)
        pending.resolve(resultText)
        return { success: true }
    })

    ipcMain.on('assistant:cancel', (_event, payload) => {
        const requestId = payload?.requestId
        const active = activeRequests.get(requestId)
        if (!active) return
        active.controller.abort()
        // Разбудить любые зависшие ожидания tool-result, чтобы промис не
        // висел вечно, если renderer отменил запрос посреди выполнения
        // инструмента.
        for (const pending of active.pendingToolResults.values()) {
            pending.resolve(JSON.stringify({ error: 'cancelled' }))
        }
        active.pendingToolResults.clear()
    })
}

module.exports = { registerAssistantIpc }
