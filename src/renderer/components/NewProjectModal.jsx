import React, { useState } from 'react'
import { jankTheme } from '../theme'

const LANGUAGES = [
  { id: 'python', label: 'Python' },
  { id: 'c',      label: 'C'      },
  { id: 'cpp',    label: 'C++'    },
  { id: 'java',   label: 'Java'   },
  { id: 'kotlin', label: 'Kotlin' },
]

export default function NewProjectModal({ onClose, onCreated }) {
  const [name,     setName]     = useState('')
  const [location, setLocation] = useState('')
  const [language, setLanguage] = useState('python')
  const [error,    setError]    = useState('')
  const [creating, setCreating] = useState(false)

  const pickLocation = async () => {
    const folder = await window.api.openFolderDialog()
    if (folder) setLocation(folder)
  }

  const create = async () => {
    const trimmed = name.trim()
    if (!trimmed)  { setError('Enter a project name.'); return }
    if (!location) { setError('Choose a location.'); return }
    if (!/^[\w\-. ]+$/.test(trimmed)) { setError('Name contains invalid characters.'); return }

    setCreating(true)
    setError('')
    const result = await window.api.createProject({ name: trimmed, location, language })
    setCreating(false)

    if (result.error) { setError(result.error); return }
    onCreated(result)
  }

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
        width: 460,
        maxWidth: '90vw',
        boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
      }}>
        <div style={{ fontSize: 10, color: jankTheme.accent, marginBottom: 28, letterSpacing: '0.05em' }}>
          New Project
        </div>

        <FieldLabel>Project Name</FieldLabel>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && create()}
          placeholder="my-project"
          autoFocus
          style={INPUT}
        />

        <FieldLabel>Location</FieldLabel>
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          <input
            value={location}
            readOnly
            placeholder="Choose a folder..."
            style={{ ...INPUT, flex: 1, marginBottom: 0, cursor: 'default', color: location ? jankTheme.text : jankTheme.textMuted }}
          />
          <button onClick={pickLocation} style={secondaryBtn}>Browse</button>
        </div>

        <FieldLabel>Language</FieldLabel>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 28 }}>
          {LANGUAGES.map(lang => (
            <button
              key={lang.id}
              onClick={() => setLanguage(lang.id)}
              style={{
                flex: 1,
                padding: '8px 4px',
                background:   language === lang.id ? jankTheme.accent : jankTheme.bgEditor,
                color:        language === lang.id ? 'white' : jankTheme.text,
                border:       `1px solid ${language === lang.id ? jankTheme.accent : jankTheme.border}`,
                borderRadius: 4,
                cursor:       'pointer',
                fontSize:     7,
                fontFamily:   'inherit',
                fontWeight:   language === lang.id ? 700 : 400,
                transition:   'all 0.1s',
              }}
            >
              {lang.label}
            </button>
          ))}
        </div>

        {error && (
          <div style={{ color: '#C45A1A', fontSize: 7, marginBottom: 16, lineHeight: 2 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={secondaryBtn}>Cancel</button>
          <button onClick={create} disabled={creating} style={{
            ...primaryBtn,
            opacity: creating ? 0.7 : 1,
          }}>
            {creating ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  )
}

function FieldLabel({ children }) {
  return (
    <div style={{
      fontSize: 6, color: jankTheme.textMuted,
      marginBottom: 8, letterSpacing: '0.12em', textTransform: 'uppercase',
    }}>
      {children}
    </div>
  )
}

const INPUT = {
  width: '100%', padding: '10px 12px', marginBottom: 20,
  background: jankTheme.bgEditor, border: `1px solid ${jankTheme.border}`,
  borderRadius: 4, color: jankTheme.text, fontSize: 11,
  fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
}

const secondaryBtn = {
  padding: '8px 16px', background: 'transparent', color: jankTheme.text,
  border: `1px solid ${jankTheme.border}`, borderRadius: 4,
  cursor: 'pointer', fontSize: 7, fontFamily: 'inherit',
}

const primaryBtn = {
  padding: '8px 20px', background: jankTheme.accent, color: 'white',
  border: `1px solid ${jankTheme.accent}`, borderRadius: 4,
  cursor: 'pointer', fontSize: 7, fontFamily: 'inherit', fontWeight: 700,
}
