import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

type HistoryRange = "1M" | "YTD" | "1Y";

type NasdaqHistoricalRow = {
  date?: string;
  close?: string;
  volume?: string;
  open?: string;
  high?: string;
  low?: string;
};

const SYMBOL_PATTERN = /^[A-Z0-9.-]{1,16}$/i;
const RANGES = new Set<HistoryRange>(["1M", "YTD", "1Y"]);

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseNumber(value: string | undefined) {
  if (!value || /N\/A|--/i.test(value)) return null;
  const parsed = Number(value.replace(/[$,%+\s,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function rowDate(value: string | undefined) {
  const match = value?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[1]}-${match[2]}` : null;
}

export async function GET(request: NextRequest) {
  const symbol = (request.nextUrl.searchParams.get("symbol") ?? "").trim().toUpperCase();
  const requestedRange = (request.nextUrl.searchParams.get("range") ?? "1Y") as HistoryRange;
  if (!SYMBOL_PATTERN.test(symbol)) {
    return NextResponse.json({ error: "Choose a valid constituent ticker." }, { status: 400 });
  }
  if (!RANGES.has(requestedRange)) {
    return NextResponse.json({ error: "Choose a supported history range." }, { status: 400 });
  }

  const end = new Date();
  const start = new Date(end);
  if (requestedRange === "1M") start.setMonth(start.getMonth() - 1);
  if (requestedRange === "YTD") start.setMonth(0, 1);
  if (requestedRange === "1Y") start.setFullYear(start.getFullYear() - 1);

  const url = new URL(`https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol.replaceAll("-", "/"))}/historical`);
  url.searchParams.set("assetclass", "stocks");
  url.searchParams.set("fromdate", isoDate(start));
  url.searchParams.set("todate", isoDate(end));
  url.searchParams.set("limit", "500");

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json, text/plain, */*",
        Origin: "https://www.nasdaq.com",
        Referer: "https://www.nasdaq.com/",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
      },
      next: { revalidate: 900 },
    });
    if (!response.ok) throw new Error("Price history is temporarily unavailable.");
    const payload = await response.json() as {
      data?: { tradesTable?: { rows?: NasdaqHistoricalRow[] } };
      status?: { rCode?: number };
    };
    const rows = payload.data?.tradesTable?.rows ?? [];
    const points = rows.flatMap((row) => {
      const date = rowDate(row.date);
      const close = parseNumber(row.close);
      if (!date || close == null) return [];
      return [{
        date,
        close,
        open: parseNumber(row.open),
        high: parseNumber(row.high),
        low: parseNumber(row.low),
        volume: parseNumber(row.volume),
      }];
    }).sort((a, b) => a.date.localeCompare(b.date));

    if (!points.length) throw new Error("No price history was returned for this stock.");
    const first = points[0].close;
    const last = points.at(-1)!.close;

    return NextResponse.json({
      symbol,
      range: requestedRange,
      points,
      returnPercent: first ? ((last / first) - 1) * 100 : null,
      requestedAt: new Date().toISOString(),
      source: "Nasdaq market activity",
    }, { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=21600" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Price history is temporarily unavailable.",
    }, { status: 502 });
  }
}
