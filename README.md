# OBLIGRA

OBLIGRA is an AI-powered obligation intelligence platform. It converts unstructured
information — PDFs, images, pasted text, and Telegram messages — into actionable
obligations with clear deadlines, dependencies, and risk signals.

This repository is a monorepo containing the frontend application, backend API, and
project documentation.

## Live Deployment

| Layer | URL |
|---|---|
| Frontend (CloudFront) | https://dz4ekjlu98acu.cloudfront.net |
| Backend API (App Runner) | https://pty2cgj6wa.us-east-1.awsapprunner.com |

See [`docs/aws-deployment.md`](./docs/aws-deployment.md) for the full deployment
architecture, environment variables, and verification steps.

## Repository Structure

```
obligra/
├── frontend/   React + TypeScript + Vite web application
├── backend/    Python + FastAPI backend service
└── docs/       Project documentation
```

## Features

- Email/password authentication with JWT sessions (bcrypt-hashed passwords)
- Document upload (PDF/PNG/JPEG) with OCR text extraction via Amazon Textract
- Pasted-text ingestion, processed through the same extraction pipeline as uploads
- Telegram bot integration — linked messages are converted into sources the same
  way as uploads and pasted text
- AI-powered obligation extraction (deadlines, conditions, consequences) via
  Amazon Bedrock
- Obligation dependency graph, risk detection, and priority ranking
- Per-user data isolation across all sources and obligations

## Technology Stack

### Frontend

- [React 19](https://react.dev/) with [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/) for tooling and dev server
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [React Router](https://reactrouter.com/) for client-side routing

### Backend

- [Python 3.13](https://www.python.org/)
- [FastAPI](https://fastapi.tiangolo.com/) for the HTTP API
- [Uvicorn](https://www.uvicorn.org/) as the ASGI server
- [Pydantic Settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/) for environment configuration
- [boto3](https://boto3.amazonaws.com/v1/documentation/api/latest/index.html) for AWS integrations

### AWS Services

- **App Runner** — hosts the containerized FastAPI backend
- **S3** — stores uploaded documents/images and the frontend's static build
- **DynamoDB** — persists users, documents, sources, obligations, obligation
  relationships, and Telegram account links
- **Textract** — OCR for uploaded PDFs/images
- **Bedrock** (Amazon Nova Pro) — obligation extraction and dependency detection
- **CloudFront** — public CDN entry point for the frontend, with S3 origin access
  control (OAC) and SPA routing fallback

## Local Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 20+ and npm
- [Python](https://www.python.org/) 3.11+

### Frontend

```powershell
cd frontend
npm install
copy .env.example .env
npm run dev
```

The app runs at `http://localhost:5173` by default.

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
uvicorn app.main:app --reload --port 8000
```

The API runs at `http://localhost:8000`. Interactive docs are available at
`http://localhost:8000/docs`.

Verify the backend is healthy:

```powershell
curl http://localhost:8000/api/health
```

Expected response:

```json
{ "status": "ok", "service": "OBLIGRA API", "environment": "development" }
```

### Environment Variables

Both `frontend/.env.example` and `backend/.env.example` document the environment
variables each service expects. Copy them to `.env` in their respective directories
and adjust values as needed. `.env` files are git-ignored and should never be
committed.

## Future Improvements

### Calling Agent (planned)

A proactive voice-calling agent that reaches out to the user directly by phone as
an obligation's deadline approaches, rather than relying solely on the user to
check the dashboard. Not yet implemented.

Planned behavior: for each obligation, the agent would place a call to the user
at four checkpoints within the final 24 hours before the deadline:

- 18 hours before the deadline
- 10 hours before the deadline
- 6 hours before the deadline
- 1 hour before the deadline

Each call would summarize the obligation (action, deadline, and any known risk
level) and could be skipped automatically if the obligation is already marked
complete by the time the checkpoint is reached.

## Documentation

Additional project documentation, including the AWS deployment guide, lives in
[`docs/`](./docs).
