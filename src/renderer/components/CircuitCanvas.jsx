import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { jankTheme } from '../theme'

const GRID      = 24
const SNAP_DIST = 14
const snap = v => Math.round(v / GRID) * GRID

const PALETTE = [
  { type: 'BOARD',    label: 'Board'    },
  { type: 'LED',      label: 'LED'      },
  { type: 'RGB_LED',  label: 'RGB LED'  },
  { type: 'BUZZER',   label: 'Buzzer'   },
  { type: 'SEG7',     label: '7-Seg'    },
  { type: 'BUTTON',   label: 'Button'   },
  { type: 'POT',      label: 'Pot'      },
  { type: 'RESISTOR', label: 'Resistor' },
]

const LED_COLORS  = ['#FF3333','#33FF88','#3388FF','#FFDD33','#FF8833','#EE33EE']
const WIRE_COLORS = ['#FF4040','#4090FF','#40C860','#FFD040','#B040FF','#FF9020','#C0C0C0']

// ── Board definitions ─────────────────────────────────────────────────────────
const BOARD_DEFS = {
  'arduino-uno': {
    label: 'Arduino Uno', w: 216, h: 132, fill: '#1A3A18', stroke: '#2A5A28',
    topPins: ['SCL','SDA','AREF','GND','D13','D12','D11','D10','D9','D8','D7','D6','D5','D4','D3','D2','D1','D0'],
    botPins: ['IOREF','RST','3V3','5V','GND','GND','VIN','','A0','A1','A2','A3','A4','A5'],
    pinSp: 11, tX0: 12, bX0: 12,
  },
  'arduino-mega': {
    label: 'Arduino Mega', w: 300, h: 156, fill: '#1A3A18', stroke: '#2A5A28',
    topPins: ['D13','D12','D11','D10','D9','D8','D7','D6','D5','D4','D3','D2','D1','D0','TX1','RX1','TX2','RX2','TX3','RX3'],
    botPins: ['GND','GND','5V','3V3','RST','IOREF','VIN','','A0','A1','A2','A3','A4','A5','A6','A7','A8','A9','A10','A11'],
    pinSp: 11, tX0: 12, bX0: 12,
  },
  'stm32f4': {
    label: 'STM32F4 Discovery', w: 216, h: 132, fill: '#18183A', stroke: '#28285A',
    topPins: ['PA0','PA1','PA2','PA3','PA4','PA5','PA6','PA7','PA8','PA9','PA10','PA11','PA12'],
    botPins: ['PA13','PA14','PA15','PB0','PB1','PB2','GND','3V3','5V'],
    pinSp: 14, tX0: 14, bX0: 14,
  },
  'stm32f1': {
    label: 'STM32F1 Blue Pill', w: 180, h: 108, fill: '#18183A', stroke: '#28285A',
    topPins: ['PA0','PA1','PA2','PA3','PA4','PA5','PA6','PA7'],
    botPins: ['PA8','PA9','PA10','PA11','PA12','PA13','PA14','PA15'],
    pinSp: 16, tX0: 24, bX0: 24,
  },
}

// ── Pure helpers ──────────────────────────────────────────────────────────────
function defaultComp(type, boardId) {
  switch (type) {
    case 'BOARD':    return { boardId: boardId || 'arduino-uno' }
    case 'LED':      return { pin: '', color: '#FF3333' }
    case 'RGB_LED':  return { pins: { r:'', g:'', b:'' } }
    case 'BUTTON':   return { pin: '', pressed: false }
    case 'RESISTOR': return { pin: '', value: '220' }
    case 'BUZZER':   return { pin: '' }
    case 'POT':      return { pins: { sig:'', vcc:'', gnd:'' }, value: 512 }
    case 'SEG7':     return { pins: { a:'',b:'',c:'',d:'',e:'',f:'',g:'' }, commonAnode: true }
    default:         return { pin: '' }
  }
}

function getCompAnchors(type) {
  switch (type) {
    case 'LED':      return [{ x:13,y:44 },{ x:23,y:44 }]
    case 'RGB_LED':  return [{ x:11,y:44 },{ x:18,y:44 },{ x:25,y:44 }]
    case 'RESISTOR': return [{ x:0, y:12 },{ x:72,y:12 }]
    case 'BUTTON':   return [{ x:8,y:-5 },{ x:52,y:-5 },{ x:8,y:53 },{ x:52,y:53 }]
    case 'BUZZER':   return [{ x:12,y:52 },{ x:36,y:52 }]
    case 'POT':      return [{ x:8,y:48 },{ x:20,y:48 },{ x:32,y:48 }]
    case 'SEG7':     return [5,11,17,23,30,36,43].map(x => ({ x, y:80 }))
    default:         return []
  }
}

function getBoardAnchors(def) {
  if (!def) return []
  const a = []
  def.topPins.forEach((id, i) => { if (id) a.push({ x: def.tX0 + i*def.pinSp, y: 0     }) })
  def.botPins.forEach((id, i) => { if (id) a.push({ x: def.bX0 + i*def.pinSp, y: def.h }) })
  return a
}

