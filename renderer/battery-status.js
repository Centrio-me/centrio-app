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

    async function start() {
        let answer
        try { answer = await invokeIpc('battery:has') } catch { return }
        if (!answer || !answer.hasBattery) return
        let battery
        try { battery = await navigator.getBattery() } catch { return }
        item.style.display = ''
        const separator = document.getElementById('statusBatterySep')
        if (separator) separator.style.display = ''
        draw(battery)
        ;['levelchange', 'chargingchange'].forEach((name) => battery.addEventListener(name, () => draw(battery)))
    }

    start()
}

module.exports = { bindBatteryStatus }
