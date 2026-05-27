import React, { useState, useEffect, useRef, useCallback } from 'react'
import { jankTheme } from '../theme'
import CircuitCanvas from './CircuitCanvas'

// ── Local colour palette ──────────────────────────────────────────────────────
const S = {
  bg:      '#3A2818',   // panel background
  hdr:     '#2C1C0A',   // header bar
  border:  '#6A4E38',   // dividers
  label:   '#B08860',   // section labels / muted text
  dim:     '#8A6848',   // secondary dimmed text
  input:   '#482E1C',   // select / input background
  text:    '#EED0A8',   // primary body text
}

// ── AVR port/pin → Arduino/device pin label ───────────────────────────────────
const AVR_TO_LABEL = {
  'arduino-uno': {
    D0:'D0', D1:'D1', D2:'D2', D3:'D3', D4:'D4', D5:'D5', D6:'D6', D7:'D7',
    B0:'D8', B1:'D9', B2:'D10',B3:'D11',B4:'D12',B5:'D13',
    C0:'A0', C1:'A1', C2:'A2', C3:'A3', C4:'A4', C5:'A5',
  },
  'arduino-mega': {
    A0:'D22',A1:'D23',A2:'D24',A3:'D25',A4:'D26',A5:'D27',A6:'D28',A7:'D29',
    B0:'D53',B1:'D52',B2:'D51',B3:'D50',B4:'D10',B5:'D11',B6:'D12',B7:'D13',
    C0:'D37',C1:'D36',C2:'D35',C3:'D34',C4:'D33',C5:'D32',C6:'D31',C7:'D30',
    D0:'D21',D1:'D20',D2:'D19',D3:'D18',
    E0:'D0', E1:'D1', E3:'D5', E4:'D2', E5:'D3',
    F0:'A0', F1:'A1', F2:'A2', F3:'A3', F4:'A4', F5:'A5', F6:'A6', F7:'A7',
    G0:'D41',G1:'D40',G2:'D39',
    H0:'D17',H1:'D16',H3:'D6', H4:'D7', H5:'D8',
    J0:'D15',J1:'D14',
    K0:'A8', K1:'A9', K2:'A10',K3:'A11',K4:'A12',K5:'A13',K6:'A14',K7:'A15',
    L0:'D49',L1:'D48',L2:'D47',L3:'D46',L4:'D45',L5:'D44',L6:'D43',L7:'D42',
  },
  'stm32f4': {
    A0:'PA0', A1:'PA1', A2:'PA2', A3:'PA3', A4:'PA4',  A5:'PA5',
    A6:'PA6', A7:'PA7', A8:'PA8', A9:'PA9', A10:'PA10',A11:'PA11',
    A12:'PA12',A13:'PA13',A14:'PA14',A15:'PA15',
  },
  'stm32f1': {
    A0:'PA0', A1:'PA1', A2:'PA2', A3:'PA3', A4:'PA4',  A5:'PA5',
    A6:'PA6', A7:'PA7', A8:'PA8', A9:'PA9', A10:'PA10',A11:'PA11',
    A12:'PA12',A13:'PA13',A14:'PA14',A15:'PA15',
  },
}

// ── Build pin list for CircuitCanvas pin selector ─────────────────────────────
const DEVICE_CONFIGS = {
  'arduino-uno':  { pins: { digital: 14, analog: 6,  label: 'D'  } },
  'arduino-mega': { pins: { digital: 20, analog: 8,  label: 'D'  } },
  'stm32f4':      { pins: { digital: 16, analog: 4,  label: 'PA' } },
  'stm32f1':      { pins: { digital: 16, analog: 2,  label: 'PA' } },
}

function buildPins(deviceId) {
  const cfg = DEVICE_CONFIGS[deviceId]
  if (!cfg) return []
  const { digital, analog, label } = cfg.pins
  const pins = []
  for (let i = 0; i < Math.min(digital, 20); i++) pins.push({ id: `${label}${i}`, type: 'digital' })
  for (let i = 0; i < Math.min(analog, 8);   i++) pins.push({ id: `A${i}`,        type: 'analog'  })
  return pins
}

