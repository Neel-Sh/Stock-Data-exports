import { NextRequest, NextResponse } from "next/server";
import { strFromU8, unzipSync } from "fflate";
import { mergeFrenchFactors } from "@/lib/frenchFactors";
import {
  buildResearchFactorRows,
  calculateDailyReturns,
  type DailyMarketPoint,
  type ReportedFact,
} from "@/lib/researchFactors";
import {
  findSecCompanyInJson,
  findSecCompanyInText,
  SEC_REQUEST_HEADERS,
  type SecTickerRecord,
} from "@/lib/secTickerMapping";
import { getSecFundamentalsSnapshot } from "@/lib/secFundamentalsSnapshot";
import { buildYahooFundamentalFacts, type YahooTimeseriesPayload } from "@/lib/yahooFundamentals";

export const runtime = "edge";

const SYMBOL_PATTERN = /^[A-Z0-9.^=-]{1,24}$/i;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const SEC_FORMS = new Set(["10-K", "10-K/A", "10-Q", "10-Q/A", "20-F", "20-F/A", "40-F", "40-F/A"]);
const FRENCH_RESEARCH_URL = "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Research_Data_Factors_CSV.zip";
const FRENCH_MOMENTUM_URL = "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Momentum_Factor_CSV.zip";

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        longName?: string;
        shortName?: string;
        currency?: string;
        exchangeName?: string;
        instrumentType?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
        adjclose?: Array<{ adjclose?: Array<number | null> }>;
      };
    }>;
    error?: { description?: string } | null;
  };
};

type SecFactValue = { val?: number; end?: string; filed?: string; form?: string };
type SecCompanyFacts = {
  entityName?: string;
  facts?: Record<string, Record<string, { units?: Record<string, SecFactValue[]> }>>;
};

function monthOrdinal(month: string) {
  const [year, value] = month.split("-").map(Number);
  return year * 12 + value - 1;
}

function monthFromOrdinal(ordinal: number) {
  const year = Math.floor(ordinal / 12);
  const month = ordinal % 12 + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function addMonths(month: string, amount: number) {
  return monthFromOrdinal(monthOrdinal(month) + amount);
}

function unixSeconds(date: string) {
  return Math.floor(new Date(`${date}T00:00:00.000Z`).getTime() / 1000);
}

function finiteOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function fetchYahooDaily(symbol: string, startMonth: string, endMonth: string) {
  const start = `${addMonths(startMonth, -13)}-01`;
  const periodAfterEnd = `${addMonths(endMonth, 1)}-01`;
  const url = new URL(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("period1", String(unixSeconds(start)));
  url.searchParams.set("period2", String(unixSeconds(periodAfterEnd)));
  url.searchParams.set("interval", "1d");
  url.searchParams.set("events", "div,splits");
  url.searchParams.set("includeAdjustedClose", "true");

  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; TapeResearch/1.2)" },
    next: { revalidate: 3600 },
  });
  if (!response.ok) {
    if (response.status === 429) throw new Error("Yahoo Finance is temporarily rate-limiting requests. Try again in a minute.");
    throw new Error(`No daily history was returned for ${symbol}.`);
  }

  const payload = await response.json() as YahooChartResponse;
  const result = payload.chart?.result?.[0];
  if (!result || payload.chart?.error) throw new Error(payload.chart?.error?.description || `No daily history was found for ${symbol}.`);
  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};
  const adjusted = result.indicators?.adjclose?.[0]?.adjclose ?? [];
  const points: DailyMarketPoint[] = timestamps.flatMap((timestamp, index) => {
    const close = finiteOrNull(quote.close?.[index]);
    const adjClose = finiteOrNull(adjusted[index] ?? close);
    if (close == null && adjClose == null) return [];
    return [{
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      close,
      adjClose,
      volume: finiteOrNull(quote.volume?.[index]),
    }];
  });
  if (!points.length) throw new Error(`No daily observations were found for ${symbol}.`);
  return {
    points,
    name: result.meta?.longName ?? result.meta?.shortName ?? symbol,
    symbol: result.meta?.symbol ?? symbol,
    currency: result.meta?.currency ?? "USD",
    exchange: result.meta?.exchangeName ?? "Market",
    instrumentType: result.meta?.instrumentType ?? "UNKNOWN",
  };
}

const YAHOO_FUNDAMENTAL_TYPES = [
  "quarterlyMarketCap",
  "annualMarketCap",
  "quarterlyStockholdersEquity",
  "annualStockholdersEquity",
  "quarterlyCommonStockEquity",
  "annualCommonStockEquity",
];

