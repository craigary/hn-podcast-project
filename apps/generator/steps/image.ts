import { generateText } from 'ai'
import { join } from 'path'
import { superlinked } from '../ai/superlinked'
import { kv } from '../utils/storage/kv'
import type { PodcastBlueprint } from '../ai/prompts/blueprint'
import { imageGenSystemPrompt } from '../ai/prompts/image'

// 兜底封面（放在仓库里，不依赖任何外部服务）
const DEFAULT_COVER_PATH = join(import.meta.dir, '..', 'assets', 'default-cover.png')

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
    model: superlinked('Qwen/Qwen3.8-27B-FP8'),
    system: imageGenSystemPrompt,
    prompt: title,
  })

  const coverPrompt = text.trim()

  await kv.setItem(cacheKey, coverPrompt, {
    expirationTtl: 604_800,
  })

  console.log(`✅ [Cover Prompt 生成成功] ${coverPrompt.slice(0, 80)}...`)
  return coverPrompt
}

export const generateCoverImage = async (prompt: string): Promise<ArrayBuffer> => {
  const encodedPrompt = encodeURIComponent(prompt)
  const url = `https://gen.pollinations.ai/image/${encodedPrompt}?model=zimage&enhance=true`

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.POLLINATIONS_API_KEY}`,
    },
  })

  if (!res.ok) {
    throw new Error(`Pollinations API error: ${res.status} ${res.statusText}`)
  }

  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.startsWith('image/')) {
    throw new Error(`Pollinations 返回的不是图片: ${contentType}`)
  }

  const imageBuffer = await res.arrayBuffer()
  console.log(`✅ [Cover Image 生成成功] ${(imageBuffer.byteLength / 1024).toFixed(1)} KB`)
  return imageBuffer
}
