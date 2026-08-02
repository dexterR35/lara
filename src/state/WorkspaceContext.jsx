import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { fileToDataUrl, imageAssets, isImageFile, matchAssetFiles, mergedLottie, parseLottieFile, setLayerTransformValue, validateLottie } from '../lib/lottie'

export const WORKSPACE_STORAGE_KEY = 'lara.workspace.v2'
const WorkspaceContext = createContext(null)

function restoreWorkspace() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(WORKSPACE_STORAGE_KEY))
    if (!saved?.source) return {}
    return { ...saved, source: validateLottie(saved.source), replacements: saved.replacements || {} }
  } catch {
    sessionStorage.removeItem(WORKSPACE_STORAGE_KEY)
    return {}
  }
}

export function WorkspaceProvider({ children }) {
  const saved = useMemo(restoreWorkspace, [])
  const [source, setSource] = useState(saved.source || null)
  const [sourceName, setSourceName] = useState(saved.sourceName || '')
  const [replacements, setReplacements] = useState(saved.replacements || {})
  const [selectedLayerIndex, setSelectedLayerIndex] = useState(saved.source?.layers?.length ? 0 : null)
  const [selectedLayerIndices, setSelectedLayerIndices] = useState(saved.source?.layers?.length ? [0] : [])
  const [hoveredLayerIndex, setHoveredLayerIndex] = useState(null)
  const [currentFrame, setCurrentFrame] = useState(Number(saved.source?.ip) || 0)
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [notice, setNotice] = useState(null)
  const [storageState, setStorageState] = useState('saved')

  const notify = useCallback((message, tone = 'default') => {
    const notice = { message, tone, id: crypto.randomUUID() }
    setNotice(notice)
    window.setTimeout(() => setNotice((current) => current?.id === notice.id ? null : current), 3200)
  }, [])

  useEffect(() => {
    try {
      if (source) sessionStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ source, sourceName, replacements }))
      else sessionStorage.removeItem(WORKSPACE_STORAGE_KEY)
      setStorageState('saved')
    } catch {
      setStorageState('memory-only')
      notify('Browser session storage is full. Export before refreshing.', 'error')
    }
  }, [source, sourceName, replacements, notify])

  const loadJsonFile = useCallback(async (file) => {
    if (!file) return
    const data = await parseLottieFile(file)
    setSource(data)
    setSourceName(file.name)
    setReplacements({})
    setSelectedLayerIndex(data.layers.length ? 0 : null)
    setSelectedLayerIndices(data.layers.length ? [0] : [])
    setCurrentFrame(Number(data.ip) || 0)
    setTimelineOpen(false)
    notify(`${file.name} is ready`, 'success')
  }, [notify])

  const replaceAsset = useCallback(async (assetId, file) => {
    if (!isImageFile(file)) throw new Error('Choose a PNG, JPG, WebP, GIF, or SVG image.')
    const dataUrl = await fileToDataUrl(file)
    setReplacements((current) => ({ ...current, [assetId]: { name: file.name, size: file.size, type: file.type, dataUrl } }))
  }, [])

  const applyBatch = useCallback(async (files) => {
    if (!source) throw new Error('Open a Lottie file first.')
    const { matches, imageCount } = matchAssetFiles(imageAssets(source), [...files])
    const entries = await Promise.all(matches.map(async ([asset, file]) => [asset.id, { name: file.name, size: file.size, type: file.type, dataUrl: await fileToDataUrl(file) }]))
    if (entries.length) setReplacements((current) => ({ ...current, ...Object.fromEntries(entries) }))
    notify(`${entries.length} of ${imageCount} images matched`, entries.length ? 'success' : 'error')
    return entries.length
  }, [source, notify])

  const removeReplacement = useCallback((id) => setReplacements((current) => {
    if (!current[id]) return current
    const next = { ...current }
    delete next[id]
    return next
  }), [])

  const reset = useCallback(() => {
    setSource(null)
    setSourceName('')
    setReplacements({})
    setSelectedLayerIndex(null)
    setSelectedLayerIndices([])
    setHoveredLayerIndex(null)
    setCurrentFrame(0)
    setTimelineOpen(false)
    sessionStorage.removeItem(WORKSPACE_STORAGE_KEY)
    notify('Workspace reset')
  }, [notify])

  const seekFrame = useCallback((frame) => {
    const next = Math.max(Number(source?.ip) || 0, Math.min(Number(source?.op) || 0, Number(frame) || 0))
    setCurrentFrame(next)
    window.dispatchEvent(new CustomEvent('lara:seek', { detail: next }))
  }, [source])

  const selectLayer = useCallback((index, additive = false) => {
    const next = additive
      ? selectedLayerIndices.includes(index) ? selectedLayerIndices.filter((item) => item !== index) : [...selectedLayerIndices, index]
      : [index]
    setSelectedLayerIndices(next)
    setSelectedLayerIndex(next.at(-1) ?? null)
  }, [selectedLayerIndices])

  const selectAllLayers = useCallback((indices) => {
    const next = [...new Set(indices)].filter((index) => source?.layers?.[index])
    setSelectedLayerIndices(next)
    setSelectedLayerIndex(next.at(-1) ?? null)
  }, [source])

  const setLayerTransform = useCallback((layerIndex, track, frame, value, createKeyframe = false) => {
    setSource((current) => current ? setLayerTransformValue(current, layerIndex, track, frame, value, createKeyframe) : current)
  }, [])

  const merged = useMemo(() => source ? mergedLottie(source, replacements) : null, [source, replacements])
  const value = useMemo(() => ({ source, sourceName, replacements, selectedLayerIndex, selectedLayerIndices, selectLayer, selectAllLayers, hoveredLayerIndex, setHoveredLayerIndex, currentFrame, setCurrentFrame, seekFrame, timelineOpen, setTimelineOpen, notice, notify, storageState, loadJsonFile, replaceAsset, applyBatch, removeReplacement, setLayerTransform, reset, merged }), [source, sourceName, replacements, selectedLayerIndex, selectedLayerIndices, selectLayer, selectAllLayers, hoveredLayerIndex, currentFrame, seekFrame, timelineOpen, notice, notify, storageState, loadJsonFile, replaceAsset, applyBatch, removeReplacement, setLayerTransform, reset, merged])

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return context
}
