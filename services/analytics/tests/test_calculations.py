from datetime import date, timedelta

import pytest

from sector_flow.calculations import FlowRow, build_sector_metrics, calculate_flows


def row(day: int, nav: float, shares: float, aum: float, close: float | None = None) -> FlowRow:
    return FlowRow(
        date=date(2025, 1, 1) + timedelta(days=day),
        nav=nav,
        shares_outstanding=shares,
        aum=aum,
        close_price=close,
    )


def test_daily_flow_uses_share_change_and_current_nav() -> None:
    result = calculate_flows([row(0, 100, 1_000, 100_000), row(1, 102, 1_100, 112_200)])

    assert result[1].shares_change == 100
    assert result[1].flow_usd == 10_200
    assert result[1].flow_pct_aum == pytest.approx(0.102)


def test_split_adjustment_does_not_create_false_flow() -> None:
    result = calculate_flows([row(0, 100, 1_000, 100_000), row(1, 50, 2_000, 100_000)])

    assert result[1].shares_change == 0
    assert result[1].flow_usd == 0
    assert "split" in (result[1].quality_note or "")


def test_extreme_unexplained_flow_is_flagged() -> None:
    result = calculate_flows([row(0, 100, 1_000, 100_000), row(1, 100, 1_500, 150_000)])

    assert result[1].quality_status == "review"


def test_scores_rank_stronger_flow_first() -> None:
    dates = [date(2025, 1, 1) + timedelta(days=index) for index in range(70)]
    strong = calculate_flows(
        [
            FlowRow(day, 100, 1_000 + index * 10, 100_000 + index * 1_000, 100 + index)
            for index, day in enumerate(dates)
        ]
    )
    weak = calculate_flows(
        [
            FlowRow(day, 100, 1_000 - index * 5, 100_000 - index * 500, 100 - index * 0.2)
            for index, day in enumerate(dates)
        ]
    )
    spy = {day: 100 + index * 0.1 for index, day in enumerate(dates)}

    metrics = build_sector_metrics(
        {"XLK": strong, "XLE": weak}, {"XLK": "Technology", "XLE": "Energy"}, spy
    )
    latest = [metric for metric in metrics if metric["date"] == dates[-1]]

    assert (
        next(metric for metric in latest if metric["representative_ticker"] == "XLK")["rank"] == 1
    )
    assert all(0 <= float(metric["flow_score"]) <= 100 for metric in latest)
