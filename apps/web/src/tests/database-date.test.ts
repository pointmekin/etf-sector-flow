import { expect, test } from "bun:test";
import { databaseDate } from "../lib/database-date";

test("preserves database date strings", () => {
	expect(databaseDate("2026-07-27")).toBe("2026-07-27");
});

test("serializes database Date values in the application timezone", () => {
	expect(databaseDate(new Date("2026-07-26T17:00:00.000Z"))).toBe(
		"2026-07-27",
	);
});
