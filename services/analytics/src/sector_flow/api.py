from datetime import date
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from psycopg.types.json import Jsonb
from pydantic import BaseModel, Field

from .auth import require_basic_auth
from .backtest import PriceObservation, ScoreObservation, run_monthly_backtest
from .config import get_settings
from .db import connection, database_health, fetch_all
from .jobs import daily_refresh, generate_signal_events, recalculate

settings = get_settings()
app = FastAPI(title="ETF Sector Flow Analytics", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.allowed_origins.split(",") if origin],
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)

Operator = Annotated[str, Depends(require_basic_auth)]


class BacktestRequest(BaseModel):
    strategy: Literal[
        "top_1",
        "top_2",
        "top_3",
        "equal_weight",
        "top_3_momentum",
        "spy_core_flow",
        "spy_core_momentum",
    ] = "top_3"
    metric: Literal["flow_score", "dca_score"] = "dca_score"
    start_date: date | None = None
    transaction_cost_bps: float = Field(default=0, ge=0, le=1000)
    execution_delay_days: int = Field(default=1, ge=1, le=20)


@app.get("/health")
def health() -> dict[str, str]:
    database = database_health()
    return {"status": "ok" if database != "error" else "degraded", "database": database}


@app.get("/api/v1/sectors/latest")
def sectors_latest() -> list[dict]:
    return fetch_all(
        """
        select * from sector_daily
        where date = (select max(date) from sector_daily)
        order by rank
        """
    )


@app.get("/api/v1/sectors/{ticker}/history")
def sector_history(
    ticker: str,
    date_from: Annotated[date | None, Query(alias="from")] = None,
    date_to: Annotated[date | None, Query(alias="to")] = None,
) -> list[dict]:
    normalized = _sector_ticker(ticker)
    return fetch_all(
        """
        select sector.*, fund.close_price, fund.flow_usd
        from sector_daily sector
        left join fund_daily fund
          on fund.ticker = sector.representative_ticker and fund.date = sector.date
        where sector.representative_ticker = %s
          and (%s::date is null or sector.date >= %s::date)
          and (%s::date is null or sector.date <= %s::date)
        order by sector.date
        """,
        (normalized, date_from, date_from, date_to, date_to),
    )


@app.get("/api/v1/sectors/{ticker}")
def sector_detail(ticker: str) -> dict:
    normalized = _sector_ticker(ticker)
    rows = fetch_all(
        """
        select * from sector_daily where representative_ticker = %s
        order by date desc limit 1
        """,
        (normalized,),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Sector not found")
    return rows[0]


@app.get("/api/v1/notifications/latest")
def notifications_latest(
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> list[dict]:
    return fetch_all("select * from signal_event order by created_at desc limit %s", (limit,))


@app.post("/api/v1/jobs/daily-refresh")
async def trigger_daily_refresh(_operator: Operator) -> dict:
    return await daily_refresh()


@app.post("/api/v1/jobs/recalculate")
def trigger_recalculate(_operator: Operator) -> dict[str, int]:
    with connection() as conn, conn.cursor() as cursor:
        rows = recalculate(cursor)
        events = generate_signal_events(cursor)
    return {"rows_processed": rows, "events_generated": events}


@app.get("/api/v1/jobs/latest")
def latest_job(_operator: Operator) -> dict:
    rows = fetch_all("select * from job_run order by started_at desc limit 1")
    if not rows:
        raise HTTPException(status_code=404, detail="No jobs found")
    return rows[0]


@app.post("/api/v1/backtests")
def create_backtest(request: BacktestRequest, _operator: Operator) -> dict:
    run_id = uuid4()
    with connection() as conn, conn.cursor() as cursor:
        cursor.execute(
            """
            insert into backtest_run (id, strategy, parameters, status)
            values (%s, %s, %s, 'running')
            """,
            (run_id, request.strategy, Jsonb(request.model_dump(mode="json"))),
        )
        try:
            cursor.execute(
                """
                select date, representative_ticker, flow_score, dca_score
                from sector_daily
                order by date
                """
            )
            scores = [
                ScoreObservation(
                    date=row["date"],
                    ticker=row["representative_ticker"],
                    flow_score=float(row["flow_score"]) if row["flow_score"] is not None else None,
                    dca_score=float(row["dca_score"]) if row["dca_score"] is not None else None,
                )
                for row in cursor.fetchall()
            ]
            cursor.execute(
                """
                select ticker, date, close_price from fund_daily
                where close_price is not null
                order by date
                """
            )
            prices = [
                PriceObservation(row["date"], row["ticker"], float(row["close_price"]))
                for row in cursor.fetchall()
            ]
            result = run_monthly_backtest(
                scores,
                prices,
                strategy=request.strategy,
                metric=request.metric,
                transaction_cost_bps=request.transaction_cost_bps,
                start_date=request.start_date,
                execution_delay_days=request.execution_delay_days,
            )
            cursor.execute(
                """
                update backtest_run set status = 'succeeded', finished_at = now(),
                  summary = %s, monthly_results = %s where id = %s
                """,
                (Jsonb(result["summary"]), Jsonb(result["monthly_results"]), run_id),
            )
        except Exception as error:
            cursor.execute(
                """
                update backtest_run set status = 'failed', finished_at = now(),
                  error_message = %s where id = %s
                """,
                (str(error)[:1000], run_id),
            )
            raise HTTPException(
                status_code=422, detail="Backtest could not be completed"
            ) from error
    return {"id": run_id, "status": "succeeded", **result}


@app.get("/api/v1/backtests/{run_id}")
def get_backtest(run_id: UUID, _operator: Operator) -> dict:
    rows = fetch_all("select * from backtest_run where id = %s", (run_id,))
    if not rows:
        raise HTTPException(status_code=404, detail="Backtest not found")
    return rows[0]


def _sector_ticker(ticker: str) -> str:
    normalized = ticker.upper()
    allowed = {"XLC", "XLY", "XLP", "XLE", "XLF", "XLV", "XLI", "XLB", "XLRE", "XLK", "XLU"}
    if normalized not in allowed:
        raise HTTPException(status_code=404, detail="Sector not found")
    return normalized
