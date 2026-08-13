"use client";

import {
  Activity01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  Calendar03Icon,
  CheckmarkCircle02Icon,
  Csv01Icon,
  Download04Icon,
  InformationCircleIcon,
  LayoutTable02Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DailyReturnPoint, ResearchFactorRow } from "@/lib/researchFactors";

type IconData = Parameters<typeof HugeiconsIcon>[0]["icon"];
type FactorView = "monthly" | "daily";

type ResearchResponse = {
  symbol: string;
  name: string;
  currency: string;
  exchange: string;
  start: string;
  end: string;
  rows: ResearchFactorRow[];
  daily: DailyReturnPoint[];
  warnings: string[];
  requestedAt: string;
  fundamentals: {
    cik: string;
    entityName: string;
    pointInTimeRule: string;
    bookEquityDefinition: string;
  } | null;
  sources: {
    market: string;
    fundamentals: string;
    riskFactors: string;
  };
  error?: string;
};

type MetricDefinition = {
  key: keyof ResearchFactorRow;
  label: string;
  symbol: string;
  formula: string;
  format: (value: number | null) => string;
  tone?: (value: number | null) => "positive" | "negative" | undefined;
};

function Icon({ icon, size = 18 }: { icon: IconData; size?: number }) {
  return <HugeiconsIcon aria-hidden="true" icon={icon} size={size} strokeWidth={1.6} />;
}

function monthOrdinal(month: string) {
  const [year, value] = month.split("-").map(Number);
  return year * 12 + value - 1;
}

function monthFromOrdinal(ordinal: number) {
  const year = Math.floor(ordinal / 12);
  return `${year}-${String(ordinal % 12 + 1).padStart(2, "0")}`;
}

function defaultWindow() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const end = monthFromOrdinal(monthOrdinal(currentMonth) - 1);
  return { start: monthFromOrdinal(monthOrdinal(end) - 23), end };
}

