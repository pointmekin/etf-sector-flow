# ETF Sector Flow Monitor

Public research dashboard for daily Select Sector SPDR ETF fund flows, rankings,
signals, and monthly backtests.

## Local development

Requirements: Bun 1.3+, Python 3.12, and `uv`.

```bash
bun install
cp services/analytics/.env.example services/analytics/.env
cd services/analytics && uv sync
```

Run the applications in separate terminals:

```bash
bun run dev
cd services/analytics && uv run uvicorn sector_flow.api:app --reload
```

See [the implementation plan](./etf-sector-flow-implementation-plan.md) for scope,
architecture, and current progress.
