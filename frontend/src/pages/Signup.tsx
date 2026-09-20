import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '../components/AuthLayout'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import { ApiError } from '../lib/api'
import { useAuth } from '../lib/useAuth'

const MIN_PASSWORD_LENGTH = 8

export default function Signup() {
  const { signup } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsSubmitting(true)
    try {
      await signup({ name, email, password })
      navigate('/dashboard', { replace: true })
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : 'Failed to create your account. Please try again.'
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Get started tracking your obligations."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-secondary hover:underline">
            Log in
          </Link>
          <span className="mx-2 text-outline-variant">&middot;</span>
          <Link to="/" className="text-on-surface-variant hover:underline">
            Back to home
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <Input
          id="name"
          type="text"
          label="Name"
          autoComplete="name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />

        <Input
          id="email"
          type="email"
          label="Email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <Input
          id="password"
          type={showPassword ? 'text' : 'password'}
          label="Password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={72}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              className="text-on-surface-variant hover:text-on-surface"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              <span className="material-symbols-outlined text-[20px]">
                {showPassword ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          }
        />
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          At least {MIN_PASSWORD_LENGTH} characters.
        </p>

        <Input
          id="confirm-password"
          type={showPassword ? 'text' : 'password'}
          label="Confirm password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />

        {error && (
          <p role="alert" className="font-body-sm text-body-sm text-error">
            {error}
          </p>
        )}

        <Button type="submit" disabled={isSubmitting} fullWidth size="md">
          {isSubmitting ? 'Creating account…' : 'Sign up'}
        </Button>
      </form>
    </AuthLayout>
  )
}
