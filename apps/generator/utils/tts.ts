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

  // --- 2. 准备开场音乐 ---
  const introMusic = await getRandomAssetAndTrim('assets/intro', 'intro_bgm')

  // --- 3. 合成语音行 ---
  const processSectionVoice = async (
    lines: SegmentScript['lines'],
    prefix: string
  ): Promise<{ path: string; duration: number }[]> => {
    const results: ({ path: string; duration: number } | null)[] = []

    // 批量处理语音合成，每次最多 3 条，防止限流
    const BATCH_SIZE = 3
    for (let i = 0; i < lines.length; i += BATCH_SIZE) {
      const chunk = lines.slice(i, i + BATCH_SIZE)
      console.log(`  🎙️ [语音合成] 正在处理 ${prefix} 批次: ${i} - ${i + chunk.length}...`)

      const chunkResults = await Promise.all(
        chunk.map(async (line, chunkIdx) => {
          const index = i + chunkIdx
          const host =
            line.speaker === podcastConfig.hosts.female.name
              ? podcastConfig.hosts.female
              : podcastConfig.hosts.male
          const style = 'general'

          try {
            const buffer = await synthesizeSpeech(line.text, host.voice, style)
            const filePath = path.join(tmpDir, `${prefix}_line_${index}.mp3`)
            await writeFile(filePath, new Uint8Array(buffer))
            const duration = await getAudioDuration(filePath)
            return { path: filePath, duration }
          } catch (error) {
            console.error(`  ❌ 合成失败 (${line.speaker}):`, error)
            return null
          }
        })
      )
      results.push(...chunkResults)
    }

    return results.filter((r): r is { path: string; duration: number } => r !== null)
  }

  const transitionCandidates = await getRandomFiles(
    'assets/transitions',
    fullScript.segments.length + 1
  )
  const introTransitionPath = transitionCandidates[0] ?? (await getRandomFile('assets/transitions'))
  const segmentTransitionCandidates = transitionCandidates.slice(1)

  console.log('\n  --- 合成 Intro 章节人声 ---')
  const introResults = await processSectionVoice(fullScript.intro.lines, 'intro')

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
    const files = await processSectionVoice(segment.lines, `seg_${i}`)
    segmentVoiceResults.push(files)
  }

  console.log('\n  --- 合成 Outro 章节人声 ---')
  const outroResults = await processSectionVoice(fullScript.outro.lines, 'outro')

  // --- 4. 章节内人声合并 (Concat) ---
  const concatFiles = async (files: string[], outName: string): Promise<string | null> => {
    if (files.length === 0) return null
    const outPath = path.join(tmpDir, outName)

    // 创建 concat 文件列表
    const concatListPath = path.join(tmpDir, `${outName}.txt`)
    const concatContent = files.map((f) => `file '${f}'`).join('\n')
    await writeFile(concatListPath, concatContent)

    // 使用重新编码而不是 copy，确保音频完整性，避免截断
    // 添加 apad 过滤器在每个片段末尾添加短暂静音，防止切断
    await execa('ffmpeg', [
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatListPath,
      '-af',
      'apad=pad_dur=0.1',
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
  const vIntro = await concatFiles(
    introResults.map((r) => r.path),
    'v_intro.mp3'
  )
  const vSegs = await Promise.all(
    segmentVoiceResults.map((results, i) =>
      concatFiles(
        results.map((r) => r.path),
        `v_seg_${i}.mp3`
      )
    )
  )
  const vOutro = await concatFiles(
    outroResults.map((r) => r.path),
    'v_outro.mp3'
  )

  // --- 5. 最终混音与全篇拼接 (Filter Complex) ---
  console.log('\n  🎬 正在进行最终全篇混音与渲染...')

  const { fadeDuration, silenceGap } = podcastConfig.audio
  const musicVolume = 0.25

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
      }
    | {
        kind: 'silence'
        duration: number
      }

  const clips: Clip[] = []
  if (introMusic) {
    clips.push({
      kind: 'music',
      path: introMusic.path,
      duration: introMusic.duration,
      fadeIn: true,
    })
    clips.push({ kind: 'silence', duration: silenceGap })
  }
  if (vIntro) {
    clips.push({ kind: 'voice', path: vIntro })
  }

  const activeSegIndices = vSegs
    .map((seg, index) => (seg ? index : null))
    .filter((index): index is number => index !== null)

  if (vIntro && activeSegIndices.length > 0 && introTransition) {
    clips.push({
      kind: 'music',
      path: introTransition.path,
      duration: introTransition.duration,
      fadeIn: true,
    })
    clips.push({ kind: 'silence', duration: silenceGap })
  }

  activeSegIndices.forEach((segIndex, index) => {
    const segmentPath = vSegs[segIndex]
    if (segmentPath) {
      clips.push({ kind: 'voice', path: segmentPath })
    }
    const hasNextAudio = index < activeSegIndices.length - 1 || Boolean(vOutro)
    const transitionPath = transMusicFiles[segIndex]
    if (hasNextAudio && transitionPath) {
      clips.push({
        kind: 'music',
        path: transitionPath.path,
        duration: transitionPath.duration,
        fadeIn: true,
      })
      clips.push({ kind: 'silence', duration: silenceGap })
    }
  })

  if (vOutro) {
    clips.push({ kind: 'voice', path: vOutro })
  }

  // --- 计算每行台词的绝对时间轴 ---
  type SectionRef = { section: 'intro' | 'outro' | 'segment'; segIdx?: number }
  const voiceSectionMap = new Map<string, SectionRef>()
  if (vIntro) voiceSectionMap.set(vIntro, { section: 'intro' })
  if (vOutro) voiceSectionMap.set(vOutro, { section: 'outro' })
  vSegs.forEach((p, i) => {
    if (p) voiceSectionMap.set(p, { section: 'segment', segIdx: i })
  })

  const sectionTimestamps: Map<string, { start: number; end: number }[]> = new Map()
  let currentTime = 0

  for (const clip of clips) {
    if (clip.kind === 'silence') {
      currentTime += clip.duration
    } else if (clip.kind === 'music') {
      currentTime += clip.duration
    } else if (clip.kind === 'voice') {
      const ref = voiceSectionMap.get(clip.path)
      let durations: number[] = []
      if (ref?.section === 'intro') durations = introResults.map((r) => r.duration)
      else if (ref?.section === 'outro') durations = outroResults.map((r) => r.duration)
      else if (ref?.section === 'segment' && ref.segIdx !== undefined)
        durations = segmentVoiceResults[ref.segIdx]?.map((r) => r.duration) ?? []

      const timestamps: { start: number; end: number }[] = []
      for (const dur of durations) {
        const start = Math.round(currentTime * 100) / 100
        const end = Math.round((currentTime + dur) * 100) / 100
        timestamps.push({ start, end })
        currentTime += dur
      }
      sectionTimestamps.set(clip.path, timestamps)
    }
  }

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
    intro: addTimeline(fullScript.intro, vIntro ? (sectionTimestamps.get(vIntro) ?? []) : []),
    segments: fullScript.segments.map((seg, i) =>
      addTimeline(seg, vSegs[i] ? (sectionTimestamps.get(vSegs[i]!) ?? []) : [])
    ),
    outro: addTimeline(fullScript.outro, vOutro ? (sectionTimestamps.get(vOutro) ?? []) : []),
    metadata: fullScript.metadata,
  }

  if (clips.length === 0) {
    throw new Error('No audio clips available for rendering')
  }

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
        const filters = [
          `atrim=0:${clip.duration}`,
          `afade=t=in:st=0:d=${fadeDuration}`,
          `afade=t=out:st=${fadeOutStart}:d=${fadeDuration}`,
          `volume=${musicVolume}`,
          audioFormat,
        ]
        filterComplex += `${inputLabel}${filters.join(',')}[${clipLabel}];`
      } else {
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
