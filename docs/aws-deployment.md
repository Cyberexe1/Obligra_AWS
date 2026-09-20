# OBLIGRA — AWS Production Deployment Guide

This document describes how OBLIGRA is intended to be deployed to AWS. It
does not perform any deployment — it is a reference for whoever runs the
actual deployment steps.

## Architecture

```text
User
  ↓
CloudFront
  ↓
React/Vite frontend (static assets in S3 or served directly by CloudFront)
  ↓
AWS App Runner
  ↓
FastAPI backend
  ↓
┌──────────────┬──────────────┬──────────────┐
│     S3       │  DynamoDB    │   Bedrock    │
│              │              │              │
│   Textract   │              │              │
└──────────────┴──────────────┴──────────────┘
```

- **CloudFront** serves the built frontend (static files produced by
  `npm run build`) and is the public entry point for browsers.
- **App Runner** runs the FastAPI backend as a long-running HTTP service,
  built from source (no Dockerfile currently exists in this repo — App
  Runner can build directly from a Python runtime + start command, or a
  Dockerfile can be added later if containerization becomes necessary;
  neither approach requires further code changes).
- **S3** stores uploaded documents/images (`app/services/s3_client.py`).
- **DynamoDB** stores users, documents, sources, obligations, and
  obligation relationships (`app/services/dynamodb_client.py`,
  `app/services/user_store.py`, `app/services/telegram_link_store.py`).
- **Textract** performs OCR on uploaded PDFs/images
  (`app/services/textract_client.py`).
- **Bedrock** performs obligation extraction and dependency detection
  from extracted/pasted text (`app/services/bedrock_client.py`,
  `app/services/dependency_detector.py`).

The backend never talks to CloudFront directly, and the frontend never
talks to AWS services directly — every AWS interaction goes through the
FastAPI backend.

---

## 1. Frontend build

```powershell
cd frontend
npm ci
npm run build
```

This produces `frontend/dist/` — a static site (`index.html` + hashed
CSS/JS assets) ready to upload to S3 or serve via CloudFront.

**Critical: set `VITE_API_BASE_URL` before building.** Vite bakes
`import.meta.env.VITE_API_BASE_URL` into the compiled JavaScript at
**build time**, not at runtime. If `frontend/.env` (or the CI
environment) has `VITE_API_BASE_URL` unset or pointing at
`http://localhost:8000`, the production bundle will call `localhost`
from every user's browser and nothing will work. Before running
`npm run build` for a real deployment:

```powershell
# frontend/.env (not committed — see frontend/.env.example)
VITE_API_BASE_URL=https://<your-app-runner-service-url-or-custom-domain>
```

There is no other place in the frontend that hardcodes a backend URL —
every API call in `frontend/src/lib/api.ts` builds its URL from this one
constant.

---

## 2. Backend startup command

There is no Dockerfile, Procfile, or `apprunner.yaml` in this repository
today. App Runner supports deploying directly from a source repository
with a configured runtime and start command — use:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Run from the `backend/` directory, with `backend/` as the working
directory (so the `app` package resolves) and dependencies installed
from `backend/requirements.txt`:

```bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

- `--host 0.0.0.0` is required — binding to `127.0.0.1`/`localhost`
  would make the service unreachable from outside its own container.
- `$PORT` is provided by the runtime (App Runner sets this
  automatically for source-based deployments using the Python
  runtime). The application code itself never reads or hardcodes a
  port — this is entirely a `uvicorn` CLI argument, so no code changes
  are needed to support whatever port the runtime assigns.
- No `if __name__ == "__main__":` entrypoint exists in `app/main.py` by
  design — `uvicorn` is invoked externally, which is the standard
  pattern for both local development and production.

---

## 3. Required environment variables

Only variables actually read by `app/config.py` are listed. Secrets are
never committed — see `backend/.env.example` for the full template with
blank secret fields.

| Variable | Required? | Default | Notes |
|---|---|---|---|
| `JWT_SECRET_KEY` | **Yes** | none | App refuses to start without it. Generate with `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Rotating it invalidates all existing sessions. |
| `AWS_REGION` | No | `us-east-1` | Region for S3/DynamoDB/Textract/Bedrock. |
| `S3_BUCKET_NAME` | Yes (for uploads to work) | `""` | Must exist and be writable by the execution role. |
| `S3_UPLOAD_PREFIX` | No | `uploads/` | |
| `MAX_UPLOAD_SIZE_MB` | No | `15` | |
| `DYNAMODB_USERS_TABLE` | No | `obligra-users` | |
| `DYNAMODB_DOCUMENTS_TABLE` | No | `obligra-documents` | |
| `DYNAMODB_OBLIGATIONS_TABLE` | No | `obligra-obligations` | |
| `DYNAMODB_OBLIGATION_RELATIONSHIPS_TABLE` (alias: `DYNAMODB_RELATIONSHIPS_TABLE`) | No | `obligra-obligation-relationships` | Either env var name works. |
| `DYNAMODB_SOURCES_TABLE` | No | `obligra-sources` | |
| `DYNAMODB_TELEGRAM_LINKS_TABLE` | No | `obligra-telegram-links` | |
| `DYNAMODB_TELEGRAM_LINK_CODES_TABLE` | No | `obligra-telegram-link-codes` | |
| `BEDROCK_MODEL_ID` | No | `amazon.nova-pro-v1:0` | Must be enabled in the target AWS account/region's Bedrock model access page. |
| `BEDROCK_MAX_TOKENS` | No | `4096` | |
| `BEDROCK_TEMPERATURE` | No | `0.0` | |
| `JWT_ALGORITHM` | No | `HS256` | |
| `ACCESS_TOKEN_EXPIRE_MINUTES` (alias: `JWT_ACCESS_TOKEN_EXPIRE_MINUTES`) | No | `60` | Either env var name works. Production commonly uses `1440` (24h). |
| `FRONTEND_URL` | No | none | The deployed frontend's origin (e.g. the CloudFront domain). Automatically added to the CORS allow-list — does not replace `CORS_ORIGINS`. |
| `CORS_ORIGINS` | No | `["http://localhost:5173"]` | JSON array string of allowed origins. Keep the local dev origin here for local testing; add production origins via `FRONTEND_URL` or by editing this list directly. |
| `ENVIRONMENT` | No | `development` | Set to `production`. Currently only affects the `GET /api/health` response body (informational) — no other runtime behavior branches on it. |
| `TELEGRAM_BOT_TOKEN` | No | `""` | See §7 below — do not configure the webhook yet. |
| `TELEGRAM_WEBHOOK_SECRET` | No | none | Optional; validates the `X-Telegram-Bot-Api-Secret-Token` header once a webhook is registered. |

**AWS credentials are never set as application environment variables in
production.** `app/config.py` never reads `AWS_ACCESS_KEY_ID` /
`AWS_SECRET_ACCESS_KEY` — every `boto3` client/resource in the codebase
(`s3_client.py`, `textract_client.py`, `bedrock_client.py`,
`dependency_detector.py`, `dynamodb_client.py`, `user_store.py`,
`telegram_link_store.py`) is constructed with only `region_name`,
delegating credential resolution entirely to boto3's default chain. On
App Runner, this means **attach an IAM instance role to the App Runner
service** — no access keys need to be configured anywhere.

---

## 4. IAM requirements

The App Runner service's execution/instance role needs at minimum:

- **S3**: `s3:PutObject`, `s3:GetObject` on the upload bucket (scoped to
  the `uploads/` prefix used by `S3_UPLOAD_PREFIX`).
- **DynamoDB**: `dynamodb:PutItem`, `dynamodb:GetItem`,
  `dynamodb:UpdateItem`, `dynamodb:DeleteItem`, `dynamodb:Query`,
  `dynamodb:Scan`, `dynamodb:BatchWriteItem` on each of the seven tables
  listed in §3, plus their GSIs.
