// Preload of the notification pop-up: a handful of one-way messages to the main process, nothing else.
;(function () {
    const { contextBridge, ipcRenderer } = require('electron')
    contextBridge.exposeInMainWorld('toastApi', {
        click: () => ipcRenderer.send('toast:click'),
        close: () => ipcRenderer.send('toast:close'),
        done: () => ipcRenderer.send('toast:done'),
        extend: () => ipcRenderer.send('toast:extend'),
        hover: (on) => ipcRenderer.send('toast:hover', !!on),
        reply: (text) => ipcRenderer.send('toast:reply', String(text || '').slice(0, 4000)),
        resize: (height) => ipcRenderer.send('toast:resize', Number(height) || 0),
        onInit: (listener) => ipcRenderer.on('toast:init', (_event, data) => listener(data)),
        onReplyResult: (listener) => ipcRenderer.on('toast:reply-result', (_event, result) => listener(String(result || 'failed')))
    })
})()
