import { useRef, useState } from 'react'
import { FileJson, FolderOpen, UploadCloud } from 'lucide-react'
import Button from './Button'

export default function Dropzone({ onFile }) {
  const input = useRef(null)
  const [dragging, setDragging] = useState(false)
  const handle = (file) => file && onFile(file).catch((error) => window.dispatchEvent(new CustomEvent('lara:error', { detail: error.message })))
  return <section className={`welcome-dropzone ${dragging ? 'is-dragging' : ''}`}
    onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)}
    onDrop={(event) => { event.preventDefault(); setDragging(false); handle([...event.dataTransfer.files].find((file) => file.name.endsWith('.json'))) }}>
    <div className="welcome-icon"><FileJson size={28}/></div><p className="eyebrow">Your private Lottie workspace</p>
    <h1>Bring your animation.<br/>Make every asset yours.</h1>
    <p className="welcome-copy">Open a Lottie JSON to inspect, replace, preview, and package its image assets—all locally in your browser.</p>
    <div className="welcome-actions"><Button variant="primary" icon={FolderOpen} onClick={() => input.current.click()}>Choose JSON</Button><span><UploadCloud size={16}/> or drop it here</span></div>
    <input ref={input} hidden type="file" accept=".json,application/json" onChange={(event) => handle(event.target.files[0])}/>
    <div className="privacy-note"><span/> Files never leave your browser</div>
  </section>
}
