/**
 * Pure, dependency-free batch portfolio research.
 *
 * The engine intentionally operates only on a supplied panel.  It does not
 * fetch or claim to fetch an S&P 1500 constituent or price dataset.  A row is
 * a formation-month observation: MAX and the other characteristics are known
 * at `month`, while `forwardReturn` (or a supplied `delistingReturn`) is the
 * return earned after that formation month.
 */

export const CONTROL_NAMES = [
  "size",
  "beta",
  "bookToMarket",
  "momentum",
  "reversal",
  "illiquidity",
] as const;

export type ControlName = (typeof CONTROL_NAMES)[number];
export type NumericInput = number | null | undefined;
export type MembershipStatus = boolean | string | null | undefined;

export type PortfolioPanelRow = {
  symbol: string;
  month: string;
  max?: NumericInput;
  beta?: NumericInput;
  size?: NumericInput;
  bookToMarket?: NumericInput;
  momentum?: NumericInput;
  reversal?: NumericInput;
  illiquidity?: NumericInput;
  forwardReturn?: NumericInput;
  marketCap?: NumericInput;
  membershipStatus?: MembershipStatus;
  delistingReturn?: NumericInput;
};

export type NormalizedPortfolioPanelRow = {
  symbol: string;
  month: string;
  max: number | null;
  beta: number | null;
  size: number | null;
  bookToMarket: number | null;
  momentum: number | null;
  reversal: number | null;
  illiquidity: number | null;
  forwardReturn: number | null;
  effectiveForwardReturn: number | null;
  marketCap: number | null;
  membershipStatus: boolean | string | null;
  delistingReturn: number | null;
  isSynthetic: boolean;
  isMember: boolean;
};

/** A month-to-membership-list map. Values may be arrays, Sets, or any iterable. */
export type MembershipByMonth =
  | ReadonlyMap<string, Iterable<string>>
  | Readonly<Record<string, Iterable<string>>>;

export type PortfolioAnalysisOptions = {
  /** A contiguous requested window. If omitted, the input span is used. */
  startMonth?: string;
  endMonth?: string;
  /** Explicit months are useful for a non-contiguous or externally defined window. */
  months?: readonly string[];
  requestedMonths?: readonly string[];
  /** Authoritative point-in-time constituent membership. */
  membershipByMonth?: MembershipByMonth;
  /** Optional static list fallback when membershipByMonth is unavailable. */
  currentSymbols?: readonly string[];
  staticCurrentList?: readonly string[];
  currentMembership?: readonly string[];
  /** Newey-West lag. The default is floor(4 * (T / 100)^(2/9)), capped at T - 1. */
  neweyWestLag?: number;
  nwLag?: number;
  hacLag?: number;
  lag?: number;
  /** Ten is the minimum cross-section for a meaningful 10-way sort by default. */
  minDecileObservations?: number;
  minimumDecileObservations?: number;
  /** Defaults to the number of coefficients needed by the selected model. */
  minCrossSectionObservations?: number;
  minimumCrossSectionObservations?: number;
  /** Defaults to SIZE, BETA, BM, MOM, REV, and ILLIQ. */
  controls?: readonly ControlName[];
};

export type CoverageMetric = {
  total: number;
  available: number;
  missing: number;
  coverageRate: number | null;
};

export type CoverageByMonth = {
  month: string;
  panelRows: number;
  observedRows: number;
  syntheticRows: number;
  memberRows: number;
  excludedMembershipRows: number;
  delistedRows: number;
  available: Record<string, number>;
  missing: Record<string, number>;
};

export type CoverageReport = {
  inputRows: number;
  invalidInputRows: number;
  duplicateInputRows: number;
  requestedMonths: number;
  symbols: number;
  panelRows: number;
  observedRows: number;
  syntheticRows: number;
  memberRows: number;
  excludedMembershipRows: number;
  delistedRows: number;
  delistedSymbols: number;
  delistingReturnRows: number;
  delistingReturnUsedRows: number;
  fields: Record<string, CoverageMetric>;
  byMonth: CoverageByMonth[];
};

export type HACSummary = {
  observations: number;
  missingObservations: number;
  requestedLag: number | null;
  lag: number;
  lagRule: string;
  mean: number | null;
  longRunVariance: number | null;
  standardError: number | null;
  tStatistic: number | null;
  warning: string | null;
};

export type DecilePortfolio = {
  decile: number;
  formationCount: number;
  returnObservations: number;
  equalWeightedReturn: number | null;
  valueWeightedReturn: number | null;
  missingReturnObservations: number;
  missingMarketCapObservations: number;
  delistedObservations: number;
  delistingReturnObservations: number;
};

export type MonthlyDecileResult = {
  month: string;
  formationCount: number;
  missingReturnObservations: number;
  sortFormed: boolean;
  deciles: DecilePortfolio[];
  equalWeightedSpread: number | null;
  valueWeightedSpread: number | null;
};

export type PortfolioAverage = {
  decile: number;
  months: number;
  meanEqualWeightedReturn: number | null;
  meanValueWeightedReturn: number | null;
};

export type SpreadResult = {
  lowDecile: number;
  highDecile: number;
  monthly: Array<{
    month: string;
    equalWeighted: number | null;
    valueWeighted: number | null;
  }>;
  equalWeighted: HACSummary;
  valueWeighted: HACSummary;
};

export type UnivariateSortResult = {
  characteristic: "max";
  monthly: MonthlyDecileResult[];
  deciles: DecilePortfolio[];
  portfolioAverages: PortfolioAverage[];
  spread: SpreadResult;
  warnings: string[];
};

export type DependentSortCell = {
  month: string;
  control: ControlName;
  controlDecile: number;
  maxDecile: number;
  formationCount: number;
  returnObservations: number;
  equalWeightedReturn: number | null;
  valueWeightedReturn: number | null;
  missingReturnObservations: number;
  missingMarketCapObservations: number;
  delistedObservations: number;
  delistingReturnObservations: number;
};

export type MonthlyDependentSortResult = {
  month: string;
  control: ControlName;
  formationCount: number;
  missingReturnObservations: number;
  sortFormed: boolean;
  cells: DependentSortCell[];
  matrix: DependentSortCell[][];
  maxSpreadByControlDecile: Array<{
    controlDecile: number;
    equalWeighted: number | null;
    valueWeighted: number | null;
  }>;
};

export type DependentSpreadResult = {
  controlDecile: number;
  monthly: Array<{
    month: string;
    equalWeighted: number | null;
    valueWeighted: number | null;
  }>;
  equalWeighted: HACSummary;
  valueWeighted: HACSummary;
};

export type DependentSortResult = {
  control: ControlName;
  monthly: MonthlyDependentSortResult[];
  spreads: DependentSpreadResult[];
  warnings: string[];
};

export type OLSResult = {
  coefficients: number[] | null;
  fitted: number[];
  residuals: number[];
  observations: number;
  predictors: number;
  rank: number;
  rSquared: number | null;
  warning: string | null;
};

