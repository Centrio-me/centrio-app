const { ipcMain, net } = require('electron')
const store = require('../services/store')

// ── Погода на экране блокировки ──────────────────────────────────────────
// Сетевой вызов делаем ЗДЕСЬ (main), а не в renderer/lock.js: CSP лок-скрина
// (index.html) сознательно ограничен 'self' + доменами Centrio — не хотим
// расширять его под сторонние домены ради одного виджета в гостевом контексте
// незалогиненного экрана. Два бесплатных сервиса без API-ключа: ipapi.co
// (примерный город по IP) + open-meteo.com (прогноз).
//
// Используем electron.net.fetch (не глобальный Node fetch): он идёт через
// Chromium-сетевой стек и автоматически уважает уже настроенный пользователем
// прокси (session.defaultSession.setProxy — см. main/services/proxy.js), в
// отличие от Node-fetch, который прокси не подхватит.
//
// PRIVACY: наружу уходит только приблизительная IP-геолокация напрямую с
// устройства пользователя к стороннему бесплатному сервису — НЕ на сервер
// Centrio, нигде не логируется и не сохраняется, кроме короткого локального
// кэша (ниже) для снижения частоты сетевых обращений.
//
// ipapi.co на практике отдаёт HTTP 403 части пользователей (жёсткая
// антибот/анти-VPN проверка на бесплатном тарифе — ловит в том числе обычные
// прокси/VPN, которыми пользуется сам Centrio для мессенджеров). Поэтому
// геолокация — не один сервис, а цепочка: пробуем по очереди, берём первый
// успешный ответ. Каждый провайдер отдаёт поля под разными именами —
// нормализуем в fetchGeo().
const GEO_PROVIDERS = [
    { url: 'https://ipwho.is/', parse: (d) => (d && d.success !== false) ? d : null },
    { url: 'https://freeipapi.com/api/json', parse: (d) => d },
    { url: 'https://ipapi.co/json/', parse: (d) => (d && !d.error) ? d : null }
]
const CACHE_TTL_MS = 30 * 60 * 1000
const FETCH_TIMEOUT_MS = 6000

function safeHandle(channel, handler) {
    try { ipcMain.removeHandler(channel) } catch {}
    ipcMain.handle(channel, handler)
}

async function fetchJson(url, timeoutMs) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
        const res = await net.fetch(url, { signal: controller.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return await res.json()
    } finally {
        clearTimeout(timer)
    }
}

// WMO weather_code → эмодзи-иконка + ключ i18n-описания. open-meteo отдаёт
// стандартные коды WMO 4677 (https://open-meteo.com/en/docs). Эмодзи вместо
// картинки-ассета — не тащим новый бинарный файл ради одного виджета,
// системный эмодзи-шрифт есть на всех целевых ОС.
function mapWeatherCode(code) {
    if (code === 0) return { icon: '☀️', key: 'clear' }
    if (code === 1 || code === 2) return { icon: '🌤️', key: 'partlyCloudy' }
    if (code === 3) return { icon: '☁️', key: 'cloudy' }
    if (code === 45 || code === 48) return { icon: '🌫️', key: 'fog' }
    if ([51, 53, 55, 56, 57].includes(code)) return { icon: '🌦️', key: 'drizzle' }
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { icon: '🌧️', key: 'rain' }
    if ([71, 73, 75, 77, 85, 86].includes(code)) return { icon: '🌨️', key: 'snow' }
    if ([95, 96, 99].includes(code)) return { icon: '⛈️', key: 'thunder' }
    return { icon: '🌡️', key: 'unknown' }
}

// Пробует провайдеров геолокации по очереди (см. GEO_PROVIDERS выше),
// возвращает первый успешный нормализованный результат. У каждого провайдера
// своё имя поля с городом (city / cityName) — приводим к единому виду здесь,
// а не в fetchWeather(), чтобы остальной код не знал про разницу провайдеров.
async function fetchGeo() {
    let lastError = null
    for (const provider of GEO_PROVIDERS) {
        try {
            const raw = await fetchJson(provider.url, FETCH_TIMEOUT_MS)
            const d = provider.parse(raw)
            if (!d || typeof d.latitude !== 'number' || typeof d.longitude !== 'number') {
                continue
            }
            const city = typeof d.city === 'string' ? d.city
                : typeof d.cityName === 'string' ? d.cityName
                : ''
            return { latitude: d.latitude, longitude: d.longitude, city }
        } catch (e) {
            lastError = e
        }
    }
    throw lastError || new Error('geo lookup failed')
}

async function fetchWeather() {
    const geo = await fetchGeo()

    const wx = await fetchJson(
        `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}&current=temperature_2m,weather_code&timezone=auto`,
        FETCH_TIMEOUT_MS
    )
    const current = wx?.current
    if (!current || typeof current.temperature_2m !== 'number') {
        throw new Error('weather lookup failed')
    }

    const { icon, key } = mapWeatherCode(current.weather_code)
    return {
        city: typeof geo.city === 'string' ? geo.city.slice(0, 80) : '',
        tempC: Math.round(current.temperature_2m),
        icon,
        conditionKey: key,
        ts: Date.now()
    }
}

function registerWeatherIpc() {
    safeHandle('weather:get', async () => {
        const cached = store.get('weatherCache', null)
        if (cached && typeof cached.ts === 'number' && Date.now() - cached.ts < CACHE_TTL_MS) {
            return cached
        }

        try {
            const fresh = await fetchWeather()
            store.set('weatherCache', fresh)
            return fresh
        } catch (e) {
            // Сеть недоступна / сервис не ответил — отдаём последний известный
            // результат (даже просроченный) вместо ошибки. Рендерер сам решает,
            // скрыть виджет или нет, если cached вообще нет (null).
            console.warn('[weather] fetch failed, falling back to cache:', e.message)
            return cached || null
        }
    })
}

module.exports = { registerWeatherIpc }
