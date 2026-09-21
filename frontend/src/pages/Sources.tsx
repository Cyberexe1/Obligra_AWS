import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import ErrorState from '../components/ui/ErrorState'
import { ListRowSkeleton } from '../components/ui/Skeleton'
import SourceCard from '../components/ui/SourceCard'
import { useDataRefreshSignal } from '../lib/dataRefresh'
import { ApiError, fetchObligations, fetchSources } from '../lib/api'
import type { StoredObligation, StoredSource } from '../lib/api'

/**
 * Lists every source (file, pasted text, Telegram message/screenshot,
 * ...) the current user has created, via GET /api/sources, alongside
 * how many obligations each one produced (computed client-side from
 * GET /api/obligations, since the sources API itself doesn't return a
 * count).
 */
export default function Sources() {
  const [sources, setSources] = useState<StoredSource[]>([])
  const [obligations, setObligations] = useState<StoredObligation[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function run() {
      setLoadState('loading')
      try {
        const [sourcesResponse, obligationsResponse] = await Promise.all([fetchSources(), fetchObligations()])
        if (cancelled) return
        setSources(sourcesResponse.sources)
        setObligations(obligationsResponse.obligations)
        setLoadState('loaded')
      } catch (err: unknown) {
        if (cancelled) return
        const message = err instanceof ApiError ? err.message : 'Failed to load sources.'
        setError(message)
        setLoadState('error')
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [refreshToken])

  const loadSources = useCallback(() => setRefreshToken((token) => token + 1), [])
  useDataRefreshSignal(loadSources)

  const obligationCountBySource = useMemo(() => {
    const counts = new Map<string, number>()
    for (const obligation of obligations) {
      if (!obligation.source_id) continue
      counts.set(obligation.source_id, (counts.get(obligation.source_id) ?? 0) + 1)
    }
    return counts
  }, [obligations])

  const sortedSources = useMemo(
    () => [...sources].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [sources],
  )

  return (
    <section aria-labelledby="sources-heading" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="sources-heading" className="font-headline-md text-headline-md font-bold text-on-surface">
            Sources
          </h2>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
            Every input OBLIGRA has processed: uploaded files, pasted text, and messages from connected channels.
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={loadSources}>
            Refresh
          </Button>
          <Link to="/upload">
            <Button type="button">Add Source</Button>
          </Link>
        </div>
      </div>

      {loadState === 'loading' && (
        <Card className="p-4 sm:p-6">
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <ListRowSkeleton key={index} />
            ))}
          </div>
        </Card>
      )}

      {loadState === 'error' && (
        <ErrorState title="Unable to load sources" message={error} onRetry={loadSources} />
      )}

      {loadState === 'loaded' && sortedSources.length === 0 && (
        <Card className="p-8 text-center">
          <p className="font-body-md text-body-md text-on-surface-variant">
            No sources yet.{' '}
            <Link to="/upload" className="font-semibold text-secondary hover:underline">
              Add a source
            </Link>{' '}
            to get started.
          </p>
        </Card>
      )}

      {loadState === 'loaded' && sortedSources.length > 0 && (
        <Card className="p-4 sm:p-6">
          <ul className="flex flex-col gap-3">
            {sortedSources.map((source) => (
              <SourceCard
                key={source.source_id}
                source={source}
                obligationCount={obligationCountBySource.get(source.source_id) ?? 0}
              />
            ))}
          </ul>
        </Card>
      )}
    </section>
  )
}
