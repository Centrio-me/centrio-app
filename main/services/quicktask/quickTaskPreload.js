// Preload of the quick-task window (quickTask.html): our own local page, a narrow API only.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('quickTask', {
    describe: (text) => ipcRenderer.invoke('quick-task:describe', String(text || '')),
    submit: (text) => ipcRenderer.invoke('quick-task:submit', String(text || '')),
    close: () => ipcRenderer.send('quick-task:close'),
    upgrade: () => ipcRenderer.send('quick-task:upgrade'),
    onShown: (cb) => { if (typeof cb === 'function') ipcRenderer.on('quick-task:shown', (_e, strings) => cb(strings)) }
})
