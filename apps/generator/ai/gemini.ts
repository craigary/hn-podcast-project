import { createGeminiProvider } from 'ai-sdk-provider-gemini-cli'

const gemini = createGeminiProvider({
  authType: 'oauth-personal'
})

export { gemini }
