from contextlib import contextmanager
from typing import Any

from psycopg import Connection
from psycopg.rows import dict_row

from .config import get_settings


@contextmanager
def connection():
    database_url = get_settings().database_url
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")
    with Connection.connect(database_url, row_factory=dict_row) as conn:
        yield conn


def database_health() -> str:
    if not get_settings().database_url:
        return "not_configured"
    try:
        with connection() as conn, conn.cursor() as cursor:
            cursor.execute("select 1")
            cursor.fetchone()
        return "ok"
    except Exception:
        return "error"


def fetch_all(query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    with connection() as conn, conn.cursor() as cursor:
        cursor.execute(query, params)
        return list(cursor.fetchall())
