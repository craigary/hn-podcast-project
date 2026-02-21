/**
 * Audio Player Controller
 * A robust singleton controller that survives Astro page transitions.
 */

interface AudioPlayerState {
  src: string
  title: string
  currentTime: number
  isPlaying: boolean
  isVisible: boolean
}

declare global {
  interface Window {
    playEpisode?: (src: string, title: string) => void
  }
}

class AudioPlayerController {
  private static instance: AudioPlayerController | null = null

  private audio: HTMLAudioElement | null = null
  private bar: HTMLElement | null = null
  private elements: Record<string, HTMLElement | null> = {}

  private isDragging = false
  private isInitialized = false
  private saveTimeout: ReturnType<typeof setTimeout> | null = null

  constructor() {
    if (AudioPlayerController.instance) {
      AudioPlayerController.instance.refreshContext()
      return AudioPlayerController.instance
    }

    this.refreshContext()
    this.initGlobalListeners()
    this.initGlobalAPI()
    this.restoreState()

    AudioPlayerController.instance = this
    this.isInitialized = true
  }

  /**
   * Refreshes DOM references and re-syncs state for the current page.
   * Called on every page navigation.
   */
  public refreshContext() {
    this.audio = document.getElementById('podcast-audio') as HTMLAudioElement
    this.bar = document.getElementById('player-bar')

    const ids = [
      'play-btn',
      'icon-play',
      'icon-pause',
      'icon-loading',
      'progress-track',
      'progress-fill',
      'progress-thumb',
      'current-time',
      'total-time',
      'player-title',
      'close-player',
    ]

    ids.forEach((id) => {
      this.elements[this.toCamelCase(id)] = document.getElementById(id)
    })

    if (this.audio && !this.isInitialized) {
      this.bindAudioEvents()
    }

    // Ensure the bar stays visible if it was playing or had a source
    if (this.audio && this.audio.src && !this.audio.paused) {
      this.show()
    } else {
      const saved = sessionStorage.getItem('audioPlayerState')
      if (saved) {
        try {
          const state = this.parseAudioPlayerState(saved)
          if (state.isVisible && state.src) this.show()
        } catch {
          sessionStorage.removeItem('audioPlayerState')
        }
      }
    }

    // Immediate sync on page change
    this.sync()
    this.syncProgress()
  }

