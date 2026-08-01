import { useEffect, useRef, useState } from 'react'
import lottie from 'lottie-web'
import { Maximize2, Pause, Play, RotateCcw } from 'lucide-react'
import { useWorkspace } from '../state/WorkspaceContext'
import Button from './Button'

export default function Preview() {
  const { merged, replacements } = useWorkspace()
  const stage = useRef(null), animation = useRef(null)
  const [playing, setPlaying] = useState(true), [frame, setFrame] = useState(0), [total, setTotal] = useState(0)
  useEffect(() => {
    animation.current?.destroy()
    const instance = lottie.loadAnimation({ container: stage.current, renderer: 'svg', loop: true, autoplay: true, animationData: structuredClone(merged) })
    animation.current = instance
    const update = () => { setFrame(Math.round(instance.currentFrame)); setTotal(Math.round(instance.totalFrames || 0)) }
    instance.addEventListener('enterFrame', update); instance.addEventListener('DOMLoaded', update); setPlaying(true)
    return () => instance.destroy()
  }, [merged])
  const toggle = () => { if (playing) animation.current.pause(); else animation.current.play(); setPlaying(!playing) }
  return <section className="preview-panel panel">
    <div className="preview-heading"><div><p className="eyebrow">Live preview</p><h2>Composition</h2></div><span className="status-live"><span/> {Object.keys(replacements).length ? `${Object.keys(replacements).length} changes applied` : 'Original'}</span></div>
    <div className="preview-stage-wrap"><div ref={stage} className="preview-stage"/><Button className="fullscreen" variant="icon" icon={Maximize2} aria-label="Fullscreen" onClick={() => stage.current?.parentElement?.requestFullscreen?.()}/></div>
    <div className="playback"><Button variant="icon" icon={RotateCcw} aria-label="Restart" onClick={() => animation.current.goToAndPlay(0, true)}/><Button variant="icon" icon={playing ? Pause : Play} aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}/><input type="range" min="0" max={total || 1} value={frame} onChange={(event) => { const value = Number(event.target.value); setFrame(value); animation.current.goToAndStop(value, true); setPlaying(false) }}/><span className="frame-count">{frame} / {total}</span></div>
  </section>
}
