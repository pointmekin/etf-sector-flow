CREATE TABLE "backtest_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"strategy" text NOT NULL,
	"parameters" jsonb NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"summary" jsonb,
	"monthly_results" jsonb,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "fund" (
	"ticker" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sector" text NOT NULL,
	"source_url" text NOT NULL,
	"inception_date" date,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fund_daily" (
	"ticker" text NOT NULL,
	"date" date NOT NULL,
	"nav" numeric,
	"shares_outstanding" numeric,
	"aum" numeric,
	"close_price" numeric,
	"flow_usd" numeric,
	"flow_pct_aum" numeric,
	"shares_change" numeric,
	"source_url" text,
	"source_hash" text,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"quality_status" text DEFAULT 'ok' NOT NULL,
	"quality_note" text,
	CONSTRAINT "fund_daily_ticker_date_pk" PRIMARY KEY("ticker","date")
);
--> statement-breakpoint
CREATE TABLE "job_run" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"job_type" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"source_date" date,
	"rows_processed" integer DEFAULT 0 NOT NULL,
	"message" text
);
--> statement-breakpoint
CREATE TABLE "sector_daily" (
	"sector" text NOT NULL,
	"date" date NOT NULL,
	"representative_ticker" text NOT NULL,
	"flow_1d_usd" numeric,
	"flow_5d_usd" numeric,
	"flow_20d_usd" numeric,
	"flow_60d_usd" numeric,
	"flow_252d_usd" numeric,
	"flow_5d_pct_aum" numeric,
	"flow_20d_pct_aum" numeric,
	"flow_60d_pct_aum" numeric,
	"flow_252d_pct_aum" numeric,
	"positive_flow_days_20d" integer,
	"relative_return_60d" numeric,
	"volatility_60d" numeric,
	"flow_score" numeric,
	"dca_score" numeric,
	"state" text,
	"rank" integer,
	CONSTRAINT "sector_daily_sector_date_pk" PRIMARY KEY("sector","date")
);
--> statement-breakpoint
CREATE TABLE "signal_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"sector" text,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fund_daily" ADD CONSTRAINT "fund_daily_ticker_fund_ticker_fk" FOREIGN KEY ("ticker") REFERENCES "public"."fund"("ticker") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "backtest_run_started_at_idx" ON "backtest_run" USING btree ("started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "fund_daily_date_idx" ON "fund_daily" USING btree ("date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "job_run_started_at_idx" ON "job_run" USING btree ("started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sector_daily_date_idx" ON "sector_daily" USING btree ("date" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sector_daily_date_rank_idx" ON "sector_daily" USING btree ("date" DESC NULLS LAST,"rank");--> statement-breakpoint
CREATE INDEX "signal_event_created_at_idx" ON "signal_event" USING btree ("created_at" DESC NULLS LAST);