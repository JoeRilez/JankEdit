import React, { useEffect, useRef, useState } from 'react'
import { jankTheme } from '../theme'

const stripAnsi = s => s.replace(/\x1b\[[0-9;]*[mGKHF]/g, '')

export default function OutputPanel({ visible, height, runningFile, onToggle, onInstall }) {
  const [lines,    setLines]    = useState([])
  const [running,  setRunning]  = useState(false)
  const [exitCode, setExitCode] = useState(null)
  const [missing,  setMissing]  = useState(null)
  const endRef        = useRef(null)
  const registeredRef = useRef(false)

  // Register IPC listeners once
  useEffect(() => {
    if (registeredRef.current) return
    registeredRef.current = true
    window.api.onRunOutput(({ text, isErr }) => {
      const clean = stripAnsi(text)
      setLines(prev => [...prev, { text: clean, isErr }])
      const m = clean.match(/ModuleNotFoundError: No module named '([^'.]+)/)
      if (m) setMissing(m[1])
    })
    window.api.onRunExit(code => { setRunning(false); setExitCode(code) })
  }, [])

  // New run started — clear previous output
  useEffect(() => {
    if (!runningFile) return
    setLines([])
    setExitCode(null)
    setMissing(null)
    setRunning(true)
  }, [runningFile])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [lines])

  return (
    <div style={{
      height:        visible ? height : 0,
      overflow:      'hidden',
      flexShrink:    0,
      display:       'flex',
      flexDirection: 'column',
      borderTop:     visible ? `1px solid ${jankTheme.border}` : 'none',
      background:    '#0F0A06',
      transition:    'height 0.15s ease',
    }}>

      {/* Header */}
      <div style={{
        height: 30, background: '#0A0603', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px',
      }}>
        <span style={{ color: jankTheme.accent, fontSize: 7, fontFamily: "'Press Start 2P', monospace" }}>
          Output
        </span>
        {runningFile && (
          <span style={{ fontSize: 6, color: jankTheme.textMuted }}>{runningFile}</span>
        )}
        {running && (
          <span style={{ fontSize: 5.5, color: '#7AB648' }}>● running</span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {running && (
            <Btn onClick={() => window.api.runStop()} accent="#C45A1A">■ stop</Btn>
          )}
          <Btn onClick={() => { setLines([]); setExitCode(null); setMissing(null) }}>clear</Btn>
          <Btn onClick={onToggle}>x</Btn>
        </div>
      </div>

      {/* Missing module banner */}
      {missing && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '5px 12px', flexShrink: 0,
          background: '#1A0E06', borderBottom: `1px solid ${jankTheme.border}`,
        }}>
          <span style={{ fontSize: 6.5, color: jankTheme.text, flex: 1 }}>
            ⚠ Missing module '{missing}'
          </span>
          <button onClick={() => { onInstall?.(missing); setMissing(null) }} style={{
            padding: '3px 10px', fontSize: 6.5, cursor: 'pointer', fontFamily: 'inherit',
            background: jankTheme.accent, color: 'white', border: 'none', borderRadius: 3,
          }}>Install</button>
          <button onClick={() => setMissing(null)} style={{
            padding: '3px 8px', fontSize: 6.5, cursor: 'pointer', fontFamily: 'inherit',
            background: 'transparent', color: jankTheme.textMuted,
            border: `1px solid ${jankTheme.border}`, borderRadius: 3,
          }}>✕</button>
        </div>
      )}

      {/* Output area */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '8px 14px',
        fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
        fontSize: 12.5, lineHeight: 1.65,
      }}>
        {lines.length === 0 && !running && exitCode === null && (
          <span style={{ color: '#3A2818', fontSize: 11 }}>
            Press ▶ Run or Ctrl+R to run the active file
          </span>
        )}

        {lines.map((line, i) => (
          <div key={i} style={{
            color: line.isErr ? '#E8793A' : '#F5E6C8',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {line.text}
          </div>
        ))}

        {exitCode !== null && (
          <div style={{
            marginTop: 10, paddingTop: 8,
            borderTop: `1px solid #2A1A10`,
            fontSize: 11,
            color: exitCode === 0 ? '#7AB648' : '#C45A1A',
          }}>
            {exitCode === 0 ? '✓' : '✗'} Process exited with code {exitCode}
          </div>
        )}

        <div ref={endRef} />
      </div>
    </div>
  )
}

function Btn({ onClick, children, accent }) {
  return (
    <button onClick={onClick} style={{
      background: 'transparent', cursor: 'pointer',
      border: `1px solid #3A2010`,
      color: accent || '#A07850',
      padding: '2px 8px', fontSize: 6,
      fontFamily: "'Press Start 2P', monospace", borderRadius: 3,
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor = accent || jankTheme.accent}
    onMouseLeave={e => e.currentTarget.style.borderColor = '#3A2010'}
    >{children}</button>
  )
}
