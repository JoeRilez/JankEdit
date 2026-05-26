import React, { useState } from 'react'
import { jankTheme } from '../theme'

function FileEntry({ entry, depth, onFileOpen }) {
  const [open, setOpen]     = useState(false)
  const [children, setChildren] = useState([])

  const handleClick = async () => {
    if (!entry.isDirectory) {
      onFileOpen(entry)
      return
    }
    if (!open) {
      const items = await window.api.readDir(entry.path)
      if (!items.error) {
        setChildren(items.filter(i => !i.name.startsWith('.')))
      }
    }
    setOpen(o => !o)
  }

  return (
    <div>
      <div
        onClick={handleClick}
        style={{
          padding: `5px 8px 5px ${14 + depth * 14}px`,
          cursor: 'pointer',
          color: jankTheme.text,
          fontSize: 7,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          borderRadius: 3,
          margin: '1px 4px',
          lineHeight: 1.6,
        }}
        onMouseEnter={e => e.currentTarget.style.background = jankTheme.lineHighlight}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <span style={{ color: jankTheme.textMuted, fontSize: 7, width: 8, flexShrink: 0 }}>
          {entry.isDirectory ? (open ? 'v' : '>') : ''}
        </span>
        <span style={{ color: entry.isDirectory ? jankTheme.accent : jankTheme.text }}>
          {entry.name}
        </span>
      </div>

      {open && children.map(child => (
        <FileEntry key={child.path} entry={child} depth={depth + 1} onFileOpen={onFileOpen} />
      ))}
    </div>
  )
}

export default function FileTree({ onFileOpen }) {
  const [entries, setEntries] = useState([])

  const openFolder = async () => {
    const folderPath = await window.api.openFolderDialog()
    if (!folderPath) return
    const items = await window.api.readDir(folderPath)
    if (!items.error) {
      setEntries(items.filter(i => !i.name.startsWith('.')))
    }
  }

  return (
    <div style={{
      width: 220,
      background: jankTheme.bgSidebar,
      borderRight: `1px solid ${jankTheme.border}`,
      overflowY: 'auto',
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{
        padding: '8px 12px',
        borderBottom: `1px solid ${jankTheme.border}`,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 6,
          fontWeight: 700,
          color: jankTheme.textMuted,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}>
          Explorer
        </span>
        <button onClick={openFolder} style={{
          background: jankTheme.accent,
          color: 'white',
          border: 'none',
          borderRadius: 4,
          padding: '4px 8px',
          fontSize: 6,
          cursor: 'pointer',
          fontWeight: 700,
          fontFamily: 'inherit',
        }}>
          Open
        </button>
      </div>

      {entries.length === 0 ? (
        <div style={{ padding: 16, color: jankTheme.textMuted, fontSize: 7, textAlign: 'center', lineHeight: 2 }}>
          Open a folder to start
        </div>
      ) : (
        entries.map(entry => (
          <FileEntry key={entry.path} entry={entry} depth={0} onFileOpen={onFileOpen} />
        ))
      )}
    </div>
  )
}
