import { synthesizeSpeech } from './azure-tts'
import { podcastConfig } from '@hn/config'
import path from 'path'
import { fileURLToPath } from 'url'
import type { SegmentScript, SegmentScriptWithTimeline } from '../ai/prompts/script'
import { execa } from 'execa'
import { readdir, writeFile, mkdir, rm } from 'fs/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

interface FullScript {
  intro: SegmentScript
  segments: SegmentScript[]
  outro: SegmentScript
  metadata: {
    date: string
    title: string
    description: string
    vibe: string
    totalSegments: number
  }
}

export interface FullScriptWithTimeline {
  intro: SegmentScriptWithTimeline
  segments: SegmentScriptWithTimeline[]
  outro: SegmentScriptWithTimeline
  metadata: FullScript['metadata']
}

/**
 * 获取音频时长
 */
const getAudioDuration = async (assetPath: string): Promise<number> => {
  try {
    const { stdout } = await execa('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      assetPath,
    ])
    const duration = parseFloat(stdout)
    return duration > 0 ? duration : 0
  } catch (error) {
    console.error(`Failed to get duration for ${assetPath}:`, error)
    return 0
  }
}

/**
 * 创建静音文件
 */
const createSilenceFile = async (duration: number, outputDir: string): Promise<string> => {
  const outputPath = path.join(outputDir, `silence_${duration}s.mp3`)
  // 检查是否已存在，避免重复生成
  try {
    await execa('ffmpeg', [
      '-f',
      'lavfi',
      '-i',
      `anullsrc=r=44100:cl=stereo:d=${duration}`,
      '-q:a',
      '9',
      '-y',
      outputPath,
    ])
    return outputPath
  } catch (error) {
    console.error(`Failed to create silence file:`, error)
    throw error
  }
}

/**
 * 批量处理语音合成（顺序处理）
 */
export const processSectionVoice = async (
  lines: SegmentScript['lines'],
  prefix: string,
  tmpDir: string,
  {
    synthesize = synthesizeSpeech,
    write = writeFile,
    getDuration = getAudioDuration,
    config = podcastConfig,
  } = {}
): Promise<{ path: string; duration: number }[]> => {
  const results: ({ path: string; duration: number } | null)[] = []

  // 改为顺序处理，每次处理 1 条，防止限流
  for (const [index, line] of lines.entries()) {
    console.log(`  🎙️ [语音合成] 正在处理 ${prefix} 序号: ${index + 1}/${lines.length}...`)

    const host = line.speaker === config.hosts.female.name ? config.hosts.female : config.hosts.male
    const style = 'general'

    try {
      const buffer = await synthesize(line.text, host.voice, style)
      const filePath = path.join(tmpDir, `${prefix}_line_${index}.mp3`)
      await write(filePath, new Uint8Array(buffer))
      const duration = await getDuration(filePath)
      results.push({ path: filePath, duration })
    } catch (error) {
      console.error(`  ❌ 合成失败 (${line.speaker}):`, error)
      results.push(null)
    }
  }

  return results.filter((r): r is { path: string; duration: number } => r !== null)
}

/**
 * 将结构化脚本转换为带 BGM 和转场音效的完整播客音频
 */
