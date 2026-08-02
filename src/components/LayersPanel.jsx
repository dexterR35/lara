import { Check, Download, Image, Layers3, Search, Trash2, Type, Upload } from 'lucide-react'
import { useMemo, useState } from 'react'
import { assetSource, dataUrlToBlob, expectedFilename, formatBytes, imageAssets } from '../lib/lottie'
import { useConfirm } from '../state/ConfirmContext'
import { useWorkspace } from '../state/WorkspaceContext'
import AssetThumbnail from './AssetThumbnail'
import Button from './Button'
import FilePicker from './FilePicker'

const layerType = (type) => type === 2 ? 'Image' : type === 5 ? 'Text' : type === 4 ? 'Shape' : type === 0 ? 'Precomp' : 'Layer'
const layerIcon = (type) => type === 2 ? Image : type === 5 ? Type : Layers3

export default function LayersPanel() {
  const { source, replacements, selectedLayerIndex, selectedLayerIndices, selectLayer, hoveredLayerIndex, setHoveredLayerIndex, replaceAsset, removeReplacement, notify } = useWorkspace()
  const ask = useConfirm()
  const [query, setQuery] = useState('')
  const assets = useMemo(() => imageAssets(source), [source])
  const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets])
  const normalized = query.trim().toLowerCase()
  const layers = useMemo(() => source.layers.map((layer, index) => ({ layer, index })).filter(({ layer }) => `${layer.nm || ''} ${layerType(layer.ty)} ${layer.refId || ''} ${assetsById.get(layer.refId)?.p || ''}`.toLowerCase().includes(normalized)), [assetsById, normalized, source.layers])
  const selectedLayer = source.layers[selectedLayerIndex]
  const selectedAsset = assetsById.get(selectedLayer?.refId) || null
  const selectedReplacement = selectedAsset ? replacements[selectedAsset.id] : null

  const choose = async (file) => {
    if (!selectedAsset || !file) return
    try {
      await replaceAsset(selectedAsset.id, file)
      notify(`${selectedAsset.id} replaced`, 'success')
    } catch (error) { notify(error.message, 'error') }
  }

  const downloadSelected = async () => {
    const payload = selectedReplacement?.dataUrl || selectedAsset?.p
    if (!selectedAsset || !String(payload).startsWith('data:image')) return
    if (!(await ask({ title: 'Download asset?', message: `Download ${selectedReplacement?.name || expectedFilename(selectedAsset)} to your device.` }))) return
    try {
      const url = URL.createObjectURL(dataUrlToBlob(payload))
      const anchor = Object.assign(document.createElement('a'), { href: url, download: selectedReplacement?.name || expectedFilename(selectedAsset) })
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      notify(`${selectedAsset.id} downloaded`, 'success')
    } catch (error) { notify(error.message, 'error') }
  }

  const restoreSelected = async () => {
    if (!selectedReplacement) return
    if (!(await ask({ title: 'Restore original?', message: `Discard the replacement for ${selectedAsset.id} and restore the original asset.`, tone: 'danger' }))) return
    removeReplacement(selectedAsset.id)
    notify(`${selectedAsset.id} restored`)
  }

  return <section className="layers-panel panel" aria-label="Composition layers">
    <div className="panel-heading">
      <div><h2>{source.layers.length} layers</h2></div>
      <span className={`count-pill ${Object.keys(replacements).length ? 'is-edited' : 'is-clean'}`}>{Object.keys(replacements).length} edited</span>
    </div>
    <label className="search-field">
      <Search size={16} aria-hidden="true"/><span className="sr-only">Search layers</span>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search layers"/>
    </label>
    <div className="layer-sidebar-list" role="list">
      {layers.map(({ layer, index }) => {
        const Icon = layerIcon(layer.ty)
        const selected = selectedLayerIndices.includes(index)
        const asset = assetsById.get(layer.refId)
        const replacement = asset ? replacements[asset.id] : null
        return <button key={`${layer.ind ?? index}-${layer.nm ?? ''}`} type="button" className={`layer-sidebar-row ${selected ? 'is-selected' : ''} ${hoveredLayerIndex === index ? 'is-hovered' : ''}`} onMouseEnter={() => setHoveredLayerIndex(index)} onMouseLeave={() => setHoveredLayerIndex((current) => current === index ? null : current)} onFocus={() => setHoveredLayerIndex(index)} onBlur={() => setHoveredLayerIndex((current) => current === index ? null : current)} onClick={(event) => selectLayer(index, event.metaKey || event.ctrlKey || event.shiftKey)} aria-pressed={selected}>
          <span className="layer-sidebar-icon">{asset ? <AssetThumbnail src={replacement?.dataUrl || assetSource(asset)} label={layer.nm || asset.id}/> : <Icon size={15}/>}</span>
          <span><strong>{layer.nm || `Layer ${index + 1}`}</strong><small>{layerType(layer.ty)}{asset ? ` · ${asset.w || '?'} × ${asset.h || '?'}` : layer.refId ? ` · ${layer.refId}` : ''}</small></span>
          <em title={replacement ? 'Asset replaced' : `Layer ${index + 1}`}>{replacement ? <Check size={12}/> : index + 1}</em>
        </button>
      })}
      {!layers.length && <div className="empty-list">No layers match “{query}”.</div>}
    </div>
    <div className="asset-actions">
      <Button icon={Download} disabled={!selectedAsset || !String(selectedReplacement?.dataUrl || selectedAsset?.p).startsWith('data:image')} onClick={downloadSelected}>Download</Button>
      <FilePicker icon={Upload} accept="image/*,.svg" disabled={!selectedAsset} onFiles={choose}>Replace</FilePicker>
      <Button variant="ghost" icon={Trash2} disabled={!selectedReplacement} onClick={restoreSelected}>Restore</Button>
    </div>
    <p className="selected-info">{selectedAsset ? <>Selected image <strong>{expectedFilename(selectedAsset)}</strong>{selectedReplacement ? ` · ${formatBytes(selectedReplacement.size)}` : ''}</> : 'Select an image layer to replace or download its asset.'}</p>
    <p className="layers-panel-hint">Ctrl/Cmd-click to select multiple layers</p>
  </section>
}
