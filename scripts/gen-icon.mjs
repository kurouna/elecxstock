// build/icon.svg（と 32px 以下用の icon-small.svg）から PNG と ICO を作る（§10.1）。
import { readFileSync, writeFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'

const root = new URL('../build/', import.meta.url)
const big = readFileSync(new URL('icon.svg', root), 'utf8')
const small = readFileSync(new URL('icon-small.svg', root), 'utf8')
const png = (svg, size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()

writeFileSync(new URL('icon.png', root), png(big, 1024))
const sizes = [16, 24, 32, 48, 64, 128, 256]
const images = sizes.map((s) => png(s <= 32 ? small : big, s))
// ICO: 画像の数だけ 16 バイトの見出し、中身は PNG のまま
const head = Buffer.alloc(6 + 16 * images.length)
head.writeUInt16LE(0, 0)
head.writeUInt16LE(1, 2)
head.writeUInt16LE(images.length, 4)
let offset = head.length
images.forEach((img, i) => {
  const s = sizes[i]
  const o = 6 + 16 * i
  head.writeUInt8(s >= 256 ? 0 : s, o)
  head.writeUInt8(s >= 256 ? 0 : s, o + 1)
  head.writeUInt8(0, o + 2)
  head.writeUInt8(0, o + 3)
  head.writeUInt16LE(1, o + 4)
  head.writeUInt16LE(32, o + 6)
  head.writeUInt32LE(img.length, o + 8)
  head.writeUInt32LE(offset, o + 12)
  offset += img.length
})
writeFileSync(new URL('icon.ico', root), Buffer.concat([head, ...images]))
console.log('icon.png, icon.ico written')
