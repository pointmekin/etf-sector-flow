const applicationDateFormatter = new Intl.DateTimeFormat("en-US", {
	timeZone: "Asia/Bangkok",
	year: "numeric",
	month: "2-digit",
	day: "2-digit",
});

export function databaseDate(value: string | Date): string {
	if (typeof value === "string") return value.slice(0, 10);

	const parts = Object.fromEntries(
		applicationDateFormatter
			.formatToParts(value)
			.map(({ type, value: part }) => [type, part]),
	);
	return `${parts.year}-${parts.month}-${parts.day}`;
}
