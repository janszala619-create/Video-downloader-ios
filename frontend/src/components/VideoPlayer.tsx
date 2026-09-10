import { useRef, useState, useEffect, useCallback } from 'react'

interface VideoPlayerProps {
  src: string
  title?: string
  onClose?: () => void
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2]

export function VideoPlayer({ src, title, onClose }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [showControls, setShowControls] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [playbackError, setPlaybackError] = useState<string | null>(null)

  const resetHideTimer = useCallback(() => {
    setShowControls(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setShowControls(false)
      }
    }, 3000)
  }, [])

  useEffect(() => {
    const vid = videoRef.current
    if (!vid) return

    const onTimeUpdate = () => setCurrentTime(vid.currentTime)
    const onLoaded = () => setDuration(vid.duration)
    const onPlay = () => setIsPlaying(true)
    const onPause = () => {
      setIsPlaying(false)
      setShowControls(true)
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
    const onEnded = () => {
      setIsPlaying(false)
      setShowControls(true)
    }
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    vid.addEventListener('timeupdate', onTimeUpdate)
    vid.addEventListener('loadedmetadata', onLoaded)
    vid.addEventListener('play', onPlay)
    vid.addEventListener('pause', onPause)
    vid.addEventListener('ended', onEnded)
    document.addEventListener('fullscreenchange', onFullscreenChange)

    return () => {
      vid.removeEventListener('timeupdate', onTimeUpdate)
      vid.removeEventListener('loadedmetadata', onLoaded)
      vid.removeEventListener('play', onPlay)
      vid.removeEventListener('pause', onPause)
      vid.removeEventListener('ended', onEnded)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }
  }, [])

  const togglePlay = async () => {
    const vid = videoRef.current
    if (!vid) return
    if (vid.paused) {
      try {
        await vid.play()
        setPlaybackError(null)
        resetHideTimer()
      } catch {
        setPlaybackError('Cannot play this video. The file may be unavailable or its format unsupported.')
      }
    } else {
      vid.pause()
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vid = videoRef.current
    if (!vid) return
    const t = Number(e.target.value)
    vid.currentTime = t
    setCurrentTime(t)
    resetHideTimer()
  }

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vid = videoRef.current
    if (!vid) return
    const v = Number(e.target.value)
    vid.volume = v
    vid.muted = v === 0
    setVolume(v)
    setIsMuted(v === 0)
    resetHideTimer()
  }

  const toggleMute = () => {
    const vid = videoRef.current
    if (!vid) return
    vid.muted = !vid.muted
    setIsMuted(vid.muted)
    resetHideTimer()
  }

  const handleSpeed = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const vid = videoRef.current
    if (!vid) return
    const s = Number(e.target.value)
    vid.playbackRate = s
    setSpeed(s)
    resetHideTimer()
  }

  const toggleFullscreen = () => {
    const el = containerRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      if (el.requestFullscreen) {
        el.requestFullscreen()
      } else {
        // iOS Safari fallback
        const vid = videoRef.current
        if (vid && 'webkitEnterFullscreen' in vid) {
          ;(vid as HTMLVideoElement & { webkitEnterFullscreen: () => void }).webkitEnterFullscreen()
        }
      }
    } else {
      document.exitFullscreen()
    }
    resetHideTimer()
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-black flex items-center justify-center"
      style={{ aspectRatio: '16/9' }}
      onClick={resetHideTimer}
      onMouseMove={resetHideTimer}
      onTouchStart={resetHideTimer}
    >
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-contain"
        playsInline
        onError={() => setPlaybackError('Cannot load this video. Check your connection or download it again.')}
        onClick={togglePlay}
      />

      {/* Controls overlay */}
      <div
        className={`absolute inset-0 flex flex-col justify-between transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        style={{
          background:
            'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.7) 100%)',
        }}
      >
        {/* Top bar */}
        <div className="relative z-10 flex items-center justify-between px-4 pt-4">
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close player"
              className="p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M19 12H5M12 5l-7 7 7 7" />
              </svg>
            </button>
          )}
          {title && (
            <p className="flex-1 mx-3 text-sm font-medium text-white line-clamp-1">{title}</p>
          )}
          <select
            aria-label="Playback speed"
            value={speed}
            onChange={handleSpeed}
            className="bg-black/40 text-white text-xs rounded px-2 py-1 border border-white/20 outline-none cursor-pointer"
          >
            {SPEEDS.map(s => (
              <option key={s} value={s}>
                {s}x
              </option>
            ))}
          </select>
        </div>

        {/* Center play/pause */}
        <button
          aria-label={isPlaying ? 'Pause' : 'Play'}
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center"
          style={{ pointerEvents: showControls ? 'auto' : 'none' }}
        >
          {!isPlaying && (
            <div className="w-16 h-16 rounded-full bg-black/50 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </div>
          )}
        </button>

        {/* Bottom controls */}
        <div className="relative z-10 px-4 pb-4 flex flex-col gap-2">
          {playbackError && <p role="alert" className="text-xs text-red-400">{playbackError}</p>}
          {/* Seek bar */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/80 tabular-nums w-10 shrink-0">
              {formatTime(currentTime)}
            </span>
            <input
              aria-label="Playback position"
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="flex-1"
              style={{
                background: `linear-gradient(to right, #6C63FF ${(currentTime / (duration || 1)) * 100}%, rgba(255,255,255,0.2) 0%)`,
              }}
            />
            <span className="text-xs text-white/80 tabular-nums w-10 shrink-0 text-right">
              {formatTime(duration)}
            </span>
          </div>

          {/* Volume + fullscreen */}
          <div className="flex items-center gap-3">
            <button aria-label={isMuted ? 'Unmute' : 'Mute'} onClick={toggleMute} className="text-white/80 hover:text-white shrink-0">
              {isMuted || volume === 0 ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
              )}
            </button>
            <input
              aria-label="Volume"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={handleVolume}
              className="w-20"
            />
            <div className="flex-1" />
            <button aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={toggleFullscreen} className="text-white/80 hover:text-white shrink-0">
              {isFullscreen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
