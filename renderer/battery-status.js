// Battery level in the status bar, next to the date and time. Shown only on laptops: the main process says whether
// the computer has a battery at all (a desktop PC gets nothing). The level and the charging state come live from the
// web battery API.
const LOW_LEVEL = 0.2

function bindBatteryStatus({ invokeIpc, tGet }) {
    const item = document.getElementById('statusBattery')
    if (!item || typeof navigator.getBattery !== 'function') return
    const fill = document.getElementById('statusBatteryFill')
    const text = document.getElementById('statusBatteryText')
    const bolt = document.getElementById('statusBatteryBolt')

    function draw(battery) {
        const percent = Math.round(battery.level * 100)
        text.textContent = percent + '%'
        fill.setAttribute('width', String(Math.max(1, Math.round(11.5 * battery.level * 10) / 10)))
        bolt.style.display = battery.charging ? '' : 'none'
        item.classList.toggle('battery-low', battery.level <= LOW_LEVEL && !battery.charging)
        item.classList.toggle('battery-charging', battery.charging)
        item.title = tGet(battery.charging ? 'status.batteryCharging' : 'status.battery').replace('{n}', percent)
    }

    function reveal() {
        item.style.display = ''
        const separator = document.getElementById('statusBatterySep')
        if (separator) separator.style.display = ''
    }

    // A desktop PC always reports "100 %, charging". A computer that runs on its battery, or is below full, is a laptop
    // whatever the operating system query said (that query can fail on locked-down PCs).
    const runsOnBattery = (battery) => battery.charging === false || battery.level < 1

    async function start() {
        let answer = null
        try { answer = await invokeIpc('battery:has') } catch { /* the web API below still tells */ }
        let battery
        try { battery = await navigator.getBattery() } catch { return }
        let shown = !!(answer && answer.hasBattery)
        if (shown || runsOnBattery(battery)) { shown = true; reveal(); draw(battery) }
        ;['levelchange', 'chargingchange'].forEach((name) => battery.addEventListener(name, () => {
            if (!shown && runsOnBattery(battery)) { shown = true; reveal() }
            if (shown) draw(battery)
        }))
    }

    start()
}

module.exports = { bindBatteryStatus }
