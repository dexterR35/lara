import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { inspectImageDataUrl } from '../lib/images'
import {
  MAX_BATCH_FILES,
  MAX_BATCH_TOTAL_SIZE,
  clampCompositionFrame,
  imageAssets,
  isImageFile,
  matchAssetFiles,
  mergedLottie,
  parseLottieFile,
  prepareImageFile,
  safeFileName,
  setLayerTransformValue,
  setLayerTransformValues,
  validateLottie,
} from '../lib/lottie'

export const WORKSPACE_STORAGE_KEY = 'lara.workspace.v3'
const LEGACY_WORKSPACE_STORAGE_KEY = 'lara.workspace.v2'
const WORKSPACE_CACHE_VERSION = 3
const CACHE_WRITE_DELAY = 200
const WorkspaceContext = createContext(null)

function clearWorkspaceCache() {
  try {
    sessionStorage.removeItem(WORKSPACE_STORAGE_KEY)
    sessionStorage.removeItem(LEGACY_WORKSPACE_STORAGE_KEY)
  } catch { /* The app can continue in memory when storage is unavailable. */ }
}

export function sanitizeCachedReplacements(source, candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return {}
  const validIds = new Set(imageAssets(source).map((asset) => String(asset.id)))
  const entries = []
  Object.entries(candidate).forEach(([id, replacement]) => {
    if (!validIds.has(id) || !replacement || typeof replacement !== 'object' || Array.isArray(replacement)) return
    try {
      const info = inspectImageDataUrl(replacement.dataUrl)
      const originalName = safeFileName(replacement.name, `${id}.${info.extension}`)
      const stem = originalName.replace(/\.[^.]+$/, '') || id || 'image'
      entries.push([id, {
        name: safeFileName(`${stem}.${info.extension}`, `image.${info.extension}`),
        size: info.bytes.byteLength,
        type: info.mime,
        dataUrl: replacement.dataUrl,
        width: info.width,
        height: info.height,
      }])
    } catch { /* Discard corrupt or unsupported cached assets. */ }
  })
  return Object.fromEntries(entries)
}

