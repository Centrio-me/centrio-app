'use strict'

// Адаптер под Anthropic Messages API — свой протокол, несовместимый с
// OpenAI-style chat/completions: system идёт отдельным top-level полем (не
// в messages[]), tool calling — через content-блоки `tool_use`/`tool_result`
// внутри messages, а не отдельное поле tool_calls.
//
// Нормализованный выходной протокол — тот же, что и у openaiCompatible.js
// (см. комментарий там): text-delta / tool-call / done / error.
const { net } = require('electron')

const REQUEST_TIMEOUT_MS = 60000
const ANTHROPIC_VERSION = '2023-06-01'

// Наши внутренние messages: [{role, content, toolCalls?, toolCallId?}]
// → { system, messages } под Anthropic Messages API.
function toAnthropicPayload(messages) {
    const systemParts = []
    const out = []

    for (const m of messages) {
        if (m.role === 'system') {
            if (m.content) systemParts.push(m.content)
            continue
        }
        if (m.role === 'tool') {
            out.push({
                role: 'user',
                content: [{ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content ?? '' }]
            })
            continue
        }
        if (m.role === 'assistant' && Array.isArray(m.toolCalls) && m.toolCalls.length > 0) {
            const blocks = []
            if (m.content) blocks.push({ type: 'text', text: m.content })
            for (const tc of m.toolCalls) {
                blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.arguments ?? {} })
            }
            out.push({ role: 'assistant', content: blocks })
            continue
        }
        out.push({ role: m.role, content: m.content ?? '' })
    }

    return { system: systemParts.join('\n\n') || undefined, messages: out }
}

function toAnthropicTools(tools) {
    if (!Array.isArray(tools) || tools.length === 0) return undefined
    return tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters || { type: 'object', properties: {} }
    }))
}

async function* chat({ apiKey, model, messages, tools, signal, maxTokens }) {
    const { system, messages: anthropicMessages } = toAnthropicPayload(messages)
    const anthropicTools = toAnthropicTools(tools)

    const body = {
        model,
        max_tokens: maxTokens || 4096,
        messages: anthropicMessages,
        stream: true
    }
    if (system) body.system = system
    if (anthropicTools) body.tools = anthropicTools

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort)

    let res
    try {
        res = await net.fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': ANTHROPIC_VERSION
            },
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
    // index -> { type: 'text'|'tool_use', id, name, text, jsonText }
    const blocks = new Map()
    let stopReason = null

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

                if (json.type === 'content_block_start') {
                    const idx = json.index
                    if (json.content_block?.type === 'tool_use') {
                        blocks.set(idx, { type: 'tool_use', id: json.content_block.id, name: json.content_block.name, jsonText: '' })
                    } else {
                        blocks.set(idx, { type: 'text', text: '' })
                    }
                } else if (json.type === 'content_block_delta') {
                    const idx = json.index
                    const block = blocks.get(idx)
                    if (!block) continue
                    if (json.delta?.type === 'text_delta' && json.delta.text) {
                        block.text = (block.text || '') + json.delta.text
                        yield { type: 'text-delta', text: json.delta.text }
                    } else if (json.delta?.type === 'input_json_delta' && typeof json.delta.partial_json === 'string') {
                        block.jsonText = (block.jsonText || '') + json.delta.partial_json
                    }
                } else if (json.type === 'message_delta') {
                    if (json.delta?.stop_reason) stopReason = json.delta.stop_reason
                } else if (json.type === 'error') {
                    yield { type: 'error', message: json.error?.message || 'anthropic stream error' }
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

    for (const block of blocks.values()) {
        if (block.type !== 'tool_use') continue
        let args = {}
        try { args = block.jsonText ? JSON.parse(block.jsonText) : {} } catch { args = {} }
        yield { type: 'tool-call', id: block.id, name: block.name, arguments: args }
    }

    yield { type: 'done', finishReason: stopReason === 'tool_use' ? 'tool_calls' : (stopReason || 'stop') }
}

module.exports = { chat }
