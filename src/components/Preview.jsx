import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Panzoom from '@panzoom/panzoom'
import { AlertTriangle, Maximize2, Minus, Move, Pause, Play, Plus, RotateCcw, Scan } from 'lucide-react'
import { useWorkspace } from '../state/WorkspaceContext'
import Button from './Button'

const MIN_ZOOM = 0.05
const MAX_ZOOM = 8
const MIN_VISIBLE_EDGE = 48

export default function Preview() {
  const { merged, replacements, notify } = useWorkspace()
  const viewport = useRef(null)
  const artboard = useRef(null)
  const stage = useRef(null)
  const animation = useRef(null)
  const panzoom = useRef(null)
  const [playing, setPlaying] = useState(true)
  const [frame, setFrame] = useState(0)
  const [total, setTotal] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [previewError, setPreviewError] = useState('')
  const [previewReady, setPreviewReady] = useState(false)
  const replacementCount = useMemo(() => Object.keys(replacements).length, [replacements])
  const width = Math.max(Number(merged.w) || 1, 1)
  const height = Math.max(Number(merged.h) || 1, 1)

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

    async function loadPreview() {
      try {
        const { default: lottie } = await import('lottie-web/build/player/esm/lottie_svg.min.js')
        if (disposed) return
        instance = lottie.loadAnimation({
          container: stage.current,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          animationData: structuredClone(merged),
          rendererSettings: { preserveAspectRatio: 'xMidYMid meet', clearCanvas: true },
        })
        animation.current = instance
        update = () => {
          const now = performance.now()
          if (now - lastFrameUpdate < 100) return
          lastFrameUpdate = now
          setFrame(Math.round(instance.currentFrame))
          setTotal(Math.round(instance.totalFrames || 0))
        }
        failed = () => {
          setPreviewError('The animation renderer could not load this composition.')
          setPreviewReady(false)
          notify('Preview could not render this Lottie file.', 'error')
        }
        instance.addEventListener('enterFrame', update)
        instance.addEventListener('DOMLoaded', update)
        instance.addEventListener('data_failed', failed)
        setPlaying(true)
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
        instance.removeEventListener('DOMLoaded', update)
        instance.removeEventListener('data_failed', failed)
        instance.destroy()
      }
      if (animation.current === instance) animation.current = null
    }
  }, [merged, notify])

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
    setPlaying(true)
  }

  const seek = (value) => {
    setFrame(value)
    animation.current?.goToAndStop(value, true)
    setPlaying(false)
  }

  return <section className="preview-panel panel" aria-label="Animation preview">
    <div className="preview-heading"><div><p className="eyebrow">Live preview</p><h2>Composition</h2></div><span className="status-live"><span/> {replacementCount ? `${replacementCount} changes applied` : 'Original'}</span></div>
    <div ref={viewport} className="preview-canvas" onDoubleClick={(event) => !event.target.closest('.panzoom-exclude') && fitCanvas()}>
      <div ref={artboard} className="preview-artboard" style={{ width, height, marginLeft: -width / 2, marginTop: -height / 2 }}><div ref={stage} className="preview-stage"/></div>
      {previewError && <div className="preview-error panzoom-exclude"><AlertTriangle size={24}/><strong>Preview unavailable</strong><span>{previewError}</span></div>}
      <div className="canvas-tools panzoom-exclude">
        <Button variant="icon" icon={Minus} aria-label="Zoom out" title="Zoom out" onClick={() => panzoom.current?.zoomOut({ animate: true })}/>
        <button type="button" className="zoom-value panzoom-exclude" onClick={() => fitCanvas()} title="Fit to view">{Math.round(zoom * 100)}%</button>
        <Button variant="icon" icon={Plus} aria-label="Zoom in" title="Zoom in" onClick={() => panzoom.current?.zoomIn({ animate: true })}/><span className="tool-divider"/>
        <Button variant="icon" icon={Scan} aria-label="Fit and center" title="Fit and center" onClick={() => fitCanvas()}/>
        <Button variant="icon" icon={Maximize2} aria-label="Fullscreen" title="Fullscreen" onClick={() => viewport.current?.requestFullscreen?.()}/>
      </div>
      <span className="canvas-hint"><Move size={13}/> Drag or pinch to move · Scroll to zoom · Double-click to fit</span>
    </div>
    <div className="playback"><Button variant="icon" icon={RotateCcw} disabled={!previewReady} aria-label="Restart animation" onClick={restart}/><Button variant="icon" icon={playing ? Pause : Play} disabled={!previewReady} aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}/><input aria-label="Animation frame" type="range" min="0" max={total || 1} value={Math.min(frame, total || 1)} disabled={!previewReady} onChange={(event) => seek(Number(event.target.value))}/><span className="frame-count">{frame} / {total}</span></div>
  </section>
}
