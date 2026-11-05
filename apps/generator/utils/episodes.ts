import { readFile, writeFile, rename, mkdir } from 'fs/promises'
import { join } from 'path'

export type EpisodeStatus = 'published' | 'degraded'

export interface EpisodeIndexEntry {
  number: number
  date: string
  status: EpisodeStatus
}

export interface EpisodeIndex {
  schemaVersion: 1
  nextNumber: number
  episodes: EpisodeIndexEntry[]
}

export const EPISODES_DIR = join(import.meta.dir, '..', '..', 'web', 'src', 'content', 'episodes')
const INDEX_PATH = join(EPISODES_DIR, 'index.json')

const emptyIndex = (): EpisodeIndex => ({
  schemaVersion: 1,
  nextNumber: 1,
  episodes: [],
})

export const readEpisodeIndex = async (): Promise<EpisodeIndex> => {
  try {
    const raw = await readFile(INDEX_PATH, 'utf-8')
    const data = JSON.parse(raw) as EpisodeIndex
    if (!Array.isArray(data.episodes)) throw new Error('episodes 不是数组')
    return {
      schemaVersion: 1,
      nextNumber: typeof data.nextNumber === 'number' ? data.nextNumber : 1,
      episodes: data.episodes,
    }
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return emptyIndex()
    throw error
  }
}

const writeEpisodeIndex = async (index: EpisodeIndex): Promise<void> => {
  await mkdir(EPISODES_DIR, { recursive: true })
  const tmpPath = `${INDEX_PATH}.tmp`
  await writeFile(tmpPath, `${JSON.stringify(index, null, 2)}\n`, 'utf-8')
  await rename(tmpPath, INDEX_PATH)
}

export const findEpisodeByDate = (index: EpisodeIndex, date: string) =>
  index.episodes.find((episode) => episode.date === date)

/** 已存在的日期复用原编号；新日期使用 nextNumber */
export const resolveEpisodeNumber = (index: EpisodeIndex, date: string) => {
  const existing = findEpisodeByDate(index, date)
  return existing ? { number: existing.number, existing } : { number: index.nextNumber }
}

/** 发布成功后写入索引；同一日期或编号只保留一条 */
export const publishEpisode = async ({
  number,
  date,
  status = 'published',
}: {
  number: number
  date: string
  status?: EpisodeStatus
}): Promise<void> => {
  const index = await readEpisodeIndex()
  const existing = index.episodes.find(
    (episode) => episode.number === number || episode.date === date
  )

  if (existing) {
    existing.number = number
    existing.date = date
    existing.status = status
  } else {
    index.episodes.push({ number, date, status })
  }

  index.episodes.sort((a, b) => a.number - b.number)
  index.nextNumber = Math.max(
    index.nextNumber,
    number + 1,
    ...index.episodes.map((episode) => episode.number + 1)
  )

  await writeEpisodeIndex(index)
}