async function fetchYahooReportedFundamentals(symbol: string) {
  const url = new URL(`https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("type", YAHOO_FUNDAMENTAL_TYPES.join(","));
  url.searchParams.set("period1", "0");
  url.searchParams.set("period2", String(Math.floor(Date.now() / 1000)));
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; TapeResearch/1.2)" },
    next: { revalidate: 21_600 },
  });
  if (!response.ok) throw new Error("Reported fundamentals are temporarily unavailable.");
  const payload = await response.json() as YahooTimeseriesPayload;
  if (payload.timeseries?.error) throw new Error(payload.timeseries.error.description ?? "Reported fundamentals are temporarily unavailable.");
  return payload;
}

type FxPoint = { date: string; close: number };

function normalizedCurrency(currency: string) {
  const minorCurrencies: Record<string, { base: string; perBase: number }> = {
    GBp: { base: "GBP", perBase: 100 },
    GBX: { base: "GBP", perBase: 100 },
    ILA: { base: "ILS", perBase: 100 },
    ZAc: { base: "ZAR", perBase: 100 },
  };
  return minorCurrencies[currency] ?? { base: currency, perBase: 1 };
}

async function fetchFxPair(symbol: string, start: string, end: string) {
  const url = new URL(`https://query2.finance.yahoo.com/v8/finance/chart/${symbol}`);
  url.searchParams.set("period1", String(unixSeconds(start)));
  url.searchParams.set("period2", String(unixSeconds(end) + 86_400));
  url.searchParams.set("interval", "1d");
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; TapeResearch/1.2)" },
    next: { revalidate: 21_600 },
  });
  if (!response.ok) return [];
  const payload = await response.json() as YahooChartResponse;
  const result = payload.chart?.result?.[0];
  return (result?.timestamp ?? []).flatMap((timestamp, index): FxPoint[] => {
    const close = finiteOrNull(result?.indicators?.quote?.[0]?.close?.[index]);
    return close && close > 0 ? [{ date: new Date(timestamp * 1000).toISOString().slice(0, 10), close }] : [];
  });
}

async function fetchFxHistory(fromCurrency: string, toCurrency: string, start: string, end: string) {
  const from = normalizedCurrency(fromCurrency);
  const to = normalizedCurrency(toCurrency);
  if (from.base === to.base) return [];
  const direct = await fetchFxPair(`${from.base}${to.base}=X`, start, end);
  if (direct.length) return direct;
  const inverse = await fetchFxPair(`${to.base}${from.base}=X`, start, end);
  return inverse.map((point) => ({ ...point, close: 1 / point.close }));
}

async function yahooFundamentalFallback(
  symbol: string,
  market: Awaited<ReturnType<typeof fetchYahooDaily>>,
  payload: YahooTimeseriesPayload,
) {
  const currencies = new Set<string>();
  for (const result of payload.timeseries?.result ?? []) {
    for (const [key, value] of Object.entries(result)) {
      if (!YAHOO_FUNDAMENTAL_TYPES.includes(key) || !Array.isArray(value)) continue;
      for (const item of value as Array<{ currencyCode?: string }>) if (item.currencyCode) currencies.add(item.currencyCode);
    }
  }
  const dates = market.points.map((point) => point.date).sort();
  const fxEntries = await Promise.all([...currencies].map(async (currency) => [
    currency,
    await fetchFxHistory(currency, market.currency, dates[0], dates.at(-1)!),
  ] as const));
  const fx = new Map(fxEntries);
  const convertCurrency = (value: number, fromCurrency: string, toCurrency: string, date: string) => {
    const from = normalizedCurrency(fromCurrency);
    const to = normalizedCurrency(toCurrency);
    if (from.base === to.base) return value * (to.perBase / from.perBase);
    const rate = (fx.get(fromCurrency) ?? []).filter((point) => point.date <= date).sort((a, b) => b.date.localeCompare(a.date))[0];
    return rate ? value * rate.close * (to.perBase / from.perBase) : null;
  };
  const facts = buildYahooFundamentalFacts(payload, market.points, market.currency, convertCurrency);
  return facts.shares.length || facts.bookEquity.length ? {
    cik: null,
    entityName: market.name,
    ...facts,
    snapshotAsOf: null,
    source: "Yahoo reported fundamentals",
  } : null;
}

function reportedFacts(
  payload: SecCompanyFacts,
  namespace: string,
  candidates: string[],
  unit: string,
) {
  for (const tag of candidates) {
    const values = payload.facts?.[namespace]?.[tag]?.units?.[unit] ?? [];
    const facts = values.flatMap((item): ReportedFact[] => {
      if (item.val == null || !Number.isFinite(item.val) || item.val <= 0 || !item.end || !item.filed || !item.form || !SEC_FORMS.has(item.form)) return [];
      return [{ value: item.val, end: item.end, filed: item.filed, form: item.form, tag }];
    });
    if (facts.length) return facts;
  }
  return [];
}

