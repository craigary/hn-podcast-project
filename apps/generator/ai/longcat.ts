import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

const longcat = createOpenAICompatible({
  name: 'longcat',
  apiKey: process.env.LONGCAT_API_KEY!,
  baseURL: 'https://api.longcat.chat/openai',
  includeUsage: true,
  supportsStructuredOutputs: true
})

export { longcat }
