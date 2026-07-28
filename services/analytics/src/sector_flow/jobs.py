import asyncio
import logging
from datetime import date
from decimal import Decimal
from typing import Any

import httpx

from .calculations import FlowRow, build_sector_metrics, calculate_flows
from .config import get_settings
from .db import connection, execute
from .funds import FUNDS, PRICE_TICKERS
from .ingestion import download_to_temp, fetch_adjusted_prices, parse_nav_history

logger = logging.getLogger(__name__)

TWELVE_DATA_MINUTE_QUOTA = 8
TWELVE_DATA_QUOTA_WAIT_SECONDS = 60

FUND_UPSERT_SQL = """
insert into fund (ticker, name, sector, source_url, inception_date, active)
values (%s, %s, %s, %s, %s, %s)
on conflict (ticker) do update set
  name = excluded.name,
  sector = excluded.sector,
  source_url = excluded.source_url,
  inception_date = excluded.inception_date,
  active = excluded.active,
  updated_at = now()
"""

FUND_DAILY_UPSERT_SQL = """
insert into fund_daily (
  ticker, date, nav, shares_outstanding, aum, source_url, source_hash,
  retrieved_at, quality_status, quality_note
)
values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
on conflict (ticker, date) do update set
  nav = excluded.nav,
  shares_outstanding = excluded.shares_outstanding,
  aum = excluded.aum,
  source_url = excluded.source_url,
  source_hash = excluded.source_hash,
  retrieved_at = excluded.retrieved_at,
  quality_status = excluded.quality_status,
  quality_note = excluded.quality_note
"""

SECTOR_DAILY_UPSERT_SQL = """
insert into sector_daily (
  sector, date, representative_ticker, flow_1d_usd, flow_5d_usd, flow_20d_usd,
  flow_60d_usd, flow_252d_usd, flow_5d_pct_aum, flow_20d_pct_aum,
  flow_60d_pct_aum, flow_252d_pct_aum, flow_1d_pct_aum, positive_flow_days_20d,
  relative_return_60d, volatility_60d, flow_score, dca_score, state, rank
)
values (
  %(sector)s, %(date)s, %(representative_ticker)s, %(flow_1d_usd)s,
  %(flow_5d_usd)s, %(flow_20d_usd)s, %(flow_60d_usd)s, %(flow_252d_usd)s,
  %(flow_5d_pct_aum)s, %(flow_20d_pct_aum)s, %(flow_60d_pct_aum)s,
  %(flow_252d_pct_aum)s, %(flow_1d_pct_aum)s, %(positive_flow_days_20d)s, %(relative_return_60d)s,
  %(volatility_60d)s, %(flow_score)s, %(dca_score)s, %(state)s, %(rank)s
)
on conflict (sector, date) do update set
  representative_ticker = excluded.representative_ticker,
  flow_1d_usd = excluded.flow_1d_usd,
  flow_5d_usd = excluded.flow_5d_usd,
  flow_20d_usd = excluded.flow_20d_usd,
  flow_60d_usd = excluded.flow_60d_usd,
  flow_252d_usd = excluded.flow_252d_usd,
  flow_5d_pct_aum = excluded.flow_5d_pct_aum,
  flow_20d_pct_aum = excluded.flow_20d_pct_aum,
  flow_60d_pct_aum = excluded.flow_60d_pct_aum,
  flow_252d_pct_aum = excluded.flow_252d_pct_aum,
  flow_1d_pct_aum = excluded.flow_1d_pct_aum,
  positive_flow_days_20d = excluded.positive_flow_days_20d,
  relative_return_60d = excluded.relative_return_60d,
  volatility_60d = excluded.volatility_60d,
  flow_score = excluded.flow_score,
  dca_score = excluded.dca_score,
  state = excluded.state,
  rank = excluded.rank
"""


async def daily_refresh() -> dict[str, Any]:
    settings = get_settings()
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is required")
    if not settings.twelve_data_api_key:
        raise RuntimeError("TWELVE_DATA_API_KEY is required")
    job = execute(
        "insert into job_run (job_type, status) values ('daily_refresh', 'running') returning id"
    )
    job_id = int(job["id"]) if job else 0
    rows_processed = 0
    source_date: date | None = None
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            with connection() as conn, conn.cursor() as cursor:
                seed_funds(cursor)
                for fund in FUNDS:
                    path = await download_to_temp(client, fund.source_url)
                    try:
                        rows = parse_nav_history(path, fund.source_url)
                    finally:
                        path.unlink(missing_ok=True)
                    cursor.executemany(
                        FUND_DAILY_UPSERT_SQL,
                        [
                            (
                                fund.ticker,
                                row.date,
                                row.nav,
                                row.shares_outstanding,
                                row.aum,
                                row.source_url,
                                row.source_hash,
                                row.retrieved_at,
                                row.quality_status,
                                row.quality_note,
                            )
                            for row in rows
                        ],
                    )
                    rows_processed += len(rows)
                    source_date = max(source_date or rows[-1].date, rows[-1].date)

                for request_index, ticker in enumerate(PRICE_TICKERS):
                    await _wait_for_twelve_data_quota(request_index)
                    prices = await fetch_adjusted_prices(
                        client, ticker, settings.twelve_data_api_key
                    )
                    cursor.executemany(
                        """
                        insert into fund_daily (ticker, date, close_price, retrieved_at)
                        values (%s, %s, %s, now())
                        on conflict (ticker, date) do update set close_price = excluded.close_price
                        """,
                        [(ticker, price.date, price.adjusted_close) for price in prices],
                    )
                    rows_processed += len(prices)

                recalculate(cursor)
                generate_signal_events(cursor)
        execute(
            """
            update job_run set status = 'succeeded', finished_at = now(), source_date = %s,
              rows_processed = %s, message = %s where id = %s
            """,
            (source_date, rows_processed, "Daily refresh completed", job_id),
        )
        return {
            "status": "succeeded",
            "job_id": job_id,
            "source_date": source_date,
            "rows_processed": rows_processed,
        }
    except Exception as error:
        logger.exception("Daily refresh failed")
        execute(
            """
            update job_run set status = 'failed', finished_at = now(), rows_processed = %s,
              message = %s where id = %s
            """,
            (rows_processed, str(error)[:1000], job_id),
        )
        raise


