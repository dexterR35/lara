import { useState } from 'react'
import JSZip from 'jszip'
import { Archive, Download, FolderInput, LoaderCircle } from 'lucide-react'
import { dataUrlToBlob, expectedFilename, imageAssets, safeBaseName } from '../lib/lottie'
import { useWorkspace } from '../state/WorkspaceContext'
import Button from './Button'
import FilePicker from './FilePicker'

function download(blob, name) {
  const url = URL.createObjectURL(blob)
  const anchor = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function ExportCard() {
  const { source, sourceName, merged, replacements, applyBatch, notify } = useWorkspace()
  const [busy, setBusy] = useState(false)
  const base = safeBaseName(sourceName)

  const batch = async (files) => {
    try { await applyBatch(files) }
    catch (error) { notify(error.message, 'error') }
  }

  const downloadJson = () => {
    try {
      download(new Blob([JSON.stringify(merged)], { type: 'application/json' }), `${base}-rebuilt.json`)
      notify('Rebuilt JSON downloaded', 'success')
    } catch (error) { notify(`Build failed: ${error.message}`, 'error') }
  }

  const exportZip = async () => {
    if (busy) return
    setBusy(true)
    try {
      const zip = new JSZip()
      zip.file(`${base}-rebuilt.json`, JSON.stringify(merged))
      const folder = zip.folder(`${base}-assets`)
      const manifest = []
      imageAssets(source).forEach((asset) => {
        const replacement = replacements[asset.id]
        const payload = replacement?.dataUrl || (String(asset.p).startsWith('data:image') ? asset.p : null)
        if (!payload) return
        const filename = replacement?.name || expectedFilename(asset)
        folder.file(filename, dataUrlToBlob(payload))
        manifest.push({ id: asset.id, file: filename, width: asset.w, height: asset.h, edited: Boolean(replacement) })
      })
      folder.file('manifest.json', JSON.stringify({ source: sourceName, generatedAt: new Date().toISOString(), images: manifest }, null, 2))
      download(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }), `${base}-lara-package.zip`)
      notify('ZIP package exported', 'success')
    } catch (error) { notify(`Export failed: ${error.message}`, 'error') }
    finally { setBusy(false) }
  }

  return <section className="export-card panel">
    <div className="export-copy"><p className="eyebrow">Batch & export</p><h2>Ready when you are</h2><p>Match a folder by asset IDs, or package the complete handoff.</p></div>
    <div className="export-actions"><FilePicker icon={FolderInput} accept="image/*,.svg" directory onFiles={batch}>Load image folder</FilePicker><Button icon={Download} disabled={busy} onClick={downloadJson}>Build JSON</Button><Button variant="primary" className={busy ? 'is-loading' : ''} icon={busy ? LoaderCircle : Archive} disabled={busy} onClick={exportZip}>{busy ? 'Packaging…' : 'Export ZIP'}</Button></div>
  </section>
}
