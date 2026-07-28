import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/methodology")({
	component: Methodology,
});

function Methodology() {
	return (
		<article className="page-shell prose-page">
			<p className="eyebrow">Transparent by design</p>
			<h1>Methodology</h1>
			<p className="lede">
				Sector Flow reconstructs investor creations and redemptions from daily
				changes in ETF shares outstanding, then compares that activity across
				the eleven Select Sector SPDR funds.
			</p>
			<h2>Fund-flow calculation</h2>
			<p>
				Daily flow equals the change in split-adjusted shares outstanding
				multiplied by the current day’s NAV. Flow as a percentage of AUM divides
				that result by prior-day assets. We do not use the change in AUM alone
				because market movement changes AUM even when investors do nothing.
			</p>
			<pre>
				<code>flow = (shares today − adjusted shares prior) × NAV today</code>
			</pre>
			<h2>Scores</h2>
			<p>
				The Flow Score blends cross-sector percentile ranks for 20-day flow/AUM
				(40%), 60-day flow/AUM (30%), positive flow days (20%), and five-day
				acceleration (10%). The DCA Score blends Flow Score (60%), 60-day
				relative return versus SPY (30%), and inverse volatility (10%).
			</p>
			<h2>Quality controls</h2>
			<p>
				Rows are flagged when NAV, shares, or assets are invalid; NAV × shares
				materially disagrees with reported assets; or a large unexplained flow
				suggests a parsing or split issue. Common split ratios adjust prior
				shares before flow is calculated.
			</p>
			<h2>Backtest assumptions</h2>
			<p>
				Monthly strategies require 252 trading days of history, freeze signals
				at the prior month end, and trade after the selected one-to-twenty-day
				execution delay. Adjusted closing prices include splits and
				distributions. Transaction costs apply when allocations change.
			</p>
			<p>
				Momentum ranks sectors by trailing 12-month adjusted-price return.
				SPY-core strategies retain 70% in SPY and place 30% in three equal
				active slots. The flow-confirmed variant standardizes each sector’s
				20-day flow/AUM against its own prior 60 observations; unconfirmed slots
				remain in SPY.
			</p>
			<h2>Limitations</h2>
			<p>
				Issuer data and adjusted prices can be revised. Scores are relative, not
				forecasts. Backtests omit taxes, slippage beyond the selected cost, and
				capacity constraints. This site is general research, not personalized
				investment advice.
			</p>
		</article>
	);
}
