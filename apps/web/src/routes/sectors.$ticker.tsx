import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { MiniChart } from "../components/mini-chart";
import { formatUsd } from "../lib/format";
import { getSectorDetail } from "../server/data";

export const Route = createFileRoute("/sectors/$ticker")({
	validateSearch: (search: Record<string, unknown>) => ({
		days: [90, 252, 730].includes(Number(search.days))
			? Number(search.days)
			: 252,
	}),
	loaderDeps: ({ search }) => ({ days: search.days }),
	loader: async ({ params, deps }) => {
		const data = await getSectorDetail({
			data: { ticker: params.ticker.toUpperCase(), days: deps.days },
		});
		if (!data.sector && process.env.DATABASE_URL) throw notFound();
		return data;
	},
	component: SectorDetail,
});

function SectorDetail() {
	const { ticker } = Route.useParams();
	const { days } = Route.useSearch();
	const data = Route.useLoaderData();
	const latest = data.history.at(-1);
	if (!latest)
		return (
			<section className="empty-state">
				<p className="eyebrow">{ticker}</p>
				<h1>No sector history yet.</h1>
				<p>Run the first analytics refresh to populate this page.</p>
			</section>
		);
	return (
		<div className="page-shell detail-page">
			<Link to="/" search={{ metric: "pct" }} className="back-link">
				← All sectors
			</Link>
			<section className="detail-hero">
				<div>
					<p className="eyebrow">
						{ticker} · {latest.date}
					</p>
					<h1>{data.sector}</h1>
					<span className="state">{latest.state}</span>
				</div>
				<div className="metric-cards">
					<article>
						<span>Rank</span>
						<strong>#{latest.rank}</strong>
					</article>
					<article>
						<span>Flow score</span>
						<strong>{latest.flowScore?.toFixed(0)}</strong>
					</article>
					<article>
						<span>DCA score</span>
						<strong>{latest.dcaScore?.toFixed(0)}</strong>
					</article>
					<article>
						<span>20D flow</span>
						<strong>{formatUsd(latest.flow20dUsd)}</strong>
					</article>
				</div>
			</section>
			<div className="period-links">
				<span>History</span>
				{[90, 252, 730].map((period) => (
					<Link
						key={period}
						to="/sectors/$ticker"
						params={{ ticker }}
						search={{ days: period }}
						className={days === period ? "active" : ""}
					>
						{period === 730 ? "2Y" : `${period}D`}
					</Link>
				))}
			</div>
			<section className="chart-grid">
				<article>
					<div>
						<p className="eyebrow">Creations / redemptions</p>
						<h2>Daily fund flow</h2>
					</div>
					<MiniChart
						values={data.history.map((row) => row.flowUsd)}
						labels={data.history.map((row) => row.date)}
						type="bar"
						valueFormat="usd"
						yAxisLabel="Daily flow (USD)"
						ariaLabel="Daily fund flow"
					/>
				</article>
				<article>
					<div>
						<p className="eyebrow">Persistent pressure</p>
						<h2>Rolling 20-day flow</h2>
					</div>
					<MiniChart
						values={data.history.map((row) => row.flow20dUsd)}
						labels={data.history.map((row) => row.date)}
						valueFormat="usd"
						yAxisLabel="20-day flow (USD)"
						ariaLabel="Rolling 20-day fund flow"
					/>
				</article>
				<article>
					<div>
						<p className="eyebrow">Longer horizon</p>
						<h2>Rolling 60-day flow</h2>
					</div>
					<MiniChart
						values={data.history.map((row) => row.flow60dUsd)}
						labels={data.history.map((row) => row.date)}
						valueFormat="usd"
						yAxisLabel="60-day flow (USD)"
						ariaLabel="Rolling 60-day fund flow"
					/>
				</article>
				<article>
					<div>
						<p className="eyebrow">Market confirmation</p>
						<h2>Adjusted ETF price</h2>
					</div>
					<MiniChart
						values={data.history.map((row) => row.closePrice)}
						labels={data.history.map((row) => row.date)}
						valueFormat="usd"
						yAxisLabel="Price (USD)"
						ariaLabel="Adjusted ETF price"
					/>
				</article>
				<article>
					<div>
						<p className="eyebrow">Versus SPY</p>
						<h2>60-day relative return</h2>
					</div>
					<MiniChart
						values={data.history.map((row) => row.relativeReturn60d)}
						labels={data.history.map((row) => row.date)}
						valueFormat="percent"
						yAxisLabel="Relative return"
						ariaLabel="60-day relative return versus SPY"
					/>
				</article>
				<article>
					<div>
						<p className="eyebrow">Cross-sector standing</p>
						<h2>Historical DCA score</h2>
					</div>
					<MiniChart
						values={data.history.map((row) => row.dcaScore)}
						labels={data.history.map((row) => row.date)}
						yAxisLabel="DCA score"
						ariaLabel="Historical DCA score"
					/>
				</article>
			</section>
			{data.signals.length > 0 && (
				<section className="section-block">
					<div className="section-heading">
						<div>
							<p className="eyebrow">Material changes</p>
							<h2>Recent signals</h2>
						</div>
					</div>
					<div className="event-list">
						{data.signals.map((signal) => (
							<article key={signal.id}>
								<time>{signal.date}</time>
								<div>
									<strong>{signal.title}</strong>
									<p>{signal.message}</p>
								</div>
							</article>
						))}
					</div>
				</section>
			)}
		</div>
	);
}
