import pangu from 'pangu'

/**
 * 处理文本：转换各类引号为中文折角引号，并处理中英文空格
 */
export function processText(text: string): string {
  if (!text) return text

  const processed = text
    // 先处理智能引号（curly quotes）
    .replace(/[\u201c\u201d]/g, (match) => (match === '\u201c' ? '\u300c' : '\u300d')) // “ → 「, ” → 」
    .replace(/[\u2018\u2019]/g, (match) => (match === '\u2018' ? '\u300c' : '\u300d')) // ‘ → 「, ’ → 」
    // 处理已有的中文引号（统一为折角引号）
    .replace(/[\u300e\u300f]/g, (match) => (match === '\u300e' ? '\u300c' : '\u300d')) // 『 → 「, 』 → 」
    .replace(/[\u3010\u3011]/g, (match) => (match === '\u3010' ? '\u300c' : '\u300d')) // 【 → 「, 】 → 」
    // 再处理普通引号（straight quotes）
    .replace(/"([^"]*)"/g, '\u300c$1\u300d') // "text" → 「text」
    .replace(/'([^']*)'/g, '\u300c$1\u300d') // 'text' → 「text」

  return pangu.spacingText(processed)
}
