import type { MonthlyRiskFactors } from "./researchFactors";

function validFactor(value: string | undefined) {
  if (value == null) return null;
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed <= -99) return null;
  return parsed / 100;
}

function monthFromFrenchKey(value: string) {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}`;
}

export function parseFrenchResearchFactors(csv: string) {
  const rows = new Map<string, Omit<MonthlyRiskFactors, "momentum">>();
  for (const line of csv.split(/\r?\n/)) {
    const cells = line.split(",");
    const key = cells[0]?.trim();
    if (!/^\d{6}$/.test(key) || cells.length < 5) continue;
    const month = monthFromFrenchKey(key);
    rows.set(month, {
      month,
      mktRf: validFactor(cells[1]),
      smb: validFactor(cells[2]),
      hml: validFactor(cells[3]),
      rf: validFactor(cells[4]),
    });
  }
  return rows;
}

export function parseFrenchMomentum(csv: string) {
  const rows = new Map<string, number | null>();
  for (const line of csv.split(/\r?\n/)) {
    const cells = line.split(",");
    const key = cells[0]?.trim();
    if (!/^\d{6}$/.test(key) || cells.length < 2) continue;
    rows.set(monthFromFrenchKey(key), validFactor(cells[1]));
  }
  return rows;
}

export function mergeFrenchFactors(researchCsv: string, momentumCsv: string): MonthlyRiskFactors[] {
  const research = parseFrenchResearchFactors(researchCsv);
  const momentum = parseFrenchMomentum(momentumCsv);
  return [...research.values()].map((row) => ({
    ...row,
    momentum: momentum.get(row.month) ?? null,
  }));
}
