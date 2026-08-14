import {
  neweyWestMean,
  ordinaryLeastSquares as runOrdinaryLeastSquares,
  runPortfolioAnalysis,
  type HACSummary,
  type PortfolioAnalysisResult,
  type PortfolioPanelRow,
  type UnivariateSortResult,
} from "@/lib/portfolioAnalysis";

export type PanelFactorRow = PortfolioPanelRow & {
  mktRf?: number | null;
  smb?: number | null;
  hml?: number | null;
  factorMomentum?: number | null;
  rf?: number | null;
};

export type PanelRow = PanelFactorRow & {
  observed: boolean;
  isMissing: boolean;
  missingReason: "none" | "post_exit_or_unobserved" | "not_member";
};

export type PanelCoverage = {
  requestedCompanies: number;
  requestedMonths: number;
  masterRows: number;
  observedRows: number;
  missingRows: number;
  postExitRows: number;
  companiesWithExit: number;
  companiesWithAnyObservation: number;
  staticMembership: boolean;
};

type SortReturn = {
  month: string;
  decile: number;
  count: number;
  equalWeightedReturn: number | null;
  valueWeightedReturn: number | null;
};

type MeanInference = {
  mean: number | null;
  tStatistic: number | null;
  observations: number;
  lag: number;
};

export type BatchAnalysis = {
  panel: PanelRow[];
  coverage: PanelCoverage;
  decileSort: {
    rows: SortReturn[];
    summary: Array<SortReturn & MeanInference>;
    valueWeightedSummary: Array<SortReturn & MeanInference>;
    spread: { equalWeighted: MeanInference; valueWeighted: MeanInference };
    alpha: Array<{ decile: number; alpha: number | null; observations: number }>;
  };
  dependentSorts: Record<string, {
    rows: SortReturn[];
    summary: Array<SortReturn & MeanInference>;
    spread: { equalWeighted: MeanInference; valueWeighted: MeanInference };
  }>;
  famaMacBeth: {
    coefficients: Array<{ month: string; values: Record<string, number | null>; observations: number }>;
    averages: Array<{ factor: string; estimate: number | null; tStatistic: number | null; observations: number; lag: number }>;
    controls: string[];
  };
  warnings: string[];
};

function monthOrdinal(month: string) {
  const [year, value] = month.split("-").map(Number);
  return year * 12 + value - 1;
}

export function monthRange(start: string, end: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(start) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(end) || start > end) return [];
  return Array.from({ length: monthOrdinal(end) - monthOrdinal(start) + 1 }, (_, index) => {
    const ordinal = monthOrdinal(start) + index;
    return `${Math.floor(ordinal / 12)}-${String((ordinal % 12) + 1).padStart(2, "0")}`;
  });
}

function statusText(status: boolean | string | null | undefined) {
  return typeof status === "string" && status.trim() ? status : status === false ? "not_member" : "unknown";
}

function panelRow(row: PortfolioAnalysisResult["panel"][number]): PanelRow {
  return {
    symbol: row.symbol,
    month: row.month,
    max: row.max,
    beta: row.beta,
    size: row.size,
    bookToMarket: row.bookToMarket,
    momentum: row.momentum,
    reversal: row.reversal,
    illiquidity: row.illiquidity,
    forwardReturn: row.forwardReturn,
    marketCap: row.marketCap,
    membershipStatus: statusText(row.membershipStatus),
    delistingReturn: row.delistingReturn,
    observed: !row.isSynthetic,
    isMissing: row.isSynthetic || !row.isMember,
    missingReason: !row.isMember ? "not_member" : row.isSynthetic ? "post_exit_or_unobserved" : "none",
  };
}

function inference(summary: HACSummary): MeanInference {
  return {
    mean: summary.mean,
    tStatistic: summary.tStatistic,
    observations: summary.observations,
    lag: summary.lag,
  };
}

function sortRows(result: UnivariateSortResult): SortReturn[] {
  return result.monthly.flatMap((month) => month.deciles.map((decile) => ({
    month: month.month,
    decile: decile.decile,
    count: decile.formationCount,
    equalWeightedReturn: decile.equalWeightedReturn,
    valueWeightedReturn: decile.valueWeightedReturn,
  })));
}

function portfolioSummary(result: UnivariateSortResult, field: "equalWeightedReturn" | "valueWeightedReturn", requestedLag?: number): Array<SortReturn & MeanInference> {
  return Array.from({ length: 10 }, (_, index) => {
    const decile = index + 1;
    const values = result.monthly.map((month) => month.deciles[index]?.[field] ?? null);
    const summary = neweyWestMean(values, requestedLag);
    const count = result.monthly.reduce((total, month) => total + (month.deciles[index]?.formationCount ?? 0), 0);
    return {
      month: "aggregate",
      decile,
      count,
      equalWeightedReturn: null,
      valueWeightedReturn: null,
      ...inference(summary),
    };
  });
}

function dependentRows(result: PortfolioAnalysisResult["dependentSorts"][keyof PortfolioAnalysisResult["dependentSorts"]]): SortReturn[] {
  return result.monthly.flatMap((month) => month.maxSpreadByControlDecile.map((spread) => ({
    month: month.month,
    decile: spread.controlDecile,
    count: month.cells.filter((cell) => cell.controlDecile === spread.controlDecile).reduce((total, cell) => total + cell.formationCount, 0),
    equalWeightedReturn: spread.equalWeighted,
    valueWeightedReturn: spread.valueWeighted,
  })));
}

