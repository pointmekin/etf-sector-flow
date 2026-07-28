import { expect, test } from "bun:test";
import { renderToString } from "react-dom/server";
import { EquityComparisonChart, MiniChart } from "../components/mini-chart";

test("compact charts render labeled axes", () => {
	const html = renderToString(
		<MiniChart
			values={[0.01, -0.02, 0.03]}
			labels={["2025-01-01", "2025-02-01", "2025-03-01"]}
			valueFormat="percent"
			yAxisLabel="Relative return"
		/>,
	);

	expect(html).toContain("Relative return");
	expect(html).toContain("Date");
	expect(html).toContain("01/01/2025");
	expect(html).toContain("03/01/2025");
});

test("equity chart compares strategy and SPY on one scale", () => {
	const html = renderToString(
		<EquityComparisonChart
			dates={["2025-01-01", "2025-02-01"]}
			strategy={[1, 1.1]}
			spy={[1, 1.05]}
		/>,
	);

	expect(html).toContain("Strategy");
	expect(html).toContain("SPY");
	expect(html).toContain("strategy-line");
	expect(html).toContain("spy-line");
});