function wirePath(x1, y1, x2, y2) {
  if (Math.abs(y2 - y1) < 2) return `M${x1} ${y1}L${x2} ${y2}`
  if (Math.abs(x2 - x1) < 2) return `M${x1} ${y1}L${x2} ${y2}`
  return `M${x1} ${y1}L${x2} ${y1}L${x2} ${y2}`
}

function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx-ax, dy = by-ay, l2 = dx*dx+dy*dy
  if (!l2) return Math.hypot(px-ax, py-ay)
  const t = Math.max(0, Math.min(1, ((px-ax)*dx+(py-ay)*dy)/l2))
  return Math.hypot(px-ax-t*dx, py-ay-t*dy)
}

// ── Canvas colour palette ─────────────────────────────────────────────────────
const C = {
  bg:      '#2E1C0A',   // canvas SVG background
  dot:     '#4A3018',   // dot grid
  toolbar: '#251608',   // toolbar + props panel bg
  border:  '#5A3E28',   // all dividers / outlines
  label:   '#A07850',   // section labels / muted text
  dim:     '#7A5838',   // very muted text
  btnTxt:  '#C09870',   // toolbar button text (inactive)
  input:   '#3A2818',   // input / select background
  text:    '#E8C898',   // body text (serial, etc.)
}

// ── Styles ────────────────────────────────────────────────────────────────────
const inputSt  = { width:'100%', boxSizing:'border-box', background:C.input, color:C.text, fontFamily:'inherit', border:`1px solid ${C.border}`, borderRadius:3, fontSize:6, padding:'2px 5px', outline:'none' }
const selectSt = { width:'100%', boxSizing:'border-box', background:C.input, color:C.text, fontFamily:'inherit', border:`1px solid ${C.border}`, borderRadius:3, fontSize:5.5, padding:'2px 3px' }

