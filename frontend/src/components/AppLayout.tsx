import type { ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/useAuth'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: 'space_dashboard' },
  { to: '/sources', label: 'Sources', icon: 'inbox' },
  { to: '/obligations', label: 'Obligations', icon: 'task_alt' },
  { to: '/graph', label: 'Obligation Graph', icon: 'hub' },
  { to: '/risks', label: 'Risks', icon: 'security' },
]

function navLinkClasses(isActive: boolean) {
  return [
    'flex items-center gap-3 rounded-full px-4 py-2.5 font-label-md text-label-md font-medium transition-all duration-150',
    isActive
      ? 'bg-primary text-on-primary shadow-[0_2px_10px_rgba(0,0,0,0.12)]'
      : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface',
  ].join(' ')
}

interface AppLayoutProps {
  children: ReactNode
}

/**
 * Authenticated app shell: rounded sidebar (desktop) / top bar (mobile),
 * matching the Stitch design's rounded, pill-nav visual language while
 * remaining the app's real navigation (Dashboard/Sources/Obligations/
 * Graph/Risks), distinct from the public landing page's marketing nav.
 */
export default function AppLayout({ children }: AppLayoutProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface text-on-surface md:flex-row">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface-container-lowest focus:px-3 focus:py-2 focus:shadow-card"
      >
        Skip to main content
      </a>

      <aside className="flex flex-col gap-4 border-b border-outline-variant/20 bg-surface-container-lowest p-4 md:h-screen md:w-72 md:border-b-0 md:border-r md:p-6">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
            <span className="material-symbols-outlined text-[20px] text-on-primary">verified_user</span>
          </div>
          <span className="font-headline-sm text-headline-sm font-bold tracking-tight text-primary">OBLIGRA</span>
        </div>

        <nav aria-label="Primary" className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => navLinkClasses(isActive)}>
              <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex flex-col gap-2 border-t border-outline-variant/20 pt-4">
          {user && (
            <div className="flex items-center gap-3 rounded-full px-3 py-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-on-primary">
                <span className="material-symbols-outlined text-[16px]">person</span>
              </div>
              <div className="min-w-0">
                <p className="truncate font-label-md text-label-md font-semibold text-on-surface">{user.name}</p>
                <p className="truncate font-body-sm text-body-sm text-on-surface-variant">{user.email}</p>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-3 rounded-full px-4 py-2.5 font-label-md text-label-md font-medium text-on-surface-variant transition-all duration-150 hover:bg-surface-container-low hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
            Log out
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <main id="main-content" className="flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
          {children}
        </main>

        <footer className="border-t border-outline-variant/20 px-4 py-4 text-center font-body-sm text-body-sm text-on-surface-variant sm:px-6">
          &copy; {new Date().getFullYear()} OBLIGRA. All rights reserved.
        </footer>
      </div>
    </div>
  )
}
