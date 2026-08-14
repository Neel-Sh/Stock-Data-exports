"use client";

import {
  Activity01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  ArrowUp01Icon,
  Calendar03Icon,
  Cancel01Icon,
  ChartLineData01Icon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  Csv01Icon,
  Database01Icon,
  Download04Icon,
  FileExportIcon,
  InformationCircleIcon,
  LayoutTable02Icon,
  Moon02Icon,
  PlusSignIcon,
  Search01Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import IndexExplorer from "./IndexExplorer";
import ResearchFactors from "./ResearchFactors";
import BatchResearch from "./BatchResearch";

type IconData = Parameters<typeof HugeiconsIcon>[0]["icon"];

type MarketPoint = {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  adjClose: number | null;
  volume: number | null;
  simpleReturn: number | null;
  logReturn: number | null;
  cumulativeReturn: number | null;
};

type CorporateAction = {
  date: string;
  type: "dividend" | "split";
  amount: number | null;
  numerator: number | null;
  denominator: number | null;
  ratio: string | null;
};

type DataQuality = {
  missingValues: number;
  completeRows: number;
  coverageStart: string;
  coverageEnd: string;
};

type MarketSeries = {
  symbol: string;
  name: string;
  currency: string;
  exchange: string;
  points: MarketPoint[];
  actions: CorporateAction[];
  quality: DataQuality;
};

type MarketResponse = {
  series: MarketSeries[];
  requestedAt: string;
  source: string;
  interval: Interval;
  warnings: string[];
};

type Interval = "1d" | "1wk" | "1mo";
type Range = "1Y" | "5Y" | "10Y" | "MAX" | "CUSTOM";
type ChartMode = "indexed" | "price";
type DataView = "chart" | "prices" | "returns" | "events";
type Workspace = "dataset" | "factors" | "batch" | "indices";

type Security = { symbol: string; name: string; kind: string };

const SECURITIES: Security[] = [
  { symbol: "^GSPC", name: "S&P 500", kind: "Index" },
  { symbol: "SPY", name: "SPDR S&P 500 ETF", kind: "ETF" },
  { symbol: "^IXIC", name: "Nasdaq Composite", kind: "Index" },
  { symbol: "^NDX", name: "Nasdaq-100", kind: "Index" },
  { symbol: "^DJI", name: "Dow Jones Industrial Average", kind: "Index" },
  { symbol: "^RUT", name: "Russell 2000", kind: "Index" },
  { symbol: "QQQ", name: "Invesco QQQ", kind: "ETF" },
  { symbol: "VTI", name: "Vanguard Total Stock Market", kind: "ETF" },
  { symbol: "^VIX", name: "CBOE Volatility Index", kind: "Index" },
  { symbol: "AAPL", name: "Apple", kind: "Equity" },
  { symbol: "MSFT", name: "Microsoft", kind: "Equity" },
  { symbol: "NVDA", name: "NVIDIA", kind: "Equity" },
  { symbol: "AMZN", name: "Amazon", kind: "Equity" },
  { symbol: "GOOGL", name: "Alphabet", kind: "Equity" },
  { symbol: "META", name: "Meta Platforms", kind: "Equity" },
  { symbol: "TSLA", name: "Tesla", kind: "Equity" },
  { symbol: "BRK-B", name: "Berkshire Hathaway", kind: "Equity" },
  { symbol: "EURUSD=X", name: "EUR / USD", kind: "Currency" },
];

const SERIES_COLORS = ["#75db83", "#f5f5f2", "#8ba6ff", "#f2b45f", "#c493ff"];
const RANGE_OPTIONS: Range[] = ["1Y", "5Y", "10Y", "MAX"];
const INTERVALS: { value: Interval; label: string }[] = [
  { value: "1d", label: "Daily" },
  { value: "1wk", label: "Weekly" },
  { value: "1mo", label: "Monthly" },
];

const QUICK_SETS = [
  { label: "S&P 500", symbols: ["^GSPC"] },
  { label: "US indices", symbols: ["^GSPC", "^IXIC", "^DJI", "^RUT"] },
  { label: "Mega cap", symbols: ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL"] },
  { label: "Market ETFs", symbols: ["SPY", "QQQ", "VTI"] },
];

const DATASET_COLUMNS = [
  "symbol",
  "security_name",
  "date",
  "open",
  "high",
  "low",
  "close",
  "adjusted_close",
  "simple_return",
  "log_return",
  "cumulative_return",
  "volume",
  "currency",
  "exchange",
  "frequency",
  "source",
  "requested_start",
  "requested_end",
  "downloaded_at",
];

const RETURNS_COLUMNS = ["symbol", "security_name", "date", "adjusted_close", "simple_return", "log_return", "cumulative_return", "frequency", "source"];
const ACTIONS_COLUMNS = ["symbol", "security_name", "date", "event_type", "amount", "split_numerator", "split_denominator", "split_ratio", "currency", "source"];

function Icon({ icon, size = 18 }: { icon: IconData; size?: number }) {
  return <HugeiconsIcon aria-hidden="true" icon={icon} size={size} strokeWidth={1.6} />;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function rangeDates(range: Range) {
  const end = new Date();
  const start = new Date(end);
  if (range === "1Y") start.setFullYear(start.getFullYear() - 1);
  if (range === "5Y") start.setFullYear(start.getFullYear() - 5);
  if (range === "10Y") start.setFullYear(start.getFullYear() - 10);
  if (range === "MAX") start.setFullYear(1980, 0, 1);
  return { start: isoDate(start), end: isoDate(end) };
}

function compactNumber(value: number | null, digits = 2) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
}

function currencyNumber(value: number | null, currency = "USD") {
  if (value == null || !Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: value > 100 ? 2 : 3,
    }).format(value);
  } catch {
    return compactNumber(value);
  }
}

