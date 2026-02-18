import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

const openai = createOpenAICompatible({
  name: 'openai',
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: 'https://x666.me/v1',
  includeUsage: true,
  supportsStructuredOutputs: true
})

export { openai }
