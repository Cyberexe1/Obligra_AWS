/**
 * Base skeleton block: a pulsing muted rectangle matching the Stitch
 * surface tokens. Composed into the specific skeleton layouts below
 * rather than used directly in pages.
 */
function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={['animate-pulse rounded bg-surface-container-high', className].join(' ')} />
}

/** Loading placeholder for a single DashboardCard stat tile. */
export function StatCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-5 shadow-card">
      <div className="flex items-center justify-between">
        <SkeletonBlock className="h-3 w-24" />
        <SkeletonBlock className="h-9 w-9 rounded-xl" />
      </div>
      <SkeletonBlock className="h-8 w-16" />
      <SkeletonBlock className="h-3 w-20" />
    </div>
  )
}

/** Loading placeholder for a single row in a list (obligations, sources). */
export function ListRowSkeleton() {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-outline-variant/20 bg-surface-container-low/60 p-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <SkeletonBlock className="h-10 w-10 shrink-0 rounded-xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <SkeletonBlock className="h-4 w-3/5" />
          <SkeletonBlock className="h-3 w-2/5" />
        </div>
      </div>
      <SkeletonBlock className="h-6 w-20 shrink-0 rounded-full" />
    </div>
  )
}

/** Loading placeholder for the graph preview panel. */
export function GraphPreviewSkeleton() {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-lg border border-outline-variant/10 bg-surface-container-low/40 p-6">
      <SkeletonBlock className="h-16 w-16 rounded-2xl" />
      <SkeletonBlock className="h-3 w-32" />
    </div>
  )
}
