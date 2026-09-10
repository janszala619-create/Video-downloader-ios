import { useState, useCallback } from 'react'
import { Capacitor } from '@capacitor/core'
import { URLInput } from '../components/URLInput'
import { ServerSettings } from '../components/ServerSettings'
import { QualitySelector } from '../components/QualitySelector'
import { ProgressBar } from '../components/ProgressBar'
import { useVideoInfo } from '../hooks/useVideoInfo'
import { useDownload } from '../hooks/useDownload'
import type { Format, HistoryItem } from '../types'

interface HomePageProps {
  onDownloadComplete: (item: HistoryItem) => void
}

export function HomePage({ onDownloadComplete }: HomePageProps) {
  const [url, setUrl] = useState('')
  const [showSelector, setShowSelector] = useState(false)
  const { info, status, error, analyze, reset } = useVideoInfo()
  const { state: dlState, error: dlError, download, reset: resetDl } = useDownload(onDownloadComplete)

  const handleAnalyze = useCallback(
    async (u: string) => {
      setUrl(u)
      resetDl()
      await analyze(u)
      setShowSelector(true)
    },
    [analyze, resetDl],
  )

  const handleSelect = useCallback(
    async (format: Format) => {
      if (!info) return
      setShowSelector(false)
      await download(info, format, url)
    },
    [info, url, download],
  )

  const handleClose = useCallback(() => {
    setShowSelector(false)
    reset()
  }, [reset])

  return (
    <div className="flex flex-col min-h-screen bg-bg">
      <ProgressBar
        isVisible={status === 'fetching-info' || dlState === 'downloading'}
        label={
          status === 'fetching-info'
            ? 'Analyzing link…'
            : dlState === 'downloading'
              ? 'Downloading video…'
              : undefined
        }
      />

      <div className="flex-1 px-4 pt-14 pb-28">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#6C63FF"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2v10M8 8l4 4 4-4" />
                <path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">VidSave</h1>
          </div>
          <p className="text-sm text-secondary ml-10">Download videos from any platform</p>
        </div>

        {/* URL Input card */}
        <div className="bg-card rounded-2xl border border-white/[0.08] p-4 mb-6">
          <p className="text-xs font-medium text-secondary mb-3 uppercase tracking-wider">
            Video URL
          </p>
          <URLInput
            onAnalyze={handleAnalyze}
            isLoading={status === 'fetching-info' || dlState === 'downloading'}
            error={error}
          />
        </div>

        <ServerSettings disabled={status === 'fetching-info' || dlState === 'downloading'} />

        {/* Success state */}
        {dlState === 'done' && (
          <div className="fade-in bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 flex items-center gap-3">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#22c55e"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <p className="text-sm text-green-400 font-medium">
              {Capacitor.isNativePlatform()
                ? 'Video saved — Files → On My iPhone → VidSave → VidSave'
                : 'Video received — check your browser downloads'}
            </p>
          </div>
        )}

        {/* Error state */}
        {dlState === 'error' && (
          <div className="fade-in bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex items-center gap-3">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ef4444"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <p role="alert" className="text-sm text-red-400">{dlError ?? 'Download failed. Please try again.'}</p>
          </div>
        )}

        {/* Tips */}
        <div className="mt-8">
          <p className="text-xs font-medium text-secondary uppercase tracking-wider mb-3">
            Supported platforms
          </p>
          <div className="flex flex-wrap gap-2">
            {['YouTube', 'Twitter/X', 'Vimeo', 'Reddit', 'TikTok', 'Instagram', '& more'].map(
              p => (
                <span
                  key={p}
                  className="text-xs px-3 py-1.5 rounded-full bg-card border border-white/[0.08] text-secondary"
                >
                  {p}
                </span>
              ),
            )}
          </div>
        </div>
      </div>

      {/* Quality Selector */}
      {showSelector && (
        <QualitySelector info={info} onSelect={handleSelect} onClose={handleClose} />
      )}
    </div>
  )
}
