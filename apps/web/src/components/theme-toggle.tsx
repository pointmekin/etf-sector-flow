import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

/**
 * Runs before first paint so the document never flashes the wrong theme. Kept
 * as a string because it is inlined into the document head in `__root.tsx`.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t!=='light'&&t!=='dark'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='light';}})();`;

export function ThemeToggle() {
	// The server cannot know the visitor's theme, so the first client render has
	// to match the server's. The real value is read from the document after mount.
	const [theme, setTheme] = useState<Theme | null>(null);

	useEffect(() => {
		const applied = document.documentElement.dataset.theme;
		setTheme(applied === "dark" ? "dark" : "light");
	}, []);

	const next: Theme = theme === "dark" ? "light" : "dark";

	function toggle() {
		document.documentElement.dataset.theme = next;
		try {
			localStorage.setItem(THEME_STORAGE_KEY, next);
		} catch {
			// Private browsing can reject writes; the theme still applies for this page.
		}
		setTheme(next);
	}

	return (
		<button
			type="button"
			className="theme-toggle"
			onClick={toggle}
			title={`Switch to ${next} theme`}
		>
			{theme === "dark" ? (
				<Moon aria-hidden="true" strokeWidth={1.75} />
			) : (
				<Sun aria-hidden="true" strokeWidth={1.75} />
			)}
			<span className="sr-only">Switch to {next} theme</span>
		</button>
	);
}
