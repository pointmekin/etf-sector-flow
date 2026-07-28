import { and, desc, eq, gte, sql } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import {
	createDatabase,
	fundDaily,
	jobRun,
	sectorDaily,
	signalEvent,
} from "@sector-flow/db";
import { z } from "zod";

const number = (value: string | null) =>
	value === null ? null : Number(value);

function database() {
	const url = process.env.DATABASE_URL;
	return url ? createDatabase(url) : null;
}

export const getDashboardData = createServerFn({ method: "GET" }).handler(
	async () => {
		const db = database();
		if (!db) return { date: null, latestJob: null, sectors: [], signals: [] };
		const latest = await db
			.selectDistinct({ date: sectorDaily.date })
			.from(sectorDaily)
			.orderBy(desc(sectorDaily.date))
			.limit(2);
		const date = latest[0]?.date ?? null;
		const rows = date
			? await db
					.select()
					.from(sectorDaily)
					.where(eq(sectorDaily.date, date))
					.orderBy(sectorDaily.rank)
			: [];
		const previousRows = latest[1]?.date
			? await db
					.select({ sector: sectorDaily.sector, rank: sectorDaily.rank })
					.from(sectorDaily)
					.where(eq(sectorDaily.date, latest[1].date))
			: [];
		const previousRanks = new Map(
			previousRows.map((row) => [row.sector, row.rank]),
		);
		const signals = await db
			.select()
			.from(signalEvent)
			.orderBy(desc(signalEvent.createdAt))
			.limit(8);
		const jobs = await db
			.select()
			.from(jobRun)
			.orderBy(desc(jobRun.startedAt))
			.limit(1);
		return {
			date,
			latestJob: jobs[0]
				? {
						status: jobs[0].status,
						finishedAt: jobs[0].finishedAt?.toISOString() ?? null,
						message: jobs[0].message,
					}
				: null,
			sectors: rows.map((row) => ({
				sector: row.sector,
				date: row.date,
				ticker: row.representativeTicker,
				flow1dUsd: number(row.flow1dUsd),
				flow5dUsd: number(row.flow5dUsd),
				flow20dUsd: number(row.flow20dUsd),
				flow60dUsd: number(row.flow60dUsd),
				flow252dUsd: number(row.flow252dUsd),
				flow1dPctAum: number(row.flow1dPctAum),
				flow5dPctAum: number(row.flow5dPctAum),
				flow20dPctAum: number(row.flow20dPctAum),
				flow60dPctAum: number(row.flow60dPctAum),
				flow252dPctAum: number(row.flow252dPctAum),
				flowScore: number(row.flowScore),
				dcaScore: number(row.dcaScore),
				state: row.state,
				rank: row.rank,
				rankChange:
					row.rank && previousRanks.get(row.sector)
						? Number(previousRanks.get(row.sector)) - row.rank
						: null,
			})),
			signals: signals.map((signal) => ({ ...signal, createdAt: undefined })),
		};
	},
);

export const getSectorDetail = createServerFn({ method: "GET" })
	.validator(
		z.object({
			ticker: z.string().regex(/^XL(C|Y|P|E|F|V|I|B|RE|K|U)$/),
			days: z.number().min(30).max(1000),
		}),
	)
	.handler(async ({ data }) => {
		const db = database();
		if (!db) return { sector: null, history: [], signals: [] };
		const cutoff = sql<string>`current_date - ${data.days} * interval '1 day'`;
		const rows = await db
			.select({ sector: sectorDaily, fund: fundDaily })
			.from(sectorDaily)
			.leftJoin(
				fundDaily,
				and(
					eq(fundDaily.ticker, data.ticker),
					eq(fundDaily.date, sectorDaily.date),
				),
			)
			.where(
				and(
					eq(sectorDaily.representativeTicker, data.ticker),
					gte(sectorDaily.date, cutoff),
				),
			)
			.orderBy(sectorDaily.date);
		const signals = await db
			.select()
			.from(signalEvent)
			.where(eq(signalEvent.sector, rows[0]?.sector.sector ?? ""))
			.orderBy(desc(signalEvent.createdAt))
			.limit(10);
		return {
			sector: rows.at(-1)?.sector.sector ?? null,
			history: rows.map(({ sector, fund }) => ({
				sector: sector.sector,
				date: sector.date,
				ticker: sector.representativeTicker,
				flow1dUsd: number(sector.flow1dUsd),
				flow5dUsd: number(sector.flow5dUsd),
				flow20dUsd: number(sector.flow20dUsd),
				flow60dUsd: number(sector.flow60dUsd),
				flow252dUsd: number(sector.flow252dUsd),
				flow1dPctAum: number(sector.flow1dPctAum),
				flow5dPctAum: number(sector.flow5dPctAum),
				flow20dPctAum: number(sector.flow20dPctAum),
				flow60dPctAum: number(sector.flow60dPctAum),
				flow252dPctAum: number(sector.flow252dPctAum),
				flowScore: number(sector.flowScore),
				dcaScore: number(sector.dcaScore),
				state: sector.state,
				rank: sector.rank,
				rankChange: null,
				closePrice: number(fund?.closePrice ?? null),
				flowUsd: number(fund?.flowUsd ?? null),
				relativeReturn60d: number(sector.relativeReturn60d),
			})),
			signals: signals.map((signal) => ({ ...signal, createdAt: undefined })),
		};
	});
