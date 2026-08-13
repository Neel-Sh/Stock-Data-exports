import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

type IndexId = "sp500" | "sp1500" | "europe600" | "nasdaq100" | "dow30";

type IndexConfig = {
  id: IndexId;
  name: string;
  shortName: string;
  symbol: string;
  pages: string[];
  description: string;
  weighting: string;
};

type Membership = {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  dateAdded: string | null;
  dataSymbol?: string | null;
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
    pages: ["List of S&P 500 companies"],
    description: "Leading large-cap U.S. companies across every major sector.",
    weighting: "Float-adjusted market cap",
  },
  sp1500: {
    id: "sp1500",
    name: "S&P Composite 1500",
    shortName: "S&P 1500",
    symbol: "^SP1500",
    pages: ["List of S&P 500 companies", "List of S&P 400 companies", "List of S&P 600 companies"],
    description: "Large-, mid-, and small-cap U.S. companies in one broad benchmark.",
    weighting: "Float-adjusted market cap",
  },
  europe600: {
    id: "europe600",
    name: "STOXX Europe 600",
    shortName: "STOXX 600",
    symbol: "^STOXX",
    pages: ["STOXX Europe 600"],
    description: "Large-, mid-, and small-cap companies across 17 European countries.",
    weighting: "Free-float market cap",
  },
  nasdaq100: {
    id: "nasdaq100",
    name: "Nasdaq-100",
    shortName: "Nasdaq 100",
    symbol: "^NDX",
    pages: ["List of NASDAQ-100 companies"],
    description: "The largest non-financial companies listed on Nasdaq.",
    weighting: "Modified market cap",
  },
  dow30: {
    id: "dow30",
    name: "Dow Jones Industrial Average",
    shortName: "Dow 30",
    symbol: "^DJI",
    pages: ["Dow Jones Industrial Average"],
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
    .replace(/\{\{flag\|([^{}|]+)(?:\|[^{}]*)?\}\}/gi, "$1")
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
  const templates = [...withoutRefs.matchAll(/\{\{[^{}]+\}\}/g)].map((match) => match[0]);
  const template = templates.findLast((item) => /(?:Nasdaq|Nyse|Lse|Euronext|Symbol)/i.test(item)) ?? templates.at(-1);
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
  const sectionStart = id === "europe600" ? wikitext.indexOf("==Index components==") : 0;
  const tableStart = id === "europe600"
    ? wikitext.indexOf('{| class="wikitable sortable"', sectionStart)
    : wikitext.indexOf('id="constituents"');
  if (tableStart < 0) throw new Error("The constituent table could not be found.");
  const tableEnd = wikitext.indexOf("\n|}", tableStart);
  const table = wikitext.slice(tableStart, tableEnd > tableStart ? tableEnd : undefined);
  const rows = table.split(/\n\|-\s*\n/).slice(1);

  return rows.flatMap((row): Membership[] => {
    const cells = rowCells(row);
    if ((id === "sp500" || id === "sp1500") && cells.length >= 4) {
      const symbol = cleanSymbol(cells[0]);
      if (!/^[A-Z0-9.-]+$/.test(symbol)) return [];
      const possibleDate = cleanWiki(cells[5] ?? "");
      return [{
        symbol,
        name: cleanWiki(cells[1]),
        sector: cleanWiki(cells[2]),
        industry: cleanWiki(cells[3]),
        dateAdded: /^\d{4}-\d{2}-\d{2}$/.test(possibleDate) ? possibleDate : null,
      }];
    }
    if (id === "europe600" && cells.length >= 4) {
      const symbol = cleanSymbol(cells[0]);
      if (!/^[A-Z0-9.-]+$/i.test(symbol)) return [];
      return [{
        symbol,
        name: cleanWiki(cells[1]),
        sector: cleanWiki(cells[2]),
        industry: cleanWiki(cells[3]),
        dateAdded: null,
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

function cleanHtml(value: string) {
  return value
    .replace(/<input\b[^>]*>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function parseStoxxMembership(html: string) {
  const body = html.match(/<tbody[^>]*id=["']components-table-body["'][^>]*>([\s\S]*?)<\/tbody>/i)?.[1];
  if (!body) throw new Error("The official STOXX component table could not be found.");
  const members = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].flatMap((row): Membership[] => {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1]);
    const key = cells[0]?.match(/component-details\?key=([a-z0-9]+)/i)?.[1];
    const name = cleanHtml(cells[0] ?? "");
    const sector = cleanHtml(cells[1] ?? "");
    const country = cleanHtml(cells[2] ?? "");
    if (!key || !name) return [];
    return [{ symbol: `STX${key}`, name, sector, industry: country, dateAdded: null, dataSymbol: null }];
  });
  const asOf = cleanHtml(html.match(/As of Date:\s*([^<]+)/i)?.[1] ?? "");
  const total = Number(html.match(/Total\s*\((\d+)\s+Components\)/i)?.[1]);
  if (total !== 600 || members.length < 10) throw new Error("The official STOXX component summary is incomplete.");
  return { members, asOf, total, coverage: "Top components" };
}

async function fetchMembership(config: IndexConfig) {
  if (config.id === "europe600") {
    const url = new URL("https://www.stoxx.com/index-details");
    url.searchParams.set("_STOXXIndexDetailsportlet_WAR_STOXXIndexDetailsportlet_symbol", "SXXP");
    url.searchParams.set("p_p_cacheability", "cacheLevelPage");
    url.searchParams.set("p_p_col_count", "6");
    url.searchParams.set("p_p_col_id", "column-1");
    url.searchParams.set("p_p_id", "STOXXIndexDetailsportlet_WAR_STOXXIndexDetailsportlet");
    url.searchParams.set("p_p_lifecycle", "2");
    url.searchParams.set("p_p_mode", "view");
    url.searchParams.set("p_p_resource_id", "addComponentsTab");
    url.searchParams.set("p_p_state", "normal");
    let lastError: unknown = new Error("Official STOXX membership is temporarily unavailable.");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(url, attempt === 0 ? {
          headers: { Accept: "text/html", "User-Agent": "TapeResearch/1.2 (index explorer)" },
          next: { revalidate: 21_600 },
        } : {
          headers: { Accept: "text/html", "User-Agent": "TapeResearch/1.2 (index explorer)" },
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Official STOXX membership is temporarily unavailable.");
        return parseStoxxMembership(await response.text());
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  const lists = await Promise.all(config.pages.map(async (page) => {
    const url = new URL("https://en.wikipedia.org/w/api.php");
    url.searchParams.set("action", "parse");
    url.searchParams.set("page", page);
    url.searchParams.set("prop", "wikitext");
    url.searchParams.set("format", "json");
    url.searchParams.set("formatversion", "2");
    url.searchParams.set("origin", "*");

    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "TapeResearch/1.2 (index explorer)" },
      next: { revalidate: 21_600 },
    });
    if (!response.ok) throw new Error("Index membership is temporarily unavailable.");
    const payload = await response.json() as { parse?: { wikitext?: string } };
    if (!payload.parse?.wikitext) throw new Error("Index membership is temporarily unavailable.");
    return parseMembership(payload.parse.wikitext, config.id);
  }));

  const deduplicated = new Map(lists.flat().map((member) => [member.symbol, member]));
  const members = [...deduplicated.values()];
  return { members, asOf: "", total: members.length, coverage: "Full table" };
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
    const [membership, quotes] = await Promise.all([
      fetchMembership(config),
      config.id === "europe600" ? Promise.resolve([]) : fetchQuotes(),
    ]);
    const members = membership.members;
    const quoteMap = new Map(quotes.map((quote) => [quoteKey(quote.symbol ?? ""), quote]));
    const constituents = members.map((member) => {
      const quote = quoteMap.get(quoteKey(member.symbol));
      return {
        ...member,
        dataSymbol: member.dataSymbol === null ? null : member.symbol.replaceAll(".", "-").replaceAll("/", "-"),
        lastPrice: parseNumber(quote?.lastsale),
        change: parseNumber(quote?.netchange),
        changePercent: parseNumber(quote?.pctchange),
        marketCap: parseNumber(quote?.marketCap),
      };
    });

    return NextResponse.json({
      index: config,
      membershipTotal: membership.total,
      membershipCoverage: membership.coverage,
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
        membership: config.id === "sp1500"
          ? "Current S&P 500, MidCap 400, and SmallCap 600 constituent tables"
          : config.id === "europe600"
            ? `Official STOXX top-component table${membership.asOf ? ` · ${membership.asOf}` : ""}`
            : "Wikipedia constituent table",
        snapshot: config.id === "europe600" ? "Not exposed on the public STOXX component page" : "Nasdaq market activity",
      },
    }, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=21600" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "The index explorer is temporarily unavailable.",
    }, { status: 502 });
  }
}
