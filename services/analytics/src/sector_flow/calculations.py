from dataclasses import dataclass, replace
from datetime import date
from math import log, sqrt

import numpy as np

COMMON_SPLIT_RATIOS = (0.333333, 0.5, 2.0, 3.0, 4.0)


@dataclass(frozen=True)
class FlowRow:
    date: date
    nav: float
    shares_outstanding: float
    aum: float
    close_price: float | None = None
    quality_status: str = "ok"
    quality_note: str | None = None
    shares_change: float | None = None
    flow_usd: float | None = None
    flow_pct_aum: float | None = None


def calculate_flows(rows: list[FlowRow]) -> list[FlowRow]:
    ordered = sorted(rows, key=lambda row: row.date)
    calculated: list[FlowRow] = []
    for index, current in enumerate(ordered):
        if index == 0:
            calculated.append(current)
            continue
        previous = ordered[index - 1]
        adjusted_shares, split_note = adjust_previous_shares(previous, current)
        shares_change = current.shares_outstanding - adjusted_shares
        flow_usd = shares_change * current.nav
        flow_pct_aum = flow_usd / previous.aum if previous.aum else None
        quality_status = current.quality_status
        notes = [note for note in (current.quality_note, split_note) if note]
        if flow_pct_aum is not None and abs(flow_pct_aum) > 0.25 and split_note is None:
            quality_status = "review"
            notes.append("Flow exceeds 25% of prior AUM")
        calculated.append(
            replace(
                current,
                shares_change=shares_change,
                flow_usd=flow_usd,
                flow_pct_aum=flow_pct_aum,
                quality_status=quality_status,
                quality_note="; ".join(notes) or None,
            )
        )
    return calculated


def adjust_previous_shares(previous: FlowRow, current: FlowRow) -> tuple[float, str | None]:
    if previous.nav <= 0 or previous.shares_outstanding <= 0:
        return previous.shares_outstanding, None
    nav_ratio = current.nav / previous.nav
    shares_ratio = current.shares_outstanding / previous.shares_outstanding
    for ratio in COMMON_SPLIT_RATIOS:
        if _near(shares_ratio, ratio) and _near(nav_ratio, 1 / ratio):
            return previous.shares_outstanding * ratio, f"Adjusted suspected {ratio:g}:1 split"
    return previous.shares_outstanding, None


def build_sector_metrics(
    rows_by_ticker: dict[str, list[FlowRow]],
    sectors: dict[str, str],
    spy_prices: dict[date, float],
) -> list[dict[str, object]]:
    daily: dict[date, list[dict[str, object]]] = {}
    for ticker, source_rows in rows_by_ticker.items():
        rows = [
            row
            for row in sorted(source_rows, key=lambda item: item.date)
            if row.quality_status == "ok"
        ]
        prices = {row.date: row.close_price for row in rows if row.close_price is not None}
        for index, row in enumerate(rows):
            metric = _rolling_metric(ticker, sectors[ticker], rows, index, prices, spy_prices)
            daily.setdefault(row.date, []).append(metric)

    output: list[dict[str, object]] = []
    for _current_date, metrics in sorted(daily.items()):
        if len(metrics) != len(rows_by_ticker):
            continue
        flow_scores = _flow_scores(metrics)
        returns = _percentiles(metrics, "relative_return_60d")
        inverse_volatility = _percentiles(metrics, "volatility_60d", reverse=True)
        for metric in metrics:
            ticker = str(metric["representative_ticker"])
            flow_score = flow_scores[ticker]
            dca_score = 0.6 * flow_score + 0.3 * returns[ticker] + 0.1 * inverse_volatility[ticker]
            metric["flow_score"] = round(flow_score, 2)
            metric["dca_score"] = round(dca_score, 2)
        ranked = sorted(metrics, key=lambda item: float(item["dca_score"]), reverse=True)
        for rank, metric in enumerate(ranked, 1):
            metric["rank"] = rank
            metric["state"] = classify_state(metric)
            metric.pop("flow_acceleration", None)
            metric.pop("price_extended", None)
            output.append(metric)
    return output