export type FamaMacBethMonthlyResult = {
  month: string;
  candidateObservations: number;
  observations: number;
  omittedObservations: number;
  rank: number;
  coefficients: Record<string, number | null>;
  warning: string | null;
};

export type FamaMacBethCoefficient = {
  name: string;
  observations: number;
  mean: number | null;
  estimate: number | null;
  standardError: number | null;
  tStatistic: number | null;
  hac: HACSummary;
};

export type FamaMacBethResult = {
  regressors: string[];
  monthly: FamaMacBethMonthlyResult[];
  coefficients: FamaMacBethCoefficient[];
  averageCoefficients: FamaMacBethCoefficient[];
  monthsWithRegression: number;
  warnings: string[];
};

export type MembershipReport = {
  source: "membershipByMonth" | "static-current-list" | "row-status-fallback" | "observed-symbols-fallback";
  pointInTime: boolean;
  staticCurrentListLimitation: boolean;
  limitation: string | null;
  missingMonths: string[];
};

export type PortfolioAnalysisResult = {
  methodology: {
    universe: {
      source: "supplied-panel";
      suppliedSymbols: number;
      sp1500DatasetFetched: false;
      note: string;
    };
    membership: MembershipReport;
    delisting: {
      rule: string;
      delistedRows: number;
      delistingReturnUsedRows: number;
    };
    deciles: string;
    famaMacBeth: string;
    neweyWest: {
      lag: number | null;
      rule: string;
    };
  };
  window: {
    startMonth: string | null;
    endMonth: string | null;
    months: string[];
  };
  panel: NormalizedPortfolioPanelRow[];
  /** Alias that makes the preservation contract explicit to callers. */
  preservedPanel: NormalizedPortfolioPanelRow[];
  coverage: CoverageReport;
  univariateMax: UnivariateSortResult;
  /** Short aliases are kept for callers that refer to the PDF's section names. */
  univariate: UnivariateSortResult;
  decileSort: UnivariateSortResult;
  dependentSorts: Record<ControlName, DependentSortResult>;
  famaMacBeth: FamaMacBethResult;
  warnings: string[];
};

type NormalizedRowInternal = NormalizedPortfolioPanelRow & {
  observed: boolean;
  sourceIndex: number | null;
};

const COVERAGE_FIELDS = [
  "max",
  "beta",
  "size",
  "bookToMarket",
  "momentum",
  "reversal",
  "illiquidity",
  "forwardReturn",
  "effectiveForwardReturn",
  "marketCap",
] as const;

type CoverageField = (typeof COVERAGE_FIELDS)[number];

const DEFAULT_NW_LAG_RULE = "floor(4 * (T / 100)^(2/9)), capped at T - 1";
const DEFAULT_NW_LAG_EXPRESSION = (observations: number) => Math.floor(4 * Math.pow(observations / 100, 2 / 9));
const CONTROL_LABELS: Record<ControlName, string> = {
  size: "SIZE",
  beta: "BETA",
  bookToMarket: "BM",
  momentum: "MOM",
  reversal: "REV",
  illiquidity: "ILLIQ",
};

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function finiteOrNull(value: unknown): number | null {
  return finiteNumber(value) ? value : null;
}

function canonicalSymbol(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const symbol = value.trim().toUpperCase();
  return symbol.length ? symbol : null;
}

function validMonth(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function monthOrdinal(month: string): number {
  const [year, monthValue] = month.split("-").map(Number);
  return year * 12 + monthValue - 1;
}

function monthFromOrdinal(ordinal: number): string {
  const year = Math.floor(ordinal / 12);
  const month = ((ordinal % 12) + 12) % 12 + 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

function contiguousMonths(start: string, end: string): string[] {
  const first = monthOrdinal(start);
  const last = monthOrdinal(end);
  if (last < first) return [];
  const result: string[] = [];
  for (let ordinal = first; ordinal <= last; ordinal += 1) {
    result.push(monthFromOrdinal(ordinal));
  }
  return result;
}

function uniqueSortedMonths(values: readonly string[]): string[] {
  return [...new Set(values.filter(validMonth))].sort((a, b) => monthOrdinal(a) - monthOrdinal(b));
}

function normalizeMembershipStatus(value: MembershipStatus): boolean | string | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const status = value.trim();
    return status.length ? status : null;
  }
  return null;
}

function statusToken(status: boolean | string | null | undefined): string {
  if (status === true) return "active";
  if (status === false) return "inactive";
  return typeof status === "string" ? status.trim().toLowerCase() : "";
}

function isExitStatus(status: boolean | string | null | undefined): boolean {
  if (status === false) return true;
  const token = statusToken(status);
  if (!token) return false;
  return /delist|de[-_ ]?list|merge|acqui|private|bankrupt|liquidat|exit|removed|dropped|inactive|non[-_ ]?member|not[-_ ]?member|out of|^out$/.test(token);
}

function isHistoricalExitStatus(status: boolean | string | null | undefined): boolean {
  const token = statusToken(status);
  return /delist|de[-_ ]?list|merge|acqui|private|bankrupt|liquidat|exit|removed|dropped/.test(token);
}

function statusAllowsMembership(
  status: boolean | string | null,
  synthetic: boolean,
): boolean {
  if (status === false) return false;
  const token = statusToken(status);
  if (/inactive|non[-_ ]?member|not[-_ ]?member|out of|^out$/.test(token)) return false;
  // Keep the observed month of an exit in the cross-section. Any synthesized
  // months after it are explicitly excluded, while the final observed row can
  // still contribute a supplied delistingReturn.
  if (isHistoricalExitStatus(status)) return !synthetic;
  if (synthetic && statusToken(status) === "missing") return false;
  return true;
}

function effectiveReturn(row: Pick<NormalizedPortfolioPanelRow, "forwardReturn" | "delistingReturn">): {
  value: number | null;
  usedDelistingReturn: boolean;
} {
  if (finiteNumber(row.forwardReturn)) return { value: row.forwardReturn, usedDelistingReturn: false };
  if (finiteNumber(row.delistingReturn)) return { value: row.delistingReturn, usedDelistingReturn: true };
  return { value: null, usedDelistingReturn: false };
}

function dot(left: readonly number[], right: readonly number[]): number {
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result += left[index] * right[index];
  return result;
}

function arithmeticMean(values: readonly number[]): number | null {
  if (!values.length) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return finiteNumber(mean) ? mean : null;
}

function addWarning(warnings: string[], warning: string) {
  if (!warnings.includes(warning)) warnings.push(warning);
}

function emptyHAC(warning: string): HACSummary {
  return {
    observations: 0,
    missingObservations: 0,
    requestedLag: null,
    lag: 0,
    lagRule: DEFAULT_NW_LAG_RULE,
    mean: null,
    longRunVariance: null,
    standardError: null,
    tStatistic: null,
    warning,
  };
}

/**
 * Assign finite values to ascending decile ranks. Ties are split
 * deterministically by their original order; missing values remain null.
 */
