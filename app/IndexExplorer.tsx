"use client";

import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  Building03Icon,
  Cancel01Icon,
  ChartBreakoutCircleIcon,
  InformationCircleIcon,
  Search01Icon,
  Sorting01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useRef, useState } from "react";

type IconData = Parameters<typeof HugeiconsIcon>[0]["icon"];
type IndexId = "sp500" | "sp1500" | "europe600" | "nasdaq100" | "dow30";
type HistoryRange = "1M" | "YTD" | "1Y";
type SortMode = "size" | "gainers" | "laggards" | "company";

type IndexSummary = {
  id: IndexId;
  name: string;
  shortName: string;
  symbol: string;
  description: string;
  weighting: string;
};

type Constituent = {
  symbol: string;
  dataSymbol: string | null;
  name: string;
  sector: string;
  industry: string;
  dateAdded: string | null;
  lastPrice: number | null;
  change: number | null;
  changePercent: number | null;
  marketCap: number | null;
};

type IndexResponse = {
  index: IndexSummary;
  indexes: IndexSummary[];
  constituents: Constituent[];
  membershipTotal: number;
  membershipCoverage: string;
  requestedAt: string;
  sources: { membership: string; snapshot: string };
  error?: string;
};

type HistoryPoint = {
  date: string;
  close: number;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
};

type HistoryResponse = {
  symbol: string;
  range: HistoryRange;
  points: HistoryPoint[];
  returnPercent: number | null;
  requestedAt: string;
  source: string;
  error?: string;
};

const INDEX_CHOICES: IndexSummary[] = [
  { id: "sp500", name: "S&P 500", shortName: "S&P 500", symbol: "^GSPC", description: "U.S. large cap", weighting: "Float-adjusted market cap" },
  { id: "sp1500", name: "S&P Composite 1500", shortName: "S&P 1500", symbol: "^SP1500", description: "Broad U.S. market", weighting: "Float-adjusted market cap" },
  { id: "europe600", name: "STOXX Europe 600", shortName: "STOXX 600", symbol: "^STOXX", description: "Broad European market", weighting: "Free-float market cap" },
  { id: "nasdaq100", name: "Nasdaq-100", shortName: "Nasdaq 100", symbol: "^NDX", description: "Large non-financial", weighting: "Modified market cap" },
  { id: "dow30", name: "Dow Jones Industrial Average", shortName: "Dow 30", symbol: "^DJI", description: "U.S. blue chips", weighting: "Price weighted" },
];

function Icon({ icon, size = 18 }: { icon: IconData; size?: number }) {
  return <HugeiconsIcon aria-hidden="true" icon={icon} size={size} strokeWidth={1.6} />;
}

