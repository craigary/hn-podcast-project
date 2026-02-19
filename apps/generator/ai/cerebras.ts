import { createCerebras } from '@ai-sdk/cerebras'

const cerebras = createCerebras({
  apiKey: process.env.CEREBRAS_API_KEY!,
})

export { cerebras }
