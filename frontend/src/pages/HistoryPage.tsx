import { useNavigate } from 'react-router-dom'
import { DownloadItem } from '../components/DownloadItem'
import { useState } from 'react'
import { LocalVideoActions } from '../components/LocalVideoActions'
import { playLocalVideo, supportsNativeMedia } from '../services/media'
import type { HistoryItem } from '../types'

interface HistoryPageProps {
  items: HistoryItem[]
  onDelete: (id: string) => void
  onClear: () => void
}

export function HistoryPage({ items, onDelete, onClear }: HistoryPageProps) {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  const handlePlay = async (item: HistoryItem) => {
    setError(null)
    if (item.localPath && supportsNativeMedia()) {
      try { await playLocalVideo(item.localPath) }
      catch (error) { setError(error instanceof Error ? error.message : 'Video konnte nicht geöffnet werden.') }
      return
    }
    navigate(
      `/player?url=${encodeURIComponent(item.originalUrl)}&format_id=${encodeURIComponent(item.format_id)}&title=${encodeURIComponent(item.title)}${item.localPath ? `&local=${encodeURIComponent(item.localPath)}` : ''}`,
    )
  }

  return (
    <div className="app-screen bg-bg">
      <div className="page-content">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-white">Downloads</h1>
          {items.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm('Clear all download history?')) {
                  onClear()
                }
              }}
              className="text-xs text-secondary hover:text-red-400 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>

        {error && <p role="alert" className="text-sm text-red-400 mb-4">{error}</p>}
        {items.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <div className="w-16 h-16 rounded-2xl bg-card border border-white/[0.08] flex items-center justify-center">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#6B7280"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2v10M8 8l4 4 4-4" />
                <path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4" />
              </svg>
            </div>
            <div>
              <p className="text-white font-medium mb-1">No downloads yet</p>
              <p className="text-sm text-secondary">Videos you download will appear here</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {items.map(item => (
              <div key={item.id} className="rounded-xl border border-white/[0.08] bg-card p-3">
                <DownloadItem item={item} onPlay={handlePlay} onDelete={onDelete} />
                {item.localPath && <LocalVideoActions path={item.localPath} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
