import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const [symbolInput, cikInput, inputPath] = process.argv.slice(2);
if (!symbolInput || !/^\d{1,10}$/.test(cikInput ?? "")) {
  throw new Error("Usage: node scripts/update-sec-fundamentals-snapshot.mjs SYMBOL CIK [companyfacts.json]");
}

const symbol = symbolInput.toUpperCase();
const cik = cikInput.padStart(10, "0");
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(projectRoot, "data/secFundamentalsSnapshots.json");
const forms = new Set(["10-K", "10-K/A", "10-Q", "10-Q/A", "20-F", "20-F/A", "40-F", "40-F/A"]);

const payload = inputPath
  ? JSON.parse(await readFile(resolve(inputPath), "utf8"))
  : await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Tape Research Dashboard (+https://github.com/Neel-Sh/Stock-Data-exports)",
      },
    }).then((response) => {
      if (!response.ok) throw new Error(`SEC Company Facts returned HTTP ${response.status}.`);
      return response.json();
    });

function reportedFacts(namespace, candidates, unit) {
  for (const tag of candidates) {
    const values = payload.facts?.[namespace]?.[tag]?.units?.[unit] ?? [];
    const facts = values.flatMap((item) => {
      if (item.val == null || !Number.isFinite(item.val) || item.val <= 0 || !item.end || !item.filed || !item.form || !forms.has(item.form)) return [];
      return [{ value: item.val, end: item.end, filed: item.filed, form: item.form, tag }];
    });
    if (facts.length) return facts;
  }
  return [];
}

function latestPeriodPerFiling(facts) {
  const filings = new Map();
  for (const fact of facts) {
    const key = `${fact.filed}|${fact.form}`;
    const previous = filings.get(key);
    if (!previous || fact.end > previous.end) filings.set(key, fact);
  }
  return [...filings.values()].sort((a, b) => a.filed.localeCompare(b.filed));
}

let snapshots = {};
try {
  snapshots = JSON.parse(await readFile(outputPath, "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

snapshots[symbol] = {
  cik,
  entityName: payload.entityName ?? symbol,
  retrievedAt: new Date().toISOString().slice(0, 10),
  shares: latestPeriodPerFiling(reportedFacts("dei", ["EntityCommonStockSharesOutstanding"], "shares")),
  bookEquity: latestPeriodPerFiling(reportedFacts("us-gaap", [
    "CommonStockholdersEquity",
    "StockholdersEquity",
    "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
  ], "USD")),
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(snapshots, null, 2)}\n`);
console.log(`Updated ${symbol}: ${snapshots[symbol].shares.length} share facts and ${snapshots[symbol].bookEquity.length} equity facts.`);
