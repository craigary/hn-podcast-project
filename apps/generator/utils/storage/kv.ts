import { createStorage } from 'unstorage'
import cloudflareKVHTTPDriver from 'unstorage/drivers/cloudflare-kv-http'

export const kv = createStorage({
  driver: cloudflareKVHTTPDriver({
    accountId: Bun.env.CF_ACCOUNT_ID!,
    namespaceId: Bun.env.CF_KV_NAMESPACE_ID!,
    apiToken: Bun.env.CF_API_TOKEN!
  })
})
