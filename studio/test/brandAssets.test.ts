/** The app icon IS the brand (round 2, B1 + B4). `docs/brand/togo/build-assets.mjs` writes every
 * raster from the SVG sources; this test reads what it wrote — the packaged icon is the Depth
 * tile at 256, the .ico and .icns carry the size ladder with the FLAT tile in the 16 px slot
 * (its ground pixel is accent-600 exactly), the builder config names the icon, and what the app
 * ships under public/brand is byte-identical to the brand source. Node only; no renderer. */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'

const studio = resolve(__dirname, '..')
const repo = resolve(studio, '..')
const brand = join(repo, 'docs', 'brand', 'togo')
const read = (p: string) => readFileSync(p)
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

/** Minimal PNG decode: 8-bit RGBA, non-interlaced (what librsvg writes). Enough to read a pixel. */
function decodePng(png: Buffer): { width: number; height: number; at(x: number, y: number): [number, number, number, number] } {
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  let o = 8, width = 0, height = 0
  const idat: Buffer[] = []
  while (o < png.length) {
    const len = png.readUInt32BE(o), type = png.subarray(o + 4, o + 8).toString('ascii'), data = png.subarray(o + 8, o + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4)
      expect([data[8], data[9], data[12]]).toEqual([8, 6, 0]) // 8-bit, RGBA, non-interlaced
    }
    if (type === 'IDAT') idat.push(data)
    o += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat)), bpp = 4, stride = width * bpp, out = Buffer.alloc(stride * height)
  let prev = Buffer.alloc(stride), i = 0
  for (let y = 0; y < height; y++) {
    const f = raw[i++]!, line = Buffer.from(raw.subarray(i, i + stride)); i += stride
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp]! : 0, b = prev[x]!, c = x >= bpp ? prev[x - bpp]! : 0
      if (f === 1) line[x] = (line[x]! + a) & 255
      else if (f === 2) line[x] = (line[x]! + b) & 255
      else if (f === 3) line[x] = (line[x]! + ((a + b) >> 1)) & 255
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        line[x] = (line[x]! + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255
      }
    }
    line.copy(out, y * stride); prev = line
  }
  return { width, height, at: (x, y) => { const k = (y * width + x) * 4; return [out[k]!, out[k + 1]!, out[k + 2]!, out[k + 3]!] } }
}

const near = (px: readonly number[], hex: string, tol = 2) => {
  const want = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16))
  for (let k = 0; k < 3; k++) expect(Math.abs(px[k]! - want[k]!)).toBeLessThanOrEqual(tol)
}

describe('build/icon.* is the brand tile', () => {
  it('icon.png is tile-depth-256 byte for byte', () => {
    expect(sha(read(join(studio, 'build', 'icon.png')))).toBe(sha(read(join(brand, 'exports', 'tile-depth-256.png'))))
  })

  it('icon.ico carries at least five PNG members; the 16 px one is the flat tile with an accent-600 ground', () => {
    const ico = read(join(studio, 'build', 'icon.ico'))
    expect(ico.readUInt16LE(2)).toBe(1)
    const count = ico.readUInt16LE(4)
    expect(count).toBeGreaterThanOrEqual(5)
    const members = Array.from({ length: count }, (_, k) => {
      const e = 6 + 16 * k
      const w = ico.readUInt8(e) || 256, size = ico.readUInt32LE(e + 8), off = ico.readUInt32LE(e + 12)
      return { w, png: ico.subarray(off, off + size) }
    })
    const sixteen = members.find((m) => m.w === 16)!
    expect(sixteen).toBeDefined()
    const img = decodePng(sixteen.png)
    expect([img.width, img.height]).toEqual([16, 16])
    // The tile's centre is the white disc, so the ground is read at the left and top mid-edges.
    near(img.at(1, 8), '#0E7C86')
    near(img.at(8, 1), '#0E7C86')
    expect(img.at(8, 8)[0]).toBe(255) // the disc: white, not a gradient
    expect(sixteen.png.equals(read(join(brand, 'exports', 'tile-16.png')))).toBe(true)
    // From 64 px the member is the Depth tile: its ground differs top-left vs bottom-right.
    const big = members.find((m) => m.w === 256)!
    const d = decodePng(big.png)
    expect(d.at(20, 20)[0]).toBeGreaterThan(d.at(236, 236)[0]! + 40)
  })

  it('icon.icns carries at least five PNG members with the flat tile at 16 px', () => {
    const icns = read(join(studio, 'build', 'icon.icns'))
    expect(icns.subarray(0, 4).toString('ascii')).toBe('icns')
    expect(icns.readUInt32BE(4)).toBe(icns.length)
    const members: Array<{ type: string; png: Buffer }> = []
    for (let o = 8; o < icns.length;) {
      const type = icns.subarray(o, o + 4).toString('ascii'), len = icns.readUInt32BE(o + 4)
      members.push({ type, png: icns.subarray(o + 8, o + len) })
      o += len
    }
    expect(members.length).toBeGreaterThanOrEqual(5)
    const sixteen = members.find((m) => m.type === 'icp4')!
    const img = decodePng(sixteen.png)
    expect(img.width).toBe(16)
    near(img.at(1, 8), '#0E7C86')
  })

  it('electron-builder names build/icon for mac and win', () => {
    const cfg = JSON.parse(readFileSync(join(studio, 'electron-builder.json'), 'utf8')) as { mac: { icon?: string }; win: { icon?: string } }
    expect(cfg.mac.icon).toBe('build/icon')
    expect(cfg.win.icon).toBe('build/icon')
  })
})

describe('public/brand ships the brand source unchanged', () => {
  for (const file of ['mark-a-macron.svg', 'mark-a-macron-depth.svg', 'tile.svg', 'tile-depth.svg']) {
    it(`${file} is byte-identical to docs/brand/togo`, () => {
      expect(read(join(studio, 'public', 'brand', file)).equals(read(join(brand, file)))).toBe(true)
    })
  }

  it('the pipeline script exists beside the sources and names the Depth floor', () => {
    const script = join(brand, 'build-assets.mjs')
    expect(existsSync(script)).toBe(true)
    expect(readFileSync(script, 'utf8')).toContain('DEPTH_FROM_PX = 64')
  })
})
