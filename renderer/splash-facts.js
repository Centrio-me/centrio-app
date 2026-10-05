// Startup splash: "Did you know?" facts that rotate while the app loads, plus a note when loading takes long.
// Texts live in the locale files (startup.factTag / startup.factN{Title,Text} / startup.slow), so they follow the
// chosen language; initI18n() runs before this starts, so even the first launch speaks the system language.
const FACT_COUNT = 6
const ROTATE_MS = 6500
const SLOW_AFTER_MS = 9000

let rotateTimer = null
let slowTimer = null

function startSplashFacts({ tGet }) {
    const box = document.getElementById('startupFact')
    const dots = document.getElementById('startupDots')
    const slow = document.getElementById('startupSlow')
    if (!box) return

    const text = (key) => {
        const value = tGet(key)
        return value && value !== key ? value : ''
    }
    // start from a random fact so a user who opens the app daily does not always see the same one first
    let index = Math.floor(Math.random() * FACT_COUNT)

    function render() {
        const n = (index % FACT_COUNT) + 1
        const title = text(`startup.fact${n}Title`)
        if (!title) return
        box.textContent = ''
        const tag = document.createElement('div')
        tag.className = 'sp-eyebrow'
        tag.textContent = text('startup.factTag')
        const h = document.createElement('h2')
        h.className = 'sp-fact-title'
        h.textContent = title
        const p = document.createElement('p')
        p.className = 'sp-fact-text'
        p.textContent = text(`startup.fact${n}Text`)
        box.append(tag, h, p)
        if (dots) {
            dots.textContent = ''
            for (let k = 0; k < FACT_COUNT; k += 1) {
                const dot = document.createElement('i')
                if (k === n - 1) dot.className = 'on'
                dots.appendChild(dot)
            }
        }
    }

    render()
    stopSplashFacts()
    rotateTimer = setInterval(() => { index += 1; render() }, ROTATE_MS)
    slowTimer = setTimeout(() => { if (slow) slow.textContent = text('startup.slow') }, SLOW_AFTER_MS)
}

function stopSplashFacts() {
    clearInterval(rotateTimer)
    clearTimeout(slowTimer)
    rotateTimer = null
    slowTimer = null
}

module.exports = { startSplashFacts, stopSplashFacts }
