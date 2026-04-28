import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'
import pngToIco from 'png-to-ico'
import { PNG } from 'pngjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const publicDir = path.join(rootDir, 'public')

await mkdir(publicDir, { recursive: true })

const sourcePngPath = path.join(publicDir, 'favicon-source.png')
let svg

try {
  const png = await readFile(sourcePngPath)
  const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (png.length < pngMagic.length || !png.subarray(0, pngMagic.length).equals(pngMagic)) {
    throw new Error('favicon-source.png is not a valid PNG')
  }
  const decoded = PNG.sync.read(png)
  const { width, height, data } = decoded

  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3]
      if (a > 10) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < 0 || maxY < 0) {
    throw new Error('favicon-source.png has no visible pixels')
  }

  const pad = Math.max(2, Math.round(Math.max(width, height) * 0.04))
  minX = Math.max(0, minX - pad)
  minY = Math.max(0, minY - pad)
  maxX = Math.min(width - 1, maxX + pad)
  maxY = Math.min(height - 1, maxY + pad)

  const cropW = maxX - minX + 1
  const cropH = maxY - minY + 1
  const side = Math.max(cropW, cropH)
  const square = new PNG({ width: side, height: side, fill: true })
  square.data.fill(0)

  const offsetX = Math.floor((side - cropW) / 2)
  const offsetY = Math.floor((side - cropH) / 2)

  for (let y = 0; y < cropH; y++) {
    const srcStart = ((minY + y) * width + minX) * 4
    const srcEnd = srcStart + cropW * 4
    const dstStart = ((offsetY + y) * side + offsetX) * 4
    data.copy(square.data, dstStart, srcStart, srcEnd)
  }

  const squareBuf = PNG.sync.write(square)
  const base64 = squareBuf.toString('base64')
  svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <image href="data:image/png;base64,${base64}" x="0" y="0" width="512" height="512" preserveAspectRatio="xMidYMid meet" />
</svg>
`
} catch {
  svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="96" y1="144" x2="416" y2="368" gradientUnits="userSpaceOnUse">
      <stop stop-color="#19E7E7"/>
      <stop offset="1" stop-color="#147CFF"/>
    </linearGradient>
  </defs>
  <g fill="none" stroke="url(#g)" stroke-width="44" stroke-linecap="round" stroke-linejoin="round">
    <path d="M146 344c-40 0-74-31-74-71 0-35 26-64 60-70 14-42 54-71 102-71 60 0 110 45 117 104 45 5 79 43 71 89-8 46-50 82-100 82H190"/>
    <path d="M190 344h-22"/>
    <path d="M208 154l-22-30"/>
    <path d="M256 142v-38"/>
    <path d="M304 154l22-30"/>
  </g>
</svg>
`
}

await writeFile(path.join(publicDir, 'favicon.svg'), svg, 'utf8')

function renderPng(size) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'transparent',
  })
  const rendered = resvg.render()
  return rendered.asPng()
}

const pngOutputs = [
  { file: 'favicon-16x16.png', size: 16 },
  { file: 'favicon-32x32.png', size: 32 },
  { file: 'favicon-48x48.png', size: 48 },
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'android-chrome-192x192.png', size: 192 },
  { file: 'android-chrome-512x512.png', size: 512 },
]

await Promise.all(
  pngOutputs.map(async ({ file, size }) => {
    const buf = renderPng(size)
    await writeFile(path.join(publicDir, file), buf)
  }),
)

const ico = await pngToIco([
  path.join(publicDir, 'favicon-16x16.png'),
  path.join(publicDir, 'favicon-32x32.png'),
  path.join(publicDir, 'favicon-48x48.png'),
])
await writeFile(path.join(publicDir, 'favicon.ico'), ico)

const manifest = {
  name: '图片加水印',
  short_name: '水印',
  start_url: '/',
  display: 'standalone',
  background_color: '#ffffff',
  theme_color: '#ffffff',
  icons: [
    { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
    { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
  ],
}

await writeFile(
  path.join(publicDir, 'site.webmanifest'),
  JSON.stringify(manifest, null, 2),
  'utf8',
)
