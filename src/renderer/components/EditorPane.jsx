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

export default function EditorPane({ file, content, onChange, settings, navTarget }) {
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
        <img src={turtleIcon} alt="JankEdit" style={{ width: 64, height: 64, imageRendering: 'pixelated', opacity: 0.25 }} />
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