def classify_state(metric: dict[str, object]) -> str:
    flow_5d = float(metric.get("flow_5d_usd") or 0)
    flow_20d = float(metric.get("flow_20d_usd") or 0)
    flow_60d = float(metric.get("flow_60d_usd") or 0)
    score = float(metric.get("flow_score") or 0)
    if score >= 85 and bool(metric.get("price_extended")):
        return "Strong but Crowded"
    if flow_20d > 0 and flow_60d > 0 and score >= 65:
        return "Accumulation"
    if flow_5d > 0 and float(metric.get("flow_acceleration") or 0) > 0 and flow_60d <= 0:
        return "Early Rotation"
    if flow_20d < 0 and flow_60d < 0 and score < 35:
        return "Distribution"
    return "Neutral"


def _rolling_metric(
    ticker: str,
    sector: str,
    rows: list[FlowRow],
    index: int,
    prices: dict[date, float | None],
    spy_prices: dict[date, float],
) -> dict[str, object]:
    row = rows[index]
    metric: dict[str, object] = {
        "sector": sector,
        "date": row.date,
        "representative_ticker": ticker,
        "flow_1d_usd": row.flow_usd,
    }
    for window in (5, 20, 60, 252):
        sample = rows[max(0, index - window + 1) : index + 1]
        flows = [item.flow_usd for item in sample if item.flow_usd is not None]
        flow_sum = sum(flows) if flows else None
        metric[f"flow_{window}d_usd"] = flow_sum
        base_aum = sample[0].aum if sample else 0
        metric[f"flow_{window}d_pct_aum"] = (
            flow_sum / base_aum if flow_sum is not None and base_aum else None
        )
    recent = rows[max(0, index - 19) : index + 1]
    metric["positive_flow_days_20d"] = sum(1 for item in recent if (item.flow_usd or 0) > 0)
    previous_5d = rows[max(0, index - 9) : max(0, index - 4)]
    metric["flow_acceleration"] = float(metric["flow_5d_usd"] or 0) - sum(
        item.flow_usd or 0 for item in previous_5d
    )
    price_values = [
        (day, price) for day, price in prices.items() if day <= row.date and price is not None
    ]
    metric["relative_return_60d"] = _relative_return(price_values, spy_prices, 60)
    metric["volatility_60d"] = _volatility([price for _, price in price_values[-61:]])
    long_prices = [price for _, price in price_values[-252:]]
    metric["price_extended"] = bool(
        long_prices and long_prices[-1] > 1.1 * float(np.mean(long_prices))
    )
    return metric


def _flow_scores(metrics: list[dict[str, object]]) -> dict[str, float]:
    p20 = _percentiles(metrics, "flow_20d_pct_aum")
    p60 = _percentiles(metrics, "flow_60d_pct_aum")
    positive = _percentiles(metrics, "positive_flow_days_20d")
    acceleration = _percentiles(metrics, "flow_acceleration")
    return {
        str(metric["representative_ticker"]): (
            0.4 * p20[str(metric["representative_ticker"])]
            + 0.3 * p60[str(metric["representative_ticker"])]
            + 0.2 * positive[str(metric["representative_ticker"])]
            + 0.1 * acceleration[str(metric["representative_ticker"])]
        )
        for metric in metrics
    }


def _percentiles(
    metrics: list[dict[str, object]], key: str, reverse: bool = False
) -> dict[str, float]:
    ordered = sorted(metrics, key=lambda item: float(item.get(key) or 0), reverse=reverse)
    denominator = max(1, len(ordered) - 1)
    return {
        str(metric["representative_ticker"]): index / denominator * 100
        for index, metric in enumerate(ordered)
    }


def _relative_return(
    prices: list[tuple[date, float]], spy_prices: dict[date, float], window: int
) -> float:
    if len(prices) < 2:
        return 0.0
    sample = prices[-(window + 1) :]
    start_date, start_price = sample[0]
    end_date, end_price = sample[-1]
    spy_start = spy_prices.get(start_date)
    spy_end = spy_prices.get(end_date)
    if not spy_start or not spy_end or not start_price:
        return 0.0
    return end_price / start_price - 1 - (spy_end / spy_start - 1)


def _volatility(prices: list[float]) -> float:
    if len(prices) < 2:
        return 0.0
    returns = [
        log(current / previous)
        for previous, current in zip(prices, prices[1:], strict=False)
        if previous > 0
    ]
    return float(np.std(returns, ddof=1) * sqrt(252)) if len(returns) > 1 else 0.0


def _near(value: float, target: float, tolerance: float = 0.03) -> bool:
    return target != 0 and abs(value - target) / abs(target) <= tolerance
