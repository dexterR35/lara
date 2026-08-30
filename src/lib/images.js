const IMAGE_FORMATS = {
  png: { extension: 'png', mime: 'image/png' },
  jpg: { extension: 'jpg', mime: 'image/jpeg' },
  webp: { extension: 'webp', mime: 'image/webp' },
  gif: { extension: 'gif', mime: 'image/gif' },
}

const MIME_TO_FORMAT = new Map([
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/jpg', 'jpg'],
  ['image/pjpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
])

const EXTENSION_TO_FORMAT = new Map([
  ['png', 'png'],
  ['jpg', 'jpg'],
  ['jpeg', 'jpg'],
  ['webp', 'webp'],
  ['gif', 'gif'],
])

const DATA_IMAGE_PATTERN = /^data:(image\/(?:png|jpe?g|pjpeg|webp|gif));base64,([a-z0-9+/=\s]+)$/i
const CONTROL_AND_BIDI = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g

export const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024
export const MAX_IMAGE_DIMENSION = 8192
export const MAX_IMAGE_PIXELS = 40_000_000
export const MAX_BATCH_FILES = 500
export const MAX_BATCH_TOTAL_SIZE = 100 * 1024 * 1024
export const IMAGE_FILE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif'
export const SAFE_PLACEHOLDER_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

const supportedMessage = 'Use a PNG, JPG, WebP, or GIF image. SVG is not accepted because it can contain active content.'

function normalizedExtension(name) {
  const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/)
  return match ? EXTENSION_TO_FORMAT.get(match[1]) || '' : ''
}

function normalizedMime(type) {
  return MIME_TO_FORMAT.get(String(type || '').toLowerCase().split(';', 1)[0].trim()) || ''
}

function asBytes(value) {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  throw new Error('The image data could not be read.')
}

const ascii = (bytes, start, length) => String.fromCharCode(...bytes.subarray(start, start + length))
const uint16be = (bytes, offset) => (bytes[offset] << 8) | bytes[offset + 1]
const uint16le = (bytes, offset) => bytes[offset] | (bytes[offset + 1] << 8)
const uint24le = (bytes, offset) => bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)
const uint32be = (bytes, offset) => ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0
const uint32le = (bytes, offset) => (bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16) + (bytes[offset + 3] * 0x1000000)) >>> 0

function pngDimensions(bytes) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (bytes.length < 24 || !signature.every((byte, index) => bytes[index] === byte) || ascii(bytes, 12, 4) !== 'IHDR') return null
  return { format: 'png', width: uint32be(bytes, 16), height: uint32be(bytes, 20) }
}

function gifDimensions(bytes) {
  if (bytes.length < 10 || !['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6))) return null
  return { format: 'gif', width: uint16le(bytes, 6), height: uint16le(bytes, 8) }
}

function jpegDimensions(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])
  let offset = 2
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset]
    offset += 1
    if (marker === 0xd9 || marker === 0xda) break
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue
    if (offset + 1 >= bytes.length) break
    const length = uint16be(bytes, offset)
    if (length < 2 || offset + length > bytes.length) break
    if (startOfFrame.has(marker) && length >= 7) {
      return { format: 'jpg', width: uint16be(bytes, offset + 5), height: uint16be(bytes, offset + 3) }
    }
    offset += length
  }
  return null
}

function webpDimensions(bytes) {
  if (bytes.length < 21 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP' || uint32le(bytes, 4) + 8 > bytes.length) return null
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4)
    const size = uint32le(bytes, offset + 4)
    const data = offset + 8
    if (size > bytes.length - data) return null
    if (type === 'VP8X' && size >= 10) {
      return { format: 'webp', width: uint24le(bytes, data + 4) + 1, height: uint24le(bytes, data + 7) + 1 }
    }
    if (type === 'VP8 ' && size >= 10 && bytes[data + 3] === 0x9d && bytes[data + 4] === 0x01 && bytes[data + 5] === 0x2a) {
      return { format: 'webp', width: uint16le(bytes, data + 6) & 0x3fff, height: uint16le(bytes, data + 8) & 0x3fff }
    }
    if (type === 'VP8L' && size >= 5 && bytes[data] === 0x2f) {
      return {
        format: 'webp',
        width: 1 + bytes[data + 1] + ((bytes[data + 2] & 0x3f) << 8),
        height: 1 + (bytes[data + 2] >> 6) + (bytes[data + 3] << 2) + ((bytes[data + 4] & 0x0f) << 10),
      }
    }
    offset = data + size + (size % 2)
  }
  return null
}

function assertSafeDimensions(info) {
  if (!Number.isInteger(info.width) || !Number.isInteger(info.height) || info.width <= 0 || info.height <= 0) {
    throw new Error('The image has invalid dimensions.')
  }
  if (info.width > MAX_IMAGE_DIMENSION || info.height > MAX_IMAGE_DIMENSION || info.width * info.height > MAX_IMAGE_PIXELS) {
    throw new Error(`The image is too large. Use at most ${MAX_IMAGE_DIMENSION} px per side and ${Math.round(MAX_IMAGE_PIXELS / 1_000_000)} megapixels.`)
  }
  return { ...IMAGE_FORMATS[info.format], ...info }
}

