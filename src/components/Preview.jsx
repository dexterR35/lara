import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Konva from 'konva'
import { Layer, Rect, Stage, Transformer } from 'react-konva'
import { AlertTriangle, Maximize2, Minus, Move, Pause, Play, Plus, Repeat, RotateCcw, Scan } from 'lucide-react'
import { propertyValueAtFrame } from '../lib/lottie'
import { useWorkspace } from '../state/WorkspaceContext'
import Button from './Button'

const MIN_ZOOM = 0.05
const MAX_ZOOM = 8
const ZOOM_STEP = 1.16
const PRIMARY = '#e24848'

const clampZoom = (value) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
const rounded = (value) => Math.round(value * 100) / 100

function layerTransform(layer, frame) {
  const position = propertyValueAtFrame(layer.ks?.p, frame, [0, 0, 0])
  const anchor = propertyValueAtFrame(layer.ks?.a, frame, [0, 0, 0])
  const scale = propertyValueAtFrame(layer.ks?.s, frame, [100, 100, 100])
  const transform = new Konva.Transform()
  transform.translate(Number(position[0]) || 0, Number(position[1]) || 0)
  transform.rotate((Number(propertyValueAtFrame(layer.ks?.r, frame, 0)) || 0) * Math.PI / 180)
  transform.scale((Number(scale[0]) || 0) / 100, (Number(scale[1]) || 0) / 100)
  transform.translate(-(Number(anchor[0]) || 0), -(Number(anchor[1]) || 0))
  return transform
}

function worldTransform(index, layers, frame, cache) {
  if (cache.has(index)) return cache.get(index)
  const layer = layers[index]
  const parentIndex = layer?.parent == null ? -1 : layers.findIndex((candidate) => candidate.ind === layer.parent)
  const parent = parentIndex >= 0 ? worldTransform(parentIndex, layers, frame, cache).world : new Konva.Transform()
  const world = parent.copy().multiply(layerTransform(layer, frame))
  const result = { world, parent }
  cache.set(index, result)
  return result
}

function imageLayerBounds(layer, index, layers, assets, frame, cache) {
  const asset = assets.find((item) => item.id === layer.refId)
  if (!asset || Array.isArray(asset.layers)) return null
  const { world, parent } = worldTransform(index, layers, frame, cache)
  const decomposed = world.decompose()
  return {
    attrs: {
      x: decomposed.x,
      y: decomposed.y,
      width: Math.max(1, Number(asset.w) || 1),
      height: Math.max(1, Number(asset.h) || 1),
      scaleX: decomposed.scaleX,
      scaleY: decomposed.scaleY,
      rotation: decomposed.rotation,
      skewX: decomposed.skewX,
      skewY: decomposed.skewY,
    },
    parent,
  }
}