// ── Main component ────────────────────────────────────────────────────────────
export default function CircuitCanvas({ gpio, pins, sourcePath, defaultBoardId }) {
  const [comps,     setComps]     = useState([])
  const [wires,     setWires]     = useState([])
  const [sel,       setSel]       = useState(null)
  const [selWire,   setSelWire]   = useState(null)
  const [placing,   setPlacing]   = useState(null)
  const [drawWire,  setDrawWire]  = useState(false)
  const [wireStart, setWireStart] = useState(null)
  const [wirePrev,  setWirePrev]  = useState(null)
  const [wireColor, setWireColor] = useState(WIRE_COLORS[0])
  const [ghost,     setGhost]     = useState(null)
  const [moving,    setMoving]    = useState(null)
  const [uid,       setUid]       = useState(1)
  const [wUid,      setWUid]      = useState(1)

  // ── Viewport (pan + zoom) ─────────────────────────────────────────────────
  const [viewport,  setViewport]  = useState({ x: 0, y: 0, scale: 1 })
  const [spaceHeld, setSpaceHeld] = useState(false)
  const viewportRef = useRef({ x: 0, y: 0, scale: 1 })
  useEffect(() => { viewportRef.current = viewport }, [viewport])

  const svgRef    = useRef(null)
  const loadedRef = useRef(false)

  const diagramPath = sourcePath
    ? sourcePath.replace(/\.[^.]+$/, '.diagram.json')
    : null

  // ── Load / save ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!diagramPath) return
    loadedRef.current = false
    setComps([]); setWires([]); setSel(null); setSelWire(null)
    window.api.readFile(diagramPath).then(data => {
      if (typeof data === 'string') {
        try {
          const p  = JSON.parse(data)
          const lc = p.comps || [], lw = p.wires || []
          setComps(lc); setWires(lw)
          setUid(lc.reduce((m, c) => Math.max(m, c.id + 1), 1))
          setWUid(lw.reduce((m, w) => Math.max(m, w.id + 1), 1))
        } catch {}
      }
      loadedRef.current = true
    })
  }, [diagramPath])

  useEffect(() => {
    if (!diagramPath || !loadedRef.current) return
    const t = setTimeout(() =>
      window.api.writeFile(diagramPath, JSON.stringify({ comps, wires }, null, 2)), 800)
    return () => clearTimeout(t)
  }, [comps, wires, diagramPath])

  // ── Space key → pan mode ──────────────────────────────────────────────────
  useEffect(() => {
    const dn = e => { if (e.code === 'Space' && !e.target.closest('input,select')) { e.preventDefault(); setSpaceHeld(true)  } }
    const up = e => { if (e.code === 'Space')  setSpaceHeld(false) }
    window.addEventListener('keydown', dn)
    window.addEventListener('keyup',   up)
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up) }
  }, [])

  // ── Wheel zoom ────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const handler = e => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const mx = e.clientX - r.left
      const my = e.clientY - r.top
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      setViewport(v => {
        const newScale = Math.max(0.1, Math.min(10, v.scale * factor))
        const ratio    = newScale / v.scale
        return { scale: newScale, x: mx - (mx - v.x) * ratio, y: my - (my - v.y) * ratio }
      })
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  // ── Pan (middle-mouse or space+drag) ─────────────────────────────────────
  const startPan = useCallback(e => {
    const { x: vx0, y: vy0 } = viewportRef.current
    const sx = e.clientX, sy = e.clientY
    const onMove = ev => setViewport(v => ({ ...v, x: vx0 + ev.clientX - sx, y: vy0 + ev.clientY - sy }))
    const onUp   = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
  }, [])

  // ── Canvas coordinate helpers ─────────────────────────────────────────────
  // Convert screen event → canvas position (inverse viewport transform)
  const canvasPt = useCallback(e => {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r) return { x: 0, y: 0 }
    const vp = viewportRef.current
    return {
      x: (e.clientX - r.left - vp.x) / vp.scale,
      y: (e.clientY - r.top  - vp.y) / vp.scale,
    }
  }, [])

  // ── All snap anchors ──────────────────────────────────────────────────────
  const allAnchors = useMemo(() => {
    const result = []
    for (const c of comps) {
      const pts = c.type === 'BOARD'
        ? getBoardAnchors(BOARD_DEFS[c.boardId])
        : getCompAnchors(c.type)
      pts.forEach(pt => result.push({ x: c.x + pt.x, y: c.y + pt.y }))
    }
    return result
  }, [comps])

  const snapPt = useCallback((x, y) => {
    for (const a of allAnchors)
      if (Math.hypot(a.x - x, a.y - y) < SNAP_DIST) return { x: a.x, y: a.y, snapped: true }
    return { x: snap(x), y: snap(y), snapped: false }
  }, [allAnchors])

  // ── Mouse events ──────────────────────────────────────────────────────────
  const onMouseMove = useCallback(e => {
    const p = canvasPt(e)
    if (placing) {
      setGhost({ x: snap(p.x), y: snap(p.y) })
    } else if (moving) {
      setComps(prev => prev.map(c =>
        c.id === moving.id
          ? { ...c, x: snap(p.x - moving.offX), y: snap(p.y - moving.offY) }
          : c
      ))
    } else if (drawWire) {
      setWirePrev(snapPt(p.x, p.y))
    }
  }, [placing, moving, drawWire, canvasPt, snapPt])

  const onSvgMouseDown = useCallback(e => {
    if (e.button === 1 || (e.button === 0 && spaceHeld)) {
      e.preventDefault()
      startPan(e)
    }
  }, [spaceHeld, startPan])

  const onSvgClick = useCallback(e => {
    if (placing && ghost) {
      const id = uid
      setComps(prev => [...prev, {
        id, type: placing, x: ghost.x, y: ghost.y,
        ...defaultComp(placing, defaultBoardId),
      }])
      setUid(n => n + 1)
      setSel(id); setSelWire(null)
      setPlacing(null); setGhost(null)
      return
    }
    if (drawWire && wirePrev) {
      if (!wireStart) {
        setWireStart(wirePrev)
      } else {
        setWires(prev => [...prev, {
          id: wUid, color: wireColor,
          x1: wireStart.x, y1: wireStart.y,
          x2: wirePrev.x,  y2: wirePrev.y,
        }])
        setWUid(n => n + 1)
        setWireStart(null)
      }
      return
    }
    // Background click → deselect (components & wires stop propagation)
    if (!placing && !drawWire) {
      setSel(null); setSelWire(null)
    }
  }, [placing, ghost, uid, drawWire, wirePrev, wireStart, wUid, wireColor, defaultBoardId])

  const onMouseUp = useCallback(() => setMoving(null), [])

  const onCompDown = useCallback((e, id) => {
    if (e.button === 1 || (e.button === 0 && spaceHeld)) return  // let pan handle
    if (placing || drawWire) return
    e.stopPropagation()
    setSel(id); setSelWire(null)
    const c = comps.find(c => c.id === id)
    const p = canvasPt(e)
    if (c) setMoving({ id, offX: p.x - c.x, offY: p.y - c.y })
  }, [placing, drawWire, spaceHeld, comps, canvasPt])

  const onCompClick = useCallback(e => {
    if (!placing && !drawWire) e.stopPropagation()
  }, [placing, drawWire])

  const onWireClick = useCallback((e, id) => {
    e.stopPropagation()
    if (placing || drawWire) return
    setSelWire(id); setSel(null)
  }, [placing, drawWire])

  const toggleBtn = useCallback((e, id) => {
    e.stopPropagation()
    setComps(prev => prev.map(c => c.id === id ? { ...c, pressed: !c.pressed } : c))
  }, [])

  const update    = useCallback((id, patch) =>
    setComps(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c)), [])

  const updatePin = useCallback((id, key, val) =>
    setComps(prev => prev.map(c =>
      c.id === id ? { ...c, pins: { ...c.pins, [key]: val } } : c
    )), [])

  const deleteSel = useCallback(() => {
    if (sel     !== null) { setComps(prev => prev.filter(c => c.id !== sel));     setSel(null)     }
    if (selWire !== null) { setWires(prev => prev.filter(w => w.id !== selWire)); setSelWire(null) }
  }, [sel, selWire])

  const cancelMode = useCallback(() => {
    setPlacing(null); setGhost(null)
    setDrawWire(false); setWireStart(null); setWirePrev(null)
  }, [])

  useEffect(() => {
    const h = e => { if (e.key === 'Escape') cancelMode() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [cancelMode])

  const selComp = comps.find(c => c.id === sel) ?? null
  const anyMode = placing !== null || drawWire
  const hasSel  = sel !== null || selWire !== null

  // ── Derived viewport values for dot grid ──────────────────────────────────
  const dotSize    = GRID * viewport.scale
  const dotOffsetX = ((viewport.x % dotSize) + dotSize) % dotSize
  const dotOffsetY = ((viewport.y % dotSize) + dotSize) % dotSize
  const dotRadius  = Math.max(0.5, Math.min(2, 0.9 * viewport.scale))

  const isPanning = spaceHeld
  const cursor    = isPanning ? 'grab' : placing || drawWire ? 'crosshair' : 'default'

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', overflow:'hidden' }}>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div style={{
        display:'flex', gap:4, padding:'4px 8px', flexShrink:0, alignItems:'center',
        flexWrap:'wrap', borderBottom:`1px solid ${C.border}`, background:C.toolbar,
      }}>
        <span style={{ color:C.dim, fontSize:5, letterSpacing:'0.07em', flexShrink:0 }}>ADD</span>

        {PALETTE.map(p => (
          <ToolBtn key={p.type}
            active={placing === p.type}
            onClick={() => { cancelMode(); setPlacing(p.type); setSel(null); setSelWire(null) }}
          >{p.label}</ToolBtn>
        ))}

        <div style={{ width:1, height:12, background:'#3A2A18', flexShrink:0, margin:'0 2px' }} />

        <ToolBtn active={drawWire}
          onClick={() => { cancelMode(); setDrawWire(true); setSel(null); setSelWire(null) }}
          accent="#4090FF"
        >Wire</ToolBtn>

        {drawWire && (
          <div style={{ display:'flex', gap:3, alignItems:'center' }}>
            {WIRE_COLORS.map(c => (
              <div key={c} onClick={() => setWireColor(c)}
                style={{
                  width:10, height:10, borderRadius:'50%', background:c, cursor:'pointer',
                  border: wireColor===c ? '2px solid #FFD070' : '1px solid #3A2A18',
                  boxSizing:'border-box',
                }}
              />
            ))}
          </div>
        )}

        {anyMode && (
          <span style={{ color:C.dim, fontSize:5 }}>
            {placing ? 'click to place · ESC cancel'
              : wireStart ? 'click second point · ESC cancel'
              : 'click first point · ESC cancel'}
          </span>
        )}

        {!anyMode && hasSel && (
          <button onClick={deleteSel} style={{
            padding:'2px 7px', fontSize:5.5,
            border:'1px solid #5A1A10', color:'#C45A1A', background:'transparent',
            borderRadius:3, cursor:'pointer', fontFamily:'inherit',
          }}>delete</button>
        )}

        {/* Zoom controls — right-aligned */}
        <div style={{ marginLeft:'auto', display:'flex', gap:5, alignItems:'center' }}>
          <span style={{ color:C.dim, fontSize:5, fontVariantNumeric:'tabular-nums' }}>
            {Math.round(viewport.scale * 100)}%
          </span>
          <ToolBtn active={false}
            onClick={() => setViewport({ x: 0, y: 0, scale: 1 })}
          >⌂</ToolBtn>
        </div>
      </div>

      {/* ── Canvas + Properties ───────────────────────────────────────────── */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        <svg
          ref={svgRef}
          style={{ flex:1, overflow:'hidden', cursor }}
          onMouseMove={onMouseMove}
          onMouseDown={onSvgMouseDown}
          onMouseUp={onMouseUp}
          onClick={onSvgClick}
        >
          {/* Dynamic dot grid — tracks viewport in screen space */}
          <defs>
            <pattern id="cc-dots"
              width={dotSize} height={dotSize}
              x={dotOffsetX} y={dotOffsetY}
              patternUnits="userSpaceOnUse"
            >
              <circle cx={dotSize/2} cy={dotSize/2} r={dotRadius} fill={C.dot} />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={C.bg} />
          <rect width="100%" height="100%" fill="url(#cc-dots)" />

          {/* ── All canvas content in viewport transform ─────────────────── */}
          <g transform={`translate(${viewport.x},${viewport.y}) scale(${viewport.scale})`}>

            {/* Wires */}
            {wires.map(w => (
              <g key={w.id} onClick={e => onWireClick(e, w.id)} style={{ cursor:'pointer' }}>
                <path d={wirePath(w.x1,w.y1,w.x2,w.y2)}
                  stroke="transparent" strokeWidth={12} fill="none" />
                <path d={wirePath(w.x1,w.y1,w.x2,w.y2)}
                  stroke={w.color} strokeWidth={2} fill="none"
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{ pointerEvents:'none' }}
                />
                {selWire === w.id && (
                  <path d={wirePath(w.x1,w.y1,w.x2,w.y2)}
                    stroke="#FFD070" strokeWidth={1} fill="none"
                    strokeDasharray="3 2" style={{ pointerEvents:'none' }}
                  />
                )}
              </g>
            ))}

            {/* Components */}
            {comps.map(c => {
              const gpin  = gpio[c.pin]  ?? null
              const gpins = c.pins
                ? Object.fromEntries(Object.entries(c.pins).map(([k,v]) => [k, gpio[v]??null]))
                : {}
              const isSel = c.id === sel
              return (
                <g key={c.id}
                  transform={`translate(${c.x},${c.y})`}
                  onMouseDown={e => onCompDown(e, c.id)}
                  onClick={onCompClick}
                  style={{ cursor: isPanning ? 'grab' : (placing||drawWire) ? 'crosshair' : 'grab' }}
                >
                  {c.type === 'BOARD'    && <BoardShape    boardId={c.boardId} sel={isSel} />}
                  {c.type === 'LED'      && <LedShape      color={c.color} on={gpin===1} sel={isSel} />}
                  {c.type === 'RGB_LED'  && <RgbLedShape   r={gpins.r===1} g={gpins.g===1} b={gpins.b===1} sel={isSel} />}
                  {c.type === 'BUTTON'   && <BtnShape      pressed={c.pressed} sel={isSel} onTgl={e=>toggleBtn(e,c.id)} />}
                  {c.type === 'RESISTOR' && <ResShape      sel={isSel} value={c.value} />}
                  {c.type === 'BUZZER'   && <BuzzerShape   on={gpin===1} sel={isSel} />}
                  {c.type === 'POT'      && <PotShape      value={c.value??512} sel={isSel} />}
                  {c.type === 'SEG7'     && <Seg7Shape     gpins={gpins} commonAnode={c.commonAnode} sel={isSel} />}
                  {c.pin && (
                    <text x={0} y={-7} fontSize={5} fill="#A07850" fontFamily="inherit"
                      style={{ pointerEvents:'none', userSelect:'none' }}>{c.pin}</text>
                  )}
                </g>
              )
            })}

            {/* Anchor dots in wire mode */}
            {drawWire && allAnchors.map((a, i) => {
              const near = wirePrev && Math.hypot(a.x-wirePrev.x, a.y-wirePrev.y) < SNAP_DIST
              return (
                <circle key={i} cx={a.x} cy={a.y} r={near ? 4 : 2.5}
                  fill={near ? '#FFD070' : '#3A2010'}
                  stroke={near ? '#FFD070' : C.border} strokeWidth={0.5}
                  style={{ pointerEvents:'none' }}
                />
              )
            })}

            {/* Wire preview */}
            {drawWire && wirePrev && (
              <circle cx={wirePrev.x} cy={wirePrev.y} r={3}
                fill={wirePrev.snapped ? '#FFD070' : wireColor}
                style={{ pointerEvents:'none' }} opacity={0.8}
              />
            )}
            {drawWire && wireStart && wirePrev && (
              <path d={wirePath(wireStart.x,wireStart.y,wirePrev.x,wirePrev.y)}
                stroke={wireColor} strokeWidth={2} fill="none" opacity={0.55}
                strokeDasharray="5 3" strokeLinecap="round"
                style={{ pointerEvents:'none' }}
              />
            )}
            {drawWire && wireStart && (
              <circle cx={wireStart.x} cy={wireStart.y} r={4}
                fill={wireColor} style={{ pointerEvents:'none' }} opacity={0.9}
              />
            )}

            {/* Ghost preview while placing */}
            {placing && ghost && (
              <g transform={`translate(${ghost.x},${ghost.y})`}
                opacity={0.4} style={{ pointerEvents:'none' }}>
                {placing === 'BOARD'    && <BoardShape    boardId={defaultBoardId||'arduino-uno'} sel={false} />}
                {placing === 'LED'      && <LedShape      color="#FF3333" on={false} sel={false} />}
                {placing === 'RGB_LED'  && <RgbLedShape   r={false} g={false} b={false} sel={false} />}
                {placing === 'BUTTON'   && <BtnShape      pressed={false} sel={false} onTgl={()=>{}} />}
                {placing === 'RESISTOR' && <ResShape      sel={false} value="220" />}
                {placing === 'BUZZER'   && <BuzzerShape   on={false} sel={false} />}
                {placing === 'POT'      && <PotShape      value={512} sel={false} />}
                {placing === 'SEG7'     && <Seg7Shape     gpins={{}} commonAnode sel={false} />}
              </g>
            )}

          </g>{/* end viewport group */}
        </svg>

        {/* ── Properties panel ─────────────────────────────────────────────── */}
        {selComp && (
          <div style={{
            width:130, flexShrink:0, background:C.toolbar,
            borderLeft:`1px solid ${C.border}`,
            padding:'8px', display:'flex', flexDirection:'column', gap:10,
            overflowY:'auto',
          }}>
            <div style={{ color:jankTheme.accent, fontSize:5.5, letterSpacing:'0.12em' }}>
              {selComp.type.replace('_',' ')}
            </div>

            {selComp.type === 'BOARD' && (
              <PropGroup label="BOARD">
                <select value={selComp.boardId}
                  onChange={e => update(selComp.id, { boardId: e.target.value })}
                  style={selectSt}>
                  {Object.entries(BOARD_DEFS).map(([id, def]) => (
                    <option key={id} value={id}>{def.label}</option>
                  ))}
                </select>
              </PropGroup>
            )}

            {'pin' in selComp && (
              <PropGroup label="PIN">
                <select value={selComp.pin}
                  onChange={e => update(selComp.id, { pin: e.target.value })}
                  style={selectSt}>
                  <option value="">— none —</option>
                  {pins.map(p => <option key={p.id} value={p.id}>{p.id}</option>)}
                </select>
              </PropGroup>
            )}

            {selComp.pins && Object.entries(selComp.pins).map(([key, val]) => (
              <PropGroup key={key} label={key.toUpperCase()}>
                <select value={val}
                  onChange={e => updatePin(selComp.id, key, e.target.value)}
                  style={selectSt}>
                  <option value="">— none —</option>
                  {pins.map(p => <option key={p.id} value={p.id}>{p.id}</option>)}
                </select>
              </PropGroup>
            ))}

            {selComp.type === 'LED' && (
              <PropGroup label="COLOR">
                <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginTop:2 }}>
                  {LED_COLORS.map(col => (
                    <div key={col} onClick={() => update(selComp.id, { color:col })}
                      style={{
                        width:14, height:14, borderRadius:'50%', background:col,
                        cursor:'pointer', boxSizing:'border-box',
                        border: selComp.color===col ? '2px solid #FFD070' : '1px solid #3A2A18',
                      }}
                    />
                  ))}
                </div>
              </PropGroup>
            )}

            {selComp.type === 'RESISTOR' && (
              <PropGroup label="OHMS">
                <input type="text" value={selComp.value??'220'}
                  onChange={e => update(selComp.id, { value:e.target.value })}
                  style={inputSt} />
              </PropGroup>
            )}

            {selComp.type === 'POT' && (
              <PropGroup label={`VALUE  ${selComp.value??512}`}>
                <input type="range" min={0} max={1023}
                  value={selComp.value??512}
                  onChange={e => update(selComp.id, { value:Number(e.target.value) })}
                  style={{ width:'100%', accentColor:jankTheme.accent, marginTop:4 }}
                />
              </PropGroup>
            )}

            {selComp.type === 'SEG7' && (
              <PropGroup label="DRIVE">
                <select value={selComp.commonAnode ? 'ca' : 'cc'}
                  onChange={e => update(selComp.id, { commonAnode: e.target.value==='ca' })}
                  style={selectSt}>
                  <option value="ca">Common Anode</option>
                  <option value="cc">Common Cathode</option>
                </select>
              </PropGroup>
            )}

            {'pin' in selComp && selComp.pin && (() => {
              const gv = gpio[selComp.pin]
              return (
                <PropGroup label="STATE">
                  <span style={{ fontSize:7, fontWeight:700, color: gv===1 ? '#7AB648' : C.dim }}>
                    {gv===1 ? '■ HIGH' : '□ LOW'}
                  </span>
                </PropGroup>
              )
            })()}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function PropGroup({ label, children }) {
  return (
    <div>
      <div style={{ color:C.label, fontSize:4.5, letterSpacing:'0.1em', marginBottom:4 }}>{label}</div>
      {children}
    </div>
  )
}