function restoreWorkspace() {
  try {
    const current = sessionStorage.getItem(WORKSPACE_STORAGE_KEY)
    const legacy = !current ? sessionStorage.getItem(LEGACY_WORKSPACE_STORAGE_KEY) : null
    const saved = JSON.parse(current || legacy)
    if (!saved?.source) return {}
    if (current && saved.version !== WORKSPACE_CACHE_VERSION) throw new Error('Unsupported workspace cache version.')
    const source = validateLottie(saved.source)
    sessionStorage.removeItem(LEGACY_WORKSPACE_STORAGE_KEY)
    return {
      source,
      sourceName: safeFileName(saved.sourceName, 'animation.json'),
      replacements: sanitizeCachedReplacements(source, saved.replacements),
    }
  } catch {
    clearWorkspaceCache()
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
  const [currentFrame, setCurrentFrame] = useState(saved.source ? clampCompositionFrame(saved.source, saved.source.ip) : 0)
  const [timelineOpen, setTimelineOpen] = useState(false)
  const [notice, setNotice] = useState(null)
  const [storageState, setStorageState] = useState('saved')
  const cacheSnapshot = useRef(null)
  const cacheTimer = useRef(null)
  const storageWarningShown = useRef(false)
  const noticeTimers = useRef(new Set())

  const notify = useCallback((message, tone = 'default') => {
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
    const notice = { message: String(message || 'Something went wrong.').slice(0, 500), tone, id }
    setNotice(notice)
    const timer = window.setTimeout(() => {
      noticeTimers.current.delete(timer)
      setNotice((current) => current?.id === notice.id ? null : current)
    }, 3200)
    noticeTimers.current.add(timer)
  }, [])

  useEffect(() => () => noticeTimers.current.forEach((timer) => window.clearTimeout(timer)), [])

  const persistCache = useCallback(() => {
    const snapshot = cacheSnapshot.current
    try {
      if (!snapshot?.source) {
        clearWorkspaceCache()
      } else {
        sessionStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({ version: WORKSPACE_CACHE_VERSION, ...snapshot }))
        sessionStorage.removeItem(LEGACY_WORKSPACE_STORAGE_KEY)
      }
      storageWarningShown.current = false
      setStorageState('saved')
    } catch {
      // setItem is atomic, but remove an older value so a refresh never restores stale edits.
      clearWorkspaceCache()
      setStorageState('memory-only')
      if (!storageWarningShown.current) {
        storageWarningShown.current = true
        notify('This project is too large for session cache. It remains in memory; export before refreshing.', 'error')
      }
    }
  }, [notify])

  useEffect(() => {
    cacheSnapshot.current = { source, sourceName, replacements }
    if (cacheTimer.current) window.clearTimeout(cacheTimer.current)
    if (!source) {
      persistCache()
      return undefined
    }
    setStorageState((current) => current === 'memory-only' ? current : 'saving')
    cacheTimer.current = window.setTimeout(() => {
      cacheTimer.current = null
      persistCache()
    }, CACHE_WRITE_DELAY)
    return () => {
      if (cacheTimer.current) window.clearTimeout(cacheTimer.current)
      cacheTimer.current = null
    }
  }, [source, sourceName, replacements, persistCache])

  useEffect(() => {
    const flush = () => {
      if (cacheTimer.current) window.clearTimeout(cacheTimer.current)
      cacheTimer.current = null
      persistCache()
    }
    window.addEventListener('pagehide', flush)
    return () => window.removeEventListener('pagehide', flush)
  }, [persistCache])

  const loadJsonFile = useCallback(async (file) => {
    if (!file) return
    const data = await parseLottieFile(file)
    const displayName = safeFileName(file.name, 'animation.json')
    setSource(data)
    setSourceName(displayName)
    setReplacements({})
    setSelectedLayerIndex(data.layers.length ? 0 : null)
    setSelectedLayerIndices(data.layers.length ? [0] : [])
    setCurrentFrame(clampCompositionFrame(data, data.ip))
    setTimelineOpen(false)
    notify(`${displayName} is ready`, 'success')
  }, [notify])

  const replaceAsset = useCallback(async (assetId, file) => {
    const id = String(assetId)
    if (!source || !imageAssets(source).some((asset) => String(asset.id) === id)) throw new Error('The selected image asset no longer exists.')
    const replacement = await prepareImageFile(file)
    setReplacements((current) => ({ ...current, [id]: replacement }))
  }, [source])

  const applyBatch = useCallback(async (files) => {
    if (!source) throw new Error('Open a Lottie file first.')
    const list = [...files]
    if (list.length > MAX_BATCH_FILES) throw new Error(`Choose no more than ${MAX_BATCH_FILES} files at once.`)
    const candidates = list.filter(isImageFile)
    const unsupportedImages = list.filter((file) => !isImageFile(file) && (String(file.type || '').startsWith('image/') || /\.(svg|bmp|tiff?|avif|heic|heif)$/i.test(String(file.name || '')))).length
    const totalSize = candidates.reduce((total, file) => total + (Number(file.size) || 0), 0)
    if (totalSize > MAX_BATCH_TOTAL_SIZE) throw new Error('The selected image batch is larger than 100 MB.')
    const { matches, imageCount } = matchAssetFiles(imageAssets(source), candidates)
    const entries = []
    let rejected = 0
    for (const [asset, file] of matches) {
      try { entries.push([String(asset.id), await prepareImageFile(file)]) }
      catch { rejected += 1 }
    }
    if (entries.length) setReplacements((current) => ({ ...current, ...Object.fromEntries(entries) }))
    const notes = []
    if (rejected) notes.push(`${rejected} unsafe or invalid ${rejected === 1 ? 'file' : 'files'} skipped`)
    if (unsupportedImages) notes.push(`${unsupportedImages} unsupported image ${unsupportedImages === 1 ? 'format' : 'formats'} ignored`)
    notify(`${entries.length} of ${imageCount} supported images matched${notes.length ? ` · ${notes.join(' · ')}` : ''}`, entries.length ? (notes.length ? 'default' : 'success') : 'error')
    return entries.length
  }, [source, notify])

  const removeReplacement = useCallback((id) => setReplacements((current) => {
    const key = String(id)
    if (!Object.hasOwn(current, key)) return current
    const next = { ...current }
    delete next[key]
    return next
  }), [])

  const reset = useCallback(() => {
    cacheSnapshot.current = { source: null, sourceName: '', replacements: {} }
    setSource(null)
    setSourceName('')
    setReplacements({})
    setSelectedLayerIndex(null)
    setSelectedLayerIndices([])
    setHoveredLayerIndex(null)
    setCurrentFrame(0)
    setTimelineOpen(false)
    clearWorkspaceCache()
    notify('Workspace reset')
  }, [notify])

  const seekFrame = useCallback((frame) => {
    const next = clampCompositionFrame(source, frame, true)
    setCurrentFrame(next)
    window.dispatchEvent(new CustomEvent('lara:seek', { detail: next }))
  }, [source])

  const selectLayer = useCallback((index, additive = false) => {
    if (!source?.layers?.[index]) return
    const next = additive
      ? selectedLayerIndices.includes(index) ? selectedLayerIndices.filter((item) => item !== index) : [...selectedLayerIndices, index]
      : [index]
    setSelectedLayerIndices(next)
    setSelectedLayerIndex(next.at(-1) ?? null)
  }, [selectedLayerIndices, source])

  const selectAllLayers = useCallback((indices) => {
    const next = [...new Set(indices)].filter((index) => source?.layers?.[index])
    setSelectedLayerIndices(next)
    setSelectedLayerIndex(next.at(-1) ?? null)
  }, [source])

  const setLayerTransform = useCallback((layerIndex, track, frame, value, createKeyframe = false) => {
    setSource((current) => current ? setLayerTransformValue(current, layerIndex, track, clampCompositionFrame(current, frame, true), value, createKeyframe) : current)
  }, [])

  const setLayerTransforms = useCallback((edits) => {
    if (!Array.isArray(edits) || !edits.length) return
    setSource((current) => current ? setLayerTransformValues(current, edits.map((edit) => ({ ...edit, frame: clampCompositionFrame(current, edit.frame, true) }))) : current)
  }, [])

  const merged = useMemo(() => source ? mergedLottie(source, replacements) : null, [source, replacements])
  const value = useMemo(() => ({ source, sourceName, replacements, selectedLayerIndex, selectedLayerIndices, selectLayer, selectAllLayers, hoveredLayerIndex, setHoveredLayerIndex, currentFrame, setCurrentFrame, seekFrame, timelineOpen, setTimelineOpen, notice, notify, storageState, loadJsonFile, replaceAsset, applyBatch, removeReplacement, setLayerTransform, setLayerTransforms, reset, merged }), [source, sourceName, replacements, selectedLayerIndex, selectedLayerIndices, selectLayer, selectAllLayers, hoveredLayerIndex, currentFrame, seekFrame, timelineOpen, notice, notify, storageState, loadJsonFile, replaceAsset, applyBatch, removeReplacement, setLayerTransform, setLayerTransforms, reset, merged])

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) throw new Error('useWorkspace must be used inside WorkspaceProvider')
  return context
}
