import { useState } from 'react'
import { Archive, Download, FolderInput, LoaderCircle } from 'lucide-react'
import { IMAGE_FILE_ACCEPT, dataUrlToBlob, embeddedImageAssets, expectedFilename, fontReferences, isSafeImageDataUrl, safeBaseName, safeFileName } from '../lib/lottie'
import { useConfirm } from '../state/ConfirmContext'
import { useWorkspace } from '../state/WorkspaceContext'
import Button from './Button'
import FilePicker from './FilePicker'

function download(blob, name) {
  const url = URL.createObjectURL(blob)
  const anchor = Object.assign(document.createElement('a'), { href: url, download: name })
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

function uniqueFilename(name, used, fallback) {
  const safe = safeFileName(name, fallback)
  const match = safe.match(/^(.*?)(\.[^.]+)?$/)
  const stem = (match?.[1] || 'image').slice(0, 96)
  const extension = match?.[2] || ''
  let candidate = safe
  let suffix = 2
  while (used.has(candidate.toLowerCase())) {
    candidate = safeFileName(`${stem}-${suffix}${extension}`, fallback)
    suffix += 1
  }
  used.add(candidate.toLowerCase())
  return candidate
}

export default function ExportCard() {
  const { source, sourceName, merged, replacements, applyBatch, notify } = useWorkspace()
  const ask = useConfirm()
  const [busy, setBusy] = useState(false)
  const base = safeBaseName(sourceName)
  const fonts = fontReferences(source)
  const images = embeddedImageAssets(merged)
  const imageCount = images.length

  const batch = async (files) => {
    try { await applyBatch(files) }
    catch (error) { notify(error.message, 'error') }
  }

  const downloadJson = async () => {
    if (!(await ask({
      title: 'Build JSON?',
      message: `Download ${base}-rebuilt.json with your current timeline edits and asset replacements.`,
    }))) return
    try {
      download(new Blob([JSON.stringify(merged)], { type: 'application/json' }), `${base}-rebuilt.json`)
      notify('Rebuilt JSON downloaded', 'success')
    } catch (error) { notify(`Build failed: ${error.message}`, 'error') }
  }

  const exportZip = async () => {
    if (busy) return
    if (!(await ask({
      title: 'Download all assets?',
      message: `Package ${imageCount} embedded images and the rebuilt JSON into ${base}-assets.zip.`,
    }))) return
    setBusy(true)
    try {
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      zip.file(`${base}-rebuilt.json`, JSON.stringify(merged))
      const folder = zip.folder(`${base}-assets`)
      const manifest = []
      const usedNames = new Set()
      images.forEach((asset) => {
        const id = String(asset.id)
        const replacement = Object.hasOwn(replacements, id) ? replacements[id] : null
        const payload = isSafeImageDataUrl(asset.p) ? asset.p : null
        if (!payload) return
        const filename = uniqueFilename(replacement?.name || expectedFilename(asset), usedNames, `${safeFileName(id, 'image')}.png`)
        folder.file(filename, dataUrlToBlob(payload), { compression: 'STORE' })
        manifest.push({ id, file: filename, width: asset.w, height: asset.h, edited: Boolean(replacement) })
      })
      folder.file('manifest.json', JSON.stringify({ source: sourceName, generatedAt: new Date().toISOString(), images: manifest, fonts }, null, 2))
      download(await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }), `${base}-assets.zip`)
      notify('Asset ZIP downloaded', 'success')
    } catch (error) { notify(`Export failed: ${error.message}`, 'error') }
    finally { setBusy(false) }
  }

  return <section className="export-card panel">
    <div className="export-copy"><p className="eyebrow">Assets & export</p><p>{imageCount} embedded images · {fonts.length} font references{fonts.length ? ` · ${fonts.map((font) => `${font.family} ${font.style}`).join(', ')}` : ''}</p></div>
    <div className="export-actions">
      <FilePicker icon={FolderInput} accept={IMAGE_FILE_ACCEPT} directory onFiles={batch}>Load image folder</FilePicker>
      <Button icon={Download} disabled={busy} onClick={downloadJson}>Build JSON</Button>
      <Button variant="primary" className={busy ? 'is-loading' : ''} icon={busy ? LoaderCircle : Archive} disabled={busy || !imageCount} onClick={exportZip}>{busy ? 'Packaging…' : 'Download all assets'}</Button>
    </div>
  </section>
}
