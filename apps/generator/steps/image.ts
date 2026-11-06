import { generateText } from 'ai'
import { join } from 'path'
import { superlinked } from '../ai/superlinked'
import { kv } from '../utils/storage/kv'
import type { PodcastBlueprint } from '../ai/prompts/blueprint'
import { imageGenSystemPrompt } from '../ai/prompts/image'

// 兜底封面（放在仓库里，不依赖任何外部服务）
const DEFAULT_COVER_PATH = join(import.meta.dir, '..', 'assets', 'default-cover.png')

// Workers AI 图像模型。FLUX.2 Dev 比 FLUX.1 Schnell 新，构图和风格一致性更好。
const IMAGE_MODEL = process.env.IMAGE_MODEL || '@cf/black-forest-labs/flux-2-dev'
const IMAGE_STEPS = Number(process.env.IMAGE_STEPS || 4)

export const loadDefaultCover = async (): Promise<ArrayBuffer> => {
  console.log('🖼️  使用默认封面')
  return Bun.file(DEFAULT_COVER_PATH).arrayBuffer()
}

export const generateCoverPrompt = async ({
  blueprint,
  dateStr,
}: {
  blueprint: PodcastBlueprint
  dateStr: string
}): Promise<string> => {
  const cacheKey = `${dateStr}:cover-prompt`
  const cached = await kv.getItem<string>(cacheKey)
  if (cached) {
    console.log(`[Cache Hit] Cover prompt ${dateStr}, return`)
    return cached
  }

  const title = blueprint.episode_overview.title

  const { text } = await generateText({
    model: superlinked('deepseek-ai/DeepSeek-V4.1-Flash-1017'),
    system: imageGenSystemPrompt,
    prompt: title,
    temperature: 0.7,
  })

  const coverPrompt = text.trim()

  await kv.setItem(cacheKey, coverPrompt, {
    expirationTtl: 604_800,
  })

  console.log(`✅ [Cover Prompt 生成成功] ${coverPrompt.slice(0, 80)}...`)
  return coverPrompt
}

/**
 * 用 Cloudflare Workers AI 生成封面。
 * FLUX.2 系列要求 multipart/form-data。
 * 失败时由调用方回退到 assets/default-cover.png。
 */
export const generateCoverImage = async (prompt: string): Promise<ArrayBuffer> => {
  const accountId = process.env.CF_ACCOUNT_ID
  const apiToken = process.env.CF_API_TOKEN

  if (!accountId || !apiToken) {
    throw new Error('缺少 CF_ACCOUNT_ID / CF_API_TOKEN，无法调用 Workers AI')
  }

  const form = new FormData()
  form.append('prompt', prompt)
  form.append('steps', String(Number.isFinite(IMAGE_STEPS) ? IMAGE_STEPS : 4))

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${IMAGE_MODEL}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}` },
      body: form,
      signal: AbortSignal.timeout(300_000),
    }
  )

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Workers AI 图片生成失败 ${res.status}: ${detail.slice(0, 300)}`)
  }

  const contentType = res.headers.get('content-type') ?? ''

  // 部分模型直接返回图片二进制
  if (contentType.startsWith('image/')) {
    const imageBuffer = await res.arrayBuffer()
    console.log(
      `✅ [Cover Image 生成成功] ${IMAGE_MODEL} ${contentType} ${(imageBuffer.byteLength / 1024).toFixed(1)} KB`
    )
    return imageBuffer
  }

  // FLUX.2 返回 JSON: { result: { image: "<base64>" } }
  const data = (await res.json()) as { result?: { image?: string } }
  const base64 = data.result?.image
  if (!base64) {
    throw new Error(`Workers AI 返回中没有图片: ${JSON.stringify(data).slice(0, 300)}`)
  }

  const buffer = Buffer.from(base64, 'base64')
  const imageBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer

  console.log(
    `✅ [Cover Image 生成成功] ${IMAGE_MODEL} image/jpeg ${(imageBuffer.byteLength / 1024).toFixed(1)} KB`
  )
  return imageBuffer
}
