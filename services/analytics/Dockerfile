FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY src ./src

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH="/app/src"

CMD ["sh", "-c", "uvicorn sector_flow.api:app --host 0.0.0.0 --port ${PORT} --workers 1 --limit-concurrency 10"]
