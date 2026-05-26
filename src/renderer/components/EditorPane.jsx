import React, { useRef, useEffect } from 'react'
import Editor from '@monaco-editor/react'
import { jankTheme, monacoTheme } from '../theme'
import { lspClient } from '../lsp/lspClient'

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

export default function EditorPane({ file, content, onChange, settings }) {
  const editorRef = useRef(null)

  const handleMount = (editor, monaco) => {
    editorRef.current = editor
    monaco.editor.defineTheme('jankedit', monacoTheme)
    monaco.editor.setTheme('jankedit')
    lspClient.init(monaco)
  }

  // Apply settings live whenever they change
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

  useEffect(() => {
    if (file?.path && content !== undefined) {
      lspClient.openDocument(file.path, content)
    }
  }, [file?.path])

  if (!file) {
    return (
      <div style={{
        flex: 1,
        background: jankTheme.bgEditor,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 12,
      }}>
        <span style={{ fontSize: 24, fontWeight: 900, color: jankTheme.border }}>JE</span>
        <span style={{ color: jankTheme.textMuted, fontSize: 8, lineHeight: 2, textAlign: 'center' }}>Open a file to{'\n'}start editing</span>
      </div>
    )
  }

  return (
    <Editor
      height="100%"
      language={getLanguage(file.path)}
      value={content}
      onChange={onChange}
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
