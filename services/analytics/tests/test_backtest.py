from datetime import date, timedelta

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
    overrides = {
        "XLK": {date(2025, 2, 3): 100, date(2025, 3, 3): 120, date(2025, 4, 1): 132},
        "XLE": {date(2025, 2, 3): 100, date(2025, 3, 3): 90, date(2025, 4, 1): 99},
        "SPY": {date(2025, 2, 3): 100, date(2025, 3, 3): 105, date(2025, 4, 1): 110},
    }
    prices = [
        PriceObservation(day, ticker, overrides[ticker].get(day, 100))
        for ticker in overrides
        for day in trading_days(date(2024, 1, 1), date(2025, 4, 1))
    ]
    return scores, prices


def trading_days(start: date, end: date) -> list[date]:
    days: list[date] = []
    current = start
    while current <= end:
        if current.weekday() < 5:
            days.append(current)
        current += timedelta(days=1)
    return days


def momentum_dataset() -> tuple[list[ScoreObservation], list[PriceObservation]]:
    signal_dates = [date(2025, 1, 31), date(2025, 2, 28), date(2025, 3, 31)]
    score_values = {"XLK": 10, "XLE": 60, "XLP": 80, "XLU": 100}
    scores = [
        ScoreObservation(day, ticker, score, score)
        for day in signal_dates
        for ticker, score in score_values.items()
    ]
    days = trading_days(date(2024, 1, 1), date(2025, 4, 4))
    ending_values = {"XLK": 200, "XLE": 160, "XLP": 130, "XLU": 110, "SPY": 125}
    prices = [
        PriceObservation(day, ticker, 100 + (ending - 100) * index / (len(days) - 1))
        for ticker, ending in ending_values.items()
        for index, day in enumerate(days)
    ]
    return scores, prices


def flow_confirmed_dataset(
    positive_confirmation: bool = True,
) -> tuple[list[ScoreObservation], list[PriceObservation]]:
    _, prices = momentum_dataset()
    tickers = ["XLK", "XLE", "XLP", "XLU"]
    surprises = {"XLK": 0.1, "XLE": -0.1, "XLP": 0.05, "XLU": 0.0}
    scores = []
    for day in trading_days(date(2024, 10, 1), date(2025, 3, 31)):
        for ticker in tickers:
            flow = surprises[ticker] if positive_confirmation and day.day >= 28 else 0.0
            scores.append(ScoreObservation(day, ticker, 50, 50, flow))
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


def test_requires_a_full_trading_year_before_first_signal() -> None:
    scores, prices = dataset()
    prices = [price for price in prices if price.date >= date(2024, 6, 1)]

    with pytest.raises(ValueError, match="warm-up"):
        run_monthly_backtest(scores, prices, "top_1", "dca_score")


def test_execution_delay_counts_trading_days_after_signal() -> None:
    scores, prices = dataset()

    result = run_monthly_backtest(
        scores,
        prices,
        "top_1",
        "dca_score",
        execution_delay_days=3,
    )

    assert result["monthly_results"][0]["execution_date"] == "2025-02-05"


def test_summary_reports_spy_and_benchmark_relative_risk() -> None:
    scores, prices = dataset()

    summary = run_monthly_backtest(scores, prices, "top_1", "dca_score")["summary"]

    assert summary["benchmark_cagr"] > 0
    assert summary["benchmark_maximum_drawdown"] <= 0
    assert summary["benchmark_annualized_volatility"] >= 0
    assert summary["excess_cagr"] == pytest.approx(summary["cagr"] - summary["benchmark_cagr"])
    assert summary["tracking_error"] >= 0
    assert "information_ratio" in summary


def test_momentum_strategy_selects_top_three_trailing_returns() -> None:
    scores, prices = momentum_dataset()

    result = run_monthly_backtest(scores, prices, "top_3_momentum", "dca_score")

    assert result["monthly_results"][0]["holdings"] == ["XLK", "XLE", "XLP"]
    assert result["monthly_results"][0]["weights"] == pytest.approx(
        {"XLK": 1 / 3, "XLE": 1 / 3, "XLP": 1 / 3}
    )


def test_spy_core_flow_keeps_seventy_percent_in_benchmark() -> None:
    scores, prices = momentum_dataset()

    result = run_monthly_backtest(scores, prices, "spy_core_flow", "dca_score")
    first = result["monthly_results"][0]

    assert first["holdings"] == ["SPY", "XLU", "XLP", "XLE"]
    assert first["weights"] == pytest.approx(
        {"SPY": 0.7, "XLU": 0.1, "XLP": 0.1, "XLE": 0.1}
    )


def test_spy_core_momentum_uses_momentum_for_active_sleeve() -> None:
    scores, prices = momentum_dataset()

    result = run_monthly_backtest(scores, prices, "spy_core_momentum", "flow_score")
    first = result["monthly_results"][0]

    assert first["holdings"] == ["SPY", "XLK", "XLE", "XLP"]
    assert first["weights"] == pytest.approx(
        {"SPY": 0.7, "XLK": 0.1, "XLE": 0.1, "XLP": 0.1}
    )


def test_flow_confirmation_keeps_unconfirmed_slots_in_spy() -> None:
    scores, prices = flow_confirmed_dataset()

    result = run_monthly_backtest(scores, prices, "spy_core_momentum_flow", "dca_score")
    first = result["monthly_results"][0]

    assert first["holdings"] == ["SPY", "XLK", "XLP"]
    assert first["weights"] == pytest.approx({"SPY": 0.8, "XLK": 0.1, "XLP": 0.1})


def test_flow_confirmation_falls_back_to_spy_when_signal_is_weak() -> None:
    scores, prices = flow_confirmed_dataset(positive_confirmation=False)

    result = run_monthly_backtest(scores, prices, "spy_core_momentum_flow", "dca_score")

    assert result["monthly_results"][0]["weights"] == {"SPY": 1.0}
