import { createStorage } from 'unstorage'
import cloudflareKVHTTPDriver from 'unstorage/drivers/cloudflare-kv-http'
import fsDriver from 'unstorage/drivers/fs'

// LOCAL_KV=1 时用本地文件代替 Cloudflare KV，方便本地调试
const local = process.env.LOCAL_KV === '1'

export const kv = createStorage({
  driver: local
    ? fsDriver({ base: '.tmp/kv' })
    : cloudflareKVHTTPDriver({
        accountId: process.env.CF_ACCOUNT_ID!,
        namespaceId: process.env.CF_KV_NAMESPACE_ID!,
        apiToken: process.env.CF_API_TOKEN!,
      }),
})
