'use strict'
// The tab manager's line «Сам Centrio, окна и службы» was one number (3.6 GB on Lucille's weak computer, 2026-11-24) with
// no way to tell what filled it. This splits what no tab claims into the parts a person or we can act on.

const KB = 1024

function toMb(kilobytes) {
    return Math.round((Number(kilobytes) || 0) / KB)
}

/**
 * @param {Array<{pid:number, type:string, memory?:{workingSetSize?:number}}>} metrics Electron's app.getAppMetrics()
 * @param {Set<number>} claimedPids processes already shown on a tab's own row
 * @param {number} uiPid the process of the Centrio window itself
 * @returns {{appMb:number, gpuMb:number, framesMb:number, servicesMb:number}}
 *   app: main process and the Centrio window; gpu: the video process; frames: page processes no tab row claims
 *   (sites embedded in a tab run on their own); services: network, audio, camera and the rest
 */
function breakdownOther(metrics, claimedPids, uiPid) {
    const kb = { app: 0, gpu: 0, frames: 0, services: 0 }
    for (const m of Array.isArray(metrics) ? metrics : []) {
        if (claimedPids && claimedPids.has(m.pid)) continue
        const size = (m.memory && m.memory.workingSetSize) || 0
        if (m.type === 'Browser' || m.pid === uiPid) kb.app += size
        else if (m.type === 'GPU') kb.gpu += size
        else if (m.type === 'Tab') kb.frames += size
        else kb.services += size
    }
    return { appMb: toMb(kb.app), gpuMb: toMb(kb.gpu), framesMb: toMb(kb.frames), servicesMb: toMb(kb.services) }
}

module.exports = { breakdownOther }
