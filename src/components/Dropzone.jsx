import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { FileJson, FolderOpen, UploadCloud } from 'lucide-react'
import { MAX_LOTTIE_FILE_SIZE } from '../lib/lottie'
import Button from './Button'

export default function Dropzone({ onFile }) {
  const load = useCallback(([file]) => {
    if (!file) return
    onFile(file).catch((error) => window.dispatchEvent(new CustomEvent('lara:error', { detail: error.message })))
  }, [onFile])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDropAccepted: load,
    onDropRejected: () => window.dispatchEvent(new CustomEvent('lara:error', { detail: 'Choose a .json or .lottie file up to 50 MB.' })),
    accept: { 'application/json': ['.json', '.lottie'], 'text/json': ['.json'], 'application/zip': ['.lottie'], 'application/octet-stream': ['.lottie'] },
    maxSize: MAX_LOTTIE_FILE_SIZE,
    multiple: false,
    noClick: true,
  })

  return <section {...getRootProps({ className: `welcome-dropzone ${isDragActive ? 'is-dragging' : ''}` })}>
    {/* <div className="welcome-icon"><FileJson size={28}/></div><p className="eyebrow">Design v1</p> */}
    <h1>Lottie Asset Extractor</h1>
    <p className="welcome-copy">Open a Lottie JSON or dotLottie file</p>
    <p className="welcome-copy flex items-center gap-2"> <UploadCloud size={16}/> or drop it here</p>
  
    <div className="welcome-actions"><Button variant="primary" icon={FolderOpen} onClick={open}>Choose Lottie file</Button></div>
    <input {...getInputProps()}/>
  </section>
}
