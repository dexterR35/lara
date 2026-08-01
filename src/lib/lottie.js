const IMAGE_EXTENSION = /\.(png|jpe?g|webp|gif|svg)$/i

export function validateLottie(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('This JSON is not a Lottie animation.')
  if (!Array.isArray(data.layers)) throw new Error("Invalid Lottie: 'layers' must be an array.")
  if (data.assets != null && !Array.isArray(data.assets)) throw new Error("Invalid Lottie: 'assets' must be an array.")
  if (!(Number(data.w) > 0) || !(Number(data.h) > 0)) throw new Error('Invalid Lottie: composition width and height are required.')
  return { ...data, assets: data.assets || [] }
}

export function parseLottieJson(text) {
  try { return validateLottie(JSON.parse(String(text).replace(/^\uFEFF/, ''))) }
  catch (error) {
    if (error instanceof SyntaxError) throw new Error('The selected file contains invalid JSON.')
    throw error
  }
}

export const imageAssets = (data) => (data?.assets || []).filter((asset) => asset && !Array.isArray(asset.layers) && asset.p)
export const isImageFile = (file) => Boolean(file) && (file.type?.startsWith('image/') || IMAGE_EXTENSION.test(file.name || ''))

export function refsByAsset(data) {
  const refs = {}
  const collect = (layers = []) => layers.forEach((layer) => {
    if (!layer.refId) return
    const names = refs[layer.refId] ||= new Set()
    names.add(layer.nm || 'Unnamed layer')
  })
  collect(data?.layers)
  data?.assets?.forEach((asset) => Array.isArray(asset.layers) && collect(asset.layers))
  return Object.fromEntries(Object.entries(refs).map(([id, names]) => [id, [...names]]))
}

export function extensionForAsset(asset) {
  const match = String(asset.p || '').match(/^data:image\/([a-z0-9.+-]+)/i)
  if (match) return match[1].replace('jpeg', 'jpg').split('+')[0]
  return String(asset.p || '').split(/[?#]/)[0].split('.').pop()?.toLowerCase() || 'png'
}

export function expectedFilename(asset) {
  if (!String(asset.p).startsWith('data:image')) return String(asset.p).split(/[\\/]/).pop().split(/[?#]/)[0]
  return `${asset.id || 'image'}_${asset.w || 'x'}x${asset.h || 'x'}.${extensionForAsset(asset)}`
}

export const assetSource = (asset) => String(asset?.p || '').startsWith('data:') ? asset.p : `${asset?.u || ''}${asset?.p || ''}`

export function mergedLottie(source, replacements) {
  const result = structuredClone(source)
  result.assets?.forEach((asset) => {
    const replacement = replacements[asset.id]
    if (replacement) Object.assign(asset, { p: replacement.dataUrl, u: '', e: 1 })
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

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
    reader.onabort = () => reject(new Error(`Reading ${file.name} was cancelled.`))
    reader.readAsDataURL(file)
  })
}

export function dataUrlToBlob(dataUrl) {
  const comma = String(dataUrl).indexOf(',')
  if (comma < 0) throw new Error('An embedded asset contains an invalid data URL.')
  const header = dataUrl.slice(0, comma)
  const body = dataUrl.slice(comma + 1)
  const mime = header.match(/^data:([^;,]+)/)?.[1] || 'application/octet-stream'
  if (!header.includes(';base64')) return new Blob([decodeURIComponent(body)], { type: mime })
  const binary = atob(body.replace(/\s/g, ''))
  return new Blob([Uint8Array.from(binary, (char) => char.charCodeAt(0))], { type: mime })
}

export function safeBaseName(name, fallback = 'animation') {
  return String(name || fallback).replace(/\.json$/i, '').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || fallback
}

export function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}
