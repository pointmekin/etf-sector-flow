import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

type ValueFormat = "number" | "percent" | "usd";

/**
 * The viewBox is sized from the container's real pixel width, so one SVG unit
 * is one CSS pixel. Axis labels and tooltips then stay legible at every
 * breakpoint instead of being scaled down with the chart.
 */
type Geometry = {
	width: number;
	height: number;
	left: number;
	right: number;
	top: number;
	bottom: number;
};

/** Room beneath the plot for the date labels and the "Date" axis title. */
const AXIS_SPACE = 46;

/** Centre line of the rotated y-axis title; `left` must clear it plus a label. */
const Y_TITLE_X = 11;

function geometry(
	width: number,
	height: number,
	{ left, right = 18, top = 12 }: { left: number; right?: number; top?: number },
): Geometry {
	return { width, height, left, right, top, bottom: height - AXIS_SPACE };
}

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
	const frame = useChartFrame({ ratio: 0.375, minHeight: 200, maxHeight: 300 });
	const geo = geometry(frame.width, frame.height, { left: 74 });
	const clean = values.map((value) => value ?? 0);
	const domain = getDomain(clean, type === "bar");
	const points = toPoints(clean, domain, geo);
	const hover = useChartHover(clean.length, geo);
	const activeValue = hover.index === null ? null : clean[hover.index];

	return (
		<div className="chart-frame" ref={frame.ref}>
			<svg
				className="mini-chart"
				viewBox={`0 0 ${geo.width} ${geo.height}`}
				role="img"
				aria-label={ariaLabel}
				onPointerMove={hover.onPointerMove}
				onPointerLeave={hover.clear}
			>
				<title>{ariaLabel}</title>
				<desc>Hover over the chart to inspect values by date.</desc>
				<ChartAxes
					domain={domain}
					labels={labels}
					valueFormat={valueFormat}
					yAxisLabel={yAxisLabel}
					geo={geo}
				/>
				{type === "bar" ? (
					<Bars values={clean} domain={domain} geo={geo} />
				) : (
					<polyline className="chart-line strategy-line" points={points} />
				)}
				{hover.index !== null && activeValue !== null ? (
					<SingleValueTooltip
						index={hover.index}
						length={clean.length}
						value={activeValue}
						date={labels?.[hover.index]}
						format={valueFormat}
						label={yAxisLabel}
						domain={domain}
						geo={geo}
					/>
				) : null}
			</svg>
		</div>
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
	// Taller and with a narrower y-axis gutter than MiniChart: this is the one
	// chart that gets a full-width panel to itself.
	const frame = useChartFrame({ ratio: 0.42, minHeight: 260, maxHeight: 440 });
	const geo = geometry(frame.width, frame.height, { left: 64, right: 12 });
	const domain = getDomain([...strategy, ...spy], false);
	const hover = useChartHover(
		Math.min(dates.length, strategy.length, spy.length),
		geo,
	);
	return (
		<div className="comparison-chart">
			<ul className="chart-legend" aria-label="Chart legend">
				<li className="strategy-key">Strategy</li>
				<li className="spy-key">SPY</li>
			</ul>
			<div className="chart-frame" ref={frame.ref}>
				<svg
					className="mini-chart"
					viewBox={`0 0 ${geo.width} ${geo.height}`}
					role="img"
					aria-label="Strategy and SPY growth of one dollar"
					onPointerMove={hover.onPointerMove}
					onPointerLeave={hover.clear}
				>
					<title>Strategy and SPY growth of one dollar</title>
					<desc>
						Hover over the chart to compare Strategy and SPY values by date.
					</desc>
					<ChartAxes
						domain={domain}
						labels={dates}
						valueFormat="usd"
						yAxisLabel="Equity"
						geo={geo}
					/>
					<polyline
						className="chart-line strategy-line"
						points={toPoints(strategy, domain, geo)}
					/>
					<polyline
						className="chart-line spy-line"
						points={toPoints(spy, domain, geo)}
					/>
					{hover.index !== null ? (
						<ComparisonTooltip
							index={hover.index}
							length={dates.length}
							date={dates[hover.index]}
							strategy={strategy[hover.index]}
							spy={spy[hover.index]}
							domain={domain}
							geo={geo}
						/>
					) : null}
				</svg>
			</div>
		</div>
	);
}

