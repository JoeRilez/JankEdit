const { spawn, execFile } = require('child_process')
const path = require('path')
const fs   = require('fs')

// ── Tool resolution ────────────────────────────────────────────────────────────
// For each tool, list fallback absolute paths to try if it's not on PATH.
const FALLBACKS = {
  clangd: [
    'C:\\Program Files\\LLVM\\bin\\clangd.exe',
    'C:\\Program Files (x86)\\LLVM\\bin\\clangd.exe',
  ],
}

function resolveCmd(command) {
  // Try fallback paths when the command can't be found on PATH
  const fallbacks = FALLBACKS[command] || []
  for (const abs of fallbacks) {
    try { if (fs.existsSync(abs)) return abs } catch {}
  }
  return command   // rely on PATH
}

// Check whether a CLI tool is available (PATH + fallbacks)
function cmdAvailable(command) {
  return new Promise(resolve => {
    const cmd = resolveCmd(command)
    execFile(process.platform === 'win32' ? 'where' : 'which',
      cmd === command ? [command] : [cmd],
      err => {
        if (!err) { resolve(true); return }
        // For absolute paths just check file existence
        if (cmd !== command) resolve(fs.existsSync(cmd))
        else resolve(false)
      }
    )
  })
}

// Maps language IDs to LSP server launch configs
const SERVER_CONFIGS = {
  python:     { command: 'pyright-langserver',          args: ['--stdio'] },
  c:          { command: 'clangd',                      args: ['--stdio', '--background-index'] },
  cpp:        { command: 'clangd',                      args: ['--stdio', '--background-index'] },
  java:       { command: 'jdtls',                       args: [] },
  kotlin:     { command: 'kotlin-language-server',      args: [] },
  javascript: { command: 'typescript-language-server',  args: ['--stdio'] },
  typescript: { command: 'typescript-language-server',  args: ['--stdio'] },
}

// Metadata for the settings UI
const SERVER_META = {
  python:     { label: 'Python',             tool: 'pyright-langserver',         install: 'npm i -g pyright  OR  pip install pyright' },
  c:          { label: 'C',                  tool: 'clangd',                     install: 'winget install LLVM.LLVM' },
  cpp:        { label: 'C++',               tool: 'clangd',                     install: 'winget install LLVM.LLVM' },
  javascript: { label: 'JavaScript',         tool: 'typescript-language-server', install: 'npm i -g typescript-language-server typescript' },
  typescript: { label: 'TypeScript',         tool: 'typescript-language-server', install: 'npm i -g typescript-language-server typescript' },
  java:       { label: 'Java',              tool: 'jdtls',                      install: 'See eclipse.jdt.ls releases on GitHub' },
  kotlin:     { label: 'Kotlin',            tool: 'kotlin-language-server',     install: 'See kotlin-language-server releases on GitHub' },
}

// (SERVER_META and cmdAvailable are attached to the singleton export below)

