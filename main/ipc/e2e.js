'use strict'
// IPC for the phone link: key pair, QR pairing, trusted phones, sealing the message feed and opening replies.
// The keys never leave this process; the renderer only gets the QR text, a list of phone names and sealed packets.
const { ipcMain } = require('electron')
const store = require('../services/store')
const secureStore = require('../services/secureStore')
const { createE2e } = require('../services/e2e')

const KEY_PREFIX = 'e2e.'

// The key pair is the one secret here: it is kept encrypted by the operating system (safeStorage) when that is available.
function load(name) {
    const raw = store.get(KEY_PREFIX + name, null)
    if (raw === null || raw === undefined) return null
    if (name !== 'identity') return raw
    try {
        const plain = secureStore.decryptValue(raw)
        return plain ? JSON.parse(plain) : null
    } catch {
        return null
    }
}

function save(name, value) {
    if (name === 'identity') store.set(KEY_PREFIX + name, secureStore.encryptValue(JSON.stringify(value)))
    else store.set(KEY_PREFIX + name, value)
}

function registerE2eIpc() {
    const e2e = createE2e({ load, save })
    const publicPhones = () => e2e.phones().map(p => ({ deviceId: p.deviceId, name: p.name }))

    ipcMain.handle('e2e:phones', () => ({ phones: publicPhones(), keyId: e2e.identity().keyId }))

    ipcMain.handle('e2e:begin-pairing', (_e, userId) => {
        if (typeof userId !== 'string' || !userId) return { error: 'no_user' }
        const { qr, expiresAt, keyId } = e2e.beginPairing({ userId })
        return { qr, expiresAt, keyId }
    })

    // The phones the server lists. A phone with a valid proof is trusted; phones gone from the server are forgotten.
    // Returns the ids that were just trusted (to be confirmed on the server) and the phones now trusted.
    ipcMain.handle('e2e:sync-phones', (_e, serverPhones) => {
        const list = Array.isArray(serverPhones) ? serverPhones.slice(0, 20) : []
        const known = new Set(e2e.phones().map(p => p.deviceId))
        const newlyTrusted = []
        for (const p of list) {
            if (!p || typeof p.deviceId !== 'string' || known.has(p.deviceId) || p.confirmedAt) continue
            if (e2e.trustIfProven({ deviceId: p.deviceId, name: p.name, pub: p.pub, proof: p.proof })) newlyTrusted.push(p.deviceId)
        }
        e2e.keepOnly(list.map(p => p && p.deviceId).filter(Boolean))
        return { newlyTrusted, phones: publicPhones() }
    })

    ipcMain.handle('e2e:forget', (_e, deviceId) => {
        if (typeof deviceId === 'string') e2e.forgetPhone(deviceId)
        return { phones: publicPhones() }
    })

    ipcMain.handle('e2e:seal-feed', (_e, ref, plain) => {
        if (typeof ref !== 'string' || typeof plain !== 'string' || plain.length > 4000) return { payloads: [] }
        return { payloads: e2e.sealForPhones(ref, plain) }
    })

    ipcMain.handle('e2e:open-reply', (_e, reply) => {
        if (!reply || typeof reply.ref !== 'string') return { text: null }
        const plain = e2e.openReply({ phoneDeviceId: String(reply.phoneDeviceId || ''), ref: reply.ref, desktopKeyId: String(reply.desktopKeyId || ''), enc: String(reply.enc || '') })
        if (plain === null) return { text: null }
        try {
            const text = JSON.parse(plain).text
            return { text: typeof text === 'string' ? text : null }
        } catch {
            return { text: null }
        }
    })
}

module.exports = registerE2eIpc
