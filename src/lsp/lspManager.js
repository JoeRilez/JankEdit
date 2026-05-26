const { spawn } = require('child_process')

// Maps Monaco language IDs to LSP server configs
const SERVER_CONFIGS = {
  python: { command: 'pyright-langserver', args: ['--stdio'] },
  c:      { command: 'clangd',             args: ['--stdio'] },
  cpp:    { command: 'clangd',             args: ['--stdio'] },
  java:   { command: 'jdtls',              args: [] },
  kotlin: { command: 'kotlin-language-server', args: [] },
}

class LspManager {
  constructor() {
    this._servers = {}     // langId -> server entry
    this._webContents = null
  }

  setWebContents(wc) {
    this._webContents = wc
  }

  // Returns a promise that resolves to true when the server is ready
  ensureServer(langId) {
    const entry = this._servers[langId]
    if (entry?.ready) return Promise.resolve(true)
    if (entry?.startPromise) return entry.startPromise

    const cfg = SERVER_CONFIGS[langId]
    if (!cfg) return Promise.resolve(false)

    const newEntry = {
      process: null,
      buffer: '',
      reqId: 1,
      pending: new Map(),
      ready: false,
      startPromise: null,
    }
    this._servers[langId] = newEntry

    newEntry.startPromise = this._startServer(langId, newEntry, cfg)
      .then(ok => { newEntry.startPromise = null; return ok })
      .catch(() => { delete this._servers[langId]; return false })

    return newEntry.startPromise
  }

  async _startServer(langId, entry, cfg) {
    const proc = spawn(cfg.command, cfg.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
    })

    entry.process = proc
    proc.stdout.on('data', d => this._handleData(langId, entry, d))
    proc.stderr.on('data', d => process.stderr.write(`[lsp:${langId}] ${d}`))
    proc.on('close', () => { delete this._servers[langId] })

    const result = await this._request(entry, 'initialize', {
      processId: process.pid,
      rootUri: null,
      capabilities: {
        textDocument: {
          completion: { completionItem: { snippetSupport: false } },
          publishDiagnostics: {},
          hover: {},
        },
      },
    })

    if (!result) throw new Error('initialize failed')
    this._notify(entry, 'initialized', {})
    entry.ready = true
    console.log(`[lsp:${langId}] ready`)
    return true
  }

  _handleData(langId, entry, chunk) {
    entry.buffer += chunk.toString()
    while (true) {
      const sep = entry.buffer.indexOf('\r\n\r\n')
      if (sep === -1) break
      const header = entry.buffer.slice(0, sep)
      const m = header.match(/Content-Length: (\d+)/i)
      if (!m) { entry.buffer = entry.buffer.slice(sep + 4); continue }
      const len = parseInt(m[1])
      const start = sep + 4
      if (entry.buffer.length < start + len) break
      const body = entry.buffer.slice(start, start + len)
      entry.buffer = entry.buffer.slice(start + len)
      try { this._dispatch(langId, entry, JSON.parse(body)) } catch {}
    }
  }

  _dispatch(langId, entry, msg) {
    if (msg.id != null && entry.pending.has(msg.id)) {
      const { resolve } = entry.pending.get(msg.id)
      entry.pending.delete(msg.id)
      resolve(msg.result ?? null)
    } else if (msg.method && this._webContents && !this._webContents.isDestroyed()) {
      this._webContents.send('lsp:notification', { langId, method: msg.method, params: msg.params })
    }
  }

  _request(entry, method, params) {
    return new Promise(resolve => {
      const id = entry.reqId++
      entry.pending.set(id, { resolve })
      this._write(entry, { jsonrpc: '2.0', id, method, params })
      setTimeout(() => {
        if (entry.pending.has(id)) { entry.pending.delete(id); resolve(null) }
      }, 8000)
    })
  }

  _notify(entry, method, params) {
    this._write(entry, { jsonrpc: '2.0', method, params })
  }

  _write(entry, msg) {
    const body = JSON.stringify(msg)
    entry.process.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
  }

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

module.exports = new LspManager()
