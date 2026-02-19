import { generateBlueprint } from './steps/blueprint'
import { generateCoverImage, generateCoverPrompt } from './steps/image'
import { generateSegmentScript, generateIntroScript, generateOutroScript } from './steps/script'
import { fetchHackerNewsTopStories, processStories } from './utils/hn'
import { r2 } from './utils/storage/r2'
import { kv } from './utils/storage/kv'
import { convertScriptToMarkdown } from './utils/markdown'
import { generatePodcastAudio } from './utils/tts'
import { writeFile, readFile, rm, readdir } from 'fs/promises'
import { join } from 'path'

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2)
  let episode: number | undefined
  let date: string | undefined

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--episode' && args[i + 1]) {
      episode = parseInt(args[i + 1], 10)
      i++
    } else if (args[i] === '--date' && args[i + 1]) {
      date = args[i + 1]
      i++
    }
  }

  return { episode, date }
}

// 从 KV 获取最新的期数
async function getLatestEpisodeNumberFromKV(): Promise<number> {
  const KV_KEY = 'latest_episode_number'
  try {
    const stored = await kv.getItem(KV_KEY)
    if (stored && typeof stored === 'number') {
      return stored
    }
    // 如果 KV 中没有，尝试从本地文件系统获取
    return await getLatestEpisodeNumberFromFS()
  } catch {
    console.log('⚠️  无法从 KV 读取期数，尝试从文件系统读取')
    return await getLatestEpisodeNumberFromFS()
  }
}

// 从文件系统获取最新的期数（备用方案）
async function getLatestEpisodeNumberFromFS(): Promise<number> {
  const episodesDir = join(process.cwd(), '..', 'web', 'src', 'content', 'episodes')
  try {
    const files = await readdir(episodesDir)
    const episodeNumbers = files
      .filter((f) => f.endsWith('.md'))
      .map((f) => parseInt(f.replace('.md', ''), 10))
      .filter((n) => !isNaN(n))

    if (episodeNumbers.length === 0) {
      return 1 // 如果没有任何期数，从 1 开始
    }

    return Math.max(...episodeNumbers)
  } catch {
    console.log('⚠️  无法读取 episodes 目录，使用默认期数 1')
    return 1
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
  const { episode: argEpisode, date: argDate } = parseArgs()

  // 确定是否为自动模式（未指定期数和日期）
  const isAutoMode = !argEpisode && !argDate

  // 确定期数和日期
  let EPISODE_NUMBER: number
  let date: string

  if (isAutoMode) {
    // 自动模式：从 KV 获取最新期数并自增
    const latestEpisode = await getLatestEpisodeNumberFromKV()
    EPISODE_NUMBER = latestEpisode + 1
    date = getHackerNewsDate()

    console.log(`\n📻 自动模式：生成播客 Episode ${EPISODE_NUMBER} (${date})`)
    console.log(`✓ 从 KV 获取最新期数: ${latestEpisode} → ${EPISODE_NUMBER}`)
    console.log(`✓ 使用 Hacker News 时区日期（昨天）\n`)
  } else {
    // 手动模式：使用指定的期数和日期
    EPISODE_NUMBER = argEpisode ?? (await getLatestEpisodeNumberFromKV()) + 1
    date = argDate ?? getHackerNewsDate()

    console.log(`\n📻 手动模式：生成播客 Episode ${EPISODE_NUMBER} (${date})`)
    console.log(`${argEpisode ? '✓ 手动指定期数' : '✓ 自动获取最新期数'}`)
    console.log(`${argDate ? '✓ 手动指定日期' : '✓ 使用 Hacker News 时区日期'}\n`)
  }

  const rawStories = await fetchHackerNewsTopStories(date)
  const processedStories = await processStories(rawStories)

  // Step 2: Generate Blueprints for the Podcast Script using the processed stories
  const blueprint = await generateBlueprint({
    allStories: processedStories,
    date,
  })

  // Step 2.1 Save Blueprint to R2
  const blueprintKey = `episodes/${date}/blueprint.json`
  await r2.setItem(blueprintKey, JSON.stringify(blueprint, null, 2))
  console.log(`✅ Blueprint 已保存到 R2: ${blueprintKey}`)

  // Step 3, Generate Cover Image.
  const coverPrompt = await generateCoverPrompt({
    blueprint: blueprint,
    dateStr: date,
  })

  const imageBuffer = await generateCoverImage(coverPrompt)

  // Step 3.1 Save Cover Image to R2
  const coverImageKey = `episodes/${date}/cover.png`
  await r2.setItemRaw(coverImageKey, new Uint8Array(imageBuffer))
  console.log(`✅ Cover Image 已保存到 R2: ${coverImageKey}`)

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

  // Step 4.5: Save Full Script to R2
  const scriptKey = `episodes/${date}/script.json`
  await r2.setItem(scriptKey, JSON.stringify(fullScript, null, 2))
  console.log(`✅ 完整脚本已保存到 R2: ${scriptKey}`)

  // Step 5: Generate Audio
  console.log('\n🎵 开始生成音频...')
  const audioFileName = `episode-${date}.mp3`
  const audioPath = await generatePodcastAudio(fullScript, audioFileName)

  // Step 5.1: Upload Audio to R2
  console.log('\n📤 上传音频到 R2...')
  const audioBuffer = await readFile(audioPath)
  const audioKey = `episodes/${date}/audio.mp3`
  await r2.setItemRaw(audioKey, new Uint8Array(audioBuffer))
  console.log(`✅ 音频已上传到 R2: ${audioKey}`)

  // Step 5.2: Clean up temporary audio file
  await rm(audioPath)
  console.log(`🧹 已清理临时音频文件`)

  // Step 6: Convert to Markdown and save locally
  console.log('\n📄 生成 Markdown 文件...')
  const r2PublicUrl = process.env.CF_R2_PUBLIC_URL || ''
  const audioUrl = `${r2PublicUrl}/episodes/${date}/audio.mp3`
  const coverImageUrl = `${r2PublicUrl}/episodes/${date}/cover.png`
  const markdown = convertScriptToMarkdown(
    fullScript,
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

  // Step 7: 更新 KV 中的最新期数（仅在自动模式下）
  if (isAutoMode) {
    await updateLatestEpisodeNumberInKV(EPISODE_NUMBER)
  }

  console.log(`\n🎉 播客 Episode ${EPISODE_NUMBER} 生成完成！`)
}

// 执行主函数
main().catch((error) => {
  console.error('\n❌ 生成播客时发生错误:')
  console.error(error)
  process.exit(1)
})
