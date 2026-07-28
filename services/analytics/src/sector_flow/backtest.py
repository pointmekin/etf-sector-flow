from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from math import sqrt
from statistics import mean, pstdev
from typing import Literal

import numpy as np

Strategy = Literal[
    "top_1",
    "top_2",
    "top_3",
    "equal_weight",
    "top_3_momentum",
    "spy_core_flow",
    "spy_core_momentum",
    "spy_core_momentum_flow",
]
Metric = Literal["flow_score", "dca_score"]
WARMUP_TRADING_DAYS = 252
SPY_CORE_WEIGHT = 0.7


@dataclass(frozen=True)
class ScoreObservation:
    date: date
    ticker: str
    flow_score: float | None
    dca_score: float | None
    flow_20d_pct_aum: float | None = None


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
    execution_delay_days: int = 1,
) -> dict[str, object]:
    if transaction_cost_bps < 0 or transaction_cost_bps > 1000:
        raise ValueError("Transaction costs must be between 0 and 1000 bps")
    if execution_delay_days < 1 or execution_delay_days > 20:
        raise ValueError("Execution delay must be between 1 and 20 trading days")
    score_by_date: dict[date, list[ScoreObservation]] = defaultdict(list)
    score_history_by_ticker: dict[str, list[ScoreObservation]] = defaultdict(list)
    for observation in scores:
        score_history_by_ticker[observation.ticker].append(observation)
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
        signal_tickers = [item.ticker for item in score_by_date[signal_date]] + ["SPY"]
        if not _has_warmup(price_map, signal_tickers, signal_date):
            continue
        execution_date = _date_after(common_dates, signal_date, execution_delay_days)
        next_execution_date = _date_after(common_dates, next_signal_date, execution_delay_days)
        if not execution_date or not next_execution_date:
            continue
        weights = _target_weights(
            score_by_date[signal_date],
            strategy,
            metric,
            price_map,
            score_history_by_ticker,
            signal_date,
        )
        holdings = list(weights)
        missing = [
            ticker
            for ticker in set(holdings) | {"SPY"}
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
        raise ValueError(
            f"No executable monthly periods were found after the {WARMUP_TRADING_DAYS}-day warm-up"
        )
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


def _date_after(dates: list[date], signal_date: date, trading_days: int) -> date | None:
    candidates = [candidate for candidate in dates if candidate > signal_date]
    index = trading_days - 1
    return candidates[index] if len(candidates) > index else None


def _has_warmup(
    price_map: dict[str, dict[date, float]], tickers: list[str], signal_date: date
) -> bool:
    required_prices = WARMUP_TRADING_DAYS + 1
    return all(
        sum(day <= signal_date for day in price_map.get(ticker, {})) >= required_prices
        for ticker in tickers
    )


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


def _target_weights(
    observations: list[ScoreObservation],
    strategy: Strategy,
    metric: Metric,
    price_map: dict[str, dict[date, float]],
    score_history_by_ticker: dict[str, list[ScoreObservation]],
    signal_date: date,
) -> dict[str, float]:
    if strategy in {"top_3_momentum", "spy_core_momentum", "spy_core_momentum_flow"}:
        active = _momentum_holdings(observations, price_map, signal_date)
        if strategy == "spy_core_momentum_flow":
            active = _flow_confirmed_holdings(active, score_history_by_ticker, signal_date)
    elif strategy == "spy_core_flow":
        active = _ranked_holdings(observations, metric, 3)
    else:
        active = _select_holdings(observations, strategy, metric)

    if strategy == "spy_core_momentum_flow":
        slot_weight = (1 - SPY_CORE_WEIGHT) / 3
        spy_weight = 1 - slot_weight * len(active)
        return {"SPY": spy_weight, **dict.fromkeys(active, slot_weight)}
    if strategy in {"spy_core_flow", "spy_core_momentum"}:
        active_weight = (1 - SPY_CORE_WEIGHT) / len(active)
        return {"SPY": SPY_CORE_WEIGHT, **dict.fromkeys(active, active_weight)}
    return dict.fromkeys(active, 1 / len(active))


def _ranked_holdings(
    observations: list[ScoreObservation], metric: Metric, count: int
) -> list[str]:
    available = [item for item in observations if getattr(item, metric) is not None]
    if len(available) != len(observations):
        raise ValueError("Missing sector score at rebalance")
    return [
        item.ticker
        for item in sorted(
            available,
            key=lambda item: float(getattr(item, metric) or 0),
            reverse=True,
        )[:count]
    ]


def _momentum_holdings(
    observations: list[ScoreObservation],
    price_map: dict[str, dict[date, float]],
    signal_date: date,
) -> list[str]:
    returns = {
        item.ticker: _trailing_return(price_map[item.ticker], signal_date)
        for item in observations
    }
    return sorted(returns, key=lambda ticker: returns[ticker], reverse=True)[:3]


def _trailing_return(prices: dict[date, float], signal_date: date) -> float:
    history = [price for day, price in sorted(prices.items()) if day <= signal_date]
    required_prices = WARMUP_TRADING_DAYS + 1
    if len(history) < required_prices:
        raise ValueError(f"Momentum requires {WARMUP_TRADING_DAYS} trading days of history")
    sample = history[-required_prices:]
    return sample[-1] / sample[0] - 1


def _flow_confirmed_holdings(
    candidates: list[str],
    history_by_ticker: dict[str, list[ScoreObservation]],
    signal_date: date,
) -> list[str]:
    return [
        ticker
        for ticker in candidates
        if _flow_surprise(history_by_ticker[ticker], signal_date) > 0
    ]


def _flow_surprise(observations: list[ScoreObservation], signal_date: date) -> float:
    values = [
        float(item.flow_20d_pct_aum)
        for item in sorted(observations, key=lambda item: item.date)
        if item.date <= signal_date and item.flow_20d_pct_aum is not None
    ]
    if len(values) < 61:
        return 0
    current = values[-1]
    baseline = values[-61:-1]
    baseline_mean = mean(baseline)
    deviation = pstdev(baseline)
    if deviation:
        return (current - baseline_mean) / deviation
    return float((current > baseline_mean) - (current < baseline_mean))


def _summary(periods: list[dict[str, object]]) -> dict[str, float]:
    returns = [float(period["return"]) for period in periods]
    benchmark_returns = [float(period["benchmark_return"]) for period in periods]
    strategy = _performance_metrics(
        returns, [float(period["equity"]) for period in periods]
    )
    benchmark = _performance_metrics(
        benchmark_returns, [float(period["benchmark_equity"]) for period in periods]
    )
    active_returns = [
        value - benchmark
        for value, benchmark in zip(returns, benchmark_returns, strict=True)
    ]
    tracking_error = pstdev(active_returns) * sqrt(12) if len(active_returns) > 1 else 0
    return {
        **strategy,
        "benchmark_cagr": benchmark["cagr"],
        "benchmark_maximum_drawdown": benchmark["maximum_drawdown"],
        "benchmark_annualized_volatility": benchmark["annualized_volatility"],
        "benchmark_sharpe_ratio": benchmark["sharpe_ratio"],
        "benchmark_sortino_ratio": benchmark["sortino_ratio"],
        "benchmark_worst_12_month_return": benchmark["worst_12_month_return"],
        "excess_cagr": strategy["cagr"] - benchmark["cagr"],
        "tracking_error": tracking_error,
        "information_ratio": mean(active_returns) * 12 / tracking_error if tracking_error else 0,
        "turnover": mean(float(period["turnover"]) for period in periods),
        "months_outperforming_spy": mean(
            value > benchmark for value, benchmark in zip(returns, benchmark_returns, strict=True)
        ),
        "final_equity": strategy["final_equity"],
        "benchmark_final_equity": float(periods[-1]["benchmark_equity"]),
    }


def _performance_metrics(returns: list[float], equities: list[float]) -> dict[str, float]:
    years = len(returns) / 12
    final_equity = equities[-1]
    cagr = final_equity ** (1 / years) - 1 if years else 0
    volatility = pstdev(returns) * sqrt(12) if len(returns) > 1 else 0
    downside = [min(value, 0) for value in returns]
    downside_deviation = sqrt(mean(value**2 for value in downside)) * sqrt(12)
    annual_return = mean(returns) * 12
    equity_curve = [1.0, *equities]
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
        "final_equity": final_equity,
    }
