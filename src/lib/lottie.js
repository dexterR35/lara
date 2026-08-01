export function validateLottie(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.layers) || !Array.isArray(data.assets)) throw new Error('This JSON does not look like a Lottie animation.')
  return data
}

export const imageAssets = (data) => (data?.assets || []).filter((asset) => asset && !Array.isArray(asset.layers) && asset.p)

export function refsByAsset(data) {
  const refs = {}
  const collect = (layers = []) => layers.forEach((layer) => { if (layer.refId) (refs[layer.refId] ||= []).push(layer.nm || 'Unnamed layer') })
  collect(data?.layers)
  data?.assets?.forEach((asset) => Array.isArray(asset.layers) && collect(asset.layers))
  return refs
}

export function extensionForAsset(asset) {
  const match = String(asset.p || '').match(/^data:image\/([a-z0-9.+-]+)/i)
  if (match) return match[1].replace('jpeg', 'jpg').split('+')[0]
  return String(asset.p || '').split('.').pop()?.toLowerCase() || 'png'
}

export function expectedFilename(asset) {
  if (!String(asset.p).startsWith('data:image')) return String(asset.p).split('/').pop()
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

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
    reader.readAsDataURL(file)
  })
}

export function dataUrlToBlob(dataUrl) {
  const [header, body] = dataUrl.split(',')
  const mime = header.match(/data:([^;]+)/)?.[1] || 'application/octet-stream'
  const binary = atob(body)
  return new Blob([Uint8Array.from(binary, (char) => char.charCodeAt(0))], { type: mime })
}

export function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}
