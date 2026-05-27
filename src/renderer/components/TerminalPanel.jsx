import React, { useEffect, useRef, useState } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import { jankTheme } from '../theme'

const TERM_THEME = {
  background:       '#150D07',
  foreground:       '#F5E6C8',
  cursor:           '#E8793A',
  cursorAccent:     '#150D07',
  selectionBackground: '#E8793A55',
  black:         '#150D07', red:          '#C45A1A',
  green:         '#7AB648', yellow:       '#E8A030',
  blue:          '#8B7355', magenta:      '#C47A35',
  cyan:          '#7A9430', white:        '#F5DEB3',
  brightBlack:   '#4A3020', brightRed:    '#E8793A',
  brightGreen:   '#95D058', brightYellow: '#FFB840',
  brightBlue:    '#C8A882', brightMagenta:'#F0A060',
  brightCyan:    '#A0B840', brightWhite:  '#FFFAF5',
}

export default function TerminalPanel({ visible, height, workingDir, onToggle }) {
  const containerRef = useRef(null)
  const termRef      = useRef(null)
  const fitRef       = useRef(null)
  const startedRef   = useRef(false)

  const [missingModule, setMissingModule] = useState(null)   // ModuleNotFoundError
  const [hasReqs,       setHasReqs]       = useState(false)  // requirements.txt found

  // Check for requirements.txt when folder changes
  useEffect(() => {
    setHasReqs(false)
    if (!workingDir) return
    window.api.readFile(workingDir + '\\requirements.txt').then(res => {
      if (res && !res.error) setHasReqs(true)
    })
  }, [workingDir])

  useEffect(() => {
    const term = new Terminal({
      theme: TERM_THEME,
      fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
      fontSize: 13,
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 2000,
      convertEol: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    termRef.current = term
    fitRef.current  = fit

    window.api.onTerminalData(data => {
      term.write(data)
      // Detect missing Python module
      const match = data.match(/ModuleNotFoundError: No module named '([^'.]+)/)
      if (match) setMissingModule(match[1])
    })
    window.api.onTerminalExit(() => {
      term.writeln('\r\n\x1b[33m[process exited — press any key to restart]\x1b[0m')
      startedRef.current = false
    })
    term.onData(data => window.api.terminalWrite(data))
    term.onResize(({ cols, rows }) => window.api.terminalResize(cols, rows))

    // Ctrl+C → copy selection (if any), otherwise send SIGINT
    // Ctrl+V → paste from clipboard
    term.attachCustomKeyEventHandler(e => {
      if (e.type !== 'keydown') return true
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.key === 'c' && term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection())
        return false
      }
      if (ctrl && e.key === 'v') {
        navigator.clipboard.readText().then(text => {
          if (text) window.api.terminalWrite(text)
        })
        return false
      }
      return true
    })

    return () => { term.dispose(); window.api.terminalKill() }
  }, [])

  // Start / restart when panel becomes visible
  useEffect(() => {
    if (!visible || startedRef.current) return
    startedRef.current = true
    window.api.terminalStart(workingDir).then(() => {
      termRef.current?.writeln('\x1b[33mJankEdit Terminal\x1b[0m')
      termRef.current?.writeln('')
      setTimeout(() => fitRef.current?.fit(), 50)
    })
  }, [visible, workingDir])

  // Auto-cd when the open folder changes
  const prevWorkingDirRef = useRef(null)
  useEffect(() => {
    if (!workingDir || workingDir === prevWorkingDirRef.current) return
    prevWorkingDirRef.current = workingDir
    if (startedRef.current) {
      window.api.terminalWrite(`cd "${workingDir}"\r`)
    }
  }, [workingDir])

  // Refit and refocus whenever the panel size changes or becomes visible
  useEffect(() => {
    if (visible) setTimeout(() => {
      fitRef.current?.fit()
      termRef.current?.focus()
    }, 50)
  }, [visible, height])

  const runCmd = cmd => {
    window.api.terminalWrite(cmd + '\r')
    termRef.current?.focus()
  }

  return (
    <div style={{
      height:     visible ? height : 0,
      overflow:   'hidden',
      flexShrink: 0,
      display:    'flex',
      flexDirection: 'column',
      borderTop:  visible ? `1px solid ${jankTheme.border}` : 'none',
      transition: 'height 0.15s ease',
    }}>
      {/* Terminal header bar */}
      <div style={{
        height:     30,
        background: '#0A0603',
        display:    'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding:    '0 12px',
        flexShrink: 0,
      }}>
        <span style={{
          color:      jankTheme.accent,
          fontSize:   7,
          fontFamily: "'Press Start 2P', monospace",
          letterSpacing: '0.05em',
        }}>
          Terminal
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <HeaderBtn label="restart" onClick={() => {
            startedRef.current = false
            window.api.terminalKill()
            termRef.current?.clear()
            setTimeout(() => {
              startedRef.current = true
              window.api.terminalStart(workingDir).then(() => {
                termRef.current?.writeln('\x1b[33mJankEdit Terminal\x1b[0m')
                termRef.current?.writeln('')
                fitRef.current?.fit()
              })
            }, 200)
          }} />
          <HeaderBtn label="x" onClick={onToggle} />
        </div>
      </div>

      {/* requirements.txt banner */}
      {hasReqs && (
        <NotifBar
          icon="📦"
          message="requirements.txt found"
          action="Install all"
          onAction={() => { runCmd('py -m pip install -r requirements.txt'); setHasReqs(false) }}
          onDismiss={() => setHasReqs(false)}
        />
      )}

      {/* Missing module banner */}
      {missingModule && (
        <NotifBar
          icon="⚠"
          message={`Missing module '${missingModule}'`}
          action={`Install`}
          onAction={() => { runCmd(`py -m pip install ${missingModule}`); setMissingModule(null) }}
          onDismiss={() => setMissingModule(null)}
        />
      )}

      {/* xterm container */}
      <div
        ref={containerRef}
        onClick={() => termRef.current?.focus()}
        style={{ flex: 1, padding: '4px 8px', background: TERM_THEME.background }}
      />
    </div>
  )
}

function NotifBar({ icon, message, action, onAction, onDismiss }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '5px 12px', flexShrink: 0,
      background: '#1A0E06', borderBottom: `1px solid ${jankTheme.border}`,
    }}>
      <span style={{ fontSize: 9 }}>{icon}</span>
      <span style={{ fontSize: 6.5, color: jankTheme.text, flex: 1 }}>{message}</span>
      <button onClick={onAction} style={{
        padding: '3px 10px', fontSize: 6.5, cursor: 'pointer', fontFamily: 'inherit',
        background: jankTheme.accent, color: 'white', border: 'none', borderRadius: 3,
      }}>{action}</button>
      <button onClick={onDismiss} style={{
        padding: '3px 8px', fontSize: 6.5, cursor: 'pointer', fontFamily: 'inherit',
        background: 'transparent', color: jankTheme.textMuted,
        border: `1px solid ${jankTheme.border}`, borderRadius: 3,
      }}>✕</button>
    </div>
  )
}

function HeaderBtn({ label, onClick }) {
  return (
    <button onClick={onClick} style={{
      background:  'transparent',
      border:      `1px solid #3A2010`,
      color:       '#A07850',
      padding:     '2px 8px',
      cursor:      'pointer',
      fontSize:    6,
      fontFamily:  "'Press Start 2P', monospace",
      borderRadius: 3,
    }}
    onMouseEnter={e => e.currentTarget.style.borderColor = jankTheme.accent}
    onMouseLeave={e => e.currentTarget.style.borderColor = '#3A2010'}
    >
      {label}
    </button>
  )
}
