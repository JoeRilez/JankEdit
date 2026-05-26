import React, { useState, useEffect, useCallback } from 'react'
import TitleBar from './components/TitleBar'
import FileTree from './components/FileTree'
import EditorPane from './components/EditorPane'
import { jankTheme } from './theme'
import { lspClient } from './lsp/lspClient'

export default function App() {
  const [openFiles, setOpenFiles] = useState([])
  const [activeIdx, setActiveIdx] = useState(0)

  const activeFile = openFiles[activeIdx] ?? null

  const openFile = useCallback(async (entry) => {
    const existing = openFiles.findIndex(f => f.path === entry.path)
    if (existing !== -1) { setActiveIdx(existing); return }
    const content = await window.api.readFile(entry.path)
    setOpenFiles(prev => {
      setActiveIdx(prev.length)
      return [...prev, { path: entry.path, name: entry.name, content, dirty: false }]
    })
  }, [openFiles])

  const handleChange = useCallback((value) => {
    setOpenFiles(prev => {
      const file = prev[activeIdx]
      if (file) lspClient.changeDocument(file.path, value)
      return prev.map((f, i) => i === activeIdx ? { ...f, content: value, dirty: true } : f)
    })
  }, [activeIdx])

  const saveFile = useCallback(async () => {
    if (!activeFile?.dirty) return
    await window.api.writeFile(activeFile.path, activeFile.content)
    setOpenFiles(prev => prev.map((f, i) => i === activeIdx ? { ...f, dirty: false } : f))
  }, [activeFile, activeIdx])

  const closeTab = useCallback((idx, e) => {
    e.stopPropagation()
    setOpenFiles(prev => {
      lspClient.closeDocument(prev[idx].path)
      return prev.filter((_, i) => i !== idx)
    })
    setActiveIdx(prev => Math.max(0, prev >= idx ? prev - 1 : prev))
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveFile() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saveFile])

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: jankTheme.bg }}>
      <TitleBar title={activeFile?.name} />

      {openFiles.length > 0 && (
        <div style={{
          display: 'flex',
          background: jankTheme.bgSidebar,
          borderBottom: `1px solid ${jankTheme.border}`,
          overflowX: 'auto',
          flexShrink: 0,
        }}>
          {openFiles.map((f, i) => (
            <div
              key={f.path}
              onClick={() => setActiveIdx(i)}
              style={{
                padding: '8px 14px',
                cursor: 'pointer',
                fontSize: 7,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                whiteSpace: 'nowrap',
                borderRight: `1px solid ${jankTheme.border}`,
                borderBottom: i === activeIdx ? `2px solid ${jankTheme.accent}` : '2px solid transparent',
                background: i === activeIdx ? jankTheme.bgEditor : 'transparent',
                color: i === activeIdx ? jankTheme.accent : jankTheme.text,
                fontWeight: i === activeIdx ? 700 : 400,
              }}
            >
              {f.name}{f.dirty ? ' *' : ''}
              <span
                onClick={(e) => closeTab(i, e)}
                style={{
                  color: jankTheme.textMuted,
                  fontSize: 7,
                  lineHeight: 1,
                  padding: '0 2px',
                  borderRadius: 3,
                }}
                onMouseEnter={e => e.currentTarget.style.color = jankTheme.accent}
                onMouseLeave={e => e.currentTarget.style.color = jankTheme.textMuted}
              >
                x
              </span>
            </div>
          ))}
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <FileTree onFileOpen={openFile} />
        <EditorPane file={activeFile} content={activeFile?.content} onChange={handleChange} />
      </div>

      <div style={{
        height: 30,
        background: jankTheme.accent,
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: 20,
        flexShrink: 0,
      }}>
        <span style={{ color: 'white', fontSize: 7, fontWeight: 700, letterSpacing: '0.05em' }}>JankEdit v0.1.0</span>
        {activeFile && (
          <span style={{ color: 'rgba(255,255,255,0.75)', fontSize: 6 }}>{activeFile.path}</span>
        )}
      </div>
    </div>
  )
}
