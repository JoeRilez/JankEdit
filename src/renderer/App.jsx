import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import TitleBar from './components/TitleBar'
import FileTree from './components/FileTree'
import EditorPane from './components/EditorPane'
import TerminalPanel from './components/TerminalPanel'
import GitPanel from './components/GitPanel'
import DiagnosticsPanel from './components/DiagnosticsPanel'
import SimulatorPanel from './components/SimulatorPanel'
import PackagePanel from './components/PackagePanel'
import NewProjectModal from './components/NewProjectModal'
import SettingsModal from './components/SettingsModal'
import QuickOpen from './components/QuickOpen'
import OutputPanel from './components/OutputPanel'
import { jankTheme } from './theme'
import { lspClient } from './lsp/lspClient'
import { loadSettings } from './settings'

export default function App() {
  // ── State ────────────────────────────────────────────────────────────────────
  const [openFiles,  setOpenFiles]  = useState([])
  const [activeIdx,  setActiveIdx]  = useState(0)
  const [termVisible, setTermVisible] = useState(false)
  const [termMounted, setTermMounted] = useState(false)
  const [gitVisible,  setGitVisible]  = useState(false)
  const [gitMounted,  setGitMounted]  = useState(false)
  const [gitStatuses, setGitStatuses] = useState({})
  const [gitBranch,   setGitBranch]   = useState('')
  const [isGitRepo,   setIsGitRepo]   = useState(false)
  const [openFolder,  setOpenFolder]  = useState(null)
  const [showNewProject, setShowNewProject] = useState(false)
  const [showSettings,   setShowSettings]   = useState(false)
  const [settings,       setSettings]       = useState(loadSettings)
  const [splitActive,    setSplitActive]    = useState(false)
  const [rightFilePath,  setRightFilePath]  = useState(null)
  const [focusedPane,    setFocusedPane]    = useState('left')
  const [diagVisible,    setDiagVisible]    = useState(false)
  const [diagMounted,    setDiagMounted]    = useState(false)
  const [allDiagnostics, setAllDiagnostics] = useState(new Map())
  const [navTarget,      setNavTarget]      = useState(null)
  const [simVisible,     setSimVisible]     = useState(false)
  const [simMounted,     setSimMounted]     = useState(false)
  const [pkgVisible,     setPkgVisible]     = useState(false)
  const [pkgMounted,     setPkgMounted]     = useState(false)
  const [pkgHeight,      setPkgHeight]      = useState(280)
  const [quickOpen,      setQuickOpen]      = useState(false)
  const [outVisible,     setOutVisible]     = useState(false)
  const [outMounted,     setOutMounted]     = useState(false)
  const [outHeight,      setOutHeight]      = useState(220)
  const [runningFile,    setRunningFile]    = useState(null)

  // ── Derived ──────────────────────────────────────────────────────────────────
  const activeFile = openFiles[activeIdx] ?? null
  const rightFile  = useMemo(
    () => rightFilePath ? (openFiles.find(f => f.path === rightFilePath) ?? null) : null,
    [openFiles, rightFilePath]
  )

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const openFilesRef   = useRef(openFiles)
  const autoSaveTimer  = useRef(null)
  useEffect(() => { openFilesRef.current = openFiles }, [openFiles])

  const [simHeight,    setSimHeight]    = useState(260)
  const [termHeight,   setTermHeight]   = useState(240)
  const [gitHeight,    setGitHeight]    = useState(280)
  const [diagHeight,   setDiagHeight]   = useState(200)
  const [sidebarWidth, setSidebarWidth] = useState(220)

  // ── Panel toggles ─────────────────────────────────────────────────────────────
  const toggleTerm = useCallback(() => {
    setTermVisible(v => { if (!v) setTermMounted(true); return !v })
  }, [])

  const toggleGit = useCallback(() => {
    setGitVisible(v => { if (!v) setGitMounted(true); return !v })
  }, [])

  const toggleDiag = useCallback(() => {
    setDiagVisible(v => { if (!v) setDiagMounted(true); return !v })
  }, [])

  const toggleSim = useCallback(() => {
    setSimVisible(v => { if (!v) setSimMounted(true); return !v })
  }, [])

  const togglePkg = useCallback(() => {
    setPkgVisible(v => { if (!v) setPkgMounted(true); return !v })
  }, [])

  // ── Run commands ─────────────────────────────────────────────────────────────
  const RUN_CONFIGS = {
    py:  (f, d)    => ({ cmd: 'py',          args: [f],                                        cwd: d }),
    js:  (f, d)    => ({ cmd: 'node',         args: [f],                                        cwd: d }),
    ts:  (f, d)    => ({ cmd: 'npx',          args: ['ts-node', f],                             cwd: d }),
    c:   (f, d, n) => ({ cmd: 'powershell',   args: ['-NoProfile', '-Command', `gcc "${n}" -o _jout.exe; if ($?) { & './_jout.exe' }`], cwd: d }),
    cpp: (f, d, n) => ({ cmd: 'powershell',   args: ['-NoProfile', '-Command', `g++ "${n}" -o _jout.exe; if ($?) { & './_jout.exe' }`], cwd: d }),
    java:(f, d, n) => ({ cmd: 'powershell',   args: ['-NoProfile', '-Command', `javac "${n}"; if ($?) { java '${n.replace('.java','')}' }`], cwd: d }),
  }

  const runActiveFile = useCallback(() => {
    if (!activeFile) return
    const ext = activeFile.name.split('.').pop().toLowerCase()
    const cfg = RUN_CONFIGS[ext]
    if (!cfg) return
    const dir = activeFile.path.replace(/[\\/][^\\/]+$/, '')
    const config = cfg(activeFile.path, dir, activeFile.name)
    setOutMounted(true)
    setOutVisible(true)
    setRunningFile(activeFile.name)
    window.api.runStart(config)
  }, [activeFile])

  const canRun = activeFile && Object.keys(RUN_CONFIGS).includes(
    activeFile.name.split('.').pop().toLowerCase()
  )

  // ── Git status ────────────────────────────────────────────────────────────────
  const refreshGitStatus = useCallback(async () => {
    if (!openFolder) { setGitStatuses({}); setIsGitRepo(false); setGitBranch(''); return }
    const repoOk = await window.api.gitIsRepo(openFolder)
    setIsGitRepo(repoOk)
    if (!repoOk) { setGitStatuses({}); setGitBranch(''); return }

    const br = await window.api.gitBranch(openFolder)
    if (br.ok) setGitBranch(br.branch)

    const st = await window.api.gitStatus(openFolder)
    if (!st.ok) return
    const sep = openFolder.includes('\\') ? '\\' : '/'
    const map = {}
    st.files.forEach(f => {
      const abs  = openFolder + sep + f.file.replace(/\//g, sep)
      const code = f.xy[1] !== ' ' ? f.xy[1] : f.xy[0]
      map[abs] = code
    })
    setGitStatuses(map)
  }, [openFolder])

  useEffect(() => { refreshGitStatus() }, [openFolder, refreshGitStatus])

  // Tell LSP servers about the workspace root whenever the folder changes
  useEffect(() => { if (openFolder) lspClient.setRoot(openFolder) }, [openFolder])

  // ── Auto-save ─────────────────────────────────────────────────────────────────
  const scheduleAutoSave = useCallback(() => {
    if (!settings?.autoSave) return
    clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(async () => {
      const dirty = openFilesRef.current.filter(f => f.dirty)
      for (const file of dirty) await window.api.writeFile(file.path, file.content)
      if (dirty.length > 0) {
        setOpenFiles(prev => prev.map(f => f.dirty ? { ...f, dirty: false } : f))
        refreshGitStatus()
      }
    }, 1000)
  }, [settings?.autoSave, refreshGitStatus])

  // ── File operations ───────────────────────────────────────────────────────────
  const openFile = useCallback(async (entry) => {
    if (splitActive && focusedPane === 'right') {
      const exists = openFiles.some(f => f.path === entry.path)
      if (!exists) {
        const content = await window.api.readFile(entry.path)
        setOpenFiles(prev => [...prev, { path: entry.path, name: entry.name, content, dirty: false }])
      }
      setRightFilePath(entry.path)
      return
    }
    const existing = openFiles.findIndex(f => f.path === entry.path)
    if (existing !== -1) { setActiveIdx(existing); return }
    const content = await window.api.readFile(entry.path)
    setOpenFiles(prev => { setActiveIdx(prev.length); return [...prev, { path: entry.path, name: entry.name, content, dirty: false }] })
  }, [openFiles, splitActive, focusedPane])

  const handleProjectCreated = useCallback(({ projectPath, mainFile, mainFileName }) => {
    setShowNewProject(false)
    setOpenFolder(projectPath)
    if (mainFile && mainFileName) openFile({ path: mainFile, name: mainFileName })
  }, [openFile])

  const handleChange = useCallback((value) => {
    setOpenFiles(prev => {
      const file = prev[activeIdx]
      if (file) lspClient.changeDocument(file.path, value)
      return prev.map((f, i) => i === activeIdx ? { ...f, content: value, dirty: true } : f)
    })
    scheduleAutoSave()
  }, [activeIdx, scheduleAutoSave])

  const handleRightChange = useCallback((value) => {
    if (!rightFilePath) return
    setOpenFiles(prev => {
      const file = prev.find(f => f.path === rightFilePath)
      if (file) lspClient.changeDocument(file.path, value)
      return prev.map(f => f.path === rightFilePath ? { ...f, content: value, dirty: true } : f)
    })
    scheduleAutoSave()
  }, [rightFilePath, scheduleAutoSave])

  const saveFile = useCallback(async () => {
    if (!activeFile?.dirty) return
    await window.api.writeFile(activeFile.path, activeFile.content)
    lspClient.saveDocument(activeFile.path)
    setOpenFiles(prev => prev.map((f, i) => i === activeIdx ? { ...f, dirty: false } : f))
    refreshGitStatus()
  }, [activeFile, activeIdx, refreshGitStatus])

  const closeTab = useCallback((idx) => {
    setOpenFiles(prev => {
      const file = prev[idx]
      if (!file) return prev
      if (file.dirty && !window.confirm(`${file.name} has unsaved changes. Close anyway?`)) return prev
      lspClient.closeDocument(file.path)
      if (rightFilePath === file.path) setRightFilePath(null)
      return prev.filter((_, i) => i !== idx)
    })
    setActiveIdx(prev => Math.max(0, prev >= idx ? prev - 1 : prev))
  }, [rightFilePath])

  // ── Diagnostics ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return lspClient.onDiagnosticsChange((uri, diags) => {
      setAllDiagnostics(prev => {
        const next = new Map(prev)
        if (diags.length === 0) next.delete(uri)
        else next.set(uri, diags)
        return next
      })
    })
  }, [])

  const diagCounts = useMemo(() => {
    let errors = 0, warnings = 0
    for (const diags of allDiagnostics.values()) {
      diags.forEach(d => { if (d.severity === 1) errors++; else if (d.severity === 2) warnings++ })
    }
    return { errors, warnings }
  }, [allDiagnostics])

  const navigateToDiag = useCallback(async (uri, line, column) => {
    const filePath = uri.replace(/^file:\/\/\//, '').replace(/\//g, '\\')
    const name     = filePath.split(/[\\/]/).pop()
    const existing = openFiles.findIndex(f => f.path === filePath)
    if (existing !== -1) {
      setActiveIdx(existing)
    } else {
      const content = await window.api.readFile(filePath)
      setOpenFiles(prev => { setActiveIdx(prev.length); return [...prev, { path: filePath, name, content, dirty: false }] })
    }
    setFocusedPane('left')
    setNavTarget({ line, column, ts: Date.now() })
  }, [openFiles])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  const activeIdxRef = useRef(activeIdx)
  useEffect(() => { activeIdxRef.current = activeIdx }, [activeIdx])
  // openFilesRef is already defined above (used for auto-save too)

  useEffect(() => {
    const onKey = (e) => {
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.key === 's') { e.preventDefault(); saveFile() }
      if (ctrl && e.key === '`') { e.preventDefault(); toggleTerm() }
      if (ctrl && e.key === 'r') { e.preventDefault(); runActiveFile() }

      // Close current tab
      if (ctrl && e.key === 'w') {
        e.preventDefault()
        if (openFilesRef.current.length > 0) closeTab(activeIdxRef.current)
      }

      // Cycle tabs forward / backward
      if (ctrl && !e.shiftKey && e.key === 'Tab') {
        e.preventDefault()
        const n = openFilesRef.current.length
        if (n > 1) { setActiveIdx(prev => (prev + 1) % n); setFocusedPane('left') }
      }
      if (ctrl && e.shiftKey && e.key === 'Tab') {
        e.preventDefault()
        const n = openFilesRef.current.length
        if (n > 1) { setActiveIdx(prev => (prev - 1 + n) % n); setFocusedPane('left') }
      }

      // Quick open
      if (ctrl && e.key === 'p') {
        e.preventDefault()
        setQuickOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saveFile, toggleTerm, runActiveFile, closeTab])

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: jankTheme.bg }}>
      <TitleBar
        title={activeFile?.name}
        onNewProject={() => setShowNewProject(true)}
        onRun={runActiveFile}
        canRun={canRun}
        onSettings={() => setShowSettings(true)}
      />

      {showSettings && (
        <SettingsModal settings={settings} onClose={() => setShowSettings(false)} onChange={setSettings} />
      )}
      {showNewProject && (
        <NewProjectModal onClose={() => setShowNewProject(false)} onCreated={handleProjectCreated} />
      )}
      {quickOpen && (
        <QuickOpen
          rootPath={openFolder}
          onOpen={entry => { setQuickOpen(false); openFile(entry) }}
          onClose={() => setQuickOpen(false)}
        />
      )}

      {/* Tab bar */}
      {openFiles.length > 0 && (
        <div style={{
          display: 'flex', background: jankTheme.bgSidebar,
          borderBottom: `1px solid ${jankTheme.border}`,
          overflowX: 'auto', flexShrink: 0,
        }}>
          {openFiles.map((f, i) => {
            const isActive = i === activeIdx && focusedPane === 'left'
            return (
              <div
                key={f.path}
                onClick={() => { setActiveIdx(i); setFocusedPane('left') }}
                onAuxClick={e => { if (e.button === 1) closeTab(i) }}
                title={f.path}
                style={{
                  padding: '0 4px 0 12px', height: 33, cursor: 'pointer', fontSize: 7,
                  display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                  borderRight: `1px solid ${jankTheme.border}`,
                  borderBottom: isActive ? `2px solid ${jankTheme.accent}` : '2px solid transparent',
                  background: isActive ? jankTheme.bgEditor : 'transparent',
                  color: isActive ? jankTheme.accent : jankTheme.text,
                  fontWeight: isActive ? 700 : 400,
                  flexShrink: 0,
                }}
              >
                {/* Dirty dot */}
                {f.dirty
                  ? <span style={{ color: jankTheme.accent, fontSize: 9, lineHeight: 1 }}>●</span>
                  : <span style={{ width: 9, display: 'inline-block' }} />
                }

                {f.name}

                {/* Split button */}
                <span
                  onClick={e => { e.stopPropagation(); setRightFilePath(f.path); setSplitActive(true); setFocusedPane('right') }}
                  title="Open in split pane"
                  style={{ color: jankTheme.textMuted, fontSize: 6, lineHeight: 1, padding: '0 2px', marginLeft: 2 }}
                  onMouseEnter={e => e.currentTarget.style.color = jankTheme.accent}
                  onMouseLeave={e => e.currentTarget.style.color = jankTheme.textMuted}
                >⬚</span>

                {/* Close button */}
                <span
                  onClick={e => { e.stopPropagation(); closeTab(i) }}
                  title="Close (Ctrl+W)"
                  style={{ color: jankTheme.textMuted, fontSize: 7, lineHeight: 1, padding: '2px 4px', borderRadius: 3 }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'white'; e.currentTarget.style.background = jankTheme.accent }}
                  onMouseLeave={e => { e.currentTarget.style.color = jankTheme.textMuted; e.currentTarget.style.background = 'transparent' }}
                >×</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Main editor area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <FileTree
          onFileOpen={openFile}
          onFolderOpen={path => { setOpenFolder(path); setFocusedPane('left') }}
          externalFolder={openFolder}
          gitStatuses={gitStatuses}
          width={sidebarWidth}
        />
        {/* Sidebar resize handle */}
        <SidebarHandle onDelta={dx => setSidebarWidth(w => Math.max(120, Math.min(520, w + dx)))} />

        <div style={{ flex: 1, display: 'flex', minWidth: 0 }}>
          {/* Left pane */}
          <div
            style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}
            onMouseDown={() => setFocusedPane('left')}
          >
            <EditorPane
              file={activeFile} content={activeFile?.content}
              onChange={handleChange} settings={settings}
              navTarget={navTarget}
            />
          </div>

          {/* Right pane */}
          {splitActive && (
            <div
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0,
                borderLeft: `2px solid ${focusedPane === 'right' ? jankTheme.accent : jankTheme.border}`,
              }}
              onMouseDown={() => setFocusedPane('right')}
            >
              <div style={{
                height: 33, background: jankTheme.bgSidebar, flexShrink: 0,
                borderBottom: `1px solid ${jankTheme.border}`,
                display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8,
              }}>
                <span style={{ color: jankTheme.textMuted, fontSize: 6, letterSpacing: '0.08em' }}>SPLIT</span>
                {rightFile ? (
                  <span style={{ color: jankTheme.text, fontSize: 7, flex: 1 }}>
                    {rightFile.name}{rightFile.dirty ? ' *' : ''}
                  </span>
                ) : (
                  <span style={{ color: jankTheme.textMuted, fontSize: 6, flex: 1 }}>
                    Click a file to open here
                  </span>
                )}
                <span
                  onClick={() => setSplitActive(false)}
                  style={{ color: jankTheme.textMuted, fontSize: 7, cursor: 'pointer', padding: '0 2px' }}
                  onMouseEnter={e => e.currentTarget.style.color = jankTheme.accent}
                  onMouseLeave={e => e.currentTarget.style.color = jankTheme.textMuted}
                >
                  x
                </span>
              </div>
              <EditorPane
                file={rightFile} content={rightFile?.content}
                onChange={handleRightChange} settings={settings}
              />
            </div>
          )}
        </div>
      </div>

      {diagMounted && (
        <>
          {diagVisible && <PanelHandle onDelta={dy => setDiagHeight(h => Math.max(80, h - dy))} />}
          <DiagnosticsPanel
            visible={diagVisible}
            height={diagHeight}
            diagnostics={allDiagnostics}
            onToggle={toggleDiag}
            onNavigate={navigateToDiag}
          />
        </>
      )}

      {simMounted && (
        <>
          {simVisible && <PanelHandle onDelta={dy => setSimHeight(h => Math.max(80, h - dy))} />}
          <SimulatorPanel
            visible={simVisible}
            height={simHeight}
            activeFile={activeFile}
            onToggle={toggleSim}
          />
        </>
      )}

      {gitMounted && (
        <>
          {gitVisible && <PanelHandle onDelta={dy => setGitHeight(h => Math.max(80, h - dy))} />}
          <GitPanel
            visible={gitVisible}
            height={gitHeight}
            rootPath={openFolder}
            onToggle={toggleGit}
            onStatusChange={refreshGitStatus}
          />
        </>
      )}

      {pkgMounted && (
        <>
          {pkgVisible && <PanelHandle onDelta={dy => setPkgHeight(h => Math.max(80, h - dy))} />}
          <PackagePanel
            visible={pkgVisible}
            height={pkgHeight}
            rootPath={openFolder}
            onToggle={togglePkg}
          />
        </>
      )}

      {outMounted && (
        <>
          {outVisible && <PanelHandle onDelta={dy => setOutHeight(h => Math.max(80, h - dy))} />}
          <OutputPanel
            visible={outVisible}
            height={outHeight}
            runningFile={runningFile}
            onToggle={() => setOutVisible(v => !v)}
            onInstall={mod => {
              setTermMounted(true); setTermVisible(true)
              setTimeout(() => window.api.terminalWrite(`py -m pip install ${mod}\r`), 300)
            }}
          />
        </>
      )}

      {termMounted && (
        <>
          {termVisible && <PanelHandle onDelta={dy => setTermHeight(h => Math.max(80, h - dy))} />}
          <TerminalPanel
            visible={termVisible}
            height={termHeight}
            workingDir={openFolder}
            onToggle={toggleTerm}
          />
        </>
      )}

      {/* Status bar */}
      <div style={{
        height: 30, background: jankTheme.accent, flexShrink: 0,
        display: 'flex', alignItems: 'center', padding: '0 12px', gap: 20,
      }}>
        <span style={{ color: 'white', fontSize: 7, fontWeight: 700, letterSpacing: '0.05em' }}>JankEdit v1.6.4</span>
        {isGitRepo && gitBranch && (
          <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 6 }}>⎇ {gitBranch}</span>
        )}
        {activeFile && (
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 6 }}>{activeFile.path}</span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* Error/warning badge — also toggles the panel */}
          {(diagCounts.errors > 0 || diagCounts.warnings > 0) && (
            <button
              onClick={toggleDiag}
              title="Toggle Problems panel"
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px',
              }}
            >
              {diagCounts.errors > 0 && (
                <span style={{ color: '#FF8C6B', fontSize: 6, fontWeight: 700 }}>✕ {diagCounts.errors}</span>
              )}
              {diagCounts.warnings > 0 && (
                <span style={{ color: '#FFD080', fontSize: 6, fontWeight: 700 }}>⚠ {diagCounts.warnings}</span>
              )}
            </button>
          )}
          <StatusBtn active={diagVisible}  title="Toggle Problems panel"    onClick={toggleDiag}>prb</StatusBtn>
          <StatusBtn active={simVisible}   title="Toggle Simulator"         onClick={toggleSim}>sim</StatusBtn>
          <StatusBtn active={pkgVisible}   title="Toggle Package Manager"   onClick={togglePkg}>pkg</StatusBtn>
          <StatusBtn active={gitVisible}   title="Toggle Git panel"         onClick={toggleGit}>git</StatusBtn>
          <StatusBtn active={outVisible}   title="Toggle Output panel"      onClick={() => { setOutMounted(true); setOutVisible(v => !v) }}>out</StatusBtn>
          <StatusBtn active={termVisible}  title="Toggle Terminal (Ctrl+`)" onClick={toggleTerm}>&gt;_</StatusBtn>
        </div>
      </div>
    </div>
  )
}

