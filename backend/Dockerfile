# Production image for the OBLIGRA FastAPI backend, built for deployment
# to AWS App Runner via ECR. This does not change any application code
# or business logic - it only packages the existing app for a container
# runtime, since App Runner's source-based deployment requires a GitHub
# connection that this project doesn't have configured.
FROM python:3.13-slim

WORKDIR /app

# Install dependencies first (separate layer) so code-only changes don't
# invalidate the dependency-install cache layer on rebuilds.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# App Runner sets $PORT at runtime; default to 8000 for local/manual runs.
ENV PORT=8000
EXPOSE 8000

# Matches the documented production startup command exactly
# (docs/aws-deployment.md) - no code needs to read $PORT directly since
# uvicorn's own --port flag handles it via shell expansion.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
