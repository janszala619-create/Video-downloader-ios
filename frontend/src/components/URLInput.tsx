import { useState, useRef } from 'react'

interface URLInputProps {
  onAnalyze: (url: string) => void
  isLoading: boolean
  error: string | null
}

export function URLInput({ onAnalyze, isLoading, error }: URLInputProps) {
  const [url, setUrl] = useState('')
  const [shakeKey, setShakeKey] = useState(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      setUrl(text)
      inputRef.current?.focus()
    } catch {
      inputRef.current?.focus()
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!url.trim()) {
      setShakeKey(k => k + 1)
      return
    }
    onAnalyze(url.trim())
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="relative">
        <textarea
          ref={inputRef}
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="Paste video URL here…"
          rows={2}
          inputMode="url"
          className={`w-full min-w-0 resize-none rounded-xl bg-card border px-4 py-4 pr-24 text-base text-white placeholder-secondary outline-none transition-all duration-150 focus:border-accent focus:shadow-glow ${
            error ? 'border-red-500' : 'border-white/[0.08]'
          }`}
          style={{ lineHeight: '1.5' }}
        />
        <button
          type="button"
          onClick={handlePaste}
          className="absolute right-3 top-3 min-h-11 rounded-lg bg-white/[0.06] px-3 py-1.5 text-sm font-medium text-secondary transition-colors hover:text-white hover:bg-white/[0.1]"
        >
          Paste
        </button>
      </div>

      {error && (
        <p key={shakeKey} className="shake text-xs text-red-400 px-1">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="flex items-center justify-center gap-2 rounded-xl bg-accent py-3.5 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed shadow-glow"
      >
        {isLoading ? (
          <>
            <svg
              className="animate-spin"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            Analyzing…
          </>
        ) : (
          <>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            Analyze URL
          </>
        )}
      </button>
    </form>
  )
}
