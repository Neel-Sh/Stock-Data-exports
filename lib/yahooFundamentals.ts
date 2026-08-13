import type { DailyMarketPoint, ReportedFact } from "./researchFactors";

type YahooReportedValue = {
  asOfDate?: string;
  currencyCode?: string;
  reportedValue?: { raw?: number };
};

export type YahooTimeseriesPayload = {
  timeseries?: {
    result?: Array<Record<string, unknown>>;
    error?: { description?: string } | null;
  };
};

export type CurrencyConverter = (value: number, from: string, to: string, date: string) => number | null;

type YahooFact = ReportedFact & { currency: string };

const QUARTERLY_LAG_DAYS = 60;
const ANNUAL_LAG_DAYS = 120;

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function series(payload: YahooTimeseriesPayload, type: string) {
  const result = payload.timeseries?.result ?? [];
  const row = result.find((item) => Array.isArray((item.meta as { type?: string[] } | undefined)?.type)
    && (item.meta as { type: string[] }).type.includes(type));
  return (row?.[type] as YahooReportedValue[] | undefined) ?? [];
}

function reportedFacts(payload: YahooTimeseriesPayload, types: string[], tag: string) {
  return types.flatMap((type): YahooFact[] => {
    const annual = type.startsWith("annual");
    return series(payload, type).flatMap((item) => {
      const value = item.reportedValue?.raw;
      if (!item.asOfDate || !item.currencyCode || value == null || !Number.isFinite(value) || value <= 0) return [];
      return [{
        value,
        end: item.asOfDate,
        filed: addDays(item.asOfDate, annual ? ANNUAL_LAG_DAYS : QUARTERLY_LAG_DAYS),
        form: annual ? "12M report" : "3M report",
        tag,
        currency: item.currencyCode,
      }];
    });
  });
}

function pointOnOrBefore(points: DailyMarketPoint[], date: string) {
  return points
    .filter((point) => point.date <= date && point.close != null && point.close > 0)
    .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
}

function deduplicateFacts(facts: ReportedFact[]) {
  const deduplicated = new Map<string, ReportedFact>();
  for (const fact of facts) {
    const key = `${fact.end}|${fact.filed}`;
    if (!deduplicated.has(key)) deduplicated.set(key, fact);
  }
  return [...deduplicated.values()].sort((a, b) => a.end.localeCompare(b.end) || a.filed.localeCompare(b.filed));
}

export function buildYahooFundamentalFacts(
  payload: YahooTimeseriesPayload,
  marketPoints: DailyMarketPoint[],
  marketCurrency: string,
  convertCurrency: CurrencyConverter,
) {
  const marketCaps = reportedFacts(payload, ["quarterlyMarketCap", "annualMarketCap"], "YahooReportedMarketCap");
  const equities = reportedFacts(payload, [
    "quarterlyStockholdersEquity",
    "annualStockholdersEquity",
    "quarterlyCommonStockEquity",
    "annualCommonStockEquity",
  ], "YahooReportedStockholdersEquity");

  const shares = marketCaps.flatMap((fact): ReportedFact[] => {
    const point = pointOnOrBefore(marketPoints, fact.end);
    if (!point?.close) return [];
    const marketCap = convertCurrency(fact.value, fact.currency, marketCurrency, fact.end);
    if (marketCap == null || marketCap <= 0) return [];
    return [{
      value: marketCap / point.close,
      end: fact.end,
      filed: fact.filed,
      form: fact.form,
      tag: "YahooImpliedListedShares",
    }];
  });

  const bookEquity = equities.flatMap((fact): ReportedFact[] => {
    const converted = convertCurrency(fact.value, fact.currency, marketCurrency, fact.end);
    if (converted == null || converted <= 0) return [];
    return [{ ...fact, value: converted, tag: "YahooReportedStockholdersEquity" }];
  });

  return {
    shares: deduplicateFacts(shares),
    bookEquity: deduplicateFacts(bookEquity),
  };
}
