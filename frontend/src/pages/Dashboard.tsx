import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import DashboardCard from '../components/ui/DashboardCard'
import DashboardEmptyState from '../components/ui/DashboardEmptyState'
import ErrorState from '../components/ui/ErrorState'
import PriorityActionRow from '../components/ui/PriorityActionRow'
import SourceCard from '../components/ui/SourceCard'
import { GraphPreviewSkeleton, ListRowSkeleton, StatCardSkeleton } from '../components/ui/Skeleton'
import GraphPreview from '../components/GraphPreview'
import { useDataRefreshSignal } from '../lib/dataRefresh'
import {
  ApiError,
  fetchObligationGraph,
  fetchObligationPriorities,
  fetchObligationRisks,
  fetchObligations,
  fetchSources,
} from '../lib/api'
import type {
  ObligationGraphResponse,
  ObligationRisk,
  PriorityItem,
  StoredObligation,
  StoredSource,
} from '../lib/api'

interface DashboardData {
  obligations: StoredObligation[]
  risks: ObligationRisk[]
  priorities: PriorityItem[]
  sources: StoredSource[]
  graph: ObligationGraphResponse
}

function formatSupportingText(item: PriorityItem): string {
  if (item.days_remaining !== null) {
    if (item.days_remaining < 0) return `${Math.abs(item.days_remaining)} day(s) overdue`
    if (item.days_remaining === 0) return 'Due today'
    return `Due in ${item.days_remaining} day(s)`
  }
  return item.reason
}

/**
 * Authenticated home page — the Obligation Intelligence Command Center.
 * Every number and list here comes from a real, authenticated API call
 * (see the five endpoints fetched below); nothing is hardcoded or
 * invented. Answers, at a glance: what needs action, what's urgent,
 * what's at risk, what's blocked, what's blocking something else, and
 * where each obligation came from.
 */