export function rankIntoDeciles(values: readonly NumericInput[], groupCount = 10): Array<number | null> {
  if (!Number.isFinite(groupCount) || groupCount < 1) return values.map(() => null);
  const groups = Math.max(1, Math.floor(groupCount));
  const ranked = values
    .map((value, index) => ({ value: finiteOrNull(value), index }))
    .filter((entry): entry is { value: number; index: number } => entry.value !== null)
    .sort((left, right) => left.value - right.value || left.index - right.index);
  const result = values.map(() => null as number | null);
  ranked.forEach((entry, rank) => {
    result[entry.index] = Math.min(groups, Math.floor((rank * groups) / ranked.length) + 1);
  });
  return result;
}

export const assignDeciles = rankIntoDeciles;

/**
 * Newey-West HAC inference for the mean of a time series. Null and non-finite
 * observations are omitted and counted. The autocovariance denominator is T,
 * matching the methodology in Fixed.pdf.
 */
export function neweyWestMean(values: readonly NumericInput[], requestedLag?: number): HACSummary {
  const finiteValues = values.flatMap((value) => finiteNumber(value) ? [value] : []);
  const observations = finiteValues.length;
  const missingObservations = values.length - observations;
  if (!observations) return { ...emptyHAC("No finite observations are available for HAC inference."), missingObservations };

  const mean = arithmeticMean(finiteValues);
  if (mean === null) return { ...emptyHAC("The series mean is not finite."), missingObservations };

  const explicitLag = finiteNumber(requestedLag) ? Math.max(0, Math.floor(requestedLag)) : null;
  const requested = explicitLag ?? Math.max(0, DEFAULT_NW_LAG_EXPRESSION(observations));
  const lag = Math.min(requested, Math.max(0, observations - 1));
  let longRunVariance = 0;
  const centered = finiteValues.map((value) => value - mean);
  const gamma0 = dot(centered, centered) / observations;
  longRunVariance = gamma0;
  for (let lagIndex = 1; lagIndex <= lag; lagIndex += 1) {
    let covariance = 0;
    for (let index = lagIndex; index < observations; index += 1) {
      covariance += centered[index] * centered[index - lagIndex];
    }
    covariance /= observations;
    longRunVariance += 2 * (1 - lagIndex / (lag + 1)) * covariance;
  }
  if (!finiteNumber(longRunVariance)) longRunVariance = 0;
  longRunVariance = Math.max(0, longRunVariance);
  const standardError = longRunVariance > 0 ? Math.sqrt(longRunVariance / observations) : 0;
  const warning = standardError === 0
    ? "The HAC variance is zero; the t-statistic is undefined."
    : missingObservations > 0 ? "Missing observations were omitted from the HAC series." : null;
  return {
    observations,
    missingObservations,
    requestedLag: explicitLag,
    lag,
    lagRule: DEFAULT_NW_LAG_RULE,
    mean,
    longRunVariance,
    standardError,
    tStatistic: standardError > 0 ? mean / standardError : null,
    warning,
  };
}

export const neweyWestHac = neweyWestMean;
export const neweyWestTStatistic = neweyWestMean;

function olsFailure(
  observations: number,
  predictors: number,
  rank: number,
  warning: string,
): OLSResult {
  return {
    coefficients: null,
    fitted: [],
    residuals: [],
    observations,
    predictors,
    rank,
    rSquared: null,
    warning,
  };
}

/**
 * Least squares by scaled modified Gram-Schmidt QR. The caller supplies the
 * design matrix, including an intercept column if desired. Invalid rows are
 * dropped; rank deficiency is reported instead of being silently regularized.
 */
export function ordinaryLeastSquares(
  design: readonly (readonly NumericInput[])[],
  response: readonly NumericInput[],
  tolerance = 1e-10,
): OLSResult {
  const firstRow = design.find((row) => row.length > 0);
  const predictors = firstRow?.length ?? 0;
  if (!predictors) return olsFailure(0, 0, 0, "OLS requires at least one predictor column.");

  const rows: number[][] = [];
  const outcomes: number[] = [];
  for (let index = 0; index < design.length; index += 1) {
    const row = design[index];
    if (row.length !== predictors || !row.every(finiteNumber) || !finiteNumber(response[index])) continue;
    rows.push(row as number[]);
    outcomes.push(response[index] as number);
  }
  const observations = rows.length;
  if (observations < predictors) {
    return olsFailure(observations, predictors, observations, `OLS requires at least ${predictors} complete observations.`);
  }

  const scales = Array.from({ length: predictors }, (_, column) => {
    let scale = 0;
    for (const row of rows) scale = Math.max(scale, Math.abs(row[column]));
    return scale;
  });
  const zeroScale = scales.findIndex((scale) => scale === 0 || !finiteNumber(scale));
  if (zeroScale >= 0) {
    return olsFailure(observations, predictors, zeroScale, `OLS column ${zeroScale} has no finite variation.`);
  }

  const scaled = rows.map((row) => row.map((value, column) => value / scales[column]));
  const q: number[][] = [];
  const r = Array.from({ length: predictors }, () => Array(predictors).fill(0));
  const rankTolerance = Math.max(1e-14, tolerance) * Math.max(1, Math.sqrt(observations));
  for (let column = 0; column < predictors; column += 1) {
    let vector = scaled.map((row) => row[column]);
    for (let pass = 0; pass < 2; pass += 1) {
      for (let prior = 0; prior < column; prior += 1) {
        const projection = dot(q[prior], vector);
        r[prior][column] += projection;
        vector = vector.map((value, index) => value - projection * q[prior][index]);
      }
    }
    const norm = Math.sqrt(dot(vector, vector));
    if (!finiteNumber(norm) || norm <= rankTolerance) {
      return olsFailure(observations, predictors, column, "OLS design matrix is rank deficient.");
    }
    r[column][column] = norm;
    q.push(vector.map((value) => value / norm));
  }

  const qResponse = q.map((vector) => dot(vector, outcomes));
  const scaledCoefficients = Array(predictors).fill(0) as number[];
  for (let row = predictors - 1; row >= 0; row -= 1) {
    let value = qResponse[row];
    for (let column = row + 1; column < predictors; column += 1) value -= r[row][column] * scaledCoefficients[column];
    scaledCoefficients[row] = value / r[row][row];
  }
  const coefficients = scaledCoefficients.map((value, column) => value / scales[column]);
  if (!coefficients.every(finiteNumber)) return olsFailure(observations, predictors, predictors, "OLS produced a non-finite coefficient.");

  const fitted = rows.map((row) => dot(row, coefficients));
  const residuals = outcomes.map((outcome, index) => outcome - fitted[index]);
  const responseMean = arithmeticMean(outcomes);
  const totalSumOfSquares = responseMean === null
    ? 0
    : outcomes.reduce((sum, outcome) => sum + (outcome - responseMean) ** 2, 0);
  const residualSumOfSquares = residuals.reduce((sum, residual) => sum + residual ** 2, 0);
  const rSquared = totalSumOfSquares > 0
    ? Math.max(0, Math.min(1, 1 - residualSumOfSquares / totalSumOfSquares))
    : null;
  return {
    coefficients,
    fitted,
    residuals,
    observations,
    predictors,
    rank: predictors,
    rSquared: finiteNumber(rSquared) ? rSquared : null,
    warning: null,
  };
}

