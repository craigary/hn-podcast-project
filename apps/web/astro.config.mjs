// @ts-check
import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'
import Icons from 'unplugin-icons/vite'
import { podcastConfig } from '@hn/config'

// https://astro.build/config
export default defineConfig({
  site: podcastConfig.site.url,
  image: {
    domains: ['pub-db52adfc769f4b65b2c8fcf9f5cfc414.r2.dev'],
    remotePatterns: [{ protocol: 'https' }]
  },
  vite: {
    plugins: [
      // @ts-ignore - Vite plugin version mismatch
      tailwindcss(),
      // @ts-ignore - Vite plugin version mismatch
      Icons({
        compiler: 'astro'
      })
    ]
  }
})
