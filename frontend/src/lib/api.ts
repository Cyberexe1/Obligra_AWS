export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

const TOKEN_STORAGE_KEY = 'obligra_access_token'

/**
 * A callback invoked whenever an authenticated request comes back with a
 * 401 (missing/invalid/expired token). Set by `AuthContext` so a global
 * "your session expired" logout can happen from any API call, not just
 * ones the UI explicitly awaits.
 */
let onUnauthorized: (() => void) | null = null

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY)
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
}

function authHeaders(): HeadersInit {
  const token = getStoredToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * Wraps `fetch` to attach the stored bearer token to every request and to
 * trigger the global unauthorized handler on a 401 response. All
 * authenticated API calls in this module go through this instead of
 * calling `fetch` directly, so token attachment and session-expiry
 * handling live in exactly one place.
 */
async function authorizedFetch(url: string | URL, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    headers: { ...authHeaders(), ...init.headers },
  })

  if (response.status === 401) {
    onUnauthorized?.()
  }

  return response
}

export interface DocumentUploadResponse {
  document_id: string
  filename: string
  s3_key: string
  status: string
}

export interface DocumentTextResponse {
  document_id: string
  filename: string
  extracted_text: string | null
  status: 'processing' | 'completed' | 'failed'
  error: string | null
}

export interface Obligation {
  action: string | null
  deadline: string | null
  condition: string | null
  source: string | null
  consequence: string | null
  confidence: number
}

export interface ObligationExtractionResponse {
  document_id: string
  filename: string
  status: string
  obligations: Obligation[] | null
  error: string | null
}

export type ObligationStatus = 'pending' | 'in_progress' | 'completed' | 'blocked'

export interface StoredObligation extends Obligation {
  obligation_id: string
  source_id: string | null
  document_id: string | null
  status: ObligationStatus
  created_at: string
}

export interface ObligationListResponse {
  obligations: StoredObligation[]
  count: number
}

export type RelationshipType = 'depends_on' | 'blocks' | 'follows' | 'conditional_on'

export interface GraphNode {
  id: string
  label: string | null
  status: ObligationStatus
  deadline: string | null
  confidence: number
}

export interface GraphEdge {
  id: string
  source: string
  target: string
  type: RelationshipType
  label: string
  reason: string
  confidence: number
}

