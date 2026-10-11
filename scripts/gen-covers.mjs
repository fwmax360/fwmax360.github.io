/**
 * 为 src/content/posts 下的文章生成确定性的 1200×630 封面。
 *
 * 输出：public/covers/posts/<slug>.svg + public/covers/posts/<slug>.png
 * 用法：npm run covers；只读校验：npm run covers:check
 */
import { createHash } from 'node:crypto'
import { wrapTitle, textWeight } from './cover-title.mjs'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const POSTS_DIR = join(ROOT, 'src/content/posts')
const OUTPUT_DIR = join(ROOT, 'public/covers/posts')
const SERIES_THEMES_PATH = join(ROOT, 'src/lib/seriesThemes.json')
const WIDTH = 1200
const HEIGHT = 630
const CLI_ARGS = process.argv.slice(2)
const CHECK_MODE = CLI_ARGS.includes('--check')

const COLORS = {
  bg: '#07090d',
  surface: '#0d1219',
  surfaceRaised: '#111821',
  line: '#25303d',
  lineBright: '#354456',
  text: '#f1f5f9',
  dim: '#93a1b2',
  faint: '#566475',
}

const SERIES_THEMES = await loadSeriesThemes()

const SANS = `'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif`
const MONO = `'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace`

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validateSeriesThemes(value) {
  if (!isRecord(value)) throw new Error('seriesThemes.json 顶层必须为对象')
  const { toneOrder, signatureOrder, palettes, signatureMarks, known, categoryTones, defaultCategoryTone } = value
  if (!Array.isArray(toneOrder) || toneOrder.length === 0) {
    throw new Error('seriesThemes.json 缺少 toneOrder')
  }
  if (!Array.isArray(signatureOrder) || signatureOrder.length === 0) {
    throw new Error('seriesThemes.json 缺少 signatureOrder')
  }
  if (!isRecord(palettes) || !isRecord(signatureMarks) || !isRecord(known)) {
    throw new Error('seriesThemes.json 的 palettes/signatureMarks/known 格式错误')
  }

  for (const tone of toneOrder) {
    const palette = palettes[tone]
    if (!isRecord(palette) || !/^#[0-9a-f]{6}$/i.test(String(palette.accent ?? ''))) {
      throw new Error(`seriesThemes.json 的 ${tone}.accent 格式错误`)
    }
    for (const field of ['soft', 'glow', 'ink', 'angle']) {
      if (typeof palette[field] !== 'string' || !palette[field]) {
        throw new Error(`seriesThemes.json 的 ${tone}.${field} 缺失`)
      }
    }
  }
  for (const signature of signatureOrder) {
    if (typeof signatureMarks[signature] !== 'string' || !signatureMarks[signature]) {
      throw new Error(`seriesThemes.json 缺少 signatureMarks.${signature}`)
    }
  }
  for (const [name, theme] of Object.entries(known)) {
    if (
      !isRecord(theme) ||
      !toneOrder.includes(theme.tone) ||
      !signatureOrder.includes(theme.signature) ||
      typeof theme.code !== 'string' ||
      !theme.code
    ) {
      throw new Error(`seriesThemes.json 的已知系列“${name}”配置错误`)
    }
  }
  if (!isRecord(categoryTones) || !toneOrder.includes(defaultCategoryTone) ||
      Object.values(categoryTones).some(tone => !toneOrder.includes(tone))) {
    throw new Error('seriesThemes.json 的分类色彩配置错误')
  }
  return value
}

async function loadSeriesThemes() {
  let parsed
  try {
    parsed = JSON.parse(await readFile(SERIES_THEMES_PATH, 'utf8'))
  } catch (error) {
    throw new Error(`读取 seriesThemes.json 失败：${error instanceof Error ? error.message : error}`)
  }
  return validateSeriesThemes(parsed)
}

