import type { VideoInfo } from '../types'
import { Capacitor, CapacitorHttp } from '@capacitor/core'

// In the native iOS app VITE_API_BASE_URL must point to the deployed backend.
// In web/dev mode it stays empty and the Vite proxy handles /api/*.
const API_BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '').trim().replace(/\/+$/, '')

export function apiBase(): string {
  const base = localStorage.getItem('vidsave_api_base') ?? API_BASE
  if (Capacitor.isNativePlatform() && !base) {
    throw new Error('No download server configured. Enter its address in Server settings.')
  }
  return base
}

export function saveApiBase(value: string): void {
  const url = new URL(value.trim())
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Enter an HTTP or HTTPS server address without credentials or query parameters.')
  }
  localStorage.setItem('vidsave_api_base', url.toString().replace(/\/+$/, ''))
}

export async function responseError(res: Response): Promise<Error> {
  const body = await res.json().catch(() => null)
  const message = body?.error?.message ?? body?.detail
  return new Error(typeof message === 'string' ? message : `Server error (HTTP ${res.status})`)
}

async function requestJson(path: string, data?: object) {
  const url = `${apiBase()}${path}`
  try {
    if (Capacitor.isNativePlatform()) {
      const response = await CapacitorHttp.request({
        url, method: data ? 'POST' : 'GET', data,
        headers: { 'Content-Type': 'application/json' },
        connectTimeout: 15_000, readTimeout: 120_000,
      })
      if (response.status < 200 || response.status >= 300) {
        const message = response.data?.error?.message ?? response.data?.detail
        throw new Error(typeof message === 'string' ? message : `Server error (HTTP ${response.status})`)
      }
      return response.data
    }
    const response = await fetch(url, {
      method: data ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined,
    })
    if (!response.ok) throw await responseError(response)
    return await response.json()
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('Cannot reach the download server. Check its address and your Wi-Fi or Tailscale connection.')
    }
    throw error
  }
}

export async function checkServer(): Promise<void> {
  const health = await requestJson('/api/health')
  if (health?.status !== 'ok') throw new Error('This address is not a VidSave server.')
}

export async function fetchVideoInfo(url: string): Promise<VideoInfo> {
  return requestJson('/api/info', { url })
}

export function buildDownloadUrl(url: string, format_id: string): string {
  return `${apiBase()}/api/download?url=${encodeURIComponent(url)}&format_id=${encodeURIComponent(format_id)}`
}

export async function fetchStreamUrl(url: string, format_id: string): Promise<string> {
  const data = await requestJson('/api/stream', { url, format_id })
  return (data as { stream_url: string }).stream_url
}