export interface ObligationGraphResponse {
  nodes: GraphNode[]
  edges: GraphEdge[]
  cycles_detected: string[][]
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface PriorityItem {
  obligation_id: string
  action: string | null
  risk_level: RiskLevel
  reason: string
  blocked_count: number
  days_remaining: number | null
  priority_score: number
}

export interface PrioritiesResponse {
  priorities: PriorityItem[]
  count: number
}

export interface ObligationRisk {
  obligation_id: string
  action: string | null
  risk_level: RiskLevel
  reason: string
  blocked_count: number
  days_remaining: number | null
}

export interface RisksResponse {
  risks: ObligationRisk[]
  count: number
}

export interface User {
  user_id: string
  name: string
  email: string
  created_at: string
}

export interface SignupRequest {
  name: string
  email: string
  password: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
  expires_in_minutes: number
  user: User
}

export interface DocumentSummary {
  document_id: string
  filename: string
  status: string
  obligations_status: string | null
  created_at: string
}

export interface DocumentListResponse {
  documents: DocumentSummary[]
  count: number
}

export type SourceType = 'file' | 'text' | 'email' | 'whatsapp' | 'telegram'

export type SourceProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface StoredSource {
  source_id: string
  user_id: string
  source_type: SourceType
  title: string | null
  content: string | null
  original_reference: string | null
  created_at: string
  processing_status: SourceProcessingStatus
}

export interface SourceListResponse {
  sources: StoredSource[]
  count: number
}

export interface TextSourceRequest {
  title?: string
  content: string
}

export interface TextSourceResponse {
  source_id: string
  status: SourceProcessingStatus
  obligations: Obligation[] | null
  error: string | null
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/**
 * Creates a new account and returns an access token for it.
 */
export async function signup(body: SignupRequest): Promise<TokenResponse> {
  const response = await fetch(`${API_BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const responseBody = await response.json().catch(() => null)

  if (!response.ok) {
    const detail =
      responseBody && typeof responseBody === 'object' && 'detail' in responseBody
        ? String((responseBody as { detail: unknown }).detail)
        : `Signup failed (status ${response.status}).`
    throw new ApiError(detail, response.status)
  }

  return responseBody as TokenResponse
}

/**
 * Authenticates with email + password and returns an access token.
 */
export async function login(body: LoginRequest): Promise<TokenResponse> {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const responseBody = await response.json().catch(() => null)

  if (!response.ok) {
    const detail =
      responseBody && typeof responseBody === 'object' && 'detail' in responseBody
        ? String((responseBody as { detail: unknown }).detail)
        : `Login failed (status ${response.status}).`
    throw new ApiError(detail, response.status)
  }

  return responseBody as TokenResponse
}

/**
 * Fetches the profile of the currently authenticated user (validates the
 * stored token against the backend).
 */
export async function fetchCurrentUser(): Promise<User> {
  const response = await authorizedFetch(`${API_BASE_URL}/api/auth/me`)
  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const detail =
      body && typeof body === 'object' && 'detail' in body
        ? String((body as { detail: unknown }).detail)
        : `Failed to fetch the current user (status ${response.status}).`
    throw new ApiError(detail, response.status)
  }

  return body as User
}

/**
 * Fetches documents uploaded by the current user.
 */
export async function fetchDocuments(): Promise<DocumentListResponse> {
  const response = await authorizedFetch(`${API_BASE_URL}/api/documents`)
  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const detail =
      body && typeof body === 'object' && 'detail' in body
        ? String((body as { detail: unknown }).detail)
        : `Failed to fetch documents (status ${response.status}).`
    throw new ApiError(detail, response.status)
  }

  return body as DocumentListResponse
}

/**
 * Uploads a single file to the documents endpoint using XMLHttpRequest so
 * we can report upload progress (the fetch API has no progress events for
 * request bodies). Attaches the stored bearer token like every other
 * authenticated request.
 */
export function uploadDocument(
  file: File,
  onProgress: (percent: number) => void,
): Promise<DocumentUploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const formData = new FormData()
    formData.append('file', file)

    xhr.open('POST', `${API_BASE_URL}/api/documents/upload`)

    const token = getStoredToken()
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    }

    xhr.onload = () => {
      let body: unknown
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        body = null
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100)
        resolve(body as DocumentUploadResponse)
        return
      }

      if (xhr.status === 401) {
        onUnauthorized?.()
      }

      const detail =
        body && typeof body === 'object' && 'detail' in body
          ? String((body as { detail: unknown }).detail)
          : `Upload failed with status ${xhr.status}.`
      reject(new ApiError(detail, xhr.status))
    }

    xhr.onerror = () => {
      reject(new ApiError('Network error while uploading the file.', 0))
    }

    xhr.send(formData)
  })
}

/**
 * Fetches the current extraction status/text for a previously uploaded
 * document.
 */
export async function fetchDocumentText(documentId: string): Promise<DocumentTextResponse> {
  const response = await authorizedFetch(`${API_BASE_URL}/api/documents/${documentId}/text`)
  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const detail =
      body && typeof body === 'object' && 'detail' in body
        ? String((body as { detail: unknown }).detail)
        : `Failed to fetch extracted text (status ${response.status}).`
    throw new ApiError(detail, response.status)
  }

  return body as DocumentTextResponse
}

/**
 * Triggers AI obligation extraction (Amazon Bedrock) on a document whose
 * text extraction has already completed. Validated obligations are
 * persisted to DynamoDB by the backend as part of this call.
 */
export async function extractObligations(documentId: string): Promise<ObligationExtractionResponse> {
  const response = await authorizedFetch(`${API_BASE_URL}/api/documents/${documentId}/extract-obligations`, {
    method: 'POST',
  })
  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const detail =
      body && typeof body === 'object' && 'detail' in body
        ? String((body as { detail: unknown }).detail)
        : `Failed to extract obligations (status ${response.status}).`
    throw new ApiError(detail, response.status)
  }

  return body as ObligationExtractionResponse
}

/**
 * Fetches obligations persisted in DynamoDB, optionally filtered to a
 * single document and/or source.
 */
export async function fetchObligations(documentId?: string, sourceId?: string): Promise<ObligationListResponse> {
  const url = new URL(`${API_BASE_URL}/api/obligations`)
  if (documentId) url.searchParams.set('document_id', documentId)
  if (sourceId) url.searchParams.set('source_id', sourceId)

  const response = await authorizedFetch(url)
  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const detail =
      body && typeof body === 'object' && 'detail' in body
        ? String((body as { detail: unknown }).detail)
        : `Failed to fetch obligations (status ${response.status}).`
    throw new ApiError(detail, response.status)
  }

  return body as ObligationListResponse
}

/**
 * Fetches sources (files, pasted text, ...) created by the current user.
 */
export async function fetchSources(): Promise<SourceListResponse> {
  const response = await authorizedFetch(`${API_BASE_URL}/api/sources`)
  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const detail =
      body && typeof body === 'object' && 'detail' in body
        ? String((body as { detail: unknown }).detail)
        : `Failed to fetch sources (status ${response.status}).`
    throw new ApiError(detail, response.status)
  }

  return body as SourceListResponse
}

/**
 * Submits pasted plain text for obligation extraction. Runs through the
 * same Bedrock extraction pipeline as file uploads, but skips Textract
 * since the input is already plain text. The resulting obligations are
 * persisted to DynamoDB by the backend as part of this call.
 */
export async function submitTextSource(body: TextSourceRequest): Promise<TextSourceResponse> {
  const response = await authorizedFetch(`${API_BASE_URL}/api/sources/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const responseBody = await response.json().catch(() => null)

  if (!response.ok) {
    const detail =
      responseBody && typeof responseBody === 'object' && 'detail' in responseBody
        ? String((responseBody as { detail: unknown }).detail)
        : `Failed to submit text (status ${response.status}).`
    throw new ApiError(detail, response.status)
  }

  return responseBody as TextSourceResponse
}

/**
 * Fetches the obligation dependency graph (nodes + relationship edges)
 * persisted in DynamoDB.
 */
export async function fetchObligationGraph(): Promise<ObligationGraphResponse> {
  const response = await authorizedFetch(`${API_BASE_URL}/api/obligations/graph`)
  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const detail =
      body && typeof body === 'object' && 'detail' in body
        ? String((body as { detail: unknown }).detail)
        : `Failed to fetch obligation graph (status ${response.status}).`
    throw new ApiError(detail, response.status)
  }

  return body as ObligationGraphResponse
}

/**
 * Fetches rule-based risk assessments for the current user's at-risk
 * obligations (overdue, approaching deadline, blocked, or blocking
 * others).
 */
export async function fetchObligationRisks(): Promise<RisksResponse> {
  const response = await authorizedFetch(`${API_BASE_URL}/api/obligations/risks`)
  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const detail =
      body && typeof body === 'object' && 'detail' in body
        ? String((body as { detail: unknown }).detail)
        : `Failed to fetch obligation risks (status ${response.status}).`
    throw new ApiError(detail, response.status)
  }