export const ols = ordinaryLeastSquares;

function lookupMembershipValue(membershipByMonth: MembershipByMonth, month: string): { found: boolean; value: unknown } {
  if (typeof (membershipByMonth as ReadonlyMap<string, Iterable<string>>).get === "function") {
    const map = membershipByMonth as ReadonlyMap<string, Iterable<string>>;
    return { found: map.has(month), value: map.get(month) };
  }
  const record = membershipByMonth as Readonly<Record<string, Iterable<string>>>;
  return {
    found: Object.prototype.hasOwnProperty.call(record, month),
    value: record[month],
  };
}

function membershipSet(value: unknown): Set<string> | null {
  if (typeof value === "string") {
    const symbol = canonicalSymbol(value);
    return symbol ? new Set([symbol]) : new Set();
  }
  if (value && typeof value === "object" && "symbols" in value) {
    return membershipSet((value as { symbols?: unknown }).symbols);
  }
  if (!value || typeof value !== "object") return null;
  const iterator = (value as { [Symbol.iterator]?: () => Iterator<unknown> })[Symbol.iterator];
  if (typeof iterator !== "function") return null;
  const result = new Set<string>();
  for (const symbol of value as Iterable<unknown>) {
    const canonical = canonicalSymbol(symbol);
    if (canonical) result.add(canonical);
  }
  return result;
}

function optionsStaticSymbols(options: PortfolioAnalysisOptions): Set<string> | null {
  const supplied = options.currentSymbols ?? options.staticCurrentList ?? options.currentMembership;
  if (!supplied) return null;
  return new Set(supplied.flatMap((symbol) => {
    const canonical = canonicalSymbol(symbol);
    return canonical ? [canonical] : [];
  }));
}

function emptyPanelRow(symbol: string, month: string, status: string): NormalizedRowInternal {
  return {
    symbol,
    month,
    max: null,
    beta: null,
    size: null,
    bookToMarket: null,
    momentum: null,
    reversal: null,
    illiquidity: null,
    forwardReturn: null,
    effectiveForwardReturn: null,
    marketCap: null,
    membershipStatus: status,
    delistingReturn: null,
    isSynthetic: true,
    isMember: false,
    observed: false,
    sourceIndex: null,
  };
}

function normalizeInputRow(row: PortfolioPanelRow, sourceIndex: number, symbol: string): NormalizedRowInternal {
  const normalized: NormalizedRowInternal = {
    symbol,
    month: row.month,
    max: finiteOrNull(row.max),
    beta: finiteOrNull(row.beta),
    size: finiteOrNull(row.size),
    bookToMarket: finiteOrNull(row.bookToMarket),
    momentum: finiteOrNull(row.momentum),
    reversal: finiteOrNull(row.reversal),
    illiquidity: finiteOrNull(row.illiquidity),
    forwardReturn: finiteOrNull(row.forwardReturn),
    effectiveForwardReturn: null,
    marketCap: finiteOrNull(row.marketCap),
    membershipStatus: normalizeMembershipStatus(row.membershipStatus),
    delistingReturn: finiteOrNull(row.delistingReturn),
    isSynthetic: false,
    isMember: false,
    observed: true,
    sourceIndex,
  };
  normalized.effectiveForwardReturn = effectiveReturn(normalized).value;
  return normalized;
}

function buildRequestedMonths(
  validInputMonths: readonly string[],
  options: PortfolioAnalysisOptions,
  warnings: string[],
): string[] {
  const explicit = options.months ?? options.requestedMonths;
  if (explicit) {
    const months = uniqueSortedMonths(explicit);
    if (months.length !== explicit.filter(validMonth).length) addWarning(warnings, "Invalid or duplicate requested months were ignored.");
    const start = validMonth(options.startMonth) ? options.startMonth : null;
    const end = validMonth(options.endMonth) ? options.endMonth : null;
    return months.filter((month) => (!start || monthOrdinal(month) >= monthOrdinal(start)) && (!end || monthOrdinal(month) <= monthOrdinal(end)));
  }

  const sorted = uniqueSortedMonths(validInputMonths);
  const inferredStart = sorted[0] ?? null;
  const inferredEnd = sorted[sorted.length - 1] ?? null;
  const start = validMonth(options.startMonth) ? options.startMonth : inferredStart;
  const end = validMonth(options.endMonth) ? options.endMonth : inferredEnd;
  if (options.startMonth && !start) addWarning(warnings, "Invalid startMonth was ignored.");
  if (options.endMonth && !end) addWarning(warnings, "Invalid endMonth was ignored.");
  if (!start || !end) return [];
  if (monthOrdinal(end) < monthOrdinal(start)) {
    addWarning(warnings, "The requested month window is empty because endMonth precedes startMonth.");
    return [];
  }
  return contiguousMonths(start, end);
}

function preserveUnbalancedPanel(
  rows: readonly PortfolioPanelRow[],
  options: PortfolioAnalysisOptions,
  warnings: string[],
): {
  panel: NormalizedRowInternal[];
  months: string[];
  symbols: string[];
  invalidInputRows: number;
  duplicateInputRows: number;
} {
  const inputMonths = rows.flatMap((row) => validMonth(row.month) ? [row.month] : []);
  const months = buildRequestedMonths(inputMonths, options, warnings);
  const rowBySymbolMonth = new Map<string, Map<string, NormalizedRowInternal>>();
  const allSymbols = new Set<string>();
  let invalidInputRows = 0;
  let duplicateInputRows = 0;

  rows.forEach((row, sourceIndex) => {
    const symbol = canonicalSymbol(row.symbol);
    if (!symbol || !validMonth(row.month)) {
      invalidInputRows += 1;
      return;
    }
    const monthRows = rowBySymbolMonth.get(symbol) ?? new Map<string, NormalizedRowInternal>();
    if (monthRows.has(row.month)) duplicateInputRows += 1;
    monthRows.set(row.month, normalizeInputRow(row, sourceIndex, symbol));
    rowBySymbolMonth.set(symbol, monthRows);
    allSymbols.add(symbol);
  });

  // Include symbols whose last observed row predates the requested window so
  // an exited company is represented by null rows after exit rather than being
  // silently removed from the unbalanced panel.
  const configuredSymbols = optionsStaticSymbols(options);
  const symbols = [...new Set([
    ...allSymbols,
    ...(configuredSymbols ? [...configuredSymbols] : []),
  ])].sort();

  const panel: NormalizedRowInternal[] = [];
  for (const month of months) {
    for (const symbol of symbols) {
      const monthRows = rowBySymbolMonth.get(symbol) ?? new Map<string, NormalizedRowInternal>();
      const existing = monthRows.get(month);
      if (existing) {
        panel.push(existing);
        continue;
      }
      const previousRows = [...monthRows.values()]
        .filter((candidate) => monthOrdinal(candidate.month) < monthOrdinal(month))
        .sort((left, right) => monthOrdinal(right.month) - monthOrdinal(left.month));
      const previous = previousRows[0];
      const status = previous && isExitStatus(previous.membershipStatus) ? "exited" : "missing";
      panel.push(emptyPanelRow(symbol, month, status));
    }
  }
  return { panel, months, symbols, invalidInputRows, duplicateInputRows };
}

