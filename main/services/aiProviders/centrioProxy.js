'use strict'

// PRO-режим ("наша нейросеть") — единственный режим, где расходы несём мы,
// см. .claude/plans/ai-assistant.plan.md §4.3. Запрос идёт не к провайдеру
// напрямую, а на наш собственный бэкенд (api.centrio.me), который сам решает,
// через какого провайдера ответить (Agent Platform / DeepSeek). Наружу для
// клиента бэкенд отдаёт OpenAI-совместимый стрим — поэтому этот адаптер
// просто переиспользует openaiCompatible.js с другим endpoint + Bearer
// облачного токена вместо ключа юзера.
//
// Токен читаем здесь, в main, из уже существующего зашифрованного хранилища
// (тот же cloud.accessToken, что renderer.js кладёт через store.secureSet
// при логине через cloud-bind.js) — НЕ просим renderer передать его через
// IPC-аргументы, чтобы не гонять токен через лишнюю границу процесса без
// необходимости.
const store = require('../store')
const { decryptValue } = require('../secureStore')
const { AI_PROXY_PATH, API_URL } = require('../../config/constants')
const openaiCompatible = require('./openaiCompatible')

function getCloudToken() {
    const raw = store.get('cloud.accessToken', null)
    if (!raw) return null
    try {
        return decryptValue(raw)
    } catch {
        return null
    }
}

async function* chat({ messages, tools, signal }) {
    const token = getCloudToken()
    if (!token) {
        yield { type: 'error', message: 'not_authenticated' }
        return
    }

    yield* openaiCompatible.chat({
        endpoint: `${API_URL}${AI_PROXY_PATH}`,
        headers: { Authorization: `Bearer ${token}` },
        // Модель выбирает бэкенд (DeepSeek V4 Flash через Agent Platform на
        // момент написания плана) — клиент её не диктует в PRO-режиме.
        model: 'centrio-default',
        messages,
        tools,
        signal
    })
}

module.exports = { chat }
