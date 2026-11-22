// Preload of the PDF reader page (our own local page): a narrow API, never the whole ipcRenderer.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('centrioPdf', {
    init: () => ipcRenderer.invoke('pdfv:init'),
    saveAs: (bytes, name) => ipcRenderer.invoke('pdfv:save-as', bytes, name),
    print: () => ipcRenderer.invoke('pdfv:print'),
    getDuplex: () => ipcRenderer.invoke('pdfv:get-duplex'),
    setDuplex: (on) => ipcRenderer.invoke('pdfv:set-duplex', on === true),
    openDialog: () => ipcRenderer.invoke('pdfv:open-dialog'),
    openOriginal: () => ipcRenderer.invoke('pdfv:open-original'),
    close: () => ipcRenderer.send('pdfv:close'),
    setTitle: (title) => ipcRenderer.send('pdfv:title', String(title || ''))
})