function ToolBtn({ active, onClick, children, accent }) {
  const col = accent || jankTheme.accent
  return (
    <button onClick={onClick} style={{
      padding:'2px 7px', fontSize:5.5, fontFamily:'inherit', cursor:'pointer',
      border:  `1px solid ${active ? col : C.border}`,
      color:   active ? col : C.btnTxt,
      background: active ? '#3A2410' : 'transparent',
      borderRadius:3,
    }}>{children}</button>
  )
}

// ── SVG Shapes ────────────────────────────────────────────────────────────────

function BoardShape({ boardId, sel }) {
  const def = BOARD_DEFS[boardId] || BOARD_DEFS['arduino-uno']
  const { w, h, label, fill, stroke, topPins, botPins, pinSp, tX0, bX0 } = def
  return (
    <g>
      <rect x={0} y={0} width={w} height={h} rx={6}
        fill={fill} stroke={sel ? '#FFD070' : stroke} strokeWidth={sel ? 2 : 1.5}
      />
      <rect x={4} y={4} width={w-8} height={h-8} rx={4}
        fill="none" stroke={stroke} strokeWidth={0.5} opacity={0.4}
      />
      <text x={w/2} y={h/2+5} textAnchor="middle" fontSize={10} fill={stroke}
        fontFamily="inherit" style={{ userSelect:'none' }}>{label}</text>
      {topPins.map((id, i) => {
        if (!id) return null
        const cx = tX0 + i * pinSp
        return (
          <g key={`t${i}`}>
            <rect x={cx-3.5} y={-2} width={7} height={9} rx={1} fill="#7A6018" />
            <circle cx={cx} cy={3} r={2.2} fill="#050302" />
            <text x={cx} y={-5} textAnchor="middle" fontSize={4} fill={stroke}
              fontFamily="inherit" style={{ userSelect:'none' }}
              transform={`rotate(-55 ${cx} -5)`}>{id}</text>
          </g>
        )
      })}
      {botPins.map((id, i) => {
        if (!id) return null
        const cx = bX0 + i * pinSp
        return (
          <g key={`b${i}`}>
            <rect x={cx-3.5} y={h-7} width={7} height={9} rx={1} fill="#7A6018" />
            <circle cx={cx} cy={h-2} r={2.2} fill="#050302" />
            <text x={cx} y={h+10} textAnchor="middle" fontSize={4} fill={stroke}
              fontFamily="inherit" style={{ userSelect:'none' }}
              transform={`rotate(55 ${cx} ${h+10})`}>{id}</text>
          </g>
        )
      })}
      {[[4,4],[w-4,4],[4,h-4],[w-4,h-4]].map(([x,y],i) => (
        <circle key={i} cx={x} cy={y} r={3.5} fill="#050302" stroke={stroke} strokeWidth={0.5} />
      ))}
    </g>
  )
}

