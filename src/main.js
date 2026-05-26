const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
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

ipcMain.handle('fs:new-file', async (_e, filePath) => {
  try { fs.writeFileSync(filePath, '', 'utf-8'); return { success: true } }
  catch (err) { return { error: err.message } }
})

ipcMain.handle('fs:new-folder', async (_e, folderPath) => {
  try { fs.mkdirSync(folderPath, { recursive: true }); return { success: true } }
  catch (err) { return { error: err.message } }
})

ipcMain.handle('fs:rename', async (_e, oldPath, newPath) => {
  try { fs.renameSync(oldPath, newPath); return { success: true } }
  catch (err) { return { error: err.message } }
})

ipcMain.handle('fs:delete', async (_e, itemPath) => {
  try { await shell.trashItem(itemPath); return { success: true } }
  catch (err) { return { error: err.message } }
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

let termProcess = null

ipcMain.handle('terminal:start', (event, cwd) => {
  if (termProcess) { try { termProcess.kill() } catch {} }

  termProcess = require('child_process').spawn(
    'powershell.exe',
    ['-NoLogo', '-NoProfile'],
    {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: cwd || process.env.USERPROFILE || 'C:\\',
      env: { ...process.env },
    }
  )

  termProcess.stdout.on('data', d => event.sender.send('terminal:data', d.toString()))
  termProcess.stderr.on('data', d => event.sender.send('terminal:data', d.toString()))
  termProcess.on('exit', code => {
    termProcess = null
    event.sender.send('terminal:exit', code)
  })
  return true
})

ipcMain.on('terminal:write', (_e, data) => {
  termProcess?.stdin.write(data)
})

ipcMain.on('terminal:kill', () => {
  try { termProcess?.kill() } catch {}
  termProcess = null
})

const PROJECT_TEMPLATES = {
  python: { file: 'main.py',   code: 'def main():\n    print("Hello from JankEdit!")\n\n\nif __name__ == "__main__":\n    main()\n' },
  c:      { file: 'main.c',    code: '#include <stdio.h>\n\nint main() {\n    printf("Hello from JankEdit!\\n");\n    return 0;\n}\n' },
  cpp:    { file: 'main.cpp',  code: '#include <iostream>\n\nint main() {\n    std::cout << "Hello from JankEdit!" << std::endl;\n    return 0;\n}\n' },
  java:   { file: 'Main.java', code: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from JankEdit!");\n    }\n}\n' },
  kotlin: { file: 'Main.kt',   code: 'fun main() {\n    println("Hello from JankEdit!")\n}\n' },
}

ipcMain.handle('create-project', async (_e, { name, location, language }) => {
  try {
    const projectPath = path.join(location, name)
    fs.mkdirSync(projectPath, { recursive: true })
    const tmpl = PROJECT_TEMPLATES[language]
    if (tmpl) fs.writeFileSync(path.join(projectPath, tmpl.file), tmpl.code, 'utf-8')
    return { projectPath, mainFile: tmpl ? path.join(projectPath, tmpl.file) : null, mainFileName: tmpl?.file }
  } catch (err) {
    return { error: err.message }
  }
})

ipcMain.handle('lsp:request', async (_e, langId, method, params) => {
  return lspManager.request(langId, method, params)
})

ipcMain.on('lsp:notify', (_e, langId, method, params) => {
  lspManager.notify(langId, method, params)
})

app.whenReady().then(createWindow)
app.on('before-quit', () => lspManager.stopAll())
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
