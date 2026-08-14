import assert from "node:assert/strict";
import test from "node:test";
import {
  neweyWestMean,
  ordinaryLeastSquares,
  runPortfolioAnalysis,
  type PortfolioPanelRow,
} from "../lib/portfolioAnalysis";

function panelRow(
  symbol: string,
  month: string,
  max: number,
  forwardReturn: number | null,
  overrides: Partial<PortfolioPanelRow> = {},
): PortfolioPanelRow {
  return {
    symbol,
    month,
    max,
    beta: max / 10,
    size: max,
    bookToMarket: max / 20,
    momentum: max / 30,
    reversal: max / 40,
    illiquidity: max / 50,
    forwardReturn,
    marketCap: 1_000 + max,
    membershipStatus: "member",
    ...overrides,
  };
}

test("preserves an unbalanced panel and keeps pre-exit rows in the cross-section", () => {
  const rows: PortfolioPanelRow[] = [
    panelRow("AAA", "2010-01", 1, 0.01),
    panelRow("AAA", "2010-02", 2, 0.02),
    panelRow("AAA", "2010-03", 3, null, { membershipStatus: "delisted", delistingReturn: -0.5 }),
    panelRow("BBB", "2010-01", 4, 0.04),
    panelRow("BBB", "2010-02", 5, 0.05),
    panelRow("BBB", "2010-03", 6, 0.06),
    panelRow("BBB", "2010-04", 7, 0.07),
  ];
  const result = runPortfolioAnalysis(rows, {
    startMonth: "2010-01",
    endMonth: "2010-04",
    membershipByMonth: {
      "2010-01": ["AAA", "BBB"],
      "2010-02": ["AAA", "BBB"],
      "2010-03": ["AAA", "BBB"],
      "2010-04": ["BBB"],
    },
    minDecileObservations: 2,
  });

  assert.equal(result.panel.length, 8, "two symbols are preserved for all four requested months");
  const exited = result.panel.find((row) => row.symbol === "AAA" && row.month === "2010-04");
  assert.ok(exited);
  assert.equal(exited.isSynthetic, true);
  assert.equal(exited.isMember, false);
  assert.equal(exited.max, null);
  assert.equal(exited.forwardReturn, null);
  assert.equal(exited.effectiveForwardReturn, null);

  const finalObserved = result.panel.find((row) => row.symbol === "AAA" && row.month === "2010-03");
  assert.ok(finalObserved);
  assert.equal(finalObserved.isMember, true);
  assert.equal(finalObserved.effectiveForwardReturn, -0.5);
  assert.equal(result.coverage.syntheticRows, 1);
  assert.equal(result.coverage.delistedSymbols, 1);
  assert.equal(result.coverage.delistingReturnUsedRows, 1);
  assert.equal(result.coverage.memberRows, 7);
  assert.equal(result.methodology.membership.pointInTime, true);
  assert.equal(result.methodology.membership.staticCurrentListLimitation, false);
  assert.equal(JSON.stringify(result).includes("NaN"), false);

  const postExitWindow = runPortfolioAnalysis(rows, {
    startMonth: "2010-04",
    endMonth: "2010-04",
    membershipByMonth: { "2010-04": ["BBB"] },
  });
  assert.equal(postExitWindow.panel.some((row) => row.symbol === "AAA" && row.isSynthetic), true);

  const staticFallback = runPortfolioAnalysis(rows, {
    startMonth: "2010-01",
    endMonth: "2010-04",
    currentSymbols: ["AAA", "BBB"],
  });
  assert.equal(staticFallback.methodology.membership.source, "static-current-list");
  assert.equal(staticFallback.methodology.membership.staticCurrentListLimitation, true);
  assert.ok(staticFallback.warnings.some((warning) => /static-current-list/i.test(warning)));
});

