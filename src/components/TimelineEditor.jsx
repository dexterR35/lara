import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Diamond, Image, Layers3, MousePointer2, Type } from 'lucide-react'
import { TRANSFORM_TRACKS, propertyKeyframes, propertyValueAtFrame } from '../lib/lottie'
import { useWorkspace } from '../state/WorkspaceContext'

const layerIcon = (type) => type === 2 ? Image : type === 5 ? Type : Layers3
const round = (value) => Math.round(Number(value) * 100) / 100

function KeyframeMarkers({ keyframes, start, end, currentFrame, onSeek }) {
  const duration = Math.max(1, end - start)
  return <div className="keyframe-track">
    {keyframes.map((keyframe) => {
      const frame = Number(keyframe.t)
      const left = Math.max(0, Math.min(100, ((frame - start) / duration) * 100))
      return <button key={frame} type="button" className={`keyframe-marker ${Math.round(currentFrame) === Math.round(frame) ? 'is-current' : ''}`} style={{ left: `${left}%` }} onClick={() => onSeek(frame)} aria-label={`Go to keyframe ${frame}`} title={`Frame ${frame}`}><Diamond size={10} fill="currentColor"/></button>
    })}
  </div>
}

function TrackRow({ definition, property, layerIndex, frame, start, end, setLayerTransform, seekFrame }) {
  const fallback = definition.fallback
  const rawValue = propertyValueAtFrame(property, frame, fallback)
  const values = Array.isArray(rawValue) ? rawValue : [rawValue]
  const keyframes = propertyKeyframes(property)
  const hasKeyframe = keyframes.some((keyframe) => Math.round(Number(keyframe.t)) === Math.round(frame))

  const changeDimension = (dimension, nextValue) => {
    const value = Array.isArray(rawValue) ? [...rawValue] : Number(rawValue) || 0
    if (Array.isArray(value)) value[dimension] = Number(nextValue)
    else setLayerTransform(layerIndex, definition.key, frame, Number(nextValue), property?.a === 1)
    if (Array.isArray(value)) setLayerTransform(layerIndex, definition.key, frame, value, property?.a === 1)
  }

  return <div className="timeline-property-row">
    <div className="timeline-property-controls">
      <button type="button" className={`keyframe-toggle ${hasKeyframe ? 'is-active' : ''}`} onClick={() => setLayerTransform(layerIndex, definition.key, frame, rawValue, true)} title={`Add ${definition.label.toLowerCase()} keyframe`} aria-label={`Add ${definition.label.toLowerCase()} keyframe`}><Diamond size={11} fill={hasKeyframe ? 'currentColor' : 'none'}/></button>
      <span>{definition.label}</span>
      <span className="property-values">
        {definition.dimensions.map((label, index) => <label key={label}><span>{label}</span><input type="number" step="any" value={round(values[index] ?? values[0] ?? 0)} onChange={(event) => changeDimension(index, event.target.value)}/></label>)}
      </span>
    </div>
    <KeyframeMarkers keyframes={keyframes} start={start} end={end} currentFrame={frame} onSeek={seekFrame}/>
  </div>
}

function LayerRow({ layer, index, selected, expanded, onSelect, onToggle, frame, start, end, setLayerTransform, seekFrame }) {
  const Icon = layerIcon(layer.ty)
  const allKeyframes = useMemo(() => {
    const frames = new Set()
    TRANSFORM_TRACKS.forEach(({ key }) => propertyKeyframes(layer.ks?.[key]).forEach(({ t }) => frames.add(Number(t))))
    return [...frames].sort((a, b) => a - b).map((t) => ({ t }))
  }, [layer])

  return <>
    <div className={`timeline-layer-row ${selected ? 'is-selected' : ''}`} onClick={onSelect}>
      <div className="timeline-layer-name">
        <button type="button" className="layer-disclosure" onClick={(event) => { event.stopPropagation(); onToggle() }} aria-label={expanded ? 'Collapse layer' : 'Expand layer'}>{expanded ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}</button>
        <Icon size={14}/><span title={layer.nm || `Layer ${index + 1}`}>{layer.nm || `Layer ${index + 1}`}</span>
      </div>
      <div className="layer-time-track">
        <span className="layer-duration" style={{ left: `${Math.max(0, ((Number(layer.ip ?? start) - start) / Math.max(1, end - start)) * 100)}%`, right: `${Math.max(0, ((end - Number(layer.op ?? end)) / Math.max(1, end - start)) * 100)}%` }}/>
        <KeyframeMarkers keyframes={allKeyframes} start={start} end={end} currentFrame={frame} onSeek={seekFrame}/>
      </div>
    </div>
    {expanded && TRANSFORM_TRACKS.map((definition) => <TrackRow key={definition.key} definition={definition} property={layer.ks?.[definition.key]} layerIndex={index} frame={frame} start={start} end={end} setLayerTransform={setLayerTransform} seekFrame={seekFrame}/>)}
  </>
}

export default function TimelineEditor() {
  const { source, selectedLayerIndex, setSelectedLayerIndex, currentFrame, seekFrame, setLayerTransform } = useWorkspace()
  const [expanded, setExpanded] = useState(() => new Set())
  const start = Number(source.ip) || 0
  const end = Number(source.op) || 1
  const fps = Number(source.fr) || 1
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
      <output>{(currentFrame / fps).toFixed(2)}s <small>· frame {Math.round(currentFrame)}</small></output>
    </div>
    <div className="timeline-scroll">
      <div className="timeline-ruler-row">
        <strong>Layers</strong>
        <div className="timeline-ruler">
          {ticks.map((tick) => <span key={tick} style={{ left: `${((tick - start) / Math.max(1, end - start)) * 100}%` }}>{Math.round(tick)}</span>)}
          <input type="range" min={start} max={end} step="1" value={Math.min(end, Math.max(start, currentFrame))} onChange={(event) => seekFrame(Number(event.target.value))} aria-label="Timeline playhead"/>
          <i className="timeline-playhead" style={{ left: `${((currentFrame - start) / Math.max(1, end - start)) * 100}%` }}/>
        </div>
      </div>
      {layers.map((layer, index) => <LayerRow key={`${layer.ind ?? index}-${layer.nm ?? ''}`} layer={layer} index={index} selected={selectedLayerIndex === index} expanded={expanded.has(index)} onSelect={() => setSelectedLayerIndex(index)} onToggle={() => toggleLayer(index)} frame={currentFrame} start={start} end={end} setLayerTransform={setLayerTransform} seekFrame={seekFrame}/>)}
      {!layers.length && <div className="timeline-empty">This composition has no editable layers.</div>}
    </div>
  </section>
}