async function fetchSecCompany(symbol: string): Promise<SecTickerRecord | null> {
  const tickersResponse = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers: SEC_REQUEST_HEADERS,
    next: { revalidate: 86_400 },
  });
  if (tickersResponse.ok) {
    try {
      const company = findSecCompanyInJson(await tickersResponse.json(), symbol);
      if (company) return company;
      return null;
    } catch {
      // Fall through to the smaller SEC ticker/CIK file if the JSON feed is malformed.
    }
  }

  const tickerTextResponse = await fetch("https://www.sec.gov/include/ticker.txt", {
    headers: SEC_REQUEST_HEADERS,
    next: { revalidate: 86_400 },
  });
  if (!tickerTextResponse.ok) throw new Error("SEC ticker mapping is temporarily unavailable.");
  return findSecCompanyInText(await tickerTextResponse.text(), symbol);
}

async function fetchSecFundamentals(symbol: string) {
  const snapshot = getSecFundamentalsSnapshot(symbol);
  const company = snapshot ? {
    cik_str: Number(snapshot.cik),
    ticker: symbol,
    title: snapshot.entityName,
  } : await fetchSecCompany(symbol);
  if (!company) return null;

  const cik = String(company.cik_str).padStart(10, "0");
  try {
    const factsResponse = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {
      headers: SEC_REQUEST_HEADERS,
      next: { revalidate: 3600 },
    });
    if (!factsResponse.ok) throw new Error("SEC Company Facts is temporarily unavailable.");
    const payload = await factsResponse.json() as SecCompanyFacts;
    return {
      cik,
      entityName: payload.entityName ?? company.title ?? symbol,
      shares: reportedFacts(payload, "dei", ["EntityCommonStockSharesOutstanding"], "shares"),
      bookEquity: reportedFacts(payload, "us-gaap", [
        "CommonStockholdersEquity",
        "StockholdersEquity",
        "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
      ], "USD"),
      snapshotAsOf: null,
    };
  } catch (error) {
    if (!snapshot) throw error;
    return { ...snapshot, snapshotAsOf: snapshot.retrievedAt };
  }
}

async function fetchZippedCsv(url: string) {
  const response = await fetch(url, { next: { revalidate: 86_400 } });
  if (!response.ok) throw new Error("Kenneth French factor data is temporarily unavailable.");
  const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const file = Object.values(archive)[0];
  if (!file) throw new Error("Kenneth French factor archive was empty.");
  return strFromU8(file);
}

async function fetchFrenchFactors() {
  const [research, momentum] = await Promise.all([
    fetchZippedCsv(FRENCH_RESEARCH_URL),
    fetchZippedCsv(FRENCH_MOMENTUM_URL),
  ]);
  return mergeFrenchFactors(research, momentum);
}

