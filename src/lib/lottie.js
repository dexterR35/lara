import {
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_FILE_SIZE,
  MAX_IMAGE_PIXELS,
  SAFE_PLACEHOLDER_IMAGE,
  imageBytesToDataUrl,
  inspectImageBytes,
  inspectImageDataUrl,
  isImageFile,
  isSafeImageDataUrl,
  safeFileName,
  safeImageSource,
} from './images.js'

export {
  IMAGE_FILE_ACCEPT,
  MAX_BATCH_FILES,
  MAX_BATCH_TOTAL_SIZE,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_FILE_SIZE,
  MAX_IMAGE_PIXELS,
  imageDataUrlToBlob as dataUrlToBlob,
  isImageFile,
  isSafeImageDataUrl,
  prepareImageFile,
  safeFileName,
  safeImageSource,
} from './images.js'

export const MAX_LOTTIE_FILE_SIZE = 50 * 1024 * 1024
export const MAX_ARCHIVE_UNCOMPRESSED_SIZE = 100 * 1024 * 1024
export const MAX_ARCHIVE_ENTRIES = 2000
export const MAX_COMPOSITION_DIMENSION = 16_384
export const MAX_COMPOSITION_PIXELS = 67_108_864
export const MAX_COMPOSITION_FRAMES = 1_000_000
export const MAX_FRAME_RATE = 1000

const MAX_JSON_DEPTH = 100
const MAX_JSON_CONTAINERS = 1_000_000
const MAX_LAYERS = 20_000
const MAX_ASSETS = 20_000
const FORBIDDEN_OBJECT_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

function sanitizeJsonTree(value, state = { containers: 0 }, depth = 0) {
  if (depth > MAX_JSON_DEPTH) throw new Error(`Invalid Lottie: JSON nesting exceeds ${MAX_JSON_DEPTH} levels.`)
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Invalid Lottie: numeric values must be finite.')
    return value
  }
  if (typeof value !== 'object') throw new Error('Invalid Lottie: unsupported JSON value.')
  state.containers += 1
  if (state.containers > MAX_JSON_CONTAINERS) throw new Error('Invalid Lottie: the document contains too many objects.')
  if (Array.isArray(value)) return value.map((item) => sanitizeJsonTree(item, state, depth + 1))
  const result = {}
  Object.entries(value).forEach(([key, item]) => {
    if (!FORBIDDEN_OBJECT_KEYS.has(key)) result[key] = sanitizeJsonTree(item, state, depth + 1)
  })
  return result
}

const isScalarId = (value) => typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null

function validateLayers(layers, state, label = 'layers') {
  layers.forEach((layer, index) => {
    if (!layer || typeof layer !== 'object' || Array.isArray(layer)) throw new Error(`Invalid Lottie: ${label}[${index}] must be an object.`)
    state.layers += 1
    if (state.layers > MAX_LAYERS) throw new Error(`Invalid Lottie: animations are limited to ${MAX_LAYERS.toLocaleString()} layers.`)
    if (layer.nm != null && typeof layer.nm !== 'string') throw new Error(`Invalid Lottie: ${label}[${index}].nm must be text.`)
    if (typeof layer.nm === 'string' && layer.nm.length > 10_000) throw new Error(`Invalid Lottie: ${label}[${index}].nm is too long.`)
    ;['ind', 'parent', 'refId'].forEach((field) => {
      if (layer[field] != null && !isScalarId(layer[field])) throw new Error(`Invalid Lottie: ${label}[${index}].${field} has an invalid value.`)
    })
    if (layer.ty != null) {
      const type = finite(layer.ty)
      if (type == null) throw new Error(`Invalid Lottie: ${label}[${index}].ty must be numeric.`)
      layer.ty = type
    }
    if (layer.ks != null && (!layer.ks || typeof layer.ks !== 'object' || Array.isArray(layer.ks))) {
      throw new Error(`Invalid Lottie: ${label}[${index}].ks must be an object.`)
    }
    ;['ip', 'op', 'st', 'sr'].forEach((field) => {
      if (layer[field] == null) return
      const value = finite(layer[field])
      if (value == null || (field === 'sr' && value === 0)) throw new Error(`Invalid Lottie: ${label}[${index}].${field} must be numeric${field === 'sr' ? ' and non-zero' : ''}.`)
      layer[field] = value
    })
  })
}

