import { generatePodcastAudio } from './utils/tts'
import { join } from 'path'
import { readFile } from 'fs/promises'

const scriptPath = join(import.meta.dir, '.tmp', 'script-2026-W43.json')
const saved = JSON.parse(await readFile(scriptPath, 'utf-8'))
const coverPath = join(import.meta.dir, '.tmp', 'cover-2026-W43.png')

console.log(
  '脚本轮次:',
  saved.intro.lines.length,
  '+',
  saved.segments.map((s: any) => s.lines.length).join('/'),
  '+',
  saved.outro.lines.length
)

const t = Date.now()
const { audioPath, scriptWithTimeline } = await generatePodcastAudio(
  { intro: saved.intro, segments: saved.segments, outro: saved.outro, metadata: saved.metadata },
  'episode-2026-W43.mp3',
  coverPath
)
console.log('✅ 耗时', ((Date.now() - t) / 60000).toFixed(1), '分钟')
console.log('音频:', audioPath)
console.log(
  '时间轴条数:',
  scriptWithTimeline.intro.lines.length +
    scriptWithTimeline.segments.reduce((a: number, s: any) => a + s.lines.length, 0) +
    scriptWithTimeline.outro.lines.length
)
