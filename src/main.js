const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const lspManager = require('./lsp/lspManager')

const isDev = !app.isPackaged

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    frame: false,
    backgroundColor: '#FFFAF5',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  win.webContents.on('did-finish-load', () => {
    lspManager.setWebContents(win.webContents)
  })
}

ipcMain.handle('read-dir', async (_e, dirPath) => {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    return entries.map(e => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      path: path.join(dirPath, e.name),
    }))
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('read-file', async (_e, filePath) => {
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('write-file', async (_e, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8')
    return { success: true }
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('open-folder-dialog', async () => {
  const win = BrowserWindow.getFocusedWindow()
  const result = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: 'Open Folder — JankEdit',
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('window-minimize', () => BrowserWindow.getFocusedWindow()?.minimize())
ipcMain.handle('window-maximize', () => {
  const win = BrowserWindow.getFocusedWindow()
  win?.isMaximized() ? win.unmaximize() : win.maximize()
})
ipcMain.handle('window-close', () => BrowserWindow.getFocusedWindow()?.close())

ipcMain.handle('lsp:request', async (_e, langId, method, params) => {
  return lspManager.request(langId, method, params)
})

ipcMain.on('lsp:notify', (_e, langId, method, params) => {
  lspManager.notify(langId, method, params)
})

app.whenReady().then(createWindow)
app.on('before-quit', () => lspManager.stopAll())
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
