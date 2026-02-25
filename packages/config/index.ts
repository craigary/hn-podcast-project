// config.ts
export const podcastConfig = {
  site: {
    url:
      process.env.NODE_ENV === 'development' ? 'http://localhost:4321' : 'https://hn.craigary.net',
    production: 'https://hn.craigary.net', // 生产环境的实际域名
    email: 'podcast@example.com', // 播客联系邮箱
    description: '一档由 AI 驱动的 Hacker News 每日深度对谈播客',
  },
  podcast: {
    name: 'HN 瞎聊',
    tagline: '咖啡、代码与深夜闲聊',
  },
  hosts: {
    female: {
      name: '小雅',
      role: 'Web 开发/前端专家',
      personality:
        '愤青，效率至上，拥抱 AI 热潮，有一说一，最烦大厂虚伪公关，年轻热情。偶尔会说脏话，对技术话题有独到见解。',
      voice: 'zh-CN-Xiaochen:DragonHDFlashLatestNeural', // 活泼女声
    },
    male: {
      name: '老冯',
      role: '底层架构/系统老兵',
      personality: '痞气十足，老油条，爱跑题，喜爱 AI，但相对谨慎，喜欢冷嘲热讽，技术深度极高。',
      voice: 'zh-CN-Yunxiao:DragonHDFlashLatestNeural', // 比较成熟的男声
    },
  },
  ai: {
    defaultModel: 'mistral-large-latest', // 默认模型，适合一般对话和技术讨论
    writingModel: 'mistral-large-latest', // 脚本创作建议用逻辑更强的模型
  },
  audio: {
    fadeDuration: 1.5,
    silenceGap: 0.5,
    maxMusicDuration: 10,
  },
  social: {
    twitter: 'https://twitter.com/craigaryhart',
    github: 'https://github.com/craigary/hn-podcast-project',
    // youtube: 'https://youtube.com/@your-channel'
  },
  platforms: [
    {
      name: 'Apple Podcasts',
      url: '',
      status: 'pending', // pending | active | planned
      icon: 'simple-icons:applepodcasts',
      isRss: false,
    },
    {
      name: 'Spotify',
      url: '',
      status: 'pending',
      icon: 'simple-icons:spotify',
      isRss: false,
    },
    {
      name: '小宇宙',
      url: '',
      status: 'planned',
      icon: 'lucide:podcast',
      isRss: false,
    },
    {
      name: 'RSS 订阅',
      url: '',
      status: 'active',
      icon: 'lucide:rss',
      isRss: true,
    },
  ],
}
