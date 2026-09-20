import { useCallback, useEffect, useState } from 'react'
import Button from '../components/ui/Button'
import ErrorState from '../components/ui/ErrorState'
import { ListRowSkeleton } from '../components/ui/Skeleton'
import StatusBadge from '../components/ui/StatusBadge'
import { useDataRefreshSignal } from '../lib/dataRefresh'
import { ApiError, fetchObligations, updateObligationStatus } from '../lib/api'
import type { ObligationStatus, StoredObligation } from '../lib/api'

const STATUS_OPTIONS: ObligationStatus[] = ['pending', 'in_progress', 'completed', 'blocked']

const STATUS_LABELS: Record<ObligationStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Completed',
  blocked: 'Blocked',
}

function NullValue() {
  return <span className="text-on-surface-variant/40">&mdash;</span>
}

export default function Obligations() {
  const [obligations, setObligations] = useState<StoredObligation[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set())

  const [refreshToken, setRefreshToken] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function run() {
      setLoadState('loading')
      try {
        const response = await fetchObligations()
        if (cancelled) return
        setObligations(response.obligations)
        setLoadState('loaded')
      } catch (err: unknown) {
        if (cancelled) return
        const message = err instanceof ApiError ? err.message : 'Failed to load obligations.'
        setError(message)
        setLoadState('error')
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [refreshToken])

  const loadObligations = useCallback(() => {
    setRefreshToken((token) => token + 1)
  }, [])
  useDataRefreshSignal(loadObligations)

  const handleStatusChange = (obligationId: string, newStatus: ObligationStatus) => {
    setUpdatingIds((prev) => new Set(prev).add(obligationId))

    updateObligationStatus(obligationId, newStatus)
      .then((updated) => {
        setObligations((prev) =>
          prev.map((obligation) => (obligation.obligation_id === obligationId ? updated : obligation)),
        )
      })
      .catch((err: unknown) => {
        const message = err instanceof ApiError ? err.message : 'Failed to update status.'
        setError(message)
      })
      .finally(() => {
        setUpdatingIds((prev) => {
          const next = new Set(prev)
          next.delete(obligationId)
          return next
        })
      })
  }

  return (
    <section aria-labelledby="obligations-heading" className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 id="obligations-heading" className="font-headline-md text-headline-md font-bold text-on-surface">
            Obligations
          </h2>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
            Obligations extracted from your documents, persisted in DynamoDB.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={loadObligations}>
          Refresh
        </Button>
      </div>

      {loadState === 'loading' && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <ListRowSkeleton key={index} />
          ))}
        </div>
      )}

      {loadState === 'error' && (
        <ErrorState title="Unable to load obligations" message={error} onRetry={loadObligations} />
      )}

      {loadState === 'loaded' && obligations.length === 0 && (
        <div className="rounded-lg border border-dashed border-outline-variant bg-surface-container-lowest p-8 text-center">
          <p className="font-body-md text-body-md text-on-surface-variant">
            No obligations yet. Upload a document and run extraction from the Upload page.
          </p>
        </div>
      )}

      {loadState === 'loaded' && obligations.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-outline-variant/20 bg-surface-container-lowest shadow-card">
          <table className="w-full min-w-[900px] table-auto border-collapse text-left font-body-md text-body-md">
            <thead>
              <tr className="border-b border-outline-variant/20 bg-surface-container-low text-on-surface-variant">
                <th scope="col" className="px-4 py-3 font-label-md text-label-md">
                  Action
                </th>
                <th scope="col" className="px-4 py-3 font-label-md text-label-md">
                  Deadline
                </th>
                <th scope="col" className="px-4 py-3 font-label-md text-label-md">
                  Condition
                </th>
                <th scope="col" className="px-4 py-3 font-label-md text-label-md">
                  Consequence
                </th>
                <th scope="col" className="px-4 py-3 font-label-md text-label-md">
                  Confidence
                </th>
                <th scope="col" className="px-4 py-3 font-label-md text-label-md">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {obligations.map((obligation) => (
                <tr key={obligation.obligation_id} className="border-b border-outline-variant/10 align-top last:border-0">
                  <td className="px-4 py-3 text-on-surface">{obligation.action ?? <NullValue />}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{obligation.deadline ?? <NullValue />}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{obligation.condition ?? <NullValue />}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{obligation.consequence ?? <NullValue />}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{Math.round(obligation.confidence * 100)}%</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={obligation.status} />
                      <select
                        aria-label={`Update status for obligation ${obligation.action ?? obligation.obligation_id}`}
                        value={obligation.status}
                        disabled={updatingIds.has(obligation.obligation_id)}
                        onChange={(event) =>
                          handleStatusChange(obligation.obligation_id, event.target.value as ObligationStatus)
                        }
                        className="rounded border border-outline-variant/60 bg-surface-container-lowest px-2 py-1 font-body-sm text-body-sm text-on-surface-variant disabled:opacity-50"
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {STATUS_LABELS[option]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
