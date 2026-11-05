import { generateBlueprint } from './steps/blueprint'
import { generateCoverImage, generateCoverPrompt, loadDefaultCover } from './steps/image'
import { generateSegmentScript, generateIntroScript, generateOutroScript } from './steps/script'
import { fetchWeeklyTopStories } from './utils/hn'
import { screenStories } from './steps/screen'
import { extractIntel } from './steps/intel'
import type { ProcessedStory, ScreenedStory } from './types'
import { assertChineseOutput } from './utils/validate'
import { r2 } from './utils/storage/r2'
import { convertScriptToMarkdown } from './utils/markdown'
import { generatePodcastAudio } from './utils/tts'
import type { SegmentScript } from './ai/prompts/script'
import { writeFile, readFile, rm, mkdir } from 'fs/promises'
import { join } from 'path'
import {
  addDays,
  getLatestTuesday,
  getPublishWindow,
  getWeekRangeLabel,
} from './utils/date'
import {
  EPISODES_DIR,
  publishEpisode,
  readEpisodeIndex,
  resolveEpisodeNumber,
} from './utils/episodes'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2)
  let date: string | undefined
  let force = false
  let local = false
  let dryRun = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    const value = args[i + 1]

    if (arg === '--date' && value) {
      date = value
      i++
    } else if (arg === '--force' || arg === '-f') {
      force = true
    } else if (arg === '--local' || arg === '-l') {
      local = true
      force = true // 本地模式默认启用 force，允许覆盖文件，方便调试
    } else if (arg === '--dry-run' || arg === '-n') {
      dryRun = true
    }
  }

  return { date, force, local, dryRun }
}

