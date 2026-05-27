import React, { useState, useEffect, useRef, createContext, useContext } from 'react'
import { jankTheme } from '../theme'
import ContextMenu from './ContextMenu'

// Shared tree actions passed down via context to avoid prop-drilling
const TreeCtx = createContext(null)

// ── Inline text input for rename / new file+folder ──────────────────────────
function InlineInput({ defaultValue, onCommit, onCancel }) {
  const ref = useRef(null)
  useEffect(() => { ref.current?.select() }, [])
  return (
    <input
      ref={ref}
      defaultValue={defaultValue}
      onBlur={e  => onCommit(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter')  { e.preventDefault(); onCommit(e.target.value) }
        if (e.key === 'Escape') { e.preventDefault(); onCancel() }
      }}
      style={{
        flex: 1, fontSize: 7, fontFamily: 'inherit',
        background: jankTheme.bgEditor,
        border: `1px solid ${jankTheme.accent}`,
        borderRadius: 3, padding: '1px 4px',
        color: jankTheme.text, outline: 'none',
      }}
      onClick={e => e.stopPropagation()}
    />
  )
}

const GIT_COLORS = { M: '#E8A030', A: '#7AB648', '?': '#7AB648', D: '#C45A1A', R: '#A07850', C: '#A07850' }

