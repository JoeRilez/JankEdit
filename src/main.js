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

const pty = require('node-pty')
let termProcess = null

// Read the current PATH from the Windows registry so that any `setx` changes
// made after JankEdit launched are immediately visible in the terminal.
function getFreshWindowsPath() {
  try {
    const { execSync } = require('child_process')
    const readReg = key => {
      try {
        const out = execSync(`reg query "${key}" /v PATH`, { encoding: 'utf8' })
        const line = out.split('\n').find(l => /PATH/i.test(l) && l.includes('    '))
        return line ? line.trim().split(/\s{2,}/).pop() : ''
      } catch { return '' }
    }
    const user   = readReg('HKCU\\Environment')
    const system = readReg('HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment')
    return [user, system].filter(Boolean).join(';')
  } catch { return process.env.PATH }
}

ipcMain.handle('terminal:start', (event, cwd) => {
  if (termProcess) { try { termProcess.kill() } catch {} }

  const freshPath = getFreshWindowsPath()
  termProcess = pty.spawn('powershell.exe', [
    '-NoLogo', '-NoProfile', '-NoExit',
    '-Command',
    // Alias python → py so scripts that call python work regardless of PATH
    'function python { py @args }; function python3 { py @args }; function pip { py -m pip @args }',
  ], {
    name: 'xterm-256color',
    cols: 120,
    rows: 30,
    cwd: cwd || process.env.USERPROFILE || 'C:\\',
    env: { ...process.env, PATH: freshPath || process.env.PATH },
  })

  termProcess.onData(d => event.sender.send('terminal:data', d))
  termProcess.onExit(({ exitCode }) => {
    termProcess = null
    event.sender.send('terminal:exit', exitCode)
  })
  return true
})

ipcMain.on('terminal:write', (_e, data) => {
  termProcess?.write(data)
})

ipcMain.on('terminal:resize', (_e, cols, rows) => {
  try { termProcess?.resize(cols, rows) } catch {}
})

ipcMain.on('terminal:kill', () => {
  try { termProcess?.kill() } catch {}
  termProcess = null
})

// ── Run panel (clean output, no interactive terminal) ─────────────────────────
let runProcess = null

ipcMain.handle('run:start', (event, { cmd, args, cwd }) => {
  if (runProcess) { try { runProcess.kill() } catch {} }
  const env = { ...process.env, PATH: getFreshWindowsPath() || process.env.PATH }
  runProcess = spawn(cmd, args, { cwd, env })
  runProcess.stdout.on('data', d => event.sender.send('run:output', { text: d.toString(), isErr: false }))
  runProcess.stderr.on('data', d => event.sender.send('run:output', { text: d.toString(), isErr: true }))
  runProcess.on('exit', code => { runProcess = null; event.sender.send('run:exit', code ?? 0) })
  return true
})

