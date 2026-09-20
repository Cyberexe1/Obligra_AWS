import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Input from '../components/ui/Input'
import { notifyDataChanged } from '../lib/dataRefresh'
import { ApiError, submitTextSource } from '../lib/api'
import type { Obligation } from '../lib/api'

type SubmitStatus = 'idle' | 'processing' | 'completed' | 'failed'

export default function AddText() {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<SubmitStatus>('idle')
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [obligations, setObligations] = useState<Obligation[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!content.trim()) return

    setStatus('processing')
    setError(null)
    setObligations(null)

    submitTextSource({ title: title.trim() || undefined, content })
      .then((response) => {
        setStatus('completed')
        setSourceId(response.source_id)
        setObligations(response.obligations ?? [])
        notifyDataChanged()
      })
      .catch((err: unknown) => {
        const message = err instanceof ApiError ? err.message : 'Failed to process the pasted text.'
        setStatus('failed')
        setError(message)
      })
  }

  const handleReset = () => {
    setTitle('')
    setContent('')
    setStatus('idle')
    setSourceId(null)
    setObligations(null)
    setError(null)
  }

  return (
    <section aria-labelledby="add-text-heading" className="space-y-6">
      <div>
        <h2 id="add-text-heading" className="font-headline-md text-headline-md font-bold text-on-surface">
          Add Text
        </h2>
        <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
          Paste a message, email body, or any plain text to identify actionable obligations
          using Amazon Bedrock &mdash; no file upload needed.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-6 shadow-card"
      >
        <Input
          id="source-title"
          type="text"
          label="Title (optional)"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={status === 'processing'}
          placeholder="e.g. Landlord email"
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="source-content" className="font-label-md text-label-md text-on-surface-variant">
            Text
          </label>
          <textarea
            id="source-content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            disabled={status === 'processing'}
            required
            rows={10}
            placeholder="Paste the message text here&hellip;"
            className="block w-full rounded border border-outline-variant/60 bg-surface-container-lowest px-4 py-2.5 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:border-secondary focus:outline-none focus:ring-[3px] focus:ring-secondary/15 disabled:bg-surface-container-low"
          />
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={status === 'processing' || !content.trim()}>
            {status === 'processing' ? 'Processing…' : 'Extract obligations'}
          </Button>
          {(status === 'completed' || status === 'failed') && (
            <Button type="button" variant="secondary" onClick={handleReset}>
              Add another
            </Button>
          )}
        </div>
      </form>

      {status === 'failed' && (
        <div className="rounded-lg border border-error/20 bg-error-container p-4 font-body-md text-body-md text-on-error-container">
          {error || 'Something went wrong while processing this text.'}
        </div>
      )}

      {status === 'completed' && (
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <p className="font-label-md text-label-md font-medium text-on-surface-variant">Obligations (Bedrock)</p>
            <span className="shrink-0 rounded-full bg-[#ecfdf5] px-2.5 py-1 font-label-sm text-label-sm font-medium text-[#047857]">
              Done
            </span>
          </div>

          {sourceId && (
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              Source ID: <span className="break-all">{sourceId}</span>
            </p>
          )}

          <ObligationsTable obligations={obligations ?? []} />

          <p className="mt-3 font-body-sm text-body-sm text-on-surface-variant">
            Saved to DynamoDB.{' '}
            <Link to="/obligations" className="font-semibold text-secondary hover:underline">
              View all obligations
            </Link>
            .
          </p>
        </Card>
      )}
    </section>
  )
}

function ObligationsTable({ obligations }: { obligations: Obligation[] }) {
  if (obligations.length === 0) {
    return (
      <p className="mt-2 font-body-sm text-body-sm text-on-surface-variant">
        No actionable obligations were found in this text.
      </p>
    )
  }

  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[640px] table-auto border-collapse text-left font-body-sm text-body-sm">
        <thead>
          <tr className="border-b border-outline-variant/20 text-on-surface-variant">
            <th scope="col" className="py-2 pr-3 font-label-sm text-label-sm">
              Action
            </th>
            <th scope="col" className="py-2 pr-3 font-label-sm text-label-sm">
              Deadline
            </th>
            <th scope="col" className="py-2 pr-3 font-label-sm text-label-sm">
              Condition
            </th>
            <th scope="col" className="py-2 pr-3 font-label-sm text-label-sm">
              Consequence
            </th>
            <th scope="col" className="py-2 pr-3 font-label-sm text-label-sm">
              Source
            </th>
            <th scope="col" className="py-2 font-label-sm text-label-sm">
              Confidence
            </th>
          </tr>
        </thead>
        <tbody>
          {obligations.map((obligation, index) => (
            <tr key={index} className="border-b border-outline-variant/10 align-top last:border-0">
              <td className="py-2 pr-3 text-on-surface">{obligation.action ?? <NullValue />}</td>
              <td className="py-2 pr-3 text-on-surface-variant">{obligation.deadline ?? <NullValue />}</td>
              <td className="py-2 pr-3 text-on-surface-variant">{obligation.condition ?? <NullValue />}</td>
              <td className="py-2 pr-3 text-on-surface-variant">{obligation.consequence ?? <NullValue />}</td>
              <td className="max-w-xs py-2 pr-3 italic text-on-surface-variant/80">{obligation.source ?? <NullValue />}</td>
              <td className="py-2 text-on-surface-variant">{Math.round(obligation.confidence * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function NullValue() {
  return <span className="text-on-surface-variant/40">&mdash;</span>
}
