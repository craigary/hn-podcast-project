import { generateText } from 'ai'
import type { LanguageModel } from 'ai'
import { z } from 'zod'

/**
 * 结构化输出统一入口。
 *
 * 不走 AI SDK 的 Output.object：它直接对 content 做 JSON.parse，无法区分
 * 「输出不合法」和「网络失败」，也无法针对上游上下文超限自动收缩重试。
 */
export const generateStructured = async <S extends z.ZodType>(params: {
  model: LanguageModel
  schema: S
  system: string
  prompt: string
  providerName: string
  maxOutputTokens?: number
  /**
   * 'json_schema' = 上游约束解码（严格，Qwen）
   * 'json_object' = 上游只保证「合法 JSON」，字段靠 prompt 约束（DeepSeek 官方）
   */
  structuredMode?: 'json_schema' | 'json_object'
}): Promise<z.infer<S>> => {
  const {
    model,
    schema,
    system,
    prompt,
    providerName,
    maxOutputTokens,
    structuredMode = 'json_schema',
  } = params

  const jsonSchema = z.toJSONSchema(schema) as Record<string, unknown>

  const providerOptions = {
    [providerName]: {
      response_format:
        structuredMode === 'json_schema'
          ? {
              type: 'json_schema' as const,
              json_schema: { name: 'result', strict: true, schema: jsonSchema },
            }
          : { type: 'json_object' as const },
    },
  }

  // 非约束解码时把 schema 写进 system prompt。
  // DeepSeek 官方要求 prompt 里必须出现 "json" 字样并给出格式样例，否则 json_object 不可靠。
  const systemPrompt =
    structuredMode === 'json_schema'
      ? system
      : `${system}

# 输出格式（必须严格遵守）
只输出一个 json 对象，不要包裹代码块，不要输出任何解释文字。
字段名与类型必须与下面的 JSON Schema 完全一致，示例结构如下：

${JSON.stringify(jsonSchema)}

请直接输出 json。`

  const call = (maxTokens: number | undefined) =>
    generateText({
      model,
      system: systemPrompt,
      prompt,
      maxOutputTokens: maxTokens,
      // providerOptions 的 key 是动态 provider 名，类型上只能放宽
      providerOptions: providerOptions as Parameters<typeof generateText>[0]['providerOptions'],
    })

  let text: string
  try {
    text = (await call(maxOutputTokens)).text
  } catch (error) {
    // 上游上下文按真实 token 算，prompt 太长会 400。按它报的数字收缩后重试一次。
    const message = String((error as Error).message ?? '')
    const overflow = message.match(
      /prompt_tokens \((\d+)\) \+ max_new_tokens \((\d+)\) = \d+ exceeds context_length \((\d+)\)/
    )
    if (!overflow) throw error

    const promptTokens = Number(overflow[1])
    const limit = Number(overflow[3])
    const shrunk = limit - promptTokens - 100
    if (shrunk < 400) {
      throw new Error(
        `prompt 实际 ${promptTokens} tokens，已占满上游上下文 ${limit}，无法容纳输出，需要精简输入`
      )
    }
    console.warn(`⚠️  上下文超限，把 max_tokens 收缩到 ${shrunk} 后重试`)
    text = (await call(shrunk)).text
  }

  // DeepSeek json_object 的已知行为：无法识别为 JSON 时，非 JSON 内容会被替换成空格，
  // content 可能只剩空白且 finish_reason 仍是 stop。当成可重试错误抛出去。
  if (!text.trim()) {
    throw new Error(
      '模型返回了空的 content（json_object 模式下通常意味着输出不是合法 JSON），需要重试'
    )
  }

  const parsed = schema.safeParse(JSON.parse(text))
  if (!parsed.success) {
    throw new Error(`输出不符合 schema: ${JSON.stringify(parsed.error.issues.slice(0, 3))}`)
  }
  return parsed.data as z.infer<S>
}
