import { spawn } from 'bun'
import { join } from 'path'
import { addDays, getLatestTuesday, isTuesday } from './utils/date'
import { readEpisodeIndex } from './utils/episodes'

const DEFAULT_FROM = '2026-06-02'

const args = process.argv.slice(2)
const fromIndex = args.indexOf('--from')
const from = fromIndex !== -1 ? args[fromIndex + 1] : DEFAULT_FROM
const dryRun = args.includes('--dry-run') || args.includes('-n')

const retriesIndex = args.indexOf('--retries')
const retries =
  retriesIndex !== -1 ? Number(args[retriesIndex + 1]) : Number(process.env.BACKFILL_RETRIES || 3)
const retryDelayIndex = args.indexOf('--retry-delay')
const retryDelaySec =
  retryDelayIndex !== -1
    ? Number(args[retryDelayIndex + 1])
    : Number(process.env.BACKFILL_RETRY_DELAY || 60)
const autoPush = process.env.AUTO_PUSH === '1'
// --limit N：本次最多回填 N 期（例如每期单独起一个进程，避免长任务被中断）
const limitIndex = args.indexOf('--limit')
const limit = limitIndex !== -1 ? Number(args[limitIndex + 1]) : Infinity

if (!from || !/^\d{4}-\d{2}-\d{2}$/.test(from)) {
  throw new Error(`--from 必须是 YYYY-MM-DD，收到: ${from ?? '(空)'}`)
}
if (!isTuesday(from)) {
  throw new Error(`--from 必须是周二，收到: ${from}`)
}
if (!Number.isInteger(retries) || retries < 1) {
  throw new Error(`--retries 必须是 ≥1 的整数，收到: ${retries}`)
}
if (limit !== Infinity && (!Number.isInteger(limit) || limit < 1)) {
  throw new Error(`--limit 必须是 ≥1 的整数，收到: ${limit}`)
}
if (!Number.isFinite(retryDelaySec) || retryDelaySec < 0) {
  throw new Error(`--retry-delay 必须是 ≥0 的秒数，收到: ${retryDelaySec}`)
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

console.log(`📚 待回填 ${dates.length} 期（${from} 至 ${to}）`)
console.log(`   每期最多尝试 ${retries} 次，失败间隔 ${retryDelaySec}s`)
if (autoPush) console.log('   成功后会自动 commit + push')
console.log('')

if (dryRun) {
  let nextNumber = index.nextNumber
  for (const date of dates) {
    console.log(`  ${date} -> EP${nextNumber}`)
    nextNumber += 1
  }
  process.exit(0)
}

if (dates.length > limit) {
  console.log(`   本次只跑前 ${limit} 期（--limit ${limit}）`)
  dates.splice(limit)
}

console.log(dates.join(', '))
console.log('')

const runDate = async (date: string): Promise<number> => {
  const proc = spawn(['bun', join(import.meta.dir, 'main.ts'), '--date', date], {
    cwd: import.meta.dir,
    stdout: 'inherit',
    stderr: 'inherit',
    env: process.env,
  })
  return proc.exited
}

const runGit = async (gitArgs: string[]): Promise<number> => {
  const proc = spawn(['git', ...gitArgs], {
    cwd: join(import.meta.dir, '..', '..'),
    stdout: 'inherit',
    stderr: 'inherit',
    env: process.env,
  })
  return proc.exited
}

const commitAndPush = async (date: string): Promise<void> => {
  await runGit(['add', 'apps/web/src/content/episodes/'])
  const commitCode = await runGit(['commit', '-m', `chore: backfill ${date}`])
  if (commitCode !== 0) {
    console.log('ℹ️  没有可提交的变更，跳过 commit')
  }

  const pushCode = await runGit(['push', 'origin', 'HEAD'])
  if (pushCode !== 0) {
    throw new Error(`EP ${date} 已生成，但 git push 失败；请修复凭据后手动 push`)
  }
}

for (const date of dates) {
  console.log(`\n========== ${date} ==========`)
  let succeeded = false

  for (let attempt = 1; attempt <= retries; attempt++) {
    if (attempt > 1) console.log(`🔁 ${date} 第 ${attempt}/${retries} 次尝试...`)
    const code = await runDate(date)

    if (code === 0) {
      succeeded = true
      break
    }

    if (attempt < retries) {
      console.warn(`⚠️  ${date} 失败（exit ${code}），${retryDelaySec}s 后重试`)
      await Bun.sleep(retryDelaySec * 1000)
    }
  }

  if (!succeeded) {
    console.error(`\n❌ ${date} 重试 ${retries} 次后仍失败，已停止。`)
    console.error('修复后重新执行 backfill，会自动跳过已完成的日期，从这一天继续。')
    process.exit(1)
  }

  if (autoPush) {
    await commitAndPush(date)
  }
}

console.log(`\n🎉 回填完成，共 ${dates.length} 期`)
