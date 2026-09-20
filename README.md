# OBLIGRA

OBLIGRA is an AI-powered obligation intelligence platform. It converts unstructured
information — PDFs, images, and free-form text — into actionable obligations with
clear deadlines and dependencies.

This repository is a monorepo containing the frontend application, backend API, and
project documentation.

> **Status:** early foundation. This step sets up the project skeleton only. AI
> processing, AWS services, authentication, database persistence, and document
> processing are **not** implemented yet.

## Repository Structure

```
obligra/
├── frontend/   React + TypeScript + Vite web application
├── backend/    Python + FastAPI backend service
└── docs/       Project documentation
```

## Technology Stack

### Frontend

- [React 19](https://react.dev/) with [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/) for tooling and dev server
- [Tailwind CSS](https://tailwindcss.com/) for styling
- [React Router](https://reactrouter.com/) for client-side routing

### Backend

- [Python 3.11+](https://www.python.org/)
- [FastAPI](https://fastapi.tiangolo.com/) for the HTTP API
- [Uvicorn](https://www.uvicorn.org/) as the ASGI server
- [Pydantic Settings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/) for environment configuration

### Not yet implemented

- AI / document intelligence processing
- AWS or other cloud service integrations
- Authentication and authorization
- Database persistence

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

## Documentation

Additional project documentation lives in [`docs/`](./docs).
