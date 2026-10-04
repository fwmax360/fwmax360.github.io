/** Stable CSS identifiers let the same post title connect list and reading views. */
export const readingTitleName = (id: string) => `reading-title-${Array.from(id).map(c => c.codePointAt(0)!.toString(16)).join('-')}`
