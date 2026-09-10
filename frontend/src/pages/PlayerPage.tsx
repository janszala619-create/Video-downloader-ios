import { useEffect, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { VideoPlayer } from '../components/VideoPlayer'
import { fetchStreamUrl } from '../services/api'
import { localVideoUrl } from '../services/download'

export function PlayerPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const originalUrl = searchParams.get('url') ?? ''
  const format_id = searchParams.get('format_id') ?? ''
  const title = searchParams.get('title') ?? ''
  const localPath = searchParams.get('local') ?? ''

  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    setStreamUrl(null)
    if (!originalUrl || !format_id) {
      setError('Missing video parameters')
      setLoading(false)
      return
    }

    let cancelled = false

    const videoUrl = localPath ? localVideoUrl(localPath) : fetchStreamUrl(originalUrl, format_id)
    videoUrl
      .then(url => {
        if (!cancelled) {
          setStreamUrl(url)
          setLoading(false)
        }
      })
      .catch(e => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load video')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [originalUrl, format_id, localPath])

  const handleClose = () => navigate(-1)

  return (
    <div className="flex flex-col min-h-screen bg-black">
      {/* Back button */}
      <div className="flex items-center gap-3 px-4 pt-safe pt-4 pb-2 bg-black">
        <button
          onClick={handleClose}
          aria-label="Back"
          className="p-2 rounded-full bg-white/[0.08] text-white hover:bg-white/[0.12] transition-colors"
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
        <p className="flex-1 text-sm font-medium text-white line-clamp-1">{title}</p>
      </div>

      {loading && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <svg
            className="animate-spin text-accent"
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          <p className="text-sm text-secondary">Loading video…</p>
        </div>
      )}

      {error && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#6B7280"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <div>
            <p className="text-white font-medium mb-1">Could not load video</p>
            <p className="text-sm text-secondary mb-4">{error}</p>
            <button
              onClick={handleClose}
              className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-medium"
            >
              Go back
            </button>
          </div>
        </div>
      )}

      {streamUrl && (
        <div className="flex-1 flex flex-col justify-center">
          <VideoPlayer src={streamUrl} title={title} onClose={handleClose} />
        </div>
      )}
    </div>
  )
}
