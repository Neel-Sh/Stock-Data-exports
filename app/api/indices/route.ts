import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

type IndexId = "sp500" | "nasdaq100" | "dow30";

type IndexConfig = {
  id: IndexId;
  name: string;
  shortName: string;
  symbol: string;
  page: string;
  description: string;
  weighting: string;
};

type Membership = {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  dateAdded: string | null;
};

type NasdaqRow = {
  symbol?: string;
  name?: string;
  lastsale?: string;
  netchange?: string;
  pctchange?: string;
  marketCap?: string;
};

const INDEXES: Record<IndexId, IndexConfig> = {
  sp500: {
    id: "sp500",
    name: "S&P 500",
    shortName: "S&P 500",
    symbol: "^GSPC",
    page: "List of S&P 500 companies",
    description: "Leading large-cap U.S. companies across every major sector.",
    weighting: "Float-adjusted market cap",
  },
  nasdaq100: {
    id: "nasdaq100",
    name: "Nasdaq-100",
    shortName: "Nasdaq 100",
    symbol: "^NDX",
    page: "List of NASDAQ-100 companies",
    description: "The largest non-financial companies listed on Nasdaq.",
    weighting: "Modified market cap",
  },
  dow30: {
    id: "dow30",
    name: "Dow Jones Industrial Average",
    shortName: "Dow 30",
    symbol: "^DJI",
    page: "Dow Jones Industrial Average",
    description: "Thirty established U.S. blue-chip companies.",
    weighting: "Price weighted",
  },
};

function cleanWiki(value: string) {
  return value
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<ref\b[^>]*\/>/gi, "")
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, "$1")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/'{2,}/g, "")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanSymbol(value: string) {
  const withoutRefs = value
    .replace(/<ref\b[^>]*>[\s\S]*?<\/ref>/gi, "")
    .replace(/<ref\b[^>]*\/>/gi, "")
    .trim();
  const template = withoutRefs.match(/\{\{[^{}]+\}\}/)?.[0];
  const candidate = template
    ? template.slice(2, -2).split("|").at(-1) ?? ""
    : cleanWiki(withoutRefs);
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

function parseMembership(wikitext: string, id: IndexId) {
  const tableStart = wikitext.indexOf('id="constituents"');
  if (tableStart < 0) throw new Error("The constituent table could not be found.");
  const tableEnd = wikitext.indexOf("\n|}", tableStart);
  const table = wikitext.slice(tableStart, tableEnd > tableStart ? tableEnd : undefined);
  const rows = table.split(/\n\|-\s*\n/).slice(1);

  return rows.flatMap((row): Membership[] => {
    const cells = rowCells(row);
    if (id === "sp500" && cells.length >= 6) {
      const symbol = cleanSymbol(cells[0]);
      if (!/^[A-Z0-9.-]+$/.test(symbol)) return [];
      return [{
        symbol,
        name: cleanWiki(cells[1]),
        sector: cleanWiki(cells[2]),
        industry: cleanWiki(cells[3]),
        dateAdded: cleanWiki(cells[5]) || null,
      }];
    }
    if (id === "nasdaq100" && cells.length >= 4) {
      const symbol = cleanSymbol(cells[0]);
      if (!/^[A-Z0-9.-]+$/.test(symbol)) return [];
      return [{
        symbol,
        name: cleanWiki(cells[1]),
        sector: cleanWiki(cells[2]),
        industry: cleanWiki(cells[3]),
        dateAdded: null,
      }];
    }
    if (id === "dow30" && cells.length >= 5) {
      const symbol = cleanSymbol(cells[2]);
      if (!/^[A-Z0-9.-]+$/.test(symbol) || symbol === "SYMBOL") return [];
      return [{
        symbol,
        name: cleanWiki(cells[0]),
        sector: cleanWiki(cells[3]),
        industry: "",
        dateAdded: cleanWiki(cells[4]) || null,
      }];
    }
    return [];
  });
}

function parseNumber(value: string | undefined) {
  if (!value || /N\/A|--/i.test(value)) return null;
  const parsed = Number(value.replace(/[$,%+\s,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function quoteKey(symbol: string) {
  return symbol.replace(/[./-]/g, "").toUpperCase();
}

async function fetchMembership(config: IndexConfig) {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "parse");
  url.searchParams.set("page", config.page);
  url.searchParams.set("prop", "wikitext");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("origin", "*");

  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "TapeResearch/1.1 (index explorer)" },
    next: { revalidate: 21_600 },
  });
  if (!response.ok) throw new Error("Index membership is temporarily unavailable.");
  const payload = await response.json() as { parse?: { wikitext?: string } };
  if (!payload.parse?.wikitext) throw new Error("Index membership is temporarily unavailable.");
  return parseMembership(payload.parse.wikitext, config.id);
}

async function fetchQuotes() {
  const response = await fetch("https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=5000&offset=0", {
    headers: {
      Accept: "application/json, text/plain, */*",
      Origin: "https://www.nasdaq.com",
      Referer: "https://www.nasdaq.com/",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
    },
    next: { revalidate: 300 },
  });
  if (!response.ok) return [];
  const payload = await response.json() as { data?: { table?: { rows?: NasdaqRow[] } } };
  return payload.data?.table?.rows ?? [];
}

export async function GET(request: NextRequest) {
  const requestedIndex = request.nextUrl.searchParams.get("index") ?? "sp500";
  if (!(requestedIndex in INDEXES)) {
    return NextResponse.json({ error: "Choose a supported index." }, { status: 400 });
  }

  const config = INDEXES[requestedIndex as IndexId];
  try {
    const [members, quotes] = await Promise.all([fetchMembership(config), fetchQuotes()]);
    const quoteMap = new Map(quotes.map((quote) => [quoteKey(quote.symbol ?? ""), quote]));
    const constituents = members.map((member) => {
      const quote = quoteMap.get(quoteKey(member.symbol));
      return {
        ...member,
        dataSymbol: member.symbol.replaceAll(".", "-").replaceAll("/", "-"),
        lastPrice: parseNumber(quote?.lastsale),
        change: parseNumber(quote?.netchange),
        changePercent: parseNumber(quote?.pctchange),
        marketCap: parseNumber(quote?.marketCap),
      };
    });

    return NextResponse.json({
      index: config,
      indexes: Object.values(INDEXES).map((item) => ({
        id: item.id,
        name: item.name,
        shortName: item.shortName,
        symbol: item.symbol,
        description: item.description,
        weighting: item.weighting,
      })),
      constituents,
      requestedAt: new Date().toISOString(),
      sources: {
        membership: "Wikipedia constituent table",
        snapshot: "Nasdaq market activity",
      },
    }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=21600" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "The index explorer is temporarily unavailable.",
    }, { status: 502 });
  }
}
