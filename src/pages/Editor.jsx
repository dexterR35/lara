import { useEffect, useRef, useState } from 'react'
import { FileJson, FolderInput, Upload } from 'lucide-react'
import AssetList from '../components/AssetList'
import Button from '../components/Button'
import Dropzone from '../components/Dropzone'
import ExportCard from '../components/ExportCard'
import Preview from '../components/Preview'
import { imageAssets } from '../lib/lottie'
import { useWorkspace } from '../state/WorkspaceContext'

export default function Editor() {
  const { source, sourceName, replacements, notice, notify, loadJsonFile, applyBatch } = useWorkspace()
  const jsonInput = useRef(null)
  const [dragging, setDragging] = useState(false)
  useEffect(() => { const listener = (event) => notify(event.detail, 'error'); window.addEventListener('lara:error', listener); return () => window.removeEventListener('lara:error', listener) }, [notify])
  if (!source) return <><Dropzone onFile={loadJsonFile}/>{notice && <div className={`toast toast-${notice.tone}`}>{notice.message}</div>}</>
  const fps = Number(source.fr || 0), duration = fps ? (Number(source.op || 0) - Number(source.ip || 0)) / fps : 0
  const dropped = async (files) => {
    setDragging(false)
    const json = [...files].find((file) => file.name.toLowerCase().endsWith('.json'))
    try { if (json) await loadJsonFile(json); else await applyBatch(files) } catch (error) { notify(error.message, 'error') }
  }
  return <div className={`workspace ${dragging ? 'is-dragging' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false) }} onDrop={(event) => { event.preventDefault(); dropped(event.dataTransfer.files) }}>
    <div className="workspace-summary"><div className="file-identity"><span className="file-icon"><FileJson size={20}/></span><div><p>{sourceName}</p><span>{source.w} × {source.h} · {fps || '?'} fps · {duration.toFixed(1)} sec</span></div></div><div className="summary-stats"><span><strong>{imageAssets(source).length}</strong> assets</span><span><strong>{Object.keys(replacements).length}</strong> changes</span></div><Button icon={Upload} onClick={() => jsonInput.current.click()}>Open another</Button><input ref={jsonInput} hidden type="file" accept=".json,application/json" onChange={(event) => loadJsonFile(event.target.files[0]).catch((error) => notify(error.message, 'error'))}/></div>
    <div className="editor-grid"><AssetList/><Preview/></div><ExportCard/>
    {dragging && <div className="drop-overlay"><FolderInput size={28}/><strong>Drop to import</strong><span>JSON opens a project · images apply as a batch</span></div>}
    {notice && <div className={`toast toast-${notice.tone}`}>{notice.message}</div>}
  </div>
}
