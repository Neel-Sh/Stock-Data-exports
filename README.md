# Tape

Tape is a focused historical market-data workspace for academic research. It fetches public Yahoo Finance price history, visualizes adjusted performance, previews analysis-ready rows, and exports reproducible CSV files that open directly in Excel and Google Sheets.

## What it does

- Fetches one to five equities, ETFs, indices, or currencies by Yahoo ticker
- Supports custom windows plus 1-year, 5-year, 10-year, and maximum presets
- Returns daily, weekly, or monthly OHLCV and adjusted-close observations
- Calculates simple, log, and cumulative returns for every series
- Collects dividends and stock splits as separate corporate-action records
- Compares securities as adjusted prices or as an indexed series starting at 100
- Reports missing values, complete rows, coverage dates, annualized return, volatility, and maximum drawdown
- Keeps valid securities when another requested ticker fails and surfaces the failure as a warning
- Exports full prices, returns-only, corporate-action CSVs, structured JSON, or spreadsheet-ready clipboard data
- Includes quick market sets and a keyboard ticker shortcut (`⌘K` / `Ctrl+K`)
- Includes explicit research notes about adjusted data, validation, and survivorship bias

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

Import this repository into Vercel or run `vercel` from the project folder. No environment variables or database are required. The server-side route at `app/api/history/route.ts` proxies the upstream data request so the browser never depends on Yahoo CORS behavior.

## Research caveats

Yahoo Finance is convenient public data, not a contracted academic dataset and not a replacement for WRDS/CRSP. Validate important observations against another source. For constituent-level S&P 500 research, use point-in-time membership data; applying today's constituents to the past creates survivorship bias.

The interface uses Hugeicons Free under its MIT license.
# Stock-Data-exports