export const generatePodcastAudio = async (
  fullScript: FullScript,
  outputFileName: string,
  coverImagePath?: string
): Promise<{ audioPath: string; scriptWithTimeline: FullScriptWithTimeline }> => {
  console.log(`\n🔊 [音频合成] 启动高级音频合成 (Fluent-FFmpeg + 情感 TTS)...`)
  const startTime = performance.now()

  // 创建临时工作目录
  const tmpDir = path.join(__dirname, '../.tmp/audio_proc')
  await mkdir(tmpDir, { recursive: true })

  // --- 1. 辅助函数：裁剪音频素材 ---
  type MusicAsset = {
    path: string
    duration: number
  }

  const trimAsset = async (assetPath: string, name: string): Promise<MusicAsset> => {
    const outPath = path.join(tmpDir, `${name}.mp3`)
    const originalDuration = await getAudioDuration(assetPath)
    const maxMusicDuration = podcastConfig.audio.maxMusicDuration
    const targetDuration =
      originalDuration > 0 ? Math.min(maxMusicDuration, originalDuration) : maxMusicDuration

    await execa('ffmpeg', ['-i', assetPath, '-t', targetDuration.toString(), '-y', outPath])

    return { path: outPath, duration: targetDuration }
  }

  const getRandomAssetAndTrim = async (
    dirPath: string,
    name: string
  ): Promise<MusicAsset | null> => {
    const assetPath = await getRandomFile(dirPath)
    if (!assetPath) return null
    console.log(`  ✂️ [剪辑] ${name} 裁切至 10s: ${path.basename(assetPath)}`)
    return await trimAsset(assetPath, name)
  }

  // 生成 0.1s 静音文件，用于语句间隔
  const silenceGapFile = await createSilenceFile(0.1, tmpDir)

  // --- 2. 准备开场音乐 ---
  const introMusic = await getRandomAssetAndTrim('assets/intro', 'intro_bgm')

  // --- 3. 合成语音行 ---
  const transitionCandidates = await getRandomFiles(
    'assets/transitions',
    fullScript.segments.length + 1
  )
  const introTransitionPath = transitionCandidates[0] ?? (await getRandomFile('assets/transitions'))
  const segmentTransitionCandidates = transitionCandidates.slice(1)

  console.log('\n  --- 合成 Intro 章节人声 ---')
  const introResults = await processSectionVoice(fullScript.intro.lines, 'intro', tmpDir)

  const introTransition = introTransitionPath
    ? await trimAsset(introTransitionPath, 'trans_intro')
    : null

  const segmentVoiceResults: { path: string; duration: number }[][] = []
  const transMusicFiles: (MusicAsset | null)[] = []

  for (let i = 0; i < fullScript.segments.length; i++) {
    const segment = fullScript.segments[i]!
    const transitionPath =
      segmentTransitionCandidates[i] ?? (await getRandomFile('assets/transitions'))
    const trimmed = transitionPath ? await trimAsset(transitionPath, `trans_${i}`) : null
    transMusicFiles.push(trimmed)

    console.log(`\n  --- 合成 Segment ${i + 1} 章节人声 ---`)
    const files = await processSectionVoice(segment.lines, `seg_${i}`, tmpDir)
    segmentVoiceResults.push(files)
  }

  console.log('\n  --- 合成 Outro 章节人声 ---')
  const outroResults = await processSectionVoice(fullScript.outro.lines, 'outro', tmpDir)

  // --- 4. 章节内人声合并 (Concat) ---
  const concatFiles = async (
    files: string[],
    outName: string,
    gapFile?: string
  ): Promise<string | null> => {
    if (files.length === 0) return null
    const outPath = path.join(tmpDir, outName)

    // 创建 concat 文件列表
    const concatListPath = path.join(tmpDir, `${outName}.txt`)
    let concatContent = ''

    if (gapFile && files.length > 1) {
      const lines: string[] = []
      files.forEach((f, i) => {
        lines.push(`file '${f}'`)
        // 在除了最后一个文件之外的所有文件后添加静音
        if (i < files.length - 1) {
          lines.push(`file '${gapFile}'`)
        }
      })
      concatContent = lines.join('\n')
    } else {
      concatContent = files.map((f) => `file '${f}'`).join('\n')
    }

    await writeFile(concatListPath, concatContent)

    // 重新编码合并，不再使用 apad
    await execa('ffmpeg', [
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatListPath,
      '-ar',
      '44100',
      '-ac',
      '2',
      '-b:a',
      '128k',
      '-y',
      outPath,
    ])

    return outPath
  }

  console.log('\n  📦 正在预拼接各个章节人声...')

  // 拼接时插入 0.1s 静音
  const vIntro = await concatFiles(
    introResults.map((r) => r.path),
    'v_intro.mp3',
    silenceGapFile
  )
  const vSegs = await Promise.all(
    segmentVoiceResults.map((results, i) =>
      concatFiles(
        results.map((r) => r.path),
        `v_seg_${i}.mp3`,
        silenceGapFile
      )
    )
  )
  const vOutro = await concatFiles(
    outroResults.map((r) => r.path),
    'v_outro.mp3',
    silenceGapFile
  )

  // --- 5. 计算时间轴 (Timeline Calculation) ---
  // 核心思路：基于实际拼接后的音频文件时长来计算时间轴，而不是累加预估时长

  /**
   * 计算章节内部的时间戳
   * @param results 每个语音片段的时长数组
   * @param baseTime 该章节在全局时间轴中的起始时间
   * @param actualConcatDuration 实际拼接后的音频文件总时长（已包含间隔）
   */
  const calculateSectionTimestamps = (
    results: { duration: number }[],
    baseTime: number
  ): { start: number; end: number }[] => {
    if (results.length === 0) return []

    const timestamps: { start: number; end: number }[] = []
    let currentTime = 0 // 从 0 开始，相对于章节起始位置

    results.forEach((r, index) => {
      // 修正：将时间戳提前 0.1s（即指向前一个静音片段的开始），以优化播放体验
      // 第一句不提前，因为没有前置静音
      const offset = index > 0 ? -0.1 : 0
      const start = Math.round((baseTime + currentTime + offset) * 100) / 100
      const end = Math.round((baseTime + currentTime + r.duration) * 100) / 100
      timestamps.push({ start, end })

      // 更新时间：片段时长 + 0.1s 间隔（最后一个片段后无间隔）
      currentTime += r.duration
      if (index < results.length - 1) {
        currentTime += 0.1
      }
    })

    return timestamps
  }

  // --- 6. 最终混音与全篇拼接 (Filter Complex) ---
  console.log('\n  🎬 正在进行最终全篇混音与渲染...')

  const { fadeDuration, silenceGap } = podcastConfig.audio
  const musicVolume = 0.25

  // 构建播放列表 (Clips)
  type Clip =
    | {
        kind: 'music'
        path: string
        duration: number
        fadeIn?: boolean
      }
    | {
        kind: 'voice'
        path: string
        results: { duration: number }[] // 用于计算内部时间轴
        sectionRef: 'intro' | 'outro' | 'segment'
        actualDuration: number // 实际文件时长
      }
    | {
        kind: 'silence'
        duration: number
      }

  const clips: Clip[] = []

  // Intro Music
  if (introMusic) {
    clips.push({
      kind: 'music',
      path: introMusic.path,
      duration: introMusic.duration,
      fadeIn: false, // 禁用淡入
    })
    clips.push({ kind: 'silence', duration: silenceGap })
  }

  // Intro Voice
  if (vIntro && introResults.length > 0) {
    const actualDuration = await getAudioDuration(vIntro)
    clips.push({
      kind: 'voice',
      path: vIntro,
      results: introResults,
      sectionRef: 'intro',
      actualDuration,
    })
  }

  // Intro Transition
  const activeSegIndices = vSegs
    .map((seg, index) => (seg ? index : null))
    .filter((index): index is number => index !== null)

  if (vIntro && activeSegIndices.length > 0 && introTransition) {
    clips.push({
      kind: 'music',
      path: introTransition.path,
      duration: introTransition.duration,
      fadeIn: false,
    })
    clips.push({ kind: 'silence', duration: silenceGap })
  }

  // Segments
  for (let index = 0; index < activeSegIndices.length; index++) {
    const segIndex = activeSegIndices[index]!
    const segmentPath = vSegs[segIndex]
    const results = segmentVoiceResults[segIndex]
    if (segmentPath && results && results.length > 0) {
      const actualDuration = await getAudioDuration(segmentPath)
      clips.push({
        kind: 'voice',
        path: segmentPath,
        results: results,
        sectionRef: 'segment',
        actualDuration,
      })
    }
    const hasNextAudio = index < activeSegIndices.length - 1 || Boolean(vOutro)
    const transitionPath = transMusicFiles[segIndex]
    if (hasNextAudio && transitionPath) {
      clips.push({
        kind: 'music',
        path: transitionPath.path,
        duration: transitionPath.duration,
        fadeIn: false,
      })
      clips.push({ kind: 'silence', duration: silenceGap })
    }
  }

  // Outro Voice
  if (vOutro && outroResults.length > 0) {
    const actualDuration = await getAudioDuration(vOutro)
    clips.push({
      kind: 'voice',
      path: vOutro,
      results: outroResults,
      sectionRef: 'outro',
      actualDuration,
    })
  }

  // --- 生成最终时间轴和 FFmpeg 输入 ---
  let globalCurrentTime = 0
  const finalTimelines: Map<string, { start: number; end: number }[]> = new Map()
  let introTimeline: { start: number; end: number }[] = []
  let outroTimeline: { start: number; end: number }[] = []
  const segmentTimelines: { start: number; end: number }[][] = new Array(
    fullScript.segments.length
  ).fill([])

  // 遍历 clips 计算时间轴
  // 注意：这里的 currentTime 是累加的
  for (const clip of clips) {
    if (clip.kind === 'silence') {
      globalCurrentTime += clip.duration
    } else if (clip.kind === 'music') {
      globalCurrentTime += clip.duration
    } else if (clip.kind === 'voice') {
      // 计算该段语音内部的准确时间轴，并加上当前的 globalCurrentTime 偏移
      const timestamps = calculateSectionTimestamps(
        clip.results,
        globalCurrentTime
      )

      // 保存时间轴
      if (clip.sectionRef === 'intro') introTimeline = timestamps
      else if (clip.sectionRef === 'outro') outroTimeline = timestamps
      else if (clip.sectionRef === 'segment') {
        // 找到对应的 segment index
        // 这里需要反查 segment index，有点麻烦，可以改进 Clip 结构
        // 简单处理：我们按顺序遍历 segments，所以可以通过比较 path 或者 results 来匹配
        // 但这里我们知道 clips 的顺序，所以可以直接存储
        // 更稳妥的方式是在 Clip 中存 index，这里简化处理，假设 segmentPath 唯一
        const segIdx = vSegs.indexOf(clip.path)
        if (segIdx !== -1) {
          segmentTimelines[segIdx] = timestamps
        }
      }

      // 更新全局时间
      // 使用实际文件时长而不是预估时长，防止漂移
      globalCurrentTime += clip.actualDuration
    }
  }

  // 更新 FullScriptWithTimeline
  const addTimeline = (
    script: SegmentScript,
    ts: { start: number; end: number }[]
  ): SegmentScriptWithTimeline => ({
    lines: script.lines.map((line, i) => ({
      ...line,
      start: ts[i]?.start ?? 0,
      end: ts[i]?.end ?? 0,
    })),
  })

  const scriptWithTimeline: FullScriptWithTimeline = {
    intro: addTimeline(fullScript.intro, introTimeline),
    segments: fullScript.segments.map((seg, i) => addTimeline(seg, segmentTimelines[i] || [])),
    outro: addTimeline(fullScript.outro, outroTimeline),
    metadata: fullScript.metadata,
  }

  if (clips.length === 0) {
    throw new Error('No audio clips available for rendering')
  }

  // --- 构建 FFmpeg 命令 ---
  let filterComplex = ''
  let inputIdx = 0
  const concatInputs: string[] = []
  const audioFormat = 'aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo'
  const ffmpegInputs: string[] = []

  clips.forEach((clip, idx) => {
    const clipLabel = `clip_${idx}`
    if (clip.kind === 'silence') {
      filterComplex += `anullsrc=r=44100:cl=stereo:d=${clip.duration}[${clipLabel}];`
    } else {
      ffmpegInputs.push('-i', clip.path)
      const inputLabel = `[${inputIdx}:a]`
      inputIdx += 1
      if (clip.kind === 'music') {
        const fadeOutStart = Math.max(clip.duration - fadeDuration, 0)
        // 只做淡出，不做淡入
        const filters = [
          `atrim=0:${clip.duration}`,
          `afade=t=out:st=${fadeOutStart}:d=${fadeDuration}`,
          `volume=${musicVolume}`,
          audioFormat,
        ]
        filterComplex += `${inputLabel}${filters.join(',')}[${clipLabel}];`
      } else {
        // voice 类型，只做格式转换
        filterComplex += `${inputLabel}${audioFormat}[${clipLabel}];`
      }
    }
    concatInputs.push(`[${clipLabel}]`)
  })

  filterComplex += `${concatInputs.join('')}concat=n=${concatInputs.length}:v=0:a=1[final_a]`

  const finalOutputPath = path.join(__dirname, '../.tmp', outputFileName)
  await mkdir(path.dirname(finalOutputPath), { recursive: true })

  const ffmpegArgs = [
    ...ffmpegInputs,
    '-filter_complex',
    filterComplex,
    '-map',
    '[final_a]',
    '-y',
    finalOutputPath,
  ]

  // 如果提供了封面图片，添加封面嵌入参数（放在所有音频输入之后）
  if (coverImagePath) {
    const filterComplexIdx = ffmpegArgs.indexOf('-filter_complex')
    ffmpegArgs.splice(filterComplexIdx, 0, '-i', coverImagePath)
    const mapIdx = ffmpegArgs.indexOf('-map')
    ffmpegArgs.splice(mapIdx + 2, 0, '-map', `${inputIdx}:0`)
    const yIdx = ffmpegArgs.indexOf('-y')
    ffmpegArgs.splice(
      yIdx,
      0,
      '-c:v',
      'copy',
      '-disposition:v:0',
      'attached_pic',
      '-metadata:s:v',
      'title=Album cover',
      '-metadata:s:v',
      'comment=Cover (front)'
    )
  }

  console.log(`  🚀 运行 ffmpeg 命令...`)
  await execa('ffmpeg', ffmpegArgs)

  const duration = ((performance.now() - startTime) / 1000).toFixed(2)
  console.log(`\n✅ [音频合成完毕] 耗时: ${duration}秒`)
  console.log(`📍 文件存放在: ${finalOutputPath}`)

  // 清理临时目录（保留最终输出文件）
  await rm(tmpDir, { recursive: true })
  console.log(`🧹 已清理临时目录: ${tmpDir}`)

  return { audioPath: finalOutputPath, scriptWithTimeline }
}

/**
 * 随机获取目录下的一个文件
 */
async function getRandomFile(dirPath: string): Promise<string | null> {
  try {
    const absolutePath = path.join(__dirname, '..', dirPath)
    const files = await readdir(absolutePath)
    const mp3Files = files.filter((f) => f.endsWith('.mp3'))
    if (mp3Files.length === 0) return null
    const randomFile = mp3Files[Math.floor(Math.random() * mp3Files.length)]!
    return path.join(absolutePath, randomFile)
  } catch {
    return null
  }
}

async function getRandomFiles(dirPath: string, count: number): Promise<string[]> {
  try {
    const absolutePath = path.join(__dirname, '..', dirPath)
    const files = await readdir(absolutePath)
    const mp3Files = files.filter((f) => f.endsWith('.mp3'))
    if (mp3Files.length === 0) return []
    const shuffled = mp3Files.sort(() => Math.random() - 0.5)
    const picked = shuffled.slice(0, count)
    return picked.map((file) => path.join(absolutePath, file))
  } catch {
    return []
  }
}
