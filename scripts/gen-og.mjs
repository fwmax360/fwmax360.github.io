/**
 * 生成社交分享用的 og.png（1200x630）。
 * 内容改了就重跑：node scripts/gen-og.mjs
 */
import { writeFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'

const BG = '#0a0c10'
const SURFACE = '#12161d'
const LINE = '#2b3441'
const ACCENT = '#3ddc84'
const TEXT = '#eef2f7'
const DIM = '#8a97a8'
const FAINT = '#5a6675'

const MONO = 'JetBrains Mono, SFMono-Regular, Menlo, monospace'

const focus = ['frida', 'unidbg', 'ollvm', 'smali', 'elf', 'hook']

const grid = Array.from({ length: 22 }, (_, i) => {
  const x = i * 56
  return `<line x1="${x}" y1="0" x2="${x}" y2="630" stroke="${LINE}" stroke-width="1" opacity="0.35"/>`
})
  .concat(
    Array.from({ length: 12 }, (_, i) => {
      const y = i * 56
      return `<line x1="0" y1="${y}" x2="1200" y2="${y}" stroke="${LINE}" stroke-width="1" opacity="0.35"/>`
    }),
  )
  .join('')

const chips = focus
  .map((f, i) => {
    const x = 96 + i * 118
    return `
      <rect x="${x}" y="470" width="104" height="34" rx="6" fill="${SURFACE}" stroke="${LINE}"/>
      <text x="${x + 52}" y="493" font-family="${MONO}" font-size="15" fill="${DIM}" text-anchor="middle">${f}</text>`
  })
  .join('')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow" cx="50%" cy="0%" r="70%">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="1200" height="630" fill="${BG}"/>
  ${grid}
  <rect width="1200" height="630" fill="url(#glow)"/>

  <!-- 顶部标识 -->
  <text x="96" y="132" font-family="${MONO}" font-size="26" fill="${ACCENT}">$</text>
  <text x="126" y="132" font-family="${MONO}" font-size="26" fill="${TEXT}" font-weight="600">sleep4r</text>

  <!-- 主标题 -->
  <text x="96" y="278" font-family="${MONO}" font-size="62" fill="${TEXT}" font-weight="700">Android Reverse</text>
  <text x="96" y="352" font-family="${MONO}" font-size="62" fill="${TEXT}" font-weight="700">Engineering</text>

  <!-- 强调下划线 -->
  <rect x="96" y="382" width="120" height="4" rx="2" fill="${ACCENT}"/>

  <!-- 副标题 -->
  <text x="96" y="428" font-family="${MONO}" font-size="22" fill="${DIM}">&amp; Binary Security notes</text>

  ${chips}

  <!-- 页脚 -->
  <line x1="96" y1="556" x2="1104" y2="556" stroke="${LINE}" stroke-width="1"/>
  <text x="96" y="592" font-family="${MONO}" font-size="18" fill="${FAINT}">fwmax360.github.io</text>
  <text x="1104" y="592" font-family="${MONO}" font-size="18" fill="${FAINT}" text-anchor="end">$ _</text>
</svg>`

const png = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1200 },
  font: { loadSystemFonts: true },
}).render()

writeFileSync(new URL('../public/og.png', import.meta.url), png.asPng())
console.log('public/og.png 已生成')
