import { generateBlueprint } from './steps/blueprint'
import { generateCoverImage, generateCoverPrompt } from './steps/image'
import { generateSegmentScript, generateIntroScript, generateOutroScript } from './steps/script'
import { fetchHackerNewsTopStories, processStories } from './utils/hn'
import { r2 } from './utils/storage/r2'
import { kv } from './utils/storage/kv'
import { convertScriptToMarkdown } from './utils/markdown'
import { generatePodcastAudio } from './utils/tts'
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
    }
  }

  return { episode, date, force, local }
}

// 获取最新的期数（优先从文件系统，KV 作为备用）
async function getLatestEpisodeNumber(): Promise<number> {
  // 优先从文件系统获取（single source of truth）
  const fsEpisode = await getLatestEpisodeNumberFromFS()

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
async function getLatestEpisodeNumberFromFS(): Promise<number> {
  const episodesDir = join(process.cwd(), '..', 'web', 'src', 'content', 'episodes')
  try {
    const files = await readdir(episodesDir)
    const episodeNumbers = files
      .filter((f) => f.endsWith('.md'))
      .map((f) => parseInt(f.replace('.md', ''), 10))
      .filter((n) => !isNaN(n))

    if (episodeNumbers.length === 0) {
      return 0 // 如果没有任何期数，返回 0，下一期从 1 开始
    }

    return Math.max(...episodeNumbers)
  } catch (error) {
    console.log('⚠️  无法读取 episodes 目录:', error)
    return 0
  }
}

// 检查指定期数的文件是否存在
async function episodeExists(episodeNumber: number): Promise<boolean> {
  const episodesDir = join(process.cwd(), '..', 'web', 'src', 'content', 'episodes')
  const markdownPath = join(episodesDir, `${episodeNumber}.md`)
  try {
    await readFile(markdownPath)
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

// 获取适合 Hacker News 的日期（考虑 PST/PDT 时区）
// Hacker News 使用 PST/PDT 时区（UTC-8 或 UTC-7）
// 为了避免当天新闻太少，使用昨天的日期
function getHackerNewsDate(): string {
  // 获取当前 UTC 时间
  const now = new Date()

  // 转换到 PST/PDT 时区（UTC-8）
  // 注意：这里简化处理，使用 UTC-8，实际上夏令时是 UTC-7
  const pstOffset = -8 * 60 // PST 是 UTC-8
  const pstTime = new Date(now.getTime() + pstOffset * 60 * 1000)

  // 使用昨天的日期，确保有足够的新闻
  pstTime.setDate(pstTime.getDate() - 1)

  return pstTime.toISOString().split('T')[0]
}

// 主函数
async function main() {
  // 解析参数
  const { episode: argEpisode, date: argDate, force, local } = parseArgs()

  // 获取文件系统中的最新期数
  const latestEpisode = await getLatestEpisodeNumber()

  // 确定期数和日期
  let EPISODE_NUMBER: number
  let date: string

  if (argEpisode) {
    // 手动指定期数
    EPISODE_NUMBER = argEpisode
    date = argDate ?? getHackerNewsDate()

    // 检查文件是否已存在
    const exists = await episodeExists(EPISODE_NUMBER)
    if (exists && !force) {
      console.log(`\n⚠️  Episode ${EPISODE_NUMBER} 已存在！`)
      console.log(`提示：使用 --force 参数强制覆盖`)
      console.log(`示例：pnpm run gen --episode ${EPISODE_NUMBER} --force\n`)
      process.exit(0)
    }

    if (exists && force) {
      console.log(`\n📻 强制重新生成 Episode ${EPISODE_NUMBER} (${date})`)
      console.log(`⚠️  将覆盖现有文件\n`)
    } else {
      console.log(`\n📻 手动生成 Episode ${EPISODE_NUMBER} (${date})`)
      console.log(`✓ 手动指定期数: ${EPISODE_NUMBER}`)
      console.log(`${argDate ? '✓ 手动指定日期' : '✓ 使用 Hacker News 时区日期'}\n`)
    }
  } else {
    // 自动模式：生成下一期
    EPISODE_NUMBER = latestEpisode + 1
    date = argDate ?? getHackerNewsDate()

    console.log(`\n📻 自动模式：生成播客 Episode ${EPISODE_NUMBER} (${date})`)
    console.log(`✓ 从文件系统检测最新期数: ${latestEpisode} → ${EPISODE_NUMBER}`)
    console.log(`${argDate ? '✓ 手动指定日期' : '✓ 使用 Hacker News 时区日期（昨天）'}\n`)
  }

  // 本地调试模式提示
  if (local) {
    console.log(`🔧 本地调试模式：跳过 TTS 和 R2 上传，仅生成脚本和图片\n`)
  }

  const rawStories = await fetchHackerNewsTopStories(date)
  const processedStories = await processStories(rawStories)

  // Step 2: Generate Blueprints for the Podcast Script using the processed stories
  const blueprint = await generateBlueprint({
    allStories: processedStories,
    date,
  })

  // Step 2.1 Save Blueprint to R2 (skip in local mode)
  const blueprintKey = `episodes/${date}/blueprint.json`
  if (!local) {
    await r2.setItem(blueprintKey, JSON.stringify(blueprint, null, 2))
    console.log(`✅ Blueprint 已保存到 R2: ${blueprintKey}`)
  }

  // Step 3, Generate Cover Image.
  const coverPrompt = await generateCoverPrompt({
    blueprint: blueprint,
    dateStr: date,
  })

  const imageBuffer = await generateCoverImage(coverPrompt)

  // Step 3.1 Save Cover Image to R2 and temporary directory
  const tmpDir = join(process.cwd(), '.tmp')
  await mkdir(tmpDir, { recursive: true })
  const coverImagePath = join(tmpDir, `cover-${date}.png`)
  await writeFile(coverImagePath, new Uint8Array(imageBuffer))
  console.log(`✅ Cover Image 已保存到临时目录: ${coverImagePath}`)

  if (!local) {
    const coverImageKey = `episodes/${date}/cover.png`
    await r2.setItemRaw(coverImageKey, new Uint8Array(imageBuffer))
    console.log(`✅ Cover Image 已保存到 R2: ${coverImageKey}`)
  }

  // Step 4: Generate Scripts
  console.log('\n📝 开始生成脚本...')

  // Step 4.1: Generate Intro Script
  const introScript = await generateIntroScript({
    episodeOverview: blueprint.episode_overview,
    date,
  })

  // Step 4.2: Generate Segment Scripts
  const segmentScripts = []

  for (let i = 0; i < blueprint.segments.length; i++) {
    const segment = blueprint.segments[i]
    const segmentScript = await generateSegmentScript({
      segment,
      allStories: processedStories,
      episodeOverview: blueprint.episode_overview,
      segmentIndex: i,
      date,
    })
    segmentScripts.push(segmentScript)
  }

  // Step 4.3: Generate Outro Script
  const outroScript = await generateOutroScript({
    episodeOverview: blueprint.episode_overview,
    date,
  })

  // Step 4.4: Combine all scripts
  const fullScript = {
    intro: introScript,
    segments: segmentScripts,
    outro: outroScript,
    metadata: {
      date,
      title: blueprint.episode_overview.title,
      description: blueprint.episode_overview.description,
      vibe: blueprint.episode_overview.vibe,
      totalSegments: blueprint.segments.length,
    },
  }

  // Step 5: Generate Audio (skip in local mode)
  let audioPath: string | undefined
  let scriptWithTimeline: any

  if (!local) {
    console.log('\n🎵 开始生成音频...')
    const audioFileName = `episode-${date}.mp3`
    const result = await generatePodcastAudio(fullScript, audioFileName, coverImagePath)
    audioPath = result.audioPath
    scriptWithTimeline = result.scriptWithTimeline

    // Step 5.0: Save Full Script (with timestamps) to R2
    const scriptKey = `episodes/${date}/script.json`
    await r2.setItem(scriptKey, JSON.stringify(scriptWithTimeline, null, 2))
    console.log(`✅ 完整脚本（含时间轴）已保存到 R2: ${scriptKey}`)

    // Step 5.1: Upload Audio to R2
    console.log('\n📤 上传音频到 R2...')
    const audioBuffer = await readFile(audioPath)
    const audioKey = `episodes/${date}/audio.mp3`
    await r2.setItemRaw(audioKey, new Uint8Array(audioBuffer))
    console.log(`✅ 音频已上传到 R2: ${audioKey}`)

    // Step 5.2: Clean up temporary audio file and cover image
    await rm(audioPath)
    await rm(coverImagePath)
    console.log(`🧹 已清理临时音频文件和封面图片`)
  } else {
    console.log('\n⏭️  本地调试模式：跳过音频生成和 R2 上传')
    // 在本地模式下，创建一个简化的脚本（不含时间轴）
    scriptWithTimeline = {
      intro: { lines: introScript.lines.map((line: any) => ({ ...line, start: 0, end: 0 })) },
      segments: segmentScripts.map((seg) => ({
        lines: seg.lines.map((line: any) => ({ ...line, start: 0, end: 0 })),
      })),
      outro: { lines: outroScript.lines.map((line: any) => ({ ...line, start: 0, end: 0 })) },
      metadata: fullScript.metadata,
    }

    // 保存脚本到本地临时目录
    const scriptPath = join(tmpDir, `script-${date}.json`)
    await writeFile(scriptPath, JSON.stringify(scriptWithTimeline, null, 2), 'utf-8')
    console.log(`✅ 脚本已保存到临时目录: ${scriptPath}`)
  }

  // Step 6: Convert to Markdown and save locally
  console.log('\n📄 生成 Markdown 文件...')
  const r2PublicUrl = process.env.CF_R2_PUBLIC_URL || ''
  const audioUrl = local ? '' : `${r2PublicUrl}/episodes/${date}/audio.mp3`
  const coverImageUrl = local
    ? `/src/content/episodes/cover-${date}.png`
    : `${r2PublicUrl}/episodes/${date}/cover.png`
  const markdown = await convertScriptToMarkdown(
    scriptWithTimeline,
    blueprint,
    processedStories,
    EPISODE_NUMBER,
    audioUrl,
    coverImageUrl
  )

  const episodesDir = join(process.cwd(), '..', 'web', 'src', 'content', 'episodes')
  const markdownPath = join(episodesDir, `${EPISODE_NUMBER}.md`)

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
    console.log(`   - 脚本: ${join(tmpDir, `script-${date}.json`)}`)
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
