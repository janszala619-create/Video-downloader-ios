import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { buildDownloadUrl, responseError } from './api'

export async function saveVideo(originalUrl: string, formatId: string, filename: string) {
  const url = buildDownloadUrl(originalUrl, formatId)
  if (Capacitor.isNativePlatform()) {
    const path = `VidSave/${filename}`
    try {
      await Filesystem.downloadFile({
        url, path, directory: Directory.Documents, recursive: true,
        connectTimeout: 30_000, readTimeout: 600_000,
      })
      const file = await Filesystem.stat({ path, directory: Directory.Documents })
      if (!file.size) throw new Error('The server returned an empty video.')
      return { fileSize: file.size, localPath: path }
    } catch (error) {
      await Filesystem.deleteFile({ path, directory: Directory.Documents }).catch(() => {})
      throw error
    }
  }

  const res = await fetch(url)
  if (!res.ok) throw await responseError(res)
  const blob = await res.blob()
  if (!blob.size || !/^(video\/|application\/octet-stream)/i.test(blob.type)) {
    throw new Error('The server did not return a video file.')
  }
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  try {
    document.body.appendChild(anchor)
    anchor.click()
  } finally {
    anchor.remove()
    // Give Safari time to consume the URL before releasing the video data.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  }
  return { fileSize: blob.size }
}

export async function localVideoUrl(path: string): Promise<string> {
  await Filesystem.stat({ path, directory: Directory.Documents })
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Documents })
  return Capacitor.convertFileSrc(uri)
}