function markMembership(
  panel: NormalizedRowInternal[],
  months: readonly string[],
  options: PortfolioAnalysisOptions,
  warnings: string[],
): MembershipReport {
  const membershipByMonth = options.membershipByMonth;
  const staticSymbols = optionsStaticSymbols(options);
  const hasStatus = panel.some((row) => row.observed && row.membershipStatus !== null);
  const missingMonths: string[] = [];

  if (membershipByMonth) {
    const monthSets = new Map<string, Set<string> | null>();
    for (const month of months) {
      const lookup = lookupMembershipValue(membershipByMonth, month);
      if (!lookup.found) {
        missingMonths.push(month);
        monthSets.set(month, null);
        continue;
      }
      const set = membershipSet(lookup.value);
      monthSets.set(month, set ?? new Set());
      if (!set) addWarning(warnings, `Membership data for ${month} is not an iterable symbol list; no symbols were admitted for that month.`);
    }
    for (const row of panel) row.isMember = monthSets.get(row.month)?.has(row.symbol) ?? false;
    if (missingMonths.length) addWarning(warnings, `membershipByMonth has no entry for ${missingMonths.length} requested month${missingMonths.length === 1 ? "" : "s"}; those months were excluded rather than backfilled.`);
    return {
      source: "membershipByMonth",
      pointInTime: true,
      staticCurrentListLimitation: false,
      limitation: null,
      missingMonths,
    };
  }

  const limitation = "No membershipByMonth was supplied. Membership uses a static-current-list/row-status fallback and may contain survivorship or look-ahead bias.";
  addWarning(warnings, limitation);
  if (staticSymbols) {
    for (const row of panel) row.isMember = staticSymbols.has(row.symbol) && statusAllowsMembership(row.membershipStatus, row.isSynthetic);
    return {
      source: "static-current-list",
      pointInTime: false,
      staticCurrentListLimitation: true,
      limitation,
      missingMonths: [],
    };
  }
  if (hasStatus) {
    for (const row of panel) row.isMember = statusAllowsMembership(row.membershipStatus, row.isSynthetic);
    return {
      source: "row-status-fallback",
      pointInTime: false,
      staticCurrentListLimitation: true,
      limitation,
      missingMonths: [],
    };
  }
  for (const row of panel) row.isMember = !row.isSynthetic;
  return {
    source: "observed-symbols-fallback",
    pointInTime: false,
    staticCurrentListLimitation: true,
    limitation,
    missingMonths: [],
  };
}

function fieldValues(panel: readonly NormalizedRowInternal[], field: CoverageField): Array<number | null> {
  return panel.map((row) => row[field]);
}

function coverageMetric(values: readonly (number | null)[]): CoverageMetric {
  const available = values.filter(finiteNumber).length;
  const total = values.length;
  return {
    total,
    available,
    missing: total - available,
    coverageRate: total ? available / total : null,
  };
}

function isDelistedRow(row: NormalizedRowInternal): boolean {
  return isExitStatus(row.membershipStatus) || finiteNumber(row.delistingReturn);
}

function buildCoverage(
  panel: readonly NormalizedRowInternal[],
  months: readonly string[],
  symbols: readonly string[],
  inputRows: number,
  invalidInputRows: number,
  duplicateInputRows: number,
): CoverageReport {
  const delistedSymbols = new Set(panel.filter(isDelistedRow).map((row) => row.symbol));
  const fields = Object.fromEntries(COVERAGE_FIELDS.map((field) => [field, coverageMetric(fieldValues(panel, field))])) as Record<string, CoverageMetric>;
  const byMonth = months.map((month): CoverageByMonth => {
    const rows = panel.filter((row) => row.month === month);
    const available: Record<string, number> = {};
    const missing: Record<string, number> = {};
    for (const field of COVERAGE_FIELDS) {
      const metric = coverageMetric(fieldValues(rows, field));
      available[field] = metric.available;
      missing[field] = metric.missing;
    }
    return {
      month,
      panelRows: rows.length,
      observedRows: rows.filter((row) => row.observed).length,
      syntheticRows: rows.filter((row) => row.isSynthetic).length,
      memberRows: rows.filter((row) => row.isMember).length,
      excludedMembershipRows: rows.filter((row) => !row.isMember).length,
      delistedRows: rows.filter(isDelistedRow).length,
      available,
      missing,
    };
  });
  const delistingReturnRows = panel.filter((row) => finiteNumber(row.delistingReturn)).length;
  const delistingReturnUsedRows = panel.filter((row) => effectiveReturn(row).usedDelistingReturn).length;
  return {
    inputRows,
    invalidInputRows,
    duplicateInputRows,
    requestedMonths: months.length,
    symbols: symbols.length,
    panelRows: panel.length,
    observedRows: panel.filter((row) => row.observed).length,
    syntheticRows: panel.filter((row) => row.isSynthetic).length,
    memberRows: panel.filter((row) => row.isMember).length,
    excludedMembershipRows: panel.filter((row) => !row.isMember).length,
    delistedRows: panel.filter(isDelistedRow).length,
    delistedSymbols: delistedSymbols.size,
    delistingReturnRows,
    delistingReturnUsedRows,
    fields,
    byMonth,
  };
}

function controlValue(row: NormalizedPortfolioPanelRow, control: ControlName): number | null {
  return row[control];
}

function returnSummary(
  rows: readonly NormalizedRowInternal[],
  decile: number,
): DecilePortfolio {
  const returnRows = rows.filter((row) => finiteNumber(row.effectiveForwardReturn));
  const weightedRows = returnRows.filter((row) => finiteNumber(row.marketCap) && row.marketCap > 0);
  const missingMarketCapObservations = returnRows.length - weightedRows.length;
  let valueWeightedReturn: number | null = null;
  if (weightedRows.length) {
    const scale = Math.max(...weightedRows.map((row) => row.marketCap as number));
    const denominator = weightedRows.reduce((sum, row) => sum + (row.marketCap as number) / scale, 0);
    const numerator = weightedRows.reduce((sum, row) => sum + ((row.marketCap as number) / scale) * (row.effectiveForwardReturn as number), 0);
    valueWeightedReturn = denominator > 0 ? finiteOrNull(numerator / denominator) : null;
  }
  return {
    decile,
    formationCount: rows.length,
    returnObservations: returnRows.length,
    equalWeightedReturn: arithmeticMean(returnRows.map((row) => row.effectiveForwardReturn as number)),
    valueWeightedReturn,
    missingReturnObservations: rows.length - returnRows.length,
    missingMarketCapObservations,
    delistedObservations: rows.filter(isDelistedRow).length,
    delistingReturnObservations: rows.filter((row) => effectiveReturn(row).usedDelistingReturn).length,
  };
}

