import type { ButtonHTMLAttributes, ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'
type ButtonSize = 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  children: ReactNode
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-on-primary shadow-[0_2px_10px_rgba(0,0,0,0.12)] hover:bg-primary-container disabled:hover:bg-primary',
  secondary:
    'bg-surface-container-lowest text-on-surface shadow-sm border border-outline-variant/40 hover:bg-surface-container-low',
  ghost: 'bg-transparent text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: 'px-5 py-2.5 text-label-md font-label-md',
  lg: 'px-7 py-3.5 text-title-md font-title-md',
}

/**
 * Pill-shaped button matching the Stitch design system's button
 * component spec (rounded-full, primary = solid deep navy/black,
 * secondary = white with hairline border, ghost = transparent).
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={[
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-150',
        'hover:scale-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  )
}