function pathToUri(p) {
  if (!p) return null
  return 'file:///' + p.replace(/\\/g, '/').replace(/^\//, '')
}

class LspManager {
  constructor() {
    this._servers     = {}    // langId -> server entry
    this._webContents = null
    this._root        = null  // current workspace root path
  }

  setWebContents(wc) { this._webContents = wc }

  // Call this when the user opens a folder — kills running servers so they
  // restart with the correct rootUri on next document open.
  setRoot(rootPath) {
    if (this._root === rootPath) return
    this._root = rootPath
    this.stopAll()   // servers will restart lazily with the new root
  }

  // ── Server lifecycle ──────────────────────────────────────────────────────

  ensureServer(langId) {
    const entry = this._servers[langId]
    if (entry?.ready)       return Promise.resolve(true)
    if (entry?.startPromise) return entry.startPromise

    const cfg = SERVER_CONFIGS[langId]
    if (!cfg) return Promise.resolve(false)

    const newEntry = {
      process: null, buffer: '', reqId: 1,
      pending: new Map(), ready: false, startPromise: null,
    }
    this._servers[langId] = newEntry

    newEntry.startPromise = this._startServer(langId, newEntry, cfg)
      .then(ok => { newEntry.startPromise = null; return ok })
      .catch(err => {
        console.error(`[lsp:${langId}] start failed:`, err.message)
        delete this._servers[langId]
        return false
      })

    return newEntry.startPromise
  }

  async _startServer(langId, entry, cfg) {
    const cmd  = resolveCmd(cfg.command)
    const proc = spawn(cmd, cfg.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    })
    entry.process = proc

    proc.stdout.on('data', d => this._handleData(langId, entry, d))
    proc.stderr.on('data', d => process.stderr.write(`[lsp:${langId}] ${d}`))
    proc.on('close', () => {
      console.log(`[lsp:${langId}] server closed`)
      delete this._servers[langId]
    })
    proc.on('error', err => {
      console.error(`[lsp:${langId}] spawn error:`, err.message)
      delete this._servers[langId]
    })

    const rootUri = pathToUri(this._root)

    const result = await this._request(entry, 'initialize', {
      processId: process.pid,
      clientInfo: { name: 'JankEdit', version: '1.4.0' },
      rootUri,
      rootPath: this._root || undefined,
      workspaceFolders: rootUri
        ? [{ uri: rootUri, name: this._root ? path.basename(this._root) : 'workspace' }]
        : null,
      capabilities: {
        workspace: {
          configuration:          true,
          didChangeConfiguration: { dynamicRegistration: true },
          workspaceFolders:       true,
        },
        textDocument: {
          synchronization: {
            dynamicRegistration: true,
            willSave:            false,
            willSaveWaitUntil:   false,
            didSave:             true,
          },
          completion: {
            dynamicRegistration: true,
            completionItem: {
              snippetSupport:          true,
              insertReplaceSupport:    true,
              resolveSupport:          { properties: ['detail', 'documentation'] },
              documentationFormat:     ['markdown', 'plaintext'],
            },
            contextSupport: true,
          },
          hover: {
            dynamicRegistration: true,
            contentFormat: ['markdown', 'plaintext'],
          },
          signatureHelp: {
            dynamicRegistration: true,
            signatureInformation: {
              documentationFormat: ['markdown', 'plaintext'],
              parameterInformation: { labelOffsetSupport: true },
            },
            contextSupport: true,
          },
          definition:  { dynamicRegistration: true, linkSupport: false },
          references:  { dynamicRegistration: true },
          formatting:  { dynamicRegistration: true },
          codeAction:  { dynamicRegistration: true },
          publishDiagnostics: { relatedInformation: true },
        },
      },
      initializationOptions: {},
    })

    if (!result) throw new Error('initialize returned null')
    this._notify(entry, 'initialized', {})
    entry.ready = true
    console.log(`[lsp:${langId}] ready  root=${this._root ?? 'none'}`)
    return true
  }

  // ── Data handling ─────────────────────────────────────────────────────────

  _handleData(langId, entry, chunk) {
    entry.buffer += chunk.toString()
    while (true) {
      const sep = entry.buffer.indexOf('\r\n\r\n')
      if (sep === -1) break
      const header = entry.buffer.slice(0, sep)
      const m = header.match(/Content-Length:\s*(\d+)/i)
      if (!m) { entry.buffer = entry.buffer.slice(sep + 4); continue }
      const len   = parseInt(m[1])
      const start = sep + 4
      if (entry.buffer.length < start + len) break
      const body = entry.buffer.slice(start, start + len)
      entry.buffer = entry.buffer.slice(start + len)
      try { this._dispatch(langId, entry, JSON.parse(body)) } catch {}
    }
  }

  _dispatch(langId, entry, msg) {
    if (msg.id != null) {
      if (entry.pending.has(msg.id)) {
        // Response to one of our requests
        const { resolve } = entry.pending.get(msg.id)
        entry.pending.delete(msg.id)
        resolve(msg.result ?? null)
      } else if (msg.method) {
        // Server-initiated request (needs a response)
        this._handleServerRequest(langId, entry, msg)
      }
    } else if (msg.method) {
      // Server notification → forward to renderer
      if (this._webContents && !this._webContents.isDestroyed()) {
        this._webContents.send('lsp:notification', { langId, method: msg.method, params: msg.params })
      }
    }
  }

  // Respond to requests the server sends to the client
  _handleServerRequest(_langId, entry, msg) {
    let result = null

    switch (msg.method) {
      case 'workspace/configuration':
        // Return null for each requested config item (server uses defaults)
        result = (msg.params?.items ?? []).map(() => null)
        break
      case 'client/registerCapability':
      case 'client/unregisterCapability':
        result = null
        break
      case 'workspace/applyEdit':
        result = { applied: false }
        break
      case 'window/showMessageRequest':
      case 'window/showDocument':
        result = null
        break
      default:
        result = null
    }

    this._write(entry, { jsonrpc: '2.0', id: msg.id, result })
  }

  // ── RPC primitives ────────────────────────────────────────────────────────

  _request(entry, method, params) {
    return new Promise(resolve => {
      const id = entry.reqId++
      entry.pending.set(id, { resolve })
      this._write(entry, { jsonrpc: '2.0', id, method, params })
      setTimeout(() => {
        if (entry.pending.has(id)) { entry.pending.delete(id); resolve(null) }
      }, 10000)
    })
  }

  _notify(entry, method, params) {
    this._write(entry, { jsonrpc: '2.0', method, params })
  }

  _write(entry, msg) {
    try {
      const body = JSON.stringify(msg)
      entry.process.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
    } catch {}
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async request(langId, method, params) {
    const ok = await this.ensureServer(langId)
    if (!ok) return null
    const entry = this._servers[langId]
    if (!entry?.ready) return null
    return this._request(entry, method, params)
  }

  async notify(langId, method, params) {
    const ok = await this.ensureServer(langId)
    if (!ok) return
    const entry = this._servers[langId]
    if (entry?.ready) this._notify(entry, method, params)
  }

  stopAll() {
    for (const entry of Object.values(this._servers)) {
      try { entry.process?.kill() } catch {}
    }
    this._servers = {}
  }
}

const instance = new LspManager()
instance.SERVER_META  = SERVER_META
instance.cmdAvailable = cmdAvailable
module.exports = instance