// 主函数
async function main() {
  const { date: argDate, force, local, dryRun } = parseArgs()

  // 默认取最近一个已经到来的周二（北京时间）；手动传 --date 可回填
  const publishDate = argDate ?? getLatestTuesday()
  if (!DATE_RE.test(publishDate)) {
    throw new Error(`--date 必须是 YYYY-MM-DD，收到: ${publishDate}`)
  }

  const { startDate, endDate } = getPublishWindow(publishDate)
  const weekRange = getWeekRangeLabel(publishDate)

  const index = await readEpisodeIndex()
  const { number: episodeNumber, existing } = resolveEpisodeNumber(index, publishDate)

  const lastPublished = index.episodes[index.episodes.length - 1]
  if (!argDate && lastPublished && lastPublished.date < addDays(publishDate, -7)) {
    console.warn(`⚠️  上一期是 ${lastPublished.date}，中间可能还有未生成的周二。`)
    console.warn(`   如果这是首次回填，请先运行 bun run backfill -- --dry-run 检查。`)
  }

  console.log(`\n📻 发布日 ${publishDate} / Episode ${episodeNumber}`)
  console.log(`✓ 内容窗口: ${weekRange}（北京时间）`)
  console.log(
    existing
      ? `✓ 该日期已存在：EP${episodeNumber}${force ? '，将强制重新生成' : ''}`
      : `✓ 新期：分配 EP${episodeNumber}`
  )

  if (dryRun) {
    console.log(`✓ dry-run：跳过抓取、生成、上传和写文件\n`)
    return
  }

  if (existing && !force) {
    console.log(`\n⚠️  ${publishDate} 已存在（EP${episodeNumber}），跳过。`)
    console.log(`提示：使用 --force 强制重新生成\n`)
    return
  }

  if (local) {
    console.log(`🔧 本地调试模式：不写 content、不上传 R2、不更新 index\n`)
  }

  // Step 1: 抓 HN 候选，用 Exa 摘要做初筛（不调用 LLM）
  const rawStories = await fetchWeeklyTopStories({ startDate, endDate })
  if (rawStories.length === 0) throw new Error(`${publishDate} 没有取到任何候选故事`)

  const screened = await screenStories(rawStories)
  const successRate = screened.length / rawStories.length
  console.log(
    `📊 初筛成功率 ${(successRate * 100).toFixed(0)}% (${screened.length}/${rawStories.length})`
  )
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
  const blueprintKey = `episodes/${episodeNumber}/blueprint.json`
  if (!local) {
    await r2.setItem(blueprintKey, JSON.stringify(blueprint, null, 2))
    console.log(`✅ Blueprint 已保存到 R2: ${blueprintKey}`)
  }

  // Step 3, Generate Cover Image. 任何一步失败都退回默认封面，不阻断后面的流程
  let imageBuffer: ArrayBuffer
  try {
    const coverPrompt = await generateCoverPrompt({
      blueprint,
      dateStr: publishDate,
    })
    imageBuffer = await generateCoverImage(coverPrompt)
  } catch (error) {
    console.warn('⚠️  封面生成失败，改用默认封面:', error)
    imageBuffer = await loadDefaultCover()
  }

  // Step 3.1 Save Cover Image to R2 and temporary directory
  const tmpDir = join(import.meta.dir, '.tmp')
  await mkdir(tmpDir, { recursive: true })
  const coverImagePath = join(tmpDir, `cover-${episodeNumber}.png`)
  await writeFile(coverImagePath, new Uint8Array(imageBuffer))
  console.log(`✅ Cover Image 已保存到临时目录: ${coverImagePath}`)

  if (!local) {
    const coverImageKey = `episodes/${episodeNumber}/cover.png`
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
    const segment = blueprint.segments[i]!
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
      date: publishDate,
      title: blueprint.episode_overview.title,
      description: blueprint.episode_overview.description,
      vibe: blueprint.episode_overview.vibe,
      totalSegments: blueprint.segments.length,
    },
  }

  // Step 5: 生成音频（本地模式也生成，区别只是不上传）
  console.log('\n🎵 开始生成音频...')
  const audioFileName = `episode-${episodeNumber}.mp3`
  const { audioPath, scriptWithTimeline } = await generatePodcastAudio(
    fullScript,
    audioFileName,
    coverImagePath
  )
  console.log(`✅ 音频已生成: ${audioPath}`)

  if (!local) {
    // Step 5.0: 完整脚本（含时间轴）上传 R2
    const scriptKey = `episodes/${episodeNumber}/script.json`
    await r2.setItem(scriptKey, JSON.stringify(scriptWithTimeline, null, 2))
    console.log(`✅ 完整脚本（含时间轴）已保存到 R2: ${scriptKey}`)

    // Step 5.1: 上传音频到 R2
    console.log('\n📤 上传音频到 R2...')
    const audioBuffer = await readFile(audioPath)
    const audioKey = `episodes/${episodeNumber}/audio.mp3`
    await r2.setItemRaw(audioKey, new Uint8Array(audioBuffer))
    console.log(`✅ 音频已上传到 R2: ${audioKey}`)

    // Step 5.2: 清理临时文件
    await rm(audioPath)
    await rm(coverImagePath)
    console.log(`🧹 已清理临时音频文件和封面图片`)
  } else {
    const scriptPath = join(tmpDir, `script-${episodeNumber}.json`)
    await writeFile(scriptPath, JSON.stringify(scriptWithTimeline, null, 2), 'utf-8')
    console.log(`✅ 脚本已保存: ${scriptPath}`)
    console.log(`🎧 本地模式：音频留在 ${audioPath}，未上传`)
  }

  // Step 6: Convert to Markdown and save locally
  console.log('\n📄 生成 Markdown 文件...')
  const r2PublicUrl = process.env.CF_R2_PUBLIC_URL || ''
  const audioUrl = local ? '' : `${r2PublicUrl}/episodes/${episodeNumber}/audio.mp3`
  const coverImageUrl = local ? '' : `${r2PublicUrl}/episodes/${episodeNumber}/cover.png`
  const markdown = await convertScriptToMarkdown(
    scriptWithTimeline,
    blueprint,
    processedStories,
    episodeNumber,
    audioUrl,
    coverImageUrl
  )

  // 本地模式只写到 .tmp，避免调试产物混进 content
  const markdownPath = local
    ? join(tmpDir, `${episodeNumber}.md`)
    : join(EPISODES_DIR, `${episodeNumber}.md`)

  await writeFile(markdownPath, markdown, 'utf-8')
  console.log(`✅ Markdown 已保存到: ${markdownPath}`)

  // Step 7: 发布成功后才写索引；失败或本地模式不消耗编号
  if (!local) {
    await publishEpisode({ number: episodeNumber, date: publishDate })
    console.log(`✅ 索引已更新: EP${episodeNumber} (${publishDate})`)
  }

  if (local) {
    console.log(`\n🎉 Episode ${episodeNumber} 本地调试生成完成！`)
    console.log(`📁 生成的文件：`)
    console.log(`   - 封面图片: ${coverImagePath}`)
    console.log(`   - 脚本: ${join(tmpDir, `script-${episodeNumber}.json`)}`)
    console.log(`   - Markdown: ${markdownPath}`)
  } else {
    console.log(`\n🎉 Episode ${episodeNumber} 生成完成！`)
  }
}

// 执行主函数
main().catch((error) => {
  console.error('\n❌ 生成播客时发生错误:')
  console.error(error)
  process.exit(1)
})
