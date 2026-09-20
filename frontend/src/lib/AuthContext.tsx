import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  clearStoredToken,
  fetchCurrentUser,
  getStoredToken,
  login as loginRequest,
  setStoredToken,
  setUnauthorizedHandler,
  signup as signupRequest,
} from './api'
import type { LoginRequest, SignupRequest, User } from './api'
import { AuthContext } from './authContextDefinition'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const logout = useCallback(() => {
    clearStoredToken()
    setUser(null)
  }, [])

  // On mount, if a token is already stored (from a previous session),
  // validate it against the backend and load the user — this is what
  // keeps a user logged in across page reloads until the token expires.
  useEffect(() => {
    setUnauthorizedHandler(logout)

    let cancelled = false

    async function run() {
      const token = getStoredToken()
      if (!token) {
        setIsLoading(false)
        return
      }

      try {
        const currentUser = await fetchCurrentUser()
        if (cancelled) return
        setUser(currentUser)
      } catch {
        if (cancelled) return
        clearStoredToken()
        setUser(null)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void run()

    return () => {
      cancelled = true
      setUnauthorizedHandler(null)
    }
  }, [logout])

  const login = useCallback(async (credentials: LoginRequest) => {
    const response = await loginRequest(credentials)
    setStoredToken(response.access_token)
    setUser(response.user)
  }, [])

  const signup = useCallback(async (details: SignupRequest) => {
    const response = await signupRequest(details)
    setStoredToken(response.access_token)
    setUser(response.user)
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isAuthenticated: user !== null, login, signup, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}