function xml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function hash32(value) {
  let hash = 0x811c9dc5
  for (const char of value) {
    hash ^= char.codePointAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function seriesAccent(name) {
  const knownTone = SERIES_THEMES.known[name]?.tone
  const tone = knownTone ?? SERIES_THEMES.toneOrder[hash32(name) % SERIES_THEMES.toneOrder.length]
  return SERIES_THEMES.palettes[tone].accent
}

function parseArray(value) {
  const source = value.trim().slice(1, -1)
  const items = []
  let token = ''
  let quote = ''

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quote) {
      if (char === quote && source[index - 1] !== '\\') quote = ''
      else token += char
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      continue
    }
    if (char === ',') {
      if (token.trim()) items.push(token.trim())
      token = ''
      continue
    }
    token += char
  }
  if (token.trim()) items.push(token.trim())
  return items
}

function parseScalar(value) {
  const trimmed = value.trim()
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) return parseArray(trimmed)
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed)
  if (trimmed === 'true' || trimmed === 'false') return trimmed === 'true'
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith("'") && trimmed.endsWith("'")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"')))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseFrontmatter(source, path) {
  const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) throw new Error(`${path}: 缺少 frontmatter`)

  const data = {}
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    const field = line.match(/^([A-Za-z][\w-]*):\s*(.*)$/)
    if (field) data[field[1]] = parseScalar(field[2])
  }
  return data
}

async function collectMarkdownFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await collectMarkdownFiles(path)))
    else if (/\.mdx?$/.test(entry.name)) files.push(path)
  }
  return files
}

async function collectCoverAssets(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return []
    throw error
  }

  const files = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...(await collectCoverAssets(path)))
    else if (entry.isFile() && /\.(?:png|svg)$/i.test(entry.name)) files.push(path)
  }
  return files
}

async function loadPosts() {
  const files = await collectMarkdownFiles(POSTS_DIR)
  return Promise.all(
    files.map(async (path) => {
      const data = parseFrontmatter(await readFile(path, 'utf8'), path)
      const slug = relative(POSTS_DIR, path)
        .split(sep)
        .join('/')
        .slice(0, -extname(path).length)

      for (const key of ['title', 'pubDate', 'category']) {
        if (!data[key]) throw new Error(`${path}: frontmatter 缺少 ${key}`)
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.pubDate))) {
        throw new Error(`${path}: pubDate 必须为 YYYY-MM-DD`)
      }

      return {
        slug,
        title: String(data.title),
        pubDate: String(data.pubDate),
        category: String(data.category),
        tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
        series: data.series ? String(data.series) : undefined,
        order: Number.isFinite(data.order) ? Number(data.order) : undefined,
      }
    }),
  )
}

function topicDiagram(post) {
  const topic = `${post.title} ${post.tags.join(' ')}`.toLowerCase()
  if (
    /vpn|代理|抓包|网络|iptables|netfilter|mitm|reqable|charles/.test(topic) ||
    /\b(?:rc4|aes|des)\b/.test(topic)
  ) {
    return 'flow'
  }
  if (/elf|pe\b|内存|文件描述符|栈帧|calling|peb|teb|address/.test(topic)) return 'address'
  return 'call'
}

function metadataFor(post) {
  const seed = [post.slug, post.title, post.category, post.series ?? '', ...post.tags].join('|')
  const hash = hash32(seed)
  const accent = post.series
    ? seriesAccent(post.series)
    : SERIES_THEMES.palettes[SERIES_THEMES.categoryTones[post.category] ?? SERIES_THEMES.defaultCategoryTone].accent
  return { hash, accent, diagram: topicDiagram(post) }
}

