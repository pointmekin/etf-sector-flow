import { createFileRoute } from "@tanstack/react-router";
import { DashboardView } from "../components/dashboard";
import { getDashboardData } from "../server/data";

export const Route = createFileRoute("/")({
	validateSearch: (search: Record<string, unknown>) => ({
		metric: search.metric === "usd" ? ("usd" as const) : ("pct" as const),
	}),
	loader: () => getDashboardData(),
	component: Home,
	pendingComponent: () => (
		<div className="page-shell skeleton-page">
			<div />
			<div />
			<div />
		</div>
	),
	errorComponent: ({ error }) => (
		<section className="empty-state">
			<p className="eyebrow">Data unavailable</p>
			<h1>The dashboard could not load.</h1>
			<p>{error.message}</p>
		</section>
	),
});

function Home() {
	return (
		<DashboardView
			data={Route.useLoaderData()}
			metric={Route.useSearch().metric}
		/>
	);
}
