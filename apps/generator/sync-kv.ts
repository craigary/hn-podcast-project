import { kv } from './utils/storage/kv'
import { readdir } from 'fs/promises'
import { join } from 'path'

const KV_KEY = 'latest_episode_number'

async function main() {
  // 从本地 markdown 文件获取最新期数
  const episodesDir = join(process.cwd(), '..', 'web', 'src', 'content', 'episodes')
  const files = await readdir(episodesDir)
  const episodeNumbers = files
    .filter((f) => f.endsWith('.md'))
    .map((f) => parseInt(f.replace('.md', ''), 10))
    .filter((n) => !isNaN(n))

  if (episodeNumbers.length === 0) {
    console.log('❌ 未找到任何 episode markdown 文件')
    process.exit(1)
  }

  const latestLocal = Math.max(...episodeNumbers)

  // 读取 KV 当前值
  let kvValue: number | null = null
  try {
    const stored = await kv.getItem(KV_KEY)
    kvValue = typeof stored === 'number' ? stored : null
  } catch {
    console.log('⚠️  无法读取 KV 当前值')
  }

  console.log(`📂 本地最新期数: ${latestLocal} (共 ${episodeNumbers.length} 期)`)
  console.log(`☁️  KV 当前值:    ${kvValue ?? '未设置'}`)

  if (kvValue === latestLocal) {
    console.log('\n✅ KV 已是最新，无需更新')
    return
  }

  // 更新 KV
  await kv.setItem(KV_KEY, latestLocal)
  console.log(`\n✅ 已更新 KV: ${kvValue ?? '未设置'} → ${latestLocal}`)
}

main().catch((err) => {
  console.error('❌ 同步失败:', err)
  process.exit(1)
})