function emptyDecile(decile: number): DecilePortfolio {
  return {
    decile,
    formationCount: 0,
    returnObservations: 0,
    equalWeightedReturn: null,
    valueWeightedReturn: null,
    missingReturnObservations: 0,
    missingMarketCapObservations: 0,
    delistedObservations: 0,
    delistingReturnObservations: 0,
  };
}

function sortRowsByDecile(
  rows: readonly NormalizedRowInternal[],
  selector: (row: NormalizedRowInternal) => number | null,
): Map<number, NormalizedRowInternal[]> {
  const finiteRows = rows.filter((row) => finiteNumber(selector(row)));
  const assignments = rankIntoDeciles(finiteRows.map(selector));
  const result = new Map<number, NormalizedRowInternal[]>();
  finiteRows.forEach((row, index) => {
    const decile = assignments[index];
    if (decile === null) return;
    result.set(decile, [...(result.get(decile) ?? []), row]);
  });
  return result;
}

function makeSpread(
  monthly: readonly MonthlyDecileResult[],
  lag: number | undefined,
): SpreadResult {
  const observations = monthly.map((result) => ({
    month: result.month,
    equalWeighted: result.equalWeightedSpread,
    valueWeighted: result.valueWeightedSpread,
  }));
  return {
    lowDecile: 1,
    highDecile: 10,
    monthly: observations,
    equalWeighted: neweyWestMean(observations.map((observation) => observation.equalWeighted), lag),
    valueWeighted: neweyWestMean(observations.map((observation) => observation.valueWeighted), lag),
  };
}

function decileAverages(monthly: readonly MonthlyDecileResult[]): PortfolioAverage[] {
  return Array.from({ length: 10 }, (_, index) => {
    const decile = index + 1;
    const portfolios = monthly.flatMap((result) => result.deciles[decile - 1] ? [result.deciles[decile - 1]] : []);
    const equalWeighted = portfolios.flatMap((portfolio) => finiteNumber(portfolio.equalWeightedReturn) ? [portfolio.equalWeightedReturn] : []);
    const valueWeighted = portfolios.flatMap((portfolio) => finiteNumber(portfolio.valueWeightedReturn) ? [portfolio.valueWeightedReturn] : []);
    return {
      decile,
      months: equalWeighted.length,
      meanEqualWeightedReturn: arithmeticMean(equalWeighted),
      meanValueWeightedReturn: arithmeticMean(valueWeighted),
    };
  });
}

function aggregateDeciles(monthly: readonly MonthlyDecileResult[]): DecilePortfolio[] {
  return Array.from({ length: 10 }, (_, index) => {
    const decile = index + 1;
    const portfolios = monthly.map((result) => result.deciles[decile - 1]).filter(Boolean);
    const equalWeighted = portfolios.flatMap((portfolio) => finiteNumber(portfolio.equalWeightedReturn) ? [portfolio.equalWeightedReturn] : []);
    const valueWeighted = portfolios.flatMap((portfolio) => finiteNumber(portfolio.valueWeightedReturn) ? [portfolio.valueWeightedReturn] : []);
    return {
      decile,
      formationCount: portfolios.reduce((sum, portfolio) => sum + portfolio.formationCount, 0),
      returnObservations: portfolios.reduce((sum, portfolio) => sum + portfolio.returnObservations, 0),
      equalWeightedReturn: arithmeticMean(equalWeighted),
      valueWeightedReturn: arithmeticMean(valueWeighted),
      missingReturnObservations: portfolios.reduce((sum, portfolio) => sum + portfolio.missingReturnObservations, 0),
      missingMarketCapObservations: portfolios.reduce((sum, portfolio) => sum + portfolio.missingMarketCapObservations, 0),
      delistedObservations: portfolios.reduce((sum, portfolio) => sum + portfolio.delistedObservations, 0),
      delistingReturnObservations: portfolios.reduce((sum, portfolio) => sum + portfolio.delistingReturnObservations, 0),
    };
  });
}

function getRequestedLag(options: PortfolioAnalysisOptions): number | undefined {
  const requested = options.neweyWestLag ?? options.nwLag ?? options.hacLag ?? options.lag;
  return finiteNumber(requested) ? requested : undefined;
}

function runUnivariateSort(
  months: readonly string[],
  eligibleByMonth: ReadonlyMap<string, NormalizedRowInternal[]>,
  minDecileObservations: number,
  lag: number | undefined,
): UnivariateSortResult {
  const warnings: string[] = [];
  const monthly = months.map((month): MonthlyDecileResult => {
    const eligible = eligibleByMonth.get(month) ?? [];
    const maxRows = eligible.filter((row) => finiteNumber(row.max));
    const sortFormed = maxRows.length >= minDecileObservations;
    const groups = sortFormed ? sortRowsByDecile(maxRows, (row) => row.max) : new Map<number, NormalizedRowInternal[]>();
    const deciles = Array.from({ length: 10 }, (_, index) => returnSummary(groups.get(index + 1) ?? [], index + 1));
    const missingReturnObservations = sortFormed
      ? maxRows.filter((row) => !finiteNumber(row.effectiveForwardReturn)).length
      : maxRows.length;
    if (!sortFormed) addWarning(warnings, `${month}: MAX decile sort has ${maxRows.length} finite formations; at least ${minDecileObservations} are required.`);
    const low = deciles[0];
    const high = deciles[9];
    return {
      month,
      formationCount: maxRows.length,
      missingReturnObservations,
      sortFormed,
      deciles,
      equalWeightedSpread: finiteNumber(low.equalWeightedReturn) && finiteNumber(high.equalWeightedReturn)
        ? high.equalWeightedReturn - low.equalWeightedReturn
        : null,
      valueWeightedSpread: finiteNumber(low.valueWeightedReturn) && finiteNumber(high.valueWeightedReturn)
        ? high.valueWeightedReturn - low.valueWeightedReturn
        : null,
    };
  });
  return {
    characteristic: "max",
    monthly,
    deciles: aggregateDeciles(monthly),
    portfolioAverages: decileAverages(monthly),
    spread: makeSpread(monthly, lag),
    warnings,
  };
}

