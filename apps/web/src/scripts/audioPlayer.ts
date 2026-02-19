// Audio player logic
export function setupAudioPlayer() {
  const audio = document.getElementById('podcast-audio') as HTMLAudioElement | null
  const bar = document.getElementById('player-bar')
  const playBtn = document.getElementById('play-btn')
  const ipPlay = document.getElementById('icon-play')
  const ipPause = document.getElementById('icon-pause')
  const progressTrack = document.getElementById('progress-track')
  const progressFill = document.getElementById('progress-fill')
  const progressThumb = document.getElementById('progress-thumb')
  const currentTimeEl = document.getElementById('current-time')
  const totalTimeEl = document.getElementById('total-time')
  const titleEl = document.getElementById('player-title')
  const closeBtn = document.getElementById('close-player')

  if (!audio || !bar) return

  // Restore player state from sessionStorage
  const savedState = sessionStorage.getItem('audioPlayerState')
  if (savedState) {
    try {
      const state = JSON.parse(savedState)
      if (state.src) {
        audio.src = state.src
        if (titleEl) titleEl.textContent = state.title || ''
        if (state.currentTime) audio.currentTime = state.currentTime
        if (state.isPlaying) {
          audio.play().catch(() => {
            // Auto-play might be blocked, that's okay
          })
        }
        if (state.isVisible) {
          bar.classList.remove('translate-y-full')
          bar.classList.add('translate-y-0')
        }
      }
    } catch (e) {
      console.error('Failed to restore audio player state:', e)
    }
  }

  // Save player state to sessionStorage
  function savePlayerState() {
    if (!audio) return
    const state = {
      src: audio.src,
      title: titleEl?.textContent || '',
      currentTime: audio.currentTime,
      isPlaying: !audio.paused,
      isVisible: !bar?.classList.contains('translate-y-full'),
    }
    sessionStorage.setItem('audioPlayerState', JSON.stringify(state))
  }

  // Save state periodically and on important events
  audio.addEventListener('timeupdate', savePlayerState)
  audio.addEventListener('play', savePlayerState)
  audio.addEventListener('pause', savePlayerState)

  function fmt(s: number): string {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return m + ':' + (sec < 10 ? '0' : '') + sec
  }

  function showPlayer() {
    bar?.classList.remove('translate-y-full')
    bar?.classList.add('translate-y-0')
    savePlayerState()
  }

  // Global function for playing episodes
  ;(window as any).playEpisode = function (src: string, title: string) {
    if (!audio) return
    audio.src = src
    if (titleEl) titleEl.textContent = title
    audio.play()
    showPlayer()
  }

  // Play/pause button
  playBtn?.addEventListener('click', () => {
    if (!audio) return
    if (audio.paused) audio.play()
    else audio.pause()
  })

  // Episode page play button
  const episodePlayBtn = document.getElementById('episode-play-btn')
  if (episodePlayBtn && audio) {
    const episodePlayIcon = document.getElementById('episode-play-icon')
    const episodePauseIcon = document.getElementById('episode-pause-icon')
    const episodePlayText = document.getElementById('episode-play-text')

    function updateEpisodeButton() {
      if (!audio || !episodePlayBtn) return
      const audioUrl = episodePlayBtn.getAttribute('data-audio-url')
      const isCurrentEpisode = audio.src.endsWith(audioUrl || '')
      const isPlaying = !audio.paused && isCurrentEpisode

      if (isPlaying) {
        episodePlayIcon?.classList.add('hidden')
        episodePauseIcon?.classList.remove('hidden')
        if (episodePlayText) episodePlayText.textContent = '暂停'
      } else {
        episodePlayIcon?.classList.remove('hidden')
        episodePauseIcon?.classList.add('hidden')
        if (episodePlayText) episodePlayText.textContent = '播放'
      }
    }

    episodePlayBtn.addEventListener('click', () => {
      if (!audio) return
      const audioUrl = episodePlayBtn.getAttribute('data-audio-url')
      const episodeTitle = episodePlayBtn.getAttribute('data-episode-title')
      const isCurrentEpisode = audio.src.endsWith(audioUrl || '')

      if (isCurrentEpisode && !audio.paused) {
        audio.pause()
      } else if (isCurrentEpisode && audio.paused) {
        audio.play()
      } else if (audioUrl && episodeTitle) {
        ;(window as any).playEpisode(audioUrl, episodeTitle)
      }
      updateEpisodeButton()
    })

    audio.addEventListener('play', updateEpisodeButton)
    audio.addEventListener('pause', updateEpisodeButton)
    updateEpisodeButton()
  }

  // Audio event listeners
  audio.addEventListener('play', () => {
    ipPlay?.classList.add('hidden')
    ipPause?.classList.remove('hidden')
    showPlayer()
  })

  audio.addEventListener('pause', () => {
    ipPlay?.classList.remove('hidden')
    ipPause?.classList.add('hidden')
  })

  audio.addEventListener('timeupdate', () => {
    if (!audio.duration) return
    const pct = (audio.currentTime / audio.duration) * 100
    if (progressFill) progressFill.style.width = pct + '%'
    if (progressThumb) progressThumb.style.left = pct + '%'
    if (currentTimeEl) currentTimeEl.textContent = fmt(audio.currentTime)
  })

  audio.addEventListener('loadedmetadata', () => {
    if (totalTimeEl) totalTimeEl.textContent = fmt(audio.duration)
  })

  // Progress bar click
  progressTrack?.addEventListener('click', (e) => {
    if (!audio || !progressTrack) return
    const rect = progressTrack.getBoundingClientRect()
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration
  })

  // Close button
  closeBtn?.addEventListener('click', () => {
    if (!audio || !bar) return
    audio.pause()
    audio.currentTime = 0
    bar.classList.remove('translate-y-0')
    bar.classList.add('translate-y-full')
    sessionStorage.removeItem('audioPlayerState')
  })
}
