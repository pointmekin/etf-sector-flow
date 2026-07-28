import { expect, test } from "bun:test";
import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import { renderToString } from "react-dom/server";
import { DashboardView } from "../components/dashboard";

test("dashboard renders its empty data state", async () => {
	const root = createRootRoute({ component: Outlet });
	const index = createRoute({
		getParentRoute: () => root,
		path: "/",
		component: () => (
			<DashboardView
				metric="pct"
				data={{ date: null, latestJob: null, sectors: [], signals: [] }}
			/>
		),
	});
	const router = createRouter({
		routeTree: root.addChildren([index]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	await router.load();

	const html = renderToString(<RouterProvider router={router} />);

	expect(html).toContain("The monitor is ready for data.");
});