function LedShape({ color, on, sel }) {
  const c = color || '#FF3333'
  return (
    <g>
      {on && <circle cx={18} cy={15} r={26} fill={c} opacity={0.11} />}
      <circle cx={18} cy={15} r={13}
        fill={on ? c : '#3A2410'} stroke={sel ? '#FFD070' : on ? c : '#8A6030'} strokeWidth={1.5}
      />
      {on && <ellipse cx={13} cy={9} rx={5} ry={4} fill="white" opacity={0.2} />}
      <line x1={13} y1={28} x2={13} y2={44} stroke="#8A6040" strokeWidth={1.5} />
      <line x1={23} y1={28} x2={23} y2={44} stroke="#8A6040" strokeWidth={1.5} />
      <line x1={23} y1={28} x2={27} y2={28} stroke="#8A6040" strokeWidth={1} />
      <text x={18} y={54} textAnchor="middle" fontSize={5} fill="#A07850"
        fontFamily="inherit" style={{ userSelect:'none' }}>LED</text>
    </g>
  )
}

function RgbLedShape({ r, g, b, sel }) {
  const on = r||g||b
  const fill = `rgb(${r?255:25},${g?255:25},${b?255:25})`
  return (
    <g>
      {on && <circle cx={18} cy={15} r={26} fill={fill} opacity={0.13} />}
      <circle cx={18} cy={15} r={13}
        fill={on ? fill : '#3A2410'} stroke={sel ? '#FFD070' : on ? fill : '#8A6030'} strokeWidth={1.5}
      />
      {on && <ellipse cx={13} cy={9} rx={5} ry={4} fill="white" opacity={0.2} />}
      <line x1={11} y1={28} x2={11} y2={44} stroke="#8A6040" strokeWidth={1.5} />
      <line x1={18} y1={28} x2={18} y2={44} stroke="#8A6040" strokeWidth={1.5} />
      <line x1={25} y1={28} x2={25} y2={44} stroke="#8A6040" strokeWidth={1.5} />
      <text x={11} y={52} textAnchor="middle" fontSize={4} fill="#A07850" fontFamily="inherit" style={{ userSelect:'none' }}>R</text>
      <text x={18} y={52} textAnchor="middle" fontSize={4} fill="#A07850" fontFamily="inherit" style={{ userSelect:'none' }}>G</text>
      <text x={25} y={52} textAnchor="middle" fontSize={4} fill="#A07850" fontFamily="inherit" style={{ userSelect:'none' }}>B</text>
      <text x={18} y={60} textAnchor="middle" fontSize={5} fill="#A07850" fontFamily="inherit" style={{ userSelect:'none' }}>RGB</text>
    </g>
  )
}

