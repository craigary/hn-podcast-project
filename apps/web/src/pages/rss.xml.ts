import rss from '@astrojs/rss'
import { getCollection } from 'astro:content'
import { podcastConfig } from '@hn/config'

export async function GET() {
  const episodes = await getCollection('episodes')
  const sorted = episodes.sort((a, b) => b.data.id - a.data.id)

  return rss({
    title: podcastConfig.podcast.name,
    description: podcastConfig.podcast.tagline,
    site: podcastConfig.site.url,
    items: sorted.map((episode) => ({
      title: `EP${episode.data.id}: ${episode.data.title}`,
      description: episode.data.desc,
      link: `/${episode.id}`,
      pubDate: new Date(episode.data.date),
      enclosure: episode.data.audioUrl
        ? {
            url: episode.data.audioUrl,
            type: 'audio/mpeg',
            length: 0, // 可以后续添加实际文件大小
          }
        : undefined,
      customData: `
        <itunes:author>${podcastConfig.podcast.name}</itunes:author>
        <itunes:subtitle>${episode.data.title}</itunes:subtitle>
        <itunes:summary>${episode.data.desc}</itunes:summary>
        <itunes:duration>${episode.data.duration || ''}</itunes:duration>
        ${episode.data.coverImage ? `<itunes:image href="${episode.data.coverImage}" />` : ''}
      `,
    })),
    customData: `
      <language>zh-CN</language>
      <itunes:author>${podcastConfig.podcast.name}</itunes:author>
      <itunes:subtitle>${podcastConfig.podcast.tagline}</itunes:subtitle>
      <itunes:summary>${podcastConfig.site.description}</itunes:summary>
      <itunes:owner>
        <itunes:name>${podcastConfig.podcast.name}</itunes:name>
        <itunes:email>${podcastConfig.site.email}</itunes:email>
      </itunes:owner>
      <itunes:explicit>false</itunes:explicit>
      <itunes:category text="Technology" />
      <itunes:category text="News" />
    `,
    xmlns: {
      itunes: 'http://www.itunes.com/dtds/podcast-1.0.dtd',
    },
  })
}
