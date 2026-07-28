from fastapi import FastAPI

from .db import database_health

app = FastAPI(title="ETF Sector Flow Analytics", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    database = database_health()
    return {"status": "ok" if database != "error" else "degraded", "database": database}
