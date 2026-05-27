import React, { useMemo } from 'react'
import { jankTheme } from '../theme'

const SEV = {
  1: { label: 'E', color: '#C45A1A', title: 'Error' },
  2: { label: 'W', color: '#E8A030', title: 'Warning' },
  3: { label: 'I', color: '#7A9430', title: 'Info' },
  4: { label: 'H', color: '#A07850', title: 'Hint' },
}

function uriToName(uri) {
  return uri.replace(/^file:\/\/\//, '').replace(/\//g, '\\').split('\\').pop()
}

export default function DiagnosticsPanel({ visible, height, diagnostics, onToggle, onNavigate }) {
  // Sort files: errors first, then warnings
  const groups = useMemo(() => {
    const arr = []
    diagnostics.forEach((diags, uri) => {
      if (!diags.length) return
      const sorted = [...diags].sort((a, b) => a.severity - b.severity)
      arr.push({ uri, name: uriToName(uri), diags: sorted })
    })
    arr.sort((a, b) => {
      const aMin = Math.min(...a.diags.map(d => d.severity))
      const bMin = Math.min(...b.diags.map(d => d.severity))
      return aMin - bMin
    })
    return arr
  }, [diagnostics])

  const totalErrors   = useMemo(() => [...diagnostics.values()].flat().filter(d => d.severity === 1).length, [diagnostics])
  const totalWarnings = useMemo(() => [...diagnostics.values()].flat().filter(d => d.severity === 2).length, [diagnostics])

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
          <span style={{ color: jankTheme.accent, fontSize: 7, letterSpacing: '0.05em' }}>Problems</span>
          {totalErrors > 0 && (
            <span style={{ color: '#C45A1A', fontSize: 6, fontWeight: 700 }}>✕ {totalErrors}</span>
          )}
          {totalWarnings > 0 && (
            <span style={{ color: '#E8A030', fontSize: 6, fontWeight: 700 }}>⚠ {totalWarnings}</span>
          )}
          {totalErrors === 0 && totalWarnings === 0 && (
            <span style={{ color: jankTheme.textMuted, fontSize: 6 }}>no problems</span>
          )}
        </div>
        <PanelBtn label="x" onClick={onToggle} />
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', background: jankTheme.bgEditor }}>
        {groups.length === 0 ? (
          <div style={{ padding: '12px 16px', color: jankTheme.textMuted, fontSize: 7 }}>
            No diagnostics. Open a supported file and start editing.
          </div>
        ) : groups.map(({ uri, name, diags }) => (
          <div key={uri}>
            {/* File header */}
            <div style={{
              padding: '4px 12px', fontSize: 6, fontWeight: 700,
              color: jankTheme.textMuted, letterSpacing: '0.08em',
              background: jankTheme.bgSidebar,
              borderBottom: `1px solid ${jankTheme.border}`,
              borderTop: `1px solid ${jankTheme.border}`,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ color: jankTheme.accent }}>{name}</span>
              <span>({diags.length})</span>
            </div>

            {diags.map((d, i) => {
              const sev  = SEV[d.severity] ?? SEV[4]
              const line = (d.range?.start?.line ?? 0) + 1
              const col  = (d.range?.start?.character ?? 0) + 1
              return (
                <div
                  key={i}
                  onClick={() => onNavigate(uri, line, col)}
                  style={{
                    padding: '5px 12px 5px 20px',
                    display: 'flex', alignItems: 'flex-start', gap: 8,
                    cursor: 'pointer', fontSize: 7,
                    borderBottom: `1px solid ${jankTheme.border}`,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = jankTheme.lineHighlight}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <span style={{ color: sev.color, fontWeight: 700, fontSize: 6, flexShrink: 0, width: 10, paddingTop: 1 }}
                        title={sev.title}>
                    {sev.label}
                  </span>
                  <span style={{
                    color: jankTheme.textMuted, fontSize: 6, flexShrink: 0, width: 52, paddingTop: 1,
                    fontFamily: "'Cascadia Code', Consolas, monospace",
                  }}>
                    {line}:{col}
                  </span>
                  <span style={{ color: jankTheme.text, flex: 1, lineHeight: 1.5 }}>
                    {d.message}
                  </span>
                  {d.source && (
                    <span style={{ color: jankTheme.textMuted, fontSize: 6, flexShrink: 0, paddingTop: 1 }}>
                      [{d.source}]
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
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
