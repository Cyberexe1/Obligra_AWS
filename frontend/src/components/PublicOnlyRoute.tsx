import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../lib/useAuth'

interface PublicOnlyRouteProps {
  children: ReactNode
}

/**
 * Redirects an already-authenticated user away from `/login`/`/signup`
 * to `/dashboard` instead of showing them the auth form again. Mirrors
 * `ProtectedRoute`'s loading-state handling so there's no flash of the
 * login form while the initial token check is still in flight.
 */
export default function PublicOnlyRoute({ children }: PublicOnlyRouteProps) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <p className="font-body-md text-body-md text-on-surface-variant">Loading&hellip;</p>
      </div>
    )
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