- **Textract**: `textract:StartDocumentTextDetection`,
  `textract:GetDocumentTextDetection`.
- **Bedrock**: `bedrock:InvokeModel` for the model ID configured in
  `BEDROCK_MODEL_ID`.

Do not grant broader account-wide permissions than these four services
need. Do not attach a role with `*:*` or full `AdministratorAccess`.

---

## 5. CORS configuration

`app/main.py` configures `CORSMiddleware` with `allow_origins` from
`settings.cors_origins` — never a wildcard `["*"]`. In production, set
`FRONTEND_URL` to the deployed frontend's exact origin (e.g.
`https://d123456abcdef.cloudfront.net`, or a custom domain if one is
attached to CloudFront); it is automatically merged into the origin
allow-list without needing to also edit `CORS_ORIGINS`. Verified live
(see §9): the CloudFront origin was correctly allowed, an untrusted
origin was correctly rejected, and the local dev origin
(`http://localhost:5173`) kept working simultaneously.

---

## 6. Health check

- `GET /health` — bare, unprefixed, returns exactly `{"status": "healthy"}`.
  Does not touch S3, DynamoDB, Textract, or Bedrock — it only confirms
  the process is running and able to serve requests. Use this as the App
  Runner health check path.
- `GET /api/health` — a second, more detailed health endpoint (also
  dependency-free) that additionally returns `service` and `environment`
  fields, kept for backward compatibility with any existing monitoring
  pointed at the `/api`-prefixed path.

Neither endpoint requires authentication.

---

## 7. CloudFront SPA routing requirement

The frontend uses React Router in client-side (browser history) mode
with these routes: `/`, `/login`, `/signup`, `/dashboard`, `/upload`,
`/add-text`, `/sources`, `/obligations`, `/risks`, `/graph`. Only
`index.html` is a real file on disk after `npm run build` — every other
path is resolved by JavaScript in the browser after the page loads.

**CloudFront (or whatever origin serves the static files, e.g. S3) must
be configured to return `index.html` for any request that would
otherwise 404/403**, so that a direct browser load of, say,
`https://<domain>/dashboard` serves the SPA shell instead of an error
page. In CloudFront this is typically done with a **custom error
response**: map HTTP 403 and 404 (S3 origins commonly return 403 for a
missing key when public listing is disabled) to a 200 response serving
`/index.html`. This is a CloudFront/S3 configuration setting, not
something implemented in application code — no second routing system is
introduced; React Router remains the only router.

---

## 8. File upload handling (unchanged, verified still correct)

`POST /api/documents/upload` (`app/routers/documents.py`) still enforces,
unmodified:
- Content-type allow-list: `application/pdf`, `image/png`, `image/jpeg`.
- Extension-vs-declared-content-type cross-check.
- A streamed size cap (`MAX_UPLOAD_SIZE_MB`, default 15MB), enforced
  independent of the client-supplied `Content-Length` header.
- Rejection of empty files.
- Unique S3 object keys: `{prefix}{user_id}/{yyyy}/{mm}/{dd}/{document_id}{ext}`
  — every upload gets a fresh UUID-based key, never overwriting another
  upload.

The S3 bucket itself should remain private (no public read/list access)
— the application always accesses it via the backend's IAM role, never
via a public bucket policy or presigned URLs exposed to the frontend.

---

## 9. Telegram configuration (do not configure the webhook yet)

`TELEGRAM_BOT_TOKEN` should be set as a secret environment variable on
the App Runner service once available — the application already reads
it exclusively from the environment (`settings.telegram_bot_token`,
`app/config.py`) and never hardcodes it. If left unset, the integration
simply stays inactive (endpoints under `/api/integrations/telegram`
respond with a clear error rather than crashing).

