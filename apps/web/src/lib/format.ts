export function formatUsd(value: number | null) {
	if (value === null) return "—";
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(value);
}

export function formatPercent(value: number | null) {
	if (value === null) return "—";
	return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
}

export function tone(value: number | null) {
	if (value === null || value === 0) return "neutral";
	return value > 0 ? "positive" : "negative";
}
