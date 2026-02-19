import { createStorage } from 'unstorage'
import cloudflareKVHTTPDriver from 'unstorage/drivers/cloudflare-kv-http'

export const kv = createStorage({
  driver: cloudflareKVHTTPDriver({
    accountId: process.env.CF_ACCOUNT_ID!,
    namespaceId: process.env.CF_KV_NAMESPACE_ID!,
    apiToken: process.env.CF_API_TOKEN!,
  }),
})