export default function SimulatorPanel({ visible, height, activeFile, onToggle }) {
  const [devices,     setDevices]     = useState([])
  const [deviceId,    setDeviceId]    = useState('arduino-uno')
  const [toolchain,   setToolchain]   = useState({ compiler: null, simulator: null })
  const [status,      setStatus]      = useState('idle')
  const [serial,      setSerial]      = useState([])
  const [gpio,        setGpio]        = useState({})
  const [serialInput, setSerialInput] = useState('')
  const [compileErr,  setCompileErr]  = useState('')
  const serialEndRef  = useRef(null)
  const registeredRef = useRef(false)
  const deviceIdRef   = useRef(deviceId)

  useEffect(() => { deviceIdRef.current = deviceId }, [deviceId])

  useEffect(() => {
    window.api.simGetDevices().then(list => {
      setDevices(list)
      if (list.length) setDeviceId(list[0].id)
    })
  }, [])

  useEffect(() => {
    if (!deviceId) return
    setToolchain({ compiler: null, simulator: null })
    window.api.simCheckToolchain(deviceId).then(setToolchain)
  }, [deviceId])

  useEffect(() => {
    if (registeredRef.current) return
    registeredRef.current = true

    window.api.onSimSerial(line =>
      setSerial(prev => [...prev.slice(-500), line])
    )
    window.api.onSimGpio(({ port, pin, value }) => {
      const map   = AVR_TO_LABEL[deviceIdRef.current] || {}
      const raw   = `${port}${pin}`
      const label = map[raw] || raw
      setGpio(prev => ({ ...prev, [label]: value }))
    })
    window.api.onSimExit(code => {
      setStatus('idle')
      setSerial(prev => [...prev, `\n[simulator exited — code ${code}]\n`])
    })
  }, [])

  useEffect(() => { serialEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [serial])

  const compile = useCallback(async () => {
    if (!activeFile) return
    setStatus('compiling'); setCompileErr('')
    setSerial(prev => [...prev, `\n[compiling ${activeFile.name} for ${deviceId}...]\n`])
    const r = await window.api.simCompile({ deviceId, filePath: activeFile.path })
    if (!r.ok) {
      setStatus('error'); setCompileErr(r.error)
      setSerial(prev => [...prev, r.error])
      return
    }
    setSerial(prev => [...prev, '[compiled OK — starting simulator...]\n'])
    const started = await window.api.simStart({ deviceId, elfPath: r.elfPath })
    if (started) { setStatus('running'); setGpio({}) }
    else { setStatus('error'); setCompileErr('Failed to launch simulator') }
  }, [activeFile, deviceId])

  const stop       = useCallback(() => { window.api.simStop(); setStatus('idle') }, [])
  const sendSerial = useCallback(() => {
    if (!serialInput) return
    window.api.simWrite(serialInput + '\n')
    setSerialInput('')
  }, [serialInput])

  const pins      = buildPins(deviceId)
  const canRun    = activeFile && toolchain.compiler && toolchain.simulator
  const isRunning = status === 'running'

  const statusColor = {
    running:   '#7AB648',
    error:     '#C45A1A',
    compiling: '#E8A030',
    idle:      S.dim,
  }[status]

  return (
    <div style={{
      height:        visible ? height : 0,
      overflow:      'hidden',
      flexShrink:    0,
      display:       'flex',
      flexDirection: 'column',
      borderTop:     visible ? `1px solid ${S.border}` : 'none',
      transition:    'height 0.15s ease',
      background:    S.bg,
    }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        height: 34, background: S.hdr, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px',
        borderBottom: `1px solid ${S.border}`,
      }}>
        <span style={{ color: jankTheme.accent, fontSize: 7, letterSpacing: '0.05em', flexShrink: 0 }}>
          Simulator
        </span>

        <select
          value={deviceId}
          onChange={e => { setDeviceId(e.target.value); setStatus('idle') }}
          style={{
            background: S.input, color: S.text, border: `1px solid ${S.border}`,
            borderRadius: 4, fontSize: 6, fontFamily: 'inherit', padding: '2px 6px', cursor: 'pointer',
          }}
        >
          {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>

        <ToolBadge ok={toolchain.compiler}  label="compiler"  />
        <ToolBadge ok={toolchain.simulator} label="simulator" />

        <div style={{
          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
          background: statusColor,
          boxShadow: isRunning ? `0 0 6px ${statusColor}99` : 'none',
        }} />
        <span style={{ fontSize: 6, color: S.dim }}>
          {status === 'compiling' ? 'compiling...' : status}
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {!isRunning ? (
            <PanelBtn
              onClick={compile}
              disabled={!canRun || status === 'compiling'}
              color={canRun ? '#7AB648' : S.dim}
              label={
                status === 'compiling' ? 'compiling...'
                  : !activeFile         ? 'open a .c file'
                  : !toolchain.compiler ? 'no toolchain'
                  : '▶ Flash & Run'
              }
            />
          ) : (
            <PanelBtn onClick={stop} color="#C45A1A" label="■ Stop" />
          )}
          <PanelBtn onClick={() => setSerial([])} color={S.dim} label="clear" />
          <PanelBtn onClick={onToggle}            color={S.dim} label="x"     />
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Serial monitor */}
        <div style={{
          flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
          borderRight: `1px solid ${S.border}`,
        }}>
          <div style={{
            padding: '3px 10px', fontSize: 5.5, color: S.label, flexShrink: 0,
            borderBottom: `1px solid ${S.border}`,
            letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            Serial Monitor
          </div>

          <div style={{
            flex: 1, overflowY: 'auto', padding: '6px 10px',
            fontFamily: "'Cascadia Code', Consolas, monospace",
            fontSize: 7, color: S.text, lineHeight: 1.7,
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {serial.length === 0 && (
              <span style={{ color: S.label }}>Waiting for serial output...</span>
            )}
            {serial.map((line, i) => <span key={i}>{line}</span>)}
            <div ref={serialEndRef} />
          </div>

          <div style={{ display: 'flex', borderTop: `1px solid ${S.border}`, flexShrink: 0 }}>
            <input
              value={serialInput}
              onChange={e => setSerialInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendSerial()}
              placeholder="Send to device..."
              disabled={!isRunning}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: S.text, fontSize: 7, padding: '5px 10px',
                fontFamily: "'Cascadia Code', Consolas, monospace",
              }}
            />
            <button
              onClick={sendSerial}
              disabled={!isRunning}
              style={{
                background: 'transparent', border: 'none',
                borderLeft: `1px solid ${S.border}`,
                color: isRunning ? jankTheme.accent : S.dim,
                padding: '0 10px', fontSize: 7, fontFamily: 'inherit',
                cursor: isRunning ? 'pointer' : 'default',
              }}
            >send</button>
          </div>
        </div>

        {/* Circuit canvas */}
        <div style={{ width: 340, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{
            padding: '3px 10px', fontSize: 5.5, color: S.label, flexShrink: 0,
            borderBottom: `1px solid ${S.border}`,
            letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>
            Circuit
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <CircuitCanvas
              gpio={gpio}
              pins={pins}
              sourcePath={activeFile?.path}
              defaultBoardId={deviceId}
            />
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ToolBadge({ ok, label }) {
  if (ok === null) return null
  return (
    <span style={{
      fontSize: 5, padding: '2px 5px', borderRadius: 3, fontFamily: 'inherit',
      background: ok ? '#1E3A12' : '#3A1410',
      color:      ok ? '#7AB648' : '#C45A1A',
      border:     `1px solid ${ok ? '#2E5018' : '#602010'}`,
    }}>
      {ok ? '✓' : '✕'} {label}
    </span>
  )
}

function PanelBtn({ onClick, disabled, color, label }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: 'transparent',
        border:  `1px solid ${disabled ? '#5A3828' : color}`,
        color:   disabled ? '#7A5038' : color,
        padding: '2px 8px', cursor: disabled ? 'default' : 'pointer',
        fontSize: 6, fontFamily: "'Press Start 2P', monospace", borderRadius: 3,
      }}
    >{label}</button>
  )
}
