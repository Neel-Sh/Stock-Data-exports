import assert from "node:assert/strict";
import test from "node:test";
import { analyzeResearchPanel, buildUnbalancedPanel, ordinaryLeastSquares, type PanelFactorRow } from "../lib/batchEngine";

function row(symbol: string, month: string, max: number, forwardReturn: number, marketCap = 100): PanelFactorRow {
  return {
    symbol, month, max, forwardReturn, marketCap,
    beta: 1, size: marketCap, bookToMarket: 0.5, momentum: 0.1, reversal: 0.02, illiquidity: 0.0001,
    membershipStatus: "point_in_time",
  };
}

test("unbalanced panels preserve history and materialize post-exit months as missing", () => {
  const input = [row("LIVE", "2015-01", 0.1, 0.02), row("LIVE", "2015-02", 0.2, 0.03), row("EXIT", "2015-01", 0.9, -0.2)];
  const result = buildUnbalancedPanel(input, ["LIVE", "EXIT"], "2015-01", "2015-03");
  assert.equal(result.panel.length, 6);
  assert.equal(result.panel.filter((item) => item.symbol === "EXIT" && item.month === "2015-01")[0].forwardReturn, -0.2);
  assert.equal(result.panel.filter((item) => item.symbol === "EXIT" && item.month === "2015-02")[0].isMissing, true);
  assert.equal(result.coverage.postExitRows, 3);
});

test("OLS returns an intercept and exact slope for a linear cross-section", () => {
  const coefficients = ordinaryLeastSquares([3, 5, 7], [[1], [2], [3]]);
  assert.ok(coefficients);
  assert.ok(Math.abs(coefficients[0] - 1) < 1e-10);
  assert.ok(Math.abs(coefficients[1] - 2) < 1e-10);
});

test("batch analysis returns decile, dependent-sort, and Fama-MacBeth outputs", () => {
  const rows: PanelFactorRow[] = [];
  for (let monthIndex = 1; monthIndex <= 4; monthIndex += 1) {
    const month = `2020-0${monthIndex}`;
    for (let companyIndex = 1; companyIndex <= 20; companyIndex += 1) {
      const value = companyIndex / 100;
      rows.push(row(`S${String(companyIndex).padStart(2, "0")}`, month, value, value + monthIndex / 1000, 100 + companyIndex));
    }
  }
  const result = analyzeResearchPanel(rows, Array.from({ length: 20 }, (_, index) => `S${String(index + 1).padStart(2, "0")}`), "2020-01", "2020-04");
  assert.equal(result.coverage.masterRows, 80);
  assert.equal(result.decileSort.summary.length, 10);
  assert.equal(Object.keys(result.dependentSorts).length, 6);
  assert.ok(result.famaMacBeth.averages.some((item) => item.factor === "max"));
});
