import { generateBlueprint } from './steps/blueprint'
import { generateCoverImage, generateCoverPrompt, loadDefaultCover } from './steps/image'
import { generateSegmentScript, generateIntroScript, generateOutroScript } from './steps/script'
import { fetchWeeklyTopStories } from './utils/hn'
import { screenStories } from './steps/screen'
import { extractIntel } from './steps/intel'
import type { ProcessedStory, ScreenedStory } from './types'
import { assertChineseOutput } from './utils/validate'
import { r2 } from './utils/storage/r2'
import { kv } from './utils/storage/kv'
import { convertScriptToMarkdown } from './utils/markdown'
import { generatePodcastAudio } from './utils/tts'
import type { SegmentScript } from './ai/prompts/script'
import { writeFile, readFile, rm, readdir, mkdir } from 'fs/promises'
import { join } from 'path'

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2)
  let episode: number | undefined
  let date: string | undefined
  let force = false
  let local = false

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--episode' && args[i + 1]) {
      episode = parseInt(args[i + 1], 10)
      i++
    } else if (args[i] === '--date' && args[i + 1]) {
      date = args[i + 1]
      i++
    } else if (args[i] === '--force' || args[i] === '-f') {
      force = true
    } else if (args[i] === '--local' || args[i] === '-l') {
      local = true
      force = true // 本地模式默认启用 force，允许覆盖文件，方便调试
    }
  }

  return { episode, date, force, local }
}

// 获取最新的期数（优先从文件系统，KV 作为备用）
async function getLatestEpisodeNumber(local = false): Promise<number> {
  // 优先从文件系统获取（single source of truth）
  const fsEpisode = await getLatestEpisodeNumberFromFS()

  // 本地模式下跳过 KV 同步
  if (local) {
    return fsEpisode
  }

  // 尝试从 KV 获取并同步
  try {
    const KV_KEY = 'latest_episode_number'
    const kvEpisode = await kv.getItem(KV_KEY)

    // 如果 KV 中的期数小于文件系统中的期数，更新 KV
    if (typeof kvEpisode === 'number' && kvEpisode < fsEpisode) {
      await kv.setItem(KV_KEY, fsEpisode)
      console.log(`✓ 已同步 KV 期数: ${kvEpisode} → ${fsEpisode}`)
    }
  } catch {
    console.log('⚠️  无法访问 KV，使用文件系统期数')
  }

  return fsEpisode
}

// 从文件系统获取最新的期数（主要方案）
// 文件名是周标签（2026-W44.md），所以期号要从 frontmatter 的 id 读
async function getLatestEpisodeNumberFromFS(): Promise<number> {
  const episodesDir = join(process.cwd(), '..', 'web', 'src', 'content', 'episodes')
  try {
    const files = (await readdir(episodesDir)).filter((f) => f.endsWith('.md'))
    const episodeNumbers: number[] = []

    for (const file of files) {
      const content = await readFile(join(episodesDir, file), 'utf-8')
      const match = content.match(/^id:\s*(\d+)\s*$/m)
      if (match) episodeNumbers.push(Number(match[1]))
    }

    if (episodeNumbers.length === 0) {
      return 0 // 如果没有任何期数，返回 0，下一期从 1 开始
    }

    return Math.max(...episodeNumbers)
  } catch (error) {
    console.log('⚠️  无法读取 episodes 目录:', error)
    return 0
  }
}

// 检查指定周的文件是否存在
async function weekExists(weekLabel: string): Promise<boolean> {
  const episodesDir = join(process.cwd(), '..', 'web', 'src', 'content', 'episodes')
  try {
    await readFile(join(episodesDir, `${weekLabel}.md`))
    return true
  } catch {
    return false
  }
}

// 更新 KV 中的最新期数
async function updateLatestEpisodeNumberInKV(episodeNumber: number): Promise<void> {
  const KV_KEY = 'latest_episode_number'
  try {
    await kv.setItem(KV_KEY, episodeNumber)
    console.log(`✅ 已更新 KV 中的最新期数: ${episodeNumber}`)
  } catch (error) {
    console.log('⚠️  无法更新 KV 中的期数:', error)
  }
}

