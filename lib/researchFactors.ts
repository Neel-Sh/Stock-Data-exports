export type DailyMarketPoint = {
  date: string;
  close: number | null;
  adjClose: number | null;
  volume: number | null;
};

export type DailyReturnPoint = DailyMarketPoint & {
  simpleReturn: number | null;
};

export type ReportedFact = {
  value: number;
  end: string;
  filed: string;
  form: string;
  tag: string;
};

export type MonthlyRiskFactors = {
  month: string;
  mktRf: number | null;
  smb: number | null;
  hml: number | null;
  momentum: number | null;
  rf: number | null;
};

export type ResearchFactorRow = {
  month: string;
  monthEndDate: string;
  tradingDays: number;
  dailyReturnObservations: number;
  forwardMonthlyReturn: number | null;
  maxDailyReturn: number | null;
  marketCap: number | null;
  size: number | null;
  reversal: number | null;
  momentum: number | null;
  illiquidity: number | null;
  mktRf: number | null;
  smb: number | null;
  hml: number | null;
  factorMomentum: number | null;
  rf: number | null;
  bookToMarket: number | null;
  max5: number | null;
  shares: ReportedFact | null;
  bookEquity: ReportedFact | null;
};

type BuildResearchFactorOptions = {
  shares?: ReportedFact[];
  bookEquity?: ReportedFact[];
  riskFactors?: MonthlyRiskFactors[];
};

function finitePositive(value: number | null) {
  return value != null && Number.isFinite(value) && value > 0;
}

function monthKey(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(0, 7) : null;
}

function monthOrdinal(month: string) {
  const [year, value] = month.split("-").map(Number);
  return year * 12 + value - 1;
}

function monthsApart(earlier: string, later: string) {
  return monthOrdinal(later) - monthOrdinal(earlier);
}

function lastCalendarDay(month: string) {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year, value, 0)).toISOString().slice(0, 10);
}

function selectPointInTimeFact(facts: ReportedFact[], formationMonth: string) {
  const cutoff = lastCalendarDay(formationMonth);
  return facts
    .filter((fact) => fact.value > 0 && fact.end <= cutoff && fact.filed <= cutoff)
    .sort((a, b) => b.end.localeCompare(a.end) || b.filed.localeCompare(a.filed))[0] ?? null;
}

export function calculateDailyReturns(points: DailyMarketPoint[]): DailyReturnPoint[] {
  const sorted = [...points]
    .filter((point) => monthKey(point.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  return sorted.map((point, index) => {
    const previous = index ? sorted[index - 1].adjClose : null;
    const simpleReturn = finitePositive(previous) && finitePositive(point.adjClose)
      ? point.adjClose! / previous! - 1
      : null;
    return { ...point, simpleReturn };
  });
}

export function buildResearchFactorRows(
  points: DailyMarketPoint[],
  options: BuildResearchFactorOptions = {},
): ResearchFactorRow[] {
  const daily = calculateDailyReturns(points);
  const grouped = new Map<string, DailyReturnPoint[]>();
  for (const point of daily) {
    const month = monthKey(point.date);
    if (!month) continue;
    grouped.set(month, [...(grouped.get(month) ?? []), point]);
  }

  const months = [...grouped.keys()].sort();
  const riskByMonth = new Map((options.riskFactors ?? []).map((item) => [item.month, item]));
  const monthEnds = months.map((month) => {
    const observations = grouped.get(month) ?? [];
    const adjusted = observations.findLast((point) => finitePositive(point.adjClose)) ?? null;
    const raw = observations.findLast((point) => finitePositive(point.close)) ?? null;
    return { adjusted, raw };
  });

  return months.flatMap((month, index): ResearchFactorRow[] => {
    const observations = grouped.get(month) ?? [];
    const monthEnd = monthEnds[index];
    if (!monthEnd.adjusted) return [];

    const returns = observations.flatMap((point) => point.simpleReturn == null ? [] : [point.simpleReturn]);
    const liquidObservations = observations.flatMap((point) => {
      if (point.simpleReturn == null || !finitePositive(point.close) || !finitePositive(point.volume)) return [];
      return [Math.abs(point.simpleReturn) / (point.close! * point.volume!)];
    });
    const sortedReturns = [...returns].sort((a, b) => b - a);

    const previous = index > 0 && monthsApart(months[index - 1], month) === 1 ? monthEnds[index - 1].adjusted : null;
    const next = index + 1 < months.length && monthsApart(month, months[index + 1]) === 1 ? monthEnds[index + 1].adjusted : null;
    const momentumStart = index >= 13 && monthsApart(months[index - 13], month) === 13 ? monthEnds[index - 13].adjusted : null;
    const momentumEnd = index >= 2 && monthsApart(months[index - 2], month) === 2 ? monthEnds[index - 2].adjusted : null;

    const shares = selectPointInTimeFact(options.shares ?? [], month);
    const bookEquity = selectPointInTimeFact(options.bookEquity ?? [], month);
    const marketCap = monthEnd.raw && shares ? monthEnd.raw.close! * shares.value : null;
    const risk = riskByMonth.get(month);

    return [{
      month,
      monthEndDate: monthEnd.adjusted.date,
      tradingDays: observations.length,
      dailyReturnObservations: returns.length,
      forwardMonthlyReturn: next ? next.adjClose! / monthEnd.adjusted.adjClose! - 1 : null,
      maxDailyReturn: sortedReturns[0] ?? null,
      marketCap,
      size: marketCap && marketCap > 0 ? Math.log(marketCap) : null,
      reversal: previous ? monthEnd.adjusted.adjClose! / previous.adjClose! - 1 : null,
      momentum: momentumStart && momentumEnd ? momentumEnd.adjClose! / momentumStart.adjClose! - 1 : null,
      illiquidity: liquidObservations.length
        ? liquidObservations.reduce((sum, value) => sum + value, 0) / liquidObservations.length
        : null,
      mktRf: risk?.mktRf ?? null,
      smb: risk?.smb ?? null,
      hml: risk?.hml ?? null,
      factorMomentum: risk?.momentum ?? null,
      rf: risk?.rf ?? null,
      bookToMarket: marketCap && bookEquity ? bookEquity.value / marketCap : null,
      max5: sortedReturns.length >= 5
        ? sortedReturns.slice(0, 5).reduce((sum, value) => sum + value, 0) / 5
        : null,
      shares,
      bookEquity,
    }];
  });
}
