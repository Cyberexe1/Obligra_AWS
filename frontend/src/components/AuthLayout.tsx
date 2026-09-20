import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface AuthLayoutProps {
  title: string
  subtitle: string
  children: ReactNode
  footer: ReactNode
}

/**
 * Shared shell for Login/Signup: same ambient-glow canvas and floating
 * card treatment as the landing page, so auth pages visibly belong to
 * the same product rather than reading as a generic auth screen.
 */
export default function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-surface px-4 py-12">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute left-1/2 top-[-20%] h-[600px] w-[1000px] -translate-x-1/2 rounded-full bg-gradient-to-b from-secondary-fixed/40 via-tertiary-fixed/20 to-transparent opacity-70 blur-[120px]" />
        <div className="absolute bottom-[10%] -right-[10%] h-[500px] w-[500px] rounded-full bg-primary-fixed/30 opacity-50 blur-[140px]" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
            <span className="material-symbols-outlined text-[20px] text-on-primary">verified_user</span>
          </div>
          <span className="font-headline-sm text-headline-sm font-bold tracking-tight text-primary">OBLIGRA</span>
        </Link>

        <div className="rounded-3xl bg-surface-container-lowest p-8 shadow-floating sm:p-10">
          <h1 className="font-headline-md text-headline-md font-bold text-on-surface">{title}</h1>
          <p className="mt-1.5 font-body-md text-body-md text-on-surface-variant">{subtitle}</p>

          <div className="mt-8">{children}</div>
        </div>

        <div className="mt-6 text-center font-body-sm text-body-sm text-on-surface-variant">{footer}</div>
      </div>
    </div>
  )
}
