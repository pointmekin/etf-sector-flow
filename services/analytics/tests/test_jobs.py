import asyncio

from sector_flow import jobs
from sector_flow.jobs import FUND_DAILY_UPSERT_SQL, SECTOR_DAILY_UPSERT_SQL


def test_daily_and_sector_writes_are_idempotent_upserts() -> None:
    assert "on conflict (ticker, date) do update" in FUND_DAILY_UPSERT_SQL.lower()
    assert "on conflict (sector, date) do update" in SECTOR_DAILY_UPSERT_SQL.lower()


def test_twelve_data_requests_wait_after_each_minute_quota(monkeypatch) -> None:
    waits: list[int] = []

    async def record_wait(seconds: int) -> None:
        waits.append(seconds)

    monkeypatch.setattr(jobs.asyncio, "sleep", record_wait)

    async def make_twelve_requests() -> None:
        for request_index in range(12):
            await jobs._wait_for_twelve_data_quota(request_index)

    asyncio.run(make_twelve_requests())

    assert waits == [60]
