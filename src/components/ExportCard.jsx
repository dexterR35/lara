import { useRef, useState } from 'react'
import JSZip from 'jszip'
import { Archive, Download, FolderInput, LoaderCircle } from 'lucide-react'
import { dataUrlToBlob, expectedFilename, imageAssets } from '../lib/lottie'
import { useWorkspace } from '../state/WorkspaceContext'
import Button from './Button'

function download(blob, name) {
  const url = URL.createObjectURL(blob)
  Object.assign(document.createElement('a'), { href: url, download: name }).click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function ExportCard() {
  const { source, sourceName, merged, replacements, applyBatch, notify } = useWorkspace()
  const folderInput = useRef(null)
  const [busy, setBusy] = useState(false)
  const base = sourceName.replace(/\.json$/i, '') || 'animation'
  const batch = async (files) => { try { await applyBatch(files) } catch (error) { notify(error.message, 'error') } }
  const downloadJson = () => { download(new Blob([JSON.stringify(merged)], { type: 'application/json' }), `${base}-rebuilt.json`); notify('Rebuilt JSON downloaded', 'success') }
  const exportZip = async () => {
    setBusy(true)
    try {
      const zip = new JSZip()
      zip.file(`${base}-rebuilt.json`, JSON.stringify(merged))
      const folder = zip.folder(`${base}-assets`), manifest = []
      imageAssets(source).forEach((asset) => {
        const replacement = replacements[asset.id]
        const payload = replacement?.dataUrl || (String(asset.p).startsWith('data:image') ? asset.p : null)
        if (payload) {
          const filename = replacement?.name || expectedFilename(asset)
          folder.file(filename, dataUrlToBlob(payload))
          manifest.push({ id: asset.id, file: filename, width: asset.w, height: asset.h, edited: Boolean(replacement) })
        }
      })
      folder.file('manifest.json', JSON.stringify({ source: sourceName, images: manifest }, null, 2))
      download(await zip.generateAsync({ type: 'blob' }), `${base}-lara-package.zip`)
      notify('ZIP package exported', 'success')
    } catch (error) { notify(error.message, 'error') } finally { setBusy(false) }
  }
  return <section className="export-card panel">
    <div className="export-copy"><p className="eyebrow">Batch & export</p><h2>Ready when you are</h2><p>Load a folder of edited images by matching asset IDs, or package everything for handoff.</p></div>
    <div className="export-actions"><Button icon={FolderInput} onClick={() => folderInput.current.click()}>Load image folder</Button><Button icon={Download} onClick={downloadJson}>Build JSON</Button><Button variant="primary" icon={busy ? LoaderCircle : Archive} disabled={busy} onClick={exportZip}>{busy ? 'Packaging…' : 'Export ZIP'}</Button><input ref={folderInput} hidden type="file" accept="image/*,.svg" multiple webkitdirectory="" directory="" onChange={(event) => batch(event.target.files)}/></div>
  </section>
}
