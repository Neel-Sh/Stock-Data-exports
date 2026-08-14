import { NextRequest, NextResponse } from "next/server";
import { strFromU8, unzipSync } from "fflate";
import { analyzeResearchPanel, type PanelFactorRow } from "@/lib/batchEngine";
import { mergeFrenchFactors } from "@/lib/frenchFactors";
import { buildResearchFactorRows, type DailyMarketPoint } from "@/lib/researchFactors";
import { buildYahooFundamentalFacts, type YahooTimeseriesPayload } from "@/lib/yahooFundamentals";

export const runtime = "edge";

const SP1500_PAGES = ["List of S&P 500 companies", "List of S&P 400 companies", "List of S&P 600 companies"];
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const SYMBOL_PATTERN = /^[A-Z0-9.-]{1,16}$/;
const RESEARCH_URL = "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Research_Data_Factors_CSV.zip";
const MOMENTUM_URL = "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/F-F_Momentum_Factor_CSV.zip";

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: { symbol?: string; longName?: string; shortName?: string; currency?: string; exchangeName?: string; instrumentType?: string };
      timestamp?: number[];
      indicators?: { quote?: Array<{ close?: Array<number | null>; volume?: Array<number | null> }>; adjclose?: Array<{ adjclose?: Array<number | null> }> };
    }>;
    error?: { description?: string } | null;
  };
};

const PANEL_PREVIEW_LIMIT = 240;

function monthOrdinal(month: string) {
  const [year, value] = month.split("-").map(Number);
  return year * 12 + value - 1;
}

function monthFromOrdinal(value: number) {
  return `${Math.floor(value / 12)}-${String((value % 12) + 1).padStart(2, "0")}`;
}

function addMonths(month: string, amount: number) {
  return monthFromOrdinal(monthOrdinal(month) + amount);
}

function unixSeconds(date: string) {
  return Math.floor(new Date(`${date}-01T00:00:00.000Z`).getTime() / 1000);
}

function finiteOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cleanWiki(value: string) {
  return value.replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, "").replace(/<ref\b[^>]*\/>/gi, "").replace(/<br\s*\/?\s*>/gi, " ").replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, "$1").replace(/\{\{[^{}]*\}\}/g, "").replace(/<[^>]+>/g, "").replace(/'{2,}/g, "").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

function cleanSymbol(value: string) {
  const withoutRefs = value.replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, "").replace(/<ref\b[^>]*\/>/gi, "").trim();
  const templates = [...withoutRefs.matchAll(/\{\{[^{}]+\}\}/g)].map((match) => match[0]);
  const template = templates.findLast((item) => /(?:Nasdaq|Nyse|Lse|Euronext|Symbol)/i.test(item)) ?? templates.at(-1);
  const candidate = template ? template.slice(2, -2).split("|").at(-1) ?? "" : cleanWiki(withoutRefs);
  return candidate.trim().toUpperCase().replace(/\s+/g, "");
}

function rowCells(row: string) {
  const cells: string[] = [];
  for (const sourceLine of row.split("\n")) {
    const line = sourceLine.trim();
    if (!line || line === "|-" || line.startsWith("|+")) continue;
    if (line.startsWith("!scope")) {
      const separator = line.indexOf("|");
      if (separator >= 0) cells.push(line.slice(separator + 1).trim());
      continue;
    }
    if (!line.startsWith("|") || line.startsWith("|}")) continue;
    const content = line.replace(/^\|\|?/, "").trim();
    cells.push(...content.split(/\s*\|\|\s*/).map((cell) => cell.trim()));
  }
  return cells;
}

async function fetchSp1500Members() {
  const lists = await Promise.all(SP1500_PAGES.map(async (page) => {
    const url = new URL("https://en.wikipedia.org/w/api.php");
    url.searchParams.set("action", "parse");
    url.searchParams.set("page", page);
    url.searchParams.set("prop", "wikitext");
    url.searchParams.set("format", "json");
    url.searchParams.set("formatversion", "2");
    url.searchParams.set("origin", "*");
    const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "TapeResearch/2.0 (S&P 1500 engine)" }, next: { revalidate: 21_600 } });
    if (!response.ok) throw new Error("S&P 1500 membership is temporarily unavailable.");
    const payload = await response.json() as { parse?: { wikitext?: string } };
    return payload.parse?.wikitext ?? "";
  }));
  const members = lists.flatMap((wikitext) => {
    const tableStart = wikitext.indexOf('id="constituents"');
    if (tableStart < 0) return [];
    const tableEnd = wikitext.indexOf("\n|}", tableStart);
    return wikitext.slice(tableStart, tableEnd > tableStart ? tableEnd : undefined).split(/\n\|-\s*\n/).slice(1).flatMap((row) => {
      const cells = rowCells(row);
      const symbol = cleanSymbol(cells[0] ?? "");
      if (!SYMBOL_PATTERN.test(symbol)) return [];
      return [{ symbol, name: cleanWiki(cells[1] ?? "") }];
    });
  });
  return [...new Map(members.map((member) => [member.symbol, member])).values()];
}

