import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { FileJson, FolderOpen, UploadCloud } from 'lucide-react'
import { useConfirm } from '../state/ConfirmContext'
import Button from './Button'

export default function Dropzone({ onFile }) {
  const ask = useConfirm()

  const load = useCallback(async ([file]) => {
    if (!file) return
    if (!(await ask({ title: 'Open Lottie file?', message: `Load ${file.name} into Lara.` }))) return
    onFile(file).catch((error) => window.dispatchEvent(new CustomEvent('lara:error', { detail: error.message })))
  }, [ask, onFile])

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
    <div className="welcome-actions"><Button variant="primary" icon={FolderOpen} onClick={open}>Choose Lottie file</Button><span><UploadCloud size={16}/> or drop it here</span></div>
    <input {...getInputProps()}/>
  </section>
}