export function validateLottie(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('This JSON is not a Lottie animation.')
  const cleaned = sanitizeJsonTree(data)
  if (!Array.isArray(cleaned.layers)) throw new Error("Invalid Lottie: 'layers' must be an array.")
  if (cleaned.assets != null && !Array.isArray(cleaned.assets)) throw new Error("Invalid Lottie: 'assets' must be an array.")
  cleaned.assets ||= []

  const width = finite(cleaned.w)
  const height = finite(cleaned.h)
  if (!(width > 0) || !(height > 0)) throw new Error('Invalid Lottie: composition width and height are required.')
  if (width > MAX_COMPOSITION_DIMENSION || height > MAX_COMPOSITION_DIMENSION || width * height > MAX_COMPOSITION_PIXELS) {
    throw new Error(`Invalid Lottie: the composition exceeds ${MAX_COMPOSITION_DIMENSION.toLocaleString()} px per side or ${Math.round(MAX_COMPOSITION_PIXELS / 1_000_000)} megapixels.`)
  }
  const fps = finite(cleaned.fr)
  const firstFrame = finite(cleaned.ip)
  const outPoint = finite(cleaned.op)
  if (!(fps > 0) || fps > MAX_FRAME_RATE || firstFrame == null || outPoint == null || outPoint <= firstFrame) {
    throw new Error(`Invalid Lottie: a frame rate from 0 to ${MAX_FRAME_RATE} fps and a valid in/out frame range are required.`)
  }
  if (outPoint - firstFrame > MAX_COMPOSITION_FRAMES) throw new Error(`Invalid Lottie: animations are limited to ${MAX_COMPOSITION_FRAMES.toLocaleString()} frames.`)
  Object.assign(cleaned, { w: width, h: height, fr: fps, ip: firstFrame, op: outPoint })

  const state = { layers: 0 }
  validateLayers(cleaned.layers, state)
  if (cleaned.assets.length > MAX_ASSETS) throw new Error(`Invalid Lottie: animations are limited to ${MAX_ASSETS.toLocaleString()} assets.`)
  const assetIds = new Set()
  cleaned.assets.forEach((asset, index) => {
    if (!asset || typeof asset !== 'object' || Array.isArray(asset)) throw new Error(`Invalid Lottie: assets[${index}] must be an object.`)
    if (!isScalarId(asset.id) || !String(asset.id).length || String(asset.id).length > 500) throw new Error(`Invalid Lottie: assets[${index}].id is required and must be at most 500 characters.`)
    const id = String(asset.id)
    if (assetIds.has(id)) throw new Error(`Invalid Lottie: duplicate asset id “${id.slice(0, 120)}”.`)
    assetIds.add(id)
    if (asset.p != null && typeof asset.p !== 'string') throw new Error(`Invalid Lottie: asset “${id.slice(0, 120)}” has an invalid image path.`)
    if (asset.u != null && typeof asset.u !== 'string') throw new Error(`Invalid Lottie: asset “${id.slice(0, 120)}” has an invalid image directory.`)
    if (typeof asset.p === 'string' && !asset.p.startsWith('data:') && asset.p.length > 4096) throw new Error(`Invalid Lottie: asset “${id.slice(0, 120)}” has an image path that is too long.`)
    if (typeof asset.u === 'string' && asset.u.length > 2048) throw new Error(`Invalid Lottie: asset “${id.slice(0, 120)}” has an image directory that is too long.`)
    if (Array.isArray(asset.layers)) validateLayers(asset.layers, state, `assets[${index}].layers`)
    if (!Array.isArray(asset.layers) && asset.p) {
      const assetWidth = asset.w == null ? null : finite(asset.w)
      const assetHeight = asset.h == null ? null : finite(asset.h)
      if ((asset.w != null && !(assetWidth > 0)) || (asset.h != null && !(assetHeight > 0))) {
        throw new Error(`Invalid Lottie: asset “${id.slice(0, 120)}” has invalid dimensions.`)
      }
      if (assetWidth != null) asset.w = assetWidth
      if (assetHeight != null) asset.h = assetHeight
      if ((assetWidth && assetWidth > MAX_IMAGE_DIMENSION) || (assetHeight && assetHeight > MAX_IMAGE_DIMENSION) || (assetWidth && assetHeight && assetWidth * assetHeight > MAX_IMAGE_PIXELS)) {
        throw new Error(`Invalid Lottie: asset “${id.slice(0, 120)}” exceeds the image dimension limit.`)
      }
      if (asset.p.startsWith('data:')) {
        try { inspectImageDataUrl(asset.p) }
        catch (error) { throw new Error(`Invalid Lottie asset “${id.slice(0, 120)}”: ${error.message}`) }
      }
    }
  })
  return cleaned
}

