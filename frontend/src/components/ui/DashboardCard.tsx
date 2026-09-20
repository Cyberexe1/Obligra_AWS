import type { ReactNode } from 'react'
import Card from './Card'

interface DashboardCardProps {
  label: string
  value: ReactNode
  icon: string
  accent?: 'default' | 'warning' | 'error'
  hint?: string
}

const ACCENT_VALUE_CLASSES: Record<NonNullable<DashboardCardProps['accent']>, string> = {
  default: 'text-on-surface',
  warning: 'text-[#b45309]',
  error: 'text-error',
}

const ACCENT_ICON_CLASSES: Record<NonNullable<DashboardCardProps['accent']>, string> = {
  default: 'bg-secondary-fixed/50 text-secondary',
  warning: 'bg-[#fffbeb] text-[#b45309]',
  error: 'bg-error-container text-error',
}

/**
 * Stat card used in the Dashboard overview grid (Total Obligations, Due
 * Soon, High Risk, Blocked). Matches the Stitch design's telemetry-chip
 * spec (label / bold metric / muted hint).
 */
export default function DashboardCard({ label, value, icon, accent = 'default', hint }: DashboardCardProps) {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <span className="font-label-sm text-label-sm uppercase tracking-wide text-on-surface-variant">{label}</span>
        <div className={['flex h-9 w-9 items-center justify-center rounded-xl', ACCENT_ICON_CLASSES[accent]].join(' ')}>
          <span className="material-symbols-outlined text-[18px]">{icon}</span>
        </div>
      </div>
      <span className={['font-headline-md text-headline-md font-bold', ACCENT_VALUE_CLASSES[accent]].join(' ')}>
        {value}
      </span>
      {hint && <span className="font-body-sm text-body-sm text-on-surface-variant">{hint}</span>}
    </Card>
  )
}
