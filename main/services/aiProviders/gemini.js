'use strict'

// Адаптер под Google Gemini (`generateContent` REST API) — третий
// несовместимый формат: роли называются `user`/`model` (не `assistant`),
// контент — массив `parts` (не строка), tool calling — через
// `functionDeclarations`/`functionCall`/`functionResponse`, а не
// OpenAI-style `tools`/`tool_calls`.
//
// Нормализованный выходной протокол — тот же, что и у остальных адаптеров:
// text-delta / tool-call / done / error (см. openaiCompatible.js).
//
// Gemini не выдаёт id для tool-вызовов (в отличие от OpenAI/Anthropic) — этот
// адаптер генерирует детерминированный id по позиции вызова в ответе, чтобы
// внутренний протокол assistant.js (сопоставление tool-call ↔ tool-result по
// id) работал одинаково для всех провайдеров.
const { net } = require('electron')

const REQUEST_TIMEOUT_MS = 60000

function toGeminiContents(messages) {
    const out = []
    for (const m of messages) {
        if (m.role === 'system') continue // уходит в systemInstruction отдельно
        if (m.role === 'tool') {
            out.push({
                role: 'function',
                parts: [{ functionResponse: { name: m.name || 'unknown', response: { result: m.content ?? '' } } }]
            })
            continue
        }
        if (m.role === 'assistant' && Array.isArray(m.toolCalls) && m.toolCalls.length > 0) {
            const parts = []
            if (m.content) parts.push({ text: m.content })
            for (const tc of m.toolCalls) {
                parts.push({ functionCall: { name: tc.name, args: tc.arguments ?? {} } })
            }
            out.push({ role: 'model', parts })
            continue
        }
        out.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content ?? '' }] })
    }
    return out
}

function extractSystemInstruction(messages) {
    const systemParts = messages.filter((m) => m.role === 'system' && m.content).map((m) => m.content)
    if (systemParts.length === 0) return undefined
    return { parts: [{ text: systemParts.join('\n\n') }] }
}

function toGeminiTools(tools) {
    if (!Array.isArray(tools) || tools.length === 0) return undefined
    return [{
        functionDeclarations: tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters || { type: 'object', properties: {} }
        }))
    }]
}

async function* chat({ apiKey, model, messages, tools, signal }) {
    const contents = toGeminiContents(messages)
    const systemInstruction = extractSystemInstruction(messages)
    const geminiTools = toGeminiTools(tools)

    const body = { contents }
    if (systemInstruction) body.systemInstruction = systemInstruction
    if (geminiTools) body.tools = geminiTools

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort)

    let res
    try {
        res = await net.fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
        yield { type: 'error', message: `HTTP ${res.status}${detail ? ': ' + detail : ''}` }
        return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let finishReason = null
    let toolCallSeq = 0
    const pendingToolCalls = []

    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buffer += decoder.decode(value, { stream: true })

            const frames = buffer.split('\n\n')
            buffer = frames.pop() ?? ''

            for (const frame of frames) {
                const dataLine = frame.split('\n').find((l) => l.startsWith('data:'))
                if (!dataLine) continue
                let json
                try { json = JSON.parse(dataLine.slice(5).trim()) } catch { continue }

                const candidate = json?.candidates?.[0]
                if (!candidate) continue
                if (candidate.finishReason) finishReason = candidate.finishReason

                const parts = candidate.content?.parts || []
                for (const part of parts) {
                    if (typeof part.text === 'string' && part.text.length > 0) {
                        yield { type: 'text-delta', text: part.text }
                    } else if (part.functionCall) {
                        toolCallSeq += 1
                        pendingToolCalls.push({
                            id: `call_${toolCallSeq}`,
                            name: part.functionCall.name,
                            arguments: part.functionCall.args || {}
                        })
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

    for (const tc of pendingToolCalls) {
        yield { type: 'tool-call', id: tc.id, name: tc.name, arguments: tc.arguments }
    }

    yield { type: 'done', finishReason: pendingToolCalls.length > 0 ? 'tool_calls' : (finishReason === 'STOP' ? 'stop' : (finishReason || 'stop')) }
}

module.exports = { chat }
