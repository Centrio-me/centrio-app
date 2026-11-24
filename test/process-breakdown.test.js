'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { breakdownOther } = require('../shared/process-breakdown')

const proc = (pid, type, kb) => ({ pid, type, memory: { workingSetSize: kb } })
const MB = 1024

test('what the tabs do not claim is split into the Centrio window, the video process, page frames and services', () => {
    const metrics = [
        proc(1, 'Browser', 300 * MB),
        proc(2, 'GPU', 400 * MB),
        proc(3, 'Tab', 500 * MB), // the Centrio window itself
        proc(4, 'Tab', 250 * MB), // a tab, claimed
        proc(5, 'Tab', 600 * MB), // a page frame no tab claims (an embedded site)
        proc(6, 'Utility', 100 * MB),
        proc(7, 'Utility', 50 * MB)
    ]
    const parts = breakdownOther(metrics, new Set([4]), 3)
    assert.deepEqual(parts, { appMb: 800, gpuMb: 400, framesMb: 600, servicesMb: 150 })
})

test('tabs that are claimed are left out, whatever their size', () => {
    const parts = breakdownOther([proc(4, 'Tab', 900 * MB)], new Set([4]), 3)
    assert.deepEqual(parts, { appMb: 0, gpuMb: 0, framesMb: 0, servicesMb: 0 })
})

test('an unknown process type counts as a service, a missing size as zero', () => {
    const parts = breakdownOther([proc(8, 'Zygote', 20 * MB), { pid: 9, type: 'Utility' }], new Set(), 3)
    assert.deepEqual(parts, { appMb: 0, gpuMb: 0, framesMb: 0, servicesMb: 20 })
})

test('not a list of processes gives zeros instead of an error', () => {
    assert.deepEqual(breakdownOther(null, new Set(), 3), { appMb: 0, gpuMb: 0, framesMb: 0, servicesMb: 0 })
})
