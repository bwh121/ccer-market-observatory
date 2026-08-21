"use client";

import type { EChartsOption } from "echarts";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { AccountAccessButton } from "./components/ExportAccess";
import { EChart, echarts } from "./components/EChart";
import type { ExportRow, ExportSection } from "./components/DataActions";

type DashboardBuildEnv = { BASE_URL?: string; VITE_STATIC_GITHUB?: string };
const BUILD_ENV = (import.meta as ImportMeta & { env?: DashboardBuildEnv }).env || {};
const SITE_BASE = BUILD_ENV.BASE_URL || "/";
const localAsset = (assetPath: string) =>
  `${SITE_BASE.replace(/\/$/, "")}/${assetPath.replace(/^\//, "")}`;

type DailyRow = {
  date: string;
  subject: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  changeRate: number | null;
  listingVolume: number;
  listingAmount: number;
  blockVolume: number;
  blockAmount: number;
  auctionVolume: number;
  auctionAmount: number;
  totalVolume: number;
  totalAmount: number;
};

type TradeAggregate = {
  period: string;
  subject: string;
  methodCode: string;
  method: string;
  volume: number;
  amount: number;
  averagePrice: number | null;
};

type KeyEmitter = {
  id: string;
  year: string;
  province: string;
  city: string;
  industry: string;
  subindustry: string;
  name: string;
  uscc: string;
  authority: string;
  publishedAt: string;
};

type VerificationInstitution = {
  id: string;
  year: string;
  province: string;
  city: string;
  industry: string;
  name: string;
  uscc: string;
  authority: string;
  publishedAt: string;
  detailStatus: string;
};

type Fulfillment = {
  id: string;
  year: string;
  province: string;
  city: string;
  industry: string;
  name: string;
  uscc: string;
  onTime: string;
  overdue: string;
  incomplete: string;
  punishment: string;
  remarks: string;
  authority: string;
  publishedAt: string;
};

type ParticipantData = {
  keyEmitters: KeyEmitter[];
  verificationInstitutions: VerificationInstitution[];
  fulfillment: Fulfillment[];
};

type VerificationDetail = {
  verification_list_id: string;
  year: number;
  industry: string;
  institution_name: string;
  unified_social_credit_code: string;
  legal_representative: string;
  registered_capital_amount: number | null;
  registered_capital_unit: string;
  office_address: string;
  contact_name: string;
  contact_details: string;
  bad_record: string;
  pass_rate: number | null;
  target_count: number;
  pdf_url: string;
  parse_status: string;
};

type VerificationTarget = {
  verificationId: string;
  year: string;
  industry: string;
  institutionName: string;
  institutionUscc: string;
  institutionProvince: string;
  targetOrder: number;
  targetName: string;
  targetUscc: string;
  targetProvince: string;
  targetCity: string;
  timeliness: string;
  result: string;
  pdfUrl: string;
  isLocal: boolean;
};

type CeaDashboardData = {
  generatedAt: string;
  tradeDataThrough: string;
  priceComparisonDataThrough: string;
  participantCapturedAt: string;
  subjects: { code: string; label: string }[];
  tradeMethods: { code: string; key: string; name: string; shortName: string }[];
  marketSummary: {
    latestDate: string;
    latestClose: number | null;
    cumulativeVolume: number;
    cumulativeAmount: number;
    cumulativeAveragePrice: number | null;
  };
  officialCoverage: {
    year: string;
    managedEntities: number;
    sectorCounts: { sector: string; count: number }[];
    carbonDioxideShare: string;
    gases: string[];
  };
  quotaBasis: { year: string; allowance: number }[];
  turnoverByYear: { year: string; allowance: number; volume: number; turnoverRate: number | null }[];
  daily: DailyRow[];
  annualTrade: TradeAggregate[];
  monthlyTrade: TradeAggregate[];
  priceComparison: {
    month: string;
    ceaVolume: number;
    ceaAmount: number;
    ceaPrice: number | null;
    ccerVolume: number;
    ccerAmount: number;
    ccerPrice: number | null;
    spreadRatio: number | null;
  }[];
  coverage: {
    yearStats: { year: string; records: number; uniqueEntities: number; provinces: number; industries: number }[];
    provinceYear: { year: string; province: string; records: number; uniqueEntities: number }[];
    provinceIndustryYear?: { year: string; province: string; industry: string; records: number; uniqueEntities: number }[];
    industryYear: { year: string; industry: string; records: number }[];
  };
  participants: {
    keyEmitterRecords: number;
    verificationRecords: number;
    fulfillmentRecords: number;
    fulfillmentYearStats: { year: string; records: number; onTime: number; overdue: number; incomplete: number }[];
    verificationDetails: VerificationDetail[];
    verificationTargets: VerificationTarget[];
    detailFile: string;
  };
  quality: Record<string, unknown> & {
    trade?: {
      summary?: {
        expected_trading_dates?: number;
        dates_with_data?: number;
        warning_issues?: number;
        error_issues?: number;
      };
    };
    verificationPdfCoverage?: {
      parsed: number;
      expected: number;
      targets: number;
      rawTargets?: number;
      duplicateRelationshipsRemoved?: number;
      coverageRate?: number;
      effectiveCoverageRate?: number;
      sourceMissingPdf?: number;
      sourceUnavailablePdf?: number;
      unresolved?: number;
      errors?: number;
      status: string;
      publishReady?: boolean;
      checkedAt?: string;
      issueCount?: number;
    };
  };
  definitions: Record<string, string>;
  sources: { label: string; url: string }[];
};

type DrawerState = {
  eyebrow: string;
  title: string;
  description: string;
  fields: { label: string; value: string; href?: string }[];
  related?: Fulfillment[];
  targets?: VerificationTarget[];
  passRates?: { year: string; industry: string; passRate: number | null; targetCount: number; pdfUrl: string }[];
  auditInstitutions?: { year: string; name: string; province: string; city: string; industry: string; uscc: string; passRate: number | null; volume: number }[];
};

const METHOD_COLORS: Record<string, string> = {
  "10": "#147d70",
  "20": "#1f5f8b",
  "21": "#ba8744",
};
const SUBJECT_COLORS: Record<string, string> = {
  CEA: "#147d70",
  CEA21: "#1f5f8b",
  CEA22: "#9b4d5b",
  CEA23: "#ba8744",
  CEA24: "#657b75",
  CEA25: "#704b86",
};

const compactNumber = (value: number, digits = 1) => {
  const absolute = Math.abs(value);
  if (absolute >= 10_000_000) return `${(value / 100_000_000).toFixed(digits)}亿`;
  if (absolute >= 10_000) return `${(value / 10_000).toFixed(digits)}万`;
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
};

const exactNumber = (value: number, digits = 0) =>
  new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

const percent = (value: number | null, digits = 2) =>
  value == null ? "—" : `${(value * 100).toFixed(digits)}%`;

const axisLine = { lineStyle: { color: "#aab9b6" } };
const splitLine = { lineStyle: { color: "#e2e8e5", type: "dashed" as const } };
const axisLabel = { color: "#596966", fontSize: 10 };

const provinceMapName = (province: string) => {
  const fixed: Record<string, string> = {
    新疆生产建设兵团: "新疆维吾尔自治区",
  };
  return fixed[province] || province;
};