export function parseLottieJson(text) {
  try { return validateLottie(JSON.parse(String(text).replace(/^\uFEFF/, ''))) }
  catch (error) {
    if (error instanceof SyntaxError) throw new Error('The selected file contains invalid JSON.')
    throw error
  }
}

export async function parseLottieFile(file) {
  if (!file) throw new Error('Choose a Lottie JSON or .lottie file.')
  const name = String(file.name || '')
  if (!/\.(json|lottie)$/i.test(name)) throw new Error('Choose a .json or .lottie file.')
  if (!(Number(file.size) >= 0)) throw new Error('The selected file has an invalid size.')
  if (file.size > MAX_LOTTIE_FILE_SIZE) throw new Error('The selected file is larger than 50 MB.')

  if (!name.toLowerCase().endsWith('.lottie')) {
    return parseLottieJson(await file.text())
  }

  let zip
  try {
    const { default: JSZip } = await import('jszip')
    zip = await JSZip.loadAsync(await file.arrayBuffer())
  }
  catch { throw new Error('The selected .lottie file is not a valid dotLottie archive.') }

  const entries = Object.values(zip.files)
  if (entries.length > MAX_ARCHIVE_ENTRIES) throw new Error(`The .lottie archive contains more than ${MAX_ARCHIVE_ENTRIES.toLocaleString()} entries.`)
  let expandedSize = 0
  const entriesByPath = new Map()
  entries.forEach((entry) => {
    const originalName = entry.unsafeOriginalName || entry.name
    const normalized = normalizeArchivePath(originalName)
    if (!normalized) throw new Error('The .lottie archive contains an unsafe file path.')
    const size = Number(entry._data?.uncompressedSize ?? 0)
    if (!Number.isFinite(size) || size < 0) throw new Error('The .lottie archive contains an invalid entry size.')
    expandedSize += size
    if (expandedSize > MAX_ARCHIVE_UNCOMPRESSED_SIZE) throw new Error('The .lottie archive expands beyond the 100 MB safety limit.')
    if (!entry.dir) {
      const key = normalized.toLowerCase()
      if (entriesByPath.has(key)) throw new Error('The .lottie archive contains duplicate file paths.')
      entriesByPath.set(key, entry)
    }
  })

  const jsonEntries = [...entriesByPath.entries()].filter(([path]) => /(^|\/)animations\/[^/]+\.json$/i.test(path)).map(([, entry]) => entry)
  if (!jsonEntries.length) throw new Error('The .lottie archive does not contain an animation JSON file.')
  jsonEntries.forEach((entry) => {
    if (Number(entry._data?.uncompressedSize ?? 0) > MAX_LOTTIE_FILE_SIZE) throw new Error('An animation JSON inside the archive is larger than 50 MB.')
  })

  let preferredId = ''
  const manifestEntry = entriesByPath.get('manifest.json')
  if (manifestEntry) {
    try {
      if (Number(manifestEntry._data?.uncompressedSize ?? 0) > 1024 * 1024) throw new Error('Manifest is too large.')
      const manifest = JSON.parse(await manifestEntry.async('string'))
      const candidate = manifest.initial?.animation || manifest.activeAnimationId || manifest.animations?.[0]?.id
      if (typeof candidate === 'string' && /^[a-z0-9._-]{1,200}$/i.test(candidate)) preferredId = candidate
    } catch { /* Fall back to the first animation. */ }
  }
  const preferred = preferredId ? entriesByPath.get(`animations/${preferredId}.json`.toLowerCase()) : null
  const data = parseLottieJson(await (preferred || jsonEntries[0]).async('string'))

  for (const asset of imageAssets(data)) {
    if (String(asset.p).startsWith('data:')) continue
    const relativePath = normalizeArchivePath(`${asset.u || ''}${asset.p || ''}`)
    const fallbackPath = normalizeArchivePath(`images/${String(asset.p || '').replace(/^\/+/, '')}`)
    const entry = (relativePath && entriesByPath.get(relativePath.toLowerCase())) || (fallbackPath && entriesByPath.get(fallbackPath.toLowerCase()))
    if (!entry) continue
    if (Number(entry._data?.uncompressedSize ?? 0) > MAX_IMAGE_FILE_SIZE) throw new Error(`Archive image “${safeFileName(asset.p, 'image')}” is larger than 10 MB.`)
    const bytes = await entry.async('uint8array')
    let info
    try { info = inspectImageBytes(bytes) }
    catch (error) { throw new Error(`Archive image “${safeFileName(asset.p, 'image')}”: ${error.message}`) }
    asset.p = imageBytesToDataUrl(bytes, info)
    asset.u = ''
    asset.e = 1
  }
  return validateLottie(data)
}

