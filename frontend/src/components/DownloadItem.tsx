import type { HistoryItem } from '../types'

interface DownloadItemProps {
  item: HistoryItem
  onPlay: (item: HistoryItem) => void
  onDelete: (id: string) => void
}

function formatBytes(bytes: number): string {
  if (!bytes) return '—'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso))
}

export function DownloadItem({ item, onPlay, onDelete }: DownloadItemProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-card rounded-xl border border-white/[0.08] fade-in">
      {/* Thumbnail */}
      <button
        onClick={() => onPlay(item)}
        aria-label={`Play ${item.title}`}
        className="shrink-0 relative w-20 h-14 rounded-lg overflow-hidden bg-white/[0.05] group"
      >
        {item.thumbnail ? (
          <img
            src={item.thumbnail}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="text-secondary"
            >
              <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" />
            </svg>
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        </div>
      </button>

      {/* Info */}
      <button onClick={() => onPlay(item)} className="flex-1 min-w-0 text-left">
        <p className="text-sm font-medium text-white leading-tight line-clamp-2 mb-1">
          {item.title}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-accent/20 text-accent">
            {item.quality}
          </span>
          <span className="text-[11px] text-secondary">{formatBytes(item.fileSize)}</span>
          <span className="text-[11px] text-secondary">{formatDate(item.downloadDate)}</span>
        </div>
      </button>

      {/* Delete */}
      <button
        onClick={e => {
          e.stopPropagation()
          onDelete(item.id)
        }}
        className="shrink-0 p-2 rounded-lg text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors"
        aria-label="Delete"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14H6L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4h6v2" />
        </svg>
      </button>
    </div>
  )
}
