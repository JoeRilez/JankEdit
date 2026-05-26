import React from 'react'
import { jankTheme } from '../theme'

export default function TitleBar({ title, onNewProject, onRun, canRun, onSettings }) {
  return (
    <div style={{
      height: 44,
      background: jankTheme.bgTitlebar,
      borderBottom: `1px solid ${jankTheme.border}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 12px',
      WebkitAppRegion: 'drag',
      userSelect: 'none',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          fontWeight: 800,
          fontSize: 10,
          color: jankTheme.accent,
          letterSpacing: '0.04em',
        }}>
          JankEdit
        </span>
        {title && (
          <span style={{ color: jankTheme.textMuted, fontSize: 7 }}>
            — {title}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, WebkitAppRegion: 'no-drag' }}>
        <button
          onClick={onNewProject}
          title="New Project"
          style={{
            background: jankTheme.accent, color: 'white',
            border: 'none', borderRadius: 4,
            padding: '4px 10px', fontSize: 6,
            cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700,
            letterSpacing: '0.05em',
          }}
        >
          + New
        </button>
        {canRun && (
          <button
            onClick={onRun}
            title="Run file (Ctrl+R)"
            style={{
              background: '#7AB648', color: 'white',
              border: 'none', borderRadius: 4,
              padding: '4px 12px', fontSize: 6,
              cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700,
            }}
          >
            Run
          </button>
        )}
        <button
          onClick={onSettings}
          title="Settings"
          style={{
            background: 'transparent', color: jankTheme.textMuted,
            border: `1px solid ${jankTheme.border}`, borderRadius: 4,
            padding: '4px 8px', fontSize: 6,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
          onMouseEnter={e => e.currentTarget.style.color = jankTheme.accent}
          onMouseLeave={e => e.currentTarget.style.color = jankTheme.textMuted}
        >
          cfg
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <WinBtn color="#FFC107" title="Minimize" onClick={() => window.api.minimize()} />
          <WinBtn color="#8BC34A" title="Maximize" onClick={() => window.api.maximize()} />
          <WinBtn color="#E8793A" title="Close"    onClick={() => window.api.close()} />
        </div>
      </div>
    </div>
  )
}

function WinBtn({ color, title, onClick }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 13, height: 13,
        borderRadius: '50%',
        background: color,
        border: 'none',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    />
  )
}
