# Tape

Tape is a focused market-research workspace. It builds historical datasets, computes transparent monthly equity factors, maps current index membership, and exports reproducible CSV files that open directly in Excel and Google Sheets.

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
- Computes daily returns, forward monthly return, MAX, SIZE, REV, 12–2 momentum, Amihud illiquidity, BM, and MAX(5)
- Matches monthly MKT-RF, SMB, HML, MOM, and RF observations from the Kenneth French Data Library
- Uses SEC Company Facts when available, with a reported-fundamentals fallback and conservative publication lags so future inputs do not leak into earlier formation months
- Supports stock and index factor queries; company-level SIZE and BM are explicitly not applicable to indexes
- Explores the S&P 500, Composite 1500, Nasdaq-100, Dow 30, and STOXX Europe 600 with explicit source and coverage labels
- Exports both the monthly research panel and its underlying daily return observations
- Builds a bounded-concurrency S&P Composite 1500 master panel with one row per company-month, then runs MAX deciles, dependent 10×10 sorts, and Fama–MacBeth regressions with Newey–West HAC inference
- Preserves missing and post-exit company-month rows as explicit nulls so earlier observations remain in the analysis; a supplied delisting return is used only when the ordinary forward return is unavailable

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

The S&P 1500 engine currently uses the latest public S&P 500, MidCap 400, and SmallCap 600 constituent tables as a static roster. It is intentionally labeled as a current snapshot and does not claim point-in-time historical membership. Before using historical portfolio estimates as unbiased results, replace that roster with licensed month-by-month membership history. The factor UI also discloses that monthly ILLIQ is `abs(monthly return) / total monthly dollar volume`, and that BETA is a simplified daily OLS slope against `^GSPC`; these are transparent public-data approximations, not a claim of CRSP-grade reconstruction.

The interface uses Hugeicons Free under its MIT license.
