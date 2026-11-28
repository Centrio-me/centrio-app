const { ipcMain, dialog, clipboard, nativeImage } = require('electron')
const fs = require('fs')

function registerScreenshotIpc({ getMainWindow }) {
    // The eyedropper (renderer/color-picker.js) samples colours from a picture of the window, so the loupe can be drawn by Centrio itself
    ipcMain.handle('eyedropper:capture', async () => {
        try {
            const win = getMainWindow()
            if (!win || win.isDestroyed()) return null
            const image = await win.webContents.capturePage()
            const size = image.getSize()
            return { dataUrl: image.toDataURL(), width: size.width, height: size.height }
        } catch {
            return null
        }
    })

    ipcMain.handle('screenshot:capture', async (event, messengerId) => {
        try {
            const win = getMainWindow()
            if (!win || win.isDestroyed()) return { success: false, error: 'No main window' }

            // In modern Electron, capturePage is on webContents
            const image = await win.webContents.capturePage()
            const png = image.toPNG()

            // Copy to clipboard
            clipboard.writeImage(image)

            // Suggest saving to file
            const { filePath } = await dialog.showSaveDialog(win, {
                title: 'Save Screenshot',
                defaultPath: `Centrio_Screenshot_${Date.now()}.png`,
                filters: [{ name: 'Images', extensions: ['png'] }]
            })

            if (filePath) {
                fs.writeFileSync(filePath, png)
                return { success: true, saved: true, path: filePath }
            }

            return { success: true, saved: false }
        } catch (error) {
            console.error('[screenshot] Capture failed:', error)
            return { success: false, error: error.message }
        }
    })
}

module.exports = registerScreenshotIpc
