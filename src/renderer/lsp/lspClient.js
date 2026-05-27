// Renderer-side LSP client — bridges Monaco providers to the main-process LspManager

// ── Language map ──────────────────────────────────────────────────────────────
const EXT_TO_LANG = {
  py: 'python',
  c: 'c', h: 'cpp', cpp: 'cpp', hpp: 'cpp', cc: 'cpp', cxx: 'cpp',
  java: 'java',
  kt: 'kotlin', kts: 'kotlin',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
}

// Languages that have a configured LSP server
const SUPPORTED = ['python', 'c', 'cpp', 'java', 'kotlin', 'javascript', 'typescript']

// LSP completion kind → Monaco completion kind (LSP is 1-based, Monaco is 0-based)
const LSP_KIND = {
  2:0, 3:1, 4:2, 5:3, 6:4, 7:5, 8:7, 9:8, 10:9, 11:12,
  12:13, 13:15, 14:17, 15:27, 16:19, 17:20, 18:21, 19:23,
  20:16, 21:4, 22:6, 23:10, 24:11, 25:24,
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pathToUri(filePath) {
  return 'file:///' + filePath.replace(/\\/g, '/').replace(/^\//, '')
}

function getExt(filePath) {
  return filePath.split('.').pop()?.toLowerCase() ?? ''
}

function lspRangeToMonaco(r) {
  return {
    startLineNumber: (r.start.line        ?? 0) + 1,
    startColumn:     (r.start.character   ?? 0) + 1,
    endLineNumber:   (r.end.line          ?? 0) + 1,
    endColumn:       (r.end.character     ?? 0) + 1,
  }
}

function markdownVal(v) {
  if (!v) return ''
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.map(markdownVal).join('\n\n')
  return v.value ?? ''
}

// ── LspClient ─────────────────────────────────────────────────────────────────

class LspClient {
  constructor() {
    this._monaco      = null
    this._openDocs    = new Map()   // uri -> { version, langId }
    this._disposables = []
    this._initialized = false
    this._diagListeners = []
  }

  // Subscribe to diagnostic updates. Returns an unsubscribe fn.
  onDiagnosticsChange(cb) {
    this._diagListeners.push(cb)
    return () => { this._diagListeners = this._diagListeners.filter(l => l !== cb) }
  }

  // Tell the server manager which workspace root to use.
  setRoot(folderPath) {
    window.api.lspSetRoot(folderPath)
  }

  // Called once when Monaco mounts.
  init(monacoInstance) {
    if (this._initialized) return
    this._initialized = true
    this._monaco = monacoInstance

    // Forward LSP notifications from main → Monaco
    window.api.onLspNotification(({ method, params }) => {
      if (method === 'textDocument/publishDiagnostics') this._applyDiagnostics(params)
    })

    this._registerProviders(monacoInstance)
  }

  // ── Provider registration ─────────────────────────────────────────────────

  _registerProviders(m) {
    for (const lang of SUPPORTED) {
      // ── Completion ──────────────────────────────────────────────────────────
      this._disposables.push(
        m.languages.registerCompletionItemProvider(lang, {
          triggerCharacters: ['.', '(', ':', '<', '"', "'", '/', '@'],
          provideCompletionItems: async (model, position) => {
            const doc = this._openDocs.get(model.uri.toString())
            if (!doc) return { suggestions: [] }

            const result = await window.api.lspRequest(doc.langId, 'textDocument/completion', {
              textDocument: { uri: model.uri.toString() },
              position: { line: position.lineNumber - 1, character: position.column - 1 },
              context: { triggerKind: 1 },
            })

            if (!result) return { suggestions: [] }
            const items = Array.isArray(result) ? result : (result.items ?? [])

            const word = model.getWordUntilPosition(position)
            const defaultRange = {
              startLineNumber: position.lineNumber,
              startColumn:     word.startColumn,
              endLineNumber:   position.lineNumber,
              endColumn:       position.column,
            }

            return {
              incomplete: result.isIncomplete ?? false,
              suggestions: items.slice(0, 200).map(item => {
                // Prefer textEdit range; fall back to word range
                const edit  = item.textEdit
                const range = edit?.range
                  ? lspRangeToMonaco(edit.range)
                  : edit?.insert
                  ? lspRangeToMonaco(edit.insert)
                  : defaultRange

                return {
                  label:       item.label,
                  kind:        LSP_KIND[item.kind] ?? 0,
                  detail:      item.detail ?? '',
                  documentation: { value: markdownVal(item.documentation) },
                  insertText:  edit?.newText ?? item.insertText ?? item.label,
                  insertTextRules: item.insertTextFormat === 2 ? 4 : 0,  // 4 = InsertAsSnippet
                  range,
                  sortText:    item.sortText,
                  filterText:  item.filterText ?? item.label,
                  additionalTextEdits: item.additionalTextEdits?.map(e => ({
                    range: lspRangeToMonaco(e.range),
                    text:  e.newText,
                  })),
                  command: item.command ? {
                    id:        item.command.command,
                    arguments: item.command.arguments,
                  } : undefined,
                }
              }),
            }
          },
        })
      )

      // ── Hover ───────────────────────────────────────────────────────────────
      this._disposables.push(
        m.languages.registerHoverProvider(lang, {
          provideHover: async (model, position) => {
            const doc = this._openDocs.get(model.uri.toString())
            if (!doc) return null

            const result = await window.api.lspRequest(doc.langId, 'textDocument/hover', {
              textDocument: { uri: model.uri.toString() },
              position: { line: position.lineNumber - 1, character: position.column - 1 },
            })

            if (!result?.contents) return null
            const text = markdownVal(result.contents)
            if (!text) return null
            return {
              contents: [{ value: text }],
              range:    result.range ? lspRangeToMonaco(result.range) : undefined,
            }
          },
        })
      )

      // ── Signature Help ──────────────────────────────────────────────────────
      this._disposables.push(
        m.languages.registerSignatureHelpProvider(lang, {
          signatureHelpTriggerCharacters:     ['(', ','],
          signatureHelpRetriggerCharacters:   [',', ')'],
          provideSignatureHelp: async (model, position) => {
            const doc = this._openDocs.get(model.uri.toString())
            if (!doc) return null

            const result = await window.api.lspRequest(doc.langId, 'textDocument/signatureHelp', {
              textDocument: { uri: model.uri.toString() },
              position: { line: position.lineNumber - 1, character: position.column - 1 },
            })

            if (!result?.signatures?.length) return null
            return {
              dispose: () => {},
              value: {
                activeSignature: result.activeSignature ?? 0,
                activeParameter: result.activeParameter ?? 0,
                signatures: result.signatures.map(sig => ({
                  label:         sig.label,
                  documentation: { value: markdownVal(sig.documentation) },
                  parameters: (sig.parameters ?? []).map(p => ({
                    label:         p.label,
                    documentation: { value: markdownVal(p.documentation) },
                  })),
                })),
              },
            }
          },
        })
      )

      // ── Go to Definition ────────────────────────────────────────────────────
      this._disposables.push(
        m.languages.registerDefinitionProvider(lang, {
          provideDefinition: async (model, position) => {
            const doc = this._openDocs.get(model.uri.toString())
            if (!doc) return []

            const result = await window.api.lspRequest(doc.langId, 'textDocument/definition', {
              textDocument: { uri: model.uri.toString() },
              position: { line: position.lineNumber - 1, character: position.column - 1 },
            })

            if (!result) return []
            const locs = Array.isArray(result) ? result : [result]
            return locs.filter(l => l?.uri && l?.range).map(l => ({
              uri:   m.Uri.parse(l.uri),
              range: lspRangeToMonaco(l.range),
            }))
          },
        })
      )

      // ── Find All References ─────────────────────────────────────────────────
      this._disposables.push(
        m.languages.registerReferenceProvider(lang, {
          provideReferences: async (model, position, ctx) => {
            const doc = this._openDocs.get(model.uri.toString())
            if (!doc) return []

            const result = await window.api.lspRequest(doc.langId, 'textDocument/references', {
              textDocument: { uri: model.uri.toString() },
              position: { line: position.lineNumber - 1, character: position.column - 1 },
              context: { includeDeclaration: ctx.includeDeclaration },
            })

            if (!result) return []
            return result.filter(l => l?.uri && l?.range).map(l => ({
              uri:   m.Uri.parse(l.uri),
              range: lspRangeToMonaco(l.range),
            }))
          },
        })
      )

      // ── Document Formatting ─────────────────────────────────────────────────
      this._disposables.push(
        m.languages.registerDocumentFormattingEditProvider(lang, {
          provideDocumentFormattingEdits: async (model) => {
            const doc = this._openDocs.get(model.uri.toString())
            if (!doc) return []

            const tabSize = model.getOptions().tabSize
            const result  = await window.api.lspRequest(doc.langId, 'textDocument/formatting', {
              textDocument: { uri: model.uri.toString() },
              options: { tabSize, insertSpaces: true, trimTrailingWhitespace: true },
            })

            if (!result) return []
            return result.map(edit => ({
              range: lspRangeToMonaco(edit.range),
              text:  edit.newText,
            }))
          },
        })
      )
    }
  }

  // ── Diagnostics ───────────────────────────────────────────────────────────

  _applyDiagnostics({ uri, diagnostics }) {
    if (!this._monaco) return

    const model = this._monaco.editor.getModels().find(m => m.uri.toString() === uri)
    if (!model) return

    const sev = this._monaco.MarkerSeverity
    const SEV = { 1: sev.Error, 2: sev.Warning, 3: sev.Info, 4: sev.Hint }

    const markers = (diagnostics ?? []).map(d => ({
      severity:        SEV[d.severity] ?? sev.Hint,
      message:         d.message,
      source:          d.source ?? 'lsp',
      code:            d.code != null ? String(d.code) : undefined,
      startLineNumber: (d.range.start.line       ?? 0) + 1,
      startColumn:     (d.range.start.character  ?? 0) + 1,
      endLineNumber:   (d.range.end.line         ?? 0) + 1,
      endColumn:       (d.range.end.character    ?? 0) + 1,
    }))

    this._monaco.editor.setModelMarkers(model, 'lsp', markers)
    this._diagListeners.forEach(cb => cb(uri, diagnostics ?? []))
  }

  // ── Document sync ─────────────────────────────────────────────────────────

  openDocument(filePath, content) {
    const langId = EXT_TO_LANG[getExt(filePath)]
    if (!langId) return

    const uri = pathToUri(filePath)
    if (this._openDocs.has(uri)) return   // already tracked; LSP server has the content

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
      textDocument:  { uri, version: doc.version },
      contentChanges: [{ text: content }],
    })
  }

  saveDocument(filePath) {
    const uri = pathToUri(filePath)
    const doc = this._openDocs.get(uri)
    if (!doc) return
    window.api.lspNotify(doc.langId, 'textDocument/didSave', { textDocument: { uri } })
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