async def _wait_for_twelve_data_quota(request_index: int) -> None:
    if request_index and request_index % TWELVE_DATA_MINUTE_QUOTA == 0:
        await asyncio.sleep(TWELVE_DATA_QUOTA_WAIT_SECONDS)


def seed_funds(cursor: Any) -> None:
    cursor.executemany(
        FUND_UPSERT_SQL,
        [
            (fund.ticker, fund.name, fund.sector, fund.source_url, fund.inception_date, True)
            for fund in FUNDS
        ]
        + [
            (
                "SPY",
                "SPDR S&P 500 ETF Trust",
                "Benchmark",
                "https://www.ssga.com/",
                "1993-01-22",
                False,
            )
        ],
    )


def recalculate(cursor: Any) -> int:
    rows_by_ticker: dict[str, list[FlowRow]] = {}
    sectors = {fund.ticker: fund.sector for fund in FUNDS}
    for fund in FUNDS:
        cursor.execute(
            """
            select date, nav, shares_outstanding, aum, close_price, quality_status, quality_note
            from fund_daily
            where ticker = %s
              and nav is not null
              and shares_outstanding is not null
              and aum is not null
            order by date
            """,
            (fund.ticker,),
        )
        raw_rows = cursor.fetchall()
        calculated = calculate_flows(
            [
                FlowRow(
                    date=row["date"],
                    nav=float(row["nav"]),
                    shares_outstanding=float(row["shares_outstanding"]),
                    aum=float(row["aum"]),
                    close_price=float(row["close_price"])
                    if row["close_price"] is not None
                    else None,
                    quality_status=row["quality_status"],
                    quality_note=row["quality_note"],
                )
                for row in raw_rows
            ]
        )
        cursor.executemany(
            """
            update fund_daily set shares_change = %s, flow_usd = %s, flow_pct_aum = %s,
              quality_status = %s, quality_note = %s where ticker = %s and date = %s
            """,
            [
                (
                    row.shares_change,
                    row.flow_usd,
                    row.flow_pct_aum,
                    row.quality_status,
                    row.quality_note,
                    fund.ticker,
                    row.date,
                )
                for row in calculated
            ],
        )
        rows_by_ticker[fund.ticker] = calculated

    cursor.execute(
        "select date, close_price from fund_daily where ticker = 'SPY' and close_price is not null"
    )
    spy_prices = {row["date"]: float(row["close_price"]) for row in cursor.fetchall()}
    metrics = build_sector_metrics(rows_by_ticker, sectors, spy_prices)
    cursor.executemany(SECTOR_DAILY_UPSERT_SQL, metrics)
    return len(metrics)


def generate_signal_events(cursor: Any) -> int:
    cursor.execute("select distinct date from sector_daily order by date desc limit 2")
    dates = [row["date"] for row in cursor.fetchall()]
    if len(dates) < 2:
        return 0
    current_date, previous_date = dates
    cursor.execute(
        """
        select current.sector, current.rank, current.state,
          current.flow_20d_usd, current.flow_score,
          previous.rank as previous_rank, previous.state as previous_state,
          previous.flow_20d_usd as previous_flow_20d_usd, previous.flow_score as previous_flow_score
        from sector_daily current
        join sector_daily previous on previous.sector = current.sector and previous.date = %s
        where current.date = %s
        """,
        (previous_date, current_date),
    )
    events: list[tuple[date, str, str, str, str]] = []
    for row in cursor.fetchall():
        sector = row["sector"]
        if row["rank"] <= 3 < row["previous_rank"]:
            events.append(
                (
                    current_date,
                    sector,
                    "top_three",
                    f"{sector} entered the top three",
                    f"{sector} is now ranked #{row['rank']}.",
                )
            )
        if row["state"] != row["previous_state"]:
            events.append(
                (
                    current_date,
                    sector,
                    "state_change",
                    f"{sector} changed state",
                    f"{row['previous_state']} → {row['state']}",
                )
            )
        if Decimal(row["flow_20d_usd"] or 0) * Decimal(row["previous_flow_20d_usd"] or 0) < 0:
            events.append(
                (
                    current_date,
                    sector,
                    "flow_sign",
                    f"{sector} 20-day flow changed sign",
                    "The rolling 20-day flow crossed zero.",
                )
            )
        if abs(Decimal(row["flow_score"] or 0) - Decimal(row["previous_flow_score"] or 0)) >= 15:
            events.append(
                (
                    current_date,
                    sector,
                    "score_move",
                    f"{sector} Flow Score moved materially",
                    "The Flow Score changed by at least 15 points.",
                )
            )
    for event_date, sector, event_type, title, message in events:
        cursor.execute(
            """
            insert into signal_event (date, sector, type, title, message)
            select %s, %s, %s, %s, %s
            where not exists (
              select 1 from signal_event where date = %s and sector = %s and type = %s
            )
            """,
            (event_date, sector, event_type, title, message, event_date, sector, event_type),
        )
    return len(events)
