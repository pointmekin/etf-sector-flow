import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { EquityComparisonChart } from "../components/mini-chart";
import { tone } from "../lib/format";
import { SECTOR_NAMES } from "../lib/sectors";
import {
	type BacktestResult,
	type BacktestStrategy,
	requestBacktest,
} from "../server/backtest";

export const Route = createFileRoute("/backtest")({ component: BacktestPage });

const labels: Record<string, string> = {
	cagr: "CAGR",
	benchmark_cagr: "SPY CAGR",
	excess_cagr: "Excess CAGR",
	maximum_drawdown: "Max drawdown",
	benchmark_maximum_drawdown: "SPY max drawdown",
	annualized_volatility: "Volatility",
	benchmark_annualized_volatility: "SPY volatility",
	sharpe_ratio: "Sharpe",
	information_ratio: "Information ratio",
	tracking_error: "Tracking error",
	turnover: "Avg turnover",
	months_outperforming_spy: "Beat SPY",
};

const descriptions: Record<string, string> = {
	cagr: "Compound annual growth rate — the steady yearly return that would produce this result.",
	benchmark_cagr: "The same yearly return, for simply buying and holding SPY.",
	excess_cagr:
		"Strategy CAGR minus SPY CAGR. Positive means the rotation added value.",
	maximum_drawdown:
		"Largest peak-to-trough fall — the worst decline you would have had to sit through.",
	benchmark_maximum_drawdown:
		"SPY's worst peak-to-trough fall over the same window.",
	annualized_volatility:
		"How much monthly returns swing, stated per year. Higher means a bumpier ride.",
	benchmark_annualized_volatility:
		"SPY's return swing over the same window, for comparison.",
	sharpe_ratio:
		"Return earned per unit of total risk. Higher is better; above 1 is strong.",
	information_ratio:
		"Excess return over SPY per unit of tracking error — how reliably it beats the benchmark.",
	tracking_error:
		"How far returns stray from SPY. Higher means the portfolio behaves less like the market.",
	turnover:
		"Share of the portfolio traded at an average rebalance. More turnover means more cost.",
	months_outperforming_spy:
		"Share of months the strategy returned more than SPY.",
};

export function BacktestPage() {
	const [result, setResult] = useState<BacktestResult | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setPending(true);
		setError(null);
		const form = new FormData(event.currentTarget);
		try {
			setResult(
				await requestBacktest({
					data: {
						strategy: String(form.get("strategy")) as BacktestStrategy,
						metric: String(form.get("metric")) as "flow_score" | "dca_score",
						start_date: String(form.get("start_date") || "") || null,
						transaction_cost_bps: Number(form.get("transaction_cost_bps")),
						execution_delay_days: Number(form.get("execution_delay_days")),
					},
				}),
			);
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : "Backtest failed");
		} finally {
			setPending(false);
		}
	}

	return (
		<div className="page-shell backtest-page">
			<section className="backtest-intro">
				<div>
					<p className="eyebrow">Strategy lab</p>
					<h1>Test the rotation.</h1>
					<p className="hero-copy">
						Compare flow rankings, sector momentum, and SPY-core portfolios.
						Every test requires a full 252-trading-day history before its first
						signal.
					</p>
				</div>
				<form onSubmit={submit} className="backtest-form">
					<label>
						<span>Strategy</span>
						<select name="strategy" defaultValue="top_3">
							<option value="top_1">Top 1 sector</option>
							<option value="top_2">Top 2 equal weight</option>
							<option value="top_3">Top 3 equal weight</option>
							<option value="equal_weight">All sectors equal weight</option>
							<option value="top_3_momentum">Top 3 by 12-month momentum</option>
							<option value="spy_core_flow">
								70% SPY + flow-ranked sleeve
							</option>
							<option value="spy_core_momentum">
								70% SPY + momentum sleeve
							</option>
							<option value="spy_core_momentum_flow">
								Momentum + flow confirmation
							</option>
						</select>
					</label>
					<label>
						<span>Ranking metric</span>
						<select name="metric" defaultValue="dca_score">
							<option value="dca_score">DCA score</option>
							<option value="flow_score">Flow score</option>
						</select>
					</label>
					<label>
						<span>Start date</span>
						<input name="start_date" type="date" />
					</label>
					<label>
						<span>Execution delay (trading days)</span>
						<input
							name="execution_delay_days"
							type="number"
							min="1"
							max="20"
							step="1"
							defaultValue="1"
						/>
					</label>
					<label>
						<span>Transaction cost (bps)</span>
						<input
							name="transaction_cost_bps"
							type="number"
							min="0"
							max="1000"
							step="1"
							defaultValue="5"
						/>
					</label>
					<button type="submit" disabled={pending}>
						{pending ? "Running…" : "Run backtest"}
					</button>
					{error && <p className="form-error">{error}</p>}
				</form>
			</section>
			{result && <BacktestResults result={result} />}
		</div>
	);
}

export function BacktestResults({ result }: { result: BacktestResult }) {
	const summaryEntries = Object.entries(result.summary).filter(([key]) =>
		Object.hasOwn(labels, key),
	);
	return (
		<section className="backtest-results">
			<div className="summary-grid">
				{summaryEntries.map(([key, value]) => (
					<article key={key}>
						<span>{labels[key]}</span>
						<strong>
							{key.includes("ratio")
								? value.toFixed(2)
								: `${(value * 100).toFixed(1)}%`}
						</strong>
						{descriptions[key] && (
							<p className="metric-note">{descriptions[key]}</p>
						)}
					</article>
				))}
			</div>
			<div className="backtest-charts">
				<article className="equity-comparison">
					<div>
						<p className="eyebrow">Performance comparison</p>
						<h2>Growth of $1: Strategy vs. SPY</h2>
					</div>
					<EquityComparisonChart
						dates={result.monthly_results.map((row) => row.execution_date)}
						strategy={result.monthly_results.map((row) => row.equity)}
						spy={result.monthly_results.map((row) => row.benchmark_equity)}
					/>
				</article>
			</div>
			<section className="section-block">
				<div className="section-heading">
					<div>
						<p className="eyebrow">Rebalance ledger</p>
						<h2>Monthly holdings</h2>
					</div>
				</div>
				<div className="table-scroll">
					<table>
						<thead>
							<tr>
								<th>Signal</th>
								<th>Execution</th>
								<th>Allocation</th>
								<th>Return</th>
								<th>SPY</th>
							</tr>
						</thead>
						<tbody>
							{result.monthly_results.map((row) => (
								<tr key={row.execution_date}>
									<td data-label="Signal">{row.signal_date}</td>
									<td data-label="Execution">{row.execution_date}</td>
									<td
										data-label="Allocation"
										className="cell-holdings cell-wide"
									>
										<div className="holding-list">
											{row.holdings.map((ticker) => (
												<span key={ticker}>
													<strong>{ticker}</strong>{" "}
													{SECTOR_NAMES[ticker] ??
														(ticker === "SPY" ? "S&P 500" : "Sector")}{" "}
													{((row.weights[ticker] ?? 0) * 100).toFixed(1)}%
												</span>
											))}
										</div>
									</td>
									<td data-label="Return" className={`flow-${tone(row.return)}`}>
										{(row.return * 100).toFixed(2)}%
									</td>
									<td
										data-label="SPY"
										className={`flow-${tone(row.benchmark_return)}`}
									>
										{(row.benchmark_return * 100).toFixed(2)}%
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</section>
		</section>
	);
}