function runDependentSort(
  control: ControlName,
  months: readonly string[],
  eligibleByMonth: ReadonlyMap<string, NormalizedRowInternal[]>,
  minDecileObservations: number,
  lag: number | undefined,
): DependentSortResult {
  const warnings: string[] = [];
  const monthly = months.map((month): MonthlyDependentSortResult => {
    const eligible = eligibleByMonth.get(month) ?? [];
    const finiteRows = eligible.filter((row) => finiteNumber(row.max) && finiteNumber(controlValue(row, control)));
    const sortFormed = finiteRows.length >= minDecileObservations;
    const controlGroups = sortFormed
      ? sortRowsByDecile(finiteRows, (row) => controlValue(row, control))
      : new Map<number, NormalizedRowInternal[]>();
    const cells: DependentSortCell[] = [];
    const maxSpreadByControlDecile: MonthlyDependentSortResult["maxSpreadByControlDecile"] = [];
    for (let controlDecile = 1; controlDecile <= 10; controlDecile += 1) {
      const controlRows = controlGroups.get(controlDecile) ?? [];
      const maxGroups = sortFormed ? sortRowsByDecile(controlRows, (row) => row.max) : new Map<number, NormalizedRowInternal[]>();
      const decileCells: DependentSortCell[] = [];
      for (let maxDecile = 1; maxDecile <= 10; maxDecile += 1) {
        const summary = sortFormed
          ? returnSummary(maxGroups.get(maxDecile) ?? [], maxDecile)
          : emptyDecile(maxDecile);
        const cell: DependentSortCell = {
          month,
          control,
          controlDecile,
          maxDecile,
          formationCount: summary.formationCount,
          returnObservations: summary.returnObservations,
          equalWeightedReturn: summary.equalWeightedReturn,
          valueWeightedReturn: summary.valueWeightedReturn,
          missingReturnObservations: summary.missingReturnObservations,
          missingMarketCapObservations: summary.missingMarketCapObservations,
          delistedObservations: summary.delistedObservations,
          delistingReturnObservations: summary.delistingReturnObservations,
        };
        cells.push(cell);
        decileCells.push(cell);
      }
      const low = decileCells[0];
      const high = decileCells[9];
      maxSpreadByControlDecile.push({
        controlDecile,
        equalWeighted: finiteNumber(low.equalWeightedReturn) && finiteNumber(high.equalWeightedReturn)
          ? high.equalWeightedReturn - low.equalWeightedReturn
          : null,
        valueWeighted: finiteNumber(low.valueWeightedReturn) && finiteNumber(high.valueWeightedReturn)
          ? high.valueWeightedReturn - low.valueWeightedReturn
          : null,
      });
    }
    if (!sortFormed) addWarning(warnings, `${month}: ${CONTROL_LABELS[control]} dependent sort has ${finiteRows.length} complete MAX/control formations; at least ${minDecileObservations} are required.`);
    const matrix = Array.from({ length: 10 }, (_, index) => cells.slice(index * 10, index * 10 + 10));
    return {
      month,
      control,
      formationCount: finiteRows.length,
      missingReturnObservations: finiteRows.filter((row) => !finiteNumber(row.effectiveForwardReturn)).length,
      sortFormed,
      cells,
      matrix,
      maxSpreadByControlDecile,
    };
  });
  const spreads = Array.from({ length: 10 }, (_, index): DependentSpreadResult => {
    const controlDecile = index + 1;
    const spreadMonthly = monthly.map((result) => {
      const spread = result.maxSpreadByControlDecile[controlDecile - 1];
      return {
        month: result.month,
        equalWeighted: spread?.equalWeighted ?? null,
        valueWeighted: spread?.valueWeighted ?? null,
      };
    });
    return {
      controlDecile,
      monthly: spreadMonthly,
      equalWeighted: neweyWestMean(spreadMonthly.map((value) => value.equalWeighted), lag),
      valueWeighted: neweyWestMean(spreadMonthly.map((value) => value.valueWeighted), lag),
    };
  });
  return { control, monthly, spreads, warnings };
}

function emptyCoefficientRecord(regressors: readonly string[]): Record<string, number | null> {
  return Object.fromEntries(regressors.map((name) => [name, null]));
}

function runFamaMacBeth(
  months: readonly string[],
  eligibleByMonth: ReadonlyMap<string, NormalizedRowInternal[]>,
  controls: readonly ControlName[],
  minCrossSectionObservations: number,
  lag: number | undefined,
): FamaMacBethResult {
  const warnings: string[] = [];
  const regressors = ["intercept", "max", ...controls];
  const monthly = months.map((month): FamaMacBethMonthlyResult => {
    const eligible = eligibleByMonth.get(month) ?? [];
    const returnRows = eligible.filter((row) => finiteNumber(row.effectiveForwardReturn));
    const completeRows = returnRows.filter((row) => finiteNumber(row.max) && controls.every((control) => finiteNumber(controlValue(row, control))));
    const omittedObservations = returnRows.length - completeRows.length;
    const coefficients = emptyCoefficientRecord(regressors);
    const minimum = Math.max(minCrossSectionObservations, regressors.length);
    if (completeRows.length < minimum) {
      const warning = `${month}: Fama-MacBeth OLS has ${completeRows.length} complete observations; at least ${minimum} are required.`;
      addWarning(warnings, warning);
      return {
        month,
        candidateObservations: returnRows.length,
        observations: completeRows.length,
        omittedObservations,
        rank: 0,
        coefficients,
        warning,
      };
    }
    const design = completeRows.map((row) => [1, row.max as number, ...controls.map((control) => controlValue(row, control) as number)]);
    const response = completeRows.map((row) => row.effectiveForwardReturn as number);
    const fit = ordinaryLeastSquares(design, response);
    if (!fit.coefficients) {
      const warning = `${month}: Fama-MacBeth OLS was not estimable (${fit.warning ?? "unknown numerical failure"}).`;
      addWarning(warnings, warning);
      return {
        month,
        candidateObservations: returnRows.length,
        observations: completeRows.length,
        omittedObservations,
        rank: fit.rank,
        coefficients,
        warning,
      };
    }
    regressors.forEach((name, index) => { coefficients[name] = fit.coefficients![index] ?? null; });
    return {
      month,
      candidateObservations: returnRows.length,
      observations: completeRows.length,
      omittedObservations,
      rank: fit.rank,
      coefficients,
      warning: null,
    };
  });

  const coefficients = regressors.map((name): FamaMacBethCoefficient => {
    const series = monthly.map((result) => result.coefficients[name]);
    const hac = neweyWestMean(series, lag);
    return {
      name,
      observations: hac.observations,
      mean: hac.mean,
      estimate: hac.mean,
      standardError: hac.standardError,
      tStatistic: hac.tStatistic,
      hac,
    };
  });
  const monthsWithRegression = monthly.filter((result) => result.warning === null).length;
  if (!monthsWithRegression) addWarning(warnings, "No month had an estimable Fama-MacBeth cross-sectional regression.");
  return {
    regressors,
    monthly,
    coefficients,
    averageCoefficients: coefficients,
    monthsWithRegression,
    warnings,
  };
}

function memberRowsByMonth(panel: readonly NormalizedRowInternal[], months: readonly string[]): Map<string, NormalizedRowInternal[]> {
  const result = new Map<string, NormalizedRowInternal[]>();
  for (const month of months) result.set(month, panel.filter((row) => row.month === month && row.isMember));
  return result;
}

