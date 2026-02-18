import { StoryIntel } from './ai/prompts/intel'

export interface RawStory {
  title: string
  url: string
  id?: number
  date: number
  points: number
}

export type ProcessedStory = StoryIntel & RawStory
