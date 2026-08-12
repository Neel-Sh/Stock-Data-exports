import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        longName?: string;
        shortName?: string;
        currency?: string;
        exchangeName?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
        adjclose?: Array<{ adjclose?: Array<number | null> }>;
      };
      events?: {
        dividends?: Record<string, { amount?: number; date?: number }>;
        splits?: Record<string, { date?: number; numerator?: number; denominator?: number; splitRatio?: string }>;
      };
    }>;
    error?: { description?: string } | null;
  };
};

const ALLOWED_INTERVALS = new Set(["1d", "1wk", "1mo"]);
const SYMBOL_PATTERN = /^[A-Z0-9^=.-]{1,16}$/i;

function unixSeconds(value: string, includeEnd = false) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return null;
  if (includeEnd) date.setUTCDate(date.getUTCDate() + 1);
  return Math.floor(date.getTime() / 1000);
}

function finiteOrNull(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const symbols = [...new Set((params.get("symbols") ?? "^GSPC").split(",").map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
  const start = params.get("start") ?? "2016-01-01";
  const end = params.get("end") ?? new Date().toISOString().slice(0, 10);
  const interval = params.get("interval") ?? "1d";
  const period1 = unixSeconds(start);
  const period2 = unixSeconds(end, true);

  if (!symbols.length || symbols.length > 5 || symbols.some((symbol) => !SYMBOL_PATTERN.test(symbol))) {
    return NextResponse.json({ error: "Choose between one and five valid ticker symbols." }, { status: 400 });
  }
  if (!ALLOWED_INTERVALS.has(interval)) {
    return NextResponse.json({ error: "Frequency must be daily, weekly, or monthly." }, { status: 400 });
  }
  if (period1 == null || period2 == null || period1 >= period2) {
    return NextResponse.json({ error: "Choose a valid start and end date." }, { status: 400 });
  }
  const spanDays = (period2 - period1) / 86400;
  const estimatedPointsPerSeries = interval === "1d" ? spanDays * 0.72 : interval === "1wk" ? spanDays / 7 : spanDays / 30;
  if (estimatedPointsPerSeries * symbols.length > 40_000) {
    return NextResponse.json({ error: "That daily dataset is too large for one export. Choose weekly or monthly data, or shorten the date range." }, { status: 400 });
  }

  try {
    const outcomes = await Promise.allSettled(symbols.map(async (symbol) => {
      const url = new URL(`https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
      url.searchParams.set("period1", String(period1));
      url.searchParams.set("period2", String(period2));
      url.searchParams.set("interval", interval);
      url.searchParams.set("events", "div,splits");
      url.searchParams.set("includeAdjustedClose", "true");

      const upstream = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; TapeResearch/1.0)",
        },
        next: { revalidate: 3600 },
      });

      if (!upstream.ok) {
        if (upstream.status === 429) throw new Error("The data provider is temporarily rate-limiting requests. Try again in a minute.");
        throw new Error(`No history was returned for ${symbol}. Check the ticker and date range.`);
      }

      const payload = await upstream.json() as YahooChartResponse;
      const result = payload.chart?.result?.[0];
      if (!result || payload.chart?.error) {
        throw new Error(payload.chart?.error?.description || `No history was found for ${symbol}.`);
      }

      const timestamps = result.timestamp ?? [];
      const quote = result.indicators?.quote?.[0] ?? {};
      const adjusted = result.indicators?.adjclose?.[0]?.adjclose ?? [];
      const rawPoints = timestamps.map((timestamp, index) => ({
        date: new Date(timestamp * 1000).toISOString().slice(0, 10),
        open: finiteOrNull(quote.open?.[index]),
        high: finiteOrNull(quote.high?.[index]),
        low: finiteOrNull(quote.low?.[index]),
        close: finiteOrNull(quote.close?.[index]),
        adjClose: finiteOrNull(adjusted[index] ?? quote.close?.[index]),
        volume: finiteOrNull(quote.volume?.[index]),
      })).filter((point) => point.close != null || point.adjClose != null);

      const firstAdjustedClose = rawPoints.find((point) => point.adjClose != null)?.adjClose ?? null;
      const points = rawPoints.map((point, index) => {
        const previous = index > 0 ? rawPoints[index - 1].adjClose : null;
        const simpleReturn = previous != null && previous !== 0 && point.adjClose != null
          ? point.adjClose / previous - 1
          : null;
        const logReturn = previous != null && previous > 0 && point.adjClose != null && point.adjClose > 0
          ? Math.log(point.adjClose / previous)
          : null;
        const cumulativeReturn = firstAdjustedClose != null && firstAdjustedClose !== 0 && point.adjClose != null
          ? point.adjClose / firstAdjustedClose - 1
          : null;
        return { ...point, simpleReturn, logReturn, cumulativeReturn };
      });

      if (!points.length) throw new Error(`No observations were found for ${symbol} in that date range.`);

      const dividends = Object.values(result.events?.dividends ?? {}).map((event) => ({
        date: event.date ? new Date(event.date * 1000).toISOString().slice(0, 10) : "",
        type: "dividend" as const,
        amount: finiteOrNull(event.amount),
        numerator: null,
        denominator: null,
        ratio: null,
      }));
      const splits = Object.values(result.events?.splits ?? {}).map((event) => ({
        date: event.date ? new Date(event.date * 1000).toISOString().slice(0, 10) : "",
        type: "split" as const,
        amount: null,
        numerator: finiteOrNull(event.numerator),
        denominator: finiteOrNull(event.denominator),
        ratio: event.splitRatio ?? null,
      }));
      const actions = [...dividends, ...splits].filter((action) => action.date).sort((a, b) => a.date.localeCompare(b.date));
      const fields = ["open", "high", "low", "close", "adjClose", "volume"] as const;
      const missingValues = points.reduce((total, point) => total + fields.filter((field) => point[field] == null).length, 0);
      const completeRows = points.filter((point) => fields.every((field) => point[field] != null)).length;

      return {
        symbol: result.meta?.symbol ?? symbol,
        name: result.meta?.longName ?? result.meta?.shortName ?? symbol,
        currency: result.meta?.currency ?? "USD",
        exchange: result.meta?.exchangeName ?? "Market",
        points,
        actions,
        quality: {
          missingValues,
          completeRows,
          coverageStart: points[0].date,
          coverageEnd: points.at(-1)!.date,
        },
      };
    }));

    const series = outcomes.flatMap((outcome) => outcome.status === "fulfilled" ? [outcome.value] : []);
    const warnings = outcomes.flatMap((outcome) => outcome.status === "rejected"
      ? [outcome.reason instanceof Error ? outcome.reason.message : "A requested ticker could not be loaded."]
      : []);

    if (!series.length) throw new Error(warnings[0] ?? "No market history could be loaded.");

    return NextResponse.json(
      { series, warnings, requestedAt: new Date().toISOString(), source: "Yahoo Finance", interval },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "The market data service is unavailable.";
    return NextResponse.json({ error: message }, { status: /rate-limiting/.test(message) ? 429 : 502 });
  }
}
