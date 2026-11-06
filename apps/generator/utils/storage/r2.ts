import { AwsClient } from 'aws4fetch'

/**
 * R2 上传。
 *
 * 用 aws4fetch 直接签 PUT 请求，而不是 unstorage 的 s3 driver：
 * 需要给每个对象带 Cache-Control，driver 没有暴露这个参数。
 */

const accountId = process.env.CF_ACCOUNT_ID
const bucket = process.env.CF_R2_BUCKET
const accessKeyId = process.env.CF_R2_ACCESS_KEY_ID
const secretAccessKey = process.env.CF_R2_SECRET_ACCESS_KEY

/** 配置在真正上传时才校验，这样 dry-run 和本地调试不需要 R2 凭据 */
const getClient = () => {
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(
      'R2 配置缺失：需要 CF_ACCOUNT_ID / CF_R2_BUCKET / CF_R2_ACCESS_KEY_ID / CF_R2_SECRET_ACCESS_KEY'
    )
  }

  return {
    client: new AwsClient({ service: 's3', region: 'auto', accessKeyId, secretAccessKey }),
    endpoint: `https://${accountId}.r2.cloudflarestorage.com/${bucket}`,
  }
}

/** 音视频与封面：文件名带版本号（?v=…），内容变了地址就变，可以永久缓存 */
export const CACHE_IMMUTABLE = 'public, max-age=31536000, immutable'
/** JSON 元数据：重跑同一期会覆盖，给一个短缓存 */
export const CACHE_SHORT = 'public, max-age=300'

export const putObject = async (
  key: string,
  body: Uint8Array | string,
  options: { contentType: string; cacheControl: string }
) => {
  const { client, endpoint } = getClient()

  const response = await client.fetch(`${endpoint}/${key}`, {
    method: 'PUT',
    headers: {
      'Content-Type': options.contentType,
      'Cache-Control': options.cacheControl,
    },
    body,
  })

  if (!response.ok) {
    throw new Error(`R2 上传失败 ${key}: ${response.status} ${await response.text()}`)
  }
}
