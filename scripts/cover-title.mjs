function charWeight(char) {
  if (/\s/u.test(char)) return 0.32
  if (/[MW@%]/u.test(char)) return 1
  if (/[mw]/u.test(char)) return 0.86
  if (/[A-Z]/u.test(char)) return 0.75
  if (/^[\x00-\xff]$/u.test(char)) return 0.55
  return 1
}

export function textWeight(value) {
  return [...value].reduce((sum, char) => sum + charWeight(char), 0)
}

function splitLongToken(token, maxWeight) {
  const chunks = []
  let current = ''
  let weight = 0
  for (const char of token) {
    const next = charWeight(char)
    if (current && weight + next > maxWeight) {
      chunks.push(current)
      current = ''
      weight = 0
    }
    current += char
    weight += next
  }
  if (current) chunks.push(current)
  return chunks
}

function balancePunctuation(lines) {
  const balanced = [...lines]
  const lineStartPunctuation = /^[，。！？、；：）》】」』]+/u
  const lineEndOpening = /[（《【「『]+$/u

  for (let index = 1; index < balanced.length; index += 1) {
    const leading = balanced[index].match(lineStartPunctuation)?.[0]
    if (leading) {
      balanced[index - 1] += leading
      balanced[index] = balanced[index].slice(leading.length).trimStart()
    }

    const opening = balanced[index - 1].match(lineEndOpening)?.[0]
    if (opening) {
      balanced[index - 1] = balanced[index - 1].slice(0, -opening.length).trimEnd()
      balanced[index] = `${opening}${balanced[index]}`
    }
  }
  return balanced.filter(Boolean)
}

/** Width budget is deliberately conservative; browser geometry tests verify real fonts. */
export function wrapTitle(title) {
  if (!title.trim()) throw new Error('封面标题不能为空')
  const total = textWeight(title)
  const initialSize = total <= 8 ? 64 : total <= 16 ? 58 : total <= 25 ? 52 : total <= 33 ? 47 : 43
  const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' })
  const rawTokens = [...segmenter.segment(title)].map(({ segment }) => segment)
  for (let fontSize = initialSize; fontSize >= 32; fontSize--) {
    const maxWeight = 690 / fontSize
    const tokens = rawTokens.flatMap(token => textWeight(token) > maxWeight ? splitLongToken(token, maxWeight) : [token])
    const lines = []
    let current = ''
    for (const token of tokens) {
      const candidate = current + token
      if (current.trim() && textWeight(candidate) > maxWeight) {
        lines.push(current.trimEnd())
        current = token.trimStart()
      } else current = candidate
    }
    if (current.trim()) lines.push(current.trim())
    const balanced = balancePunctuation(lines)
    // Four lines still fit above the series caption. Never concatenate overflow.
    if (balanced.length <= 4 && balanced.every(line => textWeight(line) <= maxWeight + 0.01)) {
      return { lines: balanced, fontSize, lineHeight: fontSize + 14 }
    }
  }
  // A cover has finite space: report editorial input instead of producing clipped artwork.
  throw new Error(`封面标题超过四行排版容量：${title}`)
}