function normalizeArchivePath(value) {
  const path = String(value || '').replace(/\\/g, '/')
  if (!path || path.includes('\0') || path.startsWith('/')) return null
  const segments = path.split('/')
  if (segments.some((segment) => segment === '..')) return null
  return segments.filter((segment) => segment && segment !== '.').join('/') || null
}

export const imageAssets = (data) => (data?.assets || []).filter((asset) => asset && !Array.isArray(asset.layers) && asset.p)
export const embeddedImageAssets = (data) => imageAssets(data).filter((asset) => isSafeImageDataUrl(asset.p))

export function fontReferences(data) {
  const fonts = Array.isArray(data?.fonts?.list) ? data.fonts.list : []
  const text = (value, fallback) => (typeof value === 'string' || typeof value === 'number') ? String(value).slice(0, 500) : fallback
  return fonts.filter((font) => font && typeof font === 'object' && !Array.isArray(font)).map((font, index) => ({
    id: text(font.fName, text(font.fFamily, `font-${index + 1}`)),
    family: text(font.fFamily, text(font.fName, 'Unknown family')),
    style: text(font.fStyle, 'Regular'),
    path: text(font.fPath, ''),
  }))
}
export function refsByAsset(data) {
  const refs = new Map()
  const collect = (layers = []) => layers.forEach((layer) => {
    if (!layer.refId) return
    const id = String(layer.refId)
    const names = refs.get(id) || new Set()
    names.add(typeof layer.nm === 'string' ? layer.nm : 'Unnamed layer')
    refs.set(id, names)
  })
  collect(data?.layers)
  data?.assets?.forEach((asset) => Array.isArray(asset.layers) && collect(asset.layers))
  return Object.fromEntries([...refs].map(([id, names]) => [id, [...names]]))
}

