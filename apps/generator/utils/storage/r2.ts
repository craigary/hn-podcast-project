import { createStorage } from 'unstorage'
import s3Driver from 'unstorage/drivers/s3'

export const r2 = createStorage({
  driver: s3Driver({
    accessKeyId: process.env.CF_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CF_R2_SECRET_ACCESS_KEY!,
    endpoint: `https://${process.env.CF_ACCOUNT_ID!}.r2.cloudflarestorage.com`,
    bucket: process.env.CF_R2_BUCKET!,
    region: 'auto',
  }),
})
