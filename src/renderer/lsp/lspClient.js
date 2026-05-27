// Renderer-side LSP client — bridges Monaco to the main-process LspManager via IPC

const EXT_TO_LANG = {
  py: 'python', c: 'c', h: 'cpp', cpp: 'cpp', hpp: 'cpp', cc: 'cpp',
  java: 'java', kt: 'kotlin', kts: 'kotlin',
}

function pathToUri(filePath) {
  return 'file:///' + filePath.replace(/\\/g, '/').replace(/^\//, '')
}

function getExt(filePath) {
  return filePath.split('.').pop()?.toLowerCase() ?? ''
}

class LspClient {
  constructor() {
    this._monaco = null
    this._openDocs = new Map()   // uri -> { version, langId }
    this._disposables = []
    this._initialized = false
    this._diagListeners = []
  }

  // Subscribe to diagnostic updates. Returns an unsubscribe fn.
  onDiagnosticsChange(cb) {
    this._diagListeners.push(cb)
    return () => { this._diagListeners = this._diagListeners.filter(l => l !== cb) }
  }

  init(monacoInstance) {
    if (this._initialized) return
    this._initialized = true
    this._monaco = monacoInstance

    window.api.onLspNotification(({ method, params }) => {
      if (method === 'textDocument/publishDiagnostics') {
        this._applyDiagnostics(params)
      }
    })

    const supported = ['python', 'c', 'cpp', 'java', 'kotlin']

    supported.forEach(lang => {
      this._disposables.push(
        monacoInstance.languages.registerCompletionItemProvider(lang, {
          triggerCharacters: ['.', '(', ':'],
          provideCompletionItems: async (model, position) => {
            const uri = model.uri.toString()
            const doc = this._openDocs.get(uri)
            if (!doc) return { suggestions: [] }

            const result = await window.api.lspRequest(doc.langId, 'textDocument/completion', {
              textDocument: { uri },
              position: { line: position.lineNumber - 1, character: position.column - 1 },
              context: { triggerKind: 1 },
            })

            if (!result) return { suggestions: [] }
            const items = Array.isArray(result) ? result : (result.items ?? [])

            return {
              suggestions: items.slice(0, 150).map(item => ({
                label: item.label,
                kind: item.kind ?? 1,
                detail: item.detail ?? '',
                documentation: typeof item.documentation === 'string'
                  ? item.documentation
                  : (item.documentation?.value ?? ''),
                insertText: item.insertText ?? item.label,
                range: {
                  startLineNumber: position.lineNumber,
                  startColumn:     position.column,
                  endLineNumber:   position.lineNumber,
                  endColumn:       position.column,
                },
              })),
            }
          },
        })
      )

      this._disposables.push(
        monacoInstance.languages.registerHoverProvider(lang, {
          provideHover: async (model, position) => {
            const uri = model.uri.toString()
            const doc = this._openDocs.get(uri)
            if (!doc) return null

            const result = await window.api.lspRequest(doc.langId, 'textDocument/hover', {
              textDocument: { uri },
              position: { line: position.lineNumber - 1, character: position.column - 1 },
            })

            if (!result?.contents) return null
            const raw = result.contents
            const contents = Array.isArray(raw) ? raw : [raw]
            return {
              contents: contents.map(c => ({
                value: typeof c === 'string' ? c : (c.value ?? ''),
              })),
            }
          },
        })
      )
    })
  }

  _applyDiagnostics({ uri, diagnostics }) {
    if (!this._monaco) return
    const model = this._monaco.editor.getModels().find(m => m.uri.toString() === uri)
    if (!model) return

    const sev = this._monaco.MarkerSeverity
    const markers = diagnostics.map(d => ({
      severity: ({ 1: sev.Error, 2: sev.Warning, 3: sev.Info })[d.severity] ?? sev.Hint,
      message: d.message,
      startLineNumber: (d.range.start.line  ?? 0) + 1,
      startColumn:     (d.range.start.character ?? 0) + 1,
      endLineNumber:   (d.range.end.line    ?? 0) + 1,
      endColumn:       (d.range.end.character ?? 0) + 1,
      source: d.source ?? 'lsp',
    }))

    this._monaco.editor.setModelMarkers(model, 'lsp', markers)
    this._diagListeners.forEach(cb => cb(uri, diagnostics))
  }

  openDocument(filePath, content) {
    const langId = EXT_TO_LANG[getExt(filePath)]
    if (!langId) return

    const uri = pathToUri(filePath)
    if (this._openDocs.has(uri)) return

    this._openDocs.set(uri, { version: 1, langId })
    window.api.lspNotify(langId, 'textDocument/didOpen', {
      textDocument: { uri, languageId: langId, version: 1, text: content ?? '' },
    })
  }

  changeDocument(filePath, content) {
    const uri = pathToUri(filePath)
    const doc = this._openDocs.get(uri)
    if (!doc) return

    doc.version++
    window.api.lspNotify(doc.langId, 'textDocument/didChange', {
      textDocument: { uri, version: doc.version },
      contentChanges: [{ text: content }],
    })
  }

  closeDocument(filePath) {
    const uri = pathToUri(filePath)
    const doc = this._openDocs.get(uri)
    if (!doc) return

    window.api.lspNotify(doc.langId, 'textDocument/didClose', { textDocument: { uri } })
    this._openDocs.delete(uri)

    if (this._monaco) {
      const model = this._monaco.editor.getModels().find(m => m.uri.toString() === uri)
      if (model) this._monaco.editor.setModelMarkers(model, 'lsp', [])
    }
  }
}

export const lspClient = new LspClient()
