interface ProgressBarProps {
  isVisible: boolean
  label?: string
}

export function ProgressBar({ isVisible, label }: ProgressBarProps) {
  if (!isVisible) return null

  return (
    <div role="status" className="fixed inset-x-0 z-50" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
      <div className="h-[3px] w-full overflow-hidden bg-card">
        <div className="h-full shimmer" />
      </div>
      {label && (
        <div className="flex justify-center pt-2">
          <span className="text-xs text-secondary bg-card px-3 py-1 rounded-full border border-white/[0.08]">
            {label}
          </span>
        </div>
      )}
    </div>
  )
}