// 周更覆盖的是「上一个完整的自然周」：上周一 00:00 ~ 上周日 23:59（HN 用 PST/PDT）
// 返回上周日的日期，和 ISO 周标签严格对应
function getWeekEndDate(): string {
  const now = new Date()
  const pstOffset = -8 * 60 // PST 是 UTC-8（简化处理，夏令时实际是 UTC-7）
  const pstTime = new Date(now.getTime() + pstOffset * 60 * 1000)

  // 最近一个已经结束的周日（今天是周日就用上一周的周日，保证区间完整）
  const daysSinceSunday = pstTime.getDay() === 0 ? 7 : pstTime.getDay()
  pstTime.setDate(pstTime.getDate() - daysSinceSunday)

  return pstTime.toISOString().split('T')[0]
}

// ISO 周标签，例如 2026-W44。用作文件名、R2 路径和站点 slug
function getWeekLabel(weekEnd: string): string {
  const date = new Date(`${weekEnd}T00:00:00Z`)
  const target = new Date(date)
  // ISO 周以周一为起点，周四决定年份
  const dayNum = (date.getUTCDay() + 6) % 7
  target.setUTCDate(target.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4))
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3)

  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000))
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

// 主函数
async function main() {
  // 解析参数
  const { episode: argEpisode, date: argDate, force, local } = parseArgs()

  // 获取文件系统中的最新期数
  const latestEpisode = await getLatestEpisodeNumber(local)

  // 确定期数和周标签
  let EPISODE_NUMBER: number
  let weekEnd: string
  let weekLabel: string

  if (argEpisode) {
    // 手动指定期数
    EPISODE_NUMBER = argEpisode
    weekEnd = argDate ?? getWeekEndDate()
    weekLabel = getWeekLabel(weekEnd)

    // 检查该周的文件是否已存在
    const exists = await weekExists(weekLabel)
    if (exists && !force) {
      console.log(`\n⚠️  ${weekLabel} 已存在！`)
      console.log(`提示：使用 --force 参数强制覆盖`)
      console.log(`示例：bun run gen -- --episode ${EPISODE_NUMBER} --force\n`)
      process.exit(0)
    }

    if (exists && force) {
      console.log(`\n📻 强制重新生成 ${weekLabel} (Episode ${EPISODE_NUMBER})`)
      console.log(`⚠️  将覆盖现有文件\n`)
    } else {
      console.log(`\n📻 手动生成 ${weekLabel} (Episode ${EPISODE_NUMBER})`)
      console.log(`✓ 手动指定期数: ${EPISODE_NUMBER}`)
      console.log(`${argDate ? `✓ 手动指定周结束日: ${weekEnd}` : '✓ 使用 HN 时区的上一周'}\n`)
    }
  } else {
    // 自动模式：生成下一期
    EPISODE_NUMBER = latestEpisode + 1
    weekEnd = argDate ?? getWeekEndDate()
    weekLabel = getWeekLabel(weekEnd)

    console.log(`\n📻 自动模式：生成 ${weekLabel} (Episode ${EPISODE_NUMBER})`)
    console.log(`✓ 从文件系统检测最新期数: ${latestEpisode} → ${EPISODE_NUMBER}`)
    console.log(`${argDate ? `✓ 手动指定周结束日: ${weekEnd}` : '✓ 使用 HN 时区的上一周'}\n`)
  }

  // 这一周覆盖的日期区间（写进 prompt，避免模型把周更说成日更）
  const weekStart = new Date(new Date(`${weekEnd}T00:00:00Z`).getTime() - 6 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]
  const weekRange = `${weekStart} 至 ${weekEnd}`

  // 本地调试模式提示
  if (local) {
    console.log(`🔧 本地调试模式：音频照常生成，但不上传 R2 / 不更新 KV\n`)
  }

  // Step 1: 抓 HN 候选，用 Exa 摘要做初筛（不调用 LLM）
  const rawStories = await fetchWeeklyTopStories(weekEnd)
  if (rawStories.length === 0) throw new Error(`${weekLabel} 没有取到任何候选故事`)

  const screened = await screenStories(rawStories)
  const successRate = screened.length / rawStories.length
  console.log(`📊 初筛成功率 ${(successRate * 100).toFixed(0)}% (${screened.length}/${rawStories.length})`)
  if (screened.length < 10 || successRate < 0.6) {
    throw new Error(
      `可用候选故事太少（${screened.length}/${rawStories.length}），中止生成，避免产出残次品`
    )
  }

  // Step 2: 基于摘要生成 Blueprint
  const blueprint = await generateBlueprint({
    allStories: screened,
    weekRange,
  })

  // Step 2.0: 只对 blueprint 选中的故事批量提取「冲突 + 原话」
  const selectedIds = new Set(blueprint.segments.flatMap((segment) => segment.story_ids))
  const selectedStories: ScreenedStory[] = screened.filter((story) => selectedIds.has(story.id!))
  const processedStories: ProcessedStory[] = await extractIntel(selectedStories)

  assertChineseOutput(blueprint.episode_overview.title, 'Blueprint 标题', 0.3)
  assertChineseOutput(blueprint.episode_overview.description, 'Blueprint 简介', 0.4)

  // Step 2.1 Save Blueprint to R2 (skip in local mode)
  const blueprintKey = `episodes/${weekLabel}/blueprint.json`
  if (!local) {
    await r2.setItem(blueprintKey, JSON.stringify(blueprint, null, 2))
    console.log(`✅ Blueprint 已保存到 R2: ${blueprintKey}`)
  }

  // Step 3, Generate Cover Image. 任何一步失败都退回默认封面，不阻断后面的流程
  let imageBuffer: ArrayBuffer
  try {
    const coverPrompt = await generateCoverPrompt({
      blueprint: blueprint,
      dateStr: weekLabel,
    })
    imageBuffer = await generateCoverImage(coverPrompt)
  } catch (error) {
    console.warn('⚠️  封面生成失败，改用默认封面:', error)
    imageBuffer = await loadDefaultCover()
  }

  // Step 3.1 Save Cover Image to R2 and temporary directory
  const tmpDir = join(process.cwd(), '.tmp')
  await mkdir(tmpDir, { recursive: true })
  const coverImagePath = join(tmpDir, `cover-${weekLabel}.png`)
  await writeFile(coverImagePath, new Uint8Array(imageBuffer))
  console.log(`✅ Cover Image 已保存到临时目录: ${coverImagePath}`)

  if (!local) {
    const coverImageKey = `episodes/${weekLabel}/cover.png`
    await r2.setItemRaw(coverImageKey, new Uint8Array(imageBuffer))
    console.log(`✅ Cover Image 已保存到 R2: ${coverImageKey}`)
  }

  // Step 4: Generate Scripts
  console.log('\n📝 开始生成脚本...')

  // Step 4.1: Generate Intro Script
  const introScript = await generateIntroScript({
    episodeOverview: blueprint.episode_overview,
    weekRange,
  })

  // Step 4.2: Generate Segment Scripts
  const segmentScripts: SegmentScript[] = []

  for (let i = 0; i < blueprint.segments.length; i++) {
    const segment = blueprint.segments[i]
    const segmentScript = await generateSegmentScript({
      segment,
      allStories: processedStories,
      episodeOverview: blueprint.episode_overview,
      segmentIndex: i,
      weekRange,
    })
    segmentScripts.push(segmentScript)
  }

  // Step 4.3: Generate Outro Script
  const outroScript = await generateOutroScript({
    episodeOverview: blueprint.episode_overview,
    weekRange,
  })

  // Step 4.4: Combine all scripts
  const fullScript = {
    intro: introScript,
    segments: segmentScripts,
    outro: outroScript,
    metadata: {
      date: weekEnd,
      title: blueprint.episode_overview.title,
      description: blueprint.episode_overview.description,
      vibe: blueprint.episode_overview.vibe,
      totalSegments: blueprint.segments.length,
    },
  }

  // Step 5: 生成音频（本地模式也生成，区别只是不上传）
  console.log('\n🎵 开始生成音频...')
  const audioFileName = `episode-${weekLabel}.mp3`
  const { audioPath, scriptWithTimeline } = await generatePodcastAudio(
    fullScript,
    audioFileName,
    coverImagePath
  )
  console.log(`✅ 音频已生成: ${audioPath}`)

  if (!local) {
    // Step 5.0: 完整脚本（含时间轴）上传 R2
    const scriptKey = `episodes/${weekLabel}/script.json`
    await r2.setItem(scriptKey, JSON.stringify(scriptWithTimeline, null, 2))
    console.log(`✅ 完整脚本（含时间轴）已保存到 R2: ${scriptKey}`)

    // Step 5.1: 上传音频到 R2
    console.log('\n📤 上传音频到 R2...')
    const audioBuffer = await readFile(audioPath)
    const audioKey = `episodes/${weekLabel}/audio.mp3`
    await r2.setItemRaw(audioKey, new Uint8Array(audioBuffer))
    console.log(`✅ 音频已上传到 R2: ${audioKey}`)

    // Step 5.2: 清理临时文件
    await rm(audioPath)
    await rm(coverImagePath)
    console.log(`🧹 已清理临时音频文件和封面图片`)
  } else {
    const scriptPath = join(tmpDir, `script-${weekLabel}.json`)
    await writeFile(scriptPath, JSON.stringify(scriptWithTimeline, null, 2), 'utf-8')
    console.log(`✅ 脚本已保存: ${scriptPath}`)
    console.log(`🎧 本地模式：音频留在 ${audioPath}，未上传`)
  }

  // Step 6: Convert to Markdown and save locally
  console.log('\n📄 生成 Markdown 文件...')
  const r2PublicUrl = process.env.CF_R2_PUBLIC_URL || ''
  const audioUrl = local ? '' : `${r2PublicUrl}/episodes/${weekLabel}/audio.mp3`
  const coverImageUrl = local
    ? `/src/content/episodes/cover-${weekLabel}.png`
    : `${r2PublicUrl}/episodes/${weekLabel}/cover.png`
  const markdown = await convertScriptToMarkdown(
    scriptWithTimeline,
    blueprint,
    processedStories,
    EPISODE_NUMBER,
    audioUrl,
    coverImageUrl
  )

  const episodesDir = join(process.cwd(), '..', 'web', 'src', 'content', 'episodes')
  const markdownPath = join(episodesDir, `${weekLabel}.md`)

  await writeFile(markdownPath, markdown, 'utf-8')
  console.log(`✅ Markdown 已保存到: ${markdownPath}`)

  // Step 7: 更新 KV 中的最新期数（仅在生成新期数且非本地模式时）
  if (EPISODE_NUMBER > latestEpisode && !local) {
    await updateLatestEpisodeNumberInKV(EPISODE_NUMBER)
  }

  if (local) {
    console.log(`\n🎉 播客 Episode ${EPISODE_NUMBER} 本地调试生成完成！`)
    console.log(`📁 生成的文件：`)
    console.log(`   - 封面图片: ${coverImagePath}`)
    console.log(`   - 脚本: ${join(tmpDir, `script-${weekLabel}.json`)}`)
    console.log(`   - Markdown: ${markdownPath}`)
  } else {
    console.log(`\n🎉 播客 Episode ${EPISODE_NUMBER} 生成完成！`)
  }
}

// 执行主函数
main().catch((error) => {
  console.error('\n❌ 生成播客时发生错误:')
  console.error(error)
  process.exit(1)
})
