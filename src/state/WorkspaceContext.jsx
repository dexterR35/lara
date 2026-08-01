import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { fileToDataUrl, imageAssets, mergedLottie, validateLottie } from '../lib/lottie'

const STORAGE_KEY = 'lara.workspace.v2'
const WorkspaceContext = createContext(null)
const restore = () => { try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || {} } catch { return {} } }

export function WorkspaceProvider({ children }) {
  const saved = useMemo(restore, [])
  const [source, setSource] = useState(saved.source || null)
  const [sourceName, setSourceName] = useState(saved.sourceName || '')
  const [replacements, setReplacements] = useState(saved.replacements || {})
  const [selectedId, setSelectedId] = useState(saved.selectedId || null)
  const [notice, setNotice] = useState(null)
  const notify = useCallback((message, tone = 'default') => {
    setNotice({ message, tone, id: Date.now() })
    window.setTimeout(() => setNotice((current) => current?.message === message ? null : current), 3200)
  }, [])

  useEffect(() => {
    try {
      if (source) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ source, sourceName, replacements, selectedId }))
      else sessionStorage.removeItem(STORAGE_KEY)
    } catch { notify('Session storage is full. Download your build before refreshing.', 'error') }
  }, [source, sourceName, replacements, selectedId, notify])

  const loadJsonFile = useCallback(async (file) => {
    if (!file) return
    const data = validateLottie(JSON.parse(await file.text()))
    setSource(data); setSourceName(file.name); setReplacements({}); setSelectedId(imageAssets(data)[0]?.id || null)
    notify(`${file.name} is ready`)
  }, [notify])

  const replaceAsset = useCallback(async (assetId, file) => {
    if (!file?.type?.startsWith('image/') && !/\.(png|jpe?g|webp|gif|svg)$/i.test(file?.name || '')) throw new Error('Choose a PNG, JPG, WebP, GIF, or SVG image.')
    const dataUrl = await fileToDataUrl(file)
    setReplacements((current) => ({ ...current, [assetId]: { name: file.name, size: file.size, dataUrl } }))
  }, [])

  const applyBatch = useCallback(async (files) => {
    if (!source) throw new Error('Open a Lottie file first.')
    const all = [...files].filter((file) => /\.(png|jpe?g|webp|gif|svg)$/i.test(file.name))
    const next = {}
    for (const asset of imageAssets(source)) {
      const expected = `${asset.id}_${asset.w || 'x'}x${asset.h || 'x'}`.toLowerCase()
      const match = all.find((file) => { const stem = file.name.replace(/\.[^.]+$/, '').toLowerCase(); return stem === String(asset.id).toLowerCase() || stem === expected || stem.startsWith(`${String(asset.id).toLowerCase()}_`) })
      if (match) next[asset.id] = { name: match.name, size: match.size, dataUrl: await fileToDataUrl(match) }
    }
    setReplacements((current) => ({ ...current, ...next }))
    notify(`${Object.keys(next).length} of ${all.length} images matched`, Object.keys(next).length ? 'success' : 'error')
    return Object.keys(next).length
  }, [source, notify])

  const removeReplacement = useCallback((id) => setReplacements((current) => { const next = { ...current }; delete next[id]; return next }), [])
  const reset = useCallback(() => { setSource(null); setSourceName(''); setReplacements({}); setSelectedId(null); sessionStorage.removeItem(STORAGE_KEY); notify('Workspace reset') }, [notify])
  const merged = useMemo(() => source ? mergedLottie(source, replacements) : null, [source, replacements])
  return <WorkspaceContext.Provider value={{ source, sourceName, replacements, selectedId, setSelectedId, notice, notify, loadJsonFile, replaceAsset, applyBatch, removeReplacement, reset, merged }}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return context
}