// ── Drag handles ─────────────────────────────────────────────────────────────

// Horizontal handle — sits above a bottom panel; drag up = grow, drag down = shrink
function PanelHandle({ onDelta }) {
  const [hot, setHot] = React.useState(false)
  const start = React.useRef(null)

  const onMouseDown = e => {
    e.preventDefault()
    start.current = e.clientY
    const onMove = e => {
      if (start.current === null) return
      onDelta(e.clientY - start.current)
      start.current = e.clientY
    }
    const onUp = () => {
      start.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
      style={{
        height: 4, flexShrink: 0, cursor: 'row-resize',
        background: hot ? jankTheme.accent + '55' : 'transparent',
        transition: 'background 0.1s',
      }}
    />
  )
}

// Vertical handle — sits on the right edge of the sidebar
function SidebarHandle({ onDelta }) {
  const [hot, setHot] = React.useState(false)
  const start = React.useRef(null)

  const onMouseDown = e => {
    e.preventDefault()
    start.current = e.clientX
    const onMove = e => {
      if (start.current === null) return
      onDelta(e.clientX - start.current)
      start.current = e.clientX
    }
    const onUp = () => {
      start.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
      style={{
        width: 4, flexShrink: 0, cursor: 'col-resize',
        background: hot ? jankTheme.accent + '55' : 'transparent',
        transition: 'background 0.1s',
      }}
    />
  )
}

function StatusBtn({ active, title, onClick, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: active ? 'rgba(0,0,0,0.25)' : 'transparent',
        border: '1px solid rgba(255,255,255,0.3)',
        color: 'white', padding: '1px 8px', cursor: 'pointer',
        fontSize: 6, fontFamily: "'Press Start 2P', monospace", borderRadius: 3,
      }}
    >
      {children}
    </button>
  )
}
