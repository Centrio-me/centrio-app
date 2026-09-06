// Preload for the custom Franz-style OAuth popup chrome (toolbar
// WebContentsView) built in main/ipc/window.js's attachOAuthPopupChrome().
// This is our OWN trusted local HTML (main/services/oauthPopupChrome.html),
// never third-party page content — contextIsolation/sandbox are still kept
// on for defense-in-depth consistency with the rest of the app, not because
// this page is untrusted.
;(function () {
    const { contextBridge, ipcRenderer } = require('electron')

    contextBridge.exposeInMainWorld('centrioOauthChrome', {
        minimize: () => ipcRenderer.send('oauth-chrome:minimize'),
        maximize: () => ipcRenderer.send('oauth-chrome:maximize'),
        close: () => ipcRenderer.send('oauth-chrome:close'),
        refresh: () => ipcRenderer.send('oauth-chrome:refresh'),
        copyUrl: () => ipcRenderer.send('oauth-chrome:copy-url'),
        openExternal: () => ipcRenderer.send('oauth-chrome:open-external'),
        addAsService: () => ipcRenderer.send('oauth-chrome:add-service'),
        onState: (listener) => {
            ipcRenderer.on('oauth-chrome:state', (_event, state) => listener(state))
        }
    })
})()