async function fetchYahooDaily(symbol: string, start: string, end: string) {
  const url = new URL(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  url.searchParams.set("period1", String(unixSeconds(addMonths(start, -13))));
  url.searchParams.set("period2", String(unixSeconds(addMonths(end, 1))));
  url.searchParams.set("interval", "1d");
  url.searchParams.set("events", "div,splits");
  url.searchParams.set("includeAdjustedClose", "true");
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; TapeResearch/2.0)" }, next: { revalidate: 3600 } });
  if (!response.ok) throw new Error(response.status === 429 ? "Yahoo Finance is temporarily rate-limiting batch requests." : `No daily history was returned for ${symbol}.`);
  const payload = await response.json() as YahooChartResponse;
  const result = payload.chart?.result?.[0];
  if (!result || payload.chart?.error) throw new Error(payload.chart?.error?.description ?? `No daily history was found for ${symbol}.`);
  const quote = result.indicators?.quote?.[0] ?? {};
  const adjusted = result.indicators?.adjclose?.[0]?.adjclose ?? [];
  const points: DailyMarketPoint[] = (result.timestamp ?? []).flatMap((timestamp, index) => {
    const close = finiteOrNull(quote.close?.[index]);
    const adjClose = finiteOrNull(adjusted[index] ?? close);
    return close == null && adjClose == null ? [] : [{ date: new Date(timestamp * 1000).toISOString().slice(0, 10), close, adjClose, volume: finiteOrNull(quote.volume?.[index]) }];
  });
  if (!points.length) throw new Error(`No daily observations were found for ${symbol}.`);
  return { points, name: result.meta?.longName ?? result.meta?.shortName ?? symbol, currency: result.meta?.currency ?? "USD", exchange: result.meta?.exchangeName ?? "Market" };
}

async function fetchYahooFundamentals(symbol: string, marketPoints: DailyMarketPoint[]) {
  const url = new URL(`https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}`);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("type", "quarterlyMarketCap,annualMarketCap,quarterlyStockholdersEquity,annualStockholdersEquity,quarterlyCommonStockEquity,annualCommonStockEquity");
  url.searchParams.set("period1", "0");
  url.searchParams.set("period2", String(Math.floor(Date.now() / 1000)));
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; TapeResearch/2.0)" }, next: { revalidate: 21_600 } });
  if (!response.ok) return { shares: [], bookEquity: [] };
  const payload = await response.json() as YahooTimeseriesPayload;
  return buildYahooFundamentalFacts(payload, marketPoints, "USD", (value, from, to) => from === to ? value : null);
}

async function fetchZipCsv(url: string) {
  const response = await fetch(url, { next: { revalidate: 86_400 } });
  if (!response.ok) throw new Error("Kenneth French factors are temporarily unavailable.");
  const archive = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const file = Object.values(archive)[0];
  if (!file) throw new Error("Kenneth French factor archive was empty.");
  return strFromU8(file);
}

async function fetchMonthlyRiskFactors() {
  const [research, momentum] = await Promise.all([fetchZipCsv(RESEARCH_URL), fetchZipCsv(MOMENTUM_URL)]);
  return mergeFrenchFactors(research, momentum);
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const results: Array<PromiseSettledResult<R>> = Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try { results[index] = { status: "fulfilled", value: await worker(items[index]) }; }
      catch (reason) { results[index] = { status: "rejected", reason }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()));
  return results;
}