function SectionHeading({
  index,
  eyebrow,
  title,
  description,
}: {
  index: string;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="section-heading">
      <div className="section-index">{index}</div>
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

function PanelTitle({
  label,
  title,
  note,
  controls,
  badge,
}: {
  label: string;
  title: string;
  note?: string;
  controls?: ReactNode;
  badge?: string;
}) {
  return (
    <div className="panel-title-row">
      <div>
        <div className="panel-label">{label}</div>
        <h3>{title}</h3>
        {note ? <p>{note}</p> : null}
      </div>
      <div className="cea-panel-actions">
        {badge ? <span className="data-status-badge">{badge}</span> : null}
        {controls ? <div className="panel-controls">{controls}</div> : null}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  unit,
  note,
  tooltip,
  tone = "teal",
}: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  tooltip?: string;
  tone?: "teal" | "blue" | "rust" | "ink";
}) {
  return (
    <article className={`kpi-card tone-${tone}${tooltip ? " kpi-card-has-tooltip" : ""}`} data-tooltip={tooltip} tabIndex={tooltip ? 0 : undefined}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        {value}
        {unit ? <span>{unit}</span> : null}
      </div>
      {note ? <div className="kpi-note">{note}</div> : null}
    </article>
  );
}

function SelectControl({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="cea-select-control">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function CeaDrawer({ state, onClose }: { state: DrawerState | null; onClose: () => void }) {
  useEffect(() => {
    if (!state) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [state, onClose]);
  if (!state) return null;
  return (
    <div className="drawer-layer" role="presentation" onMouseDown={onClose}>
      <aside className="drawer cea-detail-drawer" role="dialog" aria-modal="true" aria-label={state.title} onMouseDown={(event) => event.stopPropagation()}>
        <div className="drawer-sticky-shell">
          <div className="drawer-head">
            <div>
              <div className="eyebrow">{state.eyebrow}</div>
              <h2>{state.title}</h2>
              <p>{state.description}</p>
            </div>
            <button type="button" className="drawer-close" onClick={onClose}>关闭</button>
          </div>
        </div>
        <div className="drawer-scroll-region">
          <dl className="cea-detail-list">
            {state.fields.map((field) => (
              <div key={`${field.label}-${field.value}`}>
                <dt>{field.label}</dt>
                <dd>{field.href ? <a href={field.href} target="_blank" rel="noreferrer">{field.value}</a> : field.value || "—"}</dd>
              </div>
            ))}
          </dl>
          {state.targets?.length ? (
            <div className="cea-related-records cea-verification-targets">
              <h3>服务的重点排放单位 <span>{exactNumber(state.targets.length)} 家</span></h3>
              <div className="cea-table-scroll">
                <table className="cea-data-table">
                  <thead><tr><th>年度</th><th>序号</th><th>重点排放单位</th><th>统一社会信用代码</th><th>行业</th><th>及时性</th><th>核查结果</th></tr></thead>
                  <tbody>
                    {state.targets.map((row, index) => (
                      <tr key={`${row.verificationId}-${row.targetOrder}-${row.targetUscc}`}>
                        <td>{row.year}</td><td>{row.targetOrder || index + 1}</td><td><strong>{row.targetName}</strong></td><td className="code-cell">{row.targetUscc || "—"}</td><td>{row.industry || "—"}</td><td>{row.timeliness || "—"}</td><td>{row.result || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          {state.passRates?.length ? (
            <div className="cea-related-records">
              <h3>年度合格率</h3>
              <div className="cea-table-scroll">
                <table className="cea-data-table">
                  <thead><tr><th>年度</th><th>行业</th><th>合格率</th><th>服务重点排放单位</th><th>官方PDF</th></tr></thead>
                  <tbody>{state.passRates.map((row) => <tr key={`${row.year}-${row.industry}-${row.pdfUrl}`}><td>{row.year}</td><td>{row.industry || "—"}</td><td>{percent(row.passRate, 0)}</td><td>{exactNumber(row.targetCount)} 家</td><td>{row.pdfUrl ? <a href={row.pdfUrl} target="_blank" rel="noreferrer">打开PDF</a> : "—"}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          ) : null}
          {state.auditInstitutions?.length ? (
            <div className="cea-related-records">
              <h3>技术服务机构名单 <span>{exactNumber(state.auditInstitutions.length)} 家</span></h3>
              <div className="cea-table-scroll">
                <table className="cea-data-table">
                  <thead><tr><th>年度</th><th>技术服务机构</th><th>注册省市</th><th>行业</th><th>统一社会信用代码</th><th>合格率</th><th>业务量</th></tr></thead>
                  <tbody>{state.auditInstitutions.map((row) => <tr key={`${row.year}-${row.uscc}-${row.name}`}><td>{row.year}</td><td><strong>{row.name}</strong></td><td>{[row.province, row.city].filter(Boolean).join(" · ") || "—"}</td><td>{row.industry || "—"}</td><td className="code-cell">{row.uscc || "—"}</td><td>{percent(row.passRate, 0)}</td><td>{exactNumber(row.volume)} 家</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          ) : null}
          {state.related?.length ? (
            <div className="cea-related-records">
              <h3>履约记录</h3>
              <div className="cea-table-scroll">
                <table className="cea-data-table">
                  <thead><tr><th>年度</th><th>按期</th><th>逾期</th><th>未履约</th><th>处罚</th><th>公开时间</th></tr></thead>
                  <tbody>
                    {state.related.map((row) => (
                      <tr key={row.id}><td>{row.year}</td><td>{row.onTime}</td><td>{row.overdue}</td><td>{row.incomplete}</td><td>{row.punishment}</td><td>{row.publishedAt}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

const exportSection = (title: string, rows: ExportRow[]): ExportSection[] => [{ title, rows }];

export default function CeaDashboardClient() {
  const [data, setData] = useState<CeaDashboardData | null>(null);
  const [error, setError] = useState("");
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(localAsset("data/cea-dashboard.json")).then((response) => {
        if (!response.ok) throw new Error("CEA 数据文件读取失败");
        return response.json();
      }),
      fetch(localAsset("china.json")).then((response) => {
        if (!response.ok) throw new Error("地图文件读取失败");
        return response.json();
      }),
    ])
      .then(([payload, chinaMap]: [CeaDashboardData, unknown]) => {
        echarts.registerMap("china-cea", chinaMap as never);
        setData(payload);
        setMapReady(true);
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  if (error) return <div className="loading-screen">CEA 页面暂时无法载入：{error}</div>;
  if (!data) return <div className="loading-screen">正在装载强制碳市场数据…</div>;
  return <CeaDashboardReady data={data} mapReady={mapReady} />;
}

function CeaDashboardReady({ data, mapReady }: { data: CeaDashboardData; mapReady: boolean }) {
  const [subject, setSubject] = useState("COMCEA");
  const [priceView, setPriceView] = useState<"kline" | "close">("kline");
  const [coverageYear, setCoverageYear] = useState("2026");
  const [coverageIndustryFilter, setCoverageIndustryFilter] = useState("");
  const [monthlyYear, setMonthlyYear] = useState("2026");
  const [heatYear, setHeatYear] = useState("2026");
  const [structurePeriod, setStructurePeriod] = useState("all");
  const [participants, setParticipants] = useState<ParticipantData | null>(null);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantsError, setParticipantsError] = useState("");
  const [participantMode, setParticipantMode] = useState<"enterprise" | "institution">("enterprise");
  const [participantYear, setParticipantYear] = useState("2026");
  const [participantProvince, setParticipantProvince] = useState("");
  const [participantIndustry, setParticipantIndustry] = useState("");
  const [participantSearch, setParticipantSearch] = useState("");
  const [participantPage, setParticipantPage] = useState(1);
  const [auditYear, setAuditYear] = useState("");
  const [footprintYear, setFootprintYear] = useState("");
  const [footprintLimit, setFootprintLimit] = useState("20");
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const pdfCoverage = data.quality.verificationPdfCoverage || {
    parsed: data.participants.verificationDetails.length,
    expected: data.participants.verificationRecords,
    targets: data.participants.verificationTargets.length,
    status: "partial",
  };
  const relationshipBadge = `${exactNumber(pdfCoverage.targets)}条核查关系`;
  const pdfCoverageText = `${exactNumber(pdfCoverage.parsed)}份可用PDF（名单${exactNumber(pdfCoverage.expected)}条）`;
  const sourcePdfExceptions = `${exactNumber(pdfCoverage.sourceMissingPdf || 0)}条官网未附PDF、${exactNumber(pdfCoverage.sourceUnavailablePdf || 0)}条官方链接失效`;
  const tradeQuality = data.quality.trade?.summary;
  const expectedTradingDates = tradeQuality?.expected_trading_dates || new Set(data.daily.map((row) => row.date)).size;
  const datesWithData = tradeQuality?.dates_with_data || expectedTradingDates;
  const tradeCalendarText = expectedTradingDates === datesWithData
    ? `${exactNumber(datesWithData)}个预期交易日均有官方返回`
    : `${exactNumber(expectedTradingDates)}个预期交易日中${exactNumber(datesWithData)}个有官方返回`;

  const loadParticipants = async (): Promise<ParticipantData | null> => {
    if (participants) return participants;
    if (participantsLoading) return null;
    setParticipantsLoading(true);
    setParticipantsError("");
    try {
      const response = await fetch(localAsset(data.participants.detailFile));
      if (!response.ok) throw new Error("完整名录读取失败");
      const payload = await response.json() as ParticipantData;
      setParticipants(payload);
      return payload;
    } catch (reason) {
      setParticipantsError(reason instanceof Error ? reason.message : "完整名录读取失败");
      return null;
    } finally {
      setParticipantsLoading(false);
    }
  };

  const changeParticipantMode = (mode: "enterprise" | "institution") => {
    setParticipantMode(mode);
    setParticipantYear(mode === "enterprise" ? "2026" : "2024");
    setParticipantProvince("");
    setParticipantIndustry("");
    setParticipantSearch("");
    setParticipantPage(1);
  };

  const yearOptions = ["2021", "2022", "2023", "2024", "2025", "2026"].map((year) => ({ value: year, label: `${year}年` }));
  const subjectOptions = data.subjects.map((row) => ({ value: row.code, label: row.label }));
  const selectedDaily = useMemo(
    () => data.daily.filter((row) => row.subject === subject),
    [data.daily, subject],
  );
  const tradeDates = useMemo(
    () => [...new Set(data.daily.filter((row) => row.subject === "COMCEA").map((row) => row.date))].sort(),
    [data.daily],
  );
  const chartRows = useMemo(() => {
    const selectedDailyByDate = new Map(selectedDaily.map((row) => [row.date, row]));
    return tradeDates.map((date) => selectedDailyByDate.get(date) || null);
  }, [selectedDaily, tradeDates]);
  const isCompletePrice = (row: DailyRow | null): row is DailyRow => Boolean(
    row && row.open != null && row.high != null && row.low != null && row.close != null,
  );
  const priceRows = selectedDaily.filter((row) => isCompletePrice(row));
  const priceLegend = priceView === "kline" ? "K线" : "收盘价";
  const klineOption = useMemo<EChartsOption>(() => {
    const monthAxisLabel = (value: string, index: number) => {
      const month = value.slice(0, 7);
      const previousMonth = tradeDates[index - 1]?.slice(0, 7);
      return index === 0 || month !== previousMonth ? `${Number(value.slice(5, 7))}月` : "";
    };
    const yearAxisLabel = (value: string, index: number) => {
      const year = value.slice(0, 4);
      const previousYear = tradeDates[index - 1]?.slice(0, 4);
      return index === 0 || year !== previousYear ? `${year}年` : "";
    };
    return ({
    animation: false,
    legend: { top: 2, right: 120, selectedMode: false, textStyle: axisLabel, data: [priceLegend, "挂牌协议", "大宗协议", "单向竞价"] },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
      formatter: (raw: unknown) => {
        const params = (Array.isArray(raw) ? raw : [raw]) as Array<{ dataIndex?: number }>;
        const index = params[0]?.dataIndex ?? 0;
        const row = chartRows[index];
        const priceLines = priceView === "kline"
          ? [`开盘：${row?.open == null ? "—" : exactNumber(row.open, 2)} 元/吨`, `最高：${row?.high == null ? "—" : exactNumber(row.high, 2)} 元/吨`, `最低：${row?.low == null ? "—" : exactNumber(row.low, 2)} 元/吨`, `收盘：${row?.close == null ? "—" : exactNumber(row.close, 2)} 元/吨`]
          : [`收盘价：${row?.close == null ? "—" : `${exactNumber(row.close, 2)} 元/吨`}`];
        return [
          `<strong>${tradeDates[index] || ""}</strong>`,
          ...priceLines,
          `挂牌协议：${exactNumber(row?.listingVolume || 0)} 吨`,
          `大宗协议：${exactNumber(row?.blockVolume || 0)} 吨`,
          `单向竞价：${exactNumber(row?.auctionVolume || 0)} 吨`,
        ].join("<br/>");
      },
    },
    axisPointer: { link: [{ xAxisIndex: "all" }] },
    grid: { left: 62, right: 90, top: 42, bottom: 98 },
    xAxis: [
      {
        type: "category",
        data: tradeDates,
        boundaryGap: true,
        axisLine,
        axisTick: { show: false },
        axisLabel: { ...axisLabel, interval: 0, hideOverlap: true, formatter: monthAxisLabel, margin: 12 },
      },
      {
        type: "category",
        data: tradeDates,
        boundaryGap: true,
        position: "bottom",
        offset: 27,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: "#31403d", fontSize: 11, fontWeight: 700, interval: 0, hideOverlap: true, formatter: yearAxisLabel },
      },
    ],
    yAxis: [
      { type: "value", name: "价格（元/吨）", min: 0, axisLine, axisLabel, splitLine },
      { type: "value", name: "成交量（吨）", position: "right", max: (value: { max: number }) => value.max > 0 ? Math.ceil((value.max * 1.35) / 1_000_000) * 1_000_000 : 1, axisLine, axisLabel: { ...axisLabel, formatter: (value: number) => compactNumber(value) }, splitLine: { show: false } },
    ],
    dataZoom: [
      { type: "slider", xAxisIndex: [0, 1], start: 0, end: 100, filterMode: "none", bottom: 2, height: 20, showDataShadow: false, brushSelect: false },
    ],
    series: [
      ...(priceView === "kline" ? [{
        name: "K线",
        type: "candlestick" as const,
        xAxisIndex: 0,
        yAxisIndex: 0,
        z: 5,
        barWidth: "92%",
        barMinWidth: 2,
        barMaxWidth: 18,
        data: chartRows.map((row) => isCompletePrice(row) && row.totalVolume > 0 ? [row.open, row.close, row.low, row.high] : ["-", "-", "-", "-"]),
        itemStyle: { color: "#b5523b", color0: "#2f7d68", borderColor: "#b5523b", borderColor0: "#2f7d68" },
      }] : [{
        name: "收盘价",
        type: "line" as const,
        xAxisIndex: 0,
        yAxisIndex: 0,
        z: 5,
        data: chartRows.map((row) => row && row.totalVolume > 0 ? row.close : null),
        showSymbol: false,
        connectNulls: true,
        lineStyle: { width: 2.2, color: "#9b4d5b" },
        itemStyle: { color: "#9b4d5b" },
      }]),
      { name: "挂牌协议", type: "bar", stack: "volume", xAxisIndex: 0, yAxisIndex: 1, z: 1, barWidth: "76%", data: chartRows.map((row) => row?.listingVolume || 0), itemStyle: { color: METHOD_COLORS["10"], opacity: 0.38 } },
      { name: "大宗协议", type: "bar", stack: "volume", xAxisIndex: 0, yAxisIndex: 1, z: 1, barWidth: "76%", data: chartRows.map((row) => row?.blockVolume || 0), itemStyle: { color: METHOD_COLORS["20"], opacity: 0.38 } },
      { name: "单向竞价", type: "bar", stack: "volume", xAxisIndex: 0, yAxisIndex: 1, z: 1, barWidth: "76%", data: chartRows.map((row) => row?.auctionVolume || 0), itemStyle: { color: METHOD_COLORS["21"], opacity: 0.42 } },
    ],
    });
  }, [chartRows, priceLegend, priceView, tradeDates]);

  const annualRows = data.annualTrade.filter((row) => row.subject === subject);
  const annualOption = useMemo<EChartsOption>(() => {
    const periods = yearOptions.map((row) => row.value);
    return {
      animation: false,
      tooltip: { trigger: "axis" },
      legend: { top: 2, type: "scroll", textStyle: axisLabel },
      grid: { left: 60, right: 60, top: 66, bottom: 44 },
      xAxis: { type: "category", data: periods, axisLine, axisLabel },
      yAxis: [
        { type: "value", name: "成交量/吨", axisLine, axisLabel: { ...axisLabel, formatter: (value: number) => compactNumber(value) }, splitLine },
        { type: "value", name: "均价/元", axisLine, axisLabel, splitLine: { show: false } },
      ],
      series: data.tradeMethods.flatMap((method) => {
        const values = periods.map((period) => annualRows.find((row) => row.period === period && row.methodCode === method.code));
        return [
          { name: `${method.shortName}量`, type: "bar", stack: "annual-volume", data: values.map((row) => row?.volume || 0), itemStyle: { color: METHOD_COLORS[method.code], opacity: 0.68 } },
          { name: `${method.shortName}均价`, type: "line", yAxisIndex: 1, data: values.map((row) => row?.averagePrice ?? null), symbolSize: 7, connectNulls: false, lineStyle: { width: 2, color: METHOD_COLORS[method.code] }, itemStyle: { color: METHOD_COLORS[method.code] } },
        ];
      }),
    };
  }, [annualRows, data.tradeMethods, yearOptions]);

  const turnoverOption = useMemo<EChartsOption>(() => ({
    animation: false,
    tooltip: { trigger: "axis" },
    legend: { top: 2, textStyle: axisLabel },
    grid: { left: 56, right: 58, top: 58, bottom: 42 },
    xAxis: { type: "category", data: data.turnoverByYear.map((row) => row.year), axisLine, axisLabel },
    yAxis: [
      { type: "value", name: "亿吨", axisLine, axisLabel, splitLine },
      { type: "value", name: "换手率", axisLine, axisLabel: { ...axisLabel, formatter: (value: number) => `${value.toFixed(1)}%` }, splitLine: { show: false } },
    ],
    series: [
      { name: "年度成交量", type: "bar", data: data.turnoverByYear.map((row) => Number((row.volume / 100_000_000).toFixed(3))), itemStyle: { color: "#147d70" } },
      { name: "总配额假设", type: "bar", data: data.turnoverByYear.map((row) => Number((row.allowance / 100_000_000).toFixed(1))), itemStyle: { color: "#cbd5d1" } },
      { name: "换手率", type: "line", yAxisIndex: 1, data: data.turnoverByYear.map((row) => row.turnoverRate == null ? null : Number((row.turnoverRate * 100).toFixed(3))), symbolSize: 8, lineStyle: { width: 2.4, color: "#9b4d5b" }, itemStyle: { color: "#9b4d5b" } },
    ],
  }), [data.turnoverByYear]);

  const monthlyRows = data.monthlyTrade.filter((row) => row.subject === subject && row.period.startsWith(monthlyYear));
  const monthlyOption = useMemo<EChartsOption>(() => {
    const periods = [...new Set(monthlyRows.map((row) => row.period))].sort();
    return {
      animation: false,
      tooltip: { trigger: "axis" },
      legend: { top: 2, type: "scroll", textStyle: axisLabel },
      grid: { left: 60, right: 60, top: 66, bottom: 42 },
      xAxis: { type: "category", data: periods, axisLine, axisLabel: { ...axisLabel, formatter: (value: string) => `${Number(value.slice(5))}月` } },
      yAxis: [
        { type: "value", name: "成交量/吨", axisLine, axisLabel: { ...axisLabel, formatter: (value: number) => compactNumber(value) }, splitLine },
        { type: "value", name: "均价/元", axisLine, axisLabel, splitLine: { show: false } },
      ],
      series: data.tradeMethods.flatMap((method) => {
        const values = periods.map((period) => monthlyRows.find((row) => row.period === period && row.methodCode === method.code));
        return [
          { name: `${method.shortName}量`, type: "bar", stack: "monthly-volume", data: values.map((row) => row?.volume || 0), itemStyle: { color: METHOD_COLORS[method.code], opacity: 0.68 } },
          { name: `${method.shortName}均价`, type: "line", yAxisIndex: 1, data: values.map((row) => row?.averagePrice ?? null), symbolSize: 6, lineStyle: { width: 2, color: METHOD_COLORS[method.code] }, itemStyle: { color: METHOD_COLORS[method.code] } },
        ];
      }),
    };
  }, [data.tradeMethods, monthlyRows]);

  const normalizedOption = useMemo<EChartsOption>(() => {
    const byYear = new Map<string, DailyRow[]>();
    for (const row of selectedDaily.filter((item) => item.close != null)) {
      const year = row.date.slice(0, 4);
      byYear.set(year, [...(byYear.get(year) || []), row]);
    }
    const monthDays = [...new Set([...byYear.values()].flatMap((rows) => rows.map((row) => row.date.slice(5))))].sort();
    const colors = ["#147d70", "#1f5f8b", "#9b4d5b", "#ba8744", "#657b75", "#704b86"];
    return {
      animation: false,
      tooltip: { trigger: "axis" },
      legend: { show: false },
      grid: { left: 56, right: 74, top: 24, bottom: 50 },
      xAxis: {
        type: "category",
        data: monthDays,
        axisLine,
        axisLabel: {
          ...axisLabel,
          interval: 0,
          hideOverlap: true,
          formatter: (value: string, index: number) => {
            const month = value.slice(0, 2);
            const previousMonth = monthDays[index - 1]?.slice(0, 2);
            return index === 0 || month !== previousMonth ? `${Number(month)}月` : "";
          },
        },
      },
      yAxis: { type: "value", name: "指数", scale: true, axisLine, axisLabel, splitLine },
      series: [...byYear.entries()].sort().map(([year, rows], index) => {
        const baseline = rows[0]?.close || 1;
        const valueByDay = new Map(rows.map((row) => [row.date.slice(5), Number((((row.close || baseline) / baseline) * 100).toFixed(2))]));
        const highlighted = year === "2026";
        return {
          name: year,
          type: "line",
          data: monthDays.map((day) => valueByDay.get(day) ?? null),
          showSymbol: false,
          connectNulls: true,
          z: highlighted ? 8 : 3,
          lineStyle: { width: highlighted ? 3.6 : 1.7, color: colors[index], type: "solid" },
          itemStyle: { color: colors[index] },
          endLabel: {
            show: true,
            formatter: year,
            color: colors[index],
            fontSize: highlighted ? 12 : 10,
            fontWeight: highlighted ? 800 : 600,
            distance: 6,
          },
          labelLayout: { moveOverlap: "shiftY" },
        };
      }),
    };
  }, [selectedDaily]);

  const heatRows = selectedDaily.filter((row) => row.date.startsWith(heatYear));
  const heatOption = useMemo<EChartsOption>(() => ({
    animation: false,
    tooltip: { formatter: (params) => {
      const item = Array.isArray(params) ? params[0] : params;
      const values = Array.isArray(item?.data) ? item.data : [];
      return `${String(values[0] || "")}<br/>成交量：${exactNumber(Number(values[1]) || 0)} 吨`;
    } },
    visualMap: { min: 0, max: Math.max(...heatRows.map((row) => row.totalVolume), 1), calculable: true, orient: "horizontal", left: "center", bottom: 0, inRange: { color: ["#edf3f0", "#8bb9ad", "#147d70", "#9b4d5b"] }, textStyle: axisLabel },
    calendar: { top: 34, left: 42, right: 28, range: heatYear, cellSize: ["auto", 18], itemStyle: { borderWidth: 2, borderColor: "#f3f5f1" }, yearLabel: { show: false }, monthLabel: { color: "#40524e" }, dayLabel: { color: "#596966", firstDay: 1 } },
    series: [{ type: "heatmap", coordinateSystem: "calendar", data: heatRows.map((row) => [row.date, row.totalVolume]) }],
  }), [heatRows, heatYear]);

  const structureRows = selectedDaily.filter((row) => structurePeriod === "all" || row.date.startsWith(structurePeriod));
  const methodStructure = data.tradeMethods.map((method) => {
    const volume = structureRows.reduce((total, row) => total + Number(row[`${method.key}Volume` as keyof DailyRow] || 0), 0);
    const amount = structureRows.reduce((total, row) => total + Number(row[`${method.key}Amount` as keyof DailyRow] || 0), 0);
    return { ...method, volume, amount, averagePrice: volume > 0 ? amount / volume : null };
  });
  const subjectStructure = data.subjects
    .filter((item) => item.code !== "COMCEA")
    .map((item) => ({
      subject: item.code,
      volume: data.daily
        .filter((row) => row.subject === item.code && (structurePeriod === "all" || row.date.startsWith(structurePeriod)))
        .reduce((total, row) => total + row.totalVolume, 0),
    }))
    .filter((row) => row.volume > 0);

  const methodStructureOption = useMemo<EChartsOption>(() => ({
    animation: false,
    tooltip: { trigger: "item", valueFormatter: (value: unknown) => `${exactNumber(Number(value) || 0)} 吨` },
    legend: { bottom: 2, textStyle: axisLabel },
    series: [{ type: "pie", radius: ["42%", "68%"], center: ["50%", "45%"], data: methodStructure.map((row) => ({ name: row.shortName, value: row.volume, itemStyle: { color: METHOD_COLORS[row.code] } })), label: { formatter: "{b}\n{d}%", fontSize: 10 } }],
  }), [methodStructure]);

  const methodPriceOption = useMemo<EChartsOption>(() => {
    const prices = methodStructure.map((row) => row.averagePrice).filter((value): value is number => value != null);
    const priceMin = prices.length ? Math.min(...prices) : 0;
    const priceMax = prices.length ? Math.max(...prices) : 1;
    const priceSpan = Math.max(priceMax - priceMin, 8);
    const axisMin = Math.max(0, Math.floor((priceMin - priceSpan * 0.45) / 5) * 5);
    const axisMax = Math.ceil((priceMax + priceSpan * 0.25) / 5) * 5;
    return {
      animation: false,
      tooltip: { trigger: "axis" },
      grid: { left: 54, right: 22, top: 30, bottom: 52 },
      xAxis: { type: "category", data: methodStructure.map((row) => row.shortName), axisLine, axisLabel: { ...axisLabel, interval: 0 } },
      yAxis: { type: "value", name: "元/吨", min: axisMin, max: axisMax, axisLine, axisLabel, splitLine },
      series: [{ type: "bar", data: methodStructure.map((row) => ({ value: row.averagePrice, itemStyle: { color: METHOD_COLORS[row.code] } })), label: { show: true, position: "top", formatter: (params: { value?: unknown }) => params.value == null ? "—" : Number(params.value).toFixed(2) } }],
    };
  }, [methodStructure]);

  const subjectStructureOption = useMemo<EChartsOption>(() => ({
    animation: false,
    tooltip: { trigger: "item", valueFormatter: (value: unknown) => `${exactNumber(Number(value) || 0)} 吨` },
    legend: { bottom: 2, type: "scroll", textStyle: axisLabel },
    series: [{ type: "pie", radius: ["34%", "65%"], center: ["50%", "44%"], roseType: "radius", data: subjectStructure.map((row) => ({ name: row.subject, value: row.volume, itemStyle: { color: SUBJECT_COLORS[row.subject] } })), label: { formatter: "{b}\n{d}%", fontSize: 10 } }],
  }), [subjectStructure]);

  const priceComparisonOption = useMemo<EChartsOption>(() => {
    const spreads = data.priceComparison.map((row) => row.spreadRatio == null ? null : row.spreadRatio * 100).filter((value): value is number => value != null);
    const low = spreads.length ? Math.min(0, ...spreads) : 0;
    const high = spreads.length ? Math.max(0, ...spreads) : 1;
    const span = Math.max(high - low, 4);
    return ({
    animation: false,
    tooltip: { trigger: "axis" },
    legend: { top: 2, textStyle: axisLabel },
    grid: { left: 58, right: 58, top: 54, bottom: 52 },
    xAxis: { type: "category", data: data.priceComparison.map((row) => row.month), axisLine, axisLabel: { ...axisLabel, hideOverlap: true } },
    yAxis: [
      { type: "value", name: "元/吨", scale: true, axisLine, axisLabel, splitLine },
      { type: "value", name: "CCER相对价差", min: Math.floor((low - span * 0.18) / 5) * 5, max: Math.ceil((high + span * 0.18) / 5) * 5, axisLine, axisLabel: { ...axisLabel, formatter: (value: number) => `${value}%` }, splitLine: { show: false } },
    ],
    dataZoom: [{ type: "slider", height: 18, bottom: 4, brushSelect: false }],
    series: [
      { name: "CEA月均价", type: "line", data: data.priceComparison.map((row) => row.ceaPrice), showSymbol: false, lineStyle: { width: 2.2, color: "#147d70" }, itemStyle: { color: "#147d70" } },
      { name: "CCER月均价", type: "line", data: data.priceComparison.map((row) => row.ccerPrice), showSymbol: false, lineStyle: { width: 2.2, color: "#1f5f8b" }, itemStyle: { color: "#1f5f8b" } },
      { name: "CCER相对价差", type: "bar", yAxisIndex: 1, data: data.priceComparison.map((row) => row.spreadRatio == null ? null : { value: Number((row.spreadRatio * 100).toFixed(2)), itemStyle: { color: row.spreadRatio >= 0 ? "#b5523b" : "#2f7d68", opacity: 0.48 } }) },
    ],
    });
  }, [data.priceComparison]);

  const coverageIndustryOptions = data.coverage.industryYear
    .filter((row) => row.year === coverageYear)
    .sort((a, b) => b.records - a.records)
    .map((row) => ({ value: row.industry, label: row.industry }));
  const coverageIndustryRows = data.coverage.industryYear
    .filter((row) => row.year === coverageYear)
    .sort((a, b) => b.records - a.records);
  const coverageRows = coverageIndustryFilter
    ? (data.coverage.provinceIndustryYear || []).filter((row) => row.year === coverageYear && row.industry === coverageIndustryFilter)
    : data.coverage.provinceYear.filter((row) => row.year === coverageYear);
  const coverageMapOption = useMemo<EChartsOption>(() => ({
    animation: false,
    tooltip: { trigger: "item", formatter: (params) => {
      const item = Array.isArray(params) ? params[0] : params;
      return `${item?.name || ""}<br/>公开记录：${exactNumber(Number(item?.value) || 0)} 条<br/><small>点击查看企业</small>`;
    } },
    visualMap: { min: 0, max: Math.max(...coverageRows.map((row) => row.records), 1), left: 8, bottom: 8, calculable: true, text: ["多", "少"], inRange: { color: ["#edf3f0", "#9cc4ba", "#147d70", "#0b514b"] }, textStyle: axisLabel },
    series: [{ name: "重点排放单位", type: "map", map: "china-cea", nameProperty: "name", roam: false, selectedMode: false, data: coverageRows.filter((row) => row.province !== "未披露").map((row) => ({ name: provinceMapName(row.province), value: row.records })), itemStyle: { areaColor: "#edf3f0", borderColor: "#f3f5f1", borderWidth: 1 }, emphasis: { label: { color: "#14211f" }, itemStyle: { areaColor: "#d6a35d" } } }],
  }), [coverageRows]);

  const coverageIndustryOption = useMemo<EChartsOption>(() => ({
    animation: false,
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: 92, right: 24, top: 50, bottom: 28 },
    xAxis: { type: "value", position: "top", name: "公开记录", axisLine, axisLabel: { ...axisLabel, formatter: (value: number) => compactNumber(value, 0) }, splitLine },
    yAxis: { type: "category", inverse: true, data: coverageIndustryRows.map((row) => row.industry), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { ...axisLabel, fontSize: 11 } },
    series: [{ name: "公开记录", type: "bar", barMaxWidth: 28, data: coverageIndustryRows.map((row) => row.records), itemStyle: { color: "#147d70" }, label: { show: true, position: "right", color: "#40524e", fontSize: 10 } }],
  }), [coverageIndustryRows]);

  const fulfillmentOption = useMemo<EChartsOption>(() => ({
    animation: false,
    tooltip: { trigger: "axis" },
    legend: { top: 2, textStyle: axisLabel },
    grid: { left: 52, right: 52, top: 52, bottom: 36 },
    xAxis: { type: "category", data: data.participants.fulfillmentYearStats.map((row) => row.year), axisLine, axisLabel },
    yAxis: [
      { type: "value", name: "公开记录", axisLine, axisLabel, splitLine },
      { type: "value", name: "按期履约率", min: 0, max: 100, axisLine, axisLabel: { ...axisLabel, formatter: (value: number) => `${value}%` }, splitLine: { show: false } },
    ],
    series: [
      { name: "按期履约", type: "bar", stack: "fulfillment", data: data.participants.fulfillmentYearStats.map((row) => row.onTime), itemStyle: { color: "#147d70" } },
      { name: "逾期履约", type: "bar", stack: "fulfillment", data: data.participants.fulfillmentYearStats.map((row) => row.overdue), itemStyle: { color: "#ba8744" } },
      { name: "未履约", type: "bar", stack: "fulfillment", data: data.participants.fulfillmentYearStats.map((row) => row.incomplete), itemStyle: { color: "#9b4d5b" } },
      { name: "按期履约率", type: "line", yAxisIndex: 1, data: data.participants.fulfillmentYearStats.map((row) => row.records ? Number((row.onTime / row.records * 100).toFixed(1)) : null), symbolSize: 7, lineStyle: { width: 2.3, color: "#1f5f8b" }, itemStyle: { color: "#1f5f8b" } },
    ],
  }), [data.participants.fulfillmentYearStats]);

  const auditRows = data.participants.verificationTargets.filter((row) => (auditYear === "" || row.year === auditYear) && row.targetProvince && row.targetProvince !== "未匹配");
  const auditProvinceStats = useMemo(() => {
    const byProvince = new Map<string, VerificationTarget[]>();
    auditRows.forEach((row) => byProvince.set(row.targetProvince, [...(byProvince.get(row.targetProvince) || []), row]));
    return [...byProvince.entries()].map(([province, rows]) => {
      const local = rows.filter((row) => row.isLocal).length;
      const byInstitution = new Map<string, number>();
      rows.forEach((row) => byInstitution.set(`${row.institutionName}|${row.institutionUscc}`, (byInstitution.get(`${row.institutionName}|${row.institutionUscc}`) || 0) + 1));
      const cr5 = [...byInstitution.values()].sort((a, b) => b - a).slice(0, 5).reduce((sum, value) => sum + value, 0) / rows.length * 100;
      return { province, rows, total: rows.length, local, external: rows.length - local, localShare: local / rows.length * 100, cr5 };
    }).sort((a, b) => b.localShare - a.localShare || b.total - a.total || a.province.localeCompare(b.province, "zh-CN"));
  }, [auditRows]);
  const auditStructureOption = useMemo<EChartsOption>(() => ({
    animation: false,
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, formatter: (params: unknown) => {
      const first = (Array.isArray(params) ? params[0] : params) as { dataIndex?: number };
      const row = auditProvinceStats[first?.dataIndex || 0];
      return row ? `<strong>${row.province}</strong><br/>本地机构：${exactNumber(row.local)} 家（${row.localShare.toFixed(1)}%）<br/>外地机构：${exactNumber(row.external)} 家（${(100 - row.localShare).toFixed(1)}%）<br/>CR5：${row.cr5.toFixed(1)}%<br/><small>点击查看技术服务机构名单</small>` : "";
    } },
    legend: { top: 2, textStyle: axisLabel },
    grid: { left: 48, right: 56, top: 50, bottom: 92 },
    xAxis: { type: "category", data: auditProvinceStats.map((row) => row.province), axisLine, axisTick: { show: false }, axisLabel: { ...axisLabel, interval: 0, rotate: 35 } },
    yAxis: [
      { type: "value", name: "业务占比", min: 0, max: 100, axisLine, axisLabel: { ...axisLabel, formatter: (value: number) => `${value}%` }, splitLine },
      { type: "value", name: "CR5", min: 0, max: 100, axisLine, axisLabel: { ...axisLabel, formatter: (value: number) => `${value}%` }, splitLine: { show: false } },
    ],
    series: [
      { name: "本地机构", type: "bar", stack: "share", barMaxWidth: 34, data: auditProvinceStats.map((row) => Number(row.localShare.toFixed(2))), itemStyle: { color: "#147d70" } },
      { name: "外地机构", type: "bar", stack: "share", barMaxWidth: 34, data: auditProvinceStats.map((row) => Number((100 - row.localShare).toFixed(2))), itemStyle: { color: "#ba8744" } },
      { name: "CR5", type: "line", yAxisIndex: 1, data: auditProvinceStats.map((row) => Number(row.cr5.toFixed(2))), symbolSize: 6, lineStyle: { width: 2.2, color: "#9b4d5b" }, itemStyle: { color: "#9b4d5b" } },
    ],
  }), [auditProvinceStats]);

  const footprintRows = data.participants.verificationTargets.filter((row) => (footprintYear === "" || row.year === footprintYear) && row.targetProvince && row.targetProvince !== "未匹配");
  const footprintStats = useMemo(() => {
    const grouped = new Map<string, { name: string; uscc: string; total: number; provinces: Map<string, number> }>();
    footprintRows.forEach((row) => {
      const key = `${row.institutionName}|${row.institutionUscc}`;
      const current = grouped.get(key) || { name: row.institutionName, uscc: row.institutionUscc, total: 0, provinces: new Map<string, number>() };
      current.total += 1;
      current.provinces.set(row.targetProvince, (current.provinces.get(row.targetProvince) || 0) + 1);
      grouped.set(key, current);
    });
    return [...grouped.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "zh-CN"));
  }, [footprintRows]);
  const shownFootprintStats = footprintLimit === "all" ? footprintStats : footprintStats.slice(0, Number(footprintLimit));
  const footprintProvinces = [...new Set(shownFootprintStats.flatMap((row) => [...row.provinces.keys()]))].sort((a, b) => shownFootprintStats.reduce((sum, row) => sum + (row.provinces.get(b) || 0) - (row.provinces.get(a) || 0), 0));
  const institutionFootprintOption = useMemo<EChartsOption>(() => ({
    animation: false,
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: { type: "scroll", top: 2, textStyle: axisLabel },
    grid: { left: 64, right: 24, top: 52, bottom: 100 },
    xAxis: { type: "category", data: shownFootprintStats.map((row) => row.name), axisLine, axisTick: { show: false }, axisLabel: { ...axisLabel, interval: 0, rotate: 38, hideOverlap: true } },
    yAxis: { type: "value", name: "服务重点排放单位/家", axisLine, axisLabel: { ...axisLabel, formatter: (value: number) => compactNumber(value, 0) }, splitLine },
    series: footprintProvinces.map((province, index) => ({ name: province, type: "bar", stack: "business", barMaxWidth: 34, data: shownFootprintStats.map((row) => row.provinces.get(province) || 0), itemStyle: { color: ["#147d70", "#1f5f8b", "#ba8744", "#9b4d5b", "#657b75", "#704b86", "#5f9ea0", "#b07255"][index % 8] } })),
  }), [footprintProvinces, shownFootprintStats]);

  const participantRows = participantMode === "enterprise" ? participants?.keyEmitters || [] : participants?.verificationInstitutions || [];
  const participantYears = [...new Set(participantRows.map((row) => row.year))].sort().reverse();
  const participantProvinces = [...new Set(participantRows.map((row) => row.province).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const participantIndustries = [...new Set(participantRows.map((row) => row.industry).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const filteredParticipantRows = participantRows.filter((row) => {
    const haystack = `${row.name}|${row.uscc}|${row.city}|${row.authority}`.toLowerCase();
    return (!participantYear || row.year === participantYear)
      && (!participantProvince || row.province === participantProvince)
      && (!participantIndustry || row.industry === participantIndustry)
      && (!participantSearch || haystack.includes(participantSearch.trim().toLowerCase()));
  });
  const participantPageSize = 15;
  const participantPages = Math.max(1, Math.ceil(filteredParticipantRows.length / participantPageSize));
  const currentParticipantPage = Math.min(participantPage, participantPages);
  const pagedParticipantRows = filteredParticipantRows.slice((currentParticipantPage - 1) * participantPageSize, currentParticipantPage * participantPageSize);

  const openParticipant = (row: KeyEmitter | VerificationInstitution) => {
    if (participantMode === "enterprise") {
      const enterprise = row as KeyEmitter;
      const related = participants?.fulfillment.filter((item) => item.uscc === enterprise.uscc).sort((a, b) => b.year.localeCompare(a.year));
      setDrawer({
        eyebrow: "KEY EMITTER RECORD",
        title: enterprise.name,
        description: "年度重点排放单位公开记录；下方履约记录按统一社会信用代码关联。",
        fields: [
          { label: "数据年度", value: enterprise.year },
          { label: "省份", value: enterprise.province },
          { label: "城市", value: enterprise.city },
          { label: "行业", value: enterprise.industry },
          { label: "统一社会信用代码", value: enterprise.uscc },
          { label: "公开单位", value: enterprise.authority },
          { label: "公开时间", value: enterprise.publishedAt },
        ],
        related,
      });
    } else {
      const institution = row as VerificationInstitution;
      const sameInstitution = participants?.verificationInstitutions.filter((item) => item.uscc === institution.uscc || (!institution.uscc && item.name === institution.name)) || [institution];
      const latestInstitution = sameInstitution.slice().sort((a, b) => b.year.localeCompare(a.year))[0] || institution;
      const relevantInstitutionIds = (participantYear === "" ? sameInstitution : [institution]).map((item) => item.id);
      const details = data.participants.verificationDetails.filter((item) => relevantInstitutionIds.includes(item.verification_list_id));
      const detail = details.find((item) => item.verification_list_id === latestInstitution.id) || details[0];
      const targets = data.participants.verificationTargets
        .filter((item) => relevantInstitutionIds.includes(item.verificationId))
        .sort((a, b) => b.year.localeCompare(a.year) || a.targetOrder - b.targetOrder || a.targetName.localeCompare(b.targetName, "zh-CN"));
      const missingReason = institution.detailStatus === "官网未附PDF"
        ? "官网公开列表未附PDF；列表字段已收录，不推测附件内容。"
        : institution.detailStatus === "官网链接失效"
          ? "官网公开了PDF地址，但当前官方链接无法访问；列表字段已收录。"
          : "该条记录的PDF详情尚未通过解析校验；列表字段为全量公开数据。";
      setDrawer({
        eyebrow: "VERIFICATION INSTITUTION",
        title: latestInstitution.name,
        description: detail ? `${participantYear === "" ? "基本信息展示最新数据年度；" : ""}PDF详情已经解析并通过规则校验；共提取 ${exactNumber(targets.length)} 家服务的重点排放单位。` : missingReason,
        fields: [
          { label: "数据年度", value: latestInstitution.year },
          { label: "注册省市", value: [latestInstitution.province, latestInstitution.city].filter(Boolean).join(" · ") },
          { label: "核查行业", value: latestInstitution.industry },
          { label: "统一社会信用代码", value: latestInstitution.uscc },
          { label: "公开单位", value: latestInstitution.authority },
          { label: "公开时间", value: latestInstitution.publishedAt },
          { label: "法定代表人", value: detail?.legal_representative || "待解析" },
          { label: "注册资金", value: detail?.registered_capital_amount != null ? `${detail.registered_capital_amount}${detail.registered_capital_unit}` : "待解析" },
          { label: "办公场所", value: detail?.office_address || "待解析" },
          { label: "联系方式", value: detail?.contact_details || "待解析" },
          { label: "不良记录", value: detail?.bad_record || "待解析" },
          ...(detail ? [{ label: "详情PDF", value: "打开官方PDF", href: detail.pdf_url }] : []),
        ],
        targets,
        passRates: details.sort((a, b) => b.year - a.year).map((item) => ({ year: String(item.year), industry: item.industry, passRate: item.pass_rate, targetCount: item.target_count, pdfUrl: item.pdf_url })),
      });
    }
  };

  const drillToParticipants = (province: string, nextIndustry = coverageIndustryFilter) => {
    setParticipantMode("enterprise");
    setParticipantYear(coverageYear);
    setParticipantProvince(province);
    setParticipantIndustry(nextIndustry);
    setParticipantPage(1);
    void loadParticipants();
    window.setTimeout(() => document.getElementById("participants")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  const openAuditProvince = async (province: string) => {
    const directory = participants || await loadParticipants();
    const rows = auditRows.filter((row) => row.targetProvince === province);
    const grouped = new Map<string, VerificationTarget[]>();
    rows.forEach((row) => grouped.set(row.verificationId, [...(grouped.get(row.verificationId) || []), row]));
    const auditInstitutions = [...grouped.entries()].map(([verificationId, institutionRows]) => {
      const relation = institutionRows[0];
      const institution = directory?.verificationInstitutions.find((item) => item.id === verificationId);
      const detail = data.participants.verificationDetails.find((item) => item.verification_list_id === verificationId);
      return {
        year: relation.year,
        name: relation.institutionName,
        province: institution?.province || relation.institutionProvince || "待补充",
        city: institution?.city || "",
        industry: relation.industry,
        uscc: relation.institutionUscc,
        passRate: detail?.pass_rate ?? null,
        volume: institutionRows.length,
      };
    }).sort((a, b) => b.volume - a.volume || a.name.localeCompare(b.name, "zh-CN"));
    setDrawer({
      eyebrow: "VERIFICATION MARKET",
      title: `${province}核查服务机构`,
      description: `${auditYear ? `${auditYear}年` : "全部年度"}公开PDF关系数据；按该省重点排放单位的服务业务量排序。`,
      fields: [
        { label: "被核查单位省份", value: province },
        { label: "关系记录", value: `${exactNumber(rows.length)} 条` },
        { label: "本地机构占比", value: percent(rows.length ? rows.filter((row) => row.isLocal).length / rows.length : null, 1) },
      ],
      auditInstitutions,
    });
  };

  const klineExport = exportSection("CEA日度价格与分交易方式成交量", priceRows.map((row) => ({
    日期: row.date, 标的: row.subject, 开盘价: row.open, 最高价: row.high, 最低价: row.low, 收盘价: row.close,
    挂牌协议成交量: row.listingVolume, 大宗协议成交量: row.blockVolume, 单向竞价成交量: row.auctionVolume,
  })));

  return (
    <>
      <header className="site-header cea-site-header">
        <a className="header-title" href="#">全国碳排放权交易市场（CEA）信息追踪</a>
        <nav aria-label="CEA页面章节">
          <a href="#coverage">覆盖范围</a>
          <a href="#cea-trade">市场交易</a>
          <a href="#participants">市场参与方</a>
          <a href="#cea-data-sources">数据来源与说明</a>
        </nav>
        <div className="header-actions">
          <span className="freshness">交易截至 <strong>{data.tradeDataThrough}</strong></span>
          <AccountAccessButton />
        </div>
      </header>

      <main className="dashboard-shell cea-dashboard-shell">
        <section className="hero cea-hero">
          <div className="hero-copy hero-centered">
            <div className="eyebrow">CHINA EMISSIONS ALLOWANCE · CEA</div>
            <h1>全国碳排放权交易市场（CEA） 信息追踪</h1>
          </div>
        </section>

        <section className="market-pulse cea-market-pulse" aria-labelledby="cea-market-pulse-title">
          <div className="market-pulse-heading">
            <div><div className="eyebrow">MARKET AT A GLANCE</div><h2 id="cea-market-pulse-title">关键指标</h2></div>
            <p>企业覆盖采用生态环境部2025年口径；交易数据截至 {data.tradeDataThrough}</p>
          </div>
          <div className="market-pulse-grid">
            <KpiCard label="覆盖行业数量" value="4" unit="个" note="发电、钢铁、水泥、铝冶炼" tone="ink" />
            <KpiCard label="覆盖温室气体" value={exactNumber(data.officialCoverage.gases.length)} unit="种" note="CO₂ · CF₄ · C₂F₆" />
            <KpiCard label="配额管理重点排放单位" value={exactNumber(data.officialCoverage.managedEntities)} unit="家" note="2025年官方口径" tooltip={data.officialCoverage.sectorCounts.map((row) => `${row.sector} ${exactNumber(row.count)} 家`).join(" · ")} tone="ink" />
            <KpiCard label="覆盖全国二氧化碳排放" value="约80亿吨" note="占全国总量的60%以上" tone="blue" />
            <KpiCard label="累计成交量" value={compactNumber(data.marketSummary.cumulativeVolume)} unit="吨" note={exactNumber(data.marketSummary.cumulativeVolume)} />
            <KpiCard label="累计成交额" value={compactNumber(data.marketSummary.cumulativeAmount)} unit="元" note={exactNumber(data.marketSummary.cumulativeAmount, 2)} tone="blue" />
            <KpiCard label="累计平均成交价" value={exactNumber(data.marketSummary.cumulativeAveragePrice || 0, 2)} unit="元/吨" note="成交额 ÷ 成交量" tone="rust" />
            <KpiCard label="最新综合收盘价" value={exactNumber(data.marketSummary.latestClose || 0, 2)} unit="元/吨" note={data.marketSummary.latestDate} tone="rust" />
          </div>
        </section>

        <section id="coverage" className="dashboard-section">
          <SectionHeading index="01" eyebrow="MARKET COVERAGE" title="覆盖范围" description="区分官方配额管理口径与信息公开列表口径，并从年度、行业和地域观察覆盖边界。" />
          <div className="two-column-grid cea-coverage-grid">
            <article className="panel cea-coverage-panel">
              <PanelTitle label="FIGURE 01A" title="重点排放单位地域分布" note={`按${coverageIndustryFilter || "全部行业"}公开记录计数；点击省份直接查看企业名单。`} controls={<div className="cea-filter-controls"><SelectControl label="公开名单年度" value={coverageYear} onChange={(value) => { setCoverageYear(value); setCoverageIndustryFilter(""); }} options={data.coverage.yearStats.map((row) => ({ value: row.year, label: `${row.year}年` })).reverse()} /><SelectControl label="行业" value={coverageIndustryFilter} onChange={setCoverageIndustryFilter} options={[{ value: "", label: "全部行业" }, ...coverageIndustryOptions]} /></div>} />
              {mapReady ? <EChart option={coverageMapOption} className="map-chart cea-coverage-map" ariaLabel={`${coverageYear}年${coverageIndustryFilter || "全部行业"}重点排放单位省级分布地图`} exportTitle="重点排放单位地域分布" exportFileName={`FIGURE-01A-${coverageYear}-${coverageIndustryFilter || "全部行业"}-重点排放单位地域分布`} exportSections={exportSection("省级重点排放单位", coverageRows.map((row) => ({ 年度: row.year, 行业: coverageIndustryFilter || "全部行业", 省份: row.province, 公开记录: row.records, 去重企业: row.uniqueEntities })))} onClick={(params) => { const mapName = String(params.name || ""); const row = coverageRows.find((item) => provinceMapName(item.province) === mapName); if (row) drillToParticipants(row.province); }} /> : <div className="chart-placeholder">地图加载中…</div>}
            </article>
            <article className="panel cea-coverage-panel">
              <PanelTitle label="FIGURE 01B" title="重点排放单位行业分布" note={`${coverageYear}年公开名单，按企业记录数降序排列。`} />
              <EChart option={coverageIndustryOption} className="cea-industry-chart" ariaLabel={`${coverageYear}年重点排放单位行业分布`} exportTitle="重点排放单位行业分布" exportFileName={`FIGURE-01B-${coverageYear}-重点排放单位行业分布`} exportSections={exportSection("行业重点排放单位", coverageIndustryRows.map((row) => ({ 年度: row.year, 行业: row.industry, 公开记录: row.records })))} />
            </article>
          </div>

          <div className="two-column-grid cea-fulfillment-grid">
            <article className="panel">
              <PanelTitle label="FIGURE 03" title="履约状态年度结构" note="堆积柱为公开记录，折线为按期履约率；状态标志可能重叠，保留原值。" />
              <EChart option={fulfillmentOption} className="trend-chart cea-mid-chart" ariaLabel="全国碳市场履约状态年度堆积柱状图及按期履约率" exportTitle="履约状态年度结构" exportFileName="FIGURE-03-履约状态年度结构" exportSections={exportSection("年度履约状态", data.participants.fulfillmentYearStats.map((row) => ({ 年度: row.year, 公开记录: row.records, 按期履约: row.onTime, 按期履约率: row.records ? row.onTime / row.records : null, 逾期履约: row.overdue, 未履约: row.incomplete })))} />
            </article>
            <div className="cea-fulfillment-spacer" aria-hidden="true" />
          </div>
        </section>

        <section id="cea-trade" className="dashboard-section">
          <SectionHeading index="02" eyebrow="MARKET TRANSACTIONS" title="市场交易" description="从价格、成交方式、配额规格、换手率与跨市场价差观察全国CEA市场的交易结构。" />
          <article className="panel cea-full-width-panel">
            <PanelTitle label="FIGURE 04" title={`CEA${priceView === "kline" ? "日K线" : "收盘价"}与分交易方式成交量`} note="价格使用左轴，挂牌协议、大宗协议和单向竞价成交量叠加在图底并使用右轴；无交易日期保持空白。" controls={<div className="cea-filter-controls"><SelectControl label="CEA规格" value={subject} onChange={setSubject} options={subjectOptions} /><SelectControl label="价格" value={priceView} onChange={(value) => setPriceView(value as "kline" | "close")} options={[{ value: "kline", label: "K线图" }, { value: "close", label: "收盘价" }]} /></div>} />
            <EChart option={klineOption} className="cea-kline-chart" ariaLabel={`CEA${priceView === "kline" ? "日K线" : "收盘价"}与三种交易方式成交量`} exportTitle={`CEA${priceView === "kline" ? "日K线" : "收盘价"}与分交易方式成交量`} exportFileName={`FIGURE-04-${subject}-${priceView === "kline" ? "日K线" : "收盘价"}-与成交量`} exportSections={klineExport} />
          </article>

          <div className="two-column-grid cea-trade-grid">
            <article className="panel">
              <PanelTitle label="FIGURE 05" title="各年度成交均价与成交量" note="折线为三种交易方式成交均价，堆积柱为成交量。" />
              <EChart option={annualOption} className="trend-chart cea-large-chart" ariaLabel="各年度三种交易方式成交均价与成交量" exportTitle="各年度成交均价与成交量" exportFileName={`FIGURE-05-${subject}-年度均价与成交量`} exportSections={exportSection("年度分交易方式统计", annualRows.map((row) => ({ 年度: row.period, 标的: row.subject, 交易方式: row.method, 成交量: row.volume, 成交额: row.amount, 成交均价: row.averagePrice })))} />
            </article>
            <article className="panel">
              <PanelTitle label="FIGURE 07" title={`${monthlyYear}年月度成交均价与成交量`} note="折线为三种交易方式成交均价，堆积柱为成交量。" controls={<SelectControl label="年度" value={monthlyYear} onChange={setMonthlyYear} options={yearOptions.slice().reverse()} />} />
              <EChart option={monthlyOption} className="trend-chart cea-large-chart" ariaLabel={`${monthlyYear}年CEA月度成交均价与成交量`} exportTitle="月度成交均价与成交量" exportFileName={`FIGURE-07-${subject}-${monthlyYear}月度均价与成交量`} exportSections={exportSection("月度分交易方式统计", monthlyRows.map((row) => ({ 月份: row.period, 标的: row.subject, 交易方式: row.method, 成交量: row.volume, 成交额: row.amount, 成交均价: row.averagePrice })))} />
            </article>
          </div>

          <div className="two-column-grid cea-trade-grid">
            <article className="panel">
              <PanelTitle label="FIGURE 06" title="年度市场换手率" note="总配额按用户给定口径；换手率＝综合行情成交量÷年度总配额。" badge="分析假设" />
              <EChart option={turnoverOption} className="trend-chart cea-large-chart" ariaLabel="全国CEA市场年度换手率" exportTitle="年度市场换手率" exportFileName="FIGURE-06-年度市场换手率" exportSections={exportSection("年度换手率", data.turnoverByYear.map((row) => ({ 年度: row.year, 成交量_吨: row.volume, 总配额假设_吨: row.allowance, 换手率: row.turnoverRate })))} />
            </article>
            <article className="panel">
              <PanelTitle label="FIGURE 08" title="各年度碳价走势对比" note="每年首个有收盘价的交易日＝100；2021年基期为7月16日开市首日。" />
              <EChart option={normalizedOption} className="trend-chart cea-large-chart" ariaLabel="2021至2026年CEA价格标准化走势" exportTitle="各年度碳价走势对比" exportFileName={`FIGURE-08-${subject}-年度价格标准化`} exportSections={exportSection("标准化价格原始数据", selectedDaily.filter((row) => row.close != null).map((row) => ({ 日期: row.date, 标的: row.subject, 收盘价: row.close })))} />
            </article>
          </div>

          <article className="panel cea-full-width-panel">
            <PanelTitle label="FIGURE 09" title="CEA交易量日历热力图" note="按交易日总成交量着色；选择年度比较履约期前后的活跃度。" controls={<SelectControl label="年度" value={heatYear} onChange={setHeatYear} options={yearOptions.slice().reverse()} />} />
            <EChart option={heatOption} className="cea-calendar-chart" ariaLabel={`${heatYear}年CEA交易量日历热力图`} exportTitle="CEA交易量日历热力图" exportFileName={`FIGURE-09-${subject}-${heatYear}交易量热力图`} exportSections={exportSection("日度成交量", heatRows.map((row) => ({ 日期: row.date, 标的: row.subject, 总成交量: row.totalVolume })))} />
          </article>

          <div className="cea-structure-heading">
            <div><span>2.1</span><div><h3>交易结构</h3><p>统一选择累计或单个自然年度，三张图同步更新。</p></div></div>
            <SelectControl label="统计周期" value={structurePeriod} onChange={setStructurePeriod} options={[{ value: "all", label: "累计" }, ...yearOptions.slice().reverse()]} />
          </div>
          <div className="cea-three-column-grid">
            <article className="panel"><PanelTitle label="FIGURE 10A" title="交易方式成交量占比" /><EChart option={methodStructureOption} className="cea-structure-chart" ariaLabel="三种交易方式成交量占比" exportTitle="交易方式成交量占比" exportFileName={`FIGURE-10A-${structurePeriod}-交易方式成交量占比`} exportSections={exportSection("交易方式结构", methodStructure.map((row) => ({ 交易方式: row.shortName, 成交量: row.volume, 成交额: row.amount, 平均价格: row.averagePrice })))} /></article>
            <article className="panel"><PanelTitle label="FIGURE 10B" title="交易方式平均价格" /><EChart option={methodPriceOption} className="cea-structure-chart" ariaLabel="三种交易方式平均价格" exportTitle="交易方式平均价格" exportFileName={`FIGURE-10B-${structurePeriod}-交易方式平均价格`} exportSections={exportSection("交易方式平均价格", methodStructure.map((row) => ({ 交易方式: row.shortName, 平均价格: row.averagePrice })))} /></article>
            <article className="panel"><PanelTitle label="FIGURE 10C" title="配额规格成交量占比" note="综合行情不重复计入。" /><EChart option={subjectStructureOption} className="cea-structure-chart" ariaLabel="各CEA配额规格成交量占比" exportTitle="配额规格成交量占比" exportFileName={`FIGURE-10C-${structurePeriod}-配额规格成交量占比`} exportSections={exportSection("配额规格结构", subjectStructure.map((row) => ({ 配额规格: row.subject, 成交量: row.volume })))} /></article>
          </div>

          <article className="panel cea-full-width-panel">
            <PanelTitle label="FIGURE 11" title="CEA—CCER月度价格比较" note="柱状价差比例＝CCER月均价÷CEA月均价－1；CCER高于CEA时为正。" />
            <EChart option={priceComparisonOption} className="trend-chart cea-comparison-chart" ariaLabel="CEA与CCER月度价格及CCER相对价差比例" exportTitle="CEA与CCER月度价格比较" exportFileName="FIGURE-11-CEA与CCER月度价格比较" exportSections={exportSection("CEA-CCER月度价格", data.priceComparison.map((row) => ({ 月份: row.month, CEA月均价: row.ceaPrice, CCER月均价: row.ccerPrice, CCER相对价差比例: row.spreadRatio })))} />
          </article>
        </section>

        <section id="participants" className="dashboard-section">
          <SectionHeading index="03" eyebrow="MARKET PARTICIPANTS" title="市场参与方" description={pdfCoverage.publishReady ? `用年度公开名录查询重点排放单位和技术服务机构；机构—企业关系图使用${pdfCoverageText}中已通过校验的数据（${sourcePdfExceptions}）。` : "用年度公开名录查询重点排放单位和技术服务机构；机构—企业关系图将在PDF全量校验通过后开放。"} />

          <article className="panel cea-participant-panel">
            <PanelTitle label="TABLE 01" title="重点排放单位与核查机构查询" note={`企业列表${exactNumber(data.participants.keyEmitterRecords)}条、机构列表${exactNumber(data.participants.verificationRecords)}条；完整名录按需加载，避免拖慢首屏。`} badge="全量列表" />
            <div className="participant-mode-switch" role="tablist" aria-label="参与方查询维度">
              <button type="button" className={participantMode === "enterprise" ? "active" : ""} onClick={() => changeParticipantMode("enterprise")}>重点排放单位 <span>{exactNumber(data.participants.keyEmitterRecords)}</span></button>
              <button type="button" className={participantMode === "institution" ? "active" : ""} onClick={() => changeParticipantMode("institution")}>技术服务机构 <span>{exactNumber(data.participants.verificationRecords)}</span></button>
            </div>
            {!participants ? (
              <div className="participant-load-state">
                <div><strong>完整年度名录已经接入</strong><p>点击后载入企业、机构和履约明细；首次载入约9MB。</p></div>
                <button type="button" onClick={() => void loadParticipants()} disabled={participantsLoading}>{participantsLoading ? "正在载入…" : "载入完整名录"}</button>
                {participantsError ? <span>{participantsError}</span> : null}
              </div>
            ) : (
              <>
                <div className="participant-filters">
                  <SelectControl label="年度" value={participantYear} onChange={(value) => { setParticipantYear(value); setParticipantPage(1); }} options={[{ value: "", label: "全部年度" }, ...participantYears.map((year) => ({ value: year, label: `${year}年` }))]} />
                  <SelectControl label="省份" value={participantProvince} onChange={(value) => { setParticipantProvince(value); setParticipantPage(1); }} options={[{ value: "", label: "全部省份" }, ...participantProvinces.map((province) => ({ value: province, label: province }))]} />
                  <SelectControl label="行业" value={participantIndustry} onChange={(value) => { setParticipantIndustry(value); setParticipantPage(1); }} options={[{ value: "", label: "全部行业" }, ...participantIndustries.map((industry) => ({ value: industry, label: industry }))]} />
                  <label className="participant-search"><span>名称或统一代码</span><input value={participantSearch} onChange={(event) => { setParticipantSearch(event.target.value); setParticipantPage(1); }} placeholder="输入企业或机构名称" /></label>
                </div>
                <div className="participant-result-summary"><strong>{exactNumber(filteredParticipantRows.length)}</strong> 条匹配记录 <span>点击“详情”查看基本信息、官方PDF及服务的重点排放单位</span></div>
                <div className="cea-table-scroll">
                  <table className="cea-data-table">
                    <thead><tr><th>年度</th><th>省市</th><th>行业</th><th>{participantMode === "enterprise" ? "重点排放单位" : "技术服务机构"}</th><th>统一社会信用代码</th><th>公开单位</th><th>公开时间</th><th>操作</th></tr></thead>
                    <tbody>
                      {pagedParticipantRows.map((row) => (
                        <tr key={row.id}><td>{row.year}</td><td>{[row.province, row.city].filter(Boolean).join(" · ") || "—"}</td><td>{row.industry}</td><td><strong>{row.name}</strong></td><td className="code-cell">{row.uscc}</td><td>{row.authority}</td><td>{row.publishedAt}</td><td><button type="button" className="table-detail-button" onClick={() => openParticipant(row)}>详情</button></td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="cea-pagination"><span>第 {currentParticipantPage} / {participantPages} 页</span><div><button type="button" disabled={currentParticipantPage <= 1} onClick={() => setParticipantPage((page) => Math.max(1, page - 1))}>上一页</button><button type="button" disabled={currentParticipantPage >= participantPages} onClick={() => setParticipantPage((page) => Math.min(participantPages, page + 1))}>下一页</button></div></div>
              </>
            )}
          </article>

          <div className="subsection-heading cea-subsection-heading"><span>3.1</span><div><h3>核查服务市场格局</h3><p>{pdfCoverage.publishReady ? `以下图表使用${pdfCoverageText}中提取并去重的${exactNumber(pdfCoverage.targets)}条核查对象关系；${sourcePdfExceptions}不进入关系图，更新未通过完整性门槛时会继续保留上一版数据。` : "PDF详情尚未达到全量发布门槛，关系图暂不形成全国性结论；自动更新会在完整性校验通过后开放。"}</p></div></div>
          <article className="panel cea-full-width-panel">
            <PanelTitle label="FIGURE 12" title="各地区核查业务的本地与外地机构分配" note="100%堆积柱按本地机构占比降序排列；折线为前五家技术服务机构的业务集中度（CR5）。点击柱子查看机构名单。" badge={relationshipBadge} controls={<SelectControl label="年度" value={auditYear} onChange={setAuditYear} options={[{ value: "", label: "全部年度" }, ...yearOptions.slice().reverse()]} />} />
            <EChart option={auditStructureOption} className="cea-participant-chart cea-wide-participant-chart" ariaLabel="各省份本地与外地技术服务机构业务占比及CR5" exportTitle="各地区核查业务的本地与外地机构分配" exportFileName={`FIGURE-12-${auditYear || "全部年度"}-核查机构结构`} exportSections={exportSection("核查关系", auditRows.map((row) => ({ 年度: row.year, 被核查单位省份: row.targetProvince, 核查机构: row.institutionName, 机构省份: row.institutionProvince, 本地机构: row.isLocal ? "是" : "否", 被核查单位: row.targetName })))} onClick={(params) => { const province = String(params.name || ""); if (province) void openAuditProvince(province); }} />
          </article>
          <article className="panel cea-full-width-panel">
            <PanelTitle label="FIGURE 13" title="技术服务机构跨省业务分布" note="柱子为各机构服务的重点排放单位数量，堆积颜色表示被核查单位所在省份；机构按业务量降序排列。" badge={relationshipBadge} controls={<div className="cea-filter-controls"><SelectControl label="年度" value={footprintYear} onChange={setFootprintYear} options={[{ value: "", label: "全部年度" }, ...yearOptions.slice().reverse()]} /><SelectControl label="技术服务机构" value={footprintLimit} onChange={setFootprintLimit} options={[{ value: "20", label: "TOP20" }, { value: "50", label: "TOP50" }, { value: "100", label: "TOP100" }, { value: "all", label: "全部" }]} /></div>} />
            <EChart option={institutionFootprintOption} className="cea-participant-chart cea-wide-participant-chart" ariaLabel="技术服务机构跨省业务分布堆积柱状图" exportTitle="技术服务机构跨省业务分布" exportFileName={`FIGURE-13-${footprintYear || "全部年度"}-${footprintLimit}-技术服务机构业务分布`} exportSections={exportSection("机构业务版图", footprintRows.map((row) => ({ 年度: row.year, 技术服务机构: row.institutionName, 被核查单位省份: row.targetProvince, 被核查单位: row.targetName, 行业: row.industry })))} />
          </article>
        </section>

        <section id="cea-data-sources" className="methodology-notes cea-methodology-notes" aria-labelledby="cea-data-sources-title">
          <article>
            <div className="eyebrow">DATA DEFINITIONS</div>
            <h2 id="cea-data-sources-title">数据口径</h2>
            {Object.entries(data.definitions).map(([key, value], index) => <p key={key}><strong>{String(index + 1).padStart(2, "0")}</strong>{value}</p>)}
          </article>
          <article>
            <div className="eyebrow">DATA QUALITY</div>
            <h2>完整性与限制</h2>
            <p><strong>01</strong>交易日历连续，{tradeCalendarText}；价格行情存在{exactNumber(tradeQuality?.warning_issues || 0)}项警告、{exactNumber(tradeQuality?.error_issues || 0)}项错误。</p>
            <p><strong>02</strong>重点排放单位{exactNumber(data.participants.keyEmitterRecords)}条、核查机构{exactNumber(data.participants.verificationRecords)}条、履约信息{exactNumber(data.participants.fulfillmentRecords)}条，均已完成分页核对。</p>
            <p><strong>03</strong>{pdfCoverage.publishReady ? `核查机构公开名单已逐条核对：${pdfCoverageText}，${sourcePdfExceptions}，未解释缺口与解析错误均为0；形成${exactNumber(pdfCoverage.targets)}条公开记录—企业关系。` : "核查机构PDF详情尚未达到全量发布门槛，机构—企业关系图保持关闭；候选数据不会覆盖线上版本。"}</p>
            <p><strong>04</strong>换手率总配额采用用户给定分析口径，并非官方最终配额清缴量。</p>
          </article>
          <div className="sources-row">
            {data.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label}</a>)}
          </div>
        </section>

        <section className="contact-author" aria-labelledby="cea-contact-author-title">
          <div className="contact-author-copy">
            <div className="eyebrow">CONTACT & NOTICE</div>
            <h2 id="cea-contact-author-title">联系作者</h2>
            <p className="author-name">作者：<strong>逃跑大魔王</strong></p>
            <p>本页面基于官方公开数据和用户给定分析口径制作，第一版优先建立完整的信息结构、筛选和下钻能力。未完成的数据会持续补齐，不以样本替代全量结论。</p>
          </div>
          <figure className="contact-qr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={localAsset("wechat-author-qr.png")} alt="逃跑大魔王的微信二维码" width={639} height={637} />
            <figcaption>微信扫码联系作者</figcaption>
          </figure>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-brand"><strong>© 2026 逃跑大魔王。保留所有权利。</strong><span>CEA第一版 · 强制碳市场独立视图</span></div>
        <p>本站基于公开信息进行整理与可视化，不构成交易、投资、合规或法律建议。原始数据相关权利归发布机构所有。</p>
        <span className="footer-snapshot">数据快照：{data.generatedAt.replace("T", " ").slice(0, 19)}</span>
      </footer>

      <CeaDrawer state={drawer} onClose={() => setDrawer(null)} />
    </>
  );
}