function SingleValueTooltip({
	index,
	length,
	value,
	date,
	format,
	label,
	domain,
	geo,
}: {
	index: number;
	length: number;
	value: number;
	date?: string;
	format: ValueFormat;
	label: string;
	domain: [number, number];
	geo: Geometry;
}) {
	const x = xPosition(index, length, geo);
	const y = yPosition(value, domain, geo);
	const boxX = x > geo.width - 180 ? x - 164 : x + 12;
	const boxY = Math.max(geo.top + 4, Math.min(y - 50, geo.bottom - 48));
	return (
		<g className="chart-tooltip">
			<line
				className="hover-guide"
				x1={x}
				x2={x}
				y1={geo.top}
				y2={geo.bottom}
			/>
			<circle
				className={value >= 0 ? "tooltip-point positive" : "tooltip-point negative"}
				cx={x}
				cy={y}
				r="4"
			/>
			<rect x={boxX} y={boxY} width="152" height="43" rx="3" />
			<text className="tooltip-date" x={boxX + 9} y={boxY + 15}>
				{formatDate(date) || "Value"}
			</text>
			<text className="tooltip-value" x={boxX + 9} y={boxY + 33}>
				{label}: {formatTooltipValue(value, format)}
			</text>
		</g>
	);
}

function ComparisonTooltip({
	index,
	length,
	date,
	strategy,
	spy,
	domain,
	geo,
}: {
	index: number;
	length: number;
	date?: string;
	strategy?: number;
	spy?: number;
	domain: [number, number];
	geo: Geometry;
}) {
	if (strategy === undefined || spy === undefined) return null;
	const x = xPosition(index, length, geo);
	const boxX = x > geo.width - 200 ? x - 182 : x + 12;
	const boxY = geo.top + 8;
	return (
		<g className="chart-tooltip">
			<line
				className="hover-guide"
				x1={x}
				x2={x}
				y1={geo.top}
				y2={geo.bottom}
			/>
			<circle
				className="tooltip-point strategy-point"
				cx={x}
				cy={yPosition(strategy, domain, geo)}
				r="4"
			/>
			<circle
				className="tooltip-point spy-point"
				cx={x}
				cy={yPosition(spy, domain, geo)}
				r="4"
			/>
			<rect x={boxX} y={boxY} width="170" height="62" rx="3" />
			<text className="tooltip-date" x={boxX + 10} y={boxY + 16}>
				{formatDate(date)}
			</text>
			<text className="tooltip-value strategy-value" x={boxX + 10} y={boxY + 34}>
				Strategy: {formatTooltipValue(strategy, "usd")}
			</text>
			<text className="tooltip-value spy-value" x={boxX + 10} y={boxY + 51}>
				SPY: {formatTooltipValue(spy, "usd")}
			</text>
		</g>
	);
}

