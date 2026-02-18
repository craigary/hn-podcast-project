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
    showNotes: z
      .array(
        z.object({
          title: z.string(),
          desc: z.string().optional(),
          url: z.string(),
          hnUrl: z.string(),
          points: z.number().optional()
        })
      )
      .optional(),
    transcript: z
      .array(
        z.object({
          speaker: z.string(),
          text: z.string()
        })
      )
      .optional(),
    hnLinks: z
      .array(
        z.object({
          title: z.string(),
          url: z.string()
        })
      )
      .optional()
  })
})

export const collections = { episodes }
