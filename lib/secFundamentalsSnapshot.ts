import snapshots from "@/data/secFundamentalsSnapshots.json";
import type { ReportedFact } from "./researchFactors";

type FundamentalsSnapshot = {
  cik: string;
  entityName: string;
  retrievedAt: string;
  shares: ReportedFact[];
  bookEquity: ReportedFact[];
};

const typedSnapshots = snapshots as Record<string, FundamentalsSnapshot>;

export function getSecFundamentalsSnapshot(symbol: string): FundamentalsSnapshot | null {
  return typedSnapshots[symbol.toUpperCase()] ?? null;
}
