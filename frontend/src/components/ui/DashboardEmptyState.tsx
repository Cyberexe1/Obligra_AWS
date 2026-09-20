import { Link } from 'react-router-dom'
import Button from './Button'

/**
 * Shown on the Dashboard when the authenticated user has no obligations
 * at all yet (a real, verified empty condition from the API — never
 * shown alongside fake/sample data). Matches the Stitch design's rounded,
 * ambient-glow visual language rather than a generic "no data" box.
 */
export default function DashboardEmptyState() {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-surface-container-lowest p-10 text-center shadow-card sm:p-16">
      <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-secondary-fixed/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 -left-16 h-64 w-64 rounded-full bg-primary-fixed/20 blur-3xl" />

      <div className="relative z-10 mx-auto flex max-w-md flex-col items-center">
        <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary-fixed/50 text-secondary">
          <span className="material-symbols-outlined text-[32px]">hub</span>
        </div>

        <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">
          Your obligation graph starts here.
        </h3>
        <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
          Upload a document, send a screenshot, or add information to discover what needs your attention.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Link to="/upload">
            <Button type="button">Upload Source</Button>
          </Link>
          <Link to="/add-text">
            <Button type="button" variant="secondary">
              Add Text
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
