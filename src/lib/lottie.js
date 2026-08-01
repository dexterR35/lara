import JSZip from 'jszip'

const IMAGE_EXTENSION = /\.(png|jpe?g|webp|gif|svg)$/i
export const MAX_LOTTIE_FILE_SIZE = 10 * 1024 * 1024

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

export async function parseLottieFile(file) {
  if (!file) throw new Error('Choose a Lottie JSON or .lottie file.')
  if (file.size > MAX_LOTTIE_FILE_SIZE) throw new Error('The selected file is larger than 10 MB.')

  if (!String(file.name || '').toLowerCase().endsWith('.lottie')) {
    return parseLottieJson(await file.text())
  }

  let zip
  try { zip = await JSZip.loadAsync(await file.arrayBuffer()) }
  catch { throw new Error('The selected .lottie file is not a valid dotLottie archive.') }

  const jsonEntries = Object.values(zip.files).filter((entry) => !entry.dir && /(^|\/)animations\/.*\.json$/i.test(entry.name))
  if (!jsonEntries.length) throw new Error('The .lottie archive does not contain an animation JSON file.')

  let preferredId = ''
  const manifestEntry = zip.file('manifest.json')
  if (manifestEntry) {
    try {
      const manifest = JSON.parse(await manifestEntry.async('string'))
      preferredId = manifest.initial?.animation || manifest.activeAnimationId || manifest.animations?.[0]?.id || ''
    } catch { /* Fall back to the first animation. */ }
  }
  const preferred = jsonEntries.find((entry) => entry.name.toLowerCase().endsWith(`animations/${preferredId.toLowerCase()}.json`))
  const data = parseLottieJson(await (preferred || jsonEntries[0]).async('string'))

  await Promise.all(imageAssets(data).map(async (asset) => {
    if (/^data:image\//i.test(String(asset.p))) return
    const relativePath = `${asset.u || ''}${asset.p || ''}`.replace(/^\.\//, '').replace(/^\//, '')
    const entry = zip.file(relativePath) || zip.file(`images/${String(asset.p || '').replace(/^\//, '')}`)
    if (!entry) return
    const extension = extensionForAsset(asset)
    const mime = extension === 'svg' ? 'image/svg+xml'
      : extension === 'jpg' ? 'image/jpeg'
        : `image/${extension}`
    asset.p = `data:${mime};base64,${await entry.async('base64')}`
    asset.u = ''
    asset.e = 1
  }))
  return data
}

export const imageAssets = (data) => (data?.assets || []).filter((asset) => asset && !Array.isArray(asset.layers) && asset.p)
export const embeddedImageAssets = (data) => imageAssets(data).filter((asset) => /^data:image\//i.test(String(asset.p)))

export function fontReferences(data) {
  const fonts = Array.isArray(data?.fonts?.list) ? data.fonts.list : []
  return fonts.map((font, index) => ({
    id: font.fName || font.fFamily || `font-${index + 1}`,
    family: font.fFamily || font.fName || 'Unknown family',
    style: font.fStyle || 'Regular',
    path: font.fPath || '',
  }))
}
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
  return String(name || fallback).replace(/\.(json|lottie)$/i, '').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || fallback
}

export function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}
