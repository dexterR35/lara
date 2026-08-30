import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import {
  clampCompositionFrame,
  compositionFrameBounds,
  dataUrlToBlob,
  embeddedImageAssets,
  fontReferences,
  lottieForPreview,
  MAX_IMAGE_FILE_SIZE,
  matchAssetFiles,
  mergedLottie,
  parseLottieFile,
  parseLottieJson,
  prepareImageFile,
  propertyKeyframes,
  propertyValueAtFrame,
  safeBaseName,
  safeFileName,
  setLayerTransformValue,
  setLayerTransformValues,
} from '../src/lib/lottie.js'

const minimal = { v: '5.12.0', w: 200, h: 100, fr: 30, ip: 0, op: 60, layers: [] }
const pixelPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const pixelPng = Uint8Array.from(atob(pixelPngBase64), (character) => character.charCodeAt(0))
const pixelPngDataUrl = `data:image/png;base64,${pixelPngBase64}`

test('parses UTF-8 BOM Lottie files and normalizes missing assets', () => {
  const parsed = parseLottieJson(`\uFEFF${JSON.stringify(minimal)}`)
  assert.deepEqual(parsed.assets, [])
  assert.equal(parsed.w, 200)
})

test('rejects malformed JSON and invalid composition dimensions', () => {
  assert.throws(() => parseLottieJson('{broken'), /invalid JSON/)
  assert.throws(() => parseLottieJson(JSON.stringify({ ...minimal, w: 0 })), /width and height/)
})

test('batch matching favors exact asset filenames and never reuses a file', () => {
  const assets = [
    { id: 'image_1', w: 64, h: 64, p: 'data:image/png;base64,AA==' },
    { id: 'image_10', w: 128, h: 128, p: 'data:image/png;base64,AA==' },
  ]
  const first = { name: 'image_1_64x64.png', type: 'image/png' }
  const tenth = { name: 'image_10.png', type: 'image/png' }
  const { matches, imageCount } = matchAssetFiles(assets, [tenth, first])
  assert.equal(imageCount, 2)
  assert.deepEqual(matches.map(([asset, file]) => [asset.id, file.name]), [['image_1', first.name], ['image_10', tenth.name]])
})

test('exports verified raster data and rejects active SVG data URLs', async () => {
  const blob = dataUrlToBlob(pixelPngDataUrl)
  assert.equal(blob.type, 'image/png')
  assert.equal(blob.size, pixelPng.byteLength)
  assert.throws(() => dataUrlToBlob('data:image/svg+xml,%3Csvg%20onload%3Dalert(1)%3E%3C%2Fsvg%3E'), /SVG is not accepted/)
})

test('creates filesystem-safe export names', () => {
  assert.equal(safeBaseName('My animation (final).json'), 'My-animation-final')
  assert.equal(safeBaseName('My animation.lottie'), 'My-animation')
  assert.equal(safeBaseName('///'), 'animation')
  assert.equal(safeFileName('../../evil\u202egnp.exe', 'image.png'), 'evilgnp.exe')
  assert.equal(safeFileName('CON.png', 'image.png'), '_CON.png')
})

test('reads dotLottie animations and embeds their archived images for extraction', async () => {
  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify({ initial: { animation: 'main' }, animations: [{ id: 'main' }] }))
  zip.file('animations/main.json', JSON.stringify({ ...minimal, assets: [{ id: 'image_0', u: 'images/', p: 'photo.png', w: 1, h: 1 }] }))
  zip.file('images/photo.png', pixelPng)
  const buffer = await zip.generateAsync({ type: 'uint8array' })
  const file = { name: 'sample.lottie', size: buffer.byteLength, arrayBuffer: async () => buffer.buffer }
  const parsed = await parseLottieFile(file)

  assert.equal(embeddedImageAssets(parsed).length, 1)
  assert.match(parsed.assets[0].p, /^data:image\/png;base64,/)
})

test('rejects unsafe archive paths and oversized expanded image entries', async () => {
  const unsafeZip = new JSZip()
  unsafeZip.file('../animations/main.json', JSON.stringify(minimal))
  const unsafeBuffer = await unsafeZip.generateAsync({ type: 'uint8array' })
  await assert.rejects(parseLottieFile(new File([unsafeBuffer], 'unsafe.lottie')), /unsafe file path/)

  const largeZip = new JSZip()
  largeZip.file('animations/main.json', JSON.stringify({ ...minimal, assets: [{ id: 'large', u: 'images/', p: 'large.png', w: 1, h: 1 }] }))
  largeZip.file('images/large.png', new Uint8Array(MAX_IMAGE_FILE_SIZE + 1))
  const largeBuffer = await largeZip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  await assert.rejects(parseLottieFile(new File([largeBuffer], 'large.lottie')), /larger than 10 MB/)
})

test('lists Lottie font family and style references', () => {
  assert.deepEqual(fontReferences({ fonts: { list: [{ fName: 'Inter-Bold', fFamily: 'Inter', fStyle: 'Bold' }] } }), [
    { id: 'Inter-Bold', family: 'Inter', style: 'Bold', path: '' },
  ])
})

