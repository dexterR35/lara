import { useMemo, useRef, useState } from 'react'
import { Check, Image, Search, Trash2, Upload } from 'lucide-react'
import { assetSource, expectedFilename, formatBytes, imageAssets, refsByAsset } from '../lib/lottie'
import { useWorkspace } from '../state/WorkspaceContext'
import Button from './Button'

export default function AssetList() {
  const { source, replacements, selectedId, setSelectedId, replaceAsset, removeReplacement, notify } = useWorkspace()
  const [query, setQuery] = useState('')
  const input = useRef(null)
  const assets = imageAssets(source)
  const refs = useMemo(() => refsByAsset(source), [source])
  const filtered = assets.filter((asset) => `${asset.id} ${expectedFilename(asset)} ${(refs[asset.id] || []).join(' ')}`.toLowerCase().includes(query.toLowerCase()))
  const selected = assets.find((asset) => asset.id === selectedId)
  const choose = async (file) => {
    if (!selected || !file) return
    try { await replaceAsset(selected.id, file); notify(`${selected.id} replaced`, 'success') } catch (error) { notify(error.message, 'error') }
    input.current.value = ''
  }
  return <section className="asset-panel panel">
    <div className="panel-heading"><div><p className="eyebrow">Assets</p><h2>{assets.length} images</h2></div><span className="count-pill">{Object.keys(replacements).length} edited</span></div>
    <label className="search-field"><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search assets or layers"/></label>
    <div className="asset-list">{filtered.map((asset) => {
      const replacement = replacements[asset.id]
      return <button key={asset.id} className={`asset-row ${selectedId === asset.id ? 'is-selected' : ''}`} onClick={() => setSelectedId(asset.id)}>
        <span className="thumbnail">{assetSource(replacement ? { p: replacement.dataUrl } : asset) ? <img src={replacement?.dataUrl || assetSource(asset)} alt=""/> : <Image size={18}/>}</span>
        <span className="asset-copy"><strong>{asset.id}</strong><small>{(refs[asset.id] || [expectedFilename(asset)])[0]}</small></span>
        <span className="asset-meta"><small>{asset.w || '?'} × {asset.h || '?'}</small>{replacement && <em><Check size={11}/> Edited</em>}</span>
      </button>
    })}{!filtered.length && <div className="empty-list">No assets match “{query}”.</div>}</div>
    <div className="asset-actions"><Button icon={Upload} disabled={!selected} onClick={() => input.current.click()}>Replace selected</Button><Button variant="ghost" icon={Trash2} disabled={!replacements[selectedId]} onClick={() => removeReplacement(selectedId)}>Restore</Button><input ref={input} hidden type="file" accept="image/*,.svg" onChange={(event) => choose(event.target.files[0])}/></div>
    {selected && <p className="selected-info">Selected <strong>{expectedFilename(selected)}</strong>{replacements[selected.id] && ` · ${formatBytes(replacements[selected.id].size)}`}</p>}
  </section>
}