export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  const reload = useCallback(() => setRefreshToken((token) => token + 1), [])
  useDataRefreshSignal(reload)

  useEffect(() => {
    let cancelled = false

    async function run() {
      setLoadState((previous) => (previous === 'loaded' ? previous : 'loading'))
      try {
        const [obligationsRes, risksRes, prioritiesRes, sourcesRes, graphRes] = await Promise.all([
          fetchObligations(),
          fetchObligationRisks(),
          fetchObligationPriorities(5),
          fetchSources(),
          fetchObligationGraph(),
        ])
        if (cancelled) return
        setData({
          obligations: obligationsRes.obligations,
          risks: risksRes.risks,
          priorities: prioritiesRes.priorities,
          sources: sourcesRes.sources,
          graph: graphRes,
        })
        setLoadState('loaded')
        setError(null)
      } catch (err: unknown) {
        if (cancelled) return
        const message = err instanceof ApiError ? err.message : 'Failed to load dashboard data.'
        setError(message)
        setLoadState('error')
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [refreshToken])

  const stats = useMemo(() => {
    if (!data) return null

    const totalObligations = data.obligations.length
    const dueSoon = data.risks.filter((risk) => risk.days_remaining !== null && risk.days_remaining <= 7).length
    const highRisk = data.risks.filter((risk) => risk.risk_level === 'high' || risk.risk_level === 'critical').length
    const blocked = data.obligations.filter((obligation) => obligation.status === 'blocked').length
    const blocking = data.risks.filter((risk) => risk.blocked_count > 0).length

    return { totalObligations, dueSoon, highRisk, blocked, blocking }
  }, [data])

  const recentSources = useMemo(() => {
    if (!data) return []
    return [...data.sources]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5)
  }, [data])

  const obligationCountBySource = useMemo(() => {
    const counts = new Map<string, number>()
    for (const obligation of data?.obligations ?? []) {
      if (!obligation.source_id) continue
      counts.set(obligation.source_id, (counts.get(obligation.source_id) ?? 0) + 1)
    }
    return counts
  }, [data])

  const isEmpty = loadState === 'loaded' && data !== null && data.obligations.length === 0 && data.sources.length === 0

  return (
    <section aria-labelledby="dashboard-heading" className="space-y-6">
      <div>
        <h2 id="dashboard-heading" className="font-headline-md text-headline-md font-bold text-on-surface">
          Dashboard
        </h2>
        <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
          A summary of your obligations, deadlines, and dependencies.
        </p>
      </div>

      {loadState === 'loading' && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <StatCardSkeleton key={index} />
            ))}
          </div>
          <Card className="p-5 sm:p-6">
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <ListRowSkeleton key={index} />
              ))}
            </div>
          </Card>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="p-5 sm:p-6">
              <div className="flex flex-col gap-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <ListRowSkeleton key={index} />
                ))}
              </div>
            </Card>
            <Card className="p-5 sm:p-6">
              <GraphPreviewSkeleton />
            </Card>
          </div>
        </div>
      )}

      {loadState === 'error' && (
        <ErrorState title="Unable to load dashboard data" message={error} onRetry={reload} />
      )}

      {loadState === 'loaded' && data && stats && isEmpty && <DashboardEmptyState />}

      {loadState === 'loaded' && data && stats && !isEmpty && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <DashboardCard
              label="Total Obligations"
              value={stats.totalObligations}
              icon="task_alt"
              hint="Tracked across all sources"
            />
            <DashboardCard
              label="Due Soon"
              value={stats.dueSoon}
              icon="schedule"
              accent="warning"
              hint="Within 7 days"
            />
            <DashboardCard
              label="High Risk"
              value={stats.highRisk}
              icon="crisis_alert"
              accent="error"
              hint={stats.highRisk > 0 ? 'Needs review' : 'None right now'}
            />
            <DashboardCard
              label="Blocked"
              value={stats.blocked}
              icon="lock"
              accent="error"
              hint={stats.blocking > 0 ? `Blocking ${stats.blocking} other item(s)` : 'Nothing blocked'}
            />
          </div>

          <Card className="p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4 border-b border-outline-variant/10 pb-4">
              <div>
                <h3 className="font-title-md text-title-md font-semibold text-on-surface">Priority Actions</h3>
                <p className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">
                  Recommended order, ranked by risk, deadline urgency, and downstream impact.
                </p>
              </div>
              <Link
                to="/risks"
                className="shrink-0 font-label-md text-label-md font-semibold text-secondary hover:underline"
              >
                View all
              </Link>
            </div>

            {data.priorities.length === 0 ? (
              <p className="py-6 font-body-md text-body-md text-on-surface-variant">
                Nothing needs attention right now. No obligations are overdue, approaching their deadline, blocked,
                or blocking other work.
              </p>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {data.priorities.map((item, index) => (
                  <li key={item.obligation_id}>
                    <PriorityActionRow
                      rank={index + 1}
                      action={item.action}
                      riskLevel={item.risk_level}
                      supportingText={formatSupportingText(item)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card className="p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4 border-b border-outline-variant/10 pb-4">
                <div>
                  <h3 className="font-title-md text-title-md font-semibold text-on-surface">Recent Sources</h3>
                  <p className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">
                    Recently processed files, text, and messages.
                  </p>
                </div>
                <Link
                  to="/sources"
                  className="shrink-0 font-label-md text-label-md font-semibold text-secondary hover:underline"
                >
                  View all
                </Link>
              </div>

              {recentSources.length === 0 ? (
                <p className="py-6 font-body-md text-body-md text-on-surface-variant">
                  No sources yet.{' '}
                  <Link to="/add-text" className="font-semibold text-secondary hover:underline">
                    Paste some text
                  </Link>{' '}
                  or{' '}
                  <Link to="/upload" className="font-semibold text-secondary hover:underline">
                    upload a document
                  </Link>{' '}
                  to get started.
                </p>
              ) : (
                <ul className="mt-4 flex flex-col gap-3">
                  {recentSources.map((source) => (
                    <SourceCard
                      key={source.source_id}
                      source={source}
                      obligationCount={obligationCountBySource.get(source.source_id) ?? 0}
                    />
                  ))}
                </ul>
              )}
            </Card>

            <Card className="flex flex-col p-5 sm:p-6">
              <div className="flex items-center justify-between gap-4 border-b border-outline-variant/10 pb-4">
                <div>
                  <h3 className="font-title-md text-title-md font-semibold text-on-surface">Obligation Graph</h3>
                  <p className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">
                    Preview of detected dependencies.
                  </p>
                </div>
                <Link to="/graph">
                  <Button type="button" variant="secondary" size="md">
                    View Full Graph
                  </Button>
                </Link>
              </div>

              <div className="mt-4 min-h-[260px] flex-1">
                {data.graph.nodes.length === 0 ? (
                  <div className="flex h-full min-h-[260px] items-center justify-center rounded-lg border border-dashed border-outline-variant bg-surface-container-low/50 text-center">
                    <p className="max-w-xs px-4 font-body-md text-body-md text-on-surface-variant">
                      No obligations yet. Once you have obligations from more than one source, run dependency
                      analysis to populate the graph.
                    </p>
                  </div>
                ) : (
                  <GraphPreview nodes={data.graph.nodes} edges={data.graph.edges} />
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </section>
  )
}
