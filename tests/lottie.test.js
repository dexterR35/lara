import test from 'node:test'
import assert from 'node:assert/strict'
import { dataUrlToBlob, matchAssetFiles, parseLottieJson, safeBaseName } from '../src/lib/lottie.js'

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
  assert.equal(safeBaseName('///'), 'animation')
})
