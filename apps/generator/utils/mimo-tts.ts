const ENDPOINT = 'https://api.xiaomimimo.com/v1/chat/completions'
const MODEL = 'mimo-v2.5-tts'

/**
 * 情绪标签 → 英文语气描述。
 * MiMo 的 `user` message 放的是风格描述，模型对英文描述响应更稳。
 * 每条都写成「听起来像什么」，给模型一个具体的说话人形象。
 */
const EMOTION_STYLES: Record<string, string> = {
  neutral: 'Calm and natural, like explaining something to a friend across a table. Steady pace.',
  excited:
    'Bright and quick, pitch rising at the end of the sentence — like you can barely wait to finish the thought.',
  sarcastic:
    'Dry and flat, the smile sitting just under the words — the joke lands on the pause, not the volume.',
  thoughtful:
    'Slower and lower, with small pauses — like working the idea out while you are speaking it.',
  frustrated:
    'Tight and clipped, a little louder than usual — the irritation leaks out on the last few words.',
  amused:
    'Warm and loose, a small laugh sitting right behind the words — fast, easy, slightly teasing.',
}

const STYLE_FALLBACK = EMOTION_STYLES.neutral!

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 合成单句语音。
 *
 * 与 azure-tts 的 synthesizeSpeech 保持同样的入参形状：文本、音色、情绪。
 * 返回 mp3（24kHz 左右），后续由 FFmpeg 统一重采样并拼接。
 */
export async function synthesizeSpeech(
  text: string,
  voiceName: string,
  emotion: string = 'neutral',
  persona = '',
  retries = 4
): Promise<Buffer> {
  const apiKey = process.env.MIMO_API_KEY
  if (!apiKey) throw new Error('缺少 MIMO_API_KEY')

  const cleanText = text.replace(/\s+/g, ' ').trim()
  if (!cleanText) throw new Error('合成文本为空')

  const emotionStyle = EMOTION_STYLES[emotion] ?? STYLE_FALLBACK
  const style = persona ? `${persona} ${emotionStyle}` : emotionStyle

  const body = {
    model: MODEL,
    messages: [
      { role: 'user', content: style },
      { role: 'assistant', content: cleanText },
    ],
    audio: { format: 'mp3', voice: voiceName },
  }

  let lastError: unknown

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      })

      if (!response.ok) {
        const detail = await response.text()
        const error = new Error(`MiMo TTS HTTP ${response.status}: ${detail}`)
        // 429 和 5xx 值得再试，其余 4xx（鉴权、参数）重试也没用
        const retryable = response.status === 429 || response.status >= 500
        if (!retryable) throw error
        lastError = error
      } else {
        const data = (await response.json()) as {
          choices?: { message?: { audio?: { data?: string } } }[]
        }
        const base64 = data.choices?.[0]?.message?.audio?.data
        if (!base64) throw new Error('MiMo TTS 响应里没有音频数据')
        return Buffer.from(base64, 'base64')
      }
    } catch (error) {
      lastError = error
      // 参数错误、缺 key 这类不是网络抖动，直接抛
      if (
        error instanceof Error &&
        /HTTP 4\d\d/.test(error.message) &&
        !/HTTP 429/.test(error.message)
      ) {
        throw error
      }
    }

    if (attempt < retries) {
      const wait = 1000 * 2 ** attempt
      console.warn(`⚠️ MiMo TTS 失败，${wait / 1000}s 后重试:`, (lastError as Error)?.message)
      await sleep(wait)
    }
  }

  throw lastError instanceof Error ? lastError : new Error('MiMo TTS 合成失败')
}
