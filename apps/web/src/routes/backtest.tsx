import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/backtest")({ component: BacktestPage });

function BacktestPage() {
	return (
		<section className="empty-state">
			<p className="eyebrow">Strategy lab</p>
			<h1>Backtesting arrives in M3.</h1>
			<p>
				The public dashboard and sector histories are available first; the
				monthly, look-ahead-safe strategy engine is the next phase.
			</p>
		</section>
	);
}
