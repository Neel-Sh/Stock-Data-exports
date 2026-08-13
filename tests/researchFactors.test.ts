import assert from "node:assert/strict";
import test from "node:test";
import {
  buildResearchFactorRows,
  calculateDailyReturns,
  type DailyMarketPoint,
  type MonthlyRiskFactors,
  type ReportedFact,
} from "../lib/researchFactors";
import { mergeFrenchFactors } from "../lib/frenchFactors";
import {
  findSecCompanyInJson,
  findSecCompanyInText,
  SEC_REQUEST_HEADERS,
} from "../lib/secTickerMapping";
import { getSecFundamentalsSnapshot } from "../lib/secFundamentalsSnapshot";

test("SEC requests declare the application and a public contact path", () => {
  assert.match(SEC_REQUEST_HEADERS["User-Agent"], /Tape Research Dashboard/);
  assert.match(SEC_REQUEST_HEADERS["User-Agent"], /https:\/\/github\.com\/Neel-Sh\/Stock-Data-exports/);
  assert.equal(SEC_REQUEST_HEADERS["Accept-Encoding"], "gzip, deflate");
});

test("SEC ticker lookup supports the primary JSON and text fallback formats", () => {
  assert.deepEqual(findSecCompanyInJson({
    "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
  }, "aapl"), { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." });
  assert.deepEqual(findSecCompanyInText("msft\t789019\naapl\t320193\n", "AAPL"), {
    cik_str: 320193,
    ticker: "AAPL",
  });
  assert.equal(findSecCompanyInText("msft\t789019\n", "AAPL"), null);
});

test("Apple SEC snapshot reproduces March 2026 SIZE and BM without look-ahead", () => {
  const snapshot = getSecFundamentalsSnapshot("AAPL");
  assert.ok(snapshot);
  const close = 253.7899932861328;
  const rows = buildResearchFactorRows([
    { date: "2026-03-31", close, adjClose: close, volume: 1_000 },
  ], { shares: snapshot.shares, bookEquity: snapshot.bookEquity });
  assert.equal(rows[0].shares?.value, 14_681_140_000);
  assert.equal(rows[0].shares?.filed, "2026-01-30");
  assert.equal(rows[0].bookEquity?.value, 88_190_000_000);
  assert.equal(rows[0].bookEquity?.filed, "2026-01-30");
  assert.ok(Math.abs(rows[0].marketCap! - 3_725_926_422_032.776) < 0.01);
  assert.ok(Math.abs(rows[0].size! - 28.946336640739798) < 1e-12);
  assert.ok(Math.abs(rows[0].bookToMarket! - 0.023669281142670997) < 1e-12);
});

test("Kenneth French CSV values are normalized from percentage points", () => {
  const researchCsv = [
    "Created from CRSP data",
    ",Mkt-RF,SMB,HML,RF",
    "202401, 1.50, -2.00, 0.25, 0.40",
    " Annual Factors: January-December",
    "2024, 1.00, 2.00, 3.00, 4.00",
  ].join("\n");
  const momentumCsv = [",Mom", "202401, 3.25", "202402, -99.99"].join("\n");
  assert.deepEqual(mergeFrenchFactors(researchCsv, momentumCsv), [{
    month: "2024-01",
    mktRf: 0.015,
    smb: -0.02,
    hml: 0.0025,
    rf: 0.004,
    momentum: 0.0325,
  }]);
});

test("daily return uses consecutive adjusted closes", () => {
  const points: DailyMarketPoint[] = [
    { date: "2024-01-02", close: 100, adjClose: 100, volume: 1_000 },
    { date: "2024-01-03", close: 110, adjClose: 110, volume: 1_100 },
  ];
  const daily = calculateDailyReturns(points);
  assert.equal(daily[0].simpleReturn, null);
  assert.ok(Math.abs(daily[1].simpleReturn! - 0.1) < 1e-12);
});

test("monthly factors follow the PDF formulas without look-ahead", () => {
  const points: DailyMarketPoint[] = [];
  for (let monthIndex = 0; monthIndex < 15; monthIndex += 1) {
    const date = new Date(Date.UTC(2023, monthIndex, 1));
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    for (let day = 1; day <= 6; day += 1) {
      const value = 100 + monthIndex * 10 + day - 1;
      points.push({
        date: `${year}-${month}-${String(day).padStart(2, "0")}`,
        close: value,
        adjClose: value,
        volume: 1_000,
      });
    }
  }

  const shares: ReportedFact[] = [
    { value: 1_000, end: "2022-12-31", filed: "2023-01-15", form: "10-K", tag: "CommonStockSharesOutstanding" },
    { value: 2_000, end: "2024-02-29", filed: "2024-04-15", form: "10-Q", tag: "CommonStockSharesOutstanding" },
  ];
  const bookEquity: ReportedFact[] = [
    { value: 50_000, end: "2022-12-31", filed: "2023-01-15", form: "10-K", tag: "StockholdersEquity" },
  ];
  const riskFactors: MonthlyRiskFactors[] = [
    { month: "2024-02", mktRf: 0.01, smb: 0.02, hml: -0.03, momentum: 0.04, rf: 0.005 },
  ];

  const rows = buildResearchFactorRows(points, { shares, bookEquity, riskFactors });
  const row = rows.find((item) => item.month === "2024-02");
  assert.ok(row);

  // February 2024 month-end price is 235; adjacent month ends are 225 and 245.
  assert.ok(Math.abs(row.forwardMonthlyReturn! - (245 / 235 - 1)) < 1e-12);
  assert.ok(Math.abs(row.reversal! - (235 / 225 - 1)) < 1e-12);

  // Standard 12-2 momentum compounds returns from t-12 through t-2: P(t-2) / P(t-13) - 1.
  assert.ok(Math.abs(row.momentum! - (215 / 105 - 1)) < 1e-12);

  const februaryPoints = calculateDailyReturns(points).filter((item) => item.date.startsWith("2024-02"));
  const februaryReturns = februaryPoints.map((item) => item.simpleReturn!).sort((a, b) => b - a);
  assert.equal(row.maxDailyReturn, februaryReturns[0]);
  assert.ok(Math.abs(row.max5! - februaryReturns.slice(0, 5).reduce((sum, value) => sum + value, 0) / 5) < 1e-12);

  const expectedIlliquidity = februaryPoints
    .map((item) => Math.abs(item.simpleReturn!) / (item.close! * item.volume!))
    .reduce((sum, value) => sum + value, 0) / februaryPoints.length;
  assert.ok(Math.abs(row.illiquidity! - expectedIlliquidity) < 1e-18);

  // The later shares fact was filed after the formation month and must not leak backward.
  assert.equal(row.shares?.value, 1_000);
  assert.equal(row.marketCap, 235_000);
  assert.ok(Math.abs(row.size! - Math.log(235_000)) < 1e-12);
  assert.ok(Math.abs(row.bookToMarket! - 50_000 / 235_000) < 1e-12);
  assert.deepEqual(
    [row.mktRf, row.smb, row.hml, row.factorMomentum, row.rf],
    [0.01, 0.02, -0.03, 0.04, 0.005],
  );
});

test("MAX(5), fundamentals, and momentum stay unavailable when coverage is insufficient", () => {
  const rows = buildResearchFactorRows([
    { date: "2024-01-02", close: 100, adjClose: 100, volume: 1_000 },
    { date: "2024-01-03", close: 101, adjClose: 101, volume: 1_000 },
  ]);
  assert.equal(rows[0].max5, null);
  assert.equal(rows[0].size, null);
  assert.equal(rows[0].bookToMarket, null);
  assert.equal(rows[0].momentum, null);
  assert.equal(rows[0].forwardMonthlyReturn, null);
});
