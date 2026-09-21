import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/ui/Button'
import Input from '../components/ui/Input'
import Card from '../components/ui/Card'
import { notifyDataChanged } from '../lib/dataRefresh'
import {
  ApiError,
  extractObligations,
  fetchDocumentText,
  submitTextSource,
  uploadDocument,
} from '../lib/api'
import type { DocumentUploadResponse, Obligation } from '../lib/api'

const ACCEPTED_TYPES = ['application/pdf', 'image/png', 'image/jpeg']
const ACCEPTED_EXTENSIONS = '.pdf,.png,.jpg,.jpeg'
const MAX_SIZE_MB = 15
const TEXT_POLL_INTERVAL_MS = 1500

type Mode = 'file' | 'text'

type UploadStatus = 'pending' | 'uploading' | 'success' | 'error'
type ExtractionStatus = 'processing' | 'completed' | 'failed' | null
type ObligationsStatus = 'idle' | 'processing' | 'completed' | 'failed'

interface UploadItem {
  id: string
  file: File
  status: UploadStatus
  progress: number
  error?: string
  result?: DocumentUploadResponse
  extractionStatus: ExtractionStatus
  extractedText?: string | null
  extractionError?: string | null
  obligationsStatus: ObligationsStatus
  obligations?: Obligation[] | null
  obligationsError?: string | null
}

type TextSubmitStatus = 'idle' | 'processing' | 'completed' | 'failed'

function isAcceptedFile(file: File): boolean {
  return ACCEPTED_TYPES.includes(file.type)
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Combined "Add a source" page: upload a file (PDF/PNG/JPEG, via Textract)
 * or paste text (via Bedrock directly) — one page, one sidebar entry,
 * toggled with a segmented control. Each mode keeps its own independent
 * state; switching modes does not clear whatever is in progress in the
 * other one.
 */
export default function Upload() {
  const [mode, setMode] = useState<Mode>('file')

  return (
    <section aria-labelledby="add-source-heading" className="space-y-6">
      <div>
        <h2 id="add-source-heading" className="font-headline-md text-headline-md font-bold text-on-surface">
          Add a Source
        </h2>
        <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
          Upload a document or paste text to identify actionable obligations using Amazon Textract and
          Amazon Bedrock.
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Source type"
        className="inline-flex gap-1 rounded-full bg-surface-container-low p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'file'}
          onClick={() => setMode('file')}
          className={[
            'rounded-full px-4 py-2 font-label-md text-label-md font-medium transition-colors',
            mode === 'file'
              ? 'bg-primary text-on-primary shadow-[0_2px_10px_rgba(0,0,0,0.12)]'
              : 'text-on-surface-variant hover:bg-surface-container-lowest',
          ].join(' ')}
        >
          Upload File
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'text'}
          onClick={() => setMode('text')}
          className={[
            'rounded-full px-4 py-2 font-label-md text-label-md font-medium transition-colors',
            mode === 'text'
              ? 'bg-primary text-on-primary shadow-[0_2px_10px_rgba(0,0,0,0.12)]'
              : 'text-on-surface-variant hover:bg-surface-container-lowest',
          ].join(' ')}
        >
          Paste Text
        </button>
      </div>

      {mode === 'file' ? <FileUploadPanel /> : <TextPanel />}
    </section>
  )
}

