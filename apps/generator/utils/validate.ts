/**
 * 输出校验：模型可能跑偏（输出英文、被截断、失控写太多）。
 * 检查只在明显异常时才失败，避免误伤正常内容。
 */

const countChinese = (text: string) => (text.match(/[\u4e00-\u9fa5]/g) ?? []).length

/**
 * 中文占比：只在中文字和英文字母之间算比例，忽略数字、标点、空格。
 * 否则像「确定性幻觉：从 56 亿美元黑名单到 Qwen 里的 RISC - V」这种
 * 含大量品牌名/数字的正常标题会被误判。
 */
const chineseRatio = (text: string) => {
  const cjk = countChinese(text)
  const latin = (text.match(/[a-zA-Z]/g) ?? []).length
  const total = cjk + latin
  return total === 0 ? 1 : cjk / total
}

/** 判断文本是不是正常的中文产出（防止模型被带跑，输出英文说教） */
export const assertChineseOutput = (text: string, label: string, minRatio = 0.3) => {
  const trimmed = text.trim()
  if (trimmed.length < 4) throw new Error(`${label} 输出过短（${trimmed.length} 字符）`)

  const ratio = chineseRatio(trimmed)
  if (ratio < minRatio) {
    throw new Error(`${label} 中文占比异常（${(ratio * 100).toFixed(1)}%），疑似没有按中文输出`)
  }
}

/**
 * 校验脚本：轮次数量、中文占比。
 * 轮次只做「防截断」的下限和「防失控」的极宽上限，不按 prompt 的推荐值卡死。
 */
export const assertScript = (
  script: { lines: { speaker: string; text: string }[] },
  label: string,
  expected: { minLines: number; hardMaxLines?: number }
) => {
  const lines = script.lines ?? []
  if (lines.length < expected.minLines) {
    throw new Error(`${label} 对话轮次过少（${lines.length} 轮，期望 ≥${expected.minLines}）`)
  }
  const hardMax = expected.hardMaxLines ?? 60
  if (lines.length > hardMax) {
    throw new Error(`${label} 对话轮次异常偏多（${lines.length} 轮，疑似失控，上限 ${hardMax}）`)
  }

  const text = lines.map((line) => line.text).join('')
  assertChineseOutput(text, label, 0.4)
}

/** 带重试地执行一次 LLM 校验流程，失败重试，仍失败就抛出 */
export const withRetry = async <T>(
  fn: () => Promise<T>,
  validate: (value: T) => void,
  { label, retries = 1 }: { label: string; retries?: number }
): Promise<T> => {
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const value = await fn()
      validate(value)
      return value
    } catch (error) {
      lastError = error
      console.error(`⚠️  ${label} 第 ${attempt + 1} 次失败:`, (error as Error).message)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} 失败`)
}
