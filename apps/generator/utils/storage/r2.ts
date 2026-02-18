import { createStorage } from 'unstorage'
import s3Driver from 'unstorage/drivers/s3'

export const r2 = createStorage({
  driver: s3Driver({
    accessKeyId: Bun.env.CF_R2_ACCESS_KEY_ID!,
    secretAccessKey: Bun.env.CF_R2_SECRET_ACCESS_KEY!,
    endpoint: `https://${Bun.env.CF_ACCOUNT_ID!}.r2.cloudflarestorage.com`,
    bucket: Bun.env.CF_R2_BUCKET!,
    region: 'auto'
  })
})
