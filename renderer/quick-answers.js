'use strict'
// Answers shown on top of the quick switcher (Ctrl+K): a sum is solved, an amount of money is converted at the Bank of Russia rate,
// units are converted, a colour is shown in every notation, a timer is offered. Each kind is a tool of Settings → Расширения that can
// be switched off (window.__centrioTools, see renderer/ext-tools.js).
const { evaluate, formatNumber } = require('../shared/calc')
const { parseCurrencyQuery, convert } = require('../shared/currency-query')
const { parseUnitQuery, convertUnits, unitLabel } = require('../shared/units-query')
const { parseColor, formatColor } = require('../shared/color-query')
const { parseTimerQuery, formatClock } = require('../shared/timer-query')

const MAX_FRACTION_MONEY = 2
const MAX_FRACTION_SUM = 8
const MAX_FRACTION_UNITS = 4
const NBSP = String.fromCharCode(160)

const on = (id) => (window.__centrioTools || {})[id] !== false
const plain = (shown) => shown.split(NBSP).join('')

/** "15 мин", "2 ч 30 мин", "45 сек" */
function durationWords(ms, tGet) {
    const total = Math.round(ms / 1000)
    const h = Math.floor(total / 3600)
    const m = Math.floor((total % 3600) / 60)
    const s = total % 60
    return [h ? `${h} ${tGet('vext.timer.h')}` : '', m ? `${m} ${tGet('vext.timer.m')}` : '', s ? `${s} ${tGet('vext.timer.s')}` : ''].filter(Boolean).join(' ')
}

/**
 * An answer: { label, copy, hint, swatch?, run? }. A click copies `copy`, or does `run` (a timer starts), and closes the window.
 * @param {{ invokeIpc: (channel: string, ...args: any[]) => Promise<any>, tGet: (key: string, params?: object) => string,
 *   timer: { start: Function, cancel: Function, list: Function } }} deps
 */
function createQuickAnswers({ invokeIpc, tGet, timer, getLang = () => 'ru', pickColor = null }) {
    let rates = null
    let date = ''
    let loading = false

    /** Called when the switcher opens: the rates are on hand by the time someone types an amount. */
    async function prefetch() {
        if (loading || !on('currency')) return
        loading = true
        try {
            const info = await invokeIpc('rates:get')
            if (info && info.rates) { rates = info.rates; date = info.date || '' }
        } catch { /* offline: sums still work */ } finally { loading = false }
    }

    const copyHint = () => tGet('vext.answers.copy')

    function sumAnswers(text) {
        const sum = evaluate(text)
        if (sum == null) return []
        const shown = formatNumber(sum, MAX_FRACTION_SUM)
        return [{ label: `${text.replace(/\s+/g, ' ')} = ${shown}`, copy: plain(shown), hint: copyHint() }]
    }

    function timerAnswers(text) {
        const q = parseTimerQuery(text)
        if (!q) return []
        if (q.list) {
            return timer.list().map((t) => ({
                label: `${tGet('vext.timer.left', { t: formatClock(t.end - Date.now()) })}${t.label ? ` · ${t.label}` : ''}`,
                copy: '', hint: tGet('vext.timer.cancel'), run: () => timer.cancel(t.id)
            }))
        }
        return [{
            label: `${tGet('vext.timer.for', { d: durationWords(q.ms, tGet) })}${q.label ? ` · ${q.label}` : ''}`,
            copy: '', hint: tGet('vext.timer.start'), run: () => timer.start(q.ms, q.label)
        }]
    }

    function colorAnswers(text) {
        if (pickColor && /^(пипетка|eyedropper|pipette|pick colou?r|взять цвет)$/i.test(text)) {
            return [{ label: tGet('vext.color.pickLabel'), copy: '', hint: tGet('vext.color.pickHint'), run: pickColor }]
        }
        const rgb = parseColor(text)
        if (!rgb) return []
        const f = formatColor(rgb)
        return [f.hex, f.rgb, f.hsl].map((value) => ({ label: value, copy: value, hint: copyHint(), swatch: f.hex }))
    }

    function unitAnswers(text) {
        const q = parseUnitQuery(text)
        if (!q) return []
        const lang = getLang()
        const from = `${formatNumber(q.amount, MAX_FRACTION_UNITS)} ${unitLabel(q.from, lang)}`
        return convertUnits(q, lang).map((r) => {
            const shown = formatNumber(r.value, MAX_FRACTION_UNITS)
            return { label: `${from} = ${shown} ${r.label}`, copy: plain(shown), hint: copyHint() }
        })
    }

    function moneyAnswers(text) {
        const money = parseCurrencyQuery(text)
        if (!money) return []
        if (!rates) return [{ label: tGet('vext.answers.loading'), copy: '', hint: '' }]
        return convert(money, rates).map((r) => {
            const shown = formatNumber(r.value, MAX_FRACTION_MONEY)
            return {
                label: `${formatNumber(money.amount, MAX_FRACTION_MONEY)} ${money.from} = ${shown} ${r.code}`,
                copy: plain(shown),
                hint: date ? tGet('vext.answers.rate', { d: date }) : copyHint()
            }
        })
    }

    /** @returns {{ label: string, copy: string, hint: string, swatch?: string, run?: () => void }[]} */
    function answersFor(query) {
        const text = String(query || '').trim()
        if (!text || text.startsWith('/')) return []
        if (on('currency')) { const sum = sumAnswers(text); if (sum.length) return sum }
        if (on('timer')) { const t = timerAnswers(text); if (t.length) return t }
        if (on('color')) { const c = colorAnswers(text); if (c.length) return c }
        if (on('units')) { const u = unitAnswers(text); if (u.length) return u }
        if (on('currency')) return moneyAnswers(text)
        return []
    }

    return { prefetch, answersFor }
}

module.exports = { createQuickAnswers }