function monthsBetween(start: string, end: string) {
  return monthOrdinal(end) - monthOrdinal(start) + 1;
}

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("universe") !== "sp1500") return NextResponse.json({ error: "Choose the sp1500 universe." }, { status: 400 });
  try {
    const members = await fetchSp1500Members();
    return NextResponse.json({ universe: "sp1500", count: members.length, companies: members, membershipMode: "current_snapshot", pointInTime: false, limitation: "Current public constituent tables only; historical point-in-time membership requires S&P, CRSP/Compustat, WRDS, or another licensed history." }, { headers: { "Cache-Control": "public, s-maxage=21_600, stale-while-revalidate=86_400" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "S&P 1500 membership is unavailable." }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { universe?: string; start?: string; end?: string; maxCompanies?: number; lag?: number; includePanel?: boolean };
  if (body.universe !== "sp1500") return NextResponse.json({ error: "Choose the S&P Composite 1500 universe." }, { status: 400 });
  const now = new Date();
  const currentMonth = now.toISOString().slice(0, 7);
  const lastCompleteMonth = addMonths(currentMonth, -1);
  const end = body.end ?? lastCompleteMonth;
  const start = body.start ?? addMonths(end, -119);
  if (!MONTH_PATTERN.test(start) || !MONTH_PATTERN.test(end) || start > end) return NextResponse.json({ error: "Choose a valid formation-month window." }, { status: 400 });
  if (end > lastCompleteMonth) return NextResponse.json({ error: `Formation months must be complete. Choose ${lastCompleteMonth} or earlier.` }, { status: 400 });
  if (monthsBetween(start, end) > 120) return NextResponse.json({ error: "Choose a window of ten years or less." }, { status: 400 });
  const requestedLimit = typeof body.maxCompanies === "number" && Number.isFinite(body.maxCompanies) ? Math.floor(body.maxCompanies) : 1500;
  if (requestedLimit < 1 || requestedLimit > 1500) return NextResponse.json({ error: "maxCompanies must be between 1 and 1500." }, { status: 400 });

  try {
    const [allMembers, benchmark, riskFactors] = await Promise.all([fetchSp1500Members(), fetchYahooDaily("^GSPC", start, end), fetchMonthlyRiskFactors()]);
    const members = allMembers.slice(0, requestedLimit);
    const outcomes = await mapWithConcurrency(members, 36, async (member) => {
      const market = await fetchYahooDaily(member.symbol, start, end);
      const fundamentals = await fetchYahooFundamentals(member.symbol, market.points);
      const rows = buildResearchFactorRows(market.points, { shares: fundamentals.shares, bookEquity: fundamentals.bookEquity, riskFactors, marketPoints: benchmark.points });
      return rows.filter((row) => row.month >= start && row.month <= end).map((row): PanelFactorRow => ({
        symbol: member.symbol,
        month: row.month,
        max: row.maxDailyReturn,
        beta: row.beta,
        size: row.size,
        bookToMarket: row.bookToMarket,
        momentum: row.momentum,
        reversal: row.reversal,
        illiquidity: row.illiquidity,
        forwardReturn: row.forwardMonthlyReturn,
        marketCap: row.marketCap,
        mktRf: row.mktRf,
        smb: row.smb,
        hml: row.hml,
        factorMomentum: row.factorMomentum,
        rf: row.rf,
        membershipStatus: "static_current",
      }));
    });
    const successfulRows = outcomes.flatMap((outcome) => outcome.status === "fulfilled" ? outcome.value : []);
    const failedSymbols = outcomes.flatMap((outcome, index) => outcome.status === "rejected" ? [members[index].symbol] : []);
    const symbols = members.map((member) => member.symbol);
    const analysis = analyzeResearchPanel(successfulRows, symbols, start, end, body.lag);
    const warnings = [...analysis.warnings, failedSymbols.length ? `${failedSymbols.length} companies could not be loaded and remain as missing rows in the master panel.` : null].filter((value): value is string => Boolean(value));
    const panelIncluded = body.includePanel === true || monthsBetween(start, end) <= 12;
    const panel = panelIncluded ? analysis.panel : analysis.panel.slice(0, PANEL_PREVIEW_LIMIT);
    return NextResponse.json({
      universe: "S&P Composite 1500",
      requested: { start, end, companies: symbols.length, lag: body.lag ?? null },
      membership: { mode: "current_snapshot", pointInTime: false, source: "Current public S&P 500, MidCap 400, and SmallCap 600 constituent tables", limitation: "This run is a current-roster research panel. Replace membershipByMonth with licensed point-in-time history before treating portfolio results as unbiased historical estimates." },
      masterDataset: { rowCount: analysis.panel.length, expectedRows: symbols.length * monthsBetween(start, end), previewRows: panel.length, panelIncluded, columns: ["symbol", "month", "max", "beta", "size", "book_to_market", "momentum", "reversal", "illiq_monthly", "forward_return", "market_cap", "membership_status", "observed", "missing_reason"] },
      panel,
      analysis: { ...analysis, panel: undefined },
      coverage: analysis.coverage,
      warnings,
      sources: { prices: "Yahoo Finance daily chart data", fundamentals: "Yahoo reported market-cap/equity time series with conservative publication lags", riskFactors: "Kenneth French Data Library monthly factors", benchmark: "Yahoo Finance ^GSPC daily returns" },
      requestedAt: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The S&P 1500 engine is unavailable.";
    return NextResponse.json({ error: message }, { status: /rate-limiting/.test(message) ? 429 : 502 });
  }
}