export async function GET(request: NextRequest) {
  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);
  const lastCompleteMonth = addMonths(currentMonth, -1);
  const symbol = (request.nextUrl.searchParams.get("symbol") ?? "AAPL").trim().toUpperCase();
  const end = request.nextUrl.searchParams.get("end") ?? lastCompleteMonth;
  const start = request.nextUrl.searchParams.get("start") ?? addMonths(end, -23);

  if (!SYMBOL_PATTERN.test(symbol)) return NextResponse.json({ error: "Choose one valid stock or index ticker." }, { status: 400 });
  if (!MONTH_PATTERN.test(start) || !MONTH_PATTERN.test(end) || start > end) {
    return NextResponse.json({ error: "Choose a valid start and end month." }, { status: 400 });
  }
  if (end > lastCompleteMonth) {
    return NextResponse.json({ error: `Formation months must be complete. Choose ${lastCompleteMonth} or earlier.` }, { status: 400 });
  }
  if (monthOrdinal(end) - monthOrdinal(start) > 119) {
    return NextResponse.json({ error: "Choose a research window of ten years or less." }, { status: 400 });
  }

  const nextMonthIsComplete = addMonths(end, 1) <= lastCompleteMonth;
  const calculationEnd = nextMonthIsComplete ? addMonths(end, 1) : end;

  try {
    const [market, benchmarkOutcome, secOutcome, yahooFundamentalsOutcome, frenchOutcome] = await Promise.all([
      fetchYahooDaily(symbol, start, calculationEnd),
      symbol === "^GSPC"
        ? Promise.resolve({ value: null, error: null })
        : fetchYahooDaily("^GSPC", start, calculationEnd).then((value) => ({ value, error: null })).catch((error: unknown) => ({
          value: null,
          error: error instanceof Error ? error.message : "Market benchmark data are unavailable.",
        })),
      fetchSecFundamentals(symbol).then((value) => ({ value, error: null })).catch((error: unknown) => ({
        value: null,
        error: error instanceof Error ? error.message : "SEC fundamentals are unavailable.",
      })),
      fetchYahooReportedFundamentals(symbol).then((value) => ({ value, error: null })).catch((error: unknown) => ({
        value: null,
        error: error instanceof Error ? error.message : "Reported fundamentals are unavailable.",
      })),
      fetchFrenchFactors().then((value) => ({ value, error: null })).catch((error: unknown) => ({
        value: [],
        error: error instanceof Error ? error.message : "Kenneth French factors are unavailable.",
      })),
    ]);

    const fundamentalsApplicable = market.instrumentType === "EQUITY";
    const fallbackFundamentals = fundamentalsApplicable && !secOutcome.value && yahooFundamentalsOutcome.value
      ? await yahooFundamentalFallback(symbol, market, yahooFundamentalsOutcome.value)
      : null;
    const fundamentals = secOutcome.value ? { ...secOutcome.value, source: "SEC Company Facts" } : fallbackFundamentals;
    const rows = buildResearchFactorRows(market.points, {
      shares: fundamentals?.shares ?? [],
      bookEquity: fundamentals?.bookEquity ?? [],
      riskFactors: frenchOutcome.value,
      marketPoints: benchmarkOutcome.value?.points,
    }).filter((row) => row.month >= start && row.month <= end);
    if (!rows.length) throw new Error(`No complete monthly observations were found for ${symbol} in that window.`);

    const daily = calculateDailyReturns(market.points)
      .filter((point) => point.date.slice(0, 7) >= start && point.date.slice(0, 7) <= end);
    const missingRiskFactorMonths = frenchOutcome.error ? [] : rows
      .filter((row) => [row.mktRf, row.smb, row.hml, row.factorMomentum, row.rf].some((value) => value == null))
      .map((row) => row.month);
    const warnings = [
      fundamentalsApplicable && !fundamentals ? secOutcome.error ?? yahooFundamentalsOutcome.error : null,
      frenchOutcome.error,
      fundamentalsApplicable && !fundamentals ? "SIZE and BM are unavailable because no reported fundamentals were found for this listing." : null,
      fundamentalsApplicable && fundamentals && !fundamentals.shares.length ? "SIZE is unavailable because no eligible listed-share or market-cap record was found." : null,
      fundamentalsApplicable && fundamentals && !fundamentals.bookEquity.length ? "BM is unavailable because no eligible reported-equity fact was found." : null,
      benchmarkOutcome.error ? "BETA is unavailable because the market benchmark could not be loaded." : null,
    ].filter((value): value is string => Boolean(value));

    return NextResponse.json({
      symbol: market.symbol,
      name: market.name,
      currency: market.currency,
      exchange: market.exchange,
      instrumentType: market.instrumentType,
      fundamentalsApplicable,
      start,
      end,
      rows,
      daily,
      warnings,
      benchmarkCoverage: {
        latestAvailableMonth: frenchOutcome.value.at(-1)?.month ?? null,
        pendingMonths: missingRiskFactorMonths,
      },
      requestedAt: new Date().toISOString(),
      fundamentals: fundamentals ? {
        cik: fundamentals.cik,
        entityName: fundamentals.entityName,
        snapshotAsOf: fundamentals.snapshotAsOf,
        source: fundamentals.source,
        pointInTimeRule: fundamentals.source === "SEC Company Facts"
          ? "Fact period end and filing date must both be on or before formation month-end."
          : "Reported period end plus a conservative 60-day quarterly or 120-day annual publication lag must be on or before formation month-end.",
        bookEquityDefinition: "Reported common stockholders' equity when available; otherwise reported stockholders' equity proxy.",
      } : null,
      sources: {
        market: "Yahoo Finance daily chart data",
        fundamentals: fundamentals?.source === "SEC Company Facts" && fundamentals.snapshotAsOf
          ? `SEC Company Facts snapshot (${fundamentals.snapshotAsOf})`
          : fundamentals?.source ?? (fundamentalsApplicable ? "Unavailable" : "Not applicable to this instrument"),
        riskFactors: "Kenneth French Data Library monthly factors",
      },
      methodology: {
        returnPrice: "Adjusted close",
        marketCapPrice: "Unadjusted month-end close",
        momentumWindow: "t-12 through t-2 (11 compounded monthly returns)",
        illiquidityScale: "BCW monthly ratio: absolute full-month adjusted return / total monthly dollar volume",
        beta: "Simplified daily OLS slope of stock return on ^GSPC return within each formation month; daily risk-free adjustment is not available in the Yahoo benchmark path",
        delisting: "Yahoo Finance does not expose a reliable delisting-return field here. A missing next month remains missing and is disclosed rather than imputed.",
        factorUnits: "Decimal returns",
      },
    }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=21600" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The research-factor service is unavailable.";
    return NextResponse.json({ error: message }, { status: /rate-limiting/.test(message) ? 429 : 502 });
  }
}
