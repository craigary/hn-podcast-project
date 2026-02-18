import { synthesizeSpeech } from './azure-tts'
import { podcastConfig } from '@hn/config'
import path from 'path'
import { fileURLToPath } from 'url'
import type { SegmentScript } from '../ai/prompts/script'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import { readdir, writeFile, mkdir, rm } from 'fs/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

ffmpeg.setFfmpegPath(ffmpegInstaller.path)

interface FullScript {
  intro: SegmentScript
  segments: SegmentScript[]
  outro: SegmentScript
  metadata: {
    date: string
    title: string
    vibe: string
    totalSegments: number
  }
}

/**
 * 将结构化脚本转换为带 BGM 和转场音效的完整播客音频
 */
export const generatePodcastAudio = async (
  fullScript: FullScript,
  outputFileName: string
): Promise<string> => {
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
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(assetPath, (error, metadata) => {
        if (error) {
          reject(error)
          return
        }
        const duration = metadata.format?.duration
        resolve(typeof duration === 'number' && duration > 0 ? duration : 0)
      })
    })
  }

  const trimAsset = async (assetPath: string, name: string): Promise<MusicAsset> => {
    const outPath = path.join(tmpDir, `${name}.mp3`)
    const originalDuration = await getAudioDuration(assetPath)
    const maxMusicDuration = podcastConfig.audio.maxMusicDuration
    const targetDuration =
      originalDuration > 0 ? Math.min(maxMusicDuration, originalDuration) : maxMusicDuration
    return new Promise((resolve, reject) => {
      ffmpeg(assetPath)
        .setDuration(targetDuration)
        .output(outPath)
        .on('end', () => resolve({ path: outPath, duration: targetDuration }))
        .on('error', (err) => reject(err))
        .run()
    })
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
  let globalLineIndex = 0
  const processSectionVoice = async (
    lines: SegmentScript['lines'],
    prefix: string
  ): Promise<string[]> => {
    const paths: string[] = []
    for (const line of lines) {
      const host =
        line.speaker === podcastConfig.hosts.female.name
          ? podcastConfig.hosts.female
          : podcastConfig.hosts.male
      const style = 'general' // 先去掉情绪，现在这个太难听了
      console.log(`  🎙️ [语音合成] ${line.speaker} | 语气: ${style} | 长度: ${line.text.length}字`)

      try {
        const buffer = await synthesizeSpeech(line.text, host.voice, style)
        const filePath = path.join(tmpDir, `${prefix}_line_${globalLineIndex++}.mp3`)
        await writeFile(filePath, new Uint8Array(buffer))
        paths.push(filePath)
      } catch (error) {
        console.error(`  ❌ 合成失败:`, error)
      }
    }
    return paths
  }

  console.log('\n  --- 合成 Intro 章节人声 ---')
  const introFiles = await processSectionVoice(fullScript.intro.lines, 'intro')

  const segmentVoiceFiles: string[][] = []
  const transMusicFiles: (MusicAsset | null)[] = []
  const transitionCandidates = await getRandomFiles(
    'assets/transitions',
    fullScript.segments.length + 1
  )
  const introTransitionPath = transitionCandidates[0] ?? (await getRandomFile('assets/transitions'))
  const introTransition = introTransitionPath
    ? await trimAsset(introTransitionPath, 'trans_intro')
    : null
  const segmentTransitionCandidates = transitionCandidates.slice(1)

  for (let i = 0; i < fullScript.segments.length; i++) {
    // 每个 Segment 准备一个独立的转场音效
    const transitionPath =
      segmentTransitionCandidates[i] ?? (await getRandomFile('assets/transitions'))
    if (transitionPath) {
      const trimmed = await trimAsset(transitionPath, `trans_${i}`)
      transMusicFiles.push(trimmed)
    } else {
      transMusicFiles.push(null)
    }

    console.log(`\n  --- 合成 Segment ${i + 1} 章节人声 ---`)
    const files = await processSectionVoice(fullScript.segments[i]!.lines, `seg_${i}`)
    segmentVoiceFiles.push(files)
  }

  console.log('\n  --- 合成 Outro 章节人声 ---')
  const outroFiles = await processSectionVoice(fullScript.outro.lines, 'outro')

  // --- 4. 章节内人声合并 (Concat) ---
  const concatFiles = async (files: string[], outName: string): Promise<string | null> => {
    if (files.length === 0) return null
    const outPath = path.join(tmpDir, outName)
    return new Promise((resolve, reject) => {
      const command = ffmpeg()
      files.forEach((f) => command.input(f))
      command
        .on('error', (err) => reject(err))
        .on('end', () => resolve(outPath))
        .mergeToFile(outPath, tmpDir)
    })
  }

  console.log('\n  📦 正在预拼接各个章节人声...')
  const vIntro = await concatFiles(introFiles, 'v_intro.mp3')
  const vSegs = await Promise.all(
    segmentVoiceFiles.map((files, i) => concatFiles(files, `v_seg_${i}.mp3`))
  )
  const vOutro = await concatFiles(outroFiles, 'v_outro.mp3')

  // --- 5. 最终混音与全篇拼接 (Filter Complex) ---
  console.log('\n  🎬 正在进行最终全篇混音与渲染...')

  const finalCommand = ffmpeg()
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

  if (clips.length === 0) {
    throw new Error('No audio clips available for rendering')
  }

  let filterComplex = ''
  let inputIdx = 0
  const concatInputs: string[] = []
  const audioFormat = 'aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo'

  clips.forEach((clip, idx) => {
    const clipLabel = `clip_${idx}`
    if (clip.kind === 'silence') {
      filterComplex += `anullsrc=r=44100:cl=stereo:d=${clip.duration}[${clipLabel}];`
    } else {
      finalCommand.input(clip.path)
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

  return new Promise<string>((resolve, reject) => {
    finalCommand
      .complexFilter(filterComplex)
      .map('[final_a]')
      .on('start', (cmd) => console.log(`  🚀 运行命令: ${cmd}`))
      .on('error', (err) => {
        console.error('  ❌ FFmpeg 混音失败:', err.message)
        reject(err)
      })
      .on('end', async () => {
        const duration = ((performance.now() - startTime) / 1000).toFixed(2)
        console.log(`\n✅ [音频合成完毕] 耗时: ${duration}秒`)
        console.log(`📍 文件存放在: ${finalOutputPath}`)

        // 清理临时目录（保留最终输出文件）
        await rm(tmpDir, { recursive: true })
        console.log(`🧹 已清理临时目录: ${tmpDir}`)

        resolve(finalOutputPath)
      })
      .save(finalOutputPath)
  })
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