function addressDiagram(hash, accent) {
  const rowWidths = [0, 1, 2, 3].map((index) => 112 + ((hash >>> (index * 4)) & 0x3f))
  const rows = rowWidths
    .map((width, index) => {
      const y = 207 + index * 57
      return `
        <rect x="858" y="${y}" width="${width}" height="22" rx="3" fill="${accent}" opacity="${0.12 + index * 0.035}"/>
        <rect x="858" y="${y}" width="${Math.max(24, width * (0.2 + ((hash >>> index) & 3) * 0.12))}" height="22" rx="3" fill="${accent}" opacity="0.72"/>
        <line x1="${858 + width}" y1="${y + 11}" x2="1115" y2="${y + 11}" stroke="${COLORS.lineBright}" stroke-width="1" stroke-dasharray="3 5"/>
        <circle cx="1115" cy="${y + 11}" r="3" fill="${accent}"/>
      `
    })
    .join('')

  return `
    <text x="858" y="167" class="diagram-label" fill="${accent}">MEMORY / ADDRESS MAP</text>
    ${rows}
    <line x1="841" y1="190" x2="841" y2="409" stroke="${accent}" stroke-width="2" opacity="0.8"/>
    <path d="M 858 406 H 1084 L 1118 372" fill="none" stroke="${accent}" stroke-width="1.5" opacity="0.7"/>
  `
}

function callDiagram(hash, accent) {
  const shifts = [0, 1, 2, 3].map((index) => ((hash >>> (index * 5)) & 0x1f) - 15)
  const nodes = [
    { x: 875 + shifts[0], y: 208, label: 'ENTRY' },
    { x: 1052 + shifts[1], y: 256, label: 'CALL' },
    { x: 900 + shifts[2], y: 329, label: 'HOOK' },
    { x: 1062 + shifts[3], y: 386, label: 'RETURN' },
  ]
  const paths = nodes
    .slice(0, -1)
    .map((node, index) => {
      const next = nodes[index + 1]
      const midY = Math.round((node.y + next.y) / 2)
      return `<path d="M ${node.x} ${node.y + 16} C ${node.x} ${midY}, ${next.x} ${midY}, ${next.x} ${next.y - 16}" fill="none" stroke="${index === 1 ? accent : COLORS.lineBright}" stroke-width="${index === 1 ? 2 : 1.5}" marker-end="url(#arrow)"/>`
    })
    .join('')
  const nodeSvg = nodes
    .map(
      (node, index) => `
        <circle cx="${node.x}" cy="${node.y}" r="${index === 2 ? 20 : 16}" fill="${COLORS.surfaceRaised}" stroke="${index === 2 ? accent : COLORS.lineBright}" stroke-width="${index === 2 ? 2 : 1}"/>
        <circle cx="${node.x}" cy="${node.y}" r="4" fill="${accent}" opacity="${0.5 + index * 0.12}"/>
        <text x="${node.x + (index % 2 ? -24 : 24)}" y="${node.y - 7}" class="micro" text-anchor="${index % 2 ? 'end' : 'start'}" fill="${COLORS.dim}">${node.label}</text>
      `,
    )
    .join('')

  return `
    <text x="858" y="167" class="diagram-label" fill="${accent}">CALL CHAIN / TRACE</text>
    ${paths}
    ${nodeSvg}
    <path d="M 858 430 h 35 l 7 -10 10 20 10 -16 9 6 h 189" fill="none" stroke="${accent}" stroke-width="1.5" opacity="0.72"/>
  `
}

function flowDiagram(post, hash, accent) {
  const topic = `${post.title} ${post.tags.join(' ')}`.toLowerCase()
  const labels = /vpn|代理|抓包|网络|iptables|mitm|reqable|charles/.test(topic)
    ? ['APP', 'TUN', 'PROXY', 'HOST']
    : ['PLAIN', 'ROUND', 'STATE', 'CIPHER']
  const columns = labels
    .map((label, index) => {
      const x = 858 + index * 68
      const height = 75 + ((hash >>> (index * 4)) & 0x3f)
      const y = 337 - height
      return `
        <rect x="${x}" y="${y}" width="46" height="${height}" rx="5" fill="${COLORS.surfaceRaised}" stroke="${index === 2 ? accent : COLORS.lineBright}"/>
        <rect x="${x + 7}" y="${y + 11}" width="${20 + ((hash >>> index) & 0xf)}" height="3" rx="1.5" fill="${accent}" opacity="${0.38 + index * 0.13}"/>
        <text x="${x + 23}" y="359" class="micro" text-anchor="middle" fill="${index === 2 ? accent : COLORS.dim}">${label}</text>
        ${index < labels.length - 1 ? `<path d="M ${x + 47} ${y + height / 2} H ${x + 64}" stroke="${accent}" stroke-width="1.5" marker-end="url(#arrow)"/>` : ''}
      `
    })
    .join('')

  const packetY = 393 + (hash & 7)
  return `
    <text x="858" y="167" class="diagram-label" fill="${accent}">DATA FLOW / PIPELINE</text>
    ${columns}
    <line x1="858" y1="380" x2="1118" y2="380" stroke="${COLORS.line}" stroke-width="1"/>
    <path d="M 858 ${packetY} l 16 0 8 -13 13 27 12 -22 10 13 11 -8 12 0 8 8 18 0 7 -16 15 28 12 -20 12 8 h 106" fill="none" stroke="${accent}" stroke-width="1.6" opacity="0.78"/>
  `
}

