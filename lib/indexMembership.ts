export type IndexMember = {
  symbol: string;
  name: string;
  sector: string;
  industry: string;
  dateAdded: string | null;
  dataSymbol?: string | null;
};

export type IndexMembership = {
  members: IndexMember[];
  asOf: string;
  total: number;
  coverage: string;
};

const STOXX_PUBLIC_SNAPSHOT = [
  ["546078", "ASML HLDG", "Technology", "NL"],
  ["040054", "HSBC", "Banks", "GB"],
  ["474577", "ROCHE PS", "Health Care", "CH"],
  ["477408", "NOVARTIS", "Health Care", "CH"],
  ["B09CBL", "SHELL", "Energy", "GB"],
  ["461669", "NESTLE", "Food, Beverage and Tobacco", "CH"],
  ["098952", "ASTRAZENECA", "Health Care", "GB"],
  ["480710", "SIEMENS", "Industrial Goods and Services", "DE"],
  ["407228", "BCO SANTANDER", "Banks", "ES"],
  ["483410", "SCHNEIDER ELECTRIC", "Industrial Goods and Services", "FR"],
] as const;

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

export function parseStoxxMembership(html: string): IndexMembership {
  const body = html.match(/<tbody[^>]*id=["']components-table-body["'][^>]*>([\s\S]*?)<\/tbody>/i)?.[1];
  if (!body) throw new Error("The official STOXX component table could not be found.");
  const members = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].flatMap((row): IndexMember[] => {
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

export function stoxxFallbackMembership(): IndexMembership {
  return {
    members: STOXX_PUBLIC_SNAPSHOT.map(([key, name, sector, country]) => ({
      symbol: `STX${key}`,
      name,
      sector,
      industry: country,
      dateAdded: null,
      dataSymbol: null,
    })),
    asOf: "Aug. 13, 2026 snapshot",
    total: 600,
    coverage: "Top components · cached",
  };
}
