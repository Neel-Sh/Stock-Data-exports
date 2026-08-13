export type SecTickerRecord = {
  cik_str: number;
  ticker: string;
  title?: string;
};

export const SEC_REQUEST_HEADERS = {
  Accept: "application/json, text/plain;q=0.9, */*;q=0.8",
  "Accept-Encoding": "gzip, deflate",
  "User-Agent": "Tape Research Dashboard (+https://github.com/Neel-Sh/Stock-Data-exports)",
} as const;

export function findSecCompanyInJson(
  payload: Record<string, { cik_str?: number; ticker?: string; title?: string }>,
  symbol: string,
): SecTickerRecord | null {
  const match = Object.values(payload).find((item) => item.ticker?.toUpperCase() === symbol.toUpperCase());
  if (!match?.cik_str || !match.ticker) return null;
  return { cik_str: match.cik_str, ticker: match.ticker, title: match.title };
}

export function findSecCompanyInText(payload: string, symbol: string): SecTickerRecord | null {
  const normalized = symbol.toLowerCase();
  for (const line of payload.split(/\r?\n/)) {
    const [ticker, cik] = line.trim().split("\t");
    if (ticker?.toLowerCase() !== normalized || !/^\d+$/.test(cik ?? "")) continue;
    return { cik_str: Number(cik), ticker: ticker.toUpperCase() };
  }
  return null;
}