function diagramSvg(post, meta) {
  if (meta.diagram === 'address') return addressDiagram(meta.hash, meta.accent)
  if (meta.diagram === 'flow') return flowDiagram(post, meta.hash, meta.accent)
  return callDiagram(meta.hash, meta.accent)
}

function chipSvg(tags, accent) {
  let x = 72
  const elements = []
  for (const tag of tags.slice(0, 4)) {
    // Small bold labels need extra glyph/padding budget across Linux fallback fonts.
    const width = Math.ceil(Math.max(62, 40 + textWeight(tag) * 14))
    if (x + width > 790) break
    elements.push(`
      <rect x="${x}" y="480" width="${width}" height="31" rx="4" fill="${COLORS.surfaceRaised}" stroke="${COLORS.line}"/>
      <circle cx="${x + 14}" cy="495.5" r="2.5" fill="${accent}"/>
      <text x="${x + 24}" y="500.5" class="chip" fill="${COLORS.dim}">${xml(tag)}</text>
    `)
    x += width + 10
  }
  return elements.join('')
}

function renderSvg(post) {
  const meta = metadataFor(post)
  const title = wrapTitle(post.title)
  const titleStart = title.lines.length === 1 ? 235 : title.lines.length === 2 ? 207 : 202
  const titleSvg = title.lines
    .map(
      (line, lineIndex) =>
        `<tspan x="72" y="${titleStart + lineIndex * title.lineHeight}">${xml(line)}</tspan>`,
    )
    .join('')
  const titleBottom = titleStart + (title.lines.length - 1) * title.lineHeight
  const metaY = Math.min(431, titleBottom + 50)
  const series = post.series ?? '独立笔记'
  const chapter = post.series && post.order ? ` · 第 ${post.order} 篇` : ''
  const categoryLabel = post.category.toUpperCase()
  const diagram = diagramSvg(post, meta)
  const chips = chipSvg(post.tags, meta.accent)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="cover-title cover-desc">
  <title id="cover-title">${xml(post.title)}</title>
  <desc id="cover-desc">${xml(post.category)} · ${xml(post.pubDate)} · ${xml(series)} ${post.order ? `第 ${post.order} 章` : ''}</desc>
  <defs>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M 48 0 L 0 0 0 48" fill="none" stroke="${COLORS.line}" stroke-width="1" opacity="0.42"/>
      <circle cx="0" cy="0" r="1.25" fill="${COLORS.lineBright}" opacity="0.58"/>
    </pattern>
    <radialGradient id="glow" cx="88%" cy="35%" r="88%">
      <stop offset="0" stop-color="${meta.accent}" stop-opacity="0.64"/>
      <stop offset="0.52" stop-color="${meta.accent}" stop-opacity="0.24"/>
      <stop offset="1" stop-color="${meta.accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="wash" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="${meta.accent}" stop-opacity="0.32"/>
      <stop offset="0.6" stop-color="${meta.accent}" stop-opacity="0.025"/>
      <stop offset="1" stop-color="${meta.accent}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="rail" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${meta.accent}" stop-opacity="0.95"/>
      <stop offset="0.58" stop-color="${meta.accent}" stop-opacity="0.14"/>
      <stop offset="1" stop-color="${meta.accent}" stop-opacity="0"/>
    </linearGradient>
    <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M 0 0 L 8 4 L 0 8 z" fill="${meta.accent}"/>
    </marker>
    <style>
      .mono { font-family: ${MONO}; }
      .sans { font-family: ${SANS}; }
      .micro { font-family: ${MONO}; font-size: 10px; letter-spacing: .75px; }
      .chip { font-family: ${SANS}; font-size: 12px; font-weight: 600; }
      .diagram-label { font-family: ${MONO}; font-size: 11px; font-weight: 700; letter-spacing: 1.2px; }
    </style>
  </defs>

  <rect width="1200" height="630" fill="${COLORS.bg}"/>
  <rect width="1200" height="630" fill="url(#wash)"/>
  <rect width="1200" height="630" fill="url(#grid)" opacity="0.25"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect x="15" y="15" width="380" height="2" fill="url(#rail)"/>

  <circle cx="72" cy="63" r="4" fill="${meta.accent}"/>
  <text x="88" y="68" class="mono" font-size="18" font-weight="500" letter-spacing="0" fill="${COLORS.text}">sleep4r / Notes</text>
  <text x="1128" y="68" class="mono" font-size="11" text-anchor="end" letter-spacing="1" fill="${COLORS.faint}">${xml(post.pubDate)}</text>
  <line x1="72" y1="91" x2="1128" y2="91" stroke="${COLORS.line}"/>

  <rect x="72" y="119" width="${Math.max(92, 44 + categoryLabel.length * 9)}" height="28" rx="3" fill="${meta.accent}" opacity="0.12" stroke="${meta.accent}"/>
  <text x="87" y="138" class="mono" font-size="11" font-weight="700" letter-spacing="1.2" fill="${meta.accent}">${xml(categoryLabel)}</text>

  <text class="sans" font-size="${title.fontSize}" font-weight="400" letter-spacing="0" fill="${COLORS.text}">${titleSvg}</text>
  <text x="72" y="${metaY + 10}" class="sans" font-size="20" font-weight="400" fill="${COLORS.dim}">${xml(series)}${xml(chapter)}</text>

  <rect x="824" y="119" width="304" height="340" rx="7" fill="${COLORS.surface}" fill-opacity="0.35" stroke="${meta.accent}" stroke-opacity="0.35"/>
  <path d="M 824 156 V 126 Q 824 119 831 119 H 861" fill="none" stroke="${meta.accent}" stroke-width="2"/>
  <circle cx="1112" cy="135" r="2" fill="${meta.accent}" opacity="0.8"/>
  ${diagram}

  ${chips}
  <line x1="72" y1="545" x2="1128" y2="545" stroke="${COLORS.line}"/>
  <text x="72" y="584" class="mono" font-size="14" font-weight="400" letter-spacing="0" fill="${COLORS.dim}">fwmax360.github.io</text>
  <text x="1128" y="584" class="mono" font-size="11" text-anchor="end" letter-spacing="1" fill="${COLORS.faint}">Concept sketch</text>
  <rect x="72" y="601" width="88" height="2" fill="${meta.accent}"/>
</svg>`.split('\n').map(line => line.trimEnd()).join('\n')
}

function pngDimensions(buffer) {
  const signature = '89504e470d0a1a0a'
  if (
    buffer.length < 24 ||
    buffer.subarray(0, 8).toString('hex') !== signature ||
    buffer.subarray(12, 16).toString('ascii') !== 'IHDR'
  ) {
    return null
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

async function checkCovers(posts) {
  const errors = []
  const actualFiles = await collectCoverAssets(OUTPUT_DIR)
  const actualNames = new Set(
    actualFiles.map((path) => relative(OUTPUT_DIR, path).split(sep).join('/')),
  )
  const expectedNames = new Set(
    posts.flatMap((post) => [`${post.slug}.svg`, `${post.slug}.png`]),
  )

  for (const name of [...expectedNames].sort()) {
    if (!actualNames.has(name)) errors.push(`缺少 public/covers/posts/${name}`)
  }
  for (const name of [...actualNames].sort()) {
    if (!expectedNames.has(name)) errors.push(`存在孤立资产 public/covers/posts/${name}`)
  }

  for (let index = 0; index < posts.length; index += 1) {
    const post = posts[index]
    const svgName = `${post.slug}.svg`
    const pngName = `${post.slug}.png`

    if (actualNames.has(svgName)) {
      const storedSvg = await readFile(join(OUTPUT_DIR, ...svgName.split('/')), 'utf8')
      const expectedSvg = `${renderSvg(post)}\n`
      if (storedSvg !== expectedSvg) {
        errors.push(`${svgName} 与当前文章 frontmatter/共享主题配置不一致`)
      }
    }

    if (actualNames.has(pngName)) {
      const png = await readFile(join(OUTPUT_DIR, ...pngName.split('/')))
      const dimensions = pngDimensions(png)
      if (!dimensions) errors.push(`${pngName} 不是有效的 PNG`)
      else if (dimensions.width !== WIDTH || dimensions.height !== HEIGHT) {
        errors.push(
          `${pngName} 尺寸为 ${dimensions.width}×${dimensions.height}，期望 ${WIDTH}×${HEIGHT}`,
        )
      }
    }
  }

  if (errors.length > 0) {
    console.error(`封面校验失败（${errors.length} 项）：`)
    for (const error of errors) console.error(`  - ${error}`)
    console.error('请在本地运行 npm run covers，确认生成结果后提交静态资产。')
    process.exitCode = 1
    return
  }

  console.log(
    `封面校验通过：${posts.length} 篇文章，${actualNames.size} 个 SVG/PNG，PNG 均为 ${WIDTH}×${HEIGHT}`,
  )
}

async function writeCover(post, Resvg) {
  const svg = renderSvg(post)
  const basePath = join(OUTPUT_DIR, ...post.slug.split('/'))
  await mkdir(dirname(basePath), { recursive: true })
  await writeFile(`${basePath}.svg`, `${svg}\n`)

  const renderer = new Resvg(svg, {
    fitTo: { mode: 'width', value: WIDTH },
    font: {
      loadSystemFonts: true,
      defaultFontFamily: 'sans-serif',
    },
  })
  await writeFile(`${basePath}.png`, renderer.render().asPng())

  const meta = metadataFor(post)
  return {
    slug: post.slug,
    accent: meta.accent,
    diagram: meta.diagram,
    digest: createHash('sha256').update(svg).digest('hex').slice(0, 12),
  }
}

async function generateCovers(posts) {
  const { Resvg } = await import('@resvg/resvg-js')
  // posts 是生成器独占命名空间，先清理可避免文章改名/删除后残留旧封面。
  await rm(OUTPUT_DIR, { recursive: true, force: true })
  await mkdir(OUTPUT_DIR, { recursive: true })
  const results = []
  for (let index = 0; index < posts.length; index += 1) {
    results.push(await writeCover(posts[index], Resvg))
  }

  console.log(`已生成 ${results.length} 篇文章封面（${WIDTH}×${HEIGHT}，SVG + PNG）`)
  for (const result of results) {
    console.log(
      `  ${result.slug.padEnd(34)} ${result.accent}  ${result.diagram.padEnd(7)} ${result.digest}`,
    )
  }
}

async function main() {
  const unknownArgs = CLI_ARGS.filter((arg) => arg !== '--check')
  if (unknownArgs.length > 0) throw new Error(`未知参数：${unknownArgs.join(' ')}`)

  const posts = await loadPosts()
  if (CHECK_MODE) await checkCovers(posts)
  else await generateCovers(posts)
}

try {
  await main()
} catch (error) {
  console.error(`封面任务失败：${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
}