**Do not call Telegram's `setWebhook` API yet.** That requires the
backend's real public HTTPS URL, which only exists after the App Runner
service is deployed. Once deployed, the webhook can be registered
pointing at `https://<app-runner-url>/api/integrations/telegram/webhook`
— this is a follow-up step, not part of this deployment preparation.

---

## 10. Logging and error handling

- All AWS/Bedrock/Textract/DynamoDB errors are logged server-side via
  `logger.exception(...)`/`logger.warning(...)` (visible in CloudWatch
  once deployed on App Runner), while the HTTP response returned to the
  client uses a generic, user-facing message — confirmed for every
  `except` branch across `app/routers/*.py`. Two response-body leaks
  (raw Bedrock/dependency-detection error text reaching the client) were
  found and fixed as part of this preparation.
- No JWT secrets, passwords, AWS credentials, or Telegram tokens are
  logged anywhere in the codebase (verified by search).
- One log statement (`bedrock_client.py`, `dependency_detector.py`) logs
  up to 500 characters of a malformed Bedrock model response for
  debugging when JSON parsing fails — this is diagnostic-only, goes to
  CloudWatch (not the HTTP response), and only fires on a parse failure.
  It is not a credential leak, but note that it could contain fragments
  of user-submitted document text if the model garbles its own output.

---

## 11. Known non-blocking findings

- **No git repository exists in this workspace.** `.gitignore` rules
  exist in both `backend/` and `frontend/` and are correct, but there is
  no commit history to have leaked anything through — this should be
  addressed (initialize a repo, make sure secrets are never staged)
  before this project is pushed anywhere.
- **`backend/.env` currently holds live-looking AWS credentials, a JWT
  secret, and a Telegram bot token in plaintext on disk.** These are
  local development values, gitignored, and not used by production
  (which should use an IAM role instead of static AWS keys — see §3/§4).
  Treat this file as sensitive; do not copy it into a production
  environment or commit it if a repository is initialized later.
- **`react-router-dom` has two moderate-severity advisories** (open
  redirect and constructor-injection CVEs) fixed only in `react-router-dom`
  7.x, a major version with breaking API changes from the 6.x used here.
  Upgrading is out of scope for this deployment preparation (it would be
  an architecture change, not a deployment fix) — tracked here for a
  future, dedicated upgrade.
- **No containerization (Dockerfile) exists.** This deployment guide
  assumes App Runner's source-based Python runtime deployment path
  (buildpack-style, no Dockerfile required). If containerization is
  later required, a Dockerfile can be added without changing any
  application code — the startup command in §2 would be the container's
  `CMD`.

---

## 12. Post-deployment verification checklist

After deploying, verify in this order:

1. `curl https://<app-runner-url>/health` → `{"status": "healthy"}`.
2. `curl https://<app-runner-url>/api/health` → `{"status": "ok", ...}`.
3. From a browser at the CloudFront domain, sign up a test account and
   log in — confirms CORS, JWT issuance, and DynamoDB writes all work.
4. Upload a small PDF/PNG/JPEG — confirms S3 write + IAM permissions +
   Textract access.
5. Run obligation extraction on the uploaded document — confirms Bedrock
   access.
6. Directly load `https://<cloudfront-domain>/dashboard` (not via
   in-app navigation) — confirms the CloudFront SPA fallback (§7) is
   configured correctly; a 404/403 here means that step was missed.
7. Log out, then attempt to load `/dashboard` again — confirms the
   frontend's route protection still redirects to `/login`.
8. Check CloudWatch logs for the App Runner service — confirm no
   tracebacks are being returned to clients (only generic error
   messages in HTTP responses) and no secrets appear in log lines.
9. Confirm `frontend/.env`/CI build environment used the real backend
   URL for `VITE_API_BASE_URL` — inspect the deployed JS bundle for any
   occurrence of `localhost` if in doubt.
10. (Later, once the above all pass) register the Telegram webhook —
    intentionally not part of this checklist per §9.