  return body as RisksResponse
}

/**
 * Fetches the obligations that should be addressed first, ranked by a
 * transparent priority score (risk level, deadline urgency, and
 * downstream blocking impact).
 */
export async function fetchObligationPriorities(limit?: number): Promise<PrioritiesResponse> {
  const url = new URL(`${API_BASE_URL}/api/obligations/priorities`)
  if (limit) url.searchParams.set('limit', String(limit))

  const response = await authorizedFetch(url)
  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const detail =
      body && typeof body === 'object' && 'detail' in body
        ? String((body as { detail: unknown }).detail)
        : `Failed to fetch obligation priorities (status ${response.status}).`
    throw new ApiError(detail, response.status)
  }

  return body as PrioritiesResponse
}

/**
 * Updates the status of a persisted obligation.
 */
export async function updateObligationStatus(
  obligationId: string,
  newStatus: ObligationStatus,
): Promise<StoredObligation> {
  const response = await authorizedFetch(`${API_BASE_URL}/api/obligations/${obligationId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: newStatus }),
  })
  const body = await response.json().catch(() => null)

  if (!response.ok) {
    const detail =
      body && typeof body === 'object' && 'detail' in body
        ? String((body as { detail: unknown }).detail)
        : `Failed to update obligation status (status ${response.status}).`
    throw new ApiError(detail, response.status)
  }

  return body as StoredObligation
}
