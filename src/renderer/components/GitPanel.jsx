import React, { useState, useEffect, useCallback } from 'react'
import { jankTheme } from '../theme'

const STATUS_META = {
  M: { label: 'M', color: '#E8A030', title: 'Modified' },
  A: { label: 'A', color: '#7AB648', title: 'Added' },
  D: { label: 'D', color: '#C45A1A', title: 'Deleted' },
  '?': { label: 'U', color: '#7AB648', title: 'Untracked' },
  R: { label: 'R', color: '#A07850', title: 'Renamed' },
}
const statusMeta = code => STATUS_META[code] ?? { label: code, color: jankTheme.textMuted, title: code }

export default function GitPanel({ visible, height, rootPath, onToggle, onStatusChange }) {
  const [unstaged, setUnstaged] = useState([])
  const [staged,   setStaged]   = useState([])
  const [log,      setLog]      = useState([])
  const [message,  setMessage]  = useState('')
  const [branch,   setBranch]   = useState('')
  const [isRepo,   setIsRepo]   = useState(false)
  const [error,    setError]    = useState('')

  const refresh = useCallback(async () => {
    if (!rootPath) return
    setError('')
    const repoOk = await window.api.gitIsRepo(rootPath)
    setIsRepo(repoOk)
    if (!repoOk) { setUnstaged([]); setStaged([]); setLog([]); setBranch(''); return }

    const br = await window.api.gitBranch(rootPath)
    if (br.ok) setBranch(br.branch)

    const st = await window.api.gitStatus(rootPath)
    if (st.ok) {
      const u = [], s = []
      st.files.forEach(f => {
        const x = f.xy[0], y = f.xy[1]
        if (x !== ' ' && x !== '?') s.push({ file: f.file, code: x })
        if (y !== ' ')              u.push({ file: f.file, code: y === '?' ? '?' : y })
      })
      setUnstaged(u)
      setStaged(s)
    } else {
      setError(st.error)
    }

    const lg = await window.api.gitLog(rootPath)
    if (lg.ok) setLog(lg.lines)
  }, [rootPath])

  useEffect(() => {
    if (visible && rootPath) refresh()
  }, [visible, rootPath, refresh])

  const afterOp = async () => { await refresh(); onStatusChange?.() }

  const stageAll = async () => {
    if (!unstaged.length) return
    await window.api.gitAdd(rootPath, ['.'])
    afterOp()
  }

  const stageFile = async file => {
    await window.api.gitAdd(rootPath, [file])
    afterOp()
  }

  const unstageFile = async file => {
    await window.api.gitUnstage(rootPath, [file])
    afterOp()
  }

  const commit = async () => {
    if (!message.trim() || !staged.length) return
    const r = await window.api.gitCommit(rootPath, message.trim())
    if (r.ok) { setMessage(''); afterOp() }
    else setError(r.error)
  }

  const canCommit = message.trim().length > 0 && staged.length > 0

  return (
    <div style={{
      height:        visible ? height : 0,
      overflow:      'hidden',
      flexShrink:    0,
      display:       'flex',
      flexDirection: 'column',
      borderTop:     visible ? `1px solid ${jankTheme.border}` : 'none',
      transition:    'height 0.15s ease',
    }}>
      {/* Header */}
      <div style={{
        height: 30, background: '#0A0603', flexShrink: 0,
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '0 12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: jankTheme.accent, fontSize: 7, letterSpacing: '0.05em' }}>Git</span>
          {branch && (
            <span style={{ color: '#A07850', fontSize: 6 }}>⎇ {branch}</span>
          )}
          {!isRepo && rootPath && (
            <span style={{ color: '#A07850', fontSize: 6 }}>not a repo</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <PanelBtn label="↻" onClick={refresh} />
          <PanelBtn label="x" onClick={onToggle} />
        </div>
      </div>

      {!rootPath ? (
        <Hint>Open a folder first</Hint>
      ) : !isRepo ? (
        <Hint>Not a git repository. Run <code>git init</code> in the terminal.</Hint>
      ) : (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Unstaged column */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: `1px solid ${jankTheme.border}` }}>
            <ColHeader label={`Changes (${unstaged.length})`}>
              {unstaged.length > 0 && <SmallBtn onClick={stageAll}>Stage All</SmallBtn>}
            </ColHeader>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {unstaged.map(f => (
                <FileRow key={f.file} f={f} actionLabel="+" onAction={() => stageFile(f.file)} />
              ))}
            </div>
          </div>

          {/* Staged column */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: `1px solid ${jankTheme.border}` }}>
            <ColHeader label={`Staged (${staged.length})`} />
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {staged.map(f => (
                <FileRow key={f.file} f={f} actionLabel="−" onAction={() => unstageFile(f.file)} />
              ))}
            </div>
          </div>

          {/* Commit + log column */}
          <div style={{ width: 190, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '8px 10px', borderBottom: `1px solid ${jankTheme.border}`, flexShrink: 0 }}>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Commit message..."
                rows={3}
                style={{
                  width: '100%', boxSizing: 'border-box', resize: 'none',
                  background: jankTheme.bgEditor, color: jankTheme.text,
                  border: `1px solid ${jankTheme.border}`, borderRadius: 4,
                  fontSize: 7, fontFamily: 'inherit', padding: '5px 7px', outline: 'none',
                }}
              />
              {error && (
                <div style={{ color: '#C45A1A', fontSize: 6, marginTop: 4, wordBreak: 'break-word' }}>{error}</div>
              )}
              <button
                onClick={commit}
                disabled={!canCommit}
                style={{
                  marginTop: 6, width: '100%', padding: '6px 0',
                  background: canCommit ? jankTheme.accent : jankTheme.border,
                  color: 'white', border: 'none', borderRadius: 4,
                  fontSize: 7, fontFamily: 'inherit', fontWeight: 700,
                  cursor: canCommit ? 'pointer' : 'default',
                }}
              >
                Commit
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
              {log.map((line, i) => (
                <div key={i} style={{
                  padding: '3px 10px', fontSize: 6, color: jankTheme.textMuted,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  fontFamily: "'Cascadia Code', Consolas, monospace",
                }} title={line}>
                  {line}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FileRow({ f, actionLabel, onAction }) {
  const meta = statusMeta(f.code)
  const name = f.file.replace(/\\/g, '/').split('/').pop()
  return (
    <div
      style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 7 }}
      onMouseEnter={e => e.currentTarget.style.background = jankTheme.lineHighlight}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <span style={{ color: meta.color, fontWeight: 700, fontSize: 6, width: 10, flexShrink: 0 }} title={meta.title}>
        {meta.label}
      </span>
      <span style={{ color: jankTheme.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.file}>
        {name}
      </span>
      <button
        onClick={onAction}
        style={{
          background: 'transparent', border: `1px solid ${jankTheme.border}`,
          color: jankTheme.textMuted, padding: '1px 6px', fontSize: 7,
          cursor: 'pointer', borderRadius: 2, fontFamily: 'inherit', flexShrink: 0,
        }}
      >
        {actionLabel}
      </button>
    </div>
  )
}

function ColHeader({ label, children }) {
  return (
    <div style={{
      padding: '5px 8px', fontSize: 6, fontWeight: 700, color: jankTheme.textMuted,
      letterSpacing: '0.1em', textTransform: 'uppercase',
      borderBottom: `1px solid ${jankTheme.border}`,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      flexShrink: 0,
    }}>
      {label}
      {children}
    </div>
  )
}

function SmallBtn({ onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: 'transparent', border: `1px solid ${jankTheme.border}`,
      color: jankTheme.textMuted, padding: '2px 6px', fontSize: 6,
      cursor: 'pointer', borderRadius: 2, fontFamily: 'inherit',
    }}>
      {children}
    </button>
  )
}

function PanelBtn({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent', border: '1px solid #3A2010', color: '#A07850',
        padding: '2px 8px', cursor: 'pointer',
        fontSize: 6, fontFamily: "'Press Start 2P', monospace", borderRadius: 3,
      }}
      onMouseEnter={e => e.currentTarget.style.borderColor = jankTheme.accent}
      onMouseLeave={e => e.currentTarget.style.borderColor = '#3A2010'}
    >
      {label}
    </button>
  )
}

function Hint({ children }) {
  return (
    <div style={{ padding: 16, color: jankTheme.textMuted, fontSize: 7, lineHeight: 2 }}>
      {children}
    </div>
  )
}
