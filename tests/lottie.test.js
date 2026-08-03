import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { dataUrlToBlob, embeddedImageAssets, fontReferences, matchAssetFiles, mergedLottie, parseLottieFile, parseLottieJson, propertyValueAtFrame, safeBaseName, setLayerTransformValue } from '../src/lib/lottie.js'

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
  const merged = mergedLottie(source, { photo: { dataUrl: 'data:image/png;base64,AA==' } })

  assert.equal(embeddedImageAssets(source).length, 0)
  assert.equal(embeddedImageAssets(merged).length, 1)
})