function FileUploadPanel() {
  const [items, setItems] = useState<UploadItem[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const pollTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    const timers = pollTimers.current
    return () => {
      timers.forEach((timer) => clearTimeout(timer))
      timers.clear()
    }
  }, [])

  const pollExtractionStatusRef = useRef<(itemId: string, documentId: string) => void>(() => {})

  const pollExtractionStatus = useCallback((itemId: string, documentId: string) => {
    fetchDocumentText(documentId)
      .then((response) => {
        setItems((prev) =>
          prev.map((entry) =>
            entry.id === itemId
              ? {
                  ...entry,
                  extractionStatus: response.status,
                  extractedText: response.extracted_text,
                  extractionError: response.error,
                }
              : entry,
          ),
        )

        if (response.status === 'processing') {
          const timer = setTimeout(
            () => pollExtractionStatusRef.current(itemId, documentId),
            TEXT_POLL_INTERVAL_MS,
          )
          pollTimers.current.set(itemId, timer)
        } else {
          pollTimers.current.delete(itemId)
        }
      })
      .catch((err: unknown) => {
        const message = err instanceof ApiError ? err.message : 'Failed to check extraction status.'
        setItems((prev) =>
          prev.map((entry) =>
            entry.id === itemId ? { ...entry, extractionStatus: 'failed', extractionError: message } : entry,
          ),
        )
      })
  }, [])

  useEffect(() => {
    pollExtractionStatusRef.current = pollExtractionStatus
  }, [pollExtractionStatus])

  const startUpload = useCallback(
    (item: UploadItem) => {
      setItems((prev) =>
        prev.map((entry) =>
          entry.id === item.id ? { ...entry, status: 'uploading', progress: 0, extractionStatus: null } : entry,
        ),
      )

      uploadDocument(item.file, (percent) => {
        setItems((prev) =>
          prev.map((entry) => (entry.id === item.id ? { ...entry, progress: percent } : entry)),
        )
      })
        .then((result) => {
          setItems((prev) =>
            prev.map((entry) =>
              entry.id === item.id
                ? { ...entry, status: 'success', progress: 100, result, extractionStatus: 'processing' }
                : entry,
            ),
          )
          pollExtractionStatus(item.id, result.document_id)
        })
        .catch((err: unknown) => {
          const message = err instanceof ApiError ? err.message : 'Something went wrong during upload.'
          setItems((prev) =>
            prev.map((entry) => (entry.id === item.id ? { ...entry, status: 'error', error: message } : entry)),
          )
        })
    },
    [pollExtractionStatus],
  )

  const runObligationExtraction = useCallback((itemId: string, documentId: string) => {
    setItems((prev) =>
      prev.map((entry) => (entry.id === itemId ? { ...entry, obligationsStatus: 'processing' } : entry)),
    )

    extractObligations(documentId)
      .then((response) => {
        setItems((prev) =>
          prev.map((entry) =>
            entry.id === itemId
              ? { ...entry, obligationsStatus: 'completed', obligations: response.obligations }
              : entry,
          ),
        )
        notifyDataChanged()
      })
      .catch((err: unknown) => {
        const message = err instanceof ApiError ? err.message : 'Failed to extract obligations.'
        setItems((prev) =>
          prev.map((entry) =>
            entry.id === itemId ? { ...entry, obligationsStatus: 'failed', obligationsError: message } : entry,
          ),
        )
      })
  }, [])

  const addFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return

      const newItems: UploadItem[] = Array.from(fileList).map((file) => {
        const id = `${file.name}-${file.size}-${crypto.randomUUID()}`

        if (!isAcceptedFile(file)) {
          return {
            id,
            file,
            status: 'error',
            progress: 0,
            error: 'Unsupported file type. Only PDF, PNG, and JPG/JPEG are allowed.',
            extractionStatus: null,
            obligationsStatus: 'idle',
          }
        }

        if (file.size > MAX_SIZE_MB * 1024 * 1024) {
          return {
            id,
            file,
            status: 'error',
            progress: 0,
            error: `File exceeds the maximum allowed size of ${MAX_SIZE_MB} MB.`,
            extractionStatus: null,
            obligationsStatus: 'idle',
          }
        }

        return { id, file, status: 'pending', progress: 0, extractionStatus: null, obligationsStatus: 'idle' }
      })

      setItems((prev) => [...prev, ...newItems])

      newItems
        .filter((item) => item.status === 'pending')
        .forEach((item) => startUpload(item))
    },
    [startUpload],
  )

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(false)
    addFiles(event.dataTransfer.files)
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => setIsDragging(false)

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    addFiles(event.target.files)
    event.target.value = ''
  }

  const retryUpload = (item: UploadItem) => {
    if (!isAcceptedFile(item.file) || item.file.size > MAX_SIZE_MB * 1024 * 1024) return
    startUpload(item)
  }

  return (
    <div className="space-y-6">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={[
          'rounded-lg border-2 border-dashed p-12 text-center transition-colors',
          isDragging ? 'border-secondary bg-secondary-fixed/20' : 'border-outline-variant bg-surface-container-lowest',
        ].join(' ')}
      >
        <p className="font-title-md text-title-md font-medium text-on-surface">Drag and drop files here</p>
        <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
          PDF, PNG, or JPG/JPEG &middot; up to {MAX_SIZE_MB} MB
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-6 inline-flex items-center rounded-full bg-primary px-5 py-2.5 font-label-md text-label-md font-medium text-on-primary shadow-[0_2px_10px_rgba(0,0,0,0.12)] transition-all hover:bg-primary-container"
        >
          Select files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS}
          onChange={handleInputChange}
          className="sr-only"
          aria-label="Select files to upload"
        />
      </div>

      {items.length > 0 && (
        <ul className="space-y-3" aria-label="Upload queue">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-outline-variant/20 bg-surface-container-lowest p-4 shadow-card"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-title-md text-title-md font-medium text-on-surface">{item.file.name}</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">{formatBytes(item.file.size)}</p>
                </div>
                <StatusBadge status={item.status} />
              </div>

              {item.status === 'uploading' && (
                <div className="mt-3">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
                    <div
                      className="h-full rounded-full bg-secondary transition-all"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                  <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{item.progress}%</p>
                </div>
              )}

              {item.status === 'success' && item.result && (
                <dl className="mt-3 grid grid-cols-1 gap-1 font-body-sm text-body-sm text-on-surface-variant sm:grid-cols-2">
                  <div>
                    <dt className="inline font-medium text-on-surface">Document ID: </dt>
                    <dd className="inline break-all">{item.result.document_id}</dd>
                  </div>
                  <div>
                    <dt className="inline font-medium text-on-surface">S3 key: </dt>
                    <dd className="inline break-all">{item.result.s3_key}</dd>
                  </div>
                </dl>
              )}

              {item.status === 'success' && (
                <div className="mt-4 border-t border-outline-variant/10 pt-3">
                  <div className="flex items-center justify-between">
                    <p className="font-label-md text-label-md font-medium text-on-surface-variant">Extracted text (Textract)</p>
                    <ExtractionBadge status={item.extractionStatus} />
                  </div>

                  {item.extractionStatus === 'processing' && (
                    <p className="mt-2 font-body-sm text-body-sm text-on-surface-variant">Running text extraction&hellip;</p>
                  )}

                  {item.extractionStatus === 'completed' && (
                    <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-surface-container-low p-3 font-body-sm text-body-sm text-on-surface">
                      {item.extractedText || '(No text detected in this document.)'}
                    </pre>
                  )}

                  {item.extractionStatus === 'failed' && (
                    <p className="mt-2 font-body-sm text-body-sm text-error">
                      {item.extractionError || 'Text extraction failed.'}
                    </p>
                  )}
                </div>
              )}

              {item.status === 'success' && item.extractionStatus === 'completed' && (
                <div className="mt-4 border-t border-outline-variant/10 pt-3">
                  <div className="flex items-center justify-between">
                    <p className="font-label-md text-label-md font-medium text-on-surface-variant">Obligations (Bedrock)</p>
                    <div className="flex items-center gap-2">
                      <ObligationsBadge status={item.obligationsStatus} />
                      {item.obligationsStatus !== 'processing' && item.result && (
                        <button
                          type="button"
                          onClick={() => runObligationExtraction(item.id, item.result!.document_id)}
                          className="rounded-full border border-outline-variant/40 px-2.5 py-1 font-label-sm text-label-sm font-medium text-on-surface-variant hover:bg-surface-container-low"
                        >
                          {item.obligationsStatus === 'completed' ? 'Re-run' : 'Extract obligations'}
                        </button>
                      )}
                    </div>
                  </div>

                  {item.obligationsStatus === 'processing' && (
                    <p className="mt-2 font-body-sm text-body-sm text-on-surface-variant">Analyzing document with Bedrock&hellip;</p>
                  )}

                  {item.obligationsStatus === 'failed' && (
                    <p className="mt-2 font-body-sm text-body-sm text-error">
                      {item.obligationsError || 'Obligation extraction failed.'}
                    </p>
                  )}

                  {item.obligationsStatus === 'completed' && (
                    <>
                      <ObligationsTable obligations={item.obligations ?? []} />
                      <p className="mt-2 font-body-sm text-body-sm text-on-surface-variant">
                        Saved to DynamoDB.{' '}
                        <Link to="/obligations" className="font-semibold text-secondary hover:underline">
                          View all obligations
                        </Link>
                        .
                      </p>
                    </>
                  )}
                </div>
              )}

              {item.status === 'error' && (
                <div className="mt-3 flex items-center justify-between gap-3">
                  <p className="font-body-sm text-body-sm text-error">{item.error}</p>
                  {isAcceptedFile(item.file) && item.file.size <= MAX_SIZE_MB * 1024 * 1024 && (
                    <button
                      type="button"
                      onClick={() => retryUpload(item)}
                      className="shrink-0 rounded-full border border-outline-variant/40 px-3 py-1 font-label-sm text-label-sm font-medium text-on-surface-variant hover:bg-surface-container-low"
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function TextPanel() {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<TextSubmitStatus>('idle')
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
    <div className="space-y-6">
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
    </div>
  )
}

function ObligationsBadge({ status }: { status: ObligationsStatus }) {
  if (status === 'idle') return null

  const styles: Record<Exclude<ObligationsStatus, 'idle'>, string> = {
    processing: 'bg-secondary-fixed text-on-secondary-fixed',
    completed: 'bg-[#ecfdf5] text-[#047857]',
    failed: 'bg-[#fff1f2] text-[#be123c]',
  }
  const labels: Record<Exclude<ObligationsStatus, 'idle'>, string> = {
    processing: 'Analyzing…',
    completed: 'Done',
    failed: 'Failed',
  }

  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 font-label-sm text-label-sm font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

function ObligationsTable({ obligations }: { obligations: Obligation[] }) {
  if (obligations.length === 0) {
    return (
      <p className="mt-2 font-body-sm text-body-sm text-on-surface-variant">
        No actionable obligations were found.
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

function ExtractionBadge({ status }: { status: ExtractionStatus }) {
  if (!status) return null

  const styles: Record<Exclude<ExtractionStatus, null>, string> = {
    processing: 'bg-secondary-fixed text-on-secondary-fixed',
    completed: 'bg-[#ecfdf5] text-[#047857]',
    failed: 'bg-[#fff1f2] text-[#be123c]',
  }
  const labels: Record<Exclude<ExtractionStatus, null>, string> = {
    processing: 'Extracting…',
    completed: 'Extracted',
    failed: 'Failed',
  }

  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 font-label-sm text-label-sm font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}

function StatusBadge({ status }: { status: UploadStatus }) {
  const styles: Record<UploadStatus, string> = {
    pending: 'bg-surface-container-high text-on-surface-variant',
    uploading: 'bg-secondary-fixed text-on-secondary-fixed',
    success: 'bg-[#ecfdf5] text-[#047857]',
    error: 'bg-[#fff1f2] text-[#be123c]',
  }
  const labels: Record<UploadStatus, string> = {
    pending: 'Pending',
    uploading: 'Uploading',
    success: 'Uploaded',
    error: 'Failed',
  }

  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 font-label-sm text-label-sm font-medium ${styles[status]}`}>
      {labels[status]}
    </span>
  )
}
