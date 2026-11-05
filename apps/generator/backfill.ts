import { spawn } from 'bun'
import { join } from 'path'
import { addDays, getLatestTuesday, isTuesday } from './utils/date'
import { readEpisodeIndex } from './utils/episodes'

const DEFAULT_FROM = '2026-06-02'

const args = process.argv.slice(2)
const fromIndex = args.indexOf('--from')
const from = fromIndex !== -1 ? args[fromIndex + 1] : DEFAULT_FROM
const dryRun = args.includes('--dry-run') || args.includes('-n')

if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
  throw new Error(`--from 必须是 YYYY-MM-DD，收到: ${from ?? '(空)'}`)
}
if (!isTuesday(from)) {
  throw new Error(`--from 必须是周二，收到: ${from}`)
}

const to = getLatestTuesday()
const index = await readEpisodeIndex()
const published = new Set(index.episodes.map((episode) => episode.date))

const dates: string[] = []
for (let date = from; date <= to; date = addDays(date, 7)) {
  if (!published.has(date)) dates.push(date)
}

if (dates.length === 0) {
  console.log(`✓ ${from} 至 ${to} 之间没有需要回填的周二`)
  process.exit(0)
}

console.log(`📚 待回填 ${dates.length} 期（${from} 至 ${to}）：`)
if (dryRun) {
  let nextNumber = index.nextNumber
  for (const date of dates) {
    console.log(`  ${date} -> EP${nextNumber}`)
    nextNumber += 1
  }
  process.exit(0)
}

console.log(dates.join(', '))
console.log('')

for (const date of dates) {
  console.log(`\n========== ${date} ==========`)
  const proc = spawn(['bun', join(import.meta.dir, 'main.ts'), '--date', date], {
    cwd: import.meta.dir,
    stdout: 'inherit',
    stderr: 'inherit',
    env: process.env,
  })
  const code = await proc.exited
  if (code !== 0) {
    console.error(`\n❌ ${date} 回填失败，已停止。`)
    console.error('修复后重新执行 backfill，会自动跳过已完成的日期。')
    process.exit(code)
  }
}

console.log(`\n🎉 回填完成，共 ${dates.length} 期`)
