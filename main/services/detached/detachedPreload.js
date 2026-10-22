// Preload of the separate-messenger-window host page (detachedWindow.html). Our own trusted local page; it gets a
// narrow API, never the whole ipcRenderer.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('centrioDetached', {
    init: () => ipcRenderer.invoke('detached:init'),
    control: (action, value) => ipcRenderer.send('detached:control', String(action), value),
    onState: (cb) => { if (typeof cb === 'function') ipcRenderer.on('detached:state', (_e, state) => cb(state)) },
    onCommand: (cb) => { if (typeof cb === 'function') ipcRenderer.on('detached:command', (_e, command) => cb(command)) }
})
