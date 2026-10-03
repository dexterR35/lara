import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Diamond, Image, Layers3, MousePointer2, Type } from 'lucide-react'
import { TRANSFORM_TRACKS, compositionFrameBounds, propertyKeyframes, propertyValueAtFrame } from '../lib/lottie'
import { useWorkspace } from '../state/WorkspaceContext'

const layerIcon = (type) => type === 2 ? Image : type === 5 ? Type : Layers3
const round = (value) => Math.round(Number(value) * 100) / 100

function rangeOptions(key, dimensionIndex, value, width, height) {
  const current = Number(value) || 0
  if (key === 'o') return { min: 0, max: 100, step: 1 }
  if (key === 's') {
    const max = Math.max(300, Math.ceil(Math.abs(current) / 50) * 50 + 50)
    return { min: -max, max, step: 1 }
  }
  if (key === 'r') {
    const extent = Math.max(180, Math.ceil(Math.abs(current) / 45) * 45)
    return { min: -extent, max: extent, step: 1 }
  }
  const axis = dimensionIndex === 0 ? width : height
  const span = Math.max(axis, Math.ceil(Math.abs(current) / 50) * 50 + axis * 0.25)
  return { min: Math.min(-span * 0.25, current), max: Math.max(span, current), step: 1 }
}

function KeyframeMarkers({ keyframes, start, end, currentFrame, onSeek }) {
  const duration = Math.max(1, end - start)
  return <div className="keyframe-track">
    {keyframes.map((keyframe, index) => {
      const frame = Number(keyframe.t)
      const left = Math.max(0, Math.min(100, ((frame - start) / duration) * 100))
      return <button key={`${frame}-${index}`} type="button" className={`keyframe-marker ${Math.abs(currentFrame - frame) < .001 ? 'is-current' : ''}`} style={{ left: `${left}%` }} onClick={() => onSeek(frame)} aria-label={`Go to keyframe ${frame}`} title={`Frame ${frame}`}><Diamond size={10} fill="currentColor"/></button>
    })}
  </div>
}

function TrackRow({ definition, property, layerIndex, frame, start, end, width, height, setLayerTransform, seekFrame }) {
  const fallback = definition.fallback
  const rawValue = propertyValueAtFrame(property, frame, fallback)
  const keyframes = propertyKeyframes(property)
  const hasKeyframe = keyframes.some((keyframe) => Math.abs(Number(keyframe.t) - frame) < .001)
  // Dragging edits a local draft; committing rebuilds the preview, so it only happens on release.
  const [draft, setDraft] = useState(null)
  const values = draft ?? (Array.isArray(rawValue) ? rawValue : [rawValue])

  const changeDimension = (dimension, nextValue) => setDraft((current) => {
    const next = [...(current ?? values)]
    next[dimension] = Number(nextValue)
    return next
  })

  const commitDraft = () => {
    if (!draft) return
    setDraft(null)
    setLayerTransform(layerIndex, definition.key, frame, Array.isArray(rawValue) ? draft : draft[0], property?.a === 1)
  }

  return <div className="timeline-property-row">
    <div className="timeline-property-controls">
      <button type="button" className={`keyframe-toggle ${hasKeyframe ? 'is-active' : ''}`} onClick={() => setLayerTransform(layerIndex, definition.key, frame, rawValue, true)} title={`Add ${definition.label.toLowerCase()} keyframe`} aria-label={`Add ${definition.label.toLowerCase()} keyframe`}><Diamond size={11} fill={hasKeyframe ? 'currentColor' : 'none'}/></button>
      <span>{definition.label}</span>
      <span className="property-values">
        {definition.dimensions.map((label, index) => {
          const value = round(values[index] ?? values[0] ?? 0)
          const range = rangeOptions(definition.key, index, value, width, height)
          return <label key={label}>
            <span>{label}</span>
            <input
              type="range"
              min={range.min}
              max={range.max}
              step={range.step}
              value={Math.min(range.max, Math.max(range.min, value))}
              onChange={(event) => changeDimension(index, event.target.value)}
              onPointerUp={commitDraft}
              onKeyUp={commitDraft}
              onBlur={commitDraft}
              aria-label={`${definition.label} ${label}`}
            />
            <output>{value}</output>
          </label>
        })}
      </span>
    </div>
    <KeyframeMarkers keyframes={keyframes} start={start} end={end} currentFrame={frame} onSeek={seekFrame}/>
  </div>
}

