import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { VideoPlayer } from './VideoPlayer'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const container = document.createElement('div')
let root = createRoot(container)
afterEach(() => { act(() => root.unmount()); root = createRoot(container) })

it('shows a playback error instead of leaving a rejected play promise', async () => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue(new Error('Unsupported codec'))
  act(() => root.render(<VideoPlayer src="video.mp4" />))
  await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Play"]')!.click() })
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Cannot play this video')
})

it('exposes accessible playback controls above the play overlay', () => {
  act(() => root.render(<VideoPlayer src="video.mp4" onClose={() => {}} />))
  const speed = container.querySelector('[aria-label="Playback speed"]')
  const position = container.querySelector('[aria-label="Playback position"]')
  expect(speed?.parentElement?.className).toContain('z-10')
  expect(position?.parentElement?.parentElement?.className).toContain('z-10')
  act(() => container.querySelector<HTMLButtonElement>('[aria-label="Mute"]')!.click())
  expect(container.querySelector('video')?.muted).toBe(true)
  act(() => container.querySelector<HTMLButtonElement>('[aria-label="Unmute"]')!.click())
  expect(container.querySelector('video')?.muted).toBe(false)
})
