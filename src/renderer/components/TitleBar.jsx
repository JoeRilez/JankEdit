import React from 'react'
import { jankTheme } from '../theme'

export default function TitleBar({ title }) {
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

      <div style={{ display: 'flex', gap: 8, WebkitAppRegion: 'no-drag' }}>
        <WinBtn color="#FFC107" title="Minimize" onClick={() => window.api.minimize()} />
        <WinBtn color="#8BC34A" title="Maximize" onClick={() => window.api.maximize()} />
        <WinBtn color="#E8793A" title="Close"    onClick={() => window.api.close()} />
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
