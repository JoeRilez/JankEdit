import React, { useEffect, useRef } from 'react'
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

    window.api.onTerminalData(data => term.write(data))
    window.api.onTerminalExit(() => {
      term.writeln('\r\n\x1b[33m[process exited — press any key to restart]\x1b[0m')
      startedRef.current = false
    })
    term.onData(data => window.api.terminalWrite(data))

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

  // Refit whenever the panel size changes
  useEffect(() => {
    if (visible) setTimeout(() => fitRef.current?.fit(), 50)
  }, [visible, height])

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

      {/* xterm container */}
      <div
        ref={containerRef}
        style={{ flex: 1, padding: '4px 8px', background: TERM_THEME.background }}
      />
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