export function extensionForAsset(asset) {
  const match = String(asset.p || '').match(/^data:image\/(png|jpe?g|pjpeg|webp|gif);base64,/i)
  if (match) return match[1].replace(/jpeg|pjpeg/i, 'jpg').toLowerCase()
  const extension = String(asset.p || '').split(/[?#]/)[0].split('.').pop()?.toLowerCase()
  return ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extension) ? extension.replace('jpeg', 'jpg') : 'png'
}

export function expectedFilename(asset) {
  const fallback = `${safeFileName(asset.id || 'image', 'image')}.${extensionForAsset(asset)}`
  if (!String(asset.p).startsWith('data:')) return safeFileName(String(asset.p).split(/[?#]/)[0], fallback)
  return safeFileName(`${asset.id || 'image'}_${asset.w || 'x'}x${asset.h || 'x'}.${extensionForAsset(asset)}`, fallback)
}

export const assetSource = (asset) => safeImageSource(asset?.p)

export function lottieForPreview(data) {
  const result = structuredClone(data)
  result.assets?.forEach((asset) => {
    if (Array.isArray(asset?.layers) || !asset?.p) return
    if (isSafeImageDataUrl(asset.p)) {
      asset.u = ''
      asset.e = 1
      return
    }
    asset.p = SAFE_PLACEHOLDER_IMAGE
    asset.u = ''
    asset.e = 1
  })
  if (Array.isArray(result.fonts?.list)) result.fonts.list.forEach((font) => { if (font && typeof font === 'object') font.fPath = '' })
  return result
}

export function compositionFrameBounds(data) {
  const first = Number(data?.ip)
  const outPoint = Number(data?.op)
  const start = Number.isFinite(first) ? first : 0
  const exclusiveEnd = Number.isFinite(outPoint) && outPoint > start ? outPoint : start + 1
  return { start, end: Math.max(start, Math.ceil(exclusiveEnd) - 1), exclusiveEnd }
}

export function clampCompositionFrame(data, frame, snap = false) {
  const { start, end } = compositionFrameBounds(data)
  const candidate = Number(frame)
  const finiteFrame = Number.isFinite(candidate) ? candidate : start
  const normalized = snap ? start + Math.round(finiteFrame - start) : finiteFrame
  return Math.max(start, Math.min(end, normalized))
}

export const TRANSFORM_TRACKS = [
  { key: 'a', label: 'Anchor point', dimensions: ['X', 'Y'], fallback: [0, 0, 0] },
  { key: 'p', label: 'Position', dimensions: ['X', 'Y'], fallback: [0, 0, 0] },
  { key: 's', label: 'Scale', dimensions: ['X', 'Y'], fallback: [100, 100, 100] },
  { key: 'r', label: 'Rotation', dimensions: ['°'], fallback: 0 },
  { key: 'o', label: 'Opacity', dimensions: ['%'], fallback: 100 },
]

const finiteNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback
const cloneValue = (value) => Array.isArray(value) ? value.map((item) => finiteNumber(item)) : finiteNumber(value)
const normalizeValue = (value, fallback) => {
  if (value == null) return cloneValue(fallback)
  if (!Array.isArray(fallback) && Array.isArray(value)) return finiteNumber(value[0])
  return cloneValue(value)
}

export function layerIdentity(layer, index) {
  return String(layer?.ind ?? `layer-${index}`)
}

export function propertyKeyframes(property) {
  if (property?.s && property.x && property.y) {
    const frames = new Set()
    ;[property.x, property.y, property.z].filter(Boolean).forEach((dimension) => propertyKeyframes(dimension).forEach(({ t }) => frames.add(Number(t))))
    return [...frames].sort((a, b) => a - b).map((t) => ({ t }))
  }
  if (!property || property.a !== 1 || !Array.isArray(property.k)) return []
  const frames = new Map()
  property.k.forEach((keyframe) => {
    if (keyframe && Number.isFinite(Number(keyframe.t))) frames.set(Number(keyframe.t), keyframe)
  })
  return [...frames.entries()].sort(([a], [b]) => a - b).map(([, keyframe]) => keyframe)
}

const cubic = (start, control1, control2, end, amount) => {
  const inverse = 1 - amount
  return inverse ** 3 * start + 3 * inverse ** 2 * amount * control1 + 3 * inverse * amount ** 2 * control2 + amount ** 3 * end
}

function easingCoordinate(value, dimension = 0) {
  if (!Array.isArray(value)) return Number(value)
  return Number(value[dimension] ?? value[0])
}

function easedProgress(keyframe, progress, dimension = 0) {
  if (progress <= 0 || progress >= 1) return progress
  const outX = easingCoordinate(keyframe.o?.x, dimension)
  const outY = easingCoordinate(keyframe.o?.y, dimension)
  const inX = easingCoordinate(keyframe.i?.x, dimension)
  const inY = easingCoordinate(keyframe.i?.y, dimension)
  if (![outX, outY, inX, inY].every(Number.isFinite)) return progress
  if (outX === outY && inX === inY) return progress
  let low = 0
  let high = 1
  for (let iteration = 0; iteration < 18; iteration += 1) {
    const amount = (low + high) / 2
    if (cubic(0, outX, inX, 1, amount) < progress) low = amount
    else high = amount
  }
  return cubic(0, outY, inY, 1, (low + high) / 2)
}

function spatialValue(start, end, outgoing, incoming, progress) {
  const dimensions = Math.max(start.length, end.length)
  const point = (amount) => Array.from({ length: dimensions }, (_, index) => cubic(
    Number(start[index]) || 0,
    (Number(start[index]) || 0) + (Number(outgoing[index]) || 0),
    (Number(end[index]) || 0) + (Number(incoming[index]) || 0),
    Number(end[index]) || 0,
    amount,
  ))
  const samples = [{ amount: 0, value: point(0), length: 0 }]
  let total = 0
  for (let index = 1; index <= 100; index += 1) {
    const value = point(index / 100)
    const previous = samples.at(-1).value
    total += Math.hypot(...value.map((coordinate, dimension) => coordinate - previous[dimension]))
    samples.push({ amount: index / 100, value, length: total })
  }
  if (!total) return [...start]
  const target = total * progress
  const afterIndex = samples.findIndex((sample) => sample.length >= target)
  if (afterIndex <= 0) return samples[0].value
  const before = samples[afterIndex - 1]
  const after = samples[afterIndex]
  const segment = after.length - before.length
  const amount = segment ? (target - before.length) / segment : 0
  return before.value.map((coordinate, index) => coordinate + (after.value[index] - coordinate) * amount)
}

export function propertyValueAtFrame(property, frame, fallback = 0) {
  if (!property) return cloneValue(fallback)
  if (property.s && property.x && property.y) {
    return [
      propertyValueAtFrame(property.x, frame, 0),
      propertyValueAtFrame(property.y, frame, 0),
      propertyValueAtFrame(property.z, frame, 0),
    ]
  }
  if (property.a !== 1 || !Array.isArray(property.k)) return normalizeValue(property.k, fallback)
  const keyframes = propertyKeyframes(property)
  if (!keyframes.length) return cloneValue(fallback)
  const candidate = Number(frame)
  const target = Number.isFinite(candidate) ? candidate : 0
  let currentIndex = 0
  let nextIndex = -1
  for (let index = 0; index < keyframes.length; index += 1) {
    if (Number(keyframes[index].t) <= target) currentIndex = index
    if (Number(keyframes[index].t) > target) { nextIndex = index; break }
  }
  const current = keyframes[currentIndex]
  const next = nextIndex >= 0 ? keyframes[nextIndex] : null
  const start = normalizeValue(keyframeStartValue(keyframes, currentIndex, fallback), fallback)
  if (!next || Number(current.h) === 1 || Number(next.t) === Number(current.t)) return start
  const end = normalizeValue(next.s ?? current.e ?? keyframeStartValue(keyframes, nextIndex, start), start)
  const progress = Math.max(0, Math.min(1, (target - Number(current.t)) / (Number(next.t) - Number(current.t))))
  if (Array.isArray(start)) {
    const temporal = easedProgress(current, progress)
    if (Array.isArray(current.to) && Array.isArray(current.ti)) return spatialValue(start, end, current.to, current.ti, temporal)
    return start.map((value, index) => {
      const amount = easedProgress(current, progress, index)
      return value + ((end[index] ?? value) - value) * amount
    })
  }
  return start + (end - start) * easedProgress(current, progress)
}

function keyframeStartValue(keyframes, index, fallback) {
  const current = keyframes[index]
  if (current?.s != null) return current.s
  for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
    const previous = keyframes[previousIndex]
    if (previous?.e != null) return previous.e
    if (previous?.s != null) return previous.s
  }
  return fallback
}

function newKeyframe(frame, value, template) {
  const keyframe = {
    i: structuredClone(template?.i ?? { x: 1, y: 1 }),
    o: structuredClone(template?.o ?? { x: 0, y: 0 }),
    t: frame,
    s: Array.isArray(value) ? cloneValue(value) : [cloneValue(value)],
  }
  if (template?.to) keyframe.to = Array.isArray(value) ? value.map(() => 0) : 0
  if (template?.ti) keyframe.ti = Array.isArray(value) ? value.map(() => 0) : 0
  return keyframe
}

function setTransformPropertyValue(property, frame, value, fallback, createKeyframe, initialFrame) {
  const normalized = normalizeValue(value, fallback)
  const keyframeValue = (candidate) => {
    const result = normalizeValue(candidate, fallback)
    return Array.isArray(result) ? result : [result]
  }
  if (!createKeyframe && property.a !== 1) {
    property.a = 0
    property.k = normalized
    return
  }

  const frameNumber = Number(frame)
  const targetFrame = Number.isFinite(frameNumber) ? frameNumber : initialFrame
  const sourceKeyframes = propertyKeyframes(property)
  let keyframes = sourceKeyframes.map((keyframe, index) => ({ ...keyframe, s: keyframeValue(keyframeStartValue(sourceKeyframes, index, fallback)) }))
  if (!keyframes.length) {
    const initialValue = propertyValueAtFrame(property, initialFrame, fallback)
    if (initialFrame !== targetFrame) keyframes.push(newKeyframe(initialFrame, initialValue))
  }
  const existing = keyframes.find((keyframe) => Number(keyframe.t) === targetFrame)
  if (existing) existing.s = keyframeValue(normalized)
  else {
    const template = keyframes.find((keyframe) => Number(keyframe.t) > targetFrame) || keyframes.at(-1)
    keyframes.push(newKeyframe(targetFrame, normalized, template))
  }
  keyframes.sort((a, b) => Number(a.t) - Number(b.t))
  keyframes.forEach((keyframe, index) => {
    const next = keyframes[index + 1]
    if (next && Object.hasOwn(keyframe, 'e')) keyframe.e = cloneValue(next.s)
  })
  property.a = 1
  property.k = keyframes
}

function applyLayerTransformValue(result, layerIndex, track, frame, value, createKeyframe = false) {
  const layer = result.layers?.[layerIndex]
  if (!layer) return result
  const definition = TRANSFORM_TRACKS.find((item) => item.key === track)
  if (!definition) return result
  layer.ks ||= {}
  const fallback = definition.fallback
  const property = layer.ks[track] ||= { a: 0, k: cloneValue(fallback) }
  const normalized = normalizeValue(value, fallback)
  const initialFrame = Number(result.ip) || 0

  if (track === 'p' && property.s && property.x && property.y) {
    ;['x', 'y', 'z'].forEach((dimension, index) => {
      if (!property[dimension] && dimension === 'z') return
      const dimensionProperty = property[dimension] ||= { a: 0, k: Number(propertyValueAtFrame(property, frame, fallback)[index]) || 0 }
      setTransformPropertyValue(dimensionProperty, frame, normalized[index], fallback[index], createKeyframe, initialFrame)
    })
    return result
  }

  setTransformPropertyValue(property, frame, normalized, fallback, createKeyframe, initialFrame)
  return result
}

export function setLayerTransformValue(data, layerIndex, track, frame, value, createKeyframe = false) {
  return applyLayerTransformValue(structuredClone(data), layerIndex, track, frame, value, createKeyframe)
}

export function setLayerTransformValues(data, edits) {
  const result = structuredClone(data)
  if (!Array.isArray(edits)) return result
  edits.forEach((edit) => {
    if (!edit || typeof edit !== 'object') return
    applyLayerTransformValue(result, edit.layerIndex, edit.track, edit.frame, edit.value, Boolean(edit.createKeyframe))
  })
  return result
}

export function mergedLottie(source, replacements) {
  const result = structuredClone(source)
  result.assets?.forEach((asset) => {
    const id = String(asset.id)
    const replacement = replacements && Object.hasOwn(replacements, id) ? replacements[id] : null
    if (replacement && isSafeImageDataUrl(replacement.dataUrl)) Object.assign(asset, { p: replacement.dataUrl, u: '', e: 1 })
  })
  return result
}

export function matchAssetFiles(assets, files) {
  const available = files.filter(isImageFile).map((file) => ({ file, name: file.name.toLowerCase(), stem: file.name.replace(/\.[^.]+$/, '').toLowerCase() }))
  const used = new Set()
  const matches = []

  for (const asset of assets) {
    const id = String(asset.id || '').toLowerCase()
    const expected = expectedFilename(asset).toLowerCase()
    const candidate = available.find((item) => !used.has(item.file) && item.name === expected)
      || available.find((item) => !used.has(item.file) && item.stem === id)
      || available.find((item) => !used.has(item.file) && item.stem.startsWith(`${id}_`))
    if (candidate) {
      used.add(candidate.file)
      matches.push([asset, candidate.file])
    }
  }
  return { matches, imageCount: available.length }
}

export function safeBaseName(name, fallback = 'animation') {
  const sanitized = safeFileName(name, fallback).replace(/\.(json|lottie)$/i, '').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '')
  return (sanitized || fallback).slice(0, 80)
}

export function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}
