import { useState } from 'react'
import { apiBase, checkServer, saveApiBase } from '../services/api'

export function ServerSettings({ disabled }: { disabled: boolean }) {
  const [address, setAddress] = useState(() => {
    try { return apiBase() } catch { return '' }
  })
  const [message, setMessage] = useState('')
  const [checking, setChecking] = useState(false)

  return (
    <details className="bg-card rounded-xl border border-white/[0.08] p-4 mb-6">
      <summary className="text-sm text-white cursor-pointer">Server settings</summary>
      <form className="flex flex-col gap-3 mt-3" onSubmit={async event => {
        event.preventDefault()
        setChecking(true)
        setMessage('Checking connection…')
        try {
          saveApiBase(address)
          await checkServer()
          setMessage('Server connected. You can now analyze a video link.')
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Connection failed.')
        } finally {
          setChecking(false)
        }
      }}>
        <label className="text-xs text-secondary" htmlFor="server-address">Download server address</label>
        <input id="server-address" type="url" required value={address}
          disabled={disabled || checking} onChange={event => setAddress(event.target.value)}
          placeholder="http://100.80.105.62:8765"
          className="rounded-lg bg-bg border border-white/20 p-3 text-sm text-white" />
        <p className="text-xs text-secondary">For a Tailscale address, connect Tailscale on your iPhone and keep the server running.</p>
        <button disabled={disabled || checking} className="rounded-lg bg-accent p-3 text-sm text-white disabled:opacity-50">
          Save and test connection
        </button>
        <p role="status" className="text-sm text-secondary">{message}</p>
      </form>
    </details>
  )
}
