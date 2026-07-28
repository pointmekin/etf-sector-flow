type ValueFormat = "number" | "percent" | "usd";

const WIDTH = 640;
const HEIGHT = 240;
const PLOT = { left: 74, right: 18, top: 12, bottom: 194 };

export function MiniChart({
	values,
	labels,
	type = "line",
	valueFormat = "number",
	yAxisLabel,
	ariaLabel = "Historical chart",
}: {
	values: Array<number | null>;
	labels?: string[];
	type?: "line" | "bar";
	valueFormat?: ValueFormat;
	yAxisLabel: string;
	ariaLabel?: string;
}) {
	const clean = values.map((value) => value ?? 0);
	const domain = getDomain(clean, type === "bar");
	const points = toPoints(clean, domain);

	return (
		<svg
			className="mini-chart"
			viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
			role="img"
			aria-label={ariaLabel}
		>
			<title>{ariaLabel}</title>
			<ChartAxes
				domain={domain}
				labels={labels}
				valueFormat={valueFormat}
				yAxisLabel={yAxisLabel}
			/>
			{type === "bar" ? (
				<Bars values={clean} domain={domain} />
			) : (
				<polyline className="chart-line strategy-line" points={points} />
			)}
		</svg>
	);
}

export function EquityComparisonChart({
	dates,
	strategy,
	spy,
}: {
	dates: string[];
	strategy: number[];
	spy: number[];
}) {
	const domain = getDomain([...strategy, ...spy], false);
	return (
		<div className="comparison-chart">
			<ul className="chart-legend" aria-label="Chart legend">
				<li className="strategy-key">Strategy</li>
				<li className="spy-key">SPY</li>
			</ul>
			<svg
				className="mini-chart"
				viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
				role="img"
				aria-label="Strategy and SPY growth of one dollar"
			>
				<title>Strategy and SPY growth of one dollar</title>
				<ChartAxes
					domain={domain}
					labels={dates}
					valueFormat="usd"
					yAxisLabel="Equity"
				/>
				<polyline
					className="chart-line strategy-line"
					points={toPoints(strategy, domain)}
				/>
				<polyline
					className="chart-line spy-line"
					points={toPoints(spy, domain)}
				/>
			</svg>
		</div>
	);
}

function ChartAxes({
	domain,
	labels,
	valueFormat,
	yAxisLabel,
}: {
	domain: [number, number];
	labels?: string[];
	valueFormat: ValueFormat;
	yAxisLabel: string;
}) {
	const [min, max] = domain;
	const ticks = [max, (max + min) / 2, min];
	return (
		<g className="chart-axes">
			{ticks.map((tick) => {
				const y = yPosition(tick, domain);
				return (
					<g key={tick}>
						<line x1={PLOT.left} x2={WIDTH - PLOT.right} y1={y} y2={y} />
						<text x={PLOT.left - 9} y={y + 4} textAnchor="end">
							{formatAxisValue(tick, valueFormat)}
						</text>
					</g>
				);
			})}
			<text
				className="axis-title"
				x="15"
				y={(PLOT.top + PLOT.bottom) / 2}
				textAnchor="middle"
				transform={`rotate(-90 15 ${(PLOT.top + PLOT.bottom) / 2})`}
			>
				{yAxisLabel}
			</text>
			{labels?.length ? (
				<>
					<text x={PLOT.left} y="216" textAnchor="start">
						{formatDate(labels[0])}
					</text>
					<text x={WIDTH - PLOT.right} y="216" textAnchor="end">
						{formatDate(labels.at(-1))}
					</text>
					<text
						className="axis-title"
						x={WIDTH / 2}
						y="234"
						textAnchor="middle"
					>
						Date
					</text>
				</>
			) : null}
		</g>
	);
}

function Bars({
	values,
	domain,
}: {
	values: number[];
	domain: [number, number];
}) {
	const plotWidth = WIDTH - PLOT.left - PLOT.right;
	const width = plotWidth / Math.max(values.length, 1);
	const zero = yPosition(0, domain);
	const occurrences = new Map<number, number>();
	const samples = values.map((value) => {
		const occurrence = (occurrences.get(value) ?? 0) + 1;
		occurrences.set(value, occurrence);
		return { key: `${value}-${occurrence}`, value };
	});
	return samples.map(({ key, value }, index) => {
		const y = yPosition(value, domain);
		return (
			<rect
				key={key}
				x={PLOT.left + index * width}
				width={Math.max(width - 1, 1)}
				y={Math.min(y, zero)}
				height={Math.max(Math.abs(zero - y), 1)}
				className={value >= 0 ? "positive" : "negative"}
			/>
		);
	});
}

function getDomain(values: number[], centered: boolean): [number, number] {
	if (values.length === 0) return [-1, 1];
	if (centered) {
		const max = Math.max(...values.map(Math.abs), 1);
		return [-max, max];
	}
	const min = Math.min(...values);
	const max = Math.max(...values);
	if (min === max) return [min - 1, max + 1];
	const padding = (max - min) * 0.05;
	return [min - padding, max + padding];
}

function toPoints(values: number[], domain: [number, number]): string {
	const plotWidth = WIDTH - PLOT.left - PLOT.right;
	return values
		.map((value, index) => {
			const x =
				PLOT.left + (index / Math.max(values.length - 1, 1)) * plotWidth;
			return `${x},${yPosition(value, domain)}`;
		})
		.join(" ");
}

function yPosition(value: number, [min, max]: [number, number]): number {
	return PLOT.bottom - ((value - min) / (max - min)) * (PLOT.bottom - PLOT.top);
}

function formatAxisValue(value: number, format: ValueFormat): string {
	if (format === "percent") return `${(value * 100).toFixed(1)}%`;
	if (format === "usd") {
		const absolute = Math.abs(value);
		if (absolute >= 1_000_000_000)
			return `$${(value / 1_000_000_000).toFixed(1)}B`;
		if (absolute >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
		if (absolute >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
		return `$${value.toFixed(2)}`;
	}
	return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(1);
}

function formatDate(value: string | undefined): string {
	if (!value) return "";
	const [year, month, day] = value.slice(0, 10).split("-");
	return year && month && day ? `${month}/${day}/${year}` : value;
}
