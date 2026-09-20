import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  /** Rendered inside the input's right edge, e.g. a show/hide password toggle button. */
  trailing?: React.ReactNode
}

/**
 * Text input matching the Stitch design's input spec: white background,
 * hairline border, focus ring in the secondary/accent color.
 */
const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, trailing, id, className = '', ...rest },
  ref,
) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="font-label-md text-label-md text-on-surface-variant">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          ref={ref}
          id={id}
          className={[
            'block w-full rounded bg-surface-container-lowest px-4 py-2.5 font-body-md text-body-md text-on-surface',
            'border border-outline-variant/60 placeholder:text-on-surface-variant/50',
            'focus:border-secondary focus:outline-none focus:ring-[3px] focus:ring-secondary/15',
            'disabled:bg-surface-container-low disabled:cursor-not-allowed',
            trailing ? 'pr-11' : '',
            error ? 'border-error focus:border-error focus:ring-error/15' : '',
            className,
          ].join(' ')}
          aria-invalid={error ? true : undefined}
          {...rest}
        />
        {trailing && <div className="absolute inset-y-0 right-0 flex items-center pr-3">{trailing}</div>}
      </div>
      {error && (
        <p role="alert" className="font-body-sm text-body-sm text-error">
          {error}
        </p>
      )}
    </div>
  )
})

export default Input
