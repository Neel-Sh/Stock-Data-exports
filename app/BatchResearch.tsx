"use client";

import {
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  Csv01Icon,
  Download04Icon,
  InformationCircleIcon,
  LayoutTable02Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useState, type FormEvent } from "react";

type IconData = Parameters<typeof HugeiconsIcon>[0]["icon"];
type BatchView = "overview" | "deciles" | "regression" | "panel";

type PanelRow = {
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
  marketCap: number | null;
  membershipStatus: string;
  observed: boolean;
  isMissing: boolean;
  missingReason: string;
};

type DecileRow = { month: string; decile: number; count: number; equalWeightedReturn: number | null; valueWeightedReturn: number | null };
type Inference = { mean: number | null; tStatistic: number | null; observations: number; lag: number };
type BatchResponse = {
  universe: string;
  requested: { start: string; end: string; companies: number; lag: number | null };
  membership: { mode: string; pointInTime: boolean; source: string; limitation: string };
  masterDataset: { rowCount: number; expectedRows: number; previewRows?: number; panelIncluded?: boolean; columns: string[] };
  panel: PanelRow[];
  coverage: { requestedCompanies: number; requestedMonths: number; masterRows: number; observedRows: number; missingRows: number; postExitRows: number; companiesWithExit: number; companiesWithAnyObservation: number; staticMembership: boolean };
  analysis: {
    decileSort: { rows: DecileRow[]; summary: Array<DecileRow & Inference>; valueWeightedSummary: Array<DecileRow & Inference>; spread: { equalWeighted: Inference; valueWeighted: Inference }; alpha: Array<{ decile: number; alpha: number | null; observations: number }> };
    dependentSorts: Record<string, { rows: DecileRow[]; summary: Array<DecileRow & Inference>; spread: { equalWeighted: Inference; valueWeighted: Inference } }>;
    famaMacBeth: { coefficients: Array<{ month: string; values: Record<string, number | null>; observations: number }>; averages: Array<{ factor: string; estimate: number | null; tStatistic: number | null; observations: number; lag: number }>; controls: string[] };
  };
  warnings: string[];
  error?: string;
};

function Icon({ icon, size = 18 }: { icon: IconData; size?: number }) {
  return <HugeiconsIcon aria-hidden="true" icon={icon} size={size} strokeWidth={1.6} />;
}

function monthOrdinal(month: string) {
  const [year, value] = month.split("-").map(Number);
  return year * 12 + value - 1;
}

function monthFromOrdinal(value: number) {
  return `${Math.floor(value / 12)}-${String((value % 12) + 1).padStart(2, "0")}`;
}

function defaultWindow() {
  const current = new Date().toISOString().slice(0, 7);
  const end = monthFromOrdinal(monthOrdinal(current) - 1);
  return { start: monthFromOrdinal(monthOrdinal(end) - 11), end };
}

function percent(value: number | null) {
  return value == null || !Number.isFinite(value) ? "—" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
}

