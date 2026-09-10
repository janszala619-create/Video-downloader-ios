export interface Format {
  format_id: string
  quality: string
  ext: string
  filesize: number | null
}

export interface VideoInfo {
  title: string
  thumbnail: string
  duration: number
  formats: Format[]
}

export interface HistoryItem {
  id: string
  title: string
  thumbnail: string
  quality: string
  format: string
  format_id: string
  fileSize: number
  downloadDate: string
  originalUrl: string
  localPath?: string
}

export type DownloadStatus = 'idle' | 'fetching-info' | 'downloading' | 'done' | 'error'
