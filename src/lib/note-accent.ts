import themeData from './seriesThemes.json'
import { getSeriesVisual } from './seriesVisual'
/** Existing series palette, not a random color for every row. */
export function noteAccent(data: { series?: string; category: string }) {
  return data.series ? getSeriesVisual(data.series).palette.accent : categoryAccent(data.category)
}

function categoryAccent(category: string) {
  const tones = themeData.categoryTones as Record<string, keyof typeof themeData.palettes>
  const tone = tones[category] ?? themeData.defaultCategoryTone as keyof typeof themeData.palettes
  return themeData.palettes[tone].accent
}
