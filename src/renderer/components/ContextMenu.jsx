import React, { useEffect } from 'react'
import { jankTheme } from '../theme'

export default function ContextMenu({ x, y, items, onClose }) {
  useEffect(() => {
    const close = () => onClose()
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [onClose])

  return (
    <div
      onMouseDown={e => e.stopPropagation()}
      style={{
        position:  'fixed',
        left:      x, top: y,
        zIndex:    3000,
        background: jankTheme.bgSidebar,
        border:    `1px solid ${jankTheme.border}`,
        borderRadius: 5,
        boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
        minWidth:  150,
        overflow:  'hidden',
        padding:   '3px 0',
      }}
    >
      {items.map((item, i) =>
        item === '---'
          ? <div key={i} style={{ height: 1, background: jankTheme.border, margin: '3px 0' }} />
          : (
            <div
              key={i}
              onMouseDown={() => { item.action(); onClose() }}
              style={{
                padding:  '7px 14px',
                fontSize: 7,
                cursor:   'pointer',
                color:    item.danger ? '#C45A1A' : jankTheme.text,
                lineHeight: 1.6,
              }}
              onMouseEnter={e => e.currentTarget.style.background = jankTheme.lineHighlight}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {item.label}
            </div>
          )
      )}
    </div>
  )
}
