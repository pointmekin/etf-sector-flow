import { Link } from "@tanstack/react-router";
import type { DashboardData, SectorRow } from "../lib/types";
import { formatPercent, formatUsd, tone } from "../lib/format";

type Metric = "pct" | "usd";

const periods = [
	["1D", "flow1dUsd", "flow1dPctAum"],
	["5D", "flow5dUsd", "flow5dPctAum"],
	["20D", "flow20dUsd", "flow20dPctAum"],
	["60D", "flow60dUsd", "flow60dPctAum"],
	["1Y", "flow252dUsd", "flow252dPctAum"],
] as const;

export function DashboardView({
	data,
	metric,
}: {
	data: DashboardData;
	metric: Metric;
}) {
	if (!data.date || data.sectors.length === 0) {
		return (
			<section className="empty-state">
				<p className="eyebrow">Awaiting first refresh</p>
				<h1>The monitor is ready for data.</h1>
				<p>
					Configure the database and analytics service, run the daily refresh,
					then reload this page.
				</p>
				<Link to="/methodology" className="button">
					Read the methodology
				</Link>
			</section>
		);
	}

	const leader = data.sectors[0];
	return (
		<div className="page-shell dashboard">
			<section className="hero">
				<div>
					<p className="eyebrow">US sector rotation · {data.date}</p>
					<h1>
						Follow capital.
						<br />
						See the rotation.
					</h1>
					<p className="hero-copy">
						Daily creations and redemptions reconstructed from ETF shares
						outstanding—not price-driven AUM noise.
					</p>
				</div>
				<div className="leader-panel">
					<span className="leader-rank">#1</span>
					<p>Current DCA leader</p>
					<strong>{leader?.sector}</strong>
					<span>
						{leader?.ticker} · score {leader?.dcaScore?.toFixed(1) ?? "—"}
					</span>
				</div>
			</section>

			<StatusStrip data={data} />
			<Signals signals={data.signals} />

			<section className="section-block">
				<div className="section-heading">
					<div>
						<p className="eyebrow">Daily ranking</p>
						<h2>Where the flow is going</h2>
					</div>
					<MetricToggle metric={metric} />
				</div>
				<RankingTable sectors={data.sectors} metric={metric} />
			</section>

			<section className="split-layout">
				<div className="section-block heatmap-panel">
					<div className="section-heading">
						<div>
							<p className="eyebrow">Flow map</p>
							<h2>Pressure by horizon</h2>
						</div>
					</div>
					<FlowHeatmap sectors={data.sectors} metric={metric} />
				</div>
				<div className="section-block score-panel">
					<div className="section-heading">
						<div>
							<p className="eyebrow">Cross-sector</p>
							<h2>DCA score spread</h2>
						</div>
					</div>
					<ScoreBars sectors={data.sectors} />
				</div>
			</section>
		</div>
	);
}

function StatusStrip({ data }: { data: DashboardData }) {
	const completed = data.latestJob?.finishedAt
		? new Intl.DateTimeFormat("en-US", {
				dateStyle: "medium",
				timeStyle: "short",
			}).format(new Date(data.latestJob.finishedAt))
		: "No completed job";
	return (
		<section className="status-strip" aria-label="Data status">
			<div>
				<span>Source date</span>
				<strong>{data.date}</strong>
			</div>
			<div>
				<span>Refresh</span>
				<strong className={`status-${data.latestJob?.status ?? "unknown"}`}>
					{data.latestJob?.status ?? "unknown"}
				</strong>
			</div>
			<div>
				<span>Completed</span>
				<strong>{completed}</strong>
			</div>
			<div>
				<span>Universe</span>
				<strong>{data.sectors.length} sectors</strong>
			</div>
		</section>
	);
}

function Signals({ signals }: { signals: DashboardData["signals"] }) {
	if (signals.length === 0) return null;
	return (
		<section className="signal-rail" aria-label="Latest signals">
			<div className="signal-label">
				<span className="pulse" /> Latest changes
			</div>
			<div className="signal-list">
				{signals.slice(0, 4).map((signal) => (
					<article key={signal.id}>
						<strong>{signal.title}</strong>
						<span>{signal.message}</span>
					</article>
				))}
			</div>
		</section>
	);
}

function MetricToggle({ metric }: { metric: Metric }) {
	return (
		<fieldset className="segmented">
			<legend className="sr-only">Flow units</legend>
			<Link
				to="/"
				search={{ metric: "pct" }}
				className={metric === "pct" ? "active" : ""}
			>
				% AUM
			</Link>
			<Link
				to="/"
				search={{ metric: "usd" }}
				className={metric === "usd" ? "active" : ""}
			>
				USD
			</Link>
		</fieldset>
	);
}

