import React, { useState, useEffect, useRef, useCallback } from 'react'
import { jankTheme } from '../theme'

// ── Colour palette ─────────────────────────────────────────────────────────────
const P = {
  bg:     '#FFF0E0',
  hdr:    '#F5E6D3',
  border: '#E8D5C0',
  label:  '#A07850',
  dim:    '#C0A080',
  input:  '#FFF6EE',
  text:   '#3D2B1F',
  muted:  '#A07850',
}

// ── Manager meta ───────────────────────────────────────────────────────────────
const MANAGERS = [
  { id: 'npm',     label: 'npm',     tool: 'npm',         icon: '⬡', color: '#CB3837' },
  { id: 'pip',     label: 'pip',     tool: 'pip',         icon: '🐍', color: '#3572A5' },
  { id: 'arduino', label: 'Arduino', tool: 'arduino-cli', icon: '⚡', color: '#00878A' },
  { id: 'vcpkg',   label: 'vcpkg',   tool: 'vcpkg',       icon: '📦', color: '#5C4EE5' },
]

// ── npm search via public registry ─────────────────────────────────────────────
async function searchNpm(query) {
  const r = await fetch(`https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=15`)
  const d = await r.json()
  return (d.objects || []).map(o => ({
    name:        o.package.name,
    version:     o.package.version,
    description: o.package.description || '',
  }))
}

