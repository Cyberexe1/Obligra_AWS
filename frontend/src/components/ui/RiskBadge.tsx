import type { RiskLevel } from '../../lib/api'

const RISK_STYLES: Record<RiskLevel, string> = {
  // Semantic status tints from the Stitch design system (Active/Risk/Blocked/Pending chips).
  low: 'bg-[#ecfdf5] text-[#047857]',
  medium: 'bg-[#fffbeb] text-[#b45309]',
  high: 'bg-[#fff1f2] text-[#be123c]',
  critical: 'bg-error-container text-on-error-container',
}

const RISK_DOT_STYLES: Record<RiskLevel, string> = {
  low: 'bg-[#10b981]',
  medium: 'bg-[#f59e0b]',
  high: 'bg-[#f43f5e]',
  critical: 'bg-error',
}

const RISK_LABELS: Record<RiskLevel, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
}

interface RiskBadgeProps {
  level: RiskLevel
}

/**
 * Pill risk badge matching the Stitch design's "Chips & Status Badges"
 * spec: full-pill silhouette, colored micro-dot, uppercase label.
 */
export default function RiskBadge({ level }: RiskBadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-label-sm text-label-sm font-semibold uppercase tracking-wide',
        RISK_STYLES[level],
      ].join(' ')}
    >
      <span className={['h-1.5 w-1.5 rounded-full', RISK_DOT_STYLES[level]].join(' ')} />
      {RISK_LABELS[level]}
    </span>
  )
}
