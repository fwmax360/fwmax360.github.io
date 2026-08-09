import themeData from './seriesThemes.json'

export type SeriesTone = 'green' | 'cyan' | 'amber' | 'violet'
export type SeriesSignature = 'layers' | 'signal' | 'cipher' | 'split'

interface Palette {
  accent: string
  soft: string
  glow: string
  ink: string
  angle: string
}

export interface SeriesVisual {
  tone: SeriesTone
  code: string
  mark: string
  signature: SeriesSignature
  palette: Palette
}

interface ThemeConfig {
  toneOrder: SeriesTone[]
  signatureOrder: SeriesSignature[]
  palettes: Record<SeriesTone, Palette>
  signatureMarks: Record<SeriesSignature, string>
  known: Record<
    string,
    {
      tone: SeriesTone
      code: string
      signature: SeriesSignature
    }
  >
}

const THEMES = themeData as ThemeConfig
const { palettes: PALETTES, signatureMarks: SIGNATURE_MARKS, known: KNOWN } = THEMES
const TONES = THEMES.toneOrder
const SIGNATURES = THEMES.signatureOrder

/** FNV-1a 32-bit；只用于稳定选择视觉，不承担安全用途。 */
const stableHash = (value: string) => {
  let hash = 0x811c9dc5
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

const fallbackCode = (name: string, hash: number) => {
  const ascii = name.match(/[a-z0-9]+/gi) ?? []
  const initials = ascii.map((part) => part[0]).join('').toUpperCase()
  if (initials.length >= 2) return initials.slice(0, 3)
  return `S${hash.toString(36).toUpperCase().slice(-2).padStart(2, '0')}`
}

/** 已知系列使用专属视觉；未知系列按名称哈希稳定落到同一套 tone/signature。 */
export function getSeriesVisual(name: string): SeriesVisual {
  const known = KNOWN[name]
  if (known) {
    return {
      ...known,
      mark: SIGNATURE_MARKS[known.signature],
      palette: PALETTES[known.tone],
    }
  }

  const hash = stableHash(name)
  const tone = TONES[hash % TONES.length]
  const signature = SIGNATURES[(hash >>> 3) % SIGNATURES.length]
  const mark = SIGNATURE_MARKS[signature]
  return { tone, signature, mark, code: fallbackCode(name, hash), palette: PALETTES[tone] }
}

/** 仅输出封闭调色板中的值，可直接用于 Astro style 属性。 */
export const seriesVisualStyle = ({ palette }: SeriesVisual) =>
  [
    `--series-accent:${palette.accent}`,
    `--series-soft:${palette.soft}`,
    `--series-glow:${palette.glow}`,
    `--series-ink:${palette.ink}`,
    `--series-angle:${palette.angle}`,
  ].join(';')
