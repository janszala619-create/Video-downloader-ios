import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LocalVideoActions } from './LocalVideoActions'
import { playLocalVideo, saveToPhotos, supportsNativeMedia } from '../services/media'

vi.mock('../services/media', () => ({ playLocalVideo: vi.fn(), saveToPhotos: vi.fn(), supportsNativeMedia: vi.fn() }))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const container = document.createElement('div')
let root = createRoot(container)
beforeEach(() => vi.mocked(supportsNativeMedia).mockReturnValue(true))
afterEach(() => { act(() => root.unmount()); root = createRoot(container) })

it('saves the local file to Photos only when requested and confirms completion', async () => {
  let finish!: () => void
  vi.mocked(saveToPhotos).mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  act(() => root.render(<LocalVideoActions path="VidSave/Video #1.mp4" />))
  expect(saveToPhotos).not.toHaveBeenCalled()
  const button = container.querySelectorAll('button')[1]
  await act(async () => button.click())
  expect(button.disabled).toBe(true)
  expect(container.textContent).not.toContain('In der Fotomediathek gespeichert.')
  await act(async () => finish())
  expect(saveToPhotos).toHaveBeenCalledWith('VidSave/Video #1.mp4')
  expect(container.textContent).toContain('In der Fotomediathek gespeichert.')
})

it('shows denied Photos permission and permits retry', async () => {
  vi.mocked(saveToPhotos).mockRejectedValueOnce(new Error('Photos permission denied'))
  act(() => root.render(<LocalVideoActions path="VidSave/test.mp4" />))
  await act(async () => container.querySelectorAll('button')[1].click())
  expect(container.textContent).toContain('Photos permission denied')
  expect(container.querySelectorAll('button')[1].disabled).toBe(false)
})

it('opens the native player with the original relative path', async () => {
  act(() => root.render(<LocalVideoActions path="VidSave/Test # 100% ü.mp4" />))
  await act(async () => container.querySelectorAll('button')[0].click())
  expect(playLocalVideo).toHaveBeenCalledWith('VidSave/Test # 100% ü.mp4')
})

it('does not offer unsupported native actions in the browser', () => {
  vi.mocked(supportsNativeMedia).mockReturnValue(false)
  act(() => root.render(<LocalVideoActions path="VidSave/test.mp4" />))
  expect(container.textContent).toBe('')
})
