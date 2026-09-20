import { Link } from 'react-router-dom'

const NAV_LINKS = [
  { href: '#product', label: 'Product' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#intelligence', label: 'Intelligence' },
]

/**
 * Rounded floating header used on the public landing page, matching the
 * Stitch design's header spec: pill nav, logo mark, Log in + Get Started
 * CTAs. Distinct from the authenticated app's `AppLayout` sidebar/topbar.
 */
export default function PublicHeader() {
  return (
    <div className="fixed inset-x-0 top-5 z-50 px-4 sm:px-6">
      <header className="mx-auto flex h-20 max-w-7xl items-center justify-between rounded-[26px] bg-surface-container-lowest/85 px-6 shadow-header backdrop-blur-xl transition-all duration-300">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
            <span className="material-symbols-outlined text-[20px] text-on-primary">verified_user</span>
          </div>
          <span className="font-headline-sm text-headline-sm font-bold tracking-tight text-primary">OBLIGRA</span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1.5 rounded-full bg-surface-container-low/70 p-1.5 md:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full px-4 py-2 font-label-md text-label-md text-on-surface-variant transition-all duration-150 hover:bg-surface-container-lowest hover:text-on-surface"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className="hidden items-center justify-center rounded-full px-4 py-2 font-label-md text-label-md text-on-surface-variant transition-all duration-150 hover:bg-surface-container-low hover:text-on-surface sm:inline-flex"
          >
            Log in
          </Link>
          <Link
            to="/signup"
            className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2.5 font-label-md text-label-md text-on-primary shadow-[0_2px_10px_rgba(0,0,0,0.12)] transition-all duration-150 hover:bg-primary-container"
          >
            Get Started
          </Link>
        </div>
      </header>
    </div>
  )
}
