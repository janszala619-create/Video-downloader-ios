import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { apiBase, saveApiBase, fetchVideoInfo, checkServer } from './api'

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn() },
  CapacitorHttp: { request: vi.fn() },
}))
beforeEach(() => { localStorage.clear(); vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false) })
afterEach(() => vi.unstubAllGlobals())

it('normalizes and persists the user server address', () => {
  saveApiBase(' http://100.80.105.62:8765/ ')
  expect(apiBase()).toBe('http://100.80.105.62:8765')
})

it.each(['file:///etc/passwd', 'https://user:password@example.test', 'https://example.test/?token=x'])(
  'rejects invalid server address %s', address => {
    expect(() => saveApiBase(address)).toThrow()
    expect(localStorage.getItem('vidsave_api_base')).toBeNull()
  },
)

it('uses native HTTP for the Tailscale server', async () => {
  vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
  saveApiBase('http://100.80.105.62:8765')
  const info = { title: 'Video', formats: [] }
  vi.mocked(CapacitorHttp.request).mockResolvedValue({ status: 200, data: info, headers: {}, url: '' })
  expect(await fetchVideoInfo('https://example.test/video')).toEqual(info)
  expect(CapacitorHttp.request).toHaveBeenCalledWith(expect.objectContaining({
    url: 'http://100.80.105.62:8765/api/info', method: 'POST', data: { url: 'https://example.test/video' },
  }))
})

it('shows native backend errors as readable text', async () => {
  vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
  saveApiBase('http://100.80.105.62:8765')
  vi.mocked(CapacitorHttp.request).mockResolvedValue({ status: 403, data: { error: { message: 'Login required' } }, headers: {}, url: '' })
  await expect(fetchVideoInfo('https://example.test')).rejects.toThrow('Login required')
})

it('verifies server identity instead of accepting any HTTP success', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')))
  await expect(checkServer()).rejects.toThrow('not a VidSave server')
})
