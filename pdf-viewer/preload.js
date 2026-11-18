// Preload of the PDF reader page (our own local page): a narrow API, never the whole ipcRenderer.
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('centrioPdf', {
    init: () => ipcRenderer.invoke('pdfv:init'),
    saveAs: (bytes, name) => ipcRenderer.invoke('pdfv:save-as', bytes, name),
    print: () => ipcRenderer.invoke('pdfv:print'),
    openDialog: () => ipcRenderer.invoke('pdfv:open-dialog'),
    setTitle: (title) => ipcRenderer.send('pdfv:title', String(title || ''))
})
