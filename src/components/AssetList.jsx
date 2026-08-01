import { useMemo, useState } from 'react'
import { Check, Search, Trash2, Upload } from 'lucide-react'
import { assetSource, expectedFilename, formatBytes, imageAssets, refsByAsset } from '../lib/lottie'
import { useWorkspace } from '../state/WorkspaceContext'
import AssetThumbnail from './AssetThumbnail'
import Button from './Button'
import FilePicker from './FilePicker'

function AssetRow({ asset, layerNames, replacement, selected, onSelect }) {
  const preview = replacement?.dataUrl || assetSource(asset)
  return <button type="button" className={`asset-row ${selected ? 'is-selected' : ''}`} onClick={onSelect} aria-pressed={selected}>
    <AssetThumbnail src={preview} label={asset.id}/>
    <span className="asset-copy"><strong>{asset.id}</strong><small>{layerNames[0] || expectedFilename(asset)}</small></span>
    <span className="asset-meta"><small>{asset.w || '?'} × {asset.h || '?'}</small>{replacement && <em><Check size={11} aria-hidden="true"/>Edited</em>}</span>
  </button>
}

export default function AssetList() {
  const { source, replacements, selectedId, setSelectedId, replaceAsset, removeReplacement, notify } = useWorkspace()
  const [query, setQuery] = useState('')
  const assets = useMemo(() => imageAssets(source), [source])
  const refs = useMemo(() => refsByAsset(source), [source])
  const normalizedQuery = query.trim().toLowerCase()
  const filtered = useMemo(() => assets.filter((asset) => `${asset.id} ${expectedFilename(asset)} ${(refs[asset.id] || []).join(' ')}`.toLowerCase().includes(normalizedQuery)), [assets, refs, normalizedQuery])
  const selected = assets.find((asset) => asset.id === selectedId)

  const choose = async (file) => {
    if (!selected || !file) return
    try {
      await replaceAsset(selected.id, file)
      notify(`${selected.id} replaced`, 'success')
    } catch (error) { notify(error.message, 'error') }
  }

  return <section className="asset-panel panel" aria-label="Animation assets">
    <div className="panel-heading"><div><p className="eyebrow">Assets</p><h2>{assets.length} images</h2></div><span className="count-pill">{Object.keys(replacements).length} edited</span></div>
    <label className="search-field"><Search size={16} aria-hidden="true"/><span className="sr-only">Search assets</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search assets or layers"/></label>
    <div className="asset-list" role="list">{filtered.map((asset) => <AssetRow key={asset.id} asset={asset} layerNames={refs[asset.id] || []} replacement={replacements[asset.id]} selected={selectedId === asset.id} onSelect={() => setSelectedId(asset.id)}/>)}{!filtered.length && <div className="empty-list">{assets.length ? `No assets match “${query}”.` : 'This animation has no image assets.'}</div>}</div>
    <div className="asset-actions"><FilePicker icon={Upload} accept="image/*,.svg" disabled={!selected} onFiles={choose}>Replace selected</FilePicker><Button variant="ghost" icon={Trash2} disabled={!replacements[selectedId]} onClick={() => removeReplacement(selectedId)}>Restore</Button></div>
    {selected && <p className="selected-info">Selected <strong>{expectedFilename(selected)}</strong>{replacements[selected.id] && ` · ${formatBytes(replacements[selected.id].size)}`}</p>}
  </section>
}
