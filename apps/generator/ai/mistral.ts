import { createMistral } from '@ai-sdk/mistral'

const mistral = createMistral({
  apiKey: process.env.MISTRAL_API_KEY || ''
})

export { mistral }
