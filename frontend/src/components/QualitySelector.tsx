import { useEffect, useRef } from 'react'
import type { Format, VideoInfo } from '../types'

interface QualitySelectorProps {
  info: VideoInfo | null
  onSelect: (format: Format) => void
  onClose: () => void
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return 'Unknown size'
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function QualitySelector({ info, onSelect, onClose }: QualitySelectorProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!info) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [info, onClose])

  if (!info) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Select video quality"
        className="quality-sheet relative w-full max-w-lg mx-auto bg-card rounded-t-2xl border-t border-x border-white/[0.08] slide-up flex flex-col"
      >
        {/* Handle */}
        <div className="flex items-center justify-between px-4 pt-2 pb-2 shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/20" />
          <button onClick={onClose} aria-label="Close quality selection" className="min-h-11 px-3 text-sm text-secondary">Close</button>
        </div>

        {/* Video info header */}
        <div className="flex gap-3 px-4 pb-4 border-b border-white/[0.08] shrink-0">
          {info.thumbnail && (
            <img
              src={info.thumbnail}
              alt=""
              className="w-20 h-14 rounded-lg object-cover shrink-0 bg-white/[0.05]"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white leading-tight line-clamp-2">
              {info.title}
            </p>
            {info.duration > 0 && (
              <p className="text-xs text-secondary mt-1">{formatDuration(info.duration)}</p>
            )}
          </div>
        </div>

        {/* Format list */}
        <div className="overflow-y-auto flex-1">
          <p className="px-4 pt-4 pb-2 text-xs font-medium text-secondary uppercase tracking-wider">
            Select Quality
          </p>
          {info.formats.map((fmt, i) => (
            <button
              key={fmt.format_id}
              onClick={() => {
                onSelect(fmt)
                onClose()
              }}
              className="w-full flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-white/[0.04] active:bg-white/[0.07]"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-accent/20 text-accent text-xs font-semibold min-w-[52px] justify-center">
                  {fmt.quality}
                </span>
                <span className="text-xs text-secondary uppercase">{fmt.ext}</span>
              </div>
              <span className="text-xs text-secondary">{formatBytes(fmt.filesize)}</span>
            </button>
          ))}
          <div className="h-6" />
        </div>
      </div>
    </div>
  )
}
