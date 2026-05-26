import React, { useState, useEffect, useCallback } from 'react'
import TitleBar from './components/TitleBar'
import FileTree from './components/FileTree'
import EditorPane from './components/EditorPane'
import TerminalPanel from './components/TerminalPanel'
import NewProjectModal from './components/NewProjectModal'
import { jankTheme } from './theme'
import { lspClient } from './lsp/lspClient'

export default function App() {
  const [openFiles, setOpenFiles]   = useState([])
  const [activeIdx, setActiveIdx]   = useState(0)
  const [termVisible,    setTermVisible]    = useState(false)
  const [termMounted,    setTermMounted]    = useState(false)
  const [openFolder,     setOpenFolder]     = useState(null)
  const [showNewProject, setShowNewProject] = useState(false)

  const toggleTerm = useCallback(() => {
    setTermVisible(v => {
      if (!v) setTermMounted(true)
      return !v
    })
  }, [])
  const TERM_HEIGHT = 240

  const activeFile = openFiles[activeIdx] ?? null

  const RUN_COMMANDS = {
    py:   (f, d, n) => `cd "${d}"; python "${n}"\r\n`,
    c:    (f, d, n) => `cd "${d}"; gcc "${n}" -o _out && ./_out\r\n`,
    cpp:  (f, d, n) => `cd "${d}"; g++ "${n}" -o _out && ./_out\r\n`,
    java: (f, d, n) => { const cls = n.replace('.java',''); return `cd "${d}"; javac "${n}" && java ${cls}\r\n` },
    kt:   (f, d, n) => { const j = n.replace('.kt',''); return `cd "${d}"; kotlinc "${n}" -include-runtime -d ${j}.jar && java -jar ${j}.jar\r\n` },
  }

  const runActiveFile = useCallback(() => {
    if (!activeFile) return
    const ext = activeFile.name.split('.').pop().toLowerCase()
    const cmd = RUN_COMMANDS[ext]
    if (!cmd) return
    const dir = activeFile.path.replace(/[\\/][^\\/]+$/, '')
    setTermMounted(true)
    setTermVisible(true)
    setTimeout(() => window.api.terminalWrite(cmd(activeFile.path, dir, activeFile.name)), 300)
  }, [activeFile])

  const canRun = activeFile && ['py','c','cpp','java','kt'].includes(activeFile.name.split('.').pop().toLowerCase())

  const handleProjectCreated = useCallback(({ projectPath, mainFile, mainFileName }) => {
    setShowNewProject(false)
    setOpenFolder(projectPath)
    if (mainFile && mainFileName) {
      openFile({ path: mainFile, name: mainFileName })
    }
  }, [openFile])

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
      if ((e.ctrlKey || e.metaKey) && e.key === '`') { e.preventDefault(); toggleTerm() }
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') { e.preventDefault(); runActiveFile() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saveFile])

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: jankTheme.bg }}>
      <TitleBar
        title={activeFile?.name}
        onNewProject={() => setShowNewProject(true)}
        onRun={runActiveFile}
        canRun={canRun}
      />
      {showNewProject && (
        <NewProjectModal
          onClose={() => setShowNewProject(false)}
          onCreated={handleProjectCreated}
        />
      )}

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
        <FileTree onFileOpen={openFile} onFolderOpen={setOpenFolder} externalFolder={openFolder} />
        <EditorPane file={activeFile} content={activeFile?.content} onChange={handleChange} />
      </div>

      {termMounted && (
        <TerminalPanel
          visible={termVisible}
          height={TERM_HEIGHT}
          workingDir={openFolder}
          onToggle={toggleTerm}
        />
      )}

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
        <button
          onClick={toggleTerm}
          title="Toggle Terminal (Ctrl+`)"
          style={{
            marginLeft: 'auto',
            background: termVisible ? 'rgba(0,0,0,0.25)' : 'transparent',
            border: '1px solid rgba(255,255,255,0.3)',
            color: 'white',
            padding: '1px 8px',
            cursor: 'pointer',
            fontSize: 6,
            fontFamily: "'Press Start 2P', monospace",
            borderRadius: 3,
          }}
        >
          &gt;_
        </button>
      </div>
    </div>
  )
}
