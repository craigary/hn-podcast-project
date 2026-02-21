import { describe, it } from 'node:test'
import assert from 'node:assert'
import { processSectionVoice } from './tts.ts'
import type { SegmentScript } from '../ai/prompts/script'

describe('TTS Processor', () => {
  it('should process lines sequentially', async () => {
    const lines: SegmentScript['lines'] = [
      { text: 'Line 1', speaker: 'Host A' },
      { text: 'Line 2', speaker: 'Host B' },
      { text: 'Line 3', speaker: 'Host A' },
    ]

    const calls: { start: number; end: number; text: string }[] = []

    const mockSynthesize = async (text: string) => {
      const start = Date.now()
      await new Promise((resolve) => setTimeout(resolve, 50)) // Simulate 50ms work
      const end = Date.now()
      calls.push({ start, end, text })
      return Buffer.from('audio')
    }

    const mockWrite = async () => {}
    const mockGetDuration = async () => 1.0
    const mockConfig = {
      hosts: {
        female: { name: 'Host A', voice: 'VoiceA' },
        male: { name: 'Host B', voice: 'VoiceB' },
      },
    }

    await processSectionVoice(lines, 'test', '/tmp', {
      synthesize: mockSynthesize as unknown as any,
      write: mockWrite as unknown as any,
      getDuration: mockGetDuration,
      config: mockConfig as any,
    })

    assert.strictEqual(calls.length, 3)
    assert.strictEqual(calls[0].text, 'Line 1')
    assert.strictEqual(calls[1].text, 'Line 2')
    assert.strictEqual(calls[2].text, 'Line 3')

    // Verify sequential: start of next call should be >= end of previous call
    assert.ok(calls[1].start >= calls[0].end, 'Line 2 started before Line 1 finished')
    assert.ok(calls[2].start >= calls[1].end, 'Line 3 started before Line 2 finished')
  })
})
