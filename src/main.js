const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { execFile, spawn } = require('child_process')
const lspManager = require('./lsp/lspManager')

const isDev = !app.isPackaged

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    frame: false,
    backgroundColor: '#FFFAF5',
    icon: path.join(app.getAppPath(), 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
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

// ── Git ──────────────────────────────────────────────────────────────────────

function runGit(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, timeout: 8000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr?.trim() || err.message))
      else resolve(stdout.trim())
    })
  })
}

ipcMain.handle('git:is-repo', async (_e, dir) => {
  try { await runGit(['rev-parse', '--git-dir'], dir); return true }
  catch { return false }
})

ipcMain.handle('git:branch', async (_e, dir) => {
  try { return { ok: true, branch: await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], dir) } }
  catch (err) { return { ok: false, error: err.message } }
})

ipcMain.handle('git:status', async (_e, dir) => {
  try {
    const out = await runGit(['status', '--porcelain'], dir)
    const files = out.split('\n').filter(Boolean).map(line => ({
      xy:   line.substring(0, 2),
      file: line.substring(3).trim(),
    }))
    return { ok: true, files }
  } catch (err) { return { ok: false, error: err.message } }
})

ipcMain.handle('git:add', async (_e, dir, files) => {
  try { await runGit(['add', '--', ...files], dir); return { ok: true } }
  catch (err) { return { ok: false, error: err.message } }
})

ipcMain.handle('git:unstage', async (_e, dir, files) => {
  try { await runGit(['restore', '--staged', '--', ...files], dir); return { ok: true } }
  catch (err) { return { ok: false, error: err.message } }
})

ipcMain.handle('git:commit', async (_e, dir, message) => {
  try { await runGit(['commit', '-m', message], dir); return { ok: true } }
  catch (err) { return { ok: false, error: err.message } }
})

ipcMain.handle('git:log', async (_e, dir) => {
  try { return { ok: true, lines: (await runGit(['log', '--oneline', '-20'], dir)).split('\n').filter(Boolean) } }
  catch (err) { return { ok: false, error: err.message } }
})

// ─────────────────────────────────────────────────────────────────────────────

ipcMain.handle('lsp:request', async (_e, langId, method, params) => {
  return lspManager.request(langId, method, params)
})

ipcMain.on('lsp:notify', (_e, langId, method, params) => {
  lspManager.notify(langId, method, params)
})

// ── Embedded Simulator ───────────────────────────────────────────────────────
const DEVICES = {
  'arduino-uno': {
    name: 'Arduino Uno',
    mcu: 'atmega328p', fcpu: 16000000,
    compiler: 'avr-gcc',
    compileArgs: (src, out) => ['-mmcu=atmega328p', '-DF_CPU=16000000UL', '-Os', '-Wall', '-o', out, src],
    simulator: 'simavr',
    simArgs: (elf) => ['-m', 'atmega328p', '--freq', '16000000', elf],
    pins: { digital: 14, analog: 6, label: 'D' },
  },
  'arduino-mega': {
    name: 'Arduino Mega',
    mcu: 'atmega2560', fcpu: 16000000,
    compiler: 'avr-gcc',
    compileArgs: (src, out) => ['-mmcu=atmega2560', '-DF_CPU=16000000UL', '-Os', '-Wall', '-o', out, src],
    simulator: 'simavr',
    simArgs: (elf) => ['-m', 'atmega2560', '--freq', '16000000', elf],
    pins: { digital: 54, analog: 16, label: 'D' },
  },
  'stm32f4': {
    name: 'STM32F4',
    mcu: 'cortex-m4',
    compiler: 'arm-none-eabi-gcc',
    compileArgs: (src, out) => ['-mcpu=cortex-m4', '-mthumb', '-Os', '-Wall', '-specs=nosys.specs', '-o', out, src],
    simulator: 'qemu-system-arm',
    simArgs: (elf) => ['-M', 'netduinoplus2', '-kernel', elf, '-serial', 'stdio', '-nographic', '-monitor', 'none'],
    pins: { digital: 16, analog: 4, label: 'PA' },
  },
  'stm32f1': {
    name: 'STM32F1 (Blue Pill)',
    mcu: 'cortex-m3',
    compiler: 'arm-none-eabi-gcc',
    compileArgs: (src, out) => ['-mcpu=cortex-m3', '-mthumb', '-Os', '-Wall', '-specs=nosys.specs', '-o', out, src],
    simulator: 'qemu-system-arm',
    simArgs: (elf) => ['-M', 'stm32-p103', '-kernel', elf, '-serial', 'stdio', '-nographic', '-monitor', 'none'],
    pins: { digital: 16, analog: 2, label: 'PA' },
  },
}

function cmdExists(cmd) {
  return new Promise(resolve => {
    execFile(process.platform === 'win32' ? 'where' : 'which', [cmd], err => resolve(!err))
  })
}

let simProcess  = null
let simSender   = null

ipcMain.handle('sim:get-devices', () =>
  Object.entries(DEVICES).map(([id, d]) => ({ id, name: d.name }))
)

ipcMain.handle('sim:check-toolchain', async (_e, deviceId) => {
  const dev = DEVICES[deviceId]
  if (!dev) return { compiler: false, simulator: false }
  const [compiler, simulator] = await Promise.all([cmdExists(dev.compiler), cmdExists(dev.simulator)])
  return { compiler, simulator }
})

ipcMain.handle('sim:compile', (_e, { deviceId, filePath }) => {
  const dev = DEVICES[deviceId]
  if (!dev) return { ok: false, error: 'Unknown device' }
  const outFile = path.join(os.tmpdir(), 'jankedit_sim.elf')
  const args = dev.compileArgs(filePath, outFile)
  return new Promise(resolve => {
    execFile(dev.compiler, args, { timeout: 30000 }, (err, _stdout, stderr) => {
      if (err) resolve({ ok: false, error: stderr?.trim() || err.message })
      else resolve({ ok: true, elfPath: outFile })
    })
  })
})

ipcMain.handle('sim:start', (event, { deviceId, elfPath }) => {
  if (simProcess) { try { simProcess.kill() } catch {} }
  const dev = DEVICES[deviceId]
  if (!dev) return false
  simSender = event.sender
  simProcess = spawn(dev.simulator, dev.simArgs(elfPath), { stdio: ['pipe', 'pipe', 'pipe'] })
  simProcess.stdout.on('data', d => event.sender.send('sim:serial', d.toString()))
  simProcess.stderr.on('data', d => {
    const txt = d.toString()
    event.sender.send('sim:serial', txt)
    // Parse simavr GPIO output: "PORTB[5] = 1" or similar
    const m = txt.match(/PORT([A-Z])\[(\d+)\]\s*=\s*(\d)/i)
    if (m) event.sender.send('sim:gpio', { port: m[1].toUpperCase(), pin: parseInt(m[2]), value: parseInt(m[3]) })
  })
  simProcess.on('exit', code => { simProcess = null; event.sender.send('sim:exit', code) })
  return true
})

ipcMain.on('sim:stop', () => { try { simProcess?.kill() } catch {}; simProcess = null })
ipcMain.on('sim:write', (_e, data) => simProcess?.stdin?.write(data))

// ─────────────────────────────────────────────────────────────────────────────

app.whenReady().then(createWindow)
app.on('before-quit', () => lspManager.stopAll())
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
