import { useCallback, useEffect, useMemo } from 'react'
import { useDropzone } from 'react-dropzone'
import { FileJson, FolderInput, Upload } from 'lucide-react'
import AssetList from '../components/AssetList'
import Dropzone from '../components/Dropzone'
import ExportCard from '../components/ExportCard'
import FilePicker from '../components/FilePicker'
import Preview from '../components/Preview'
import StatusToast from '../components/StatusToast'
import { imageAssets } from '../lib/lottie'
import { useConfirm } from '../state/ConfirmContext'
import { useWorkspace } from '../state/WorkspaceContext'

export default function Editor() {
  const { source, sourceName, replacements, notice, notify, loadJsonFile, applyBatch } = useWorkspace()
  const ask = useConfirm()

  useEffect(() => {
    const listener = (event) => notify(event.detail, 'error')
    window.addEventListener('lara:error', listener)
    return () => window.removeEventListener('lara:error', listener)
  }, [notify])

  const importDroppedFiles = useCallback(async (files) => {
    const json = files.find((file) => file.name.toLowerCase().endsWith('.json') || file.name.toLowerCase().endsWith('.lottie'))
    const accepted = await ask(json
      ? { title: 'Open dropped file?', message: `Replace the current project with ${json.name}. Unsaved replacements stay only if you export first.`, tone: 'danger' }
      : { title: 'Apply dropped images?', message: `Match ${files.length} dropped file${files.length === 1 ? '' : 's'} against this animation’s assets.` })
    if (!accepted) return
    try {
      if (json) await loadJsonFile(json)
      else await applyBatch(files)
    } catch (error) { notify(error.message, 'error') }
  }, [applyBatch, ask, loadJsonFile, notify])

  const openAnother = useCallback(async (file) => {
    try { await loadJsonFile(file) }
    catch (error) { notify(error.message, 'error') }
  }, [loadJsonFile, notify])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDropAccepted: importDroppedFiles,
    noClick: true,
    noKeyboard: true,
    disabled: !source,
  })

  const stats = useMemo(() => {
    if (!source) return null
    const fps = Number(source.fr || 0)
    return {
      fps,
      duration: fps ? (Number(source.op || 0) - Number(source.ip || 0)) / fps : 0,
      assets: imageAssets(source).length,
      changes: Object.keys(replacements).length,
    }
  }, [source, replacements])

  if (!source) return <><Dropzone onFile={loadJsonFile}/><StatusToast notice={notice}/></>

  return <div {...getRootProps({ className: 'workspace' })}>
    <input {...getInputProps()}/>
    <div className="workspace-summary">
      <div className="file-identity"><span className="file-icon"><FileJson size={20} aria-hidden="true"/></span><div><p title={sourceName}>{sourceName}</p><span>{source.w} × {source.h} · {stats.fps || '?'} fps · {stats.duration.toFixed(1)} sec</span></div></div>
      <div className="summary-stats"><span><strong>{stats.assets}</strong> assets</span><span><strong>{stats.changes}</strong> changes</span></div>
      <FilePicker icon={Upload} accept=".json,.lottie,application/json,application/zip" onFiles={openAnother}>Open another</FilePicker>
    </div>
    <div className="editor-grid"><AssetList/><Preview/></div>
    <ExportCard/>
    {isDragActive && <div className="drop-overlay"><FolderInput size={28} aria-hidden="true"/><strong>Drop to import</strong><span>JSON opens a project · images apply as a batch</span></div>}
    <StatusToast notice={notice}/>
  </div>
}