  private toCamelCase(str: string) {
    return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase())
  }

  private bindAudioEvents() {
    if (!this.audio) return

    this.audio.addEventListener('waiting', () => this.updateLoadingState(true))
    this.audio.addEventListener('playing', () => this.updateLoadingState(false))
    this.audio.addEventListener('canplay', () => this.updateLoadingState(false))

    // Core state sync
    this.audio.addEventListener('play', () => {
      this.onPlaybackChange()
      this.sync()
    })
    this.audio.addEventListener('pause', () => {
      this.onPlaybackChange()
      this.sync()
    })

    this.audio.addEventListener('timeupdate', () => {
      if (!this.isDragging) this.syncProgress()
      this.persistStateThrottled()
    })

    this.audio.addEventListener('loadedmetadata', () => {
      if (this.elements.totalTime) {
        this.elements.totalTime.textContent = this.formatTime(this.audio!.duration)
      }
      this.sync()
    })

    this.audio.addEventListener('emptied', () => this.sync())
  }

  private initGlobalListeners() {
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement

      // 1. Play Button in Bar
      if (target.closest('#play-btn')) {
        this.togglePlay()
        return
      }

      // 2. Close Button
      if (target.closest('#close-player')) {
        this.close()
        return
      }

      // 3. Episode Play Buttons
      const epBtn = target.closest('[data-audio-url]')
      if (epBtn) {
        const url = epBtn.getAttribute('data-audio-url')
        const title = epBtn.getAttribute('data-episode-title')
        if (url && title) {
          const isCurrent = this.audio?.src && this.audio.src.endsWith(url)
          if (isCurrent) {
            this.togglePlay()
          } else {
            this.play(url, title)
          }
        }
        return
      }

      // 4. Chapter or Transcript Seek
      const seekBtn = target.closest('.chapter-seek, .transcript-seek')
      if (seekBtn) {
        const time = parseFloat(seekBtn.getAttribute('data-time') || '')
        if (isNaN(time)) return

        // Find the closest episode context if available
        const contextBtn = document.getElementById('episode-play-btn')
        const audioUrl = contextBtn?.getAttribute('data-audio-url')

        if (audioUrl && (!this.audio?.src || !this.audio.src.endsWith(audioUrl))) {
          const title = contextBtn?.getAttribute('data-episode-title') || ''
          this.play(audioUrl, title)
        }

        if (this.audio) {
          this.audio.currentTime = time
          if (this.audio.paused) this.audio.play().catch(() => {})
        }
      }
    })

    // Global Scrubbing
    document.addEventListener('pointerdown', (e) => {
      const track = this.elements.progressTrack
      if (!track || !(e.target as HTMLElement).closest('#progress-track')) return
      this.isDragging = true
      track.setPointerCapture(e.pointerId)
      this.handleScrub(e as PointerEvent)
    })
    document.addEventListener('pointermove', (e) => {
      if (this.isDragging) this.handleScrub(e as PointerEvent)
    })
    document.addEventListener('pointerup', () => {
      this.isDragging = false
    })

    // Shortcuts
    window.addEventListener('keydown', (e) => this.handleShortcuts(e))
  }

  // --- Core Actions ---

  public play(src?: string, title?: string) {
    if (!this.audio) return
    const isNewSrc = src && !this.audio.src.endsWith(src)
    if (isNewSrc) {
      this.audio.pause()
      this.audio.src = src!
      this.audio.currentTime = 0
      if (this.elements.playerTitle) this.elements.playerTitle.textContent = title || '未知剧集'
    }
    this.audio.play().catch(() => {
      console.warn('Playback blocked')
    })
    this.show()
    this.sync()
  }

  public togglePlay() {
    if (!this.audio || !this.audio.src) return
    if (this.audio.paused) this.audio.play().catch(() => {})
    else this.audio.pause()
    this.sync()
  }

  public show() {
    if (!this.bar) return
    this.bar.classList.remove('translate-y-full')
    this.bar.classList.add('translate-y-0')
  }

  public close() {
    this.audio?.pause()
    this.bar?.classList.add('translate-y-full')
    sessionStorage.removeItem('audioPlayerState')
    this.sync()
  }

  // --- UI Helpers ---

  private updateLoadingState(isLoading: boolean) {
    const { iconPlay, iconPause, iconLoading } = this.elements
    if (isLoading) {
      iconPlay?.classList.add('hidden')
      iconPause?.classList.add('hidden')
      iconLoading?.classList.remove('hidden')
    } else {
      this.onPlaybackChange()
    }
  }

  private onPlaybackChange() {
    const { iconPlay, iconPause, iconLoading } = this.elements
    const isPaused = this.audio?.paused
    iconLoading?.classList.add('hidden')
    if (isPaused) {
      iconPlay?.classList.remove('hidden')
      iconPause?.classList.add('hidden')
    } else {
      iconPlay?.classList.add('hidden')
      iconPause?.classList.remove('hidden')
    }
  }

  private syncProgress() {
    if (!this.audio || this.audio.duration === 0) return
    const pct = (this.audio.currentTime / this.audio.duration) * 100
    const { progressFill, progressThumb, currentTime, progressTrack } = this.elements
    if (progressFill) progressFill.style.width = `${pct}%`
    if (progressThumb) progressThumb.style.left = `${pct}%`
    if (currentTime) currentTime.textContent = this.formatTime(this.audio.currentTime)
    if (progressTrack) progressTrack.setAttribute('aria-valuenow', Math.round(pct).toString())
  }

  private handleScrub(e: PointerEvent) {
    const track = this.elements.progressTrack
    if (!track || !this.audio?.duration) return
    const rect = track.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    this.updateProgressUI(pct * this.audio.duration, this.audio.duration)
    if (this.isDragging) this.audio.currentTime = pct * this.audio.duration
  }

  private updateProgressUI(time: number, duration: number) {
    const { progressFill, progressThumb, currentTime } = this.elements
    const pct = (time / duration) * 100
    if (progressFill) progressFill.style.width = `${pct}%`
    if (progressThumb) progressThumb.style.left = `${pct}%`
    if (currentTime) currentTime.textContent = this.formatTime(time)
  }

  private handleShortcuts(e: KeyboardEvent) {
    if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return
    if (this.bar?.classList.contains('translate-y-full')) return
    switch (e.key) {
      case ' ':
        e.preventDefault()
        this.togglePlay()
        break
      case 'ArrowLeft':
        this.seek(-10)
        break
      case 'ArrowRight':
        this.seek(10)
        break
    }
  }

  private seek(delta: number) {
    if (!this.audio) return
    this.audio.currentTime = Math.max(
      0,
      Math.min(this.audio.duration, this.audio.currentTime + delta)
    )
  }

  // --- Persistence ---

  private persistStateThrottled() {
    if (this.saveTimeout || !this.audio) return
    this.saveTimeout = setTimeout(() => {
      const state = {
        src: this.audio!.src,
        title: this.elements.playerTitle?.textContent || '',
        currentTime: this.audio!.currentTime,
        isPlaying: !this.audio!.paused,
        isVisible: !this.bar?.classList.contains('translate-y-full'),
      }
      sessionStorage.setItem('audioPlayerState', JSON.stringify(state))
      this.saveTimeout = null
    }, 1000)
  }

  private restoreState() {
    const saved = sessionStorage.getItem('audioPlayerState')
    if (!saved || !this.audio) return
    try {
      const state = this.parseAudioPlayerState(saved)
      if (state.src) {
        this.audio.src = state.src
        if (this.elements.playerTitle) this.elements.playerTitle.textContent = state.title
        if (state.currentTime) this.audio.currentTime = state.currentTime
        if (state.isVisible) this.show()
        if (state.isPlaying) this.audio.play().catch(() => {})
      }
    } catch {
      sessionStorage.removeItem('audioPlayerState')
    }
  }

  // --- Synchronization ---

  public sync() {
    const btns = document.querySelectorAll('[data-audio-url]')
    btns.forEach((btn) => {
      const url = btn.getAttribute('data-audio-url')
      // A button is ONLY "active" if it matches the current audio SRC
      const isCurrent = this.audio?.src && this.audio.src.endsWith(url || '')
      // It is ONLY "playing" if it's active AND the audio isn't paused
      const isPlaying = isCurrent && !this.audio?.paused

      const playIcon = btn.querySelector('#episode-play-icon, .episode-play-icon')
      const pauseIcon = btn.querySelector('#episode-pause-icon, .episode-pause-icon')
      const text = btn.querySelector('#episode-play-text, .episode-play-text')

      if (playIcon) playIcon.classList.toggle('hidden', !!isPlaying)
      if (pauseIcon) pauseIcon.classList.toggle('hidden', !isPlaying)
      if (text) text.textContent = isPlaying ? '暂停' : '播放'
      btn.classList.toggle('is-current-episode', !!isCurrent)
    })

    // Also sync the bar buttons
    this.onPlaybackChange()
  }

  private initGlobalAPI() {
    window.playEpisode = (src: string, title: string) => this.play(src, title)
  }

  private parseAudioPlayerState(raw: string): AudioPlayerState {
    const parsed: unknown = JSON.parse(raw)
    if (!this.isAudioPlayerState(parsed)) {
      throw new Error('Invalid audio player state')
    }
    return parsed
  }

  private isAudioPlayerState(value: unknown): value is AudioPlayerState {
    if (typeof value !== 'object' || value === null) return false
    const state = value as Partial<AudioPlayerState>
    return (
      typeof state.src === 'string' &&
      typeof state.title === 'string' &&
      typeof state.currentTime === 'number' &&
      typeof state.isPlaying === 'boolean' &&
      typeof state.isVisible === 'boolean'
    )
  }

  private formatTime(s: number): string {
    if (isNaN(s)) return '0:00'
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec < 10 ? '0' : ''}${sec}`
  }
}

export function setupAudioPlayer() {
  new AudioPlayerController()
}
