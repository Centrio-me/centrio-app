// What the update strip shows, as a pure function of what happened.
// update-status comes from main/services/updater.js. A check runs every few hours and
// repeats available/downloaded for a file that is already on disk, so those events must
// leave a strip the person has seen or put off alone.

const initialState = Object.freeze({
    phase: 'idle', // idle | downloading | ready | installing | updated | failed | snoozed
    version: '',
    percent: 0,
    failure: null, // download | install
})

const OPEN_PHASES = ['ready', 'installing', 'updated', 'failed']

function isStripOpen(state) {
    return OPEN_PHASES.includes(state.phase)
}

function holdsDownloadedUpdate(state) {
    return ['ready', 'snoozed', 'installing'].includes(state.phase)
        || (state.phase === 'failed' && state.failure === 'install')
}

function onStatus(state, event) {
    const { status, version = '', percent = 0, failedBefore = false } = event

    if (status === 'available') {
        if (holdsDownloadedUpdate(state) && state.version === version) return state
        return { ...initialState, phase: 'downloading', version }
    }

    if (status === 'downloading') {
        if (holdsDownloadedUpdate(state)) return state
        return { ...state, phase: 'downloading', percent, failure: null }
    }

    if (status === 'downloaded') {
        if (holdsDownloadedUpdate(state) && state.version === version) return state
        if (failedBefore) return { ...initialState, phase: 'failed', failure: 'install', version }
        return { ...initialState, phase: 'ready', version }
    }

    if (status === 'installing') {
        return { ...state, phase: 'installing', version: version || state.version, failure: null }
    }

    if (status === 'not-available') {
        const wasFetching = state.phase === 'downloading' || (state.phase === 'failed' && state.failure === 'download')
        return wasFetching ? initialState : state
    }

    if (status === 'error') {
        if (state.phase === 'downloading') return { ...state, phase: 'failed', failure: 'download' }
        if (state.phase === 'installing') return { ...state, phase: 'failed', failure: 'install' }
    }

    return state
}

function dismiss(state) {
    if (!isStripOpen(state)) return state
    const keepsUpdate = state.phase === 'ready' || state.failure === 'install'
    return keepsUpdate ? { ...state, phase: 'snoozed' } : initialState
}

function reduce(state, event) {
    switch (event.type) {
    case 'status':
        return onStatus(state, event)
    case 'updated':
        return { ...initialState, phase: 'updated', version: event.version }
    case 'later':
    case 'close':
        return dismiss(state)
    case 'show':
        if (state.phase !== 'snoozed') return state
        return { ...state, phase: state.failure ? 'failed' : 'ready' }
    case 'install':
        return { ...state, phase: 'installing', failure: null }
    case 'retry':
        if (state.failure === 'install') return { ...state, phase: 'installing', failure: null }
        return { ...state, phase: 'downloading', percent: 0, failure: null }
    case 'install-timeout':
        if (state.phase !== 'installing') return state
        return { ...state, phase: 'failed', failure: 'install' }
    default:
        return state
    }
}

module.exports = { initialState, reduce, isStripOpen }
