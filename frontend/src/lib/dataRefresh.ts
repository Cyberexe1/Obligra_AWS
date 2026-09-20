/**
 * A minimal pub/sub signal so pages that mutate obligation-producing
 * data (Upload, Add Text) can tell other pages that display it
 * (Dashboard, Sources, Risks, Obligations) to refetch — without
 * introducing a query library or polling. Deliberately tiny: this is
 * not a cache, it carries no data, it only says "something changed, go
 * refetch from the real API."
 *
 * Usage: call `notifyDataChanged()` after a source/obligation is
 * successfully created; call `useDataRefreshSignal(callback)` in any
 * page that should react to that by re-running its own fetch.
 */
import { useEffect } from 'react'

type Listener = () => void

const listeners = new Set<Listener>()

export function notifyDataChanged(): void {
  for (const listener of listeners) listener()
}

export function useDataRefreshSignal(onChange: () => void): void {
  useEffect(() => {
    listeners.add(onChange)
    return () => {
      listeners.delete(onChange)
    }
  }, [onChange])
}