function dependentSummary(rows: SortReturn[], field: "equalWeightedReturn" | "valueWeightedReturn", requestedLag?: number): Array<SortReturn & MeanInference> {
  return Array.from({ length: 10 }, (_, index) => {
    const decile = index + 1;
    const values = rows.filter((row) => row.decile === decile).map((row) => row[field]);
    return {
      month: "aggregate",
      decile,
      count: rows.filter((row) => row.decile === decile).reduce((total, row) => total + row.count, 0),
      equalWeightedReturn: null,
      valueWeightedReturn: null,
      ...inference(neweyWestMean(values, requestedLag)),
    };
  });
}

function postExitMetrics(panel: PanelRow[], symbols: string[], end: string) {
  const lastObserved = new Map<string, string>();
  for (const row of panel) {
    if (row.observed) {
      const previous = lastObserved.get(row.symbol);
      if (!previous || monthOrdinal(row.month) > monthOrdinal(previous)) lastObserved.set(row.symbol, row.month);
    }
  }
  const postExitRows = panel.filter((row) => {
    const last = lastObserved.get(row.symbol);
    return !row.observed && Boolean(last) && monthOrdinal(row.month) > monthOrdinal(last as string) && monthOrdinal(row.month) <= monthOrdinal(end);
  }).length;
  return {
    postExitRows,
    companiesWithExit: [...lastObserved.values()].filter((month) => month !== end).length,
    companiesWithAnyObservation: lastObserved.size,
  };
}

function adaptAnalysis(result: PortfolioAnalysisResult, symbols: string[], start: string, end: string, requestedLag?: number): BatchAnalysis {
  const panel = result.panel.map(panelRow);
  const exitMetrics = postExitMetrics(panel, symbols, end);
  const decileRows = sortRows(result.univariateMax);
  const dependentSorts = Object.fromEntries(Object.entries(result.dependentSorts).map(([control, sort]) => {
    const rows = dependentRows(sort);
    return [control, {
      rows,
      summary: dependentSummary(rows, "equalWeightedReturn", requestedLag),
      spread: {
        equalWeighted: inference(neweyWestMean(rows.filter((row) => row.decile === 10).map((row) => row.equalWeightedReturn), requestedLag)),
        valueWeighted: inference(neweyWestMean(rows.filter((row) => row.decile === 10).map((row) => row.valueWeightedReturn), requestedLag)),
      },
    }];
  }));
  const famaMacBeth = result.famaMacBeth;
  return {
    panel,
    coverage: {
      requestedCompanies: result.coverage.symbols,
      requestedMonths: result.coverage.requestedMonths,
      masterRows: result.coverage.panelRows,
      observedRows: result.coverage.observedRows,
      missingRows: result.coverage.panelRows - result.coverage.observedRows,
      postExitRows: exitMetrics.postExitRows,
      companiesWithExit: exitMetrics.companiesWithExit,
      companiesWithAnyObservation: exitMetrics.companiesWithAnyObservation,
      staticMembership: result.methodology.membership.staticCurrentListLimitation,
    },
    decileSort: {
      rows: decileRows,
      summary: portfolioSummary(result.univariateMax, "equalWeightedReturn", requestedLag),
      valueWeightedSummary: portfolioSummary(result.univariateMax, "valueWeightedReturn", requestedLag),
      spread: {
        equalWeighted: inference(result.univariateMax.spread.equalWeighted),
        valueWeighted: inference(result.univariateMax.spread.valueWeighted),
      },
      alpha: [],
    },
    dependentSorts,
    famaMacBeth: {
      coefficients: famaMacBeth.monthly.map((month) => ({ month: month.month, values: month.coefficients, observations: month.observations })),
      averages: famaMacBeth.averageCoefficients.map((coefficient) => ({
        factor: coefficient.name,
        estimate: coefficient.estimate,
        tStatistic: coefficient.tStatistic,
        observations: coefficient.observations,
        lag: coefficient.hac.lag,
      })),
      controls: famaMacBeth.regressors.filter((regressor) => regressor !== "intercept"),
    },
    warnings: [...result.warnings, "Yahoo Finance does not provide a reliable delisting-return field in this workflow; missing final returns are disclosed rather than fabricated."],
  };
}

export function buildUnbalancedPanel(rows: PanelFactorRow[], symbols: string[], start: string, end: string): { panel: PanelRow[]; coverage: PanelCoverage } {
  const result = runPortfolioAnalysis(rows, { startMonth: start, endMonth: end, currentSymbols: symbols });
  const adapted = adaptAnalysis(result, symbols, start, end);
  return { panel: adapted.panel, coverage: adapted.coverage };
}

export function ordinaryLeastSquares(y: number[], features: number[][]) {
  if (!y.length || features.length !== y.length || !features[0]?.length) return null;
  const fit = runOrdinaryLeastSquares(features.map((feature) => [1, ...feature]), y);
  return fit.coefficients;
}

export function analyzeResearchPanel(rows: PanelFactorRow[], symbols: string[], start: string, end: string, requestedLag?: number): BatchAnalysis {
  const result = runPortfolioAnalysis(rows, {
    startMonth: start,
    endMonth: end,
    currentSymbols: symbols,
    neweyWestLag: requestedLag,
    minDecileObservations: 10,
  });
  return adaptAnalysis(result, symbols, start, end, requestedLag);
}
