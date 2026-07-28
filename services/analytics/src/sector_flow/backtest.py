from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from math import sqrt
from statistics import mean, pstdev
from typing import Literal

import numpy as np

Strategy = Literal["top_1", "top_2", "top_3", "equal_weight"]
Metric = Literal["flow_score", "dca_score"]


@dataclass(frozen=True)
class ScoreObservation:
    date: date
    ticker: str
    flow_score: float | None
    dca_score: float | None


@dataclass(frozen=True)
class PriceObservation:
    date: date
    ticker: str
    adjusted_close: float


def run_monthly_backtest(
    scores: list[ScoreObservation],
    prices: list[PriceObservation],
    strategy: Strategy,
    metric: Metric,
    transaction_cost_bps: float = 0,
    start_date: date | None = None,
) -> dict[str, object]:
    if transaction_cost_bps < 0 or transaction_cost_bps > 1000:
        raise ValueError("Transaction costs must be between 0 and 1000 bps")
    score_by_date: dict[date, list[ScoreObservation]] = defaultdict(list)
    for observation in scores:
        if start_date is None or observation.date >= start_date:
            score_by_date[observation.date].append(observation)
    month_ends = _month_ends(score_by_date)
    price_map, common_dates = _price_data(prices)
    if len(month_ends) < 2 or len(common_dates) < 2:
        raise ValueError("At least two months of aligned score and price data are required")

    periods: list[dict[str, object]] = []
    equity = 1.0
    benchmark_equity = 1.0
    previous_weights: dict[str, float] = {}
    for signal_date, next_signal_date in zip(month_ends, month_ends[1:], strict=False):
        execution_date = _next_date(common_dates, signal_date)
        next_execution_date = _next_date(common_dates, next_signal_date)
        if not execution_date or not next_execution_date:
            continue
        holdings = _select_holdings(score_by_date[signal_date], strategy, metric)
        weights = {ticker: 1 / len(holdings) for ticker in holdings}
        missing = [
            ticker
            for ticker in holdings + ["SPY"]
            if execution_date not in price_map.get(ticker, {})
            or next_execution_date not in price_map.get(ticker, {})
        ]
        if missing:
            raise ValueError(f"Missing aligned price data for: {', '.join(sorted(set(missing)))}")
        gross_return = sum(
            weight
            * (price_map[ticker][next_execution_date] / price_map[ticker][execution_date] - 1)
            for ticker, weight in weights.items()
        )
        turnover = sum(
            abs(weights.get(ticker, 0) - previous_weights.get(ticker, 0))
            for ticker in set(weights) | set(previous_weights)
        )
        cost = turnover * transaction_cost_bps / 10_000
        net_return = gross_return - cost
        benchmark_return = (
            price_map["SPY"][next_execution_date] / price_map["SPY"][execution_date] - 1
        )
        equity *= 1 + net_return
        benchmark_equity *= 1 + benchmark_return
        periods.append(
            {
                "signal_date": signal_date.isoformat(),
                "execution_date": execution_date.isoformat(),
                "end_date": next_execution_date.isoformat(),
                "holdings": holdings,
                "weights": weights,
                "return": net_return,
                "benchmark_return": benchmark_return,
                "turnover": turnover,
                "equity": equity,
                "benchmark_equity": benchmark_equity,
            }
        )
        previous_weights = weights
    if not periods:
        raise ValueError("No executable monthly periods were found")
    return {"summary": _summary(periods), "monthly_results": periods}


def _month_ends(score_by_date: dict[date, list[ScoreObservation]]) -> list[date]:
    by_month: dict[tuple[int, int], date] = {}
    for current_date in score_by_date:
        key = (current_date.year, current_date.month)
        by_month[key] = max(current_date, by_month.get(key, current_date))
    return sorted(by_month.values())


def _price_data(
    prices: list[PriceObservation],
) -> tuple[dict[str, dict[date, float]], list[date]]:
    price_map: dict[str, dict[date, float]] = defaultdict(dict)
    dates_by_ticker: dict[str, set[date]] = defaultdict(set)
    for observation in prices:
        price_map[observation.ticker][observation.date] = observation.adjusted_close
        dates_by_ticker[observation.ticker].add(observation.date)
    benchmark_dates = sorted(dates_by_ticker.get("SPY", set()))
    return dict(price_map), benchmark_dates


def _next_date(dates: list[date], signal_date: date) -> date | None:
    return next((candidate for candidate in dates if candidate > signal_date), None)


def _select_holdings(
    observations: list[ScoreObservation], strategy: Strategy, metric: Metric
) -> list[str]:
    available = [item for item in observations if getattr(item, metric) is not None]
    if len(available) != len(observations):
        raise ValueError("Missing sector score at rebalance")
    if strategy == "equal_weight":
        holdings = sorted(item.ticker for item in available)
    else:
        count = {"top_1": 1, "top_2": 2, "top_3": 3}[strategy]
        holdings = [
            item.ticker
            for item in sorted(
                available,
                key=lambda item: float(getattr(item, metric) or 0),
                reverse=True,
            )[:count]
        ]
    if not holdings:
        raise ValueError("No complete sector scores are available for a rebalance")
    return holdings


def _summary(periods: list[dict[str, object]]) -> dict[str, float]:
    returns = [float(period["return"]) for period in periods]
    benchmark_returns = [float(period["benchmark_return"]) for period in periods]
    years = len(returns) / 12
    final_equity = float(periods[-1]["equity"])
    cagr = final_equity ** (1 / years) - 1 if years else 0
    volatility = pstdev(returns) * sqrt(12) if len(returns) > 1 else 0
    downside = [min(value, 0) for value in returns]
    downside_deviation = sqrt(mean(value**2 for value in downside)) * sqrt(12)
    annual_return = mean(returns) * 12
    equity_curve = [1.0] + [float(period["equity"]) for period in periods]
    running_max = np.maximum.accumulate(equity_curve)
    drawdowns = np.array(equity_curve) / running_max - 1
    rolling_12 = [
        np.prod([1 + value for value in returns[index - 11 : index + 1]]) - 1
        for index in range(11, len(returns))
    ]
    return {
        "cagr": cagr,
        "maximum_drawdown": float(np.min(drawdowns)),
        "annualized_volatility": volatility,
        "sharpe_ratio": annual_return / volatility if volatility else 0,
        "sortino_ratio": annual_return / downside_deviation if downside_deviation else 0,
        "worst_12_month_return": min(rolling_12) if rolling_12 else min(returns),
        "turnover": mean(float(period["turnover"]) for period in periods),
        "months_outperforming_spy": mean(
            value > benchmark for value, benchmark in zip(returns, benchmark_returns, strict=True)
        ),
        "final_equity": final_equity,
        "benchmark_final_equity": float(periods[-1]["benchmark_equity"]),
    }
