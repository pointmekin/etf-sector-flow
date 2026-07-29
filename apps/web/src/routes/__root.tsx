import {
	HeadContent,
	Link,
	Scripts,
	createRootRoute,
} from "@tanstack/react-router";
import { ThemeToggle, themeScript } from "../components/theme-toggle";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "ETF Sector Flow Monitor",
			},
			{
				name: "description",
				content:
					"Daily ETF sector fund flows, rotation scores, signals, and transparent backtests.",
			},
			{ property: "og:title", content: "ETF Sector Flow Monitor" },
			{ property: "og:type", content: "website" },
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),
	shellComponent: RootDocument,
	notFoundComponent: () => (
		<section className="empty-state">
			<p className="eyebrow">404</p>
			<h1>That page is outside the flow.</h1>
			<Link to="/" search={{ metric: "pct" }} className="button">
				Return to dashboard
			</Link>
		</section>
	),
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<HeadContent />
				<script
					// biome-ignore lint/security/noDangerouslySetInnerHtml: must run before first paint to avoid a theme flash
					dangerouslySetInnerHTML={{ __html: themeScript }}
				/>
			</head>
			<body>
				<header className="site-header">
					<Link
						to="/"
						search={{ metric: "pct" }}
						className="brand"
						aria-label="Sector Flow home"
					>
						<span className="brand-mark">SF</span>
						<span>Sector Flow</span>
					</Link>
					<div className="header-actions">
						<nav aria-label="Primary navigation">
							<Link
								to="/"
								search={{ metric: "pct" }}
								activeProps={{ "aria-current": "page" }}
							>
								Dashboard
							</Link>
							<Link to="/backtest" activeProps={{ "aria-current": "page" }}>
								Backtest
							</Link>
							<Link to="/methodology" activeProps={{ "aria-current": "page" }}>
								Methodology
							</Link>
						</nav>
						<ThemeToggle />
					</div>
				</header>
				<main>{children}</main>
				<footer>
					<span>Daily sector-flow research</span>
					<span>Not investment advice · Data may be revised</span>
				</footer>
				<Scripts />
			</body>
		</html>
	);
}
