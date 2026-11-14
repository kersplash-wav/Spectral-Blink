# ---- 1. build the React frontend ----
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- 2. Python API that also serves the built frontend ----
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 SPHEREX_CACHE=/app/cache
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
COPY scripts/ scripts/
COPY --from=web /web/dist frontend/dist
# Pre-computed demo fields (the five Space Apps test targets) so the demo is instant.
# Rebuild them with: python -I scripts/precompute.py
COPY cache/jobs cache/jobs
COPY cache/wave cache/wave
COPY cache/gaia cache/gaia
COPY cache/resolve.json cache/resolve.json
EXPOSE 8000
CMD ["sh", "-c", "uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers"]
