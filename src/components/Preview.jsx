import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Panzoom from '@panzoom/panzoom'
import { AlertTriangle, Maximize2, Minus, Move, Pause, Play, Plus, RotateCcw, Scan } from 'lucide-react'
import { propertyValueAtFrame } from '../lib/lottie'
import { useWorkspace } from '../state/WorkspaceContext'
import Button from './Button'

const MIN_ZOOM = 0.05
const MAX_ZOOM = 8
const MIN_VISIBLE_EDGE = 48

export default function Preview() {
  const { merged, source, replacements, notify, selectedLayerIndex, setSelectedLayerIndex, currentFrame, setCurrentFrame, seekFrame, timelineOpen, setLayerTransform } = useWorkspace()
  const viewport = useRef(null)
  const artboard = useRef(null)
  const stage = useRef(null)
  const animation = useRef(null)
  const panzoom = useRef(null)
  const layerDrag = useRef(null)
  const currentFrameRef = useRef(currentFrame)
  const [playing, setPlaying] = useState(false)
  const [dragPosition, setDragPosition] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [previewError, setPreviewError] = useState('')
  const [previewReady, setPreviewReady] = useState(false)
  const replacementCount = useMemo(() => Object.keys(replacements).length, [replacements])
  const width = Math.max(Number(merged.w) || 1, 1)
  const height = Math.max(Number(merged.h) || 1, 1)
  const firstFrame = Number(source.ip) || 0
  const lastFrame = Number(source.op) || firstFrame + 1

  useEffect(() => { currentFrameRef.current = currentFrame }, [currentFrame])

  const fitCanvas = useCallback((animate = true) => {
    if (!viewport.current || !panzoom.current) return
    const bounds = viewport.current.getBoundingClientRect()
    const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((bounds.width - 64) / width, (bounds.height - 64) / height)))
    panzoom.current.setOptions({ startScale: scale, startX: 0, startY: 0 })
    panzoom.current.reset({ animate })
  }, [height, width])

  useEffect(() => {
    const viewportElement = viewport.current
    const artboardElement = artboard.current
    const instance = Panzoom(artboardElement, {
      canvas: true,
      minScale: MIN_ZOOM,
      maxScale: MAX_ZOOM,
      step: 0.18,
      duration: 180,
      easing: 'cubic-bezier(.2,.8,.2,1)',
      cursor: 'grab',
      excludeClass: 'panzoom-exclude',
    })
    panzoom.current = instance
    let correctingBounds = false
    const wheel = (event) => {
      if (!event.target.closest('.panzoom-exclude')) instance.zoomWithWheel(event)
    }
    const changed = (event) => {
      setZoom(event.detail.scale)
      if (correctingBounds) return

      const canvasBounds = viewportElement.getBoundingClientRect()
      const assetBounds = artboardElement.getBoundingClientRect()
      const visibleX = Math.min(MIN_VISIBLE_EDGE, assetBounds.width)
      const visibleY = Math.min(MIN_VISIBLE_EDGE, assetBounds.height)
      let shiftX = 0
      let shiftY = 0

      if (assetBounds.right < canvasBounds.left + visibleX) shiftX = canvasBounds.left + visibleX - assetBounds.right
      else if (assetBounds.left > canvasBounds.right - visibleX) shiftX = canvasBounds.right - visibleX - assetBounds.left
      if (assetBounds.bottom < canvasBounds.top + visibleY) shiftY = canvasBounds.top + visibleY - assetBounds.bottom
      else if (assetBounds.top > canvasBounds.bottom - visibleY) shiftY = canvasBounds.bottom - visibleY - assetBounds.top

      if (shiftX || shiftY) {
        correctingBounds = true
        instance.pan(event.detail.x + shiftX / event.detail.scale, event.detail.y + shiftY / event.detail.scale, { animate: false, force: true })
        requestAnimationFrame(() => { correctingBounds = false })
      }
    }
    viewportElement.addEventListener('wheel', wheel, { passive: false })
    artboardElement.addEventListener('panzoomchange', changed)
    const fitFrame = requestAnimationFrame(() => fitCanvas(false))
    return () => {
      cancelAnimationFrame(fitFrame)
      viewportElement.removeEventListener('wheel', wheel)
      artboardElement.removeEventListener('panzoomchange', changed)
      instance.destroy()
      if (panzoom.current === instance) panzoom.current = null
    }
  }, [fitCanvas])

  useEffect(() => {
    setPreviewError('')
    setPreviewReady(false)
    let disposed = false
    let instance
    let lastFrameUpdate = 0
    let update
    let failed
    let ready

    async function loadPreview() {
      try {
        const { default: lottie } = await import('lottie-web/build/player/esm/lottie_svg.min.js')
        if (disposed) return
        instance = lottie.loadAnimation({
          container: stage.current,
          renderer: 'svg',
          loop: true,
          autoplay: false,
          animationData: structuredClone(merged),
          rendererSettings: { preserveAspectRatio: 'xMidYMid meet', clearCanvas: true },
        })
        animation.current = instance
        update = () => {
          const now = performance.now()
          if (now - lastFrameUpdate < 100) return
          lastFrameUpdate = now
          setCurrentFrame(firstFrame + instance.currentFrame)
        }
        failed = () => {
          setPreviewError('The animation renderer could not load this composition.')
          setPreviewReady(false)
          notify('Preview could not render this Lottie file.', 'error')
        }
        instance.addEventListener('enterFrame', update)
        ready = () => {
          instance.goToAndStop(Math.max(0, currentFrameRef.current - firstFrame), true)
          update()
        }
        instance.addEventListener('DOMLoaded', ready)
        instance.addEventListener('data_failed', failed)
        setPlaying(false)
        setPreviewReady(true)
      } catch (error) {
        if (disposed) return
        setPreviewError(error.message || 'The preview could not be created.')
        setPreviewReady(false)
        notify('Preview could not render this Lottie file.', 'error')
        animation.current = null
      }
    }

    loadPreview()
    return () => {
      disposed = true
      if (instance) {
        instance.removeEventListener('enterFrame', update)
        instance.removeEventListener('DOMLoaded', ready)
        instance.removeEventListener('data_failed', failed)
        instance.destroy()
      }
      if (animation.current === instance) animation.current = null
    }
  }, [firstFrame, merged, notify, setCurrentFrame])

  useEffect(() => {
    const onSeek = (event) => {
      animation.current?.goToAndStop(Math.max(0, Number(event.detail) - firstFrame), true)
      setPlaying(false)
    }
    window.addEventListener('lara:seek', onSeek)
    return () => window.removeEventListener('lara:seek', onSeek)
  }, [firstFrame])

  useEffect(() => {
    const observer = new ResizeObserver(() => fitCanvas(false))
    if (viewport.current) observer.observe(viewport.current)
    return () => observer.disconnect()
  }, [fitCanvas])

  const toggle = () => {
    const instance = animation.current
    if (!instance) return
    if (playing) instance.pause()
    else instance.play()
    setPlaying(!playing)
  }

  const restart = () => {
    animation.current?.goToAndPlay(0, true)
    setCurrentFrame(firstFrame)
    setPlaying(true)
  }

  const seek = (value) => {
    seekFrame(value)
  }

  const startLayerDrag = (event) => {
    if (!timelineOpen || event.button !== 0) return
    const named = event.target.closest?.('[data-name]')?.getAttribute('data-name')
    const namedIndex = named ? source.layers.findIndex((layer) => layer.nm === named) : -1
    const renderedIndex = animation.current?.renderer?.elements?.findIndex?.((element) => element?.baseElement?.contains?.(event.target)) ?? -1
    const layerIndex = namedIndex >= 0 ? namedIndex : renderedIndex >= 0 ? renderedIndex : selectedLayerIndex
    if (layerIndex == null || !source.layers[layerIndex]) return
    const layer = source.layers[layerIndex]
    const position = propertyValueAtFrame(layer.ks?.p, currentFrame, [0, 0, 0])
    const rendered = animation.current?.renderer?.elements?.[layerIndex]?.baseElement || event.target.closest?.('g')
    setSelectedLayerIndex(layerIndex)
    layerDrag.current = { layerIndex, startX: event.clientX, startY: event.clientY, position, rendered }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    event.preventDefault()
  }

  const moveLayer = (event) => {
    const drag = layerDrag.current
    if (!drag) return
    const dx = (event.clientX - drag.startX) / Math.max(zoom, .001)
    const dy = (event.clientY - drag.startY) / Math.max(zoom, .001)
    const next = [roundPosition(drag.position[0] + dx), roundPosition(drag.position[1] + dy), drag.position[2] || 0]
    drag.next = next
    if (drag.rendered) drag.rendered.style.translate = `${dx}px ${dy}px`
    setDragPosition(next)
  }

  const finishLayerDrag = () => {
    const drag = layerDrag.current
    if (!drag) return
    if (drag.rendered) drag.rendered.style.translate = ''
    if (drag.next) setLayerTransform(drag.layerIndex, 'p', currentFrame, drag.next, true)
    layerDrag.current = null
    setDragPosition(null)
  }

  return <section className="preview-panel panel" aria-label="Animation preview">
    <div className="preview-heading"><div><p className="eyebrow">Live preview</p><h2>Composition</h2></div><span className="status-live"><span/> {replacementCount ? `${replacementCount} changes applied` : 'Original'}</span></div>
    <div ref={viewport} className={`preview-canvas ${timelineOpen ? 'is-layer-editing' : ''}`} onDoubleClick={(event) => !event.target.closest('.panzoom-exclude') && fitCanvas()}>
      <div ref={artboard} className="preview-artboard" style={{ width, height, marginLeft: -width / 2, marginTop: -height / 2 }} onPointerDown={startLayerDrag} onPointerMove={moveLayer} onPointerUp={finishLayerDrag} onPointerCancel={finishLayerDrag}><div ref={stage} className="preview-stage panzoom-exclude"/></div>
      {previewError && <div className="preview-error panzoom-exclude"><AlertTriangle size={24}/><strong>Preview unavailable</strong><span>{previewError}</span></div>}
      <div className="canvas-tools panzoom-exclude">
        <Button variant="icon" icon={Minus} aria-label="Zoom out" title="Zoom out" onClick={() => panzoom.current?.zoomOut({ animate: true })}/>
        <button type="button" className="zoom-value panzoom-exclude" onClick={() => fitCanvas()} title="Fit to view">{Math.round(zoom * 100)}%</button>
        <Button variant="icon" icon={Plus} aria-label="Zoom in" title="Zoom in" onClick={() => panzoom.current?.zoomIn({ animate: true })}/><span className="tool-divider"/>
        <Button variant="icon" icon={Scan} aria-label="Fit and center" title="Fit and center" onClick={() => fitCanvas()}/>
        <Button variant="icon" icon={Maximize2} aria-label="Fullscreen" title="Fullscreen" onClick={() => viewport.current?.requestFullscreen?.()}/>
      </div>
      <span className="canvas-hint"><Move size={13}/> Drag or pinch to move · Scroll to zoom · Double-click to fit</span>
      {dragPosition && <span className="layer-position-readout">X {dragPosition[0]} · Y {dragPosition[1]} · keyframe {Math.round(currentFrame)}</span>}
    </div>
    <div className="playback"><Button variant="icon" icon={RotateCcw} disabled={!previewReady} aria-label="Restart animation" onClick={restart}/><Button variant="icon" icon={playing ? Pause : Play} disabled={!previewReady} aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}/><input aria-label="Animation frame" type="range" min={firstFrame} max={lastFrame} value={Math.min(lastFrame, currentFrame)} disabled={!previewReady} onChange={(event) => seek(Number(event.target.value))}/><span className="frame-count">{Math.round(currentFrame)} / {Math.round(lastFrame)}</span></div>
  </section>
}

const roundPosition = (value) => Math.round(value * 10) / 10