function percentage(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function unsignedPercentage(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(2)}%`;
}

function intervalName(interval: Interval) {
  return INTERVALS.find((item) => item.value === interval)?.label ?? interval;
}

function escapeCsv(value: string | number | null) {
  const raw = value == null ? "" : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}

function buildDatasetRows(data: MarketResponse, start: string, end: string) {
  return data.series.flatMap((series) =>
    series.points.map((point) => [
      series.symbol,
      series.name,
      point.date,
      point.open,
      point.high,
      point.low,
      point.close,
      point.adjClose,
      point.simpleReturn,
      point.logReturn,
      point.cumulativeReturn,
      point.volume,
      series.currency,
      series.exchange,
      intervalName(data.interval),
      data.source,
      start,
      end,
      data.requestedAt,
    ]),
  );
}

function buildCsv(data: MarketResponse, start: string, end: string) {
  return [DATASET_COLUMNS, ...buildDatasetRows(data, start, end)].map((row) => row.map(escapeCsv).join(",")).join("\n");
}

function buildReturnRows(data: MarketResponse) {
  return data.series.flatMap((series) => series.points.map((point) => [
    series.symbol,
    series.name,
    point.date,
    point.adjClose,
    point.simpleReturn,
    point.logReturn,
    point.cumulativeReturn,
    intervalName(data.interval),
    data.source,
  ]));
}

function buildActionRows(data: MarketResponse) {
  return data.series.flatMap((series) => (series.actions ?? []).map((action) => [
    series.symbol,
    series.name,
    action.date,
    action.type,
    action.amount,
    action.numerator,
    action.denominator,
    action.ratio,
    series.currency,
    data.source,
  ]));
}

function rowsToCsv(columns: string[], rows: Array<Array<string | number | null>>) {
  return [columns, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");
}

function annualizedStats(series: MarketSeries | null, interval: Interval) {
  if (!series) return { annualizedReturn: null, volatility: null, maxDrawdown: null };
  const prices = series.points.flatMap((point) => point.adjClose != null ? [point.adjClose] : []);
  const returns = series.points.flatMap((point) => point.simpleReturn != null ? [point.simpleReturn] : []);
  const periodsPerYear = interval === "1d" ? 252 : interval === "1wk" ? 52 : 12;
  const first = prices[0];
  const last = prices.at(-1);
  const annualizedReturn = first && last && returns.length
    ? (Math.pow(last / first, periodsPerYear / returns.length) - 1) * 100
    : null;
  const mean = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0;
  const variance = returns.length > 1
    ? returns.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / (returns.length - 1)
    : 0;
  const volatility = returns.length > 1 ? Math.sqrt(variance) * Math.sqrt(periodsPerYear) * 100 : null;
  let peak = -Infinity;
  let maxDrawdown = 0;
  for (const price of prices) {
    peak = Math.max(peak, price);
    if (peak > 0) maxDrawdown = Math.min(maxDrawdown, price / peak - 1);
  }
  return { annualizedReturn, volatility, maxDrawdown: prices.length ? maxDrawdown * 100 : null };
}

function downloadText(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function nearestPoint(points: MarketPoint[], target: number) {
  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const time = new Date(points[mid].date).getTime();
    if (time < target) low = mid + 1;
    else high = mid;
  }
  const before = points[Math.max(0, low - 1)];
  const after = points[low];
  if (!before) return after;
  if (!after) return before;
  return Math.abs(new Date(before.date).getTime() - target) < Math.abs(new Date(after.date).getTime() - target)
    ? before
    : after;
}

function MarketChart({ series, mode }: { series: MarketSeries[]; mode: ChartMode }) {
  const [hoverFraction, setHoverFraction] = useState<number | null>(null);
  const width = 1120;
  const height = 400;
  const padding = { top: 26, right: 58, bottom: 44, left: 18 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const chart = useMemo(() => {
    const usable = series
      .map((item) => ({ ...item, points: item.points.filter((point) => point.adjClose != null) }))
      .filter((item) => item.points.length > 1);
    const times = usable.flatMap((item) => item.points.map((point) => new Date(point.date).getTime()));
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const normalized = usable.map((item) => {
      const base = item.points[0]?.adjClose ?? 1;
      return {
        ...item,
        values: item.points.map((point) => ({
          ...point,
          value: mode === "indexed" ? ((point.adjClose ?? base) / base) * 100 : (point.adjClose ?? 0),
        })),
      };
    });
    const values = normalized.flatMap((item) => item.values.map((point) => point.value));
    let minValue = Math.min(...values);
    let maxValue = Math.max(...values);
    const buffer = (maxValue - minValue || 1) * 0.08;
    minValue -= buffer;
    maxValue += buffer;
    return { normalized, minTime, maxTime, minValue, maxValue };
  }, [series, mode]);

  if (!chart.normalized.length) return <div className="chart-empty">No chartable observations.</div>;

  const x = (date: string) => {
    const span = chart.maxTime - chart.minTime || 1;
    return padding.left + ((new Date(date).getTime() - chart.minTime) / span) * plotWidth;
  };
  const y = (value: number) => padding.top + (1 - (value - chart.minValue) / (chart.maxValue - chart.minValue || 1)) * plotHeight;
  const yTicks = Array.from({ length: 5 }, (_, index) => chart.minValue + ((chart.maxValue - chart.minValue) * index) / 4);
  const xTicks = Array.from({ length: 6 }, (_, index) => chart.minTime + ((chart.maxTime - chart.minTime) * index) / 5);
  const hoverTime = hoverFraction == null ? null : chart.minTime + hoverFraction * (chart.maxTime - chart.minTime);
  const hovered = hoverTime == null
    ? []
    : chart.normalized.map((item) => ({ item, point: nearestPoint(item.points, hoverTime) }));

  const onMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const cursor = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    setHoverFraction(cursor / rect.width);
  };

  return (
    <div
      className="chart-wrap"
      onMouseLeave={() => setHoverFraction(null)}
      onMouseMove={onMouseMove}
      role="img"
      aria-label={`${mode === "indexed" ? "Indexed performance" : "Adjusted price"} chart for ${series.map((item) => item.name).join(", ")}`}
    >
      <svg className="market-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="area-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#75db83" stopOpacity=".19" />
            <stop offset="1" stopColor="#75db83" stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.map((tick) => (
          <g key={tick}>
            <line className="chart-grid" x1={padding.left} x2={width - padding.right} y1={y(tick)} y2={y(tick)} />
            <text className="chart-axis" x={width - padding.right + 12} y={y(tick) + 4}>
              {mode === "indexed" ? tick.toFixed(0) : compactNumber(tick, tick < 10 ? 2 : 0)}
            </text>
          </g>
        ))}
        {xTicks.map((tick) => (
          <text className="chart-axis chart-axis-x" key={tick} x={padding.left + ((tick - chart.minTime) / (chart.maxTime - chart.minTime || 1)) * plotWidth} y={height - 10}>
            {new Date(tick).getFullYear()}
          </text>
        ))}
        {chart.normalized.map((item, index) => {
          const path = item.values.map((point, pointIndex) => `${pointIndex ? "L" : "M"}${x(point.date).toFixed(2)},${y(point.value).toFixed(2)}`).join(" ");
          const area = index === 0 ? `${path} L${x(item.values.at(-1)!.date)},${padding.top + plotHeight} L${x(item.values[0].date)},${padding.top + plotHeight} Z` : null;
          return (
            <g key={item.symbol}>
              {area ? <path d={area} fill="url(#area-fill)" /> : null}
              <path className="chart-line" d={path} fill="none" stroke={SERIES_COLORS[index % SERIES_COLORS.length]} strokeWidth={index === 0 ? 2.2 : 1.7} vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
        {hoverFraction != null ? (
          <line className="chart-crosshair" x1={padding.left + hoverFraction * plotWidth} x2={padding.left + hoverFraction * plotWidth} y1={padding.top} y2={padding.top + plotHeight} />
        ) : null}
      </svg>
      {hoverFraction != null && hovered.length ? (
        <div className={`chart-tooltip ${hoverFraction > 0.68 ? "is-left" : ""}`} style={{ left: `${Math.min(94, Math.max(6, hoverFraction * 100))}%` }}>
          <time>{hovered[0].point.date}</time>
          {hovered.map(({ item, point }, index) => {
            const base = item.points.find((candidate) => candidate.adjClose != null)?.adjClose ?? 1;
            const value = mode === "indexed" ? ((point.adjClose ?? base) / base) * 100 : point.adjClose;
            return (
              <div className="tooltip-row" key={item.symbol}>
                <span><i style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }} />{item.symbol}</span>
                <strong>{mode === "indexed" ? compactNumber(value) : currencyNumber(value, item.currency)}</strong>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong className={tone ? `is-${tone}` : ""}>{value}</strong>
    </div>
  );
}

export default function Home() {
  const initialDates = useRef(rangeDates("10Y"));
  const [workspace, setWorkspace] = useState<Workspace>("dataset");
  const [symbols, setSymbols] = useState(["^GSPC"]);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [range, setRange] = useState<Range>("10Y");
  const [start, setStart] = useState(initialDates.current.start);
  const [end, setEnd] = useState(initialDates.current.end);
  const [interval, setInterval] = useState<Interval>("1d");
  const [data, setData] = useState<MarketResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ChartMode>("indexed");
  const [exportOpen, setExportOpen] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dark, setDark] = useState(true);
  const [tableExpanded, setTableExpanded] = useState(false);
  const [activeView, setActiveView] = useState<DataView>("chart");
  const didInitialLoad = useRef(false);
  const methodModalRef = useRef<HTMLElement>(null);
  const modalCloseRef = useRef<HTMLButtonElement>(null);
  const symbolInputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return SECURITIES.filter((item) => !symbols.includes(item.symbol) && (!normalized || item.symbol.toLowerCase().includes(normalized) || item.name.toLowerCase().includes(normalized))).slice(0, 6);
  }, [query, symbols]);

  const requestData = useCallback(async (requestSymbols: string[], requestStart: string, requestEnd: string, requestInterval: Interval) => {
    if (!requestSymbols.length) return;
    setLoading(true);
    setError(null);
    setExportOpen(false);
    try {
      const params = new URLSearchParams({ symbols: requestSymbols.join(","), start: requestStart, end: requestEnd, interval: requestInterval });
      const response = await fetch(`/api/history?${params}`);
      const result = (await response.json()) as MarketResponse & { error?: string };
      if (!response.ok) throw new Error(result.error || "The market data service did not respond.");
      setData(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not load the data.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    await requestData(symbols, start, end, interval);
  }, [requestData, symbols, start, end, interval]);

  useEffect(() => {
    if (didInitialLoad.current) return;
    didInitialLoad.current = true;
    void loadData();
  }, [loadData]); // Load the default research view once; later changes are user-submitted.

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        symbolInputRef.current?.focus();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", handleShortcut);
    return () => document.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (!methodOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalCloseRef.current?.focus();
    const handleModalKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMethodOpen(false);
      if (event.key !== "Tab") return;
      const controls = methodModalRef.current?.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleModalKeys);
    return () => {
      document.removeEventListener("keydown", handleModalKeys);
      previousFocus?.focus();
    };
  }, [methodOpen]);

  const primary = data?.series[0] ?? null;
  const firstPoint = primary?.points.find((point) => point.adjClose != null) ?? null;
  const lastPoint = primary?.points.findLast((point) => point.adjClose != null) ?? null;
  const returnValue = firstPoint?.adjClose && lastPoint?.adjClose ? ((lastPoint.adjClose / firstPoint.adjClose) - 1) * 100 : null;
  const totalRows = data?.series.reduce((sum, series) => sum + series.points.length, 0) ?? 0;
  const totalActions = data?.series.reduce((sum, series) => sum + (series.actions?.length ?? 0), 0) ?? 0;
  const totalMissing = data?.series.reduce((sum, series) => sum + (series.quality?.missingValues ?? 0), 0) ?? 0;
  const completeness = totalRows ? ((totalRows * 6 - totalMissing) / (totalRows * 6)) * 100 : null;
  const stats = useMemo(() => annualizedStats(primary, interval), [primary, interval]);
  const tableRows = useMemo(() => {
    if (!data) return [];
    return data.series
      .flatMap((series) => series.points.map((point) => ({ series, point })))
      .sort((a, b) => b.point.date.localeCompare(a.point.date) || a.series.symbol.localeCompare(b.series.symbol));
  }, [data]);
  const displayedRows = tableExpanded ? tableRows.slice(0, 100) : tableRows.slice(0, 18);
  const actionRows = useMemo(() => {
    if (!data) return [];
    return data.series
      .flatMap((series) => (series.actions ?? []).map((action) => ({ series, action })))
      .sort((a, b) => b.action.date.localeCompare(a.action.date));
  }, [data]);

  function setPreset(nextRange: Range) {
    const dates = rangeDates(nextRange);
    setRange(nextRange);
    setStart(dates.start);
    setEnd(dates.end);
  }

  function resetQuery() {
    const dates = rangeDates("10Y");
    setSymbols(["^GSPC"]);
    setQuery("");
    setRange("10Y");
    setStart(dates.start);
    setEnd(dates.end);
    setInterval("1d");
    setMode("indexed");
    setActiveView("chart");
  }

  function chooseWorkspace(nextWorkspace: Workspace) {
    setWorkspace(nextWorkspace);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  }

  function openConstituentInDataset(symbol: string) {
    const dates = rangeDates("1Y");
    setSymbols([symbol]);
    setQuery("");
    setRange("1Y");
    setStart(dates.start);
    setEnd(dates.end);
    setInterval("1d");
    setMode("indexed");
    setActiveView("chart");
    chooseWorkspace("dataset");
    void requestData([symbol], dates.start, dates.end, "1d");
  }

  function applyQuickSet(nextSymbols: string[]) {
    setSymbols(nextSymbols);
    setQuery("");
    setSearchOpen(false);
    setMode("indexed");
    setActiveView("chart");
  }

  function addSymbol(symbol: string) {
    const cleaned = symbol.trim().toUpperCase();
    if (!cleaned || symbols.includes(cleaned) || symbols.length >= 5) return;
    if (!/^[A-Z0-9^=.-]{1,16}$/.test(cleaned)) return;
    setSymbols((current) => [...current, cleaned]);
    setQuery("");
    setSearchOpen(false);
    if (symbols.length >= 1) setMode("indexed");
  }

  function removeSymbol(symbol: string) {
    if (symbols.length === 1) return;
    setSymbols((current) => current.filter((item) => item !== symbol));
  }

  function fileStem() {
    return `tape_${symbols.map((symbol) => symbol.replace(/[^a-z0-9]/gi, "")).join("_")}_${start}_${end}_${interval}`;
  }

  function exportCsv() {
    if (!data) return;
    downloadText(`\ufeff${buildCsv(data, start, end)}`, `${fileStem()}.csv`, "text/csv;charset=utf-8");
    setExportOpen(false);
  }

  function exportReturnsCsv() {
    if (!data) return;
    downloadText(`\ufeff${rowsToCsv(RETURNS_COLUMNS, buildReturnRows(data))}`, `${fileStem()}_returns.csv`, "text/csv;charset=utf-8");
    setExportOpen(false);
  }

  function exportActionsCsv() {
    if (!data || !totalActions) return;
    downloadText(`\ufeff${rowsToCsv(ACTIONS_COLUMNS, buildActionRows(data))}`, `${fileStem()}_events.csv`, "text/csv;charset=utf-8");
    setExportOpen(false);
  }

  function exportJson() {
    if (!data) return;
    downloadText(JSON.stringify({ query: { symbols, start, end, interval }, ...data }, null, 2), `${fileStem()}.json`, "application/json;charset=utf-8");
    setExportOpen(false);
  }

  async function copyForSheets() {
    if (!data) return;
    const tabular = [DATASET_COLUMNS, ...buildDatasetRows(data, start, end)]
      .map((row) => row.map((value) => String(value ?? "").replaceAll("\t", " ").replaceAll("\n", " ")).join("\t"))
      .join("\n");
    await navigator.clipboard.writeText(tabular);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
    setExportOpen(false);
  }

  return (
    <main className="app-shell">
      <aside className="app-sidebar">
        <div>
          <div className="brand" aria-label="Tape">
            <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
            <span>Tape</span>
          </div>
          <nav className="side-nav" aria-label="Application">
            <button className={workspace === "dataset" ? "is-active" : ""} onClick={() => chooseWorkspace("dataset")} type="button"><Icon icon={Database01Icon} size={17} /> Dataset</button>
            <button className={workspace === "factors" ? "is-active" : ""} onClick={() => chooseWorkspace("factors")} type="button"><Icon icon={Activity01Icon} size={17} /> Factors</button>
            <button className={workspace === "batch" ? "is-active" : ""} onClick={() => chooseWorkspace("batch")} type="button"><Icon icon={LayoutTable02Icon} size={17} /> 1500 engine</button>
            <button className={workspace === "indices" ? "is-active" : ""} onClick={() => chooseWorkspace("indices")} type="button"><Icon icon={ChartLineData01Icon} size={17} /> Indices</button>
            <button onClick={() => setMethodOpen(true)} type="button"><Icon icon={InformationCircleIcon} size={17} /> Methodology</button>
          </nav>
        </div>
        <div className="source-status">
          <span className="status-dot" />
          <div><span>Source</span><strong>{workspace === "dataset" ? "Yahoo Finance" : workspace === "factors" ? "3-source model" : workspace === "batch" ? "Yahoo + French" : "Public markets"}</strong></div>
        </div>
      </aside>

      <section className="app-content">
        <header className="app-topbar">
          <div>
            <h1>{workspace === "dataset" ? "Market data" : workspace === "factors" ? "Research factors" : workspace === "batch" ? "S&P 1500 engine" : "Index explorer"}</h1>
            <p>{workspace === "dataset" ? <>{symbols.join(" · ")} <span /> {start}—{end}</> : workspace === "factors" ? <>Monthly predictors <span /> filings · benchmarks</> : workspace === "batch" ? <>Full cross-section <span /> panel · sorts · HAC</> : <>Constituents <span /> breadth · sectors · performance</>}</p>
          </div>
          <div className="topbar-actions">
            {workspace === "dataset" ? <button className="command-search" onClick={() => { symbolInputRef.current?.focus(); setSearchOpen(true); }} type="button">
              <Icon icon={Search01Icon} size={15} /><span>Add security</span><kbd>⌘K</kbd>
            </button> : null}
            <button className="icon-button" onClick={() => setDark((value) => !value)} aria-label={`Switch to ${dark ? "light" : "dark"} mode`} type="button">
              <Icon icon={dark ? Sun03Icon : Moon02Icon} />
            </button>
          </div>
        </header>

        {workspace === "dataset" ? <div className="dashboard-grid">
          <aside className="query-panel">
            <div className="panel-heading">
              <h2>Query</h2>
              <button className="text-button" onClick={resetQuery} type="button">Reset</button>
            </div>

            <form className="builder" onSubmit={(event) => { event.preventDefault(); void loadData(); }}>
              <div className="field field-security">
                <label htmlFor="symbol-search">Securities <span>{symbols.length}/5</span></label>
                <div className="symbol-box" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setSearchOpen(false); }}>
                  {symbols.map((symbol) => (
                    <span className="symbol-chip" key={symbol}>
                      {symbol}
                      {symbols.length > 1 ? <button type="button" onClick={() => removeSymbol(symbol)} aria-label={`Remove ${symbol}`}><Icon icon={Cancel01Icon} size={13} /></button> : null}
                    </span>
                  ))}
                  {symbols.length < 5 ? (
                    <div className="symbol-search-wrap">
                      <Icon icon={Search01Icon} size={16} />
                      <input
                        id="symbol-search"
                        ref={symbolInputRef}
                        autoComplete="off"
                        value={query}
                        onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }}
                        onFocus={() => setSearchOpen(true)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && query.trim()) {
                            event.preventDefault();
                            addSymbol(suggestions[0]?.symbol ?? query);
                          }
                          if (event.key === "Escape") setSearchOpen(false);
                        }}
                        placeholder="Add ticker"
                      />
                    </div>
                  ) : null}
                  {searchOpen && symbols.length < 5 ? (
                    <div className="suggestions" role="listbox" aria-label="Security suggestions">
                      {suggestions.map((item) => (
                        <button aria-selected="false" key={item.symbol} onClick={() => addSymbol(item.symbol)} role="option" type="button">
                          <span><strong>{item.symbol}</strong><small>{item.name}</small></span>
                          <span className="suggestion-kind">{item.kind}</span>
                        </button>
                      ))}
                      {query.trim() && !suggestions.some((item) => item.symbol.toLowerCase() === query.trim().toLowerCase()) ? (
                        <button aria-selected="false" onClick={() => addSymbol(query)} role="option" type="button">
                          <span><strong>{query.trim().toUpperCase()}</strong><small>Exact ticker</small></span>
                          <Icon icon={PlusSignIcon} size={16} />
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="quick-sets" aria-label="Quick sets">
                  {QUICK_SETS.map((set) => <button key={set.label} onClick={() => applyQuickSet(set.symbols)} type="button">{set.label}</button>)}
                </div>
              </div>

              <div className="field field-range">
                <span className="field-label">Range</span>
                <div className="segmented" aria-label="Date range">
                  {RANGE_OPTIONS.map((option) => <button aria-pressed={range === option} className={range === option ? "is-active" : ""} key={option} onClick={() => setPreset(option)} type="button">{option}</button>)}
                </div>
              </div>

              <div className="date-grid">
                <div className="field field-dates">
                  <label htmlFor="start-date">From</label>
                  <div className="date-input"><Icon icon={Calendar03Icon} size={15} /><input id="start-date" max={end} onChange={(event) => { setStart(event.target.value); setRange("CUSTOM"); }} type="date" value={start} /></div>
                </div>
                <div className="field field-dates">
                  <label htmlFor="end-date">To</label>
                  <div className="date-input"><Icon icon={Calendar03Icon} size={15} /><input id="end-date" min={start} onChange={(event) => { setEnd(event.target.value); setRange("CUSTOM"); }} type="date" value={end} /></div>
                </div>
              </div>

              <div className="field field-frequency">
                <span className="field-label">Frequency</span>
                <div className="segmented" aria-label="Frequency">
                  {INTERVALS.map((option) => <button aria-pressed={interval === option.value} className={interval === option.value ? "is-active" : ""} key={option.value} onClick={() => setInterval(option.value)} type="button">{option.label}</button>)}
                </div>
              </div>

              <button className="primary-button" disabled={loading || !symbols.length} type="submit">
                {loading ? <><span className="mini-orbit" /> Fetching</> : <>Run query <Icon icon={ArrowRight01Icon} size={17} /></>}
              </button>
            </form>
            <div className="query-meta"><Icon icon={CheckmarkCircle02Icon} size={15} /> Prices, returns, events</div>
          </aside>

          <section className="workspace-panel">
            {error ? (
              <div className="error-state">
                <Icon icon={InformationCircleIcon} size={20} />
                <div><strong>Couldn&apos;t load data</strong><p>{error}</p></div>
                <button onClick={() => void loadData()} type="button">Retry</button>
              </div>
            ) : null}

            <div className={`results ${loading ? "is-loading" : ""}`} aria-busy={loading}>
              {loading ? <div className="loading-layer"><span className="thinking-orb"><i /><i /><i /><i /><i /><i /><i /><i /></span><strong>Fetching data</strong></div> : null}
              <div className="results-header">
                <div>
                  <div className="title-line"><h2>{primary?.name ?? "Market history"}</h2>{primary ? <span>{primary.exchange}</span> : null}</div>
                  <p>{data?.series.map((item) => item.symbol).join(" · ") || symbols.join(" · ")} · {intervalName(interval)} · adjusted</p>
                </div>
                <div className="result-actions">
                  <div className="data-tabs" aria-label="Data view">
                    <button aria-pressed={activeView === "chart"} className={activeView === "chart" ? "is-active" : ""} onClick={() => setActiveView("chart")} type="button"><Icon icon={ChartLineData01Icon} size={15} /> Chart</button>
                    <button aria-pressed={activeView === "prices"} className={activeView === "prices" ? "is-active" : ""} onClick={() => setActiveView("prices")} type="button"><Icon icon={LayoutTable02Icon} size={15} /> Prices</button>
                    <button aria-pressed={activeView === "returns"} className={activeView === "returns" ? "is-active" : ""} onClick={() => setActiveView("returns")} type="button"><Icon icon={Activity01Icon} size={15} /> Returns</button>
                    <button aria-pressed={activeView === "events"} className={activeView === "events" ? "is-active" : ""} onClick={() => setActiveView("events")} type="button"><Icon icon={Calendar03Icon} size={15} /> Events{totalActions ? <em>{totalActions}</em> : null}</button>
                  </div>
                  <div className="export-wrap">
                    <button className="export-button" disabled={!data || loading} onClick={() => setExportOpen((value) => !value)} type="button"><Icon icon={Download04Icon} size={17} /> Export <Icon icon={ArrowDown01Icon} size={14} /></button>
                    {exportOpen ? (
                      <div className="export-menu">
                        <span>Export dataset</span>
                        <button onClick={exportCsv} type="button"><Icon icon={Csv01Icon} /><span><strong>Prices + returns CSV</strong><small>{totalRows.toLocaleString()} rows</small></span></button>
                        <button onClick={exportReturnsCsv} type="button"><Icon icon={Activity01Icon} /><span><strong>Returns CSV</strong><small>Simple, log, cumulative</small></span></button>
                        <button disabled={!totalActions} onClick={exportActionsCsv} type="button"><Icon icon={Calendar03Icon} /><span><strong>Corporate events CSV</strong><small>{totalActions ? `${totalActions} events` : "No events in range"}</small></span></button>
                        <button onClick={() => void copyForSheets()} type="button"><Icon icon={Copy01Icon} /><span><strong>Copy for Sheets</strong><small>Paste at A1</small></span></button>
                        <button onClick={exportJson} type="button"><Icon icon={FileExportIcon} /><span><strong>Download JSON</strong><small>Full structured response</small></span></button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="metrics-strip">
                <Metric label="Adjusted close" value={currencyNumber(lastPoint?.adjClose ?? null, primary?.currency)} />
                <Metric label="Total return" value={percentage(returnValue)} tone={returnValue == null ? undefined : returnValue >= 0 ? "positive" : "negative"} />
                <Metric label="Annualized" value={percentage(stats.annualizedReturn)} tone={stats.annualizedReturn == null ? undefined : stats.annualizedReturn >= 0 ? "positive" : "negative"} />
                <Metric label="Volatility" value={unsignedPercentage(stats.volatility)} />
                <Metric label="Max drawdown" value={percentage(stats.maxDrawdown)} tone="negative" />
              </div>

              <div className="quality-strip">
                <span><i className={totalMissing ? "has-warning" : ""} /> {completeness == null ? "—" : `${completeness.toFixed(2)}%`} complete</span>
                <span>{totalRows.toLocaleString()} rows</span>
                <span>{totalActions.toLocaleString()} events</span>
                <span>{firstPoint && lastPoint ? `${firstPoint.date}—${lastPoint.date}` : "No coverage"}</span>
              </div>

              {data?.warnings?.length ? <div className="warning-strip"><Icon icon={InformationCircleIcon} size={15} /> {data.warnings.join(" ")}</div> : null}

              {activeView === "chart" ? (
                <div className="chart-view">
                  <div className="view-toolbar">
                    <span>Performance</span>
                    <div className="segmented compact" aria-label="Chart mode">
                      <button aria-pressed={mode === "indexed"} className={mode === "indexed" ? "is-active" : ""} onClick={() => setMode("indexed")} type="button">Indexed</button>
                      <button aria-pressed={mode === "price"} className={mode === "price" ? "is-active" : ""} onClick={() => setMode("price")} type="button">Price</button>
                    </div>
                  </div>
                  {data ? <MarketChart series={data.series} mode={mode} /> : <div className="chart-placeholder" />}
                  {data && data.series.length > 1 ? (
                    <div className="legend">
                      {data.series.map((item, index) => <span key={item.symbol}><i style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }} />{item.symbol}<small>{item.name}</small></span>)}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {activeView === "prices" ? (
                <div className="table-view">
                  <div className="table-scroll">
                    <table>
                      <thead><tr><th>Symbol</th><th>Date</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Adj. close</th><th>Return</th><th>Volume</th></tr></thead>
                      <tbody>
                        {displayedRows.map(({ series, point }) => {
                          const positive = point.open != null && point.close != null ? point.close >= point.open : null;
                          return (
                            <tr key={`${series.symbol}-${point.date}`}>
                              <td><strong>{series.symbol}</strong></td>
                              <td>{point.date}</td>
                              <td>{compactNumber(point.open)}</td>
                              <td>{compactNumber(point.high)}</td>
                              <td>{compactNumber(point.low)}</td>
                              <td className={positive == null ? "" : positive ? "positive-cell" : "negative-cell"}>{compactNumber(point.close)} {positive == null ? null : <Icon icon={positive ? ArrowUp01Icon : ArrowDown01Icon} size={12} />}</td>
                              <td>{compactNumber(point.adjClose)}</td>
                              <td className={point.simpleReturn == null ? "" : point.simpleReturn >= 0 ? "positive-text" : "negative-text"}>{point.simpleReturn == null ? "—" : percentage(point.simpleReturn * 100)}</td>
                              <td>{compactNumber(point.volume, 0)}</td>
                            </tr>
                          );
                        })}
                        {!displayedRows.length ? <tr><td className="no-rows" colSpan={9}>No observations</td></tr> : null}
                      </tbody>
                    </table>
                  </div>
                  {tableRows.length > 18 ? <button className="show-rows" onClick={() => setTableExpanded((value) => !value)} type="button">{tableExpanded ? "Show 18 rows" : `Show ${Math.min(100, tableRows.length)} rows`} <Icon icon={tableExpanded ? ArrowUp01Icon : ArrowDown01Icon} size={14} /></button> : null}
                </div>
              ) : null}

              {activeView === "returns" ? (
                <div className="table-view">
                  <div className="table-scroll">
                    <table>
                      <thead><tr><th>Symbol</th><th>Date</th><th>Adjusted close</th><th>Simple return</th><th>Log return</th><th>Cumulative</th></tr></thead>
                      <tbody>
                        {displayedRows.map(({ series, point }) => (
                          <tr key={`${series.symbol}-${point.date}-return`}>
                            <td><strong>{series.symbol}</strong></td>
                            <td>{point.date}</td>
                            <td>{compactNumber(point.adjClose)}</td>
                            <td className={point.simpleReturn == null ? "" : point.simpleReturn >= 0 ? "positive-text" : "negative-text"}>{point.simpleReturn == null ? "—" : percentage(point.simpleReturn * 100)}</td>
                            <td>{point.logReturn == null ? "—" : point.logReturn.toFixed(6)}</td>
                            <td className={point.cumulativeReturn == null ? "" : point.cumulativeReturn >= 0 ? "positive-text" : "negative-text"}>{point.cumulativeReturn == null ? "—" : percentage(point.cumulativeReturn * 100)}</td>
                          </tr>
                        ))}
                        {!displayedRows.length ? <tr><td className="no-rows" colSpan={6}>No returns</td></tr> : null}
                      </tbody>
                    </table>
                  </div>
                  {tableRows.length > 18 ? <button className="show-rows" onClick={() => setTableExpanded((value) => !value)} type="button">{tableExpanded ? "Show 18 rows" : `Show ${Math.min(100, tableRows.length)} rows`} <Icon icon={tableExpanded ? ArrowUp01Icon : ArrowDown01Icon} size={14} /></button> : null}
                </div>
              ) : null}

              {activeView === "events" ? (
                <div className="table-view">
                  <div className="table-scroll">
                    <table>
                      <thead><tr><th>Symbol</th><th>Date</th><th>Event</th><th>Amount</th><th>Split ratio</th><th>Currency</th></tr></thead>
                      <tbody>
                        {actionRows.map(({ series, action }) => (
                          <tr key={`${series.symbol}-${action.date}-${action.type}`}>
                            <td><strong>{series.symbol}</strong></td>
                            <td>{action.date}</td>
                            <td><span className="event-chip">{action.type}</span></td>
                            <td>{action.amount == null ? "—" : compactNumber(action.amount, 4)}</td>
                            <td>{action.ratio ?? "—"}</td>
                            <td>{series.currency}</td>
                          </tr>
                        ))}
                        {!actionRows.length ? <tr><td className="no-rows" colSpan={6}><div className="empty-state"><Icon icon={Calendar03Icon} size={22} /><strong>No corporate events</strong><span>None returned for this range.</span></div></td></tr> : null}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </div> : workspace === "factors" ? <ResearchFactors /> : workspace === "batch" ? <BatchResearch /> : <IndexExplorer onOpenDataset={openConstituentInDataset} />}
      </section>

      {copied ? <div className="toast"><Icon icon={CheckmarkCircle02Icon} size={17} /> Copied. Paste into cell A1.</div> : null}

      {methodOpen ? (
        <div className="modal-backdrop">
          <section aria-labelledby="method-title" aria-modal="true" className="method-modal" ref={methodModalRef} role="dialog">
            <button className="modal-close" onClick={() => setMethodOpen(false)} aria-label="Close methodology" ref={modalCloseRef} type="button"><Icon icon={Cancel01Icon} /></button>
            <span className="modal-kicker">Research</span>
            <h2 id="method-title">Methodology</h2>
            <div className="method-list">
              <div><h3>Source</h3><p>Yahoo Finance. Not a replacement for WRDS, CRSP, or a licensed feed.</p></div>
              <div><h3>Price roles</h3><p>Adjusted close is reserved for returns, MAX, REV, MOM, and forward returns. SIZE and BM use unadjusted month-end close × the most recent shares filed before formation month-end.</p></div>
              <div><h3>ILLIQ + BETA</h3><p>ILLIQ uses the paper&apos;s monthly absolute-return / total-dollar-volume ratio. BETA uses the disclosed simplified daily OLS slope against <code>^GSPC</code> within each formation month.</p></div>
              <div><h3>1500 engine</h3><p>The batch workspace materializes one row per company-month, preserves historical rows after exit, and represents post-exit months as missing. Current public rosters are static snapshots; unbiased historical results require licensed point-in-time membership.</p></div>
              <div><h3>Delistings</h3><p>Yahoo does not expose a reliable delisting-return field in this workflow. Missing final returns remain missing and are disclosed rather than fabricated; dropping them can bias small-cap and high-MAX portfolios upward.</p></div>
              <div><h3>Inference</h3><p>Decile spreads and Fama–MacBeth averages use Newey–West HAC t-statistics with a documented rule-of-thumb lag. Cross-check key values against the cited source and retrieval date.</p></div>
            </div>
            <button className="primary-button modal-action" onClick={() => setMethodOpen(false)} type="button">Done</button>
          </section>
        </div>
      ) : null}
    </main>
  );
}