export default function Preview() {
  const {
    merged,
    source,
    replacements,
    notify,
    selectedLayerIndices,
    selectLayer,
    selectAllLayers,
    hoveredLayerIndex,
    setHoveredLayerIndex,
    currentFrame,
    setCurrentFrame,
    seekFrame,
    timelineOpen,
    setLayerTransform,
  } = useWorkspace()
  const viewport = useRef(null)
  const svgHost = useRef(null)
  const stageRef = useRef(null)
  const transformerRef = useRef(null)
  const nodeRefs = useRef(new Map())
  const interaction = useRef(null)
  const animation = useRef(null)
  const currentFrameRef = useRef(currentFrame)
  const [playing, setPlaying] = useState(false)
  const [looping, setLooping] = useState(true)
  const [previewError, setPreviewError] = useState('')
  const [previewReady, setPreviewReady] = useState(false)
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 })
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 })
  const replacementCount = useMemo(() => Object.keys(replacements).length, [replacements])
  const width = Math.max(Number(merged.w) || 1, 1)
  const height = Math.max(Number(merged.h) || 1, 1)
  const firstFrame = Number(source.ip) || 0
  const lastFrame = Number(source.op) || firstFrame + 1
  const editableLayers = useMemo(() => {
    const cache = new Map()
    return source.layers.map((layer, index) => {
      const geometry = imageLayerBounds(layer, index, source.layers, source.assets || [], currentFrame, cache)
      return geometry ? { layer, index, bounds: geometry.attrs, parentTransform: geometry.parent } : null
    }).filter(Boolean)
  }, [currentFrame, source.assets, source.layers])

  useEffect(() => { currentFrameRef.current = currentFrame }, [currentFrame])

  const fitCanvas = useCallback(() => {
    const scale = clampZoom(Math.min((viewportSize.width - 64) / width, (viewportSize.height - 64) / height))
    setView({
      scale,
      x: (viewportSize.width - width * scale) / 2,
      y: (viewportSize.height - height * scale) / 2,
    })
  }, [height, viewportSize.height, viewportSize.width, width])

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const next = { width: Math.max(1, entry.contentRect.width), height: Math.max(1, entry.contentRect.height) }
      setViewportSize(next)
    })
    if (viewport.current) observer.observe(viewport.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => { fitCanvas() }, [fitCanvas])

  useEffect(() => {
    setPreviewError('')
    setPreviewReady(false)
    let disposed = false
    let instance
    let update
    let ready
    let loadedImages
    let failed
    let lastFrameUpdate = 0
    let initialized = false

    async function loadPreview() {
      try {
        const { default: lottie } = await import('lottie-web/build/player/esm/lottie_svg.min.js')
        if (disposed) return
        instance = lottie.loadAnimation({
          container: svgHost.current,
          renderer: 'svg',
          loop: looping,
          autoplay: true,
          animationData: structuredClone(merged),
          rendererSettings: { preserveAspectRatio: 'xMidYMid meet', clearCanvas: true },
        })
        animation.current = instance
        update = () => {
          if (!initialized) {
            initialized = true
            instance.pause()
            instance.goToAndStop(Math.max(0, currentFrameRef.current - firstFrame), true)
            setPreviewReady(true)
          }
          const now = performance.now()
          if (now - lastFrameUpdate < 80) return
          lastFrameUpdate = now
          setCurrentFrame(firstFrame + instance.currentFrame)
        }
        ready = () => {
          instance.goToAndStop(Math.max(0, currentFrameRef.current - firstFrame), true)
          setPreviewReady(true)
        }
        loadedImages = () => {
          instance.goToAndStop(Math.max(0, currentFrameRef.current - firstFrame), true)
        }
        failed = () => {
          setPreviewError('The animation renderer could not load this composition.')
          setPreviewReady(false)
          notify('Preview could not render this Lottie file.', 'error')
        }
        instance.addEventListener('enterFrame', update)
        instance.addEventListener('drawnFrame', update)
        instance.addEventListener('config_ready', ready)
        instance.addEventListener('data_ready', ready)
        instance.addEventListener('DOMLoaded', ready)
        instance.addEventListener('loaded_images', loadedImages)
        instance.addEventListener('data_failed', failed)
        setPlaying(false)
      } catch (error) {
        if (disposed) return
        setPreviewError(error.message || 'The preview could not be created.')
        setPreviewReady(false)
        notify('Preview could not render this Lottie file.', 'error')
      }
    }

    loadPreview()
    return () => {
      disposed = true
      if (instance) {
        instance.removeEventListener('enterFrame', update)
        instance.removeEventListener('drawnFrame', update)
        instance.removeEventListener('config_ready', ready)
        instance.removeEventListener('data_ready', ready)
        instance.removeEventListener('DOMLoaded', ready)
        instance.removeEventListener('loaded_images', loadedImages)
        instance.removeEventListener('data_failed', failed)
        instance.destroy()
      }
      if (animation.current === instance) animation.current = null
    }
  }, [firstFrame, height, merged, notify, setCurrentFrame, width])

  useEffect(() => {
    const onSeek = (event) => {
      animation.current?.goToAndStop(Math.max(0, Number(event.detail) - firstFrame), true)
      setPlaying(false)
    }
    window.addEventListener('lara:seek', onSeek)
    return () => window.removeEventListener('lara:seek', onSeek)
  }, [firstFrame])

  useEffect(() => {
    const transformer = transformerRef.current
    const nodes = timelineOpen ? selectedLayerIndices.map((index) => nodeRefs.current.get(index)).filter(Boolean) : []
    transformer?.nodes(nodes)
    transformer?.getLayer()?.batchDraw()
  }, [editableLayers, selectedLayerIndices, timelineOpen])

  useEffect(() => {
    const handleShortcut = (event) => {
      if (!timelineOpen || !(event.ctrlKey || event.metaKey)) return
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return
      const key = event.key.toLowerCase()
      if (key === 'a') {
        event.preventDefault()
        selectAllLayers(editableLayers.map(({ index }) => index))
      } else if (key === '+' || key === '=') {
        event.preventDefault()
        zoomCenter(ZOOM_STEP)
      } else if (key === '-') {
        event.preventDefault()
        zoomCenter(1 / ZOOM_STEP)
      } else if (key === '0') {
        event.preventDefault()
        fitCanvas()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  })

  const zoomAt = useCallback((point, nextScale) => {
    const scale = clampZoom(nextScale)
    setView((current) => {
      const world = { x: (point.x - current.x) / current.scale, y: (point.y - current.y) / current.scale }
      return { scale, x: point.x - world.x * scale, y: point.y - world.y * scale }
    })
  }, [])

  const handleWheel = (event) => {
    if (!(event.evt.ctrlKey || event.evt.metaKey)) return
    event.evt.preventDefault()
    const stage = stageRef.current
    const pointer = stage?.getPointerPosition()
    if (!pointer) return
    const direction = event.evt.deltaY > 0 ? -1 : 1
    zoomAt(pointer, view.scale * (direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP))
  }

  const zoomCenter = (factor) => zoomAt({ x: viewportSize.width / 2, y: viewportSize.height / 2 }, view.scale * factor)

  const toggle = () => {
    if (!animation.current) return
    if (playing) animation.current.pause()
    else animation.current.play()
    setPlaying(!playing)
  }

  const toggleLoop = () => {
    setLooping((current) => {
      const next = !current
      if (animation.current) animation.current.loop = next
      return next
    })
  }

  const restart = () => {
    animation.current?.goToAndPlay(0, true)
    setCurrentFrame(firstFrame)
    setPlaying(true)
  }

  const beginInteraction = (item, node) => {
    if (interaction.current) return
    const indices = selectedLayerIndices.includes(item.index) ? selectedLayerIndices : [item.index]
    const items = new Map(editableLayers.map((editable) => [editable.index, editable]))
    const entries = indices.map((index) => {
      const editable = items.get(index)
      const target = nodeRefs.current.get(index)
      const layer = source.layers[index]
      if (!editable || !target || !layer) return null
      return {
        item: editable,
        node: target,
        worldPoint: { x: target.x(), y: target.y() },
        position: propertyValueAtFrame(layer.ks?.p, currentFrame, [0, 0, 0]),
        oldScale: propertyValueAtFrame(layer.ks?.s, currentFrame, [100, 100, 100]),
        parentInverse: editable.parentTransform.copy().invert(),
        parentDecomposition: editable.parentTransform.decompose(),
      }
    }).filter(Boolean)
    interaction.current = {
      activeIndex: item.index,
      activePoint: { x: node.x(), y: node.y() },
      entries,
    }
    animation.current?.pause()
    setPlaying(false)
  }

  const localPositionAfterInteraction = (entry) => {
    const from = entry.parentInverse.point(entry.worldPoint)
    const to = entry.parentInverse.point({ x: entry.node.x(), y: entry.node.y() })
    return [rounded(entry.position[0] + to.x - from.x), rounded(entry.position[1] + to.y - from.y), entry.position[2] || 0]
  }

  const moveSelection = (item, node) => {
    const current = interaction.current
    if (!current || current.activeIndex !== item.index || current.entries.length < 2) return
    const dx = node.x() - current.activePoint.x
    const dy = node.y() - current.activePoint.y
    current.entries.forEach((entry) => {
      if (entry.item.index !== item.index) entry.node.position({ x: entry.worldPoint.x + dx, y: entry.worldPoint.y + dy })
    })
    transformerRef.current?.forceUpdate()
  }

  const commitPosition = () => {
    const current = interaction.current
    if (!current) return
    current.entries.forEach((entry) => setLayerTransform(entry.item.index, 'p', currentFrame, localPositionAfterInteraction(entry), true))
    interaction.current = null
  }

  const commitTransform = () => {
    const current = interaction.current
    if (!current) return
    current.entries.forEach((entry) => {
      const parent = entry.parentDecomposition
      setLayerTransform(entry.item.index, 'p', currentFrame, localPositionAfterInteraction(entry), true)
      setLayerTransform(entry.item.index, 's', currentFrame, [rounded(entry.node.scaleX() / Math.max(Math.abs(parent.scaleX), .0001) * 100), rounded(entry.node.scaleY() / Math.max(Math.abs(parent.scaleY), .0001) * 100), entry.oldScale[2] ?? 100], true)
      setLayerTransform(entry.item.index, 'r', currentFrame, rounded(entry.node.rotation() - parent.rotation), true)
    })
    interaction.current = null
  }

  const beginSelectedTransform = () => {
    const index = selectedLayerIndices.at(-1)
    const item = editableLayers.find((candidate) => candidate.index === index)
    const node = nodeRefs.current.get(index)
    if (item && node) beginInteraction(item, node)
  }

  const selectFromPointer = (item, event) => {
    event.cancelBubble = true
    const additive = event.evt?.metaKey || event.evt?.ctrlKey || event.evt?.shiftKey
    if (additive) selectLayer(item.index, true)
    else if (!selectedLayerIndices.includes(item.index)) selectLayer(item.index)
  }

  return <section className="preview-panel panel" aria-label="Animation preview">
    <div className="preview-heading"><div><p className="eyebrow">Live preview</p><h2>Composition</h2></div><span className="status-live"><span/> {replacementCount ? `${replacementCount} changes applied` : 'Original'}</span></div>
    <div ref={viewport} className={`preview-canvas konva-preview ${timelineOpen ? 'is-layer-editing' : ''}`}>
      <div ref={svgHost} className="lottie-svg-host" style={{ width, height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}/>
      <Stage
        ref={stageRef}
        width={viewportSize.width}
        height={viewportSize.height}
        x={view.x}
        y={view.y}
        scaleX={view.scale}
        scaleY={view.scale}
        draggable={false}
        onWheel={handleWheel}
      >
        <Layer>
          {editableLayers.map((item) => <Rect
            {...item.bounds}
            key={`${item.layer.ind ?? item.index}-${item.layer.refId}`}
            ref={(node) => node ? nodeRefs.current.set(item.index, node) : nodeRefs.current.delete(item.index)}
            fill="rgba(226,72,72,0.001)"
            stroke={selectedLayerIndices.includes(item.index) ? PRIMARY : hoveredLayerIndex === item.index ? 'rgba(226,72,72,.75)' : 'transparent'}
            strokeWidth={selectedLayerIndices.includes(item.index) ? 1 / Math.max(view.scale, .65) : hoveredLayerIndex === item.index ? .8 / Math.max(view.scale, .65) : 0}
            draggable={timelineOpen}
            onMouseEnter={() => { setHoveredLayerIndex(item.index); if (stageRef.current) stageRef.current.container().style.cursor = 'move' }}
            onMouseLeave={() => { setHoveredLayerIndex((current) => current === item.index ? null : current); if (stageRef.current) stageRef.current.container().style.cursor = 'default' }}
            onMouseDown={(event) => selectFromPointer(item, event)}
            onTouchStart={(event) => selectFromPointer(item, event)}
            onDragStart={(event) => { event.cancelBubble = true; beginInteraction(item, event.target) }}
            onDragMove={(event) => { event.cancelBubble = true; moveSelection(item, event.target) }}
            onDragEnd={(event) => { event.cancelBubble = true; commitPosition() }}
          />)}
          <Transformer
            ref={transformerRef}
            onTransformStart={beginSelectedTransform}
            onTransform={() => transformerRef.current?.getLayer()?.batchDraw()}
            onTransformEnd={commitTransform}
            onMouseEnter={() => setHoveredLayerIndex(selectedLayerIndices.at(-1) ?? null)}
            onMouseLeave={() => setHoveredLayerIndex(null)}
            rotateEnabled
            flipEnabled={false}
            enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
            borderStroke={PRIMARY}
            anchorFill="#ffffff"
            anchorStroke={PRIMARY}
            anchorCornerRadius={0}
            anchorSize={7 / Math.max(view.scale, .65)}
            anchorStrokeWidth={1 / Math.max(view.scale, .65)}
            borderStrokeWidth={1 / Math.max(view.scale, .65)}
            rotateAnchorOffset={20 / Math.max(view.scale, .65)}
            anchorStyleFunc={(anchor) => anchor.hitStrokeWidth(18 / view.scale)}
            keepRatio={false}
          />
        </Layer>
      </Stage>
      {previewError && <div className="preview-error"><AlertTriangle size={24}/><strong>Preview unavailable</strong><span>{previewError}</span></div>}
      <div className="canvas-tools">
        <Button variant="icon" icon={Minus} aria-label="Zoom out" title="Zoom out" onClick={() => zoomCenter(1 / ZOOM_STEP)}/>
        <button type="button" className="zoom-value" onClick={fitCanvas} title="Fit to view">{Math.round(view.scale * 100)}%</button>
        <Button variant="icon" icon={Plus} aria-label="Zoom in" title="Zoom in" onClick={() => zoomCenter(ZOOM_STEP)}/><span className="tool-divider"/>
        <Button variant="icon" icon={Scan} aria-label="Fit and center" title="Fit and center" onClick={fitCanvas}/>
        <Button variant="icon" icon={Maximize2} aria-label="Fullscreen" title="Fullscreen" onClick={() => viewport.current?.requestFullscreen?.()}/>
      </div>
      <span className="canvas-hint"><Move size={13}/>{timelineOpen ? 'Drag layers · Ctrl/Cmd-click selects multiple · Ctrl/Cmd + wheel or +/− zooms' : 'Fixed preview · Ctrl/Cmd + wheel or +/− zooms'}</span>
    </div>
    <div className="playback">
      <Button variant="icon" icon={RotateCcw} disabled={!previewReady} aria-label="Restart animation" onClick={restart}/>
      <Button variant="icon" className={playing ? 'is-active' : ''} icon={playing ? Pause : Play} disabled={!previewReady} aria-label={playing ? 'Pause' : 'Play'} aria-pressed={playing} onClick={toggle}/>
      <Button variant="icon" className={looping ? 'is-active' : ''} icon={Repeat} disabled={!previewReady} aria-label={looping ? 'Disable loop' : 'Enable loop'} aria-pressed={looping} onClick={toggleLoop}/>
      <input aria-label="Animation frame" type="range" min={firstFrame} max={lastFrame} value={Math.min(lastFrame, currentFrame)} disabled={!previewReady} onChange={(event) => seekFrame(Number(event.target.value))}/>
      <span className="frame-count">{Math.round(currentFrame)} / {Math.round(lastFrame)}</span>
    </div>
  </section>
}
