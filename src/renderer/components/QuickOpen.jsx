import React, { useState, useEffect, useRef, useCallback } from 'react'
import { jankTheme } from '../theme'

const IGNORE = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'release', '__pycache__', '.venv'])

// Recursively collect all files (BFS, max depth 8)
async function collectFiles(rootPath, maxDepth = 8) {
  const results = []
  const queue   = [{ path: rootPath, depth: 0 }]
  while (queue.length) {
    const { path, depth } = queue.shift()
    if (depth > maxDepth) continue
    let items
    try { items = await window.api.readDir(path) } catch { continue }
    if (!items || items.error) continue
    for (const item of items) {
      if (item.name.startsWith('.') || IGNORE.has(item.name)) continue
      if (item.isDirectory) {
        queue.push({ path: item.path, depth: depth + 1 })
      } else {
        results.push(item)
      }
    }
  }
  return results
}

// Simple fuzzy: every char in query appears in order in target
function fuzzyMatch(query, target) {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  return qi === q.length
}

// Score: shorter name = better, consecutive run = better
function fuzzyScore(query, name) {
  if (!query) return 0
  const idx = name.toLowerCase().indexOf(query.toLowerCase())
  return idx !== -1 ? 100 - idx : 50
}

export default function QuickOpen({ rootPath, onOpen, onClose }) {
  const [query,   setQuery]   = useState('')
  const [files,   setFiles]   = useState([])
  const [loading, setLoading] = useState(true)
  const [selIdx,  setSelIdx]  = useState(0)
  const inputRef  = useRef(null)
  const listRef   = useRef(null)

  // Load all files once
  useEffect(() => {
    if (!rootPath) { setLoading(false); return }
    setLoading(true)
    collectFiles(rootPath).then(f => { setFiles(f); setLoading(false) })
  }, [rootPath])

  // Focus input on open
  useEffect(() => { inputRef.current?.focus() }, [])

  const filtered = query
    ? files.filter(f => fuzzyMatch(query, f.name) || fuzzyMatch(query, f.path))
        .sort((a, b) => fuzzyScore(query, b.name) - fuzzyScore(query, a.name))
        .slice(0, 50)
    : files.slice(0, 50)

  // Reset selection on query change
  useEffect(() => setSelIdx(0), [query])

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.children[selIdx]
    el?.scrollIntoView({ block: 'nearest' })
  }, [selIdx])

  const confirm = useCallback((item) => {
    if (item) onOpen(item)
  }, [onOpen])

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose() }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelIdx(i => Math.min(i + 1, filtered.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter')     { e.preventDefault(); confirm(filtered[selIdx]) }
  }

  // Highlight matched chars in string
  function highlight(str, q) {
    if (!q) return str
    const result = []
    let si = 0, qi = 0
    const qLow = q.toLowerCase(), sLow = str.toLowerCase()
    while (si < str.length) {
      if (qi < qLow.length && sLow[si] === qLow[qi]) {
        result.push(<mark key={si} style={{ background: jankTheme.accent + '55', color: jankTheme.accent, borderRadius: 2 }}>{str[si]}</mark>)
        qi++
      } else {
        result.push(str[si])
      }
      si++
    }
    return result
  }

  // Get path relative to root for display
  const rel = (path) => {
    if (!rootPath) return path
    const sep = path.includes('/') ? '/' : '\\'
    return path.startsWith(rootPath) ? '.' + sep + path.slice(rootPath.length + 1) : path
  }

  return (
    // Backdrop
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '12vh',
      }}
    >
      {/* Panel */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 560, maxHeight: '60vh',
          background: jankTheme.bgSidebar,
          border: `1px solid ${jankTheme.border}`,
          borderRadius: 8,
          boxShadow: '0 16px 48px rgba(0,0,0,0.4)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Search input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px',
          borderBottom: `1px solid ${jankTheme.border}`,
        }}>
          <span style={{ color: jankTheme.textMuted, fontSize: 10 }}>⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={rootPath ? 'Type to search files...' : 'Open a folder first'}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: jankTheme.text, fontSize: 8,
              fontFamily: "'Cascadia Code', Consolas, monospace",
            }}
          />
          <span style={{ color: jankTheme.textMuted, fontSize: 5.5 }}>ESC to close</span>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ overflowY: 'auto', flex: 1 }}>
          {loading && (
            <div style={{ padding: '12px 14px', color: jankTheme.textMuted, fontSize: 6.5 }}>
              Indexing files…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ padding: '12px 14px', color: jankTheme.textMuted, fontSize: 6.5 }}>
              {rootPath ? 'No matches' : 'No folder open'}
            </div>
          )}
          {!loading && filtered.map((f, i) => (
            <div
              key={f.path}
              onClick={() => confirm(f)}
              style={{
                padding: '7px 14px', cursor: 'pointer',
                background: i === selIdx ? jankTheme.lineHighlight : 'transparent',
                borderLeft: i === selIdx ? `2px solid ${jankTheme.accent}` : '2px solid transparent',
                display: 'flex', flexDirection: 'column', gap: 2,
              }}
              onMouseEnter={() => setSelIdx(i)}
            >
              <span style={{ fontSize: 7, color: jankTheme.text, fontFamily: "'Cascadia Code', Consolas, monospace" }}>
                {highlight(f.name, query)}
              </span>
              <span style={{ fontSize: 5.5, color: jankTheme.textMuted }}>
                {rel(f.path)}
              </span>
            </div>
          ))}
        </div>

        {/* Footer */}
        {!loading && (
          <div style={{
            padding: '5px 14px',
            borderTop: `1px solid ${jankTheme.border}`,
            display: 'flex', gap: 14, alignItems: 'center',
          }}>
            <span style={{ color: jankTheme.textMuted, fontSize: 5.5 }}>
              {filtered.length} of {files.length} files
            </span>
            <span style={{ color: jankTheme.textMuted, fontSize: 5.5, marginLeft: 'auto' }}>
              ↑↓ navigate · Enter open · middle-click tab to close
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