export function inspectImageBytes(value) {
  const bytes = asBytes(value)
  if (!bytes.length) throw new Error('The image is empty.')
  if (bytes.byteLength > MAX_IMAGE_FILE_SIZE) throw new Error('The image is larger than 10 MB.')
  const info = pngDimensions(bytes) || gifDimensions(bytes) || jpegDimensions(bytes) || webpDimensions(bytes)
  if (!info) throw new Error(`The file is not a valid supported image. ${supportedMessage}`)
  return assertSafeDimensions(info)
}

function decodedBase64Length(value) {
  const clean = value.replace(/\s/g, '')
  if (!clean || !/^[a-z0-9+/]*={0,2}$/i.test(clean) || clean.length % 4 === 1) return -1
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0
  return Math.floor(clean.length * 3 / 4) - padding
}

function decodeBase64(value) {
  const clean = value.replace(/\s/g, '')
  const padded = clean.padEnd(Math.ceil(clean.length / 4) * 4, '=')
  let binary
  try { binary = atob(padded) }
  catch { throw new Error('The embedded image contains invalid base64 data.') }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

export function inspectImageDataUrl(value) {
  const match = String(value || '').match(DATA_IMAGE_PATTERN)
  if (!match) throw new Error(`Embedded images must use base64 PNG, JPG, WebP, or GIF data. ${supportedMessage}`)
  const length = decodedBase64Length(match[2])
  if (length < 0) throw new Error('The embedded image contains invalid base64 data.')
  if (length > MAX_IMAGE_FILE_SIZE) throw new Error('An embedded image is larger than 10 MB.')
  const bytes = decodeBase64(match[2])
  const info = inspectImageBytes(bytes)
  const declared = normalizedMime(match[1])
  if (declared !== info.format) throw new Error(`The embedded image claims to be ${declared || 'an unknown format'} but contains ${info.format.toUpperCase()} data.`)
  return { ...info, bytes }
}

export function isSafeImageDataUrl(value) {
  const dataUrl = String(value || '')
  const comma = dataUrl.indexOf(',')
  if (comma < 0 || !MIME_TO_FORMAT.has(dataUrl.slice(5, comma).replace(/;base64$/i, '').toLowerCase())) return false
  if (!/^data:image\/(?:png|jpe?g|pjpeg|webp|gif);base64$/i.test(dataUrl.slice(0, comma))) return false
  const encodedLength = dataUrl.length - comma - 1
  return encodedLength > 0 && encodedLength <= Math.ceil(MAX_IMAGE_FILE_SIZE * 4 / 3) + 4
}

export function safeImageSource(value) {
  return isSafeImageDataUrl(value) ? String(value) : ''
}

export function isImageFile(file) {
  if (!file) return false
  const extension = normalizedExtension(file.name)
  const type = String(file.type || '').toLowerCase().split(';', 1)[0]
  return Boolean(extension) && (!type || type === 'application/octet-stream' || Boolean(normalizedMime(type)))
}

export function safeFileName(name, fallback = 'image.png') {
  const fallbackName = String(fallback || 'image.png').split(/[\\/]/).pop() || 'image.png'
  let result = String(name || '').normalize('NFKC').split(/[\\/]/).pop() || fallbackName
  result = result.replace(CONTROL_AND_BIDI, '').replace(/[<>:"/\\|?*]+/g, '-').replace(/\s+/g, ' ').trim()
  result = result.replace(/^\.+/, '').replace(/[. ]+$/, '') || fallbackName
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(result)) result = `_${result}`
  if (result.length > 120) {
    const match = result.match(/(\.[a-z0-9]{1,10})$/i)
    const extension = match?.[1] || ''
    result = `${result.slice(0, 120 - extension.length).replace(/[. ]+$/, '')}${extension}`
  }
  return result || fallbackName
}

function bytesToBase64(value) {
  const bytes = asBytes(value)
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

export function imageBytesToDataUrl(value, info = inspectImageBytes(value)) {
  return `data:${info.mime};base64,${bytesToBase64(value)}`
}

export function imageDataUrlToBlob(value) {
  const { bytes, mime } = inspectImageDataUrl(value)
  return new Blob([bytes], { type: mime })
}

export async function prepareImageFile(file) {
  if (!isImageFile(file)) throw new Error(supportedMessage)
  const declaredSize = Number(file.size)
  if (!Number.isFinite(declaredSize) || declaredSize <= 0) throw new Error('The image is empty or has an invalid size.')
  if (declaredSize > MAX_IMAGE_FILE_SIZE) throw new Error('The image is larger than 10 MB.')

  let bytes
  try { bytes = new Uint8Array(await file.arrayBuffer()) }
  catch { throw new Error(`Could not read ${safeFileName(file.name, 'image')}.`) }
  if (bytes.byteLength > MAX_IMAGE_FILE_SIZE) throw new Error('The image is larger than 10 MB.')
  const info = inspectImageBytes(bytes)
  const extension = normalizedExtension(file.name)
  const declaredType = normalizedMime(file.type)
  if (extension !== info.format) throw new Error(`The file extension does not match its ${info.format.toUpperCase()} contents.`)
  if (declaredType && declaredType !== info.format) throw new Error(`The file type does not match its ${info.format.toUpperCase()} contents.`)

  const original = safeFileName(file.name, `image.${info.extension}`)
  const stem = original.replace(/\.[^.]+$/, '') || 'image'
  return {
    name: safeFileName(`${stem}.${info.extension}`, `image.${info.extension}`),
    size: bytes.byteLength,
    type: info.mime,
    dataUrl: imageBytesToDataUrl(bytes, info),
    width: info.width,
    height: info.height,
  }
}
