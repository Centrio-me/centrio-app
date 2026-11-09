// Preload of the screen-share picker (picker.html): our own local page, a narrow API only.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('screenShare', {
    init: () => ipcRenderer.invoke('screen-share:init'),
    choose: (id, audio) => ipcRenderer.send('screen-share:choice', { id: String(id || ''), audio: audio === true }),
    cancel: () => ipcRenderer.send('screen-share:choice', null)
})
