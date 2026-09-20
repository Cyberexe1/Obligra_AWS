import { Navigate, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../lib/useAuth'

interface ProtectedRouteProps {
  children: ReactNode
}

/**
 * Redirects to /login if there's no authenticated user. While the
 * initial token check (validating a stored token against the backend on
 * page load) is in flight, renders nothing rather than briefly flashing
 * protected content or the login page.
 */
export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-400">Loading&hellip;</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
