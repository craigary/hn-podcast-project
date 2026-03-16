import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

const openai = createOpenAICompatible({
  name: 'nim',
  baseURL: 'https://integrate.api.nvidia.com/v1',
  headers: {
    Authorization: `Bearer ${process.env.NIM_API_KEY}`,
  },
  includeUsage: true,
  supportsStructuredOutputs: true,
})

export { openai }
