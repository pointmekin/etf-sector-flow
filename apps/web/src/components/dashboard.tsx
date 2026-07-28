import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { formatPercent, formatUsd, tone } from "../lib/format";
import type {
	DashboardData,
	FlowHistoryPoint,
	SectorRow,
} from "../lib/types";

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

			<FlowStateGuide sectors={data.sectors} />
			<SectorFlowTimeline
				sectors={data.sectors}
				points={data.flowHistory}
			/>
		</div>
	);
}

const flowStates = [
	{
		name: "Distribution",
		description:
			"Persistent 20- and 60-day outflows with a Flow Score below 35. Redemptions are dominating.",
	},
	{
		name: "Neutral",
		description:
			"Flows are mixed or lack enough persistence to support a positive or negative classification.",
	},
	{
		name: "Early Rotation",
		description:
			"Five-day flows and acceleration have turned positive while the longer 60-day trend is still catching up.",
	},
	{
		name: "Accumulation",
		description:
			"Both 20- and 60-day flows are positive and the Flow Score is at least 65. Capital is building steadily.",
	},
	{
		name: "Strong but Crowded",
		description:
			"The Flow Score is at least 85 and price is extended. Demand is strong, but crowding risk is elevated.",
	},
] as const;

function FlowStateGuide({ sectors }: { sectors: SectorRow[] }) {
	return (
		<section className="section-block phase-section">
			<div className="section-heading">
				<div>
					<p className="eyebrow">Flow phases</p>
					<h2>Read the capital cycle</h2>
				</div>
				<p className="phase-direction">Net selling → building demand → extended demand</p>
			</div>
			<div className="phase-track">
				{flowStates.map((phase, index) => {
					const members = sectors.filter((sector) => sector.state === phase.name);
					return (
						<article className={`phase-card phase-${index + 1}`} key={phase.name}>
							<span className="phase-index">0{index + 1}</span>
							<h3>{phase.name}</h3>
							<p>{phase.description}</p>
							<div className="phase-members">
								{members.length ? (
									members.map((sector) => (
										<Link
											key={sector.ticker}
											to="/sectors/$ticker"
											params={{ ticker: sector.ticker }}
											search={{ days: 252 }}
										>
											<strong>{sector.ticker}</strong> {sector.sector}
										</Link>
									))
								) : (
									<span>No sectors currently</span>
								)}
							</div>
						</article>
					);
				})}
			</div>
		</section>
	);
}

function SectorFlowTimeline({
	sectors,
	points,
}: {
	sectors: SectorRow[];
	points: FlowHistoryPoint[];
}) {
	const [active, setActive] = useState<FlowHistoryPoint | null>(null);
	const dates = [...new Set(points.map((point) => point.date))].sort();
	const byTicker = new Map<string, Map<string, FlowHistoryPoint>>();
	for (const point of points) {
		const history = byTicker.get(point.ticker) ?? new Map();
		history.set(point.date, point);
		byTicker.set(point.ticker, history);
	}
	if (dates.length === 0) return null;

	return (
		<section className="section-block timeline-section">
			<div className="section-heading">
				<div>
					<p className="eyebrow">Daily creations and redemptions</p>
					<h2>How money moves through sectors</h2>
				</div>
				<div className="flow-legend">
					<span className="inflow-key">Inflow</span>
					<span className="outflow-key">Outflow</span>
				</div>
			</div>
			<p className="timeline-note">
				Each row shows the last 120 calendar days. Color intensity is normalized
				within that sector; hover a day for the exact dollar flow.
			</p>
			<div className={`timeline-readout flow-${tone(active?.flowUsd ?? null)}`} aria-live="polite">
				{active ? (
					<>
						<strong>{active.ticker} · {active.sector}</strong>
						<span>{active.date} · {signedUsd(active.flowUsd)}</span>
					</>
				) : (
					<span>Hover over a colored day to inspect its flow.</span>
				)}
			</div>
			<div className="timeline-scroll">
				<div className="timeline-axis">
					<span />
					<div style={{ width: dates.length * 11 }}>
						<time>{dates[0]}</time>
						<time>{dates.at(-1)}</time>
					</div>
				</div>
				{sectors.map((sector) => {
					const history = byTicker.get(sector.ticker);
					const max = Math.max(
						...dates.map((date) => Math.abs(history?.get(date)?.flowUsd ?? 0)),
						1,
					);
					return (
						<div className="timeline-row" key={sector.ticker}>
							<Link
								to="/sectors/$ticker"
								params={{ ticker: sector.ticker }}
								search={{ days: 252 }}
								className="timeline-sector"
							>
								<strong>{sector.ticker}</strong>
								<span>{sector.sector}</span>
							</Link>
							<div
								className="timeline-cells"
								style={{ gridTemplateColumns: `repeat(${dates.length}, 10px)` }}
							>
								{dates.map((date) => {
									const point = history?.get(date);
									const value = point?.flowUsd ?? null;
									return (
										<span
											key={date}
											className={`timeline-cell ${tone(value)}`}
											style={{ "--intensity": value === null ? 0 : 0.18 + Math.abs(value) / max * 0.82 } as React.CSSProperties}
											onPointerEnter={() => point && setActive(point)}
											title={point ? `${point.date}: ${signedUsd(point.flowUsd)}` : `${date}: no data`}
										/>
									);
								})}
							</div>
						</div>
					);
				})}
			</div>
		</section>
	);
}

function signedUsd(value: number | null): string {
	if (value === null) return "No data";
	return `${value > 0 ? "+" : ""}${formatUsd(value)}`;
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
				<span>Ticker · sector</span>
				{periods.map(([label]) => (
					<span key={label}>{label}</span>
				))}
			</div>
			{sectors.map((sector) => (
				<div className="heatmap-row" key={sector.ticker}>
					<span className="heatmap-sector">
						<strong>{sector.ticker}</strong>
						<small>{sector.sector}</small>
					</span>
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
					<span className="score-sector">
						<strong>{sector.ticker}</strong>
						<small>{sector.sector}</small>
					</span>
					<div>
						<i style={{ width: `${sector.dcaScore ?? 0}%` }} />
					</div>
					<strong>{sector.dcaScore?.toFixed(0) ?? "—"}</strong>
				</div>
			))}
		</div>
	);
}
