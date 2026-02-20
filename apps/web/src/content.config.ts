import { defineCollection } from 'astro:content'
import { z } from 'astro/zod'
import { glob } from 'astro/loaders'

const episodes = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/episodes' }),
  schema: z.object({
    id: z.number(),
    date: z.string(),
    title: z.string(),
    desc: z.string(),
    duration: z.string().optional(),
    audioUrl: z.string().optional(),
    coverImage: z.string().optional(),
    chapters: z
      .array(
        z.object({
          title: z.string(),
          desc: z.string(),
          start: z.number(),
          storyIds: z.array(z.number()),
        })
      )
      .optional(),
    links: z
      .array(
        z.object({
          title: z.string(),
          url: z.string(),
          hnUrl: z.string(),
          points: z.number().optional(),
        })
      )
      .optional(),
    transcript: z
      .array(
        z.object({
          speaker: z.string(),
          text: z.string(),
          start: z.number().optional(),
          end: z.number().optional(),
        })
      )
      .optional(),
    hnLinks: z
      .array(
        z.object({
          title: z.string(),
          url: z.string(),
        })
      )
      .optional(),
  }),
})

export const collections = { episodes }
