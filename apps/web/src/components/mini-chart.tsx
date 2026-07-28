export function MiniChart({
	values,
	type = "line",
}: {
	values: Array<number | null>;
	type?: "line" | "bar";
}) {
	const clean = values.map((value) => value ?? 0);
	const max = Math.max(...clean.map(Math.abs), 1);
	if (type === "bar") {
		const width = 100 / Math.max(clean.length, 1);
		const occurrences = new Map<number, number>();
		const samples = clean.map((value) => {
			const occurrence = (occurrences.get(value) ?? 0) + 1;
			occurrences.set(value, occurrence);
			return { key: `${value}-${occurrence}`, value };
		});
		return (
			<svg
				className="mini-chart"
				viewBox="0 0 100 40"
				preserveAspectRatio="none"
				role="img"
				aria-label="Daily flow chart"
			>
				<line x1="0" x2="100" y1="20" y2="20" />
				{samples.map(({ key, value }, index) => {
					const height = (Math.abs(value) / max) * 18;
					return (
						<rect
							key={key}
							x={index * width}
							width={Math.max(width - 0.3, 0.3)}
							y={value >= 0 ? 20 - height : 20}
							height={height}
							className={value >= 0 ? "positive" : "negative"}
						/>
					);
				})}
			</svg>
		);
	}
	const min = Math.min(...clean);
	const high = Math.max(...clean);
	const range = high - min || 1;
	const points = clean
		.map(
			(value, index) =>
				`${(index / Math.max(clean.length - 1, 1)) * 100},${38 - ((value - min) / range) * 36}`,
		)
		.join(" ");
	return (
		<svg
			className="mini-chart"
			viewBox="0 0 100 40"
			preserveAspectRatio="none"
			role="img"
			aria-label="Historical line chart"
		>
			<polyline points={points} />
		</svg>
	);
}
