import { expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { BacktestPage, BacktestResults } from "../routes/backtest";
import type { BacktestResult } from "../server/backtest";

test("strategy form exposes benchmark-aware choices and timing", () => {
	const html = renderToString(<BacktestPage />);

	expect(html).toContain("Top 3 by 12-month momentum");
	expect(html).toContain("70% SPY + momentum sleeve");
	expect(html).toContain("Momentum + flow confirmation");
	expect(html).toContain("Execution delay (trading days)");
});

test("results show benchmark-relative metrics and allocation weights", () => {
	const result: BacktestResult = {
		id: "test",
		status: "succeeded",
		summary: {
			cagr: 0.12,
			benchmark_cagr: 0.1,
			excess_cagr: 0.02,
			tracking_error: 0.04,
			information_ratio: 0.5,
		},
		monthly_results: [
			{
				signal_date: "2025-01-31",
				execution_date: "2025-02-03",
				end_date: "2025-03-03",
				holdings: ["SPY", "XLK"],
				weights: { SPY: 0.7, XLK: 0.3 },
				return: 0.02,
				benchmark_return: 0.01,
				turnover: 1,
				equity: 1.02,
				benchmark_equity: 1.01,
			},
		],
	};

	const html = renderToString(<BacktestResults result={result} />);

	expect(html).toContain("SPY CAGR");
	expect(html).toContain("Excess CAGR");
	expect(html).toContain("Tracking error");
	expect(html).toContain("Information ratio");
	expect(html).toContain("70.0");
	expect(html).toContain("S&amp;P 500");
});