// ── Single file / folder row ─────────────────────────────────────────────────
function FileEntry({ entry, depth }) {
  const { onFileOpen, renaming, setRenaming, creating, setCreating, refresh, gitStatuses } = useContext(TreeCtx)
  const gitCode  = gitStatuses?.[entry.path]
  const gitColor = gitCode ? (GIT_COLORS[gitCode] ?? jankTheme.textMuted) : null
  const gitLabel = gitCode === '?' ? 'U' : gitCode
  const [open, setOpen]         = useState(false)
  const [children, setChildren] = useState([])
  const [menu, setMenu]         = useState(null)

  const loadChildren = async () => {
    const items = await window.api.readDir(entry.path)
    if (!items.error) setChildren(items.filter(i => !i.name.startsWith('.')))
  }

  const handleClick = async () => {
    if (!entry.isDirectory) { onFileOpen(entry); return }
    if (!open) await loadChildren()
    setOpen(o => !o)
  }

  const handleContextMenu = e => {
    e.preventDefault()
    e.stopPropagation()
    const menuItems = entry.isDirectory ? [
      { label: 'New File',   action: () => setCreating({ parentPath: entry.path, type: 'file'   }) },
      { label: 'New Folder', action: () => setCreating({ parentPath: entry.path, type: 'folder' }) },
      '---',
      { label: 'Rename', action: () => setRenaming({ path: entry.path, name: entry.name }) },
      { label: 'Delete', danger: true, action: () => doDelete() },
    ] : [
      { label: 'Rename', action: () => setRenaming({ path: entry.path, name: entry.name }) },
      { label: 'Delete', danger: true, action: () => doDelete() },
    ]
    setMenu({ x: e.clientX, y: e.clientY, items: menuItems })
  }

  const doDelete = async () => {
    await window.api.fsDelete(entry.path)
    refresh()
  }

  const doRename = async (newName) => {
    newName = newName.trim()
    setRenaming(null)
    if (!newName || newName === entry.name) return
    const parent = entry.path.replace(/[\\/][^\\/]+$/, '')
    const sep    = entry.path.includes('/') ? '/' : '\\'
    await window.api.fsRename(entry.path, parent + sep + newName)
    refresh()
  }

  const isRenaming = renaming?.path === entry.path

  return (
    <div>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}

      <div
        onContextMenu={handleContextMenu}
        onClick={handleClick}
        style={{
          padding:  `5px 8px 5px ${14 + depth * 14}px`,
          cursor:   'pointer',
          color:    jankTheme.text,
          fontSize: 7,
          display:  'flex',
          alignItems: 'center',
          gap: 6,
          borderRadius: 3,
          margin:   '1px 4px',
          lineHeight: 1.6,
        }}
        onMouseEnter={e => e.currentTarget.style.background = jankTheme.lineHighlight}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <span style={{ color: jankTheme.textMuted, fontSize: 7, width: 8, flexShrink: 0 }}>
          {entry.isDirectory ? (open ? 'v' : '>') : ''}
        </span>

        {isRenaming ? (
          <InlineInput
            defaultValue={entry.name}
            onCommit={doRename}
            onCancel={() => setRenaming(null)}
          />
        ) : (
          <>
            <span style={{ color: entry.isDirectory ? jankTheme.accent : jankTheme.text, flex: 1 }}>
              {entry.name}
            </span>
            {gitColor && (
              <span style={{ color: gitColor, fontSize: 6, fontWeight: 700, flexShrink: 0 }} title={gitCode}>
                {gitLabel}
              </span>
            )}
          </>
        )}
      </div>

      {open && (
        <div>
          {/* Inline ghost row for creating a file/folder inside this dir */}
          {creating?.parentPath === entry.path && (
            <GhostInput depth={depth + 1} type={creating.type} parentPath={entry.path} />
          )}
          {children.map(child => (
            <FileEntry key={child.path} entry={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Ghost input row that appears when creating a new file/folder ─────────────
function GhostInput({ depth, type, parentPath }) {
  const { setCreating, refresh } = useContext(TreeCtx)

  const commit = async (name) => {
    name = name.trim()
    setCreating(null)
    if (!name) return
    const sep  = parentPath.includes('/') ? '/' : '\\'
    const full = parentPath + sep + name
    if (type === 'file')   await window.api.fsNewFile(full)
    else                   await window.api.fsNewFolder(full)
    refresh()
  }

  return (
    <div style={{
      padding:  `4px 8px 4px ${14 + (depth) * 14}px`,
      display:  'flex', alignItems: 'center', gap: 6,
      margin:   '1px 4px',
    }}>
      <span style={{ color: jankTheme.textMuted, fontSize: 7, width: 8 }} />
      <InlineInput defaultValue="" onCommit={commit} onCancel={() => setCreating(null)} />
    </div>
  )
}

// ── Root FileTree ─────────────────────────────────────────────────────────────
export default function FileTree({ onFileOpen, onFolderOpen, externalFolder, gitStatuses, width }) {
  const [entries,  setEntries]  = useState([])
  const [rootPath, setRootPath] = useState(null)
  const [renaming, setRenaming] = useState(null)
  const [creating, setCreating] = useState(null)
  const [tick,     setTick]     = useState(0)
  const [rootMenu, setRootMenu] = useState(null)

  const refresh = () => setTick(t => t + 1)

  const loadRoot = async (folderPath) => {
    const items = await window.api.readDir(folderPath)
    if (!items.error) {
      setEntries(items.filter(i => !i.name.startsWith('.')))
      setRootPath(folderPath)
    }
  }

  // Reload root whenever tick changes
  useEffect(() => { if (rootPath) loadRoot(rootPath) }, [tick])

  // Respond to externally set folder (e.g. after New Project)
  useEffect(() => {
    if (externalFolder) { setRootPath(externalFolder); loadRoot(externalFolder) }
  }, [externalFolder])

  const openFolder = async () => {
    const folderPath = await window.api.openFolderDialog()
    if (!folderPath) return
    loadRoot(folderPath)
    onFolderOpen?.(folderPath)
  }

  const handleHeaderContext = e => {
    if (!rootPath) return
    e.preventDefault()
    setRootMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: 'New File',   action: () => setCreating({ parentPath: rootPath, type: 'file'   }) },
        { label: 'New Folder', action: () => setCreating({ parentPath: rootPath, type: 'folder' }) },
      ],
    })
  }

  return (
    <TreeCtx.Provider value={{ onFileOpen, renaming, setRenaming, creating, setCreating, refresh, gitStatuses }}>
      <div style={{
        width: width ?? 220, background: jankTheme.bgSidebar,
        borderRight: `1px solid ${jankTheme.border}`,
        overflowY: 'auto', flexShrink: 0,
        display: 'flex', flexDirection: 'column',
      }}>
        {rootMenu && <ContextMenu {...rootMenu} onClose={() => setRootMenu(null)} />}

        {/* Header */}
        <div
          onContextMenu={handleHeaderContext}
          style={{
            padding: '8px 12px', borderBottom: `1px solid ${jankTheme.border}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 6, fontWeight: 700, color: jankTheme.textMuted, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Explorer
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            {rootPath && <>
              <IconBtn title="New File"   onClick={() => setCreating({ parentPath: rootPath, type: 'file'   })}>F</IconBtn>
              <IconBtn title="New Folder" onClick={() => setCreating({ parentPath: rootPath, type: 'folder' })}>D</IconBtn>
            </>}
            <button onClick={openFolder} style={{
              background: jankTheme.accent, color: 'white', border: 'none',
              borderRadius: 4, padding: '4px 8px', fontSize: 6, cursor: 'pointer',
              fontWeight: 700, fontFamily: 'inherit',
            }}>
              Open
            </button>
          </div>
        </div>

        {/* Root ghost input */}
        {creating?.parentPath === rootPath && (
          <GhostInput depth={0} type={creating.type} parentPath={rootPath} />
        )}

        {entries.length === 0 ? (
          <div style={{ padding: 16, color: jankTheme.textMuted, fontSize: 7, textAlign: 'center', lineHeight: 2 }}>
            Open a folder to start
          </div>
        ) : (
          entries.map(entry => (
            <FileEntry key={entry.path + tick} entry={entry} depth={0} />
          ))
        )}
      </div>
    </TreeCtx.Provider>
  )
}

function IconBtn({ title, onClick, children }) {
  return (
    <button onClick={onClick} title={title} style={{
      background: 'transparent', color: jankTheme.textMuted,
      border: `1px solid ${jankTheme.border}`, borderRadius: 3,
      padding: '2px 5px', fontSize: 6, cursor: 'pointer', fontFamily: 'inherit',
    }}
    onMouseEnter={e => e.currentTarget.style.color = jankTheme.accent}
    onMouseLeave={e => e.currentTarget.style.color = jankTheme.textMuted}
    >
      {children}
    </button>
  )
}
