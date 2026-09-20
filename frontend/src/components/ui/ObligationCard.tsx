import type { ObligationStatus, RiskLevel } from '../../lib/api'
import RiskBadge from './RiskBadge'
import StatusBadge from './StatusBadge'

export interface ObligationCardData {
  obligationId: string
  action: string | null
  deadline: string | null
  status: ObligationStatus | null
  riskLevel: RiskLevel
  source: string | null
  blockedCount: number
  daysRemaining: number | null
  reason: string
}

interface ObligationCardProps {
  obligation: ObligationCardData
}

function formatDaysRemaining(days: number | null): string | null {
  if (days === null) return null
  if (days < 0) return `${Math.abs(days)} day(s) overdue`
  if (days === 0) return 'Due today'
  return `Due in ${days} day(s)`
}

/**
 * A single obligation row in the Dashboard's "Attention Required"
 * section — shows action, deadline, status, risk, source excerpt, and
 * blocking/dependency info in one glanceable card.
 */
export default function ObligationCard({ obligation }: ObligationCardProps) {
  const daysLabel = formatDaysRemaining(obligation.daysRemaining)

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-outline-variant/20 bg-surface-container-low/60 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <RiskBadge level={obligation.riskLevel} />
          {obligation.status && <StatusBadge status={obligation.status} />}
        </div>
        <p className="mt-2 font-title-md text-title-md font-semibold text-on-surface">
          {obligation.action ?? 'Unspecified obligation'}
        </p>
        <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{obligation.reason}</p>
        {obligation.source && (
          <p className="mt-2 truncate font-body-sm text-body-sm italic text-on-surface-variant/80">
            &ldquo;{obligation.source}&rdquo;
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
        {obligation.deadline && (
          <span className="inline-flex items-center gap-1.5 font-label-md text-label-md font-semibold text-on-surface">
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">schedule</span>
            {obligation.deadline}
          </span>
        )}
        {daysLabel && <span className="font-body-sm text-body-sm text-on-surface-variant">{daysLabel}</span>}
        {obligation.blockedCount > 0 && (
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-error-container px-2 py-0.5 font-label-sm text-label-sm font-semibold text-on-error-container">
            <span className="material-symbols-outlined text-[14px]">link_off</span>
            Blocks {obligation.blockedCount}
          </span>
        )}
      </div>
    </li>
  )
}
