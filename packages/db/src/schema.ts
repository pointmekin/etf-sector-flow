import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

export const fund = pgTable('fund', {
  ticker: text('ticker').primaryKey(),
  name: text('name').notNull(),
  sector: text('sector').notNull(),
  sourceUrl: text('source_url').notNull(),
  inceptionDate: date('inception_date'),
  active: boolean('active').notNull().default(true),
  ...timestamps,
})

export const fundDaily = pgTable(
  'fund_daily',
  {
    ticker: text('ticker').notNull().references(() => fund.ticker),
    date: date('date').notNull(),
    nav: numeric('nav'),
    sharesOutstanding: numeric('shares_outstanding'),
    aum: numeric('aum'),
    closePrice: numeric('close_price'),
    flowUsd: numeric('flow_usd'),
    flowPctAum: numeric('flow_pct_aum'),
    sharesChange: numeric('shares_change'),
    sourceUrl: text('source_url'),
    sourceHash: text('source_hash'),
    retrievedAt: timestamp('retrieved_at', { withTimezone: true }).notNull().defaultNow(),
    qualityStatus: text('quality_status').notNull().default('ok'),
    qualityNote: text('quality_note'),
  },
  (table) => [
    primaryKey({ columns: [table.ticker, table.date] }),
    index('fund_daily_date_idx').on(table.date.desc()),
  ],
)

export const sectorDaily = pgTable(
  'sector_daily',
  {
    sector: text('sector').notNull(),
    date: date('date').notNull(),
    representativeTicker: text('representative_ticker').notNull(),
    flow1dUsd: numeric('flow_1d_usd'),
    flow5dUsd: numeric('flow_5d_usd'),
    flow20dUsd: numeric('flow_20d_usd'),
    flow60dUsd: numeric('flow_60d_usd'),
    flow252dUsd: numeric('flow_252d_usd'),
    flow1dPctAum: numeric('flow_1d_pct_aum'),
    flow5dPctAum: numeric('flow_5d_pct_aum'),
    flow20dPctAum: numeric('flow_20d_pct_aum'),
    flow60dPctAum: numeric('flow_60d_pct_aum'),
    flow252dPctAum: numeric('flow_252d_pct_aum'),
    positiveFlowDays20d: integer('positive_flow_days_20d'),
    relativeReturn60d: numeric('relative_return_60d'),
    volatility60d: numeric('volatility_60d'),
    flowScore: numeric('flow_score'),
    dcaScore: numeric('dca_score'),
    state: text('state'),
    rank: integer('rank'),
  },
  (table) => [
    primaryKey({ columns: [table.sector, table.date] }),
    index('sector_daily_date_idx').on(table.date.desc()),
    index('sector_daily_date_rank_idx').on(table.date.desc(), table.rank),
  ],
)

export const signalEvent = pgTable(
  'signal_event',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    date: date('date').notNull(),
    sector: text('sector'),
    type: text('type').notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    severity: text('severity').notNull().default('info'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('signal_event_created_at_idx').on(table.createdAt.desc())],
)

export const jobRun = pgTable(
  'job_run',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    jobType: text('job_type').notNull(),
    status: text('status').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    sourceDate: date('source_date'),
    rowsProcessed: integer('rows_processed').notNull().default(0),
    message: text('message'),
  },
  (table) => [index('job_run_started_at_idx').on(table.startedAt.desc())],
)

export const backtestRun = pgTable(
  'backtest_run',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    strategy: text('strategy').notNull(),
    parameters: jsonb('parameters').notNull(),
    status: text('status').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    summary: jsonb('summary'),
    monthlyResults: jsonb('monthly_results'),
    errorMessage: text('error_message'),
  },
  (table) => [index('backtest_run_started_at_idx').on(table.startedAt.desc())],
)
