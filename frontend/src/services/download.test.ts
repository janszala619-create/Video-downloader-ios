import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { Capacitor } from '@capacitor/core'
import { Filesystem } from '@capacitor/filesystem'
import { saveVideo, localVideoUrl } from './download'

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: vi.fn(), convertFileSrc: vi.fn(uri => `local:${uri}`) } }))
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Documents: 'DOCUMENTS' },
  Filesystem: { downloadFile: vi.fn(), stat: vi.fn(), deleteFile: vi.fn(), getUri: vi.fn() },
}))

beforeEach(() => {
  localStorage.clear()
  vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)
  vi.stubGlobal('fetch', vi.fn())
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(() => 'blob:video')
    static revokeObjectURL = vi.fn()
  })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  vi.useFakeTimers()
})
afterEach(() => { vi.runOnlyPendingTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })

it('surfaces backend errors instead of starting a fake download', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ detail: 'Video unavailable' }), { status: 422 }))
  await expect(saveVideo('https://example.test/video', '137+audio', 'video.mp4')).rejects.toThrow('Video unavailable')
  expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
})

it('waits for received bytes and releases the blob after browser handoff', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response('video', { headers: { 'Content-Type': 'video/mp4' } }))
  const result = await saveVideo('https://example.test/video?a=1&b=2', '137+audio', 'video.mp4')
  expect(result.fileSize).toBe(5)
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('format_id=137%2Baudio'))
  expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce()
  expect(document.querySelector('a')).toBeNull()
  expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  vi.runOnlyPendingTimers()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:video')
})

it('rejects HTML fallback pages returned with HTTP 200', async () => {
  vi.mocked(fetch).mockResolvedValue(new Response('<html>app</html>', { headers: { 'Content-Type': 'text/html' } }))
  await expect(saveVideo('https://example.test', 'mp4', 'video.mp4')).rejects.toThrow('did not return a video')
})

it('saves native files in Documents and records the real size and relative path', async () => {
  vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
  localStorage.setItem('vidsave_api_base', 'http://100.80.105.62:8765')
  vi.mocked(Filesystem.stat).mockResolvedValue({ size: 42 } as Awaited<ReturnType<typeof Filesystem.stat>>)
  expect(await saveVideo('https://example.test', 'mp4', 'video.mp4')).toEqual({ fileSize: 42, localPath: 'VidSave/video.mp4' })
  expect(Filesystem.downloadFile).toHaveBeenCalledWith(expect.objectContaining({ directory: 'DOCUMENTS', path: 'VidSave/video.mp4' }))
  expect(fetch).not.toHaveBeenCalled()
})

it('cleans up after native failures without reporting success', async () => {
  vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
  localStorage.setItem('vidsave_api_base', 'http://100.80.105.62:8765')
  vi.mocked(Filesystem.downloadFile).mockRejectedValueOnce(new Error('Disk full'))
  vi.mocked(Filesystem.deleteFile).mockResolvedValue()
  await expect(saveVideo('https://example.test', 'mp4', 'video.mp4')).rejects.toThrow('Disk full')
  expect(Filesystem.deleteFile).toHaveBeenCalledWith({ path: 'VidSave/video.mp4', directory: 'DOCUMENTS' })
})

it('resolves native playback from a persistent relative path', async () => {
  vi.mocked(Filesystem.getUri).mockResolvedValue({ uri: 'file:///Documents/VidSave/video.mp4' })
  expect(await localVideoUrl('VidSave/video.mp4')).toBe('local:file:///Documents/VidSave/video.mp4')
})
