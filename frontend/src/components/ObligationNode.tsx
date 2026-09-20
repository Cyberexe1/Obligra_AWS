import { Handle, Position } from '@xyflow/react'
import type { NodeProps, Node } from '@xyflow/react'
import type { ObligationStatus } from '../lib/api'

export interface ObligationNodeData extends Record<string, unknown> {
  label: string | null
  status: ObligationStatus
  deadline: string | null
  confidence: number
}

export type ObligationNodeType = Node<ObligationNodeData, 'obligation'>

const STATUS_STYLES: Record<ObligationStatus, { border: string; badge: string; label: string }> = {
  pending: {
    border: 'border-outline-variant',
    badge: 'bg-[#f0f9ff] text-[#0369a1]',
    label: 'Pending',
  },
  in_progress: {
    border: 'border-secondary',
    badge: 'bg-secondary-fixed text-on-secondary-fixed',
    label: 'In progress',
  },
  completed: {
    border: 'border-[#10b981]',
    badge: 'bg-[#ecfdf5] text-[#047857]',
    label: 'Completed',
  },
  blocked: {
    border: 'border-[#f43f5e]',
    badge: 'bg-[#fff1f2] text-[#be123c]',
    label: 'Blocked',
  },
}

export default function ObligationNode({ data, selected }: NodeProps<ObligationNodeType>) {
  const styles = STATUS_STYLES[data.status]

  return (
    <div
      className={[
        'w-56 rounded-lg border-2 bg-surface-container-lowest p-3 shadow-card transition-shadow',
        styles.border,
        selected ? 'shadow-floating ring-2 ring-secondary/30' : '',
      ].join(' ')}
    >
      <Handle type="target" position={Position.Top} className="!bg-outline" />

      <div className="flex items-start justify-between gap-2">
        <p className="font-title-md text-title-md font-medium text-on-surface">{data.label ?? 'Untitled obligation'}</p>
      </div>

      <span className={`mt-2 inline-block rounded-full px-2 py-0.5 font-label-sm text-label-sm font-medium ${styles.badge}`}>
        {styles.label}
      </span>

      <dl className="mt-2 space-y-1 font-body-sm text-body-sm text-on-surface-variant">
        <div className="flex justify-between gap-2">
          <dt className="font-medium text-on-surface-variant/70">Deadline</dt>
          <dd className="text-right">{data.deadline ?? '—'}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="font-medium text-on-surface-variant/70">Confidence</dt>
          <dd>{Math.round(data.confidence * 100)}%</dd>
        </div>
      </dl>

      <Handle type="source" position={Position.Bottom} className="!bg-outline" />
    </div>
  )
}
