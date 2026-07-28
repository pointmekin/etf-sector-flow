import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { EquityComparisonChart } from "../components/mini-chart";
import { tone } from "../lib/format";
import { type BacktestResult, requestBacktest } from "../server/backtest";

export const Route = createFileRoute("/backtest")({ component: BacktestPage });

const labels: Record<string, string> = {
	cagr: "CAGR",
	maximum_drawdown: "Max drawdown",
	annualized_volatility: "Volatility",
	sharpe_ratio: "Sharpe",
	sortino_ratio: "Sortino",
	worst_12_month_return: "Worst 12M",
	turnover: "Avg turnover",
	months_outperforming_spy: "Beat SPY",
};

function BacktestPage() {
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
						strategy: String(form.get("strategy")) as
							| "top_1"
							| "top_2"
							| "top_3"
							| "equal_weight",
						metric: String(form.get("metric")) as "flow_score" | "dca_score",
						start_date: String(form.get("start_date") || "") || null,
						transaction_cost_bps: Number(form.get("transaction_cost_bps")),
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
						Monthly, equal-weight sector strategies. Signals are frozen at the
						prior month end and executed on the next available trading day.
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

function BacktestResults({ result }: { result: BacktestResult }) {
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
								<th>Holdings</th>
								<th>Return</th>
								<th>SPY</th>
							</tr>
						</thead>
						<tbody>
							{result.monthly_results.map((row) => (
								<tr key={row.execution_date}>
									<td>{row.signal_date}</td>
									<td>{row.execution_date}</td>
									<td>{row.holdings.join(" · ")}</td>
									<td className={`flow-${tone(row.return)}`}>
										{(row.return * 100).toFixed(2)}%
									</td>
									<td className={`flow-${tone(row.benchmark_return)}`}>
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