function BtnShape({ pressed, sel, onTgl }) {
  return (
    <g>
      <rect x={0} y={4} width={60} height={40} rx={3}
        fill="#243A18" stroke={sel ? '#FFD070' : '#3A5A28'} strokeWidth={1.5}
      />
      <rect x={16} y={10} width={28} height={28} rx={5}
        fill={pressed ? '#4A6A2A' : '#34501E'}
        stroke={pressed ? '#7AB648' : '#4A6A28'} strokeWidth={1.5}
        onClick={onTgl} style={{ cursor:'pointer' }}
      />
      <rect x={21} y={15} width={18} height={18} rx={3}
        fill={pressed ? '#608038' : '#3E5C24'}
        onClick={onTgl} style={{ cursor:'pointer' }}
      />
      {[[8,4],[52,4],[8,44],[52,44]].map(([x,y],i) => (
        <line key={i} x1={x} y1={y} x2={x} y2={i<2?y-9:y+9} stroke="#B09030" strokeWidth={1.5} />
      ))}
      <text x={30} y={62} textAnchor="middle" fontSize={5} fill="#A07850"
        fontFamily="inherit" style={{ userSelect:'none' }}>BTN</text>
    </g>
  )
}

function ResShape({ sel, value }) {
  const bands = ['#AA2020','#AA2020','#C09020','#B8B8A0']
  return (
    <g>
      <line x1={0}  y1={12} x2={10} y2={12} stroke="#8A6040" strokeWidth={1.5} />
      <rect x={10} y={4} width={52} height={16} rx={4}
        fill="#3C2E18" stroke={sel ? '#FFD070' : '#7A5830'} strokeWidth={1.5}
      />
      {bands.map((col, i) => (
        <rect key={i} x={[18,26,34,44][i]} y={4} width={5} height={16} fill={col} opacity={0.85} />
      ))}
      <line x1={62} y1={12} x2={72} y2={12} stroke="#8A6040" strokeWidth={1.5} />
      <text x={36} y={30} textAnchor="middle" fontSize={5} fill="#A07850"
        fontFamily="inherit" style={{ userSelect:'none' }}>{value||'220'}Ω</text>
    </g>
  )
}