test('rejects Lottie files larger than 50 MB', async () => {
  const file = { name: 'large.json', size: 50 * 1024 * 1024 + 1, text: async () => '' }
  await assert.rejects(parseLottieFile(file), /larger than 50 MB/)
})

test('verifies image bytes, declared type, extension, and pixel limits', async () => {
  const prepared = await prepareImageFile(new File([pixelPng], 'pixel.png', { type: 'image/png' }))
  assert.equal(prepared.type, 'image/png')
  assert.equal(prepared.width, 1)
  assert.equal(prepared.height, 1)
  assert.match(prepared.dataUrl, /^data:image\/png;base64,/)

  const losslessWebp = new Uint8Array(26)
  losslessWebp.set([...Buffer.from('RIFF'), 18, 0, 0, 0, ...Buffer.from('WEBPVP8L'), 5, 0, 0, 0, 0x2f, 0, 0, 0, 0])
  const preparedWebp = await prepareImageFile(new File([losslessWebp], 'pixel.webp', { type: 'image/webp' }))
  assert.deepEqual([preparedWebp.width, preparedWebp.height], [1, 1])

  await assert.rejects(prepareImageFile(new File([pixelPng], 'pixel.jpg', { type: 'image/jpeg' })), /extension does not match/)
  await assert.rejects(prepareImageFile(new File(['<script>alert(1)</script>'], 'pixel.png', { type: 'image/png' })), /not a valid supported image/)

  const oversizedHeader = pixelPng.slice()
  oversizedHeader.set([0, 0, 0x23, 0x29], 16) // 9001 px wide
  await assert.rejects(prepareImageFile(new File([oversizedHeader], 'wide.png', { type: 'image/png' })), /too large/)
})

test('sanitizes dangerous JSON keys and rejects ambiguous asset identifiers', () => {
  const hostile = JSON.stringify({ ...minimal, safe: { constructor: { polluted: true } } }).replace(/}$/, ',"__proto__":{"polluted":true}}')
  const parsed = parseLottieJson(hostile)
  assert.equal(Object.hasOwn(parsed.safe, 'constructor'), false)
  assert.equal(Object.hasOwn(parsed, '__proto__'), false)
  assert.equal({}.polluted, undefined)
  assert.throws(() => parseLottieJson(JSON.stringify({ ...minimal, assets: [{ id: 'same', p: 'a.png' }, { id: 'same', p: 'b.png' }] })), /duplicate asset id/)
})

test('blocks remote image and font requests in preview data without changing exports', () => {
  const source = {
    ...minimal,
    assets: [{ id: 'remote', p: 'tracker.png', u: 'https://attacker.example/' }, { id: 'local', p: pixelPngDataUrl, e: 1 }],
    fonts: { list: [{ fName: 'Remote', fPath: 'https://attacker.example/font.woff2' }] },
  }
  const preview = lottieForPreview(source)

  assert.equal(source.assets[0].u, 'https://attacker.example/')
  assert.equal(preview.assets[0].u, '')
  assert.match(preview.assets[0].p, /^data:image\/gif;base64,/)
  assert.equal(preview.assets[1].p, pixelPngDataUrl)
  assert.equal(preview.fonts.list[0].fPath, '')
})

test('treats the Lottie out-point as exclusive and snaps timeline edits', () => {
  assert.deepEqual(compositionFrameBounds({ ip: 10, op: 20 }), { start: 10, end: 19, exclusiveEnd: 20 })
  assert.equal(clampCompositionFrame({ ip: 10, op: 20 }, 20, true), 19)
  assert.equal(clampCompositionFrame({ ip: 10, op: 20 }, 14.6, true), 15)
})

test('creates native Lottie transform keyframes and interpolates their values', () => {
  const source = { ...minimal, layers: [{ ind: 1, ks: { p: { a: 0, k: [10, 20, 0] } } }] }
  const first = setLayerTransformValue(source, 0, 'p', 30, [70, 80, 0], true)
  assert.equal(first.layers[0].ks.p.a, 1)
  assert.deepEqual(first.layers[0].ks.p.k.map(({ t, s }) => ({ t, s })), [
    { t: 0, s: [10, 20, 0] },
    { t: 30, s: [70, 80, 0] },
  ])
  assert.deepEqual(propertyValueAtFrame(first.layers[0].ks.p, 15, [0, 0, 0]), [40, 50, 0])
  assert.deepEqual(first.layers[0].ks.p.k[0].i, { x: 1, y: 1 })
  assert.deepEqual(first.layers[0].ks.p.k[0].o, { x: 0, y: 0 })
  assert.deepEqual(source.layers[0].ks.p.k, [10, 20, 0])
})

