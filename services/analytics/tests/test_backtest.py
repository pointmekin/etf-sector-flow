from datetime import date

import pytest

from sector_flow.backtest import PriceObservation, ScoreObservation, run_monthly_backtest


def dataset() -> tuple[list[ScoreObservation], list[PriceObservation]]:
    scores = [
        ScoreObservation(date(2025, 1, 31), "XLK", 10, 10),
        ScoreObservation(date(2025, 1, 31), "XLE", 90, 90),
        ScoreObservation(date(2025, 2, 28), "XLK", 100, 100),
        ScoreObservation(date(2025, 2, 28), "XLE", 0, 0),
        ScoreObservation(date(2025, 3, 31), "XLK", 80, 80),
        ScoreObservation(date(2025, 3, 31), "XLE", 20, 20),
    ]
    prices = []
    values = {
        "XLK": [(date(2025, 2, 3), 100), (date(2025, 3, 3), 120), (date(2025, 4, 1), 132)],
        "XLE": [(date(2025, 2, 3), 100), (date(2025, 3, 3), 90), (date(2025, 4, 1), 99)],
        "SPY": [(date(2025, 2, 3), 100), (date(2025, 3, 3), 105), (date(2025, 4, 1), 110)],
    }
    for ticker, observations in values.items():
        prices.extend(PriceObservation(day, ticker, value) for day, value in observations)
    return scores, prices


def test_rank_uses_prior_month_end_and_executes_next_trading_day() -> None:
    scores, prices = dataset()

    result = run_monthly_backtest(scores, prices, "top_1", "dca_score")
    first = result["monthly_results"][0]

    assert first["signal_date"] == "2025-01-31"
    assert first["execution_date"] == "2025-02-03"
    assert first["holdings"] == ["XLE"]
    assert sum(first["weights"].values()) == pytest.approx(1)


def test_transaction_costs_reduce_return() -> None:
    scores, prices = dataset()
    free = run_monthly_backtest(scores, prices, "top_1", "dca_score", 0)
    costly = run_monthly_backtest(scores, prices, "top_1", "dca_score", 25)

    assert costly["monthly_results"][0]["return"] < free["monthly_results"][0]["return"]


def test_missing_score_is_not_treated_as_zero() -> None:
    scores, prices = dataset()
    scores[0] = ScoreObservation(date(2025, 1, 31), "XLK", None, None)

    with pytest.raises(ValueError, match="Missing sector score"):
        run_monthly_backtest(scores, prices, "top_1", "dca_score")


def test_missing_aligned_price_is_rejected() -> None:
    scores, prices = dataset()
    prices = [
        price for price in prices if not (price.ticker == "XLE" and price.date == date(2025, 3, 3))
    ]

    with pytest.raises(ValueError, match="aligned"):
        run_monthly_backtest(scores, prices, "top_1", "dca_score")
