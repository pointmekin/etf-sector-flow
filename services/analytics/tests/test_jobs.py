from sector_flow.jobs import FUND_DAILY_UPSERT_SQL, SECTOR_DAILY_UPSERT_SQL


def test_daily_and_sector_writes_are_idempotent_upserts() -> None:
    assert "on conflict (ticker, date) do update" in FUND_DAILY_UPSERT_SQL.lower()
    assert "on conflict (sector, date) do update" in SECTOR_DAILY_UPSERT_SQL.lower()
