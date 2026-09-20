import Button from './Button'

interface ErrorStateProps {
  title: string
  message?: string | null
  onRetry: () => void
}

/**
 * Standard API-failure panel: a short title, the backend's own error
 * message (never a stack trace — `ApiError.message` is always a clean,
 * user-facing string produced by the backend's `detail` field or a
 * generic fallback, see lib/api.ts), and a Retry button that re-runs
 * the same fetch that failed.
 */
export default function ErrorState({ title, message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-error/20 bg-error-container p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-title-md text-title-md font-semibold text-on-error-container">{title}</p>
        {message && <p className="mt-1 font-body-sm text-body-sm text-on-error-container/80">{message}</p>}
      </div>
      <Button type="button" variant="secondary" size="md" onClick={onRetry} className="shrink-0">
        Retry
      </Button>
    </div>
  )
}