ipcMain.on('run:stop', () => {
  try { if (runProcess) { runProcess.kill(); runProcess = null } } catch {}
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

ipcMain.handle('lsp:set-root', (_e, rootPath) => {
  lspManager.setRoot(rootPath)
})

ipcMain.handle('lsp:list-servers', async () => {
  const meta = lspManager.SERVER_META
  const entries = await Promise.all(
    Object.entries(meta).map(async ([langId, info]) => {
      const available = await lspManager.cmdAvailable(info.tool)
      return [langId, { ...info, available }]
    })
  )
  return Object.fromEntries(entries)
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

// ── Package Manager ──────────────────────────────────────────────────────────

// Spawn a package-manager command and stream stdout/stderr back as 'pkg:log'
function spawnPkg(event, cmd, args, cwd) {
  return new Promise(resolve => {
    const proc = spawn(cmd, args, {
      cwd: cwd || process.env.USERPROFILE || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    })
    proc.stdout.on('data', d => event.sender.send('pkg:log', d.toString()))
    proc.stderr.on('data', d => event.sender.send('pkg:log', d.toString()))
    proc.on('exit',  code => { event.sender.send('pkg:log', `\n[done — exit ${code}]\n`); resolve({ ok: code === 0 }) })
    proc.on('error', err  => { event.sender.send('pkg:log', `\n[error: ${err.message}]\n`); resolve({ ok: false, error: err.message }) })
  })
}

// Detect which package managers apply to the open folder
ipcMain.handle('pkg:detect', (_e, rootPath) => {
  if (!rootPath) return {}
  const has = name => { try { fs.accessSync(path.join(rootPath, name)); return true } catch { return false } }
  let hasIno = false
  try { hasIno = fs.readdirSync(rootPath).some(f => f.endsWith('.ino')) } catch {}
  return {
    npm:     has('package.json'),
    pip:     has('requirements.txt') || has('pyproject.toml') || has('setup.py'),
    vcpkg:   has('vcpkg.json'),
    arduino: hasIno || has('sketch.yaml'),
  }
})

// Check whether a CLI tool is on PATH
ipcMain.handle('pkg:check-tool', (_e, tool) => cmdExists(tool))

// List installed packages for a given manager
ipcMain.handle('pkg:list', async (_e, { manager, rootPath }) => {
  try {
    if (manager === 'npm') {
      return await new Promise(resolve => {
        execFile('npm', ['list', '--depth=0', '--json'], { cwd: rootPath, timeout: 15000 }, (_err, stdout) => {
          try {
            const data = JSON.parse(stdout || '{}')
            const deps = data.dependencies || {}
            resolve({ ok: true, packages: Object.entries(deps).map(([name, info]) => ({ name, version: info.version || '' })) })
          } catch { resolve({ ok: true, packages: [] }) }
        })
      })
    }
    if (manager === 'pip') {
      const out = await new Promise((res, rej) =>
        execFile('py', ['-m', 'pip', 'list', '--format=json'], { timeout: 10000 }, (err, stdout, stderr) =>
          err ? rej(new Error(stderr || err.message)) : res(stdout)))
      return { ok: true, packages: JSON.parse(out).map(p => ({ name: p.name, version: p.version })) }
    }
    if (manager === 'vcpkg') {
      const out = await new Promise((res, rej) =>
        execFile('vcpkg', ['list'], { timeout: 10000 }, (err, stdout, stderr) =>
          err ? rej(new Error(stderr || err.message)) : res(stdout)))
      const packages = out.split('\n').filter(Boolean).map(line => {
        const [pkg, ver] = line.trim().split(/\s+/)
        return { name: (pkg || '').split(':')[0], version: ver || '' }
      }).filter(p => p.name)
      return { ok: true, packages }
    }
    if (manager === 'arduino') {
      const out = await new Promise((res, rej) =>
        execFile('arduino-cli', ['lib', 'list', '--format', 'json'], { timeout: 10000 }, (err, stdout, stderr) =>
          err ? rej(new Error(stderr || err.message)) : res(stdout)))
      const data = JSON.parse(out || '{}')
      const libs = data.installed_libraries || []
      return { ok: true, packages: libs.map(l => ({ name: l.library?.name || l.name, version: l.library?.version || '' })) }
    }
    return { ok: false, error: 'Unknown manager' }
  } catch (err) { return { ok: false, error: err.message } }
})

// Install a package — streams progress, resolves when done
ipcMain.handle('pkg:install', (event, { manager, packageName, rootPath, dev }) => {
  const cmds = {
    npm:     ['npm',         ['install', ...(dev ? ['--save-dev'] : ['--save']), packageName]],
    pip:     ['py',          ['-m', 'pip', 'install', packageName]],
    vcpkg:   ['vcpkg',       ['install', packageName]],
    arduino: ['arduino-cli', ['lib', 'install', packageName]],
  }
  const entry = cmds[manager]
  if (!entry) return Promise.resolve({ ok: false, error: 'Unknown manager' })
  event.sender.send('pkg:log', `> ${entry[0]} ${entry[1].join(' ')}\n`)
  return spawnPkg(event, entry[0], entry[1], rootPath)
})

// Uninstall a package — streams progress
ipcMain.handle('pkg:uninstall', (event, { manager, packageName, rootPath }) => {
  const cmds = {
    npm:     ['npm',         ['uninstall', packageName]],
    pip:     ['py',          ['-m', 'pip', 'uninstall', '-y', packageName]],
    vcpkg:   ['vcpkg',       ['remove', packageName]],
    arduino: ['arduino-cli', ['lib', 'uninstall', packageName]],
  }
  const entry = cmds[manager]
  if (!entry) return Promise.resolve({ ok: false, error: 'Unknown manager' })
  event.sender.send('pkg:log', `> ${entry[0]} ${entry[1].join(' ')}\n`)
  return spawnPkg(event, entry[0], entry[1], rootPath)
})

// vcpkg search (run locally since there's no public REST API)
ipcMain.handle('pkg:search-vcpkg', async (_e, query) => {
  try {
    const out = await new Promise((res, rej) =>
      execFile('vcpkg', ['search', query], { timeout: 10000 }, (err, stdout, stderr) =>
        err ? rej(new Error(stderr || err.message)) : res(stdout)))
    const results = out.split('\n')
      .filter(l => l.trim() && !l.startsWith('If') && !l.startsWith('The') && !l.startsWith('vcpkg'))
      .map(l => {
        const m = l.match(/^(\S+)\s+(\S+)\s+(.*)/)
        return m ? { name: m[1].split(':')[0], version: m[2], description: m[3].trim() } : null
      })
      .filter(Boolean)
      .slice(0, 20)
    return { ok: true, results }
  } catch (err) { return { ok: false, error: err.message } }
})

// arduino-cli library search
ipcMain.handle('pkg:search-arduino', async (_e, query) => {
  try {
    const out = await new Promise((res, rej) =>
      execFile('arduino-cli', ['lib', 'search', query, '--format', 'json'], { timeout: 15000 }, (err, stdout, stderr) =>
        err ? rej(new Error(stderr || err.message)) : res(stdout)))
    const data = JSON.parse(out || '{}')
    const libs = (data.libraries || []).slice(0, 20)
    return { ok: true, results: libs.map(l => ({ name: l.name, version: l.latest?.version || '', description: l.latest?.sentence || '' })) }
  } catch (err) { return { ok: false, error: err.message } }
})

// ─────────────────────────────────────────────────────────────────────────────

app.whenReady().then(createWindow)
app.on('before-quit', () => lspManager.stopAll())
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
