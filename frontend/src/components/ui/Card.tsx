import type { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  /** Elevation level per the Stitch design's shadow scale. */
  elevation?: 'card' | 'floating' | 'none'
}

/**
 * Standard content card: white surface, 16px radius, hairline border,
 * matching the Stitch design's "Cards & Analytical Widgets" spec.
 */
export default function Card({ children, elevation = 'card', className = '', ...rest }: CardProps) {
  const shadowClass = elevation === 'none' ? '' : elevation === 'floating' ? 'shadow-floating' : 'shadow-card'

  return (
    <div
      className={[
        'rounded-lg border border-outline-variant/20 bg-surface-container-lowest',
        shadowClass,
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </div>
  )
}
