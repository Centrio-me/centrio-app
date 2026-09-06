'use strict'

// Общий клиент для всех провайдеров, говорящих OpenAI-совместимым
// `chat/completions` + `tools` протоколом: OpenAI, DeepSeek, Ollama
// (/v1/chat/completions) и наш собственный PRO-прокси (см. centrioProxy.js,
// который переиспользует этот модуль с другим endpoint/заголовками).
//
// Используем electron.net.fetch (не глобальный Node fetch) — тот же мотив,
// что и в main/ipc/weather.js: уважает пользовательский прокси, настроенный
// через session.defaultSession.setProxy.
//
// Нормализованный выходной протокол (единый для всех адаптеров в этой
// директории, см. main/ipc/assistant.js):
//   { type: 'text-delta', text }
//   { type: 'tool-call', id, name, arguments }   — arguments уже распарсен JSON
//   { type: 'done', finishReason }
//   { type: 'error', message }
const { net } = require('electron')

const REQUEST_TIMEOUT_MS = 60000

function toOpenAiMessages(messages) {
    return messages.map((m) => {
        if (m.role === 'tool') {
            return { role: 'tool', tool_call_id: m.toolCallId, content: m.content ?? '' }
        }
        if (m.role === 'assistant' && Array.isArray(m.toolCalls) && m.toolCalls.length > 0) {
            return {
                role: 'assistant',
                content: m.content || null,
                tool_calls: m.toolCalls.map((tc) => ({
                    id: tc.id,
                    type: 'function',
                    function: { name: tc.name, arguments: JSON.stringify(tc.arguments ?? {}) }
                }))
            }
        }
        return { role: m.role, content: m.content ?? '' }
    })
}

function toOpenAiTools(tools) {
    if (!Array.isArray(tools) || tools.length === 0) return undefined
    return tools.map((t) => ({
        type: 'function',
        function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters || { type: 'object', properties: {} }
        }
    }))
}

// Парсит один SSE-стрим OpenAI-совместимого /chat/completions и вызывает
// onChunk(...) с уже нормализованными кусками. Аккумулирует tool_calls по
// index (OpenAI шлёт их дельтами: имя может прийти в одном чанке, аргументы —
// по кусочкам в следующих) и эмиттит `tool-call` только когда стрим закончен.
async function* streamOpenAiCompatible({ endpoint, headers, body, signal }) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort)

    let res
    try {
        res = await net.fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify(body),
            signal: controller.signal
        })
    } catch (e) {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        yield { type: 'error', message: e.name === 'AbortError' ? 'timeout' : e.message }
        return
    }

    if (!res.ok || !res.body) {
        let detail = ''
        try { detail = (await res.text()).slice(0, 500) } catch {}
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        // Наш собственный PRO-прокси (centrioProxy.js) отдаёт структурированное
        // {error: '<code>'} тело на 403/429/503 (см. server:
        // /var/www/centrio-api/src/routes/assistant.js) — вытаскиваем code,
        // чтобы renderer/assistant-bind.js смог смаппить его на конкретный
        // i18n-текст через ERROR_MESSAGE_KEYS, а не показать сырой `HTTP 403: {...}`.
        let code = null
        try {
            const parsed = JSON.parse(detail)
            code = parsed?.error || parsed?.code || null
        } catch {}
        yield { type: 'error', message: code || `HTTP ${res.status}${detail ? ': ' + detail : ''}` }
        return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    // index -> { id, name, argsText }
    const toolCallAcc = new Map()
    let finishReason = null

    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })

            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''

            for (const rawLine of lines) {
                const line = rawLine.trim()
                if (!line.startsWith('data:')) continue
                const payload = line.slice(5).trim()
                if (payload === '[DONE]') continue

                let json
                try { json = JSON.parse(payload) } catch { continue }

                const choice = json?.choices?.[0]
                if (!choice) continue
                if (choice.finish_reason) finishReason = choice.finish_reason

                const delta = choice.delta || {}
                if (typeof delta.content === 'string' && delta.content.length > 0) {
                    yield { type: 'text-delta', text: delta.content }
                }

                if (Array.isArray(delta.tool_calls)) {
                    for (const tc of delta.tool_calls) {
                        const idx = tc.index ?? 0
                        const acc = toolCallAcc.get(idx) || { id: null, name: '', argsText: '' }
                        if (tc.id) acc.id = tc.id
                        if (tc.function?.name) acc.name += tc.function.name
                        if (typeof tc.function?.arguments === 'string') acc.argsText += tc.function.arguments
                        toolCallAcc.set(idx, acc)
                    }
                }
            }
        }
    } catch (e) {
        yield { type: 'error', message: e.name === 'AbortError' ? 'timeout' : e.message }
        return
    } finally {
        clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
    }

    for (const acc of toolCallAcc.values()) {
        let args = {}
        try { args = acc.argsText ? JSON.parse(acc.argsText) : {} } catch { args = {} }
        yield { type: 'tool-call', id: acc.id, name: acc.name, arguments: args }
    }

    yield { type: 'done', finishReason: finishReason || (toolCallAcc.size > 0 ? 'tool_calls' : 'stop') }
}

// endpoint: полный URL до /chat/completions-совместимого маршрута.
// headers: доп. заголовки (Authorization и т.д.) — формирует вызывающий
// адаптер (byok.js использует Bearer ключ юзера, centrioProxy.js — Bearer
// облачный токен), этот модуль про формат ключей не знает и не хранит их.
async function* chat({ endpoint, headers, model, messages, tools, signal, temperature }) {
    const body = {
        model,
        messages: toOpenAiMessages(messages),
        stream: true
    }
    const openAiTools = toOpenAiTools(tools)
    if (openAiTools) body.tools = openAiTools
    if (typeof temperature === 'number') body.temperature = temperature

    yield* streamOpenAiCompatible({ endpoint, headers, body, signal })
}

module.exports = { chat }
