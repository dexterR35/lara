import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { dataUrlToBlob, embeddedImageAssets, fontReferences, matchAssetFiles, parseLottieFile, parseLottieJson, propertyValueAtFrame, safeBaseName, setLayerTransformValue } from '../src/lib/lottie.js'

const minimal = { v: '5.12.0', w: 200, h: 100, fr: 30, ip: 0, op: 60, layers: [] }

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

test('exports percent-encoded SVG data URLs', async () => {
  const blob = dataUrlToBlob('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E')
  assert.equal(blob.type, 'image/svg+xml')
  assert.match(await blob.text(), /^<svg/)
})

test('creates filesystem-safe export names', () => {
  assert.equal(safeBaseName('My animation (final).json'), 'My-animation-final')
  assert.equal(safeBaseName('My animation.lottie'), 'My-animation')
  assert.equal(safeBaseName('///'), 'animation')
})

test('reads dotLottie animations and embeds their archived images for extraction', async () => {
  const zip = new JSZip()
  zip.file('manifest.json', JSON.stringify({ initial: { animation: 'main' }, animations: [{ id: 'main' }] }))
  zip.file('animations/main.json', JSON.stringify({ ...minimal, assets: [{ id: 'image_0', u: 'images/', p: 'photo.png', w: 1, h: 1 }] }))
  zip.file('images/photo.png', Uint8Array.from([137, 80, 78, 71]))
  const buffer = await zip.generateAsync({ type: 'uint8array' })
  const file = { name: 'sample.lottie', size: buffer.byteLength, arrayBuffer: async () => buffer.buffer }
  const parsed = await parseLottieFile(file)

  assert.equal(embeddedImageAssets(parsed).length, 1)
  assert.match(parsed.assets[0].p, /^data:image\/png;base64,/)
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

test('inserts a renderer-safe keyframe before an existing animated transform', () => {
  const source = { ...minimal, layers: [{ ind: 1, ks: { p: { a: 1, k: [{ i: { x: .8, y: .8 }, o: { x: .2, y: .2 }, t: 20, s: [10, 20, 0] }, { t: 40, s: [30, 40, 0] }] } } }] }
  const edited = setLayerTransformValue(source, 0, 'p', 0, [50, 60, 0], true)
  assert.deepEqual(edited.layers[0].ks.p.k[0].i, { x: .8, y: .8 })
  assert.deepEqual(edited.layers[0].ks.p.k[0].o, { x: .2, y: .2 })
})
