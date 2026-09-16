import { useRef, useState } from 'react'
import { playLocalVideo, saveToPhotos, supportsNativeMedia } from '../services/media'

export function LocalVideoActions({ path }: { path: string }) {
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const active = useRef(false)
  if (!supportsNativeMedia()) return null

  const run = async (action: 'play' | 'photos') => {
    if (active.current) return
    active.current = true
    setBusy(true)
    setMessage(null)
    try {
      if (action === 'photos') {
        await saveToPhotos(path)
        setSaved(true)
        setMessage('In der Fotomediathek gespeichert.')
      } else {
        await playLocalVideo(path)
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Das Video konnte nicht geöffnet oder gespeichert werden.')
    } finally {
      active.current = false
      setBusy(false)
    }
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => void run('play')}
          className="min-h-11 flex-1 rounded-xl bg-accent px-3 py-2.5 text-sm font-medium text-white disabled:opacity-50">
          Abspielen
        </button>
        <button disabled={busy || saved} onClick={() => void run('photos')}
          className="min-h-11 flex-1 rounded-xl border border-white/20 px-3 py-2.5 text-sm font-medium text-white disabled:opacity-50">
          {saved ? 'In Fotos gespeichert' : 'In Fotos speichern'}
        </button>
      </div>
      <p role="status" aria-live="polite" className="mt-2 text-sm text-secondary break-words">
        {busy ? 'Video wird vorbereitet…' : message}
      </p>
    </div>
  )
}