function BuzzerShape({ on, sel }) {
  return (
    <g>
      <ellipse cx={24} cy={22} rx={22} ry={18}
        fill="#362010" stroke={sel ? '#FFD070' : '#7A5030'} strokeWidth={1.5}
      />
      <ellipse cx={24} cy={22} rx={14} ry={11}
        fill={on ? '#483808' : '#3A2818'} stroke={on ? '#B08018' : '#6A4828'} strokeWidth={1}
      />
      <circle cx={24} cy={22} r={4} fill={on ? '#B08018' : '#5A3E28'} />
      {on && <>
        <path d="M 46 13 Q 55 22 46 31" fill="none" stroke="#B08018" strokeWidth={1.2} opacity={0.65} strokeLinecap="round" />
        <path d="M 50 9  Q 62 22 50 35" fill="none" stroke="#B08018" strokeWidth={1}   opacity={0.35} strokeLinecap="round" />
      </>}
      <line x1={12} y1={40} x2={12} y2={52} stroke="#8A6040" strokeWidth={1.5} />
      <line x1={36} y1={40} x2={36} y2={52} stroke="#8A6040" strokeWidth={1.5} />
      <text x={24} y={62} textAnchor="middle" fontSize={5} fill="#A07850"
        fontFamily="inherit" style={{ userSelect:'none' }}>BUZZ</text>
    </g>
  )
}

