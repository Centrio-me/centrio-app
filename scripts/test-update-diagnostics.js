const test = require('node:test')
const assert = require('node:assert/strict')
const { installKind, scrubPaths, collectInstallDiagnostics } = require('../main/services/updateDiagnostics')

const env = { LOCALAPPDATA: 'C:\\Users\\Иван\\AppData\\Local', PROGRAMFILES: 'C:\\Program Files', 'PROGRAMFILES(X86)': 'C:\\Program Files (x86)', USERPROFILE: 'C:\\Users\\Иван' }

test('where the app is installed', () => {
    assert.equal(installKind('C:\\Users\\Иван\\AppData\\Local\\Programs\\Centrio\\Centrio.exe', env), 'per-user')
    assert.equal(installKind('C:\\Program Files\\Centrio\\Centrio.exe', env), 'program-files')
    assert.equal(installKind('D:\\Apps\\Centrio\\Centrio.exe', env), 'custom')
    assert.equal(installKind('c:\\program files (x86)\\Centrio\\Centrio.exe', env), 'program-files')
})

test('personal paths and names never leave the computer', () => {
    const msg = scrubPaths('EPERM: operation not permitted, open \'C:\\Users\\Иван\\AppData\\Local\\centrio-updater\\pending\\x.exe\'', env)
    assert.equal(msg.includes('Иван'), false)
    assert.ok(msg.includes('%LOCALAPPDATA%'))
    assert.ok(scrubPaths('x'.repeat(1000), env).length <= 300)
})

test('collects the facts with a fake file system', () => {
    const files = new Set(['C:\\Users\\Иван\\AppData\\Local\\centrio-updater\\pending\\Centrio-Setup-3.7.1.exe'])
    const fakeFs = {
        writeFileSync: (p) => { if (p.startsWith('C:\\Program Files')) { const e = new Error('EPERM'); e.code = 'EPERM'; throw e } },
        unlinkSync: () => {},
        readdirSync: (dir) => [...files].filter((f) => f.startsWith(dir)).map((f) => f.slice(dir.length + 1)),
        existsSync: (p) => [...files].some((f) => f.startsWith(p))
    }
    const d = collectInstallDiagnostics({
        execPath: 'C:\\Program Files\\Centrio\\Centrio.exe', env, fs: fakeFs, updaterCacheDirName: 'centrio-updater',
        lastError: 'Error: spawn C:\\Users\\Иван\\x.exe EACCES'
    })
    assert.deepEqual(d, { installKind: 'program-files', installDirWritable: false, installDirError: 'EPERM', installerCached: true, lastError: 'Error: spawn %USERPROFILE%\\x.exe EACCES' })
})
