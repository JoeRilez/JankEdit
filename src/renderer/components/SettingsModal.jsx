import React, { useState } from 'react'
import { jankTheme } from '../theme'
import { saveSettings, DEFAULTS } from '../settings'

export default function SettingsModal({ settings, onClose, onChange }) {
  const [local, setLocal] = useState({ ...settings })

  const set = (key, value) => setLocal(s => ({ ...s, [key]: value }))

  const apply = () => {
    saveSettings(local)
    onChange(local)
    onClose()
  }

  const reset = () => setLocal({ ...DEFAULTS })

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(30,15,5,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: jankTheme.bg,
        border: `2px solid ${jankTheme.accent}`,
        borderRadius: 8,
        padding: 32,
        width: 420,
        maxWidth: '90vw',
        boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
      }}>
        <div style={{ fontSize: 10, color: jankTheme.accent, marginBottom: 28, letterSpacing: '0.05em' }}>
          Settings
        </div>

        <Section label="Editor">
          {/* Font Size */}
          <Row label="Font Size" value={`${local.fontSize}px`}>
            <input
              type="range" min={10} max={24} step={1}
              value={local.fontSize}
              onChange={e => set('fontSize', Number(e.target.value))}
              style={sliderStyle}
            />
          </Row>

          {/* Tab Size */}
          <Row label="Tab Size">
            <div style={{ display: 'flex', gap: 6 }}>
              {[2, 4, 8].map(n => (
                <TabBtn key={n} active={local.tabSize === n} onClick={() => set('tabSize', n)}>
                  {n}
                </TabBtn>
              ))}
            </div>
          </Row>

          {/* Word Wrap */}
          <Row label="Word Wrap">
            <Toggle value={local.wordWrap} onChange={v => set('wordWrap', v)} />
          </Row>

          {/* Minimap */}
          <Row label="Minimap">
            <Toggle value={local.minimap} onChange={v => set('minimap', v)} />
          </Row>

          {/* Line Numbers */}
          <Row label="Line Numbers">
            <Toggle value={local.lineNumbers} onChange={v => set('lineNumbers', v)} />
          </Row>
        </Section>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', marginTop: 28 }}>
          <button onClick={reset} style={ghostBtn}>Reset defaults</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={ghostBtn}>Cancel</button>
            <button onClick={apply} style={primaryBtn}>Apply</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        fontSize: 6, color: jankTheme.textMuted, letterSpacing: '0.12em',
        textTransform: 'uppercase', marginBottom: 14,
        borderBottom: `1px solid ${jankTheme.border}`, paddingBottom: 6,
      }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
      </div>
    </div>
  )
}

function Row({ label, value, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 7, color: jankTheme.text }}>{label}</span>
        {value && <span style={{ fontSize: 6, color: jankTheme.textMuted }}>{value}</span>}
      </div>
      {children}
    </div>
  )
}

function Toggle({ value, onChange }) {
  return (
    <div
      onClick={() => onChange(!value)}
      style={{
        width: 36, height: 18, borderRadius: 9,
        background: value ? jankTheme.accent : jankTheme.border,
        cursor: 'pointer', position: 'relative',
        transition: 'background 0.15s', flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: 2,
        left: value ? 18 : 2, width: 14, height: 14,
        background: 'white', borderRadius: 7,
        transition: 'left 0.15s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </div>
  )
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '4px 10px', fontSize: 7, fontFamily: 'inherit',
      background:   active ? jankTheme.accent : jankTheme.bgEditor,
      color:        active ? 'white' : jankTheme.text,
      border:       `1px solid ${active ? jankTheme.accent : jankTheme.border}`,
      borderRadius: 4, cursor: 'pointer',
    }}>
      {children}
    </button>
  )
}

const sliderStyle = {
  width: 120, accentColor: jankTheme.accent, cursor: 'pointer',
}

const ghostBtn = {
  padding: '8px 14px', background: 'transparent', color: jankTheme.textMuted,
  border: `1px solid ${jankTheme.border}`, borderRadius: 4,
  cursor: 'pointer', fontSize: 7, fontFamily: 'inherit',
}

const primaryBtn = {
  padding: '8px 20px', background: jankTheme.accent, color: 'white',
  border: 'none', borderRadius: 4, cursor: 'pointer',
  fontSize: 7, fontFamily: 'inherit', fontWeight: 700,
}