function money(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function marketCap(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function percent(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function StockChart({ points }: { points: HistoryPoint[] }) {
  const width = 720;
  const height = 230;
  const padding = { top: 18, right: 8, bottom: 27, left: 8 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const closes = points.map((point) => point.close);
  const low = Math.min(...closes);
  const high = Math.max(...closes);
  const range = high - low || 1;
  const x = (index: number) => padding.left + (index / Math.max(1, points.length - 1)) * chartWidth;
  const y = (value: number) => padding.top + (1 - (value - low) / range) * chartHeight;
  const path = points.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(2)},${y(point.close).toFixed(2)}`).join(" ");
  const rising = points.at(-1)!.close >= points[0].close;
  const area = `${path} L${x(points.length - 1)},${padding.top + chartHeight} L${x(0)},${padding.top + chartHeight} Z`;
  const ticks = [0, 0.5, 1];

  return (
    <div className={`stock-chart ${rising ? "is-rising" : "is-falling"}`} role="img" aria-label={`Price chart from ${points[0].date} to ${points.at(-1)!.date}`}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="stock-detail-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity=".18" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => <line className="stock-chart-grid" key={tick} x1={padding.left} x2={width - padding.right} y1={padding.top + tick * chartHeight} y2={padding.top + tick * chartHeight} />)}
        <path d={area} fill="url(#stock-detail-fill)" />
        <path className="stock-chart-line" d={path} fill="none" vectorEffect="non-scaling-stroke" />
        <text className="stock-chart-date" x={padding.left} y={height - 5}>{points[0].date}</text>
        <text className="stock-chart-date is-end" x={width - padding.right} y={height - 5}>{points.at(-1)!.date}</text>
      </svg>
    </div>
  );
}

function DetailDrawer({ constituent, onClose, onOpenDataset }: { constituent: Constituent & { dataSymbol: string }; onClose: () => void; onOpenDataset: (symbol: string) => void }) {
  const [range, setRange] = useState<HistoryRange>("1Y");
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/constituent-history?symbol=${encodeURIComponent(constituent.dataSymbol)}&range=${range}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as HistoryResponse;
        if (!response.ok) throw new Error(result.error || "Price history is unavailable.");
        setHistory(result);
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Price history is unavailable.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [constituent.dataSymbol, range]);

  const periodHigh = history?.points.length ? Math.max(...history.points.map((point) => point.close)) : null;
  const periodLow = history?.points.length ? Math.min(...history.points.map((point) => point.close)) : null;

  return (
    <div className="drawer-backdrop">
      <aside aria-labelledby="stock-detail-title" aria-modal="true" className="stock-drawer" role="dialog">
        <div className="drawer-topbar">
          <button className="drawer-back" onClick={onClose} ref={closeRef} type="button"><Icon icon={ArrowLeft01Icon} size={16} /> Back to index</button>
          <button className="modal-close" onClick={onClose} aria-label="Close stock details" type="button"><Icon icon={Cancel01Icon} /></button>
        </div>

        <div className="stock-identity">
          <span className="stock-monogram">{constituent.symbol.slice(0, 2)}</span>
          <div>
            <span>{constituent.symbol}</span>
            <h2 id="stock-detail-title">{constituent.name}</h2>
            <p>{constituent.sector}{constituent.industry ? ` · ${constituent.industry}` : ""}</p>
          </div>
        </div>

        <div className="stock-price-line">
          <strong>{money(constituent.lastPrice)}</strong>
          <span className={constituent.changePercent == null ? "" : constituent.changePercent >= 0 ? "positive-text" : "negative-text"}>
            {percent(constituent.changePercent)} today
          </span>
        </div>

        <div className="detail-range-bar">
          <span>Price performance</span>
          <div className="segmented compact" aria-label="Stock history range">
            {(["1M", "YTD", "1Y"] as HistoryRange[]).map((option) => (
              <button aria-pressed={range === option} className={range === option ? "is-active" : ""} key={option} onClick={() => { setLoading(true); setError(null); setRange(option); }} type="button">{option}</button>
            ))}
          </div>
        </div>

        <div className="detail-chart-card">
          {loading ? <div className="detail-loading"><span className="mini-orbit" /> Loading price history</div> : null}
          {!loading && error ? <div className="detail-error"><Icon icon={InformationCircleIcon} /><span>{error}</span></div> : null}
          {!loading && history?.points.length ? <StockChart points={history.points} /> : null}
        </div>

        <div className="detail-metrics">
          <div><span>{range} return</span><strong className={history?.returnPercent == null ? "" : history.returnPercent >= 0 ? "positive-text" : "negative-text"}>{percent(history?.returnPercent ?? null)}</strong></div>
          <div><span>Period high</span><strong>{money(periodHigh)}</strong></div>
          <div><span>Period low</span><strong>{money(periodLow)}</strong></div>
          <div><span>Market cap</span><strong>{marketCap(constituent.marketCap)}</strong></div>
        </div>

        <dl className="stock-facts">
          <div><dt>Sector</dt><dd>{constituent.sector || "—"}</dd></div>
          <div><dt>Industry</dt><dd>{constituent.industry || "—"}</dd></div>
          <div><dt>Joined index</dt><dd>{constituent.dateAdded || "—"}</dd></div>
        </dl>

        <button className="primary-button drawer-action" onClick={() => onOpenDataset(constituent.dataSymbol)} type="button">
          Open full history <Icon icon={ArrowRight01Icon} size={17} />
        </button>
        <p className="drawer-source">Historical prices from Nasdaq. Use the dataset view for returns, events, and export.</p>
      </aside>
    </div>
  );
}

export default function IndexExplorer({ onOpenDataset }: { onOpenDataset: (symbol: string) => void }) {
  const [indexId, setIndexId] = useState<IndexId>("sp500");
  const [data, setData] = useState<IndexResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sector, setSector] = useState("All sectors");
  const [sort, setSort] = useState<SortMode>("size");
  const [visibleCount, setVisibleCount] = useState(50);
  const [selected, setSelected] = useState<(Constituent & { dataSymbol: string }) | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/indices?index=${indexId}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as IndexResponse;
        if (!response.ok) throw new Error(result.error || "Index membership is unavailable.");
        setData(result);
      })
      .catch((requestError) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Index membership is unavailable.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [indexId]);

  function chooseIndex(nextIndex: IndexId) {
    if (nextIndex === indexId) return;
    setLoading(true);
    setError(null);
    setIndexId(nextIndex);
    setQuery("");
    setSector("All sectors");
    setSort(nextIndex === "europe600" ? "company" : "size");
    setVisibleCount(50);
    setSelected(null);
  }

  const constituents = useMemo(() => data?.constituents ?? [], [data?.constituents]);
  const sectors = useMemo(() => ["All sectors", ...new Set(constituents.map((item) => item.sector).filter(Boolean))], [constituents]);
  const totalMarketCap = constituents.reduce((sum, item) => sum + (item.marketCap ?? 0), 0);
  const quoteCount = constituents.filter((item) => item.changePercent != null).length;
  const advancing = constituents.filter((item) => (item.changePercent ?? 0) > 0).length;
  const declining = constituents.filter((item) => (item.changePercent ?? 0) < 0).length;
  const unchanged = Math.max(0, quoteCount - advancing - declining);
  const breadth = quoteCount ? (advancing / quoteCount) * 100 : 0;
  const sectorCounts = constituents.reduce<Record<string, number>>((counts, item) => {
    if (item.sector) counts[item.sector] = (counts[item.sector] ?? 0) + 1;
    return counts;
  }, {});
  const largestSector = Object.entries(sectorCounts).sort((a, b) => b[1] - a[1])[0];

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return constituents
      .filter((item) => sector === "All sectors" || item.sector === sector)
      .filter((item) => !normalized || [item.symbol, item.name, item.sector, item.industry].some((value) => value.toLowerCase().includes(normalized)))
      .sort((a, b) => {
        if (sort === "gainers") return (b.changePercent ?? -Infinity) - (a.changePercent ?? -Infinity);
        if (sort === "laggards") return (a.changePercent ?? Infinity) - (b.changePercent ?? Infinity);
        if (sort === "company") return a.name.localeCompare(b.name);
        return (b.marketCap ?? -Infinity) - (a.marketCap ?? -Infinity);
      });
  }, [constituents, query, sector, sort]);

  const activeIndex = data?.index ?? INDEX_CHOICES.find((item) => item.id === indexId)!;
  const hasTradableSymbols = indexId !== "europe600";
  const membershipTotal = data?.membershipTotal ?? constituents.length;
  const displayed = filtered.slice(0, visibleCount);
  const asOf = data?.requestedAt ? new Date(data.requestedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

  return (
    <div className="index-workspace">
      <section className="index-picker" aria-label="Choose an index">
        <div className="index-picker-heading">
          <div><span>Market map</span><h2>Explore an index</h2></div>
          <small>Current membership</small>
        </div>
        <div className="index-cards">
          {INDEX_CHOICES.map((index) => (
            <button aria-pressed={indexId === index.id} className={indexId === index.id ? "is-active" : ""} key={index.id} onClick={() => chooseIndex(index.id)} type="button">
              <span className="index-symbol">{index.symbol}</span>
              <strong>{index.shortName}</strong>
              <small>{index.description}</small>
              <Icon icon={ArrowRight01Icon} size={16} />
            </button>
          ))}
        </div>
      </section>

      <section className={`index-results ${loading ? "is-loading" : ""}`} aria-busy={loading}>
        {loading ? <div className="index-loading"><span className="thinking-orb"><i /><i /><i /><i /><i /><i /><i /><i /></span><strong>Mapping the index</strong></div> : null}
        {error ? <div className="index-error"><Icon icon={InformationCircleIcon} size={20} /><div><strong>Couldn&apos;t load this index</strong><p>{error}</p></div><button onClick={() => chooseIndex(indexId === "sp500" ? "nasdaq100" : "sp500")} type="button">Try another</button></div> : null}

        <header className="index-results-header">
          <div>
            <span className="index-kicker">{activeIndex.symbol} · {activeIndex.weighting}</span>
            <h2>{activeIndex.name}</h2>
            <p>{activeIndex.description}</p>
          </div>
          <div className="constituent-total"><strong>{membershipTotal || "—"}</strong><span>index members</span><small>{data?.membershipCoverage ?? "Current table"}</small></div>
        </header>

        <div className={`breadth-panel ${hasTradableSymbols ? "" : "is-reference-only"}`}>
          <div className="breadth-summary">
            <div>
              <span>{hasTradableSymbols ? "Market breadth" : "Public component coverage"}</span>
              <strong>{hasTradableSymbols ? (quoteCount ? `${breadth.toFixed(0)}% advancing` : "Awaiting snapshot") : "Official top-component view"}</strong>
            </div>
            {hasTradableSymbols ? <div className="breadth-counts">
              <span className="is-up"><i />{advancing} up</span>
              <span className="is-down"><i />{declining} down</span>
              <span><i />{unchanged} flat</span>
            </div> : <span className="official-count">10 of 600 publicly shown</span>}
          </div>
          {hasTradableSymbols ? <div className="breadth-track" aria-label={`${advancing} advancing, ${declining} declining, ${unchanged} unchanged`}>
            <i className="is-up" style={{ width: `${breadth}%` }} />
            <i className="is-down" style={{ width: `${quoteCount ? (declining / quoteCount) * 100 : 0}%` }} />
          </div> : null}
          <div className="index-metrics">
            <div><span>Companies</span><strong>{membershipTotal || "—"}</strong></div>
            <div><span>Snapshot coverage</span><strong>{hasTradableSymbols && constituents.length ? `${Math.round((quoteCount / constituents.length) * 100)}%` : data?.membershipCoverage ?? "—"}</strong></div>
            <div><span>{hasTradableSymbols ? "Combined market cap" : "Component data"}</span><strong>{hasTradableSymbols ? marketCap(totalMarketCap || null) : "Company · sector · country"}</strong></div>
            <div><span>{hasTradableSymbols ? "Largest sector" : "Top-component sector"}</span><strong>{largestSector ? largestSector[0] : "—"}</strong></div>
          </div>
        </div>

        <div className="constituent-toolbar">
          <div className="constituent-search">
            <Icon icon={Search01Icon} size={17} />
            <input aria-label="Search constituents" onChange={(event) => { setQuery(event.target.value); setVisibleCount(50); }} placeholder={hasTradableSymbols ? "Search ticker, company, sector…" : "Search company, sector, country…"} type="search" value={query} />
            {query ? <button aria-label="Clear search" onClick={() => { setQuery(""); setVisibleCount(50); }} type="button"><Icon icon={Cancel01Icon} size={14} /></button> : <kbd>⌘K</kbd>}
          </div>
          <label className="filter-select">
            <span className="sr-only">Sector</span>
            <Icon icon={Building03Icon} size={15} />
            <select onChange={(event) => { setSector(event.target.value); setVisibleCount(50); }} value={sector}>
              {sectors.map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="filter-select">
            <span className="sr-only">Sort constituents</span>
            <Icon icon={Sorting01Icon} size={15} />
            <select onChange={(event) => { setSort(event.target.value as SortMode); setVisibleCount(50); }} value={sort}>
              {hasTradableSymbols ? <>
                <option value="size">Largest first</option>
                <option value="gainers">Top gainers</option>
                <option value="laggards">Top laggards</option>
              </> : null}
              <option value="company">Company A–Z</option>
            </select>
          </label>
        </div>

        <div className="constituent-table-wrap">
          {hasTradableSymbols ? <table className="constituent-table">
            <thead><tr><th>#</th><th>Company</th><th>Sector</th><th>Last</th><th>Today</th><th>Market cap</th><th>Relative size</th><th><span className="sr-only">Open details</span></th></tr></thead>
            <tbody>
              {displayed.map((item, index) => {
                const share = totalMarketCap && item.marketCap ? (item.marketCap / totalMarketCap) * 100 : null;
                const positive = item.changePercent != null && item.changePercent >= 0;
                return (
                  <tr key={item.symbol}>
                    <td>{index + 1}</td>
                    <td>
                      {item.dataSymbol ? <button className="company-cell" onClick={() => setSelected(item as Constituent & { dataSymbol: string })} type="button">
                        <span className="ticker-avatar">{item.symbol.slice(0, 2)}</span>
                        <span><strong>{item.symbol}</strong><small>{item.name}</small></span>
                      </button> : null}
                    </td>
                    <td><span className="sector-chip">{item.sector || "Unclassified"}</span></td>
                    <td>{money(item.lastPrice)}</td>
                    <td><span className={item.changePercent == null ? "" : positive ? "positive-cell" : "negative-cell"}>{item.changePercent == null ? null : <Icon icon={positive ? ArrowUp01Icon : ArrowDown01Icon} size={12} />}{percent(item.changePercent)}</span></td>
                    <td>{marketCap(item.marketCap)}</td>
                    <td><span className="size-cell"><i><b style={{ width: `${Math.min(100, (share ?? 0) * 11)}%` }} /></i>{share == null ? "—" : `${share.toFixed(2)}%`}</span></td>
                    <td>{item.dataSymbol ? <button className="row-open" onClick={() => setSelected(item as Constituent & { dataSymbol: string })} aria-label={`Open ${item.name} details`} type="button"><Icon icon={ChartBreakoutCircleIcon} size={17} /></button> : null}</td>
                  </tr>
                );
              })}
              {!loading && !displayed.length ? <tr><td className="no-rows" colSpan={8}><div className="empty-state"><Icon icon={Search01Icon} size={22} /><strong>No constituents found</strong><span>Try another ticker, company, or sector.</span></div></td></tr> : null}
            </tbody>
          </table> : <table className="constituent-table is-reference-only">
            <thead><tr><th>#</th><th>Company</th><th>Supersector</th><th>Country</th><th>STOXX reference</th></tr></thead>
            <tbody>
              {displayed.map((item, index) => (
                <tr key={item.symbol}>
                  <td>{index + 1}</td>
                  <td><div className="company-cell is-static"><span className="ticker-avatar">{item.name.slice(0, 2).toUpperCase()}</span><span><strong>{item.name}</strong><small>Current top component</small></span></div></td>
                  <td><span className="sector-chip">{item.sector || "Unclassified"}</span></td>
                  <td>{item.industry || "—"}</td>
                  <td><code className="stoxx-reference">{item.symbol.slice(3)}</code></td>
                </tr>
              ))}
              {!loading && !displayed.length ? <tr><td className="no-rows" colSpan={5}><div className="empty-state"><Icon icon={Search01Icon} size={22} /><strong>No components found</strong><span>Try another company, sector, or country.</span></div></td></tr> : null}
            </tbody>
          </table>}
        </div>

        <div className="index-table-footer">
          <span>Showing {Math.min(displayed.length, filtered.length)} of {filtered.length} · updated {asOf}</span>
          {displayed.length < filtered.length ? <button onClick={() => setVisibleCount((count) => count + 50)} type="button">Show 50 more <Icon icon={ArrowDown01Icon} size={14} /></button> : null}
        </div>
        <div className="index-source-note"><Icon icon={InformationCircleIcon} size={14} /> Membership: {data?.sources.membership ?? "public constituent tables"}. {hasTradableSymbols ? <>Prices: {data?.sources.snapshot ?? "market snapshot"}. Relative size is market-cap share of the available snapshot, not official index weight.</> : <>STOXX&apos;s public page exposes the current top components and internal reference keys, not the licensed full component file or exchange tickers; ticker details are intentionally disabled.</>}</div>
      </section>

      {selected ? <DetailDrawer constituent={selected} onClose={() => setSelected(null)} onOpenDataset={onOpenDataset} /> : null}
    </div>
  );
}
