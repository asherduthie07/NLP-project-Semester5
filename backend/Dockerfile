FROM python:3.13.2-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.lock pyproject.toml ./
RUN pip install --no-cache-dir -r requirements.lock
COPY backend backend
COPY analyzers analyzers
COPY workers workers
COPY alembic.ini ./
RUN useradd --create-home --uid 10001 codeatlas && mkdir -p /app/storage/artifacts && chown -R codeatlas:codeatlas /app/storage
USER codeatlas
CMD ["uvicorn", "backend.codeatlas.main:app", "--host", "0.0.0.0", "--port", "8000"]
