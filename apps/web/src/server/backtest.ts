import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const requestSchema = z.object({
	strategy: z.enum([
		"top_1",
		"top_2",
		"top_3",
		"equal_weight",
		"top_3_momentum",
		"spy_core_flow",
		"spy_core_momentum",
		"spy_core_momentum_flow",
	]),
	metric: z.enum(["flow_score", "dca_score"]),
	start_date: z.string().date().nullable(),
	transaction_cost_bps: z.number().min(0).max(1000),
	execution_delay_days: z.number().int().min(1).max(20),
});

export type BacktestStrategy = z.infer<typeof requestSchema>["strategy"];

export type BacktestResult = {
	id: string;
	status: string;
	summary: Record<string, number>;
	monthly_results: Array<{
		signal_date: string;
		execution_date: string;
		end_date: string;
		holdings: string[];
		weights: Record<string, number>;
		return: number;
		benchmark_return: number;
		turnover: number;
		equity: number;
		benchmark_equity: number;
	}>;
};

export const requestBacktest = createServerFn({ method: "POST" })
	.validator(requestSchema)
	.handler(async ({ data }): Promise<BacktestResult> => {
		const url = process.env.ANALYTICS_API_URL;
		const username = process.env.ANALYTICS_BASIC_AUTH_USERNAME;
		const password = process.env.ANALYTICS_BASIC_AUTH_PASSWORD;
		if (!url || !username || !password) {
			throw new Error("Analytics API is not configured");
		}
		const authorization = Buffer.from(`${username}:${password}`).toString(
			"base64",
		);
		const response = await fetch(`${url}/api/v1/backtests`, {
			method: "POST",
			headers: {
				Authorization: `Basic ${authorization}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(data),
		});
		if (!response.ok) {
			throw new Error("Backtest service could not complete the request");
		}
		return response.json();
	});
