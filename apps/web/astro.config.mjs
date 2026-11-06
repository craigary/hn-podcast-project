// @ts-check
import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'
import Icons from 'unplugin-icons/vite'
import { podcastConfig } from '@hn/config'

// https://astro.build/config
export default defineConfig({
  output: 'static',
  site: podcastConfig.site.url,
  // v7 默认按 JSX 规则压缩空白，行内元素之间会丢空格；保持 v6 的 HTML 规则
  compressHTML: true,
  image: {
    domains: ['pub-db52adfc769f4b65b2c8fcf9f5cfc414.r2.dev'],
    remotePatterns: [{ protocol: 'https' }],
  },
  vite: {
    plugins: [
      // @ts-ignore - Vite plugin version mismatch
      tailwindcss(),
      // @ts-ignore - Vite plugin version mismatch
      Icons({
        compiler: 'astro',
      }),
    ],
  },
})