test("forms ascending MAX deciles and 10x10 dependent sorts with both weighting schemes", () => {
  const symbols = Array.from({ length: 100 }, (_, index) => `S${String(index + 1).padStart(3, "0")}`);
  const rows = symbols.map((symbol, index) => panelRow(
    symbol,
    "2020-01",
    index + 1,
    (index + 1) / 10_000,
  ));
  const result = runPortfolioAnalysis(rows, {
    membershipByMonth: { "2020-01": symbols },
    controls: [],
    minDecileObservations: 10,
    neweyWestLag: 0,
  });

  const month = result.univariateMax.monthly[0];
  assert.equal(month.sortFormed, true);
  assert.equal(month.formationCount, 100);
  assert.deepEqual(month.deciles.map((decile) => decile.formationCount), Array(10).fill(10));
  assert.ok(Math.abs((month.deciles[0].equalWeightedReturn ?? 0) - 0.00055) < 1e-15);
  assert.ok(Math.abs((month.deciles[9].equalWeightedReturn ?? 0) - 0.00955) < 1e-12);
  assert.ok(Math.abs((month.equalWeightedSpread ?? 0) - 0.009) < 1e-12);
  assert.ok(month.deciles[9].valueWeightedReturn !== null);

  const dependent = result.dependentSorts.size.monthly[0];
  assert.equal(dependent.sortFormed, true);
  assert.equal(dependent.cells.length, 100);
  assert.equal(dependent.matrix.length, 10);
  assert.equal(dependent.matrix.every((row) => row.length === 10), true);
  assert.equal(dependent.matrix[0][0].formationCount, 1);
  assert.equal(dependent.matrix[9][9].formationCount, 1);
});

test("OLS and Newey-West helpers are numerically correct and feed Fama-MacBeth averages", () => {
  const fit = ordinaryLeastSquares(
    [[1, 0], [1, 1], [1, 2], [1, 3]],
    [1, 3, 5, 7],
  );
  assert.ok(fit.coefficients);
  assert.ok(Math.abs(fit.coefficients[0] - 1) < 1e-12);
  assert.ok(Math.abs(fit.coefficients[1] - 2) < 1e-12);
  assert.equal(fit.rSquared, 1);

  const hac = neweyWestMean([1, 2, 3, 4, 5], 1);
  assert.equal(hac.mean, 3);
  assert.equal(hac.lag, 1);
  assert.ok(Math.abs((hac.longRunVariance ?? 0) - 2.8) < 1e-12);
  assert.ok(hac.tStatistic !== null && Number.isFinite(hac.tStatistic));

  const symbols = Array.from({ length: 8 }, (_, index) => `F${index + 1}`);
  const months = Array.from({ length: 12 }, (_, index) => `2021-${String(index + 1).padStart(2, "0")}`);
  const rows = months.flatMap((month, monthIndex) => symbols.map((symbol, symbolIndex) => {
    const max = symbolIndex + 1;
    const intercept = 0.5 + monthIndex * 0.01;
    const slope = 2 + monthIndex * 0.05;
    return panelRow(symbol, month, max, intercept + slope * max);
  }));
  const result = runPortfolioAnalysis(rows, {
    membershipByMonth: Object.fromEntries(months.map((month) => [month, symbols])),
    controls: [],
    minDecileObservations: 8,
    minCrossSectionObservations: 2,
    neweyWestLag: 1,
  });
  const maxCoefficient = result.famaMacBeth.coefficients.find((coefficient) => coefficient.name === "max");
  assert.ok(maxCoefficient);
  assert.equal(result.famaMacBeth.monthsWithRegression, 12);
  assert.ok(Math.abs((maxCoefficient.mean ?? 0) - 2.275) < 1e-12);
  assert.equal(maxCoefficient.hac.lag, 1);
  assert.ok(maxCoefficient.tStatistic !== null && Number.isFinite(maxCoefficient.tStatistic));
});

test("insufficient data returns explicit null statistics and warnings without throwing", () => {
  const symbols = ["X1", "X2", "X3"];
  const result = runPortfolioAnalysis(symbols.map((symbol, index) => panelRow(
    symbol,
    "2022-01",
    index + 1,
    0.01 * (index + 1),
  )), {
    membershipByMonth: { "2022-01": symbols },
    minDecileObservations: 10,
    minCrossSectionObservations: 10,
  });

  assert.equal(result.univariateMax.monthly[0].sortFormed, false);
  assert.equal(result.univariateMax.monthly[0].deciles.every((decile) => decile.formationCount === 0), true);
  assert.equal(result.univariateMax.spread.equalWeighted.tStatistic, null);
  assert.equal(result.famaMacBeth.monthsWithRegression, 0);
  assert.equal(result.famaMacBeth.coefficients.every((coefficient) => coefficient.mean === null), true);
  assert.ok(result.warnings.some((warning) => /at least|insufficient/i.test(warning)));
  assert.equal(JSON.stringify(result).includes("Infinity"), false);
});
