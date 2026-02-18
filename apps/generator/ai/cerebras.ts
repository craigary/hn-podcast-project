import { createCerebras } from '@ai-sdk/cerebras'

const cerebras = createCerebras({
  apiKey: Bun.env.CEREBRAS_API_KEY!
})

export { cerebras }
