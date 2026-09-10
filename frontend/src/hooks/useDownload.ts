import { useState, useCallback, useRef } from 'react'
import { saveVideo } from '../services/download'
import type { Format, VideoInfo, HistoryItem } from '../types'

type DownloadState = 'idle' | 'downloading' | 'done' | 'error'

export function useDownload(onComplete: (item: HistoryItem) => void) {
  const [state, setState] = useState<DownloadState>('idle')
  const [error, setError] = useState<string | null>(null)
  const active = useRef(false)

  const download = useCallback(
    async (info: VideoInfo, format: Format, originalUrl: string) => {
      if (active.current) return
      active.current = true
      setState('downloading')
      setError(null)
      try {
        const id = crypto.randomUUID()
        const title = info.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 100) || 'video'
        const saved = await saveVideo(originalUrl, format.format_id, `${title}-${id}.${format.ext}`)

        const historyItem: HistoryItem = {
          id,
          title: info.title,
          thumbnail: info.thumbnail,
          quality: format.quality,
          format: format.ext,
          format_id: format.format_id,
          ...saved,
          downloadDate: new Date().toISOString(),
          originalUrl,
        }
        onComplete(historyItem)
        setState('done')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Download failed')
        setState('error')
      } finally {
        active.current = false
      }
    },
    [onComplete],
  )

  const reset = useCallback(() => {
    if (active.current) return
    setState('idle')
    setError(null)
  }, [])

  return { state, error, download, reset }
}