function serializablePanel(panel: readonly NormalizedRowInternal[]): NormalizedPortfolioPanelRow[] {
  return panel.map((row) => ({
    symbol: row.symbol,
    month: row.month,
    max: finiteOrNull(row.max),
    beta: finiteOrNull(row.beta),
    size: finiteOrNull(row.size),
    bookToMarket: finiteOrNull(row.bookToMarket),
    momentum: finiteOrNull(row.momentum),
    reversal: finiteOrNull(row.reversal),
    illiquidity: finiteOrNull(row.illiquidity),
    forwardReturn: finiteOrNull(row.forwardReturn),
    effectiveForwardReturn: finiteOrNull(row.effectiveForwardReturn),
    marketCap: finiteOrNull(row.marketCap),
    membershipStatus: row.membershipStatus,
    delistingReturn: finiteOrNull(row.delistingReturn),
    isSynthetic: row.isSynthetic,
    isMember: row.isMember,
  }));
}

/**
 * Run all bounded portfolio analyses over a supplied monthly panel.
 *
 * The unbalanced panel is expanded to a symbol x requested-month grid. Missing
 * cells, including cells after an explicit exit, remain in `panel` with null
 * numeric values. They are never imputed and never allowed to erase earlier
 * observations from the cross-section.
 */
export function runPortfolioAnalysis(
  inputRows: readonly PortfolioPanelRow[],
  options: PortfolioAnalysisOptions = {},
): PortfolioAnalysisResult {
  const warnings: string[] = [];
  const preserved = preserveUnbalancedPanel(inputRows, options, warnings);
  const membership = markMembership(preserved.panel, preserved.months, options, warnings);
  const coverage = buildCoverage(
    preserved.panel,
    preserved.months,
    preserved.symbols,
    inputRows.length,
    preserved.invalidInputRows,
    preserved.duplicateInputRows,
  );
  if (preserved.invalidInputRows) addWarning(warnings, `${preserved.invalidInputRows} input row${preserved.invalidInputRows === 1 ? "" : "s"} with an invalid symbol or month were ignored.`);
  if (preserved.duplicateInputRows) addWarning(warnings, `${preserved.duplicateInputRows} duplicate symbol-month row${preserved.duplicateInputRows === 1 ? "" : "s"} were replaced by the last supplied row.`);
  if (coverage.syntheticRows) addWarning(warnings, `Preserved ${coverage.syntheticRows} synthetic symbol-month row${coverage.syntheticRows === 1 ? "" : "s"} with null values for missing or post-exit observations.`);
  if (coverage.delistedRows) addWarning(warnings, `${coverage.delistedRows} panel row${coverage.delistedRows === 1 ? "" : "s"} are marked delisted/merged/exited; delistingReturn is used only when forwardReturn is missing.`);
  const maxCoverage = coverage.fields.max;
  const returnCoverage = coverage.fields.effectiveForwardReturn;
  if (maxCoverage && maxCoverage.missing) addWarning(warnings, `MAX has ${maxCoverage.missing} missing panel observation${maxCoverage.missing === 1 ? "" : "s"}; missing characteristics are excluded from portfolio formation.`);
  if (returnCoverage && returnCoverage.missing) addWarning(warnings, `Effective forward return has ${returnCoverage.missing} missing panel observation${returnCoverage.missing === 1 ? "" : "s"}; missing returns are excluded from portfolio returns and OLS.`);

  const positiveInteger = (value: unknown, fallback: number, minimum: number) => (
    finiteNumber(value) && value >= minimum ? Math.max(minimum, Math.floor(value)) : fallback
  );
  const minDecileObservations = positiveInteger(
    options.minDecileObservations ?? options.minimumDecileObservations,
    10,
    1,
  );
  const controls = [...new Set((options.controls ?? CONTROL_NAMES).filter((control): control is ControlName => CONTROL_NAMES.includes(control)))];
  const minimumRequiredForModel = controls.length + 2;
  const minCrossSectionObservations = Math.max(
    minimumRequiredForModel,
    positiveInteger(
      options.minCrossSectionObservations ?? options.minimumCrossSectionObservations,
      minimumRequiredForModel,
      minimumRequiredForModel,
    ),
  );
  const requestedLag = getRequestedLag(options);
  const eligibleByMonth = memberRowsByMonth(preserved.panel, preserved.months);
  const univariateMax = runUnivariateSort(preserved.months, eligibleByMonth, minDecileObservations, requestedLag);
  const dependentSorts = Object.fromEntries(CONTROL_NAMES.map((control) => [
    control,
    runDependentSort(control, preserved.months, eligibleByMonth, minDecileObservations, requestedLag),
  ])) as Record<ControlName, DependentSortResult>;
  const famaMacBeth = runFamaMacBeth(preserved.months, eligibleByMonth, controls, minCrossSectionObservations, requestedLag);
  univariateMax.warnings.forEach((warning) => addWarning(warnings, warning));
  Object.values(dependentSorts).forEach((result) => result.warnings.forEach((warning) => addWarning(warnings, warning)));
  famaMacBeth.warnings.forEach((warning) => addWarning(warnings, warning));
  if (!preserved.months.length) addWarning(warnings, "No valid requested months are available; all analysis result series are empty.");

  const panel = serializablePanel(preserved.panel);
  const result: PortfolioAnalysisResult = {
    methodology: {
      universe: {
        source: "supplied-panel",
        suppliedSymbols: preserved.symbols.length,
        sp1500DatasetFetched: false,
        note: "This engine computes over the supplied panel only; it does not fetch a 1500-company dataset.",
      },
      membership,
      delisting: {
        rule: "Use forwardReturn when finite; otherwise use delistingReturn for the final available observation and preserve later rows as missing.",
        delistedRows: coverage.delistedRows,
        delistingReturnUsedRows: coverage.delistingReturnUsedRows,
      },
      deciles: `MAX is sorted ascending into ten deciles when at least ${minDecileObservations} complete MAX formations are available; Decile 10 is highest MAX. Equal-weighted returns average finite effective forward returns, while value-weighted returns use positive formation-month market caps.`,
      famaMacBeth: `Monthly OLS uses forward return on MAX${controls.length ? ` plus ${controls.map((control) => CONTROL_LABELS[control]).join(", ")}` : ""}; incomplete rows are omitted and rank-deficient months are reported as missing.`,
      neweyWest: {
        lag: requestedLag ?? null,
        rule: DEFAULT_NW_LAG_RULE,
      },
    },
    window: {
      startMonth: preserved.months[0] ?? null,
      endMonth: preserved.months[preserved.months.length - 1] ?? null,
      months: [...preserved.months],
    },
    panel,
    preservedPanel: panel,
    coverage,
    univariateMax,
    univariate: univariateMax,
    decileSort: univariateMax,
    dependentSorts,
    famaMacBeth,
    warnings,
  };
  return result;
}

export const analyzePortfolioPanel = runPortfolioAnalysis;
export const runBatchResearch = runPortfolioAnalysis;