function number(value: number | null, digits = 2) {
  return value == null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

function escapeCsv(value: unknown) {
  const raw = value == null ? "" : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.text();
  try {
    return JSON.parse(body) as T;
  } catch {
    const status = response.status ? ` (${response.status})` : "";
    throw new Error(`The S&P 1500 service returned an unexpected response${status}. The full-roster request may have timed out; try a shorter formation window or fewer companies.`);
  }
}

function downloadPanel(response: BatchResponse) {
  const columns = response.masterDataset.columns;
  const rows = response.panel.map((row) => [row.symbol, row.month, row.max, row.beta, row.size, row.bookToMarket, row.momentum, row.reversal, row.illiquidity, row.forwardReturn, row.marketCap, row.membershipStatus, row.observed, row.isMissing ? "NaN" : "", row.missingReason]);
  const csv = [columns, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `tape_sp1500_${response.masterDataset.panelIncluded ? "master" : "preview"}_${response.requested.start}_${response.requested.end}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function BatchResearch() {
  const defaults = useMemo(defaultWindow, []);
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);
  const [maxCompanies, setMaxCompanies] = useState("1500");
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [data, setData] = useState<BatchResponse | null>(null);
  const [view, setView] = useState<BatchView>("overview");
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPreviewing(true);
    fetch("/api/research-panel?universe=sp1500")
      .then(async (response) => {
        const result = await readJson<{ count?: number; error?: string }>(response);
        if (!response.ok) throw new Error(result.error || "S&P 1500 membership is unavailable.");
        if (!cancelled) setPreviewCount(result.count ?? null);
      })
      .catch((requestError) => { if (!cancelled) setError(requestError instanceof Error ? requestError.message : "S&P 1500 membership is unavailable."); })
      .finally(() => { if (!cancelled) setPreviewing(false); });
    return () => { cancelled = true; };
  }, []);

  async function runEngine(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/research-panel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ universe: "sp1500", start, end, maxCompanies: Number(maxCompanies) }) });
      const result = await readJson<BatchResponse & { error?: string }>(response);
      if (!response.ok) throw new Error(result.error || "The S&P 1500 engine did not respond.");
      setData(result);
      setView("overview");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The S&P 1500 engine is unavailable.");
    } finally {
      setLoading(false);
    }
  }

  const latestDeciles = useMemo(() => {
    if (!data) return [];
    const latest = data.analysis.decileSort.rows.map((row) => row.month).at(-1);
    return data.analysis.decileSort.rows.filter((row) => row.month === latest).sort((a, b) => a.decile - b.decile);
  }, [data]);

  return (
    <div className="batch-workspace">
      <aside className="batch-query-panel">
        <div className="panel-heading"><div><span className="factor-kicker">Full cross-section</span><h2>S&amp;P 1500 engine</h2></div><span className="factor-version">batch</span></div>
        <p className="batch-intro">Build a master factor panel, preserve exited companies, then run decile sorts and Fama–MacBeth inference in one pass.</p>
        <form className="batch-builder" onSubmit={runEngine}>
          <label className="factor-field" htmlFor="batch-start"><span>Formation start</span><div><Icon icon={Search01Icon} size={15} /><input id="batch-start" max={end} onChange={(event) => setStart(event.target.value)} type="month" value={start} /></div></label>
          <label className="factor-field" htmlFor="batch-end"><span>Formation end</span><div><Icon icon={Search01Icon} size={15} /><input id="batch-end" min={start} onChange={(event) => setEnd(event.target.value)} type="month" value={end} /></div></label>
          <label className="factor-field" htmlFor="batch-companies"><span>Companies to load</span><div><Icon icon={LayoutTable02Icon} size={15} /><input id="batch-companies" inputMode="numeric" max="1500" min="1" onChange={(event) => setMaxCompanies(event.target.value.replace(/\D/g, ""))} value={maxCompanies} /></div></label>
          <button className="primary-button" disabled={loading || !maxCompanies} type="submit">{loading ? <><span className="mini-orbit" /> Building panel</> : <>Build {Number(maxCompanies).toLocaleString()} companies <Icon icon={ArrowRight01Icon} size={17} /></>}</button>
        </form>
        <div className="batch-estimate"><span>Roster preview</span><strong>{previewing ? "Checking…" : previewCount == null ? "—" : `${previewCount.toLocaleString()} companies`}</strong><small>Current public S&amp;P 500 + MidCap 400 + SmallCap 600 tables</small></div>
        <div className="batch-warning"><Icon icon={InformationCircleIcon} size={15} /><span>Current roster only. Use licensed point-in-time membership before treating historical portfolio results as unbiased.</span></div>
      </aside>

      <section className={`batch-results ${loading ? "is-loading" : ""}`} aria-busy={loading}>
        {loading ? <div className="batch-loading"><span className="thinking-orb"><i /><i /><i /><i /><i /><i /><i /><i /></span><strong>Fetching daily histories and building the master panel</strong><span>This can take several minutes for the full roster.</span></div> : null}
        {error ? <div className="index-error" role="alert"><Icon icon={InformationCircleIcon} size={20} /><div><strong>Couldn&apos;t run the S&amp;P 1500 engine</strong><p>{error}</p></div><button onClick={() => setError(null)} type="button">Dismiss</button></div> : null}
        {!data ? <div className="batch-empty"><span className="batch-empty-mark"><Icon icon={LayoutTable02Icon} size={22} /></span><strong>Batch research, ready when you are</strong><p>Run the engine to create the combined panel and inspect its missing-data, exit, and inference diagnostics.</p></div> : <>
          <header className="factor-results-header batch-results-header"><div><span className="factor-kicker">{data.universe} · {data.requested.start} to {data.requested.end}</span><h2>Master panel and portfolio tests</h2><p>{data.masterDataset.rowCount.toLocaleString()} rows generated · {data.coverage.observedRows.toLocaleString()} observed · {data.coverage.missingRows.toLocaleString()} missing</p></div><button className="export-button" onClick={() => downloadPanel(data)} type="button"><Icon icon={Download04Icon} size={16} /> {data.masterDataset.panelIncluded ? "Master CSV" : "Preview CSV"} <Icon icon={Csv01Icon} size={14} /></button></header>
          {data.warnings.length ? <div className="warning-strip"><Icon icon={InformationCircleIcon} size={15} /><span>{data.warnings.join(" ")}</span></div> : null}
          <div className="data-tabs batch-tabs" aria-label="Batch research view"><button aria-pressed={view === "overview"} className={view === "overview" ? "is-active" : ""} onClick={() => setView("overview")} type="button"><Icon icon={CheckmarkCircle02Icon} size={15} /> Overview</button><button aria-pressed={view === "deciles"} className={view === "deciles" ? "is-active" : ""} onClick={() => setView("deciles")} type="button">Deciles</button><button aria-pressed={view === "regression"} className={view === "regression" ? "is-active" : ""} onClick={() => setView("regression")} type="button">Fama–MacBeth</button><button aria-pressed={view === "panel"} className={view === "panel" ? "is-active" : ""} onClick={() => setView("panel")} type="button">Panel rows</button></div>

          {view === "overview" ? <div className="batch-overview"><div className="batch-stat-grid"><div><span>Master rows</span><strong>{data.coverage.masterRows.toLocaleString()}</strong><small>{data.coverage.requestedCompanies.toLocaleString()} companies × {data.coverage.requestedMonths} months</small></div><div><span>Observed inputs</span><strong>{data.coverage.observedRows.toLocaleString()}</strong><small>{((data.coverage.observedRows / Math.max(1, data.coverage.masterRows)) * 100).toFixed(1)}% of master panel</small></div><div><span>Post-exit rows</span><strong>{data.coverage.postExitRows.toLocaleString()}</strong><small>Preserved as missing, not dropped</small></div><div><span>10−1 spread t-stat</span><strong>{number(data.analysis.decileSort.spread.equalWeighted.tStatistic)}</strong><small>Equal-weighted · NW lag {data.analysis.decileSort.spread.equalWeighted.lag}</small></div></div><div className="batch-callout"><Icon icon={InformationCircleIcon} size={17} /><div><strong>Unbalanced panel policy</strong><p>Each company gets one row for every requested formation month. After its last observed month, factor and return fields are blank; its earlier observations remain eligible for the cross-section.</p></div></div></div> : null}

          {view === "deciles" ? <div className="batch-table-wrap"><div className="batch-table-heading"><div><span>Latest formation month</span><strong>{latestDeciles[0]?.month ?? "—"}</strong></div><div><span>Equal-weighted 10−1</span><strong>{percent(data.analysis.decileSort.spread.equalWeighted.mean)} <small>t {number(data.analysis.decileSort.spread.equalWeighted.tStatistic)}</small></strong></div><div><span>Value-weighted 10−1</span><strong>{percent(data.analysis.decileSort.spread.valueWeighted.mean)} <small>t {number(data.analysis.decileSort.spread.valueWeighted.tStatistic)}</small></strong></div></div><table className="batch-table"><thead><tr><th>Decile</th><th>Companies</th><th>EW forward</th><th>VW forward</th></tr></thead><tbody>{(data.analysis.decileSort.summary ?? []).map((row, index) => <tr key={row.decile}><td><strong>D{row.decile}</strong></td><td>{row.count}</td><td>{percent(row.mean)} <small>t {number(row.tStatistic)}</small></td><td>{percent(data.analysis.decileSort.valueWeightedSummary[index]?.mean ?? null)}</td></tr>)}</tbody></table><p className="batch-table-note">Deciles rank MAX within each formation month. Newey–West inference uses the configured lag (rule of thumb by default).</p></div> : null}

          {view === "regression" ? <div className="batch-regression"><div className="batch-table-heading"><div><span>Monthly cross-sections</span><strong>{data.analysis.famaMacBeth.coefficients.length}</strong></div><div><span>Controls</span><strong>{data.analysis.famaMacBeth.controls.length}</strong></div><div><span>MAX estimate</span><strong>{percent(data.analysis.famaMacBeth.averages.find((item) => item.factor === "max")?.estimate ?? null)} <small>t {number(data.analysis.famaMacBeth.averages.find((item) => item.factor === "max")?.tStatistic ?? null)}</small></strong></div></div><table className="batch-table"><thead><tr><th>Factor</th><th>Estimate</th><th>NW t-stat</th><th>Months</th><th>Lag</th></tr></thead><tbody>{data.analysis.famaMacBeth.averages.map((item) => <tr key={item.factor}><td><strong>{item.factor.toUpperCase()}</strong></td><td>{percent(item.estimate)}</td><td>{number(item.tStatistic)}</td><td>{item.observations}</td><td>{item.lag}</td></tr>)}</tbody></table><p className="batch-table-note">Each month uses forward return as the dependent variable and MAX, BETA, SIZE, BM, MOM, REV, and ILLIQ as cross-sectional controls.</p></div> : null}

          {view === "panel" ? <div className="batch-table-wrap"><table className="batch-table"><thead><tr><th>Symbol</th><th>Month</th><th>MAX</th><th>BETA</th><th>SIZE</th><th>Forward</th><th>Status</th></tr></thead><tbody>{data.panel.slice(0, 240).map((row) => <tr className={row.isMissing ? "is-missing" : ""} key={`${row.symbol}-${row.month}`}><td><strong>{row.symbol}</strong></td><td>{row.month}</td><td>{percent(row.max)}</td><td>{number(row.beta)}</td><td>{number(row.size)}</td><td>{percent(row.forwardReturn)}</td><td>{row.isMissing ? row.missingReason : "observed"}</td></tr>)}</tbody></table><p className="batch-table-note">{data.masterDataset.panelIncluded ? `Showing the first ${Math.min(240, data.panel.length).toLocaleString()} rows. Download Master CSV for the complete ${data.panel.length.toLocaleString()}-row panel.` : `Showing a ${Math.min(240, data.panel.length).toLocaleString()}-row preview of the ${data.masterDataset.rowCount.toLocaleString()}-row generated panel. Use shorter windows when you need a browser-downloadable master CSV.`}</p></div> : null}
        </>}
      </section>
    </div>
  );
}
