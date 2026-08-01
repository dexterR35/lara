import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { FileJson, FolderOpen, UploadCloud } from 'lucide-react'
import Button from './Button'

export default function Dropzone({ onFile }) {
  const load = useCallback(([file]) => {
    if (!file) return
    onFile(file).catch((error) => window.dispatchEvent(new CustomEvent('lara:error', { detail: error.message })))
  }, [onFile])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDropAccepted: load,
    onDropRejected: () => window.dispatchEvent(new CustomEvent('lara:error', { detail: 'Choose a .json or .lottie file up to 10 MB.' })),
    accept: { 'application/json': ['.json', '.lottie'], 'text/json': ['.json'], 'application/zip': ['.lottie'], 'application/octet-stream': ['.lottie'] },
    maxSize: 10 * 1024 * 1024,
    multiple: false,
    noClick: true,
  })

  return <section {...getRootProps({ className: `welcome-dropzone ${isDragActive ? 'is-dragging' : ''}` })}>
    <div className="welcome-icon"><FileJson size={28}/></div><p className="eyebrow">Your private Lottie workspace</p>
    <h1>Lottie Asset Extractor</h1>
    <p className="welcome-copy">Open a Lottie JSON or dotLottie file</p>
    <div className="welcome-actions"><Button variant="primary" icon={FolderOpen} onClick={open}>Choose Lottie file</Button><span><br></br><UploadCloud size={16}/> or drop it here</span></div>
    <input {...getInputProps()}/>
    <div className="privacy-note"><span/> Files never leave your browser</div>
  </section>
}
