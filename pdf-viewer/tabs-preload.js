// Preload of the reader's tab strip (our own local page): a narrow API, never the whole ipcRenderer.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('centrioPdfTabs', {
    getState: () => ipcRenderer.invoke('pdftabs:get'),
    onState: (callback) => { ipcRenderer.on('pdftabs:state', (_event, state) => callback(state)) },
    activate: (id) => ipcRenderer.send('pdftabs:activate', Number(id)),
    close: (id) => ipcRenderer.send('pdftabs:close', Number(id)),
    add: () => ipcRenderer.send('pdftabs:new')
})
