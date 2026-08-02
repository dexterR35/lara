import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Konva from 'konva'
import { Circle, Group, Image as KonvaImage, Layer, Line, Rect, Stage, Transformer } from 'react-konva'
import { AlertTriangle, Maximize2, Minus, Move, Pause, Play, Plus, Repeat, RotateCcw, Scan } from 'lucide-react'
import { assetSource, propertyValueAtFrame } from '../lib/lottie'
import { useWorkspace } from '../state/WorkspaceContext'
import Button from './Button'

const MIN_ZOOM = 0.05
const MAX_ZOOM = 8
const ZOOM_STEP = 1.16
const PRIMARY = '#e24848'

const clampZoom = (value) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
const rounded = (value) => Math.round(value * 100) / 100

function nodeCenter(node) {
  const bounds = node.getClientRect({ relativeTo: node.getLayer(), skipShadow: true, skipStroke: true })
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
}

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
    asset,
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
  const visualRefs = useRef(new Map())
  const imageCache = useRef(new Map())
  const hiddenSvgLayers = useRef(new Set())
  const pendingVisualCommit = useRef(false)
  const guideRefs = useRef(new Map())
  const interaction = useRef(null)
  const selectedLayerIndicesRef = useRef(selectedLayerIndices)
  const animation = useRef(null)
  const currentFrameRef = useRef(currentFrame)
  const [playing, setPlaying] = useState(false)
  const [looping, setLooping] = useState(true)
  const [previewError, setPreviewError] = useState('')
  const [previewReady, setPreviewReady] = useState(false)
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 })
  const [view, setView] = useState({ x: 0, y: 0, scale: 1 })
  const [motionGuides, setMotionGuides] = useState([])
  const [activeVisualIndices, setActiveVisualIndices] = useState([])
  const [, refreshImages] = useState(0)
  const replacementCount = useMemo(() => Object.keys(replacements).length, [replacements])
  const width = Math.max(Number(merged.w) || 1, 1)
  const height = Math.max(Number(merged.h) || 1, 1)
  const firstFrame = Number(source.ip) || 0
  const lastFrame = Number(source.op) || firstFrame + 1
  const editableLayers = useMemo(() => {
    const cache = new Map()
    return source.layers.map((layer, index) => {
      const starts = Number(layer.ip ?? firstFrame)
      const ends = Number(layer.op ?? lastFrame)
      const opacity = Number(propertyValueAtFrame(layer.ks?.o, currentFrame, 100))
      if (layer.hd || currentFrame < starts || currentFrame >= ends || opacity <= 0) return null
      const geometry = imageLayerBounds(layer, index, source.layers, source.assets || [], currentFrame, cache)
      return geometry ? { layer, index, bounds: geometry.attrs, parentTransform: geometry.parent, asset: geometry.asset, previewSrc: replacements[geometry.asset.id]?.dataUrl || assetSource(geometry.asset) } : null
    }).filter(Boolean)
  }, [currentFrame, firstFrame, lastFrame, replacements, source.assets, source.layers])
  const hitLayers = useMemo(() => [...editableLayers].reverse(), [editableLayers])
  const imageSourcesKey = editableLayers.map(({ previewSrc }) => previewSrc).join('|')
  const selectionKey = selectedLayerIndices.join(',')

  useEffect(() => { currentFrameRef.current = currentFrame }, [currentFrame])
  useEffect(() => { selectedLayerIndicesRef.current = selectedLayerIndices }, [selectedLayerIndices])
  useEffect(() => { if (!interaction.current) setMotionGuides([]) }, [selectionKey])

  useEffect(() => {
    let disposed = false
    editableLayers.forEach(({ previewSrc }) => {
      if (!previewSrc || imageCache.current.has(previewSrc)) return
      const image = new window.Image()
      const entry = { image, ready: false }
      imageCache.current.set(previewSrc, entry)
      image.onload = () => {
        entry.ready = true
        if (!disposed) refreshImages((version) => version + 1)
      }
      image.onerror = () => { entry.failed = true }
      image.src = previewSrc
    })
    return () => { disposed = true }
  }, [imageSourcesKey])

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
    let domReady
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
        const finishVisualCommit = () => {
          if (!pendingVisualCommit.current) return
          hiddenSvgLayers.current.forEach((element) => { element.style.visibility = '' })
          hiddenSvgLayers.current.clear()
          pendingVisualCommit.current = false
          setActiveVisualIndices([])
        }
        domReady = () => {
          ready()
          finishVisualCommit()
        }
        loadedImages = () => {
          instance.goToAndStop(Math.max(0, currentFrameRef.current - firstFrame), true)
          finishVisualCommit()
        }
        failed = () => {
          hiddenSvgLayers.current.forEach((element) => { element.style.visibility = '' })
          hiddenSvgLayers.current.clear()
          pendingVisualCommit.current = false
          setActiveVisualIndices([])
          setPreviewError('The animation renderer could not load this composition.')
          setPreviewReady(false)
          notify('Preview could not render this Lottie file.', 'error')
        }
        instance.addEventListener('enterFrame', update)
        instance.addEventListener('drawnFrame', update)
        instance.addEventListener('config_ready', ready)
        instance.addEventListener('data_ready', ready)
        instance.addEventListener('DOMLoaded', domReady)
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
        instance.removeEventListener('DOMLoaded', domReady)
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

  const syncVisualToNode = (entry) => {
    const visual = visualRefs.current.get(entry.item.index)
    if (!visual?.image()) return false
    visual.setAttrs({
      x: entry.node.x(),
      y: entry.node.y(),
      scaleX: entry.node.scaleX(),
      scaleY: entry.node.scaleY(),
      rotation: entry.node.rotation(),
      skewX: entry.node.skewX(),
      skewY: entry.node.skewY(),
      visible: true,
    })
    return true
  }

  const hideSvgLayer = (entry) => {
    const host = svgHost.current
    if (!host) return
    const sourceValue = entry.item.previewSrc
    const assetPath = String(entry.item.asset.p || '')
    const sameAssetBefore = source.layers.slice(0, entry.item.index).filter((layer) => layer.refId === entry.item.layer.refId).length
    const candidates = [...host.querySelectorAll('image')].filter((element) => {
      if (element.closest('defs')) return false
      const href = element.getAttribute('href') || element.getAttribute('xlink:href') || ''
      return href === sourceValue || href.endsWith(sourceValue) || (assetPath && href.endsWith(assetPath))
    })
    const element = candidates[sameAssetBefore] || candidates[0]
    if (!element) return
    element.style.visibility = 'hidden'
    hiddenSvgLayers.current.add(element)
  }

  const valuesAfterInteraction = (entry) => {
    const anchor = entry.anchor
    const local = entry.parentInverse.copy().multiply(entry.node.getTransform().copy())
    local.translate(Number(anchor[0]) || 0, Number(anchor[1]) || 0)
    const value = local.decompose()
    const finite = (candidate, fallback) => Number.isFinite(candidate) ? rounded(candidate) : Number(fallback) || 0
    const scale = (candidate, fallback) => {
      if (!Number.isFinite(candidate)) return Number(fallback) || 100
      const sign = candidate < 0 ? -1 : 1
      return rounded(sign * Math.min(10000, Math.max(.1, Math.abs(candidate * 100))))
    }
    return {
      position: [finite(value.x, entry.oldPosition[0]), finite(value.y, entry.oldPosition[1]), entry.oldPosition[2] || 0],
      scale: [scale(value.scaleX, entry.oldScale[0]), scale(value.scaleY, entry.oldScale[1]), entry.oldScale[2] ?? 100],
      rotation: finite(value.rotation, entry.oldRotation),
    }
  }

  const beginInteraction = (item, node) => {
    if (interaction.current) return
    const currentSelection = selectedLayerIndicesRef.current
    const indices = currentSelection.includes(item.index) ? currentSelection : [item.index]
    const items = new Map(editableLayers.map((editable) => [editable.index, editable]))
    const entries = indices.map((index) => {
      const editable = items.get(index)
      const target = nodeRefs.current.get(index)
      const layer = source.layers[index]
      if (!editable || !target || !layer) return null
      const center = nodeCenter(target)
      const oldPosition = propertyValueAtFrame(layer.ks?.p, currentFrame, [0, 0, 0])
      return {
        item: editable,
        node: target,
        guideStart: center,
        worldPoint: { x: target.x(), y: target.y() },
        anchor: propertyValueAtFrame(layer.ks?.a, currentFrame, [0, 0, 0]),
        oldPosition,
        oldScale: propertyValueAtFrame(layer.ks?.s, currentFrame, [100, 100, 100]),
        oldRotation: propertyValueAtFrame(layer.ks?.r, currentFrame, 0),
        parentInverse: editable.parentTransform.copy().invert(),
      }
    }).filter(Boolean)
    interaction.current = {
      activeIndex: item.index,
      activePoint: { x: node.x(), y: node.y() },
      entries,
    }
    const visualEntries = entries.filter(syncVisualToNode)
    setActiveVisualIndices(visualEntries.map((entry) => entry.item.index))
    visualEntries.forEach(hideSvgLayer)
    setMotionGuides(entries.map((entry) => ({ index: entry.item.index, start: entry.guideStart, end: entry.guideStart })))
    animation.current?.pause()
    setPlaying(false)
  }

  const moveSelection = (item, node) => {
    const current = interaction.current
    if (!current || current.activeIndex !== item.index) return
    const dx = node.x() - current.activePoint.x
    const dy = node.y() - current.activePoint.y
    if (current.entries.length > 1) {
      current.entries.forEach((entry) => {
        if (entry.item.index !== item.index) entry.node.position({ x: entry.worldPoint.x + dx, y: entry.worldPoint.y + dy })
      })
    }
    current.entries.forEach((entry) => {
      syncVisualToNode(entry)
      const guide = guideRefs.current.get(entry.item.index)
      const end = nodeCenter(entry.node)
      guide?.line?.points([entry.guideStart.x, entry.guideStart.y, end.x, end.y])
      guide?.end?.position(end)
    })
    transformerRef.current?.forceUpdate()
    transformerRef.current?.getLayer()?.batchDraw()
  }

  const commitPosition = () => {
    const current = interaction.current
    if (!current) return
    setMotionGuides(current.entries.map((entry) => ({ index: entry.item.index, start: entry.guideStart, end: nodeCenter(entry.node) })))
    pendingVisualCommit.current = true
    current.entries.forEach((entry) => setLayerTransform(entry.item.index, 'p', currentFrame, valuesAfterInteraction(entry).position, true))
    interaction.current = null
  }

  const commitTransform = () => {
    const current = interaction.current
    if (!current) return
    pendingVisualCommit.current = true
    current.entries.forEach((entry) => {
      const values = valuesAfterInteraction(entry)
      setLayerTransform(entry.item.index, 'p', currentFrame, values.position, true)
      setLayerTransform(entry.item.index, 's', currentFrame, values.scale, true)
      setLayerTransform(entry.item.index, 'r', currentFrame, values.rotation, true)
    })
    interaction.current = null
  }

  const beginSelectedTransform = () => {
    const index = selectedLayerIndices.at(-1)
    const item = editableLayers.find((candidate) => candidate.index === index)
    const node = nodeRefs.current.get(index)
    if (item && node) beginInteraction(item, node)
  }

  const transformSelection = () => {
    interaction.current?.entries.forEach(syncVisualToNode)
    transformerRef.current?.getLayer()?.batchDraw()
  }

  const selectFromPointer = (item, event) => {
    event.cancelBubble = true
    const additive = event.evt?.metaKey || event.evt?.ctrlKey || event.evt?.shiftKey
    const current = selectedLayerIndicesRef.current
    const next = additive
      ? current.includes(item.index) ? current.filter((index) => index !== item.index) : [...current, item.index]
      : [item.index]
    selectedLayerIndicesRef.current = next
    selectLayer(item.index, additive)
  }

  return <section className="preview-panel panel" aria-label="Animation preview">
    <div className="preview-heading"><div><p className="eyebrow">Live preview</p></div><span className="status-live"><span/> {replacementCount ? `${replacementCount} changes applied` : 'Original'}</span></div>
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
          {hitLayers.map((item) => {
            const cached = imageCache.current.get(item.previewSrc)
            return <KonvaImage
              {...item.bounds}
              key={`visual-${item.layer.ind ?? item.index}-${item.layer.refId}`}
              ref={(node) => node ? visualRefs.current.set(item.index, node) : visualRefs.current.delete(item.index)}
              image={cached?.ready ? cached.image : undefined}
              visible={activeVisualIndices.includes(item.index)}
              listening={false}
            />
          })}
          {motionGuides.map((guide) => {
            const distance = Math.hypot(guide.end.x - guide.start.x, guide.end.y - guide.start.y)
            return <Group key={`motion-${guide.index}`} listening={false} visible={distance > .5} ref={(node) => {
              if (!node) guideRefs.current.delete(guide.index)
              else guideRefs.current.set(guide.index, { line: node.findOne('.motion-line'), end: node.findOne('.motion-end') })
            }}>
              <Line name="motion-line" points={[guide.start.x, guide.start.y, guide.end.x, guide.end.y]} stroke={PRIMARY} strokeWidth={1.25 / view.scale} dash={[1.5 / view.scale, 5 / view.scale]} lineCap="round" opacity={.9}/>
              <Circle x={guide.start.x} y={guide.start.y} radius={3.5 / view.scale} fill="#111318" stroke="#ffffff" strokeWidth={1 / view.scale}/>
              <Circle name="motion-end" x={guide.end.x} y={guide.end.y} radius={3.5 / view.scale} fill={PRIMARY} stroke="#ffffff" strokeWidth={1 / view.scale}/>
            </Group>
          })}
          {hitLayers.map((item) => <Rect
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
            onTransform={transformSelection}
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
            boundBoxFunc={(oldBox, newBox) => {
              const minimum = 4 / view.scale
              const maximum = Math.max(width, height) * 20
              if (Math.abs(newBox.width) < minimum || Math.abs(newBox.height) < minimum || Math.abs(newBox.width) > maximum || Math.abs(newBox.height) > maximum) return oldBox
              return newBox
            }}
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
