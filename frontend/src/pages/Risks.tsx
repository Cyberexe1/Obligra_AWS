import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import ErrorState from '../components/ui/ErrorState'
import ObligationCard from '../components/ui/ObligationCard'
import type { ObligationCardData } from '../components/ui/ObligationCard'
import { ListRowSkeleton } from '../components/ui/Skeleton'
import { useDataRefreshSignal } from '../lib/dataRefresh'
import { ApiError, fetchObligationRisks, fetchObligations } from '../lib/api'
import type { ObligationRisk, StoredObligation } from '../lib/api'

const RISK_ORDER: Record<ObligationRisk['risk_level'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

function toCardData(risk: ObligationRisk, obligationsById: Map<string, StoredObligation>): ObligationCardData {
  const obligation = obligationsById.get(risk.obligation_id)
  return {
    obligationId: risk.obligation_id,
    action: risk.action,
    deadline: obligation?.deadline ?? null,
    status: obligation?.status ?? null,
    riskLevel: risk.risk_level,
    source: obligation?.source ?? null,
    blockedCount: risk.blocked_count,
    daysRemaining: risk.days_remaining,
    reason: risk.reason,
  }
}

/**
 * Rule-based risk assessment view, via GET /api/obligations/risks.
 * Cross-references GET /api/obligations by obligation_id to also show
 * each obligation's deadline/status/source excerpt, since the risks
 * endpoint itself only returns the risk-relevant subset of fields.
 */
export default function Risks() {
  const [risks, setRisks] = useState<ObligationRisk[]>([])
  const [obligations, setObligations] = useState<StoredObligation[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function run() {
      setLoadState('loading')
      try {
        const [risksResponse, obligationsResponse] = await Promise.all([fetchObligationRisks(), fetchObligations()])
        if (cancelled) return
        setRisks(risksResponse.risks)
        setObligations(obligationsResponse.obligations)
        setLoadState('loaded')
      } catch (err: unknown) {
        if (cancelled) return
        const message = err instanceof ApiError ? err.message : 'Failed to load risk analysis.'
        setError(message)
        setLoadState('error')
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [refreshToken])

  const loadRisks = useCallback(() => setRefreshToken((token) => token + 1), [])
  useDataRefreshSignal(loadRisks)

  const obligationsById = useMemo(() => {
    const map = new Map<string, StoredObligation>()
    for (const obligation of obligations) map.set(obligation.obligation_id, obligation)
    return map
  }, [obligations])

  const sortedRisks = useMemo(
    () => [...risks].sort((a, b) => RISK_ORDER[a.risk_level] - RISK_ORDER[b.risk_level]),
    [risks],
  )

  return (
    <section aria-labelledby="risks-heading" className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 id="risks-heading" className="font-headline-md text-headline-md font-bold text-on-surface">
            Risks
          </h2>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
            Rule-based risk signals: overdue obligations, approaching deadlines, blocked items, and obligations
            blocking others downstream.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={loadRisks}>
          Refresh
        </Button>
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
        <ErrorState title="Unable to load risk analysis" message={error} onRetry={loadRisks} />
      )}

      {loadState === 'loaded' && sortedRisks.length === 0 && (
        <Card className="p-8 text-center">
          <p className="font-body-md text-body-md text-on-surface-variant">
            No at-risk obligations right now &mdash; nothing overdue, blocked, or approaching its deadline.
          </p>
        </Card>
      )}

      {loadState === 'loaded' && sortedRisks.length > 0 && (
        <Card className="p-4 sm:p-6">
          <ul className="flex flex-col gap-3">
            {sortedRisks.map((risk) => (
              <ObligationCard key={risk.obligation_id} obligation={toCardData(risk, obligationsById)} />
            ))}
          </ul>
        </Card>
      )}
    </section>
  )
}