function percent(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%`;
}

function ratio(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(4);
}

function naturalLog(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(3);
}

function scientific(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toExponential(3);
}

function number(value: number | null, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
}

function money(value: number | null, currency: string) {
  if (value == null || !Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
  } catch {
    return number(value);
  }
}

function compactMoney(value: number | null, currency: string) {
  if (value == null || !Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, notation: "compact", maximumFractionDigits: 2 }).format(value);
  } catch {
    return number(value);
  }
}

function tone(value: number | null) {
  return value == null ? undefined : value >= 0 ? "positive" as const : "negative" as const;
}

function escapeCsv(value: string | number | null) {
  const raw = value == null ? "" : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}

function downloadText(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const METRICS: MetricDefinition[] = [
  { key: "forwardMonthlyReturn", label: "Forward return", symbol: "Rᵢ,ₜ₊₁", formula: "Adj P(t+1) / Adj P(t) - 1", format: percent, tone },
  { key: "maxDailyReturn", label: "Maximum daily return", symbol: "MAX", formula: "max(Rᵢ,d) in month t", format: percent, tone },
  { key: "size", label: "Firm size", symbol: "SIZE", formula: "ln(close × reported shares)", format: naturalLog },
  { key: "reversal", label: "Short-term reversal", symbol: "REV", formula: "P(t) / P(t-1) - 1", format: percent, tone },
  { key: "momentum", label: "Intermediate momentum", symbol: "MOM", formula: "P(t-2) / P(t-13) - 1", format: percent, tone },
  { key: "illiquidity", label: "Amihud illiquidity", symbol: "ILLIQ", formula: "mean(|Rᵢ,d| / dollar volume)", format: scientific },
  { key: "bookToMarket", label: "Book-to-market", symbol: "BM", formula: "reported equity / market cap", format: ratio },
  { key: "max5", label: "Multi-day maximum", symbol: "MAX(5)", formula: "mean(top 5 daily returns)", format: percent, tone },
];

const MONTHLY_COLUMNS: Array<{ key: keyof ResearchFactorRow; label: string; format: (value: number | null) => string }> = [
  { key: "forwardMonthlyReturn", label: "Forward", format: percent },
  { key: "maxDailyReturn", label: "MAX", format: percent },
  { key: "size", label: "SIZE", format: naturalLog },
  { key: "reversal", label: "REV", format: percent },
  { key: "momentum", label: "MOM", format: percent },
  { key: "illiquidity", label: "ILLIQ", format: scientific },
  { key: "bookToMarket", label: "BM", format: ratio },
  { key: "max5", label: "MAX(5)", format: percent },
];

export default function ResearchFactors() {
  const defaults = useRef(defaultWindow());
  const [symbol, setSymbol] = useState("AAPL");
  const [start, setStart] = useState(defaults.current.start);
  const [end, setEnd] = useState(defaults.current.end);
  const [data, setData] = useState<ResearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<FactorView>("monthly");
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exported, setExported] = useState<string | null>(null);
  const didInitialLoad = useRef(false);

  const requestFactors = useCallback(async (requestSymbol: string, requestStart: string, requestEnd: string) => {
    setLoading(true);
    setError(null);
    setExportOpen(false);
    try {
      const params = new URLSearchParams({ symbol: requestSymbol.trim().toUpperCase(), start: requestStart, end: requestEnd });
      const response = await fetch(`/api/research-factors?${params}`, { cache: "no-store" });
      const result = await response.json() as ResearchResponse;
      if (!response.ok) throw new Error(result.error || "Research factors are unavailable.");
      setData(result);
      setSelectedMonth(result.rows.at(-1)?.month ?? null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Research factors are unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (didInitialLoad.current) return;
    didInitialLoad.current = true;
    void requestFactors("AAPL", defaults.current.start, defaults.current.end);
  }, [requestFactors]);

  const selected = data?.rows.find((row) => row.month === selectedMonth) ?? data?.rows.at(-1) ?? null;
  const monthlyRows = useMemo(() => [...(data?.rows ?? [])].reverse(), [data?.rows]);
  const dailyRows = useMemo(() => (data?.daily ?? []).filter((point) => point.date.startsWith(selected?.month ?? "")).reverse(), [data?.daily, selected?.month]);
  const maxMonth = defaults.current.end;
  const currency = data?.currency ?? "USD";

  function exportMonthlyCsv() {
    if (!data) return;
    const columns = ["symbol", "month", "month_end", "trading_days", "forward_return", "max", "market_cap", "size", "rev", "mom_12_2", "illiq", "mkt_rf", "smb", "hml", "factor_mom", "rf", "book_to_market", "max_5", "shares_filed", "book_equity_filed"];
    const rows = data.rows.map((row) => [
      data.symbol, row.month, row.monthEndDate, row.tradingDays, row.forwardMonthlyReturn, row.maxDailyReturn, row.marketCap,
      row.size, row.reversal, row.momentum, row.illiquidity, row.mktRf, row.smb, row.hml, row.factorMomentum, row.rf,
      row.bookToMarket, row.max5, row.shares?.filed ?? null, row.bookEquity?.filed ?? null,
    ]);
    const csv = [columns, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
    downloadText(`\ufeff${csv}`, `tape_${data.symbol}_${data.start}_${data.end}_research_factors.csv`);
    setExportOpen(false);
    setExported("Monthly factor CSV downloaded.");
    window.setTimeout(() => setExported(null), 2600);
  }

  function exportDailyCsv() {
    if (!data) return;
    const columns = ["symbol", "date", "close", "adjusted_close", "volume", "simple_return"];
    const rows = data.daily.map((row) => [data.symbol, row.date, row.close, row.adjClose, row.volume, row.simpleReturn]);
    const csv = [columns, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
    downloadText(`\ufeff${csv}`, `tape_${data.symbol}_${data.start}_${data.end}_daily_returns.csv`);
    setExportOpen(false);
    setExported("Daily return CSV downloaded.");
    window.setTimeout(() => setExported(null), 2600);
  }

  return (
    <div className="factor-workspace">
      <aside className="factor-query-panel">
        <div className="panel-heading">
          <div><span className="factor-kicker">Cross-sectional model</span><h2>Factor query</h2></div>
          <span className="factor-version">v1</span>
        </div>

        <form className="factor-builder" onSubmit={(event) => { event.preventDefault(); void requestFactors(symbol, start, end); }}>
          <label className="factor-field" htmlFor="factor-symbol">
            <span>Equity ticker</span>
            <div><Icon icon={Search01Icon} size={16} /><input id="factor-symbol" maxLength={16} onChange={(event) => setSymbol(event.target.value.toUpperCase())} pattern="[A-Za-z0-9.-]+" value={symbol} /></div>
          </label>
          <div className="factor-date-grid">
            <label className="factor-field" htmlFor="factor-start"><span>Formation start</span><div><Icon icon={Calendar03Icon} size={15} /><input id="factor-start" max={end} onChange={(event) => setStart(event.target.value)} type="month" value={start} /></div></label>
            <label className="factor-field" htmlFor="factor-end"><span>Formation end</span><div><Icon icon={Calendar03Icon} size={15} /><input id="factor-end" max={maxMonth} min={start} onChange={(event) => setEnd(event.target.value)} type="month" value={end} /></div></label>
          </div>
          <button className="primary-button" disabled={loading || !symbol.trim()} type="submit">
            {loading ? <><span className="mini-orbit" /> Computing</> : <>Build factors <Icon icon={ArrowRight01Icon} size={17} /></>}
          </button>
        </form>

        <details className="factor-lineage-details">
          <summary><span>Method &amp; sources</span><strong>3-source model</strong></summary>
          <div className="factor-coverage">
            <div><Icon icon={CheckmarkCircle02Icon} size={15} /><span>Returns</span><strong>Adjusted daily</strong></div>
            <div><Icon icon={CheckmarkCircle02Icon} size={15} /><span>Fundamentals</span><strong>Filing-aware</strong></div>
            <div><Icon icon={CheckmarkCircle02Icon} size={15} /><span>Benchmarks</span><strong>Monthly matched</strong></div>
          </div>

          <div className="factor-source-stack">
            <span>Data lineage</span>
            <a href="https://finance.yahoo.com/" rel="noreferrer" target="_blank"><i className="source-yahoo" /> Yahoo Finance <small>prices + volume</small></a>
            <a href="https://data.sec.gov/" rel="noreferrer" target="_blank"><i className="source-sec" /> SEC Company Facts <small>shares + equity</small></a>
            <a href="https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html" rel="noreferrer" target="_blank"><i className="source-french" /> Kenneth French <small>risk factors</small></a>
          </div>
        </details>
      </aside>

      <section className={`factor-results ${loading ? "is-loading" : ""}`} aria-busy={loading}>
        {loading ? <div className="factor-loading"><span className="thinking-orb"><i /><i /><i /><i /><i /><i /><i /><i /></span><strong>Computing monthly factors</strong></div> : null}
        {error ? <div className="index-error" role="alert"><Icon icon={InformationCircleIcon} size={20} /><div><strong>Couldn&apos;t build factors</strong><p>{error}</p></div><button onClick={() => void requestFactors(symbol, start, end)} type="button">Retry</button></div> : null}

        <header className="factor-results-header">
          <div>
            <span className="factor-kicker">{data?.symbol ?? symbol} · {data?.exchange ?? "Equity"}</span>
            <h2>{data?.name ?? "Research factors"}</h2>
            <p>{data ? `${data.start} to ${data.end} · ${data.rows.length} formation months` : "Daily inputs and monthly predictors"}</p>
          </div>
          <div className="factor-header-actions">
            <div className="data-tabs" aria-label="Research factor view">
              <button aria-pressed={view === "monthly"} className={view === "monthly" ? "is-active" : ""} onClick={() => setView("monthly")} type="button"><Icon icon={LayoutTable02Icon} size={15} /> Monthly</button>
              <button aria-pressed={view === "daily"} className={view === "daily" ? "is-active" : ""} onClick={() => setView("daily")} type="button"><Icon icon={Activity01Icon} size={15} /> Daily input</button>
            </div>
            <div className="export-wrap">
              <button className="export-button" disabled={!data || loading} onClick={() => setExportOpen((value) => !value)} type="button"><Icon icon={Download04Icon} size={16} /> Export <Icon icon={ArrowDown01Icon} size={13} /></button>
              {exportOpen ? <div className="export-menu"><span>Research exports</span><button onClick={exportMonthlyCsv} type="button"><Icon icon={Csv01Icon} /><span><strong>Monthly factor CSV</strong><small>{data?.rows.length ?? 0} formation rows</small></span></button><button onClick={exportDailyCsv} type="button"><Icon icon={Activity01Icon} /><span><strong>Daily return CSV</strong><small>{data?.daily.length ?? 0} input rows</small></span></button></div> : null}
            </div>
          </div>
        </header>

        {data?.warnings.length ? <div className="warning-strip"><Icon icon={InformationCircleIcon} size={15} /> {data.warnings.join(" ")}</div> : null}

        {selected ? <>
          <div className="formation-bar">
            <div><span>Formation month</span><strong>{selected.month}</strong><small>{selected.tradingDays} trading days · month-end {selected.monthEndDate}</small></div>
            <label><span className="sr-only">Selected formation month</span><select onChange={(event) => setSelectedMonth(event.target.value)} value={selected.month}>{monthlyRows.map((row) => <option key={row.month} value={row.month}>{row.month}</option>)}</select></label>
          </div>

          <div className="factor-metric-grid">
            <article className="factor-metric-card input-card">
              <span><em>Core input</em><b>Rᵢ,d</b></span>
              <strong>{selected.dailyReturnObservations}/{selected.tradingDays}</strong>
              <p>Adjusted-close daily returns available</p>
            </article>
            {METRICS.map((metric) => {
              const value = selected[metric.key] as number | null;
              const valueTone = metric.tone?.(value);
              return <article className="factor-metric-card" key={metric.key}>
                <span><em>{metric.label}</em><b>{metric.symbol}</b></span>
                <strong className={valueTone ? `is-${valueTone}` : ""}>{metric.format(value)}</strong>
                <p>{metric.formula}</p>
              </article>;
            })}
          </div>

          <section className="benchmark-strip" aria-label="Risk factor benchmarks">
            <div><span>Risk benchmarks</span><strong>Kenneth French · {selected.month}{selected.mktRf == null ? " · pending" : ""}</strong></div>
            <dl>
              <div><dt>MKT-RF</dt><dd className={tone(selected.mktRf) ? `is-${tone(selected.mktRf)}` : ""}>{percent(selected.mktRf)}</dd></div>
              <div><dt>SMB</dt><dd className={tone(selected.smb) ? `is-${tone(selected.smb)}` : ""}>{percent(selected.smb)}</dd></div>
              <div><dt>HML</dt><dd className={tone(selected.hml) ? `is-${tone(selected.hml)}` : ""}>{percent(selected.hml)}</dd></div>
              <div><dt>MOM</dt><dd className={tone(selected.factorMomentum) ? `is-${tone(selected.factorMomentum)}` : ""}>{percent(selected.factorMomentum)}</dd></div>
              <div><dt>RF</dt><dd>{percent(selected.rf)}</dd></div>
            </dl>
          </section>

          <div className="factor-provenance" aria-label="Selected month provenance">
            <div><span>Market cap</span><strong>{compactMoney(selected.marketCap, currency)}</strong><small>Unadjusted close × reported shares</small></div>
            <div><span>Shares fact</span><strong>{selected.shares ? `${number(selected.shares.value, 0)} shares` : "Unavailable"}</strong><small>{selected.shares ? `${selected.shares.form} · filed ${selected.shares.filed}` : "No point-in-time SEC fact"}</small></div>
            <div><span>Book equity fact</span><strong>{selected.bookEquity ? compactMoney(selected.bookEquity.value, currency) : "Unavailable"}</strong><small>{selected.bookEquity ? `${selected.bookEquity.form} · filed ${selected.bookEquity.filed}` : "No point-in-time SEC fact"}</small></div>
          </div>

          {view === "monthly" ? <div className="factor-table-wrap">
            <table className="factor-table">
              <thead><tr><th>Formation month</th>{MONTHLY_COLUMNS.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
              <tbody>{monthlyRows.map((row) => <tr className={row.month === selected.month ? "is-selected" : ""} key={row.month}><td><button onClick={() => setSelectedMonth(row.month)} type="button"><strong>{row.month}</strong><small>{row.tradingDays} days</small></button></td>{MONTHLY_COLUMNS.map((column) => { const value = row[column.key] as number | null; return <td className={column.key !== "size" && column.key !== "illiquidity" && column.key !== "bookToMarket" && tone(value) ? `is-${tone(value)}` : ""} key={column.key}>{column.format(value)}</td>; })}</tr>)}</tbody>
            </table>
          </div> : <div className="factor-table-wrap daily-factor-table-wrap">
            <table className="factor-table daily-factor-table">
              <thead><tr><th>Date</th><th>Close</th><th>Adjusted close</th><th>Daily return Rᵢ,d</th><th>Volume</th><th>Dollar volume</th></tr></thead>
              <tbody>{dailyRows.map((row) => <tr key={row.date}><td><strong>{row.date}</strong></td><td>{money(row.close, currency)}</td><td>{money(row.adjClose, currency)}</td><td className={tone(row.simpleReturn) ? `is-${tone(row.simpleReturn)}` : ""}>{percent(row.simpleReturn)}</td><td>{number(row.volume, 0)}</td><td>{compactMoney(row.close != null && row.volume != null ? row.close * row.volume : null, currency)}</td></tr>)}</tbody>
            </table>
          </div>}

          <footer className="factor-method-note"><Icon icon={InformationCircleIcon} size={14} /><span>Returns use adjusted close. <code>SIZE</code> and <code>BM</code> only use SEC facts filed by the formation month-end. The last month&apos;s forward return remains blank until the following month is complete.</span></footer>
        </> : <div className="factor-empty" aria-live="polite">Run a query to build the monthly research panel.</div>}
      </section>
      {exported ? <div className="toast" aria-live="polite"><Icon icon={CheckmarkCircle02Icon} size={17} /> {exported}</div> : null}
    </div>
  );
}
