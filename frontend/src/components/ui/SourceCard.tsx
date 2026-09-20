import type { StoredSource } from '../../lib/api'
import StatusBadge from './StatusBadge'

interface SourceBadge {
  icon: string
  label: string
}

/**
 * Derives a precise badge (icon + label) from a source's real backend
 * fields — never a guess. `source_type` alone can't distinguish a
 * Telegram screenshot from a Telegram text message (both are
 * `source_type: "telegram"`), or a PDF from an image upload (both are
 * `source_type: "file"`), so this also inspects `title`:
 *   - Telegram photo sources are always created with
 *     `title: "Telegram Screenshot"` (see app/routers/telegram.py's
 *     `_process_photo_for_user`), while Telegram text messages have
 *     `title: null`.
 *   - File sources' `title` is the original uploaded filename (see
 *     app/routers/documents.py's `upload_document`), so its extension
 *     reveals PDF vs. image.
 */
function getSourceBadge(source: StoredSource): SourceBadge {
  if (source.source_type === 'telegram') {
    if (source.title === 'Telegram Screenshot') {
      return { icon: 'photo_camera', label: 'Screenshot' }
    }
    return { icon: 'send', label: 'Telegram' }
  }

  if (source.source_type === 'file') {
    const filename = source.title?.toLowerCase() ?? ''
    if (filename.endsWith('.pdf')) {
      return { icon: 'picture_as_pdf', label: 'PDF' }
    }
    return { icon: 'photo_camera', label: 'Screenshot' }
  }

  if (source.source_type === 'text') {
    return { icon: 'edit_note', label: 'Text' }
  }

  if (source.source_type === 'email') {
    return { icon: 'mail', label: 'Email' }
  }

  return { icon: 'chat', label: 'WhatsApp' }
}

interface SourceCardProps {
  source: StoredSource
  obligationCount: number
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}

function fallbackTitle(source: StoredSource, badgeLabel: string): string {
  return source.title ?? badgeLabel
}

/**
 * A single recently-processed source row for the Dashboard's "Recent
 * Sources" section and the Sources page — shows a precise type badge,
 * title, created date, processing status, and how many obligations it
 * produced.
 */
export default function SourceCard({ source, obligationCount }: SourceCardProps) {
  const badge = getSourceBadge(source)

  return (
    <li className="flex items-center justify-between gap-4 rounded-lg border border-outline-variant/20 bg-surface-container-low/60 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary-fixed/50 text-secondary">
          <span className="material-symbols-outlined text-[20px]">{badge.icon}</span>
        </div>
        <div className="min-w-0">
          <p className="truncate font-title-md text-title-md font-semibold text-on-surface">
            {fallbackTitle(source, badge.label)}
          </p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {badge.label} &middot; {formatDate(source.created_at)}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <StatusBadge status={source.processing_status} />
        <span className="font-body-sm text-body-sm text-on-surface-variant">
          {obligationCount} obligation{obligationCount === 1 ? '' : 's'}
        </span>
      </div>
    </li>
  )
}
