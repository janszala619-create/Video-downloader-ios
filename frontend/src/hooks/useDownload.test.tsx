import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { useDownload } from './useDownload'
import { saveVideo } from '../services/download'
import type { Format, VideoInfo } from '../types'

vi.mock('../services/download', () => ({ saveVideo: vi.fn() }))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const container = document.createElement('div')
let root = createRoot(container)
afterEach(() => { act(() => root.unmount()); root = createRoot(container) })
const info: VideoInfo = { title: 'Video', thumbnail: '', duration: 1, formats: [] }
const format: Format = { format_id: 'mp4', quality: '720p', ext: 'mp4', filesize: null }

it('adds history only after completion and prevents concurrent downloads', async () => {
  let resolve!: (value: { fileSize: number }) => void
  vi.mocked(saveVideo).mockReturnValue(new Promise(done => { resolve = done }))
  const complete = vi.fn()
  let hook!: ReturnType<typeof useDownload>
  function Harness() { hook = useDownload(complete); return null }
  act(() => root.render(<Harness />))
  let pending!: Promise<void>
  act(() => { pending = hook.download(info, format, 'https://example.test') })
  expect(hook.state).toBe('downloading')
  expect(complete).not.toHaveBeenCalled()
  await act(async () => { await hook.download(info, format, 'https://example.test') })
  expect(saveVideo).toHaveBeenCalledOnce()
  await act(async () => { resolve({ fileSize: 123 }); await pending })
  expect(hook.state).toBe('done')
  expect(complete).toHaveBeenCalledWith(expect.objectContaining({ fileSize: 123 }))
})

it('does not add failed downloads to history', async () => {
  vi.mocked(saveVideo).mockRejectedValueOnce(new Error('Server unavailable'))
  const complete = vi.fn()
  let hook!: ReturnType<typeof useDownload>
  function Harness() { hook = useDownload(complete); return null }
  act(() => root.render(<Harness />))
  await act(async () => { await hook.download(info, format, 'https://example.test') })
  expect(hook.state).toBe('error')
  expect(hook.error).toBe('Server unavailable')
  expect(complete).not.toHaveBeenCalled()
})
