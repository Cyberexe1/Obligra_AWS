import type { ObligationStatus, SourceProcessingStatus } from '../../lib/api'

type Status = ObligationStatus | SourceProcessingStatus

const STATUS_STYLES: Record<Status, string> = {
  pending: 'bg-[#f0f9ff] text-[#0369a1]',
  processing: 'bg-[#f0f9ff] text-[#0369a1]',
  in_progress: 'bg-secondary-fixed text-on-secondary-fixed',
  completed: 'bg-[#ecfdf5] text-[#047857]',
  blocked: 'bg-[#fff1f2] text-[#be123c]',
  failed: 'bg-[#fff1f2] text-[#be123c]',
}

const STATUS_DOT_STYLES: Record<Status, string> = {
  pending: 'bg-[#0ea5e9]',
  processing: 'bg-[#0ea5e9]',
  in_progress: 'bg-secondary',
  completed: 'bg-[#10b981]',
  blocked: 'bg-[#f43f5e]',
  failed: 'bg-[#f43f5e]',
}

const STATUS_LABELS: Record<Status, string> = {
  pending: 'Pending',
  processing: 'Processing',
  in_progress: 'In Progress',
  completed: 'Completed',
  blocked: 'Blocked',
  failed: 'Failed',
}

interface StatusBadgeProps {
  status: Status
}

/**
 * Pill status badge shared by obligations and sources (both use an
 * overlapping status vocabulary) — same visual spec as RiskBadge.
 */
export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-label-sm text-label-sm font-semibold uppercase tracking-wide',
        STATUS_STYLES[status],
      ].join(' ')}
    >
      <span className={['h-1.5 w-1.5 rounded-full', STATUS_DOT_STYLES[status]].join(' ')} />
      {STATUS_LABELS[status]}
    </span>
  )
}
