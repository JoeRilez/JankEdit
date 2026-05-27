import React, { useRef, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { jankTheme, monacoTheme } from '../theme'
import { lspClient } from '../lsp/lspClient'
import turtleIcon from '../assets/icon.png'

const LANG_MAP = {
  c: 'c', h: 'cpp', cpp: 'cpp', hpp: 'cpp', cc: 'cpp',
  java: 'java', py: 'python', kt: 'kotlin', kts: 'kotlin',
  js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  json: 'json', md: 'markdown', html: 'html', css: 'css', txt: 'plaintext',
}

function getLanguage(filePath) {
  const ext = filePath?.split('.').pop()?.toLowerCase()
  return LANG_MAP[ext] ?? 'plaintext'
}

// Create or fetch the Monaco model for a file path, then switch to it.
// Calling this is idempotent — existing models (with unsaved edits) are reused.
function switchModel(editor, monaco, filePath, initialContent) {
  const uri   = monaco.Uri.file(filePath)
  let   model = monaco.editor.getModel(uri)
  if (!model) {
    model = monaco.editor.createModel(initialContent ?? '', getLanguage(filePath), uri)
  }
  if (editor.getModel() !== model) editor.setModel(model)
}

export default function EditorPane({ file, content, onChange, settings, navTarget }) {
  const editorRef   = useRef(null)
  const monacoRef   = useRef(null)
  // Keep onChange stable in a ref so the mount-time listener never goes stale
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  // ── Mount: wire up the single change listener and load the first file ──────
  const handleMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    monaco.editor.defineTheme('jankedit', monacoTheme)
    monaco.editor.setTheme('jankedit')
    lspClient.init(monaco)

    // One global listener — always routes through the current onChange ref
    editor.onDidChangeModelContent(() => {
      onChangeRef.current?.(editor.getValue())
    })

    // If a file is already selected when the editor first mounts, load it now
    if (file?.path) {
      switchModel(editor, monaco, file.path, content)
      lspClient.openDocument(file.path, content ?? '')
    }
  }

  // ── Switch Monaco model whenever the active file path changes ────────────
  // This preserves cursor position, scroll, undo history — no full re-render
  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco || !file?.path) return
    switchModel(editor, monaco, file.path, content)
    // Send the model's actual content to LSP (may have unsaved edits)
    lspClient.openDocument(file.path, editor.getValue())
  }, [file?.path]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Apply settings live ───────────────────────────────────────────────────
  useEffect(() => {
    if (!editorRef.current || !settings) return
    editorRef.current.updateOptions({
      fontSize:    settings.fontSize,
      tabSize:     settings.tabSize,
      wordWrap:    settings.wordWrap ? 'on' : 'off',
      minimap:     { enabled: settings.minimap },
      lineNumbers: settings.lineNumbers ? 'on' : 'off',
    })
  }, [settings])

  // ── Navigate to a diagnostics location ───────────────────────────────────
  useEffect(() => {
    if (!navTarget || !editorRef.current) return
    const timer = setTimeout(() => {
      const ed = editorRef.current
      if (!ed) return
      ed.setPosition({ lineNumber: navTarget.line, column: navTarget.column })
      ed.revealLineInCenter(navTarget.line)
      ed.focus()
    }, 50)
    return () => clearTimeout(timer)
  }, [navTarget])

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!file) {
    return (
      <div style={{
        flex: 1, background: jankTheme.bgEditor,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 12,
      }}>
        <img src={turtleIcon} alt="JankEdit"
          style={{ width: 64, height: 64, imageRendering: 'pixelated', opacity: 0.25 }} />
        <span style={{ color: jankTheme.textMuted, fontSize: 8, lineHeight: 2, textAlign: 'center' }}>
          Open a file to{'\n'}start editing
        </span>
        <span style={{ color: jankTheme.textMuted, fontSize: 6, opacity: 0.6 }}>
          Ctrl+P to search files
        </span>
      </div>
    )
  }

  // No `value`, `language`, or `onChange` props — models are managed above.
  // `keepCurrentModel` prevents @monaco-editor/react from disposing models on re-render.
  return (
    <Editor
      height="100%"
      keepCurrentModel
      onMount={handleMount}
      options={{
        fontSize:    settings?.fontSize ?? 14,
        tabSize:     settings?.tabSize  ?? 4,
        wordWrap:    settings?.wordWrap ? 'on' : 'off',
        minimap:     { enabled: settings?.minimap ?? true },
        lineNumbers: (settings?.lineNumbers ?? true) ? 'on' : 'off',
        fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
        fontLigatures: true,
        scrollBeyondLastLine: false,
        renderWhitespace: 'selection',
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        smoothScrolling: true,
        padding: { top: 12 },
      }}
    />
  )
}