function PotShape({ value, sel }) {
  const angle = ((value/1023)*240-120) * (Math.PI/180)
  const kx = 20 + 10*Math.sin(angle)
  const ky = 19 - 10*Math.cos(angle)
  return (
    <g>
      <rect x={0} y={0} width={40} height={36} rx={4}
        fill="#382818" stroke={sel ? '#FFD070' : '#7A5030'} strokeWidth={1.5}
      />
      <circle cx={20} cy={18} r={12} fill="#442E18" stroke="#7A5030" strokeWidth={1} />
      <path
        d={`M${20+10*Math.sin(-120*Math.PI/180)} ${19-10*Math.cos(-120*Math.PI/180)} A10 10 0 1 1 ${20+10*Math.sin(120*Math.PI/180)} ${19-10*Math.cos(120*Math.PI/180)}`}
        fill="none" stroke="#6A5028" strokeWidth={2} strokeLinecap="round"
      />
      <line x1={20} y1={18} x2={kx} y2={ky} stroke="#C09020" strokeWidth={2} strokeLinecap="round" />
      <circle cx={20} cy={18} r={3} fill="#6A5028" />
      <line x1={8}  y1={36} x2={8}  y2={48} stroke="#8A6040" strokeWidth={1.5} />
      <line x1={20} y1={36} x2={20} y2={48} stroke="#8A6040" strokeWidth={1.5} />
      <line x1={32} y1={36} x2={32} y2={48} stroke="#8A6040" strokeWidth={1.5} />
      <text x={8}  y={56} textAnchor="middle" fontSize={4} fill="#A07850" fontFamily="inherit" style={{ userSelect:'none' }}>S</text>
      <text x={20} y={56} textAnchor="middle" fontSize={4} fill="#A07850" fontFamily="inherit" style={{ userSelect:'none' }}>+</text>
      <text x={32} y={56} textAnchor="middle" fontSize={4} fill="#A07850" fontFamily="inherit" style={{ userSelect:'none' }}>-</text>
      <text x={20} y={65} textAnchor="middle" fontSize={5} fill="#A07850" fontFamily="inherit" style={{ userSelect:'none' }}>POT {value}</text>
    </g>
  )
}

function Seg7Shape({ gpins, commonAnode, sel }) {
  const isOn = seg => commonAnode ? gpins[seg]===0 : gpins[seg]===1
  const sc   = seg => isOn(seg) ? '#FF3A18' : '#301810'
  return (
    <g>
      <rect x={-3} y={-3} width={54} height={76} rx={3}
        fill="#1C1208" stroke={sel ? '#FFD070' : '#5A3A20'} strokeWidth={1.5}
      />
      <rect x={0} y={0} width={48} height={70} rx={2} fill="#261A0C" />
      <rect x={8}  y={3}  width={28} height={5}  rx={2} fill={sc('a')} />
      <rect x={34} y={5}  width={5}  height={24} rx={2} fill={sc('b')} />
      <rect x={34} y={37} width={5}  height={24} rx={2} fill={sc('c')} />
      <rect x={8}  y={62} width={28} height={5}  rx={2} fill={sc('d')} />
      <rect x={9}  y={37} width={5}  height={24} rx={2} fill={sc('e')} />
      <rect x={9}  y={5}  width={5}  height={24} rx={2} fill={sc('f')} />
      <rect x={8}  y={33} width={28} height={5}  rx={2} fill={sc('g')} />
      {[5,11,17,23,30,36,43].map((x,i) => (
        <line key={i} x1={x} y1={70} x2={x} y2={80} stroke="#8A6040" strokeWidth={1} />
      ))}
      {['a','b','c','d','e','f','g'].map((s,i) => (
        <text key={s} x={[5,11,17,23,30,36,43][i]} y={88}
          textAnchor="middle" fontSize={4} fill="#7A5838"
          fontFamily="inherit" style={{ userSelect:'none' }}>{s}</text>
      ))}
      <text x={24} y={98} textAnchor="middle" fontSize={5} fill="#A07850"
        fontFamily="inherit" style={{ userSelect:'none' }}>7-SEG</text>
    </g>
  )
}