function LayerRow({ layer, index, selected, hovered, expanded, onSelect, onHover, onLeave, onToggle, frame, start, end, width, height, setLayerTransform, seekFrame }) {
  const Icon = layerIcon(layer.ty)
  const duration = Math.max(1, end - start)
  const rawLayerStart = Number(layer.ip)
  const rawLayerEnd = Number(layer.op)
  const layerStart = Math.max(start, Math.min(end, Number.isFinite(rawLayerStart) ? rawLayerStart : start))
  const layerEnd = Math.max(layerStart, Math.min(end, Math.ceil(Number.isFinite(rawLayerEnd) ? rawLayerEnd : end + 1) - 1))
  const allKeyframes = useMemo(() => {
    const frames = new Set()
    TRANSFORM_TRACKS.forEach(({ key }) => propertyKeyframes(layer.ks?.[key]).forEach(({ t }) => frames.add(Number(t))))
    return [...frames].sort((a, b) => a - b).map((t) => ({ t }))
  }, [layer])

  return <>
    <div className={`timeline-layer-row ${selected ? 'is-selected' : ''} ${hovered ? 'is-hovered' : ''}`} onMouseEnter={onHover} onMouseLeave={onLeave} onClick={onSelect}>
      <div className="timeline-layer-name">
        <button type="button" className="layer-disclosure" onClick={(event) => { event.stopPropagation(); onToggle() }} aria-label={expanded ? 'Collapse layer' : 'Expand layer'}>{expanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}</button>
        <Icon size={14}/><span title={layer.nm || `Layer ${index + 1}`}>{layer.nm || `Layer ${index + 1}`}</span>
      </div>
      <div className="layer-time-track">
        <span className="layer-duration" style={{ left: `${Math.max(0, ((layerStart - start) / duration) * 100)}%`, right: `${Math.max(0, ((end - layerEnd) / duration) * 100)}%` }}/>
        <KeyframeMarkers keyframes={allKeyframes} start={start} end={end} currentFrame={frame} onSeek={seekFrame}/>
      </div>
    </div>
    {expanded && TRANSFORM_TRACKS.map((definition) => <TrackRow key={definition.key} definition={definition} property={layer.ks?.[definition.key]} layerIndex={index} frame={frame} start={start} end={end} width={width} height={height} setLayerTransform={setLayerTransform} seekFrame={seekFrame}/>)}
  </>
}

export default function TimelineEditor() {
  const { source, selectedLayerIndices, selectLayer, hoveredLayerIndex, setHoveredLayerIndex, currentFrame, seekFrame, setLayerTransform } = useWorkspace()
  const [expanded, setExpanded] = useState(() => new Set())
  const { start, end } = compositionFrameBounds(source)
  const fps = Number(source.fr) || 1
  const width = Math.max(Number(source.w) || 1, 1)
  const height = Math.max(Number(source.h) || 1, 1)
  const layers = source.layers || []
  const ticks = useMemo(() => Array.from({ length: 6 }, (_, index) => start + ((end - start) * index) / 5), [start, end])

  const toggleLayer = (index) => setExpanded((current) => {
    const next = new Set(current)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    return next
  })

  return <section className="timeline-panel panel" aria-label="Animation timeline">
    <div className="timeline-toolbar">
      <div><p className="eyebrow">Animation</p><h2>Timeline</h2></div>
      <span className="timeline-tip"><MousePointer2 size={13}/> Select a layer, expand transforms, then add a diamond at the playhead</span>
      <output>{((currentFrame - start) / fps).toFixed(2)}s <small>· frame {Math.round(currentFrame)}</small></output>
    </div>
    <div className="timeline-scroll">
      <div className="timeline-ruler-row">
        <strong>Layers</strong>
        <div className="timeline-ruler">
          {ticks.map((tick, index) => <span key={index} style={{ left: `${((tick - start) / Math.max(1, end - start)) * 100}%` }}>{Math.round(tick)}</span>)}
          <input type="range" min={start} max={end} step="1" value={Math.min(end, Math.max(start, currentFrame))} onChange={(event) => seekFrame(Number(event.target.value))} aria-label="Timeline playhead"/>
          <i className="timeline-playhead" style={{ left: `${((currentFrame - start) / Math.max(1, end - start)) * 100}%` }}/>
        </div>
      </div>
      {layers.map((layer, index) => <LayerRow key={`${index}-${layer.ind ?? ''}-${layer.nm ?? ''}`} layer={layer} index={index} selected={selectedLayerIndices.includes(index)} hovered={hoveredLayerIndex === index} expanded={expanded.has(index)} onHover={() => setHoveredLayerIndex(index)} onLeave={() => setHoveredLayerIndex((current) => current === index ? null : current)} onSelect={(event) => selectLayer(index, event.metaKey || event.ctrlKey || event.shiftKey)} onToggle={() => toggleLayer(index)} frame={currentFrame} start={start} end={end} width={width} height={height} setLayerTransform={setLayerTransform} seekFrame={seekFrame}/>)}
      {!layers.length && <div className="timeline-empty">This composition has no editable layers.</div>}
    </div>
  </section>
}