test('batches multi-layer transform edits into one immutable result', () => {
  const source = { ...minimal, layers: [
    { ind: 1, ks: { p: { a: 0, k: [0, 0, 0] } } },
    { ind: 2, ks: { r: { a: 0, k: 0 } } },
  ] }
  const edited = setLayerTransformValues(source, [
    { layerIndex: 0, track: 'p', frame: 10, value: [20, 30, 0], createKeyframe: true },
    { layerIndex: 1, track: 'r', frame: 10, value: 45, createKeyframe: true },
  ])

  assert.deepEqual(propertyValueAtFrame(edited.layers[0].ks.p, 10, [0, 0, 0]), [20, 30, 0])
  assert.equal(propertyValueAtFrame(edited.layers[1].ks.r, 10, 0), 45)
  assert.deepEqual(source.layers[0].ks.p.k, [0, 0, 0])
  assert.equal(source.layers[1].ks.r.k, 0)
})

test('inserts a renderer-safe keyframe before an existing animated transform', () => {
  const source = { ...minimal, layers: [{ ind: 1, ks: { p: { a: 1, k: [{ i: { x: .8, y: .8 }, o: { x: .2, y: .2 }, t: 20, s: [10, 20, 0] }, { t: 40, s: [30, 40, 0] }] } } }] }
  const edited = setLayerTransformValue(source, 0, 'p', 0, [50, 60, 0], true)
  assert.deepEqual(edited.layers[0].ks.p.k[0].i, { x: .8, y: .8 })
  assert.deepEqual(edited.layers[0].ks.p.k[0].o, { x: .2, y: .2 })
})

test('keeps separated position dimensions animated when dragging a layer', () => {
  const source = { ...minimal, layers: [{ ind: 1, ks: { p: {
    s: true,
    x: { a: 1, k: [{ t: 0, s: [10] }, { t: 20, s: [30] }] },
    y: { a: 1, k: [{ t: 0, s: [20] }, { t: 20, s: [60] }] },
  } } }] }
  const edited = setLayerTransformValue(source, 0, 'p', 10, [25, 50, 0], true)

  assert.equal(edited.layers[0].ks.p.s, true)
  assert.deepEqual(edited.layers[0].ks.p.x.k.map(({ t, s }) => [t, s]), [[0, [10]], [10, [25]], [20, [30]]])
  assert.deepEqual(edited.layers[0].ks.p.y.k.map(({ t, s }) => [t, s]), [[0, [20]], [10, [50]], [20, [60]]])
  assert.deepEqual(propertyValueAtFrame(edited.layers[0].ks.p, 10, [0, 0, 0]), [25, 50, 0])
})

test('updates a preceding keyframe endpoint when an existing point moves', () => {
  const source = { ...minimal, layers: [{ ind: 1, ks: { p: { a: 1, k: [
    { t: 0, s: [0, 0, 0], e: [10, 10, 0] },
    { t: 10, s: [10, 10, 0] },
  ] } } }] }
  const edited = setLayerTransformValue(source, 0, 'p', 10, [20, 30, 0], true)

  assert.deepEqual(edited.layers[0].ks.p.k[0].e, [20, 30, 0])
  assert.deepEqual(propertyValueAtFrame(edited.layers[0].ks.p, 5, [0, 0, 0]), [10, 15, 0])
})

test('samples temporal easing instead of treating every keyframe as linear', () => {
  const property = { a: 1, k: [
    { t: 0, s: [0], o: { x: .42, y: 0 }, i: { x: 1, y: 1 } },
    { t: 10, s: [100] },
  ] }
  const halfway = propertyValueAtFrame(property, 5, 0)

  assert.ok(halfway > 30 && halfway < 33, `expected ease-in value near 31.5, received ${halfway}`)
})

test('sorts duplicate keyframe times and resolves terminal keyframes without an s value', () => {
  const property = { a: 1, k: [
    { t: 20 },
    { t: 0, s: [10], e: [30] },
    { t: 10, s: [20] },
    { t: 10, s: [25] },
  ] }
  assert.deepEqual(propertyKeyframes(property).map(({ t }) => t), [0, 10, 20])
  assert.equal(propertyValueAtFrame(property, 10, 0), 25)
  assert.equal(propertyValueAtFrame(property, 20, 0), 25)
})

test('samples spatial motion tangents along the curved path', () => {
  const property = { a: 1, k: [
    { t: 0, s: [0, 0, 0], to: [0, 100, 0], ti: [0, 100, 0], o: { x: 0, y: 0 }, i: { x: 1, y: 1 } },
    { t: 10, s: [100, 0, 0] },
  ] }
  const halfway = propertyValueAtFrame(property, 5, [0, 0, 0])

  assert.ok(Math.abs(halfway[0] - 50) < .1)
  assert.ok(Math.abs(halfway[1] - 75) < .1)
})

test('treats replacements for external images as embedded export assets', () => {
  const source = { ...minimal, assets: [{ id: 'photo', p: 'photo.png', u: 'images/', w: 10, h: 10 }] }
  const merged = mergedLottie(source, { photo: { dataUrl: pixelPngDataUrl } })

  assert.equal(embeddedImageAssets(source).length, 0)
  assert.equal(embeddedImageAssets(merged).length, 1)
})
