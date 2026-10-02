// Pro upsell window (redesign 2026-10-02, concept agreed with the owner).
// The window markup lives in index.html (#upgradeModal); this module only
// handles the Month / Year switch and renders the price for the interface
// language: roubles for Russian, euros for every other language.
const PRICES = {
    RUB: { symbol: '₽', month: 199, yearMonthly: 133, yearTotal: 1590, after: true },
    EUR: { symbol: '€', month: 4, yearMonthly: 3.33, yearTotal: 40, after: false }
}

function bindProWindow({ tGet, getLanguage, openExternal }) {
    const state = { period: 'year' }
    const $ = (id) => document.getElementById(id)

    function money(value, currency) {
        const rounded = Number.isInteger(value) ? String(value) : value.toFixed(2)
        return currency.after ? `${rounded} ${currency.symbol}` : `${currency.symbol}${rounded}`
    }

    function render() {
        const currency = (getLanguage() || 'ru') === 'ru' ? PRICES.RUB : PRICES.EUR
        const yearly = state.period === 'year'
        $('upgradeSegMonth')?.classList.toggle('on', !yearly)
        $('upgradeSegYear')?.classList.toggle('on', yearly)
        $('upgradeSegMonth')?.setAttribute('aria-selected', String(!yearly))
        $('upgradeSegYear')?.setAttribute('aria-selected', String(yearly))
        const strike = $('upgradeStrike')
        if (strike) {
            strike.textContent = yearly ? `${money(currency.month, currency)} ${tGet('proWin.perMonth') || ''}` : ''
            strike.style.visibility = yearly ? 'visible' : 'hidden'
        }
        const amount = $('upgradeAmount')
        if (amount) amount.textContent = money(yearly ? currency.yearMonthly : currency.month, currency)
        const per = $('upgradePer')
        if (per) per.textContent = ` ${tGet('proWin.perMonth') || ''}`
        const note = $('upgradePriceNote')
        if (note) {
            note.textContent = yearly
                ? (tGet('proWin.yearNote') || '').replace('{total}', money(currency.yearTotal, currency))
                : (tGet('proWin.monthNote') || '')
        }
    }

    $('upgradeSegMonth')?.addEventListener('click', () => { state.period = 'month'; render() })
    $('upgradeSegYear')?.addEventListener('click', () => { state.period = 'year'; render() })
    $('upgradePromoBtn')?.addEventListener('click', () => openExternal('https://centrio.me/dashboard'))
    $('upgradeTeamBtn')?.addEventListener('click', () => openExternal('https://centrio.me/teams'))

    render()
    return { render }
}

module.exports = { bindProWindow }
