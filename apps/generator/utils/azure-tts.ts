import crypto from 'crypto'

// 逆向出来的常量
const VOICE_DECODE_KEY =
  'oik6PdDdMnOXemTbwvMn9de/h9lFnfBaCWbGMMZqqoSaQaqUOqjVGm5NqsmjcBI1x+sS9ugjB55HEJWRiFXYFw=='
const ENDPOINT_URL = 'https://dev.microsofttranslator.com/apps/endpoint?api-version=1.0'
const CLIENT_VERSION = '4.0.530a 5fe1dc6c'
const USER_ID = '0f04d16a175c411e'

interface AzureAuth {
  token: string
  region: string
  expiredAt: number
}

interface EndpointResponse {
  t: string // Token
  r: string // Region
}

let authCache: AzureAuth | null = null

/**
 * 核心签名算法
 */
function getSignature(url: string): string {
  const u = url.split('://')[1] ?? ''
  const encodedUrl = encodeURIComponent(u).toLowerCase()
  const uuidStr = crypto.randomUUID().replace(/-/g, '')
  // 注意：Azure 接口对日期格式要求极严，转为小写并在末尾补上 gmt
  const formattedDate = new Date().toUTCString().toLowerCase().replace('gmt', '') + 'gmt'

  const bytesToSign = `MSTranslatorAndroidApp${encodedUrl}${formattedDate}${uuidStr}`.toLowerCase()

  const decodeKey = Buffer.from(VOICE_DECODE_KEY, 'base64')
  const hmac = crypto.createHmac('sha256', decodeKey)
  hmac.update(Buffer.from(bytesToSign, 'utf-8'))
  const signature = hmac.digest('base64')

  return `MSTranslatorAndroidApp::${signature}::${formattedDate}::${uuidStr}`
}

/**
 * 获取 Azure 临时访问令牌
 */
async function getEndpointToken(): Promise<AzureAuth> {
  const signature = getSignature(ENDPOINT_URL)

  const headers = {
    'X-ClientVersion': CLIENT_VERSION,
    'X-UserId': USER_ID,
    'X-HomeGeographicRegion': 'zh-Hans-CN',
    'X-ClientTraceId': crypto.randomUUID(),
    'X-MT-Signature': signature,
    'User-Agent': 'okhttp/4.5.0',
    'Content-Type': 'application/json; charset=utf-8',
  }

  const response = await fetch(ENDPOINT_URL, {
    method: 'POST',
    headers,
  })

  if (!response.ok) throw new Error(`获取 Azure 令牌失败: ${response.statusText}`)

  const data = (await response.json()) as EndpointResponse

  // 安全地解析 JWT 获取过期时间
  const parts = data.t.split('.')
  const payloadBase64 = parts[1]
  if (!payloadBase64) throw new Error('无效的 Azure Token 格式')
  const decodedPayload = Buffer.from(payloadBase64, 'base64').toString()
  const jwtPayload = JSON.parse(decodedPayload) as { exp: number }

  return {
    token: data.t,
    region: data.r,
    expiredAt: jwtPayload.exp * 1000,
  }
}

/**
 * 合成语音 (带简单重试逻辑)
 */
export async function synthesizeSpeech(
  text: string,
  voiceName: string,
  style: string = 'general',
  retries = 5
): Promise<Buffer> {
  try {
    // 1. 检查 Token 是否过期 (提前一分钟更新)
    const now = Date.now()
    if (!authCache || now > authCache.expiredAt - 60000) {
      authCache = await getEndpointToken()
    }

    const url = `https://${authCache.region}.tts.speech.microsoft.com/cognitiveservices/v1`

    // 增强的文本清洗，防止 XML 注入和语速异常
    const cleanText = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
      // 规范化空白字符
      .replace(/\s+/g, ' ')
      .trim()

    // 根据声音判断是否为男声，男声稍微加快语速
    const isMaleVoice = voiceName.includes('Yunxiao')
    const speechRate = isMaleVoice ? '+5%' : '0%'

    const ssml = `
      <speak xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" version="1.0" xml:lang="zh-CN">
        <voice name="${voiceName}">
          <mstts:express-as style="${style}" styledegree="1.0" role="default">
            <prosody rate="${speechRate}" pitch="0%">
              ${cleanText}<break time="100ms"/>
            </prosody>
          </mstts:express-as>
        </voice>
      </speak>
    `.trim()

    const headers = {
      Authorization: authCache.token,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'okhttp/4.5.0',
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: ssml,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`TTS HTTP ${response.status}: ${errorText}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } catch (error) {
    if (retries > 0) {
      console.warn(`⚠️ TTS 合成失败，正在重试... 剩余次数: ${retries}`)
      // 失败时强制刷新 Token
      authCache = null
      return synthesizeSpeech(text, voiceName, style, retries - 1)
    }
    throw error
  }
}