function ChartAxes({
	domain,
	labels,
	valueFormat,
	yAxisLabel,
	geo,
}: {
	domain: [number, number];
	labels?: string[];
	valueFormat: ValueFormat;
	yAxisLabel: string;
	geo: Geometry;
}) {
	const [min, max] = domain;
	const ticks = [max, (max + min) / 2, min];
	const midY = (geo.top + geo.bottom) / 2;
	return (
		<g className="chart-axes">
			{ticks.map((tick) => {
				const y = yPosition(tick, domain, geo);
				return (
					<g key={tick}>
						<line x1={geo.left} x2={geo.width - geo.right} y1={y} y2={y} />
						<text x={geo.left - 9} y={y + 4} textAnchor="end">
							{formatAxisValue(tick, valueFormat)}
						</text>
					</g>
				);
			})}
			<text
				className="axis-title"
				x={Y_TITLE_X}
				y={midY}
				textAnchor="middle"
				transform={`rotate(-90 ${Y_TITLE_X} ${midY})`}
			>
				{yAxisLabel}
			</text>
			{labels?.length ? (
				<>
					<text x={geo.left} y={geo.height - 24} textAnchor="start">
						{formatDate(labels[0])}
					</text>
					<text
						x={geo.width - geo.right}
						y={geo.height - 24}
						textAnchor="end"
					>
						{formatDate(labels.at(-1))}
					</text>
					<text
						className="axis-title"
						x={geo.width / 2}
						y={geo.height - 6}
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
	geo,
}: {
	values: number[];
	domain: [number, number];
	geo: Geometry;
}) {
	const plotWidth = geo.width - geo.left - geo.right;
	const width = plotWidth / Math.max(values.length, 1);
	const zero = yPosition(0, domain, geo);
	const occurrences = new Map<number, number>();
	const samples = values.map((value) => {
		const occurrence = (occurrences.get(value) ?? 0) + 1;
		occurrences.set(value, occurrence);
		return { key: `${value}-${occurrence}`, value };
	});
	return samples.map(({ key, value }, index) => {
		const y = yPosition(value, domain, geo);
		return (
			<rect
				key={key}
				x={geo.left + index * width}
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

function toPoints(
	values: number[],
	domain: [number, number],
	geo: Geometry,
): string {
	return values
		.map((value, index) => {
			return `${xPosition(index, values.length, geo)},${yPosition(value, domain, geo)}`;
		})
		.join(" ");
}

function xPosition(index: number, length: number, geo: Geometry): number {
	const plotWidth = geo.width - geo.left - geo.right;
	return geo.left + (index / Math.max(length - 1, 1)) * plotWidth;
}

function yPosition(
	value: number,
	[min, max]: [number, number],
	geo: Geometry,
): number {
	return geo.bottom - ((value - min) / (max - min)) * (geo.bottom - geo.top);
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

function formatTooltipValue(value: number, format: ValueFormat): string {
	if (format === "percent") return `${(value * 100).toFixed(2)}%`;
	if (format === "usd") {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: "USD",
			notation: Math.abs(value) >= 10_000 ? "compact" : "standard",
			maximumFractionDigits: Math.abs(value) < 10 ? 3 : 2,
		}).format(value);
	}
	return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatDate(value: string | undefined): string {
	if (!value) return "";
	const [year, month, day] = value.slice(0, 10).split("-");
	return year && month && day ? `${month}/${day}/${year}` : value;
}

/**
 * Tracks the rendered width of the chart container. The server has no layout,
 * so it renders at a fixed fallback width and the client corrects on mount.
 */
function useChartFrame({
	ratio,
	minHeight,
	maxHeight,
	fallbackWidth = 640,
}: {
	ratio: number;
	minHeight: number;
	maxHeight: number;
	fallbackWidth?: number;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(fallbackWidth);

	useEffect(() => {
		const node = ref.current;
		if (!node) return;
		const observer = new ResizeObserver((entries) => {
			const measured = Math.round(entries[0]?.contentRect.width ?? 0);
			if (measured > 0) setWidth(measured);
		});
		observer.observe(node);
		return () => observer.disconnect();
	}, []);

	const height = Math.round(
		Math.min(Math.max(width * ratio, minHeight), maxHeight),
	);
	return { ref, width, height };
}

function useChartHover(length: number, geo: Geometry) {
	const [index, setIndex] = useState<number | null>(null);
	function onPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
		if (length === 0) return;
		const bounds = event.currentTarget.getBoundingClientRect();
		const svgX = ((event.clientX - bounds.left) / bounds.width) * geo.width;
		const progress = Math.min(
			1,
			Math.max(0, (svgX - geo.left) / (geo.width - geo.left - geo.right)),
		);
		setIndex(Math.round(progress * Math.max(length - 1, 0)));
	}
	return { index, onPointerMove, clear: () => setIndex(null) };
}