// ── PyPI search via simple JSON API ───────────────────────────────────────────
async function searchPip(query) {
  // PyPI doesn't have a great search API; try exact name first, then suggest
  try {
    const r = await fetch(`https://pypi.org/pypi/${encodeURIComponent(query)}/json`)
    if (!r.ok) return []
    const d = await r.json()
    return [{
      name:        d.info.name,
      version:     d.info.version,
      description: d.info.summary || '',
    }]
  } catch { return [] }
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function PackagePanel({ visible, height, rootPath, onToggle }) {
  const [manager,    setManager]    = useState('npm')
  const [tools,      setTools]      = useState({})      // { npm: true/false, ... }
  const [detected,   setDetected]   = useState({})      // { npm: true, pip: false, ... }
  const [installed,  setInstalled]  = useState([])
  const [loading,    setLoading]    = useState(false)
  const [query,      setQuery]      = useState('')
  const [results,    setResults]    = useState([])
  const [searching,  setSearching]  = useState(false)
  const [log,        setLog]        = useState([])
  const [busy,       setBusy]       = useState(false)   // install/uninstall in progress
  const [devFlag,    setDevFlag]    = useState(false)   // npm --save-dev
  const logEndRef    = useRef(null)
  const registeredRef = useRef(false)

  // Register log listener once
  useEffect(() => {
    if (registeredRef.current) return
    registeredRef.current = true
    window.api.onPkgLog(line => setLog(prev => [...prev.slice(-400), line]))
  }, [])

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [log])

  // Check which CLI tools are available
  useEffect(() => {
    Promise.all(MANAGERS.map(m => window.api.pkgCheckTool(m.tool).then(ok => [m.id, ok])))
      .then(pairs => setTools(Object.fromEntries(pairs)))
  }, [])

  // Detect project type when rootPath changes
  useEffect(() => {
    if (!rootPath) { setDetected({}); return }
    window.api.pkgDetect(rootPath).then(setDetected)
  }, [rootPath])

  // Auto-select the first detected manager
  useEffect(() => {
    const first = MANAGERS.find(m => detected[m.id])
    if (first) setManager(first.id)
  }, [detected])

  // Load installed packages whenever manager or rootPath changes
  const refresh = useCallback(() => {
    if (!tools[manager]) return
    setLoading(true)
    window.api.pkgList({ manager, rootPath }).then(r => {
      setInstalled(r.ok ? r.packages : [])
      setLoading(false)
    })
  }, [manager, rootPath, tools])

  useEffect(() => { if (visible) refresh() }, [manager, rootPath, visible, refresh])

  const search = useCallback(async () => {
    if (!query.trim()) return
    setSearching(true)
    setResults([])
    try {
      if (manager === 'npm') {
        setResults(await searchNpm(query))
      } else if (manager === 'pip') {
        setResults(await searchPip(query))
      } else if (manager === 'vcpkg') {
        const r = await window.api.pkgSearchVcpkg(query)
        setResults(r.ok ? r.results : [])
      } else if (manager === 'arduino') {
        const r = await window.api.pkgSearchArduino(query)
        setResults(r.ok ? r.results : [])
      }
    } finally { setSearching(false) }
  }, [query, manager])

  const install = useCallback(async (packageName) => {
    setBusy(true)
    setLog([])
    await window.api.pkgInstall({ manager, packageName, rootPath, dev: devFlag })
    setBusy(false)
    refresh()
  }, [manager, rootPath, devFlag, refresh])

  const uninstall = useCallback(async (packageName) => {
    if (!window.confirm(`Uninstall ${packageName}?`)) return
    setBusy(true)
    setLog([])
    await window.api.pkgUninstall({ manager, packageName, rootPath })
    setBusy(false)
    refresh()
  }, [manager, rootPath, refresh])

  const mgr = MANAGERS.find(m => m.id === manager)

  return (
    <div style={{
      height:        visible ? height : 0,
      overflow:      'hidden',
      flexShrink:    0,
      display:       'flex',
      flexDirection: 'column',
      borderTop:     visible ? `1px solid ${P.border}` : 'none',
      background:    P.bg,
      transition:    'height 0.15s ease',
    }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        height: 34, background: P.hdr, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px',
        borderBottom: `1px solid ${P.border}`,
      }}>
        <span style={{ color: jankTheme.accent, fontSize: 7, letterSpacing: '0.05em', flexShrink: 0 }}>
          Packages
        </span>

        {/* Manager tabs */}
        <div style={{ display: 'flex', gap: 3 }}>
          {MANAGERS.map(m => {
            const available = tools[m.id] !== false
            const active    = manager === m.id
            return (
              <button key={m.id} onClick={() => setManager(m.id)}
                title={available ? `${m.label} ${detected[m.id] ? '(detected)' : ''}` : `${m.tool} not found`}
                style={{
                  padding: '2px 8px', fontSize: 6, fontFamily: 'inherit', cursor: 'pointer',
                  borderRadius: 3,
                  border:  `1px solid ${active ? m.color : P.border}`,
                  color:   available ? (active ? m.color : P.label) : P.dim,
                  background: active ? m.color + '18' : 'transparent',
                  fontWeight: active ? 700 : 400,
                  opacity: available ? 1 : 0.5,
                }}
              >
                {m.icon} {m.label}
                {detected[m.id] && <span style={{ fontSize: 4, marginLeft: 3, opacity: 0.7 }}>●</span>}
              </button>
            )
          })}
        </div>

        {/* Tool availability badge */}
        {tools[mgr?.tool] === false && (
          <span style={{
            fontSize: 5.5, padding: '2px 6px', borderRadius: 3,
            background: '#3A1410', color: '#C45A1A',
            border: '1px solid #602010',
          }}>
            {mgr?.tool} not found on PATH
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 5, alignItems: 'center' }}>
          <PkgBtn onClick={refresh} disabled={busy || loading} color={P.label}>↻ refresh</PkgBtn>
          <PkgBtn onClick={onToggle} color={P.dim}>x</PkgBtn>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* ── Installed ─────────────────────────────────────────────────────── */}
        <div style={{
          width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column',
          borderRight: `1px solid ${P.border}`,
        }}>
          <SectionHeader>
            Installed {!loading && `(${installed.length})`}
          </SectionHeader>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading && <Muted>Loading…</Muted>}
            {!loading && installed.length === 0 && (
              <Muted>{tools[manager] ? 'No packages installed' : `Install ${mgr?.tool} to use this`}</Muted>
            )}
            {!loading && installed.map(pkg => (
              <div key={pkg.name} style={{
                display: 'flex', alignItems: 'center',
                padding: '4px 10px', gap: 6,
                borderBottom: `1px solid ${P.border}`,
              }}>
                <span style={{ flex: 1, fontSize: 6.5, color: P.text, fontFamily: "'Cascadia Code', monospace" }}>{pkg.name}</span>
                <span style={{ fontSize: 5.5, color: P.muted, flexShrink: 0 }}>{pkg.version}</span>
                <button onClick={() => uninstall(pkg.name)} disabled={busy}
                  style={{
                    fontSize: 5, padding: '1px 5px', cursor: busy ? 'default' : 'pointer',
                    border: `1px solid ${P.border}`, borderRadius: 3,
                    background: 'transparent', color: busy ? P.dim : '#C45A1A',
                    fontFamily: 'inherit',
                  }}>✕</button>
              </div>
            ))}
          </div>
        </div>

        {/* ── Search + Results ───────────────────────────────────────────────── */}
        <div style={{
          flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
          borderRight: `1px solid ${P.border}`,
        }}>
          <SectionHeader>Search</SectionHeader>

          {/* Search bar */}
          <div style={{
            display: 'flex', gap: 5, padding: '6px 10px', flexShrink: 0,
            borderBottom: `1px solid ${P.border}`, alignItems: 'center',
          }}>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search()}
              placeholder={`Search ${mgr?.label} packages…`}
              style={{
                flex: 1, background: P.input, border: `1px solid ${P.border}`,
                borderRadius: 3, padding: '3px 7px', fontSize: 6.5,
                color: P.text, fontFamily: 'inherit', outline: 'none',
              }}
            />
            <PkgBtn onClick={search} disabled={searching || !query.trim()} color={jankTheme.accent}>
              {searching ? '…' : 'Search'}
            </PkgBtn>
            {manager === 'npm' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer', fontSize: 6, color: P.label }}>
                <input type="checkbox" checked={devFlag} onChange={e => setDevFlag(e.target.checked)}
                  style={{ accentColor: jankTheme.accent }} />
                dev
              </label>
            )}
          </div>

          {/* Results */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {!searching && results.length === 0 && query && !searching && (
              <Muted>No results — try a different name</Muted>
            )}
            {!searching && results.length === 0 && !query && (
              <Muted>
                {manager === 'pip'
                  ? 'Search by exact package name (PyPI)'
                  : manager === 'vcpkg' || manager === 'arduino'
                  ? `Uses ${mgr?.tool} — must be on PATH`
                  : 'Type to search the registry'}
              </Muted>
            )}
            {results.map(pkg => {
              const alreadyInstalled = installed.some(i => i.name.toLowerCase() === pkg.name.toLowerCase())
              return (
                <div key={pkg.name} style={{
                  padding: '6px 10px', borderBottom: `1px solid ${P.border}`,
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ flex: 1, fontSize: 6.5, color: P.text, fontFamily: "'Cascadia Code', monospace", fontWeight: 600 }}>
                      {pkg.name}
                    </span>
                    <span style={{ fontSize: 5.5, color: P.muted }}>{pkg.version}</span>
                    <button onClick={() => install(pkg.name)} disabled={busy || alreadyInstalled}
                      style={{
                        fontSize: 5.5, padding: '2px 8px', cursor: (busy || alreadyInstalled) ? 'default' : 'pointer',
                        border: `1px solid ${alreadyInstalled ? P.border : jankTheme.accent}`,
                        borderRadius: 3, background: alreadyInstalled ? 'transparent' : jankTheme.accent + '18',
                        color: alreadyInstalled ? P.dim : jankTheme.accent,
                        fontFamily: 'inherit',
                      }}>
                      {alreadyInstalled ? '✓ installed' : '+ install'}
                    </button>
                  </div>
                  {pkg.description && (
                    <span style={{ fontSize: 5.5, color: P.muted, lineHeight: 1.5 }}>
                      {pkg.description.length > 120 ? pkg.description.slice(0, 120) + '…' : pkg.description}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Output log ────────────────────────────────────────────────────── */}
        <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{
            display: 'flex', alignItems: 'center',
            padding: '3px 10px', fontSize: 5.5, color: P.label, flexShrink: 0,
            borderBottom: `1px solid ${P.border}`,
            letterSpacing: '0.1em', textTransform: 'uppercase', gap: 6,
          }}>
            <span style={{ flex: 1 }}>Output</span>
            {busy && <span style={{ color: jankTheme.accent, fontSize: 5 }}>● running</span>}
            <button onClick={() => setLog([])}
              style={{ background: 'transparent', border: 'none', color: P.dim, fontSize: 5, cursor: 'pointer', fontFamily: 'inherit' }}>
              clear
            </button>
          </div>
          <div style={{
            flex: 1, overflowY: 'auto', padding: '6px 10px',
            fontFamily: "'Cascadia Code', Consolas, monospace",
            fontSize: 6, color: P.text, lineHeight: 1.7,
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            background: P.input,
          }}>
            {log.length === 0
              ? <span style={{ color: P.muted }}>Install or uninstall a package to see output…</span>
              : log.map((line, i) => (
                <span key={i} style={{
                  color: line.includes('[done') ? '#7AB648'
                       : line.includes('[error') ? '#C45A1A'
                       : line.startsWith('>') ? jankTheme.accent
                       : P.text,
                }}>{line}</span>
              ))
            }
            <div ref={logEndRef} />
          </div>
        </div>

      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ children }) {
  return (
    <div style={{
      padding: '3px 10px', fontSize: 5.5, color: P.label, flexShrink: 0,
      borderBottom: `1px solid ${P.border}`,
      letterSpacing: '0.1em', textTransform: 'uppercase',
    }}>{children}</div>
  )
}

function Muted({ children }) {
  return (
    <div style={{ padding: '10px', color: P.muted, fontSize: 6 }}>{children}</div>
  )
}

function PkgBtn({ onClick, disabled, color, children }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: 'transparent',
      border:  `1px solid ${disabled ? P.border : color}`,
      color:   disabled ? P.dim : color,
      padding: '2px 8px', cursor: disabled ? 'default' : 'pointer',
      fontSize: 6, fontFamily: "'Press Start 2P', monospace", borderRadius: 3,
    }}>{children}</button>
  )
}
