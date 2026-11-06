import { generateText, tool } from 'ai'
import type { LanguageModel } from 'ai'
import { z } from 'zod'

/**
 * 结构化输出统一入口。
 *
 * Superlinked 的 DeepSeek 不支持 response_format（json_schema / json_object 都会 400），
 * 所以这里用 tool calling 作为唯一的结构化通道：
 * 1. 强制模型调用指定工具；
 * 2. 工具参数就是 zod schema；
 * 3. 解析失败或内容校验失败时，带着错误信息重试一次。
 *
 * 连续两次失败直接抛错，由上层决定整期失败，不做静默降级。
 */

const TOOL_SUFFIX = (toolName: string) =>
  `
# 输出方式（必须严格遵守）
你必须调用工具 ${toolName} 提交结果，不要直接输出 JSON 文本，不要输出解释。
工具参数必须完全符合 schema。
所有字符串值内部禁止使用英文双引号 "；引用、强调、书名号等一律使用中文引号「」。
不要输出 markdown 代码块、注释或任何额外文本。`.trim()

export const generateStructured = async <S extends z.ZodType>(params: {
  model: LanguageModel
  schema: S
  system: string
  prompt: string
  toolName: string
  maxOutputTokens?: number
  temperature?: number
  maxAttempts?: number
  /** 额外的内容校验；抛错会触发重试 */
  validate?: (value: z.infer<S>) => void
}): Promise<z.infer<S>> => {
  const {
    model,
    schema,
    system,
    prompt,
    toolName,
    maxOutputTokens = 8000,
    temperature = 0.2,
    maxAttempts = 2,
    validate,
  } = params

  const tools = {
    [toolName]: tool({
      description: `提交 ${toolName} 的结构化结果`,
      inputSchema: schema,
    }),
  }

  let lastError: unknown
  let repairNote = ''

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await generateText({
        model,
        system: `${system}\n\n${TOOL_SUFFIX(toolName)}${repairNote}`,
        prompt,
        tools,
        toolChoice: { type: 'tool', toolName },
        maxOutputTokens,
        temperature,
      })

      const call = result.toolCalls.find((item) => item.toolName === toolName)
      if (!call) {
        throw new Error(
          `模型没有调用工具 ${toolName}，返回文本：${result.text.slice(0, 300) || '(空)'}`
        )
      }
      if ('invalid' in call && call.invalid) {
        throw new Error(`工具参数不合法：${String('error' in call ? call.error : 'unknown')}`)
      }

      const parsed = schema.safeParse(call.input)
      if (!parsed.success) {
        throw new Error(`工具参数不符合 schema：${JSON.stringify(parsed.error.issues.slice(0, 3))}`)
      }

      if (validate) validate(parsed.data)
      return parsed.data as z.infer<S>
    } catch (error) {
      lastError = error
      console.warn(
        `⚠️  ${toolName} 第 ${attempt}/${maxAttempts} 次失败：${(error as Error).message}`
      )
      repairNote = `

# 上一次失败原因
${(error as Error).message}
请重新调用 ${toolName}，只提交修正后的完整结果。`
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${toolName} 生成失败`)
}