function RankingTable({
	sectors,
	metric,
}: {
	sectors: SectorRow[];
	metric: Metric;
}) {
	const value = (row: SectorRow, usd: keyof SectorRow, pct: keyof SectorRow) =>
		metric === "usd"
			? formatUsd(row[usd] as number | null)
			: formatPercent(row[pct] as number | null);
	return (
		<div className="table-scroll">
			<table>
				<thead>
					<tr>
						<th>Rank</th>
						<th>Sector</th>
						<th>State</th>
						<th>1D</th>
						<th>5D</th>
						<th>20D</th>
						<th>60D</th>
						<th>Flow</th>
						<th>DCA</th>
						<th>Δ Rank</th>
					</tr>
				</thead>
				<tbody>
					{sectors.map((sector) => (
						<tr key={sector.ticker}>
							<td className="rank">{sector.rank}</td>
							<td>
								<Link
									to="/sectors/$ticker"
									params={{ ticker: sector.ticker }}
									search={{ days: 252 }}
									className="sector-link"
								>
									<strong>{sector.sector}</strong>
									<span>{sector.ticker}</span>
								</Link>
							</td>
							<td>
								<span
									className={`state state-${sector.state?.toLowerCase().replaceAll(" ", "-")}`}
								>
									{sector.state ?? "Neutral"}
								</span>
							</td>
							<FlowCell
								value={
									metric === "usd" ? sector.flow1dUsd : sector.flow1dPctAum
								}
								label={value(sector, "flow1dUsd", "flow1dPctAum")}
							/>
							<FlowCell
								value={
									metric === "usd" ? sector.flow5dUsd : sector.flow5dPctAum
								}
								label={value(sector, "flow5dUsd", "flow5dPctAum")}
							/>
							<FlowCell
								value={
									metric === "usd" ? sector.flow20dUsd : sector.flow20dPctAum
								}
								label={value(sector, "flow20dUsd", "flow20dPctAum")}
							/>
							<FlowCell
								value={
									metric === "usd" ? sector.flow60dUsd : sector.flow60dPctAum
								}
								label={value(sector, "flow60dUsd", "flow60dPctAum")}
							/>
							<td>
								<Score value={sector.flowScore} />
							</td>
							<td>
								<Score value={sector.dcaScore} accent />
							</td>
							<td className={`flow-${tone(sector.rankChange)}`}>
								{sector.rankChange === null
									? "—"
									: sector.rankChange > 0
										? `+${sector.rankChange}`
										: sector.rankChange}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function FlowCell({ value, label }: { value: number | null; label: string }) {
	return <td className={`flow-${tone(value)}`}>{label}</td>;
}

function Score({
	value,
	accent = false,
}: {
	value: number | null;
	accent?: boolean;
}) {
	const safe = value ?? 0;
	return (
		<span
			className={`score ${accent ? "score-accent" : ""}`}
			style={{ "--score": `${safe}%` } as React.CSSProperties}
		>
			{value?.toFixed(0) ?? "—"}
		</span>
	);
}

function FlowHeatmap({
	sectors,
	metric,
}: {
	sectors: SectorRow[];
	metric: Metric;
}) {
	return (
		<div className="heatmap">
			<div className="heatmap-row heatmap-head">
				<span>Sector</span>
				{periods.map(([label]) => (
					<span key={label}>{label}</span>
				))}
			</div>
			{sectors.map((sector) => (
				<div className="heatmap-row" key={sector.ticker}>
					<span>{sector.ticker}</span>
					{periods.map(([label, usd, pct]) => {
						const value = sector[metric === "usd" ? usd : pct] as number | null;
						return (
							<span
								key={label}
								className={`heat ${tone(value)}`}
								title={`${sector.sector} ${label}: ${metric === "usd" ? formatUsd(value) : formatPercent(value)}`}
							>
								{metric === "usd" ? formatUsd(value) : formatPercent(value)}
							</span>
						);
					})}
				</div>
			))}
		</div>
	);
}

function ScoreBars({ sectors }: { sectors: SectorRow[] }) {
	return (
		<div className="score-bars">
			{sectors.map((sector) => (
				<div key={sector.ticker}>
					<span>{sector.ticker}</span>
					<div>
						<i style={{ width: `${sector.dcaScore ?? 0}%` }} />
					</div>
					<strong>{sector.dcaScore?.toFixed(0) ?? "—"}</strong>
				</div>
			))}
		</div>
	);
}
