import { Link } from 'react-router-dom'
import type { RiskLevel } from '../../lib/api'
import RiskBadge from './RiskBadge'

interface PriorityActionRowProps {
  rank: number
  action: string | null
  riskLevel: RiskLevel
  supportingText: string
}

/**
 * A single ranked entry in the Dashboard's "Priority Actions" list —
 * the exact ranked-list format requested: a zero-padded ordinal, the
 * action, a risk badge, and one line of supporting context (deadline
 * urgency or dependency reason). Order and ranking come directly from
 * `GET /api/obligations/priorities` (`priority_score`) — nothing here
 * re-derives or re-ranks anything client-side.
 */
export default function PriorityActionRow({ rank, action, riskLevel, supportingText }: PriorityActionRowProps) {
  return (
    <Link
      to="/obligations"
      className="flex items-center gap-4 rounded-lg border border-outline-variant/20 bg-surface-container-low/60 p-4 transition-colors hover:bg-surface-container-low"
    >
      <span className="shrink-0 font-headline-sm text-headline-sm font-bold text-on-surface-variant/40">
        {String(rank).padStart(2, '0')}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate font-title-md text-title-md font-semibold text-on-surface">
          {action ?? 'Unspecified obligation'}
        </p>
        <p className="mt-0.5 truncate font-body-sm text-body-sm text-on-surface-variant">{supportingText}</p>
      </div>

      <div className="shrink-0">
        <RiskBadge level={riskLevel} />
      </div>

      <span className="material-symbols-outlined shrink-0 text-[18px] text-on-surface-variant/50">
        chevron_right
      </span>
    </Link>
  )
}
