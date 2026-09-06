'use strict'

// Фабрика провайдера инференса по текущим настройкам ассистента
// (store-ключ 'assistant', см. main.js ALLOWED_STORE_ROOTS). Единая точка
// входа для main/ipc/assistant.js — он не знает, какой конкретно провайдер
// сейчас выбран, только зовёт getChatStream(...) и получает нормализованный
// поток чанков (см. openaiCompatible.js — там описан формат).
const store = require('../store')
const { decryptValue } = require('../secureStore')
const openaiCompatible = require('./openaiCompatible')
const anthropic = require('./anthropic')
const gemini = require('./gemini')
const centrioProxy = require('./centrioProxy')
const { assertSafeUrl } = require('../../utils/urlSafety')

// DeepSeek и OpenAI оба говорят chat/completions — переиспользуем
// openaiCompatible.js, разница только в endpoint (см. план §4.4).
const OPENAI_COMPAT_ENDPOINTS = {
    openai: 'https://api.openai.com/v1/chat/completions',
    deepseek: 'https://api.deepseek.com/chat/completions'
}

// Дефолт — самая дешёвая модель на провайдера (план §4.1).
const DEFAULT_MODELS = {
    openai: 'gpt-4o-mini',
    deepseek: 'deepseek-chat',
    anthropic: 'claude-3-5-haiku-20241022',
    gemini: 'gemini-2.5-flash'
}

function getAssistantConfig() {
    return store.get('assistant', {}) || {}
}

function getByokKey(provider) {
    const raw = store.get(`assistant.byok.${provider}.keyEnc`, null)
    if (!raw) return null
    try {
        return decryptValue(raw)
    } catch {
        return null
    }
}

// Публикуется, чтобы assistant:get-status IPC-хендлер мог сказать renderer'у
// "ключ настроен: да/нет" БЕЗ передачи самого ключа наружу (см. риск утечки
// ключа в плане §8) — renderer никогда не видит расшифрованное значение.
function hasByokKey(provider) {
    return !!store.get(`assistant.byok.${provider}.keyEnc`, null)
}

async function* getChatStream({ messages, tools, signal }) {
    const cfg = getAssistantConfig()
    const mode = cfg.mode || 'byok'

    if (mode === 'pro') {
        yield* centrioProxy.chat({ messages, tools, signal })
        return
    }

    if (mode === 'local') {
        const rawUrl = cfg.ollamaUrl || 'http://localhost:11434'
        try {
            await assertSafeUrl(rawUrl)
        } catch (e) {
            yield { type: 'error', message: e?.message || 'invalid_url' }
            return
        }

        const baseUrl = rawUrl.replace(/\/+$/, '')
        const model = cfg.ollamaModel
        if (!model) {
            yield { type: 'error', message: 'ollama_model_not_selected' }
            return
        }
        yield* openaiCompatible.chat({
            endpoint: `${baseUrl}/v1/chat/completions`,
            headers: {},
            model,
            messages,
            tools,
            signal
        })
        return
    }

    // BYOK
    const provider = cfg.byokProvider || 'openai'
    const apiKey = getByokKey(provider)
    if (!apiKey) {
        yield { type: 'error', message: 'missing_api_key' }
        return
    }
    const model = (cfg.byokModel && cfg.byokModel[provider]) || DEFAULT_MODELS[provider]

    if (provider === 'anthropic') {
        yield* anthropic.chat({ apiKey, model, messages, tools, signal })
        return
    }
    if (provider === 'gemini') {
        yield* gemini.chat({ apiKey, model, messages, tools, signal })
        return
    }

    const endpoint = OPENAI_COMPAT_ENDPOINTS[provider]
    if (!endpoint) {
        yield { type: 'error', message: 'unknown_provider' }
        return
    }
    yield* openaiCompatible.chat({
        endpoint,
        headers: { Authorization: `Bearer ${apiKey}` },
        model,
        messages,
        tools,
        signal
    })
}

module.exports = { getChatStream, getAssistantConfig, hasByokKey, DEFAULT_MODELS }
