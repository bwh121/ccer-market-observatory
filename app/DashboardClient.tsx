"use client";

import type { EChartsOption } from "echarts";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { EChart, echarts } from "./components/EChart";
import { DataDownloadMenu } from "./components/DataActions";
import type { ExportRow, ExportSection } from "./components/DataActions";
import { AccountAccessButton } from "./components/ExportAccess";
import { bulletinPeriodLabel, bulletinPeriodRange } from "./dateUtils";
import type { BulletinPeriod } from "./dateUtils";

type DashboardBuildEnv = { BASE_URL?: string; VITE_STATIC_GITHUB?: string };
const BUILD_ENV = (import.meta as ImportMeta & { env?: DashboardBuildEnv }).env || {};
const SITE_BASE = BUILD_ENV.BASE_URL || "/";
const IS_GITHUB_PAGES = BUILD_ENV.VITE_STATIC_GITHUB === "true";
const localAsset = (path: string) => `${SITE_BASE.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;

type Trade = {
  date: string;
  volume: number;
  turnover: number;
  price: number | null;
  cumulativeVolume: number;
  cumulativeTurnover: number;
  status: string;
  note: string;
  sourceUrl: string;
};

type CarbonPriceMonth = {
  month: string;
  ccerVolume: number;
  ccerTurnover: number;
  ccerPrice: number | null;
  ceaVolume: number;
  ceaTurnover: number;
  ceaPrice: number | null;
  priceSpread: number | null;
  premiumRate: number | null;
};

type Project = {
  snapshotKey: string;
  categoryCode: string;
  categoryName: string;
  statusName: string;
  projectName: string;
  projectCode: string;
  commencementDate: string;
  registrationDate: string;
  projectFirstSeenDate: string;
  projectFirstSeenLabel: string;
  creditingStart: string;
  creditingEnd: string;
  projectLifetimeYears: number;
  accountingPeriodStart: string;
  accountingPeriodEnd: string;
  accountingPeriodSequence: string;
  detailUrl: string;
  province: string;
  longitude: number | null;
  latitude: number | null;
  methodology: string;
  methodologyCode: string;
  owner: string;
  auditAgency: string;
  verifyAgency: string;
  expectedAnnual: number;
  expectedTotal: number;
  certifiedNum: number;
  actualReduction: number;
  reductionYears: number;
  reductionYearLabels: string[];
  reductionRegistrationDate: string;
  reductionRegistrationLabel: string;
  reductionEntries: {
    detailIndex: number;
    registrationYear: string;
    amount: number;
    status: string;
    accountingPeriodSequence: string;
    reductionRegistrationDate: string;
  }[];
  actualAnnualAverage: number;
  expectedAnnualAchievementRate: number | null;
};

type DashboardData = {
  generatedAt: string;
  dataThrough: string;
  tradeSummary: {
    latestDate: string;
    latestPrice: number | null;
    latestVolume: number;
    latestTurnover: number;
    cumulativeAveragePrice: number | null;
    cumulativeVolume: number;
    cumulativeTurnover: number;
  };
  trades: Trade[];
  carbonPriceComparison: {
    ccerDataThrough: string;
    ceaDataThrough: string;
    months: CarbonPriceMonth[];
  };
  projects: Project[];
  methodologies: string[];
  provinces: string[];
  statusOrder: { code: string; name: string }[];
  quality: {
    projectRecords: number;
    tradeRecords: number;
    mappedRegistered: number;
    registeredTotal: number;
    swappedCoordinates: number;
    attachmentAccess: string;
    inferredTradeRows: number;
    reviewedTradeRows: number;
  };
  definitions: Record<string, string>;
  sources: { label: string; url: string }[];
};

type DrawerItem = {
  title: string;
  href?: string;
  meta: { label: string; value: string }[];
};

type DrawerGroup = {
  title: string;
  items: DrawerItem[];
};

type DrawerTab = {
  id: string;
  label: string;
  items?: DrawerItem[];
  groups?: DrawerGroup[];
};

type DrawerState = {
  eyebrow: string;
  title: string;
  description: string;
  items: DrawerItem[];
  groups?: DrawerGroup[];
  tableColumns?: string[];
  tabs?: DrawerTab[];
  exportFileName?: string;
};

type OwnerRow = {
  name: string;
  projectCount: number;
  methodologies: string[];
  registeredCount: number;
  registeredReductionCount: number;
  expectedTotal: number;
  actualReduction: number;
  projects: Project[];
};

type InstitutionRow = {
  name: string;
  auditCount: number;
  verifyCount: number;
  totalCount: number;
  details: { role: string; project: Project }[];
};

type OwnerSortKey =
  | "name"
  | "projectCount"
  | "methodologies"
  | "registeredCount"
  | "registeredReductionCount"
  | "expectedTotal"
  | "actualReduction";

type SortDirection = "asc" | "desc";

const methodColor = (index: number) => `hsl(${(164 + index * 137.508) % 360} 43% 39%)`;

const STATUS_COLORS: Record<string, string> = {
  "1": "#2a9d8f",
  "1-1": "#7ba7a0",
  "2": "#1f5f8b",
  "3": "#e9a23b",
  "3-1": "#c58b55",
  "4": "#9b4d5b",
  "6": "#687078",
};

const OWNER_PAGE_SIZE = 10;

const INSTITUTION_QUALIFICATIONS = [
  { name: "中国质量认证中心有限公司", field: "能源产业（可再生/不可再生）", approval: "CNCA-R-2002-001", batch: "第一批" },
  { name: "中国船级社质量认证有限公司", field: "能源产业（可再生/不可再生）", approval: "CNCA-R-2002-005", batch: "第一批" },
  { name: "广州赛宝认证中心服务有限公司", field: "能源产业（可再生/不可再生）", approval: "CNCA-R-2002-012", batch: "第一批" },
  { name: "中环联合（北京）认证中心有限公司", field: "能源产业（可再生/不可再生）", approval: "CNCA-R-2002-105", batch: "第一批" },
  { name: "中国质量认证中心有限公司", field: "林业和其他碳汇类型", approval: "CNCA-R-2002-001", batch: "第一批" },
  { name: "中国船级社质量认证有限公司", field: "林业和其他碳汇类型", approval: "CNCA-R-2002-005", batch: "第一批" },
  { name: "广州赛宝认证中心服务有限公司", field: "林业和其他碳汇类型", approval: "CNCA-R-2002-012", batch: "第一批" },
  { name: "中环联合（北京）认证中心有限公司", field: "林业和其他碳汇类型", approval: "CNCA-R-2002-105", batch: "第一批" },
  { name: "中国林业科学研究院林业科技信息研究所", field: "林业和其他碳汇类型", approval: "CNCA-R-2024-1364", batch: "第一批" },
  { name: "方圆标志认证集团有限公司", field: "能源产业（可再生/不可再生资源）", approval: "CNCA-R-2002-002", batch: "第二批" },
  { name: "北京鉴衡认证中心有限公司", field: "能源产业（可再生/不可再生资源）", approval: "CNCA-R-2003-091", batch: "第二批" },
  { name: "中国质量认证中心有限公司", field: "燃料（固体、石油和天然气）的逸散性排放", approval: "CNCA-R-2002-001", batch: "第二批" },
  { name: "方圆标志认证集团有限公司", field: "燃料（固体、石油和天然气）的逸散性排放", approval: "CNCA-R-2002-002", batch: "第二批" },
  { name: "中国船级社质量认证有限公司", field: "燃料（固体、石油和天然气）的逸散性排放", approval: "CNCA-R-2002-005", batch: "第二批" },
  { name: "广州赛宝认证中心服务有限公司", field: "燃料（固体、石油和天然气）的逸散性排放", approval: "CNCA-R-2002-012", batch: "第二批" },
  { name: "华夏认证中心有限公司", field: "燃料（固体、石油和天然气）的逸散性排放", approval: "CNCA-R-2002-021", batch: "第二批" },
  { name: "中环联合（北京）认证中心有限公司", field: "燃料（固体、石油和天然气）的逸散性排放", approval: "CNCA-R-2002-105", batch: "第二批" },
  { name: "北京鉴衡认证中心有限公司", field: "燃料（固体、石油和天然气）的逸散性排放", approval: "CNCA-R-2003-091", batch: "第二批" },
  { name: "中国质量认证中心有限公司", field: "交通运输业、能源需求", approval: "CNCA-R-2002-001", batch: "第二批" },
  { name: "方圆标志认证集团有限公司", field: "交通运输业、能源需求", approval: "CNCA-R-2002-002", batch: "第二批" },
  { name: "中国船级社质量认证有限公司", field: "交通运输业、能源需求", approval: "CNCA-R-2002-005", batch: "第二批" },
  { name: "广州赛宝认证中心服务有限公司", field: "交通运输业、能源需求", approval: "CNCA-R-2002-012", batch: "第二批" },
  { name: "中环联合（北京）认证中心有限公司", field: "交通运输业、能源需求", approval: "CNCA-R-2002-105", batch: "第二批" },
];

const QUALIFICATION_SOURCES = [
  {
    label: "国家认监委2024年第11号公告《国家认监委关于发布第一批温室气体自愿减排项目审定与减排量核查机构资质审批决定的公告》",
    url: "https://www.cnca.gov.cn/zwxx/gg/2024/art/2024/art_82acd2a2836e4e7ca2be267222282d5b.html",
  },
  {
    label: "国家认监委2025年第21号公告《国家认监委关于发布第二批温室气体自愿减排项目审定与减排量核查机构资质审批决定的公告》",
    url: "https://www.cnca.gov.cn/zwxx/gg/2025/art/2025/art_4f9bb3b280ac4afe8a2beb86099fb88b.html",
  },
];

const compactNumber = (value: number, digits = 1) => {
  const absolute = Math.abs(value);
  if (absolute >= 100_000_000) return `${(value / 100_000_000).toFixed(digits)}亿`;
  if (absolute >= 10_000) return `${(value / 10_000).toFixed(digits)}万`;
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(value);
};

const exactNumber = (value: number, digits = 2) =>
  new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

const MAP_REGISTERED_COLUMNS = [
  "项目业主",
  "审定机构名称",
  "开工日期",
  "登记日期",
  "项目寿命期限",
  "计入期开始时间",
  "计入期结束时间",
  "预计计入期总减排量",
];

const REDUCTION_COLUMNS = [
  "项目业主",
  "核查机构",
  "核算期序号",
  "申请登记减排量",
  "登记年份",
  "减排量登记日期",
];

const STATUS_DETAIL_COLUMNS = [
  "项目业主",
  "开工日期",
  "登记日期",
  "项目寿命期限",
  "计入期开始时间",
  "计入期结束时间",
  "预计计入期总减排量",
  "审定机构名称",
  "核查机构",
  "核算期序号",
  "申请登记减排量",
  "登记年份",
  "减排量登记日期",
];

const TABLE_01_DETAIL_COLUMNS = [
  "项目状态",
  "开工日期",
  "登记日期",
  "审定机构名称",
  "核查机构",
  "申请登记减排量",
  "登记年份",
  "减排量登记日期",
];

const FIGURE_06_COLUMNS = [
  "项目业主",
  "审定机构名称",
  "登记日期",
  "核查机构",
  "核算期序号",
  "申请登记减排量",
  "登记年份",
  "减排量登记日期",
];

const FIGURE_07_COLUMNS = [
  "项目业主",
  "核查机构",
  "预计年均减排量",
  "实际登记减排量",
  "减排量登记日期",
  "登记年份",
  "实际登记年均减排量",
  "预计年均减排量达成率",
];

const FIGURE_08_COLUMNS = [
  "项目业主",
  "审定机构名称",
  "开工日期",
  "登记日期",
  "项目寿命期限",
  "计入期开始时间",
  "计入期结束时间",
  "预计计入期总减排量",
  "预计年均减排量",
];

const projectFieldValue = (project: Project, column: string): string => {
  const rate = project.expectedAnnualAchievementRate;
  const values: Record<string, string> = {
    项目状态: project.categoryName,
    方法学领域: project.methodology,
    项目业主: project.owner,
    审定机构名称: project.auditAgency,
    核查机构: project.verifyAgency,
    开工日期: project.commencementDate,
    登记日期: project.registrationDate,
    项目寿命期限: project.projectLifetimeYears ? `${exactNumber(project.projectLifetimeYears, 0)} 年` : "",
    计入期开始时间: project.creditingStart,
    计入期结束时间: project.creditingEnd,
    预计计入期总减排量: project.expectedTotal ? `${exactNumber(project.expectedTotal, 0)} 吨` : "",
    预计年均减排量: project.expectedAnnual ? `${exactNumber(project.expectedAnnual, 0)} 吨/年` : "",
    核算期序号: project.accountingPeriodSequence,
    申请登记减排量: project.actualReduction ? `${exactNumber(project.actualReduction, 0)} 吨` : "",
    实际登记减排量: project.actualReduction ? `${exactNumber(project.actualReduction, 0)} 吨` : "",
    登记年份: project.reductionYearLabels.join("，"),
    减排量登记日期: project.reductionRegistrationLabel,
    实际登记年均减排量: project.actualAnnualAverage ? `${exactNumber(project.actualAnnualAverage, 0)} 吨/年` : "",
    预计年均减排量达成率: rate == null ? "" : `${(rate * 100).toFixed(1)}%`,
    本次核算期覆盖日期:
      project.accountingPeriodStart && project.accountingPeriodEnd
        ? `${project.accountingPeriodStart} 至 ${project.accountingPeriodEnd}`
        : "",
  };
  return values[column] || "";
};

const projectMeta = (project: Project, columns: string[]) =>
  columns.map((label) => ({ label, value: projectFieldValue(project, label) }));

const projectExportRows = (projects: Project[], columns: string[], extra: ExportRow = {}): ExportRow[] =>
  projects.map((project) => ({
    ...extra,
    项目名称: project.projectName,
    方法学领域: project.methodology,
    ...Object.fromEntries(columns.map((column) => [column, projectFieldValue(project, column)])),
  }));

const isVisibleValue = (value: string | undefined) => Boolean(value && value !== "—");

const quantile = (sorted: number[], fraction: number) => {
  if (!sorted.length) return 0;
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};

const boxStatistics = (values: number[]): [number, number, number, number, number] => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return [0, 0, 0, 0, 0];
  return [
    sorted[0],
    quantile(sorted, 0.25),
    quantile(sorted, 0.5),
    quantile(sorted, 0.75),
    sorted.at(-1) || 0,
  ].map((value) => Number(value.toFixed(2))) as [number, number, number, number, number];
};

const sum = (rows: Project[], field: keyof Project) =>
  rows.reduce((total, row) => total + Number(row[field] || 0), 0);

const uniqueProjects = (rows: Project[]) => {
  const score: Record<string, number> = { "4": 70, "2": 60, "3-1": 50, "1-1": 40, "3": 30, "1": 20, "6": 10 };
  const map = new Map<string, Project>();
  for (const row of rows) {
    const current = map.get(row.projectName);
    if (!current || (score[row.categoryCode] || 0) > (score[current.categoryCode] || 0)) {
      map.set(row.projectName, row);
    }
  }
  return [...map.values()];
};

const compareProjectsByRegistration = (a: Project, b: Project) =>
  (b.registrationDate || "").localeCompare(a.registrationDate || "") ||
  a.projectName.localeCompare(b.projectName, "zh-CN");

const compareProjectsByRegistrationAscending = (a: Project, b: Project) =>
  (a.registrationDate || "9999-12-31").localeCompare(b.registrationDate || "9999-12-31") ||
  a.projectName.localeCompare(b.projectName, "zh-CN");

const groupProjectsByMethodology = (
  rows: Project[],
  buildMeta: (project: Project) => DrawerItem["meta"],
  sorter: (a: Project, b: Project) => number = compareProjectsByRegistration,
): DrawerGroup[] => {
  const groups = new Map<string, Project[]>();
  for (const project of rows) {
    if (!groups.has(project.methodology)) groups.set(project.methodology, []);
    groups.get(project.methodology)?.push(project);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "zh-CN"))
    .map(([title, projects]) => ({
      title,
      items: projects.sort(sorter).map((project) => ({
        title: project.projectName,
        href: project.detailUrl,
        meta: buildMeta(project),
      })),
    }));
};

function SortableHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
}: {
  label: string;
  sortKey: OwnerSortKey;
  activeKey: OwnerSortKey;
  direction: SortDirection;
  onSort: (key: OwnerSortKey) => void;
}) {
  const active = sortKey === activeKey;
  return (
    <th>
      <button type="button" className={active ? "sort-button active" : "sort-button"} onClick={() => onSort(sortKey)}>
        {label}
        <span aria-hidden="true">{active ? (direction === "desc" ? "↓" : "↑") : "↕"}</span>
      </button>
    </th>
  );
}

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
}: {
  label: string;
  title: string;
  note?: string;
  controls?: ReactNode;
}) {
  return (
    <div className="panel-title-row">
      <div>
        <div className="panel-label">{label}</div>
        <h3>{title}</h3>
        {note ? <p>{note}</p> : null}
      </div>
      {controls ? <div className="panel-controls">{controls}</div> : null}
    </div>
  );
}

function KpiCard({
  label,
  value,
  unit,
  note,
  tone = "teal",
}: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  tone?: "teal" | "blue" | "rust" | "ink";
}) {
  return (
    <article className={`kpi-card tone-${tone}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        {value}
        {unit ? <span>{unit}</span> : null}
      </div>
      {note ? <div className="kpi-note">{note}</div> : null}
    </article>
  );
}

function MultiFilter({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  };
  return (
    <details className="multi-filter">
      <summary>
        {label}
        <span>{selected.size}/{options.length}</span>
      </summary>
      <div className="multi-filter-menu">
        <div className="multi-filter-actions">
          <button type="button" onClick={() => onChange(new Set(options.map((option) => option.value)))}>
            全选
          </button>
          <button type="button" onClick={() => onChange(new Set())}>
            清空
          </button>
        </div>
        {options.map((option) => (
          <label key={option.value}>
            <input
              type="checkbox"
              checked={selected.has(option.value)}
              onChange={() => toggle(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

function StatusFilterBar({
  options,
  selected,
  onChange,
}: {
  options: { value: string; label: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  };
  const allSelected = selected.size === options.length;

  return (
    <div className="status-filter-bar" aria-label="图4和图5项目状态筛选">
      <div>
        <strong>图 4 / 图 5 项目状态</strong>
        <span>当前图表包含以下状态</span>
      </div>
      <div className="status-chip-list">
        <button
          type="button"
          className={allSelected ? "status-chip active" : "status-chip"}
          aria-pressed={allSelected}
          onClick={() => onChange(allSelected ? new Set() : new Set(options.map((option) => option.value)))}
        >
          全部
        </button>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={selected.has(option.value) ? "status-chip active" : "status-chip"}
            aria-pressed={selected.has(option.value)}
            style={{ "--status-color": STATUS_COLORS[option.value] || "#687078" } as CSSProperties}
            onClick={() => toggle(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function DownloadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [occupation, setOccupation] = useState("");
  const [organization, setOrganization] = useState("");
  const [purpose, setPurpose] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "ready" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");
    if (IS_GITHUB_PAGES) {
      setStatus("ready");
      return;
    }
    try {
      const response = await fetch("/api/download-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, occupation, organization, purpose }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "提交失败，请稍后重试。" );
      setStatus("ready");
    } catch (reason) {
      setStatus("error");
      setMessage(reason instanceof Error ? reason.message : "提交失败，请稍后重试。" );
    }
  };

  return (
    <div className="download-layer" role="presentation" onMouseDown={onClose}>
      <section className="download-dialog" role="dialog" aria-modal="true" aria-labelledby="download-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="download-dialog-head">
          <div>
            <div className="eyebrow">DATA DOWNLOAD</div>
            <h2 id="download-title">下载 CCER 汇总数据</h2>
            <p>请填写基本信息。提交后即可下载当前数据快照的 Excel 工作簿。</p>
          </div>
          <button type="button" className="close-button" onClick={onClose}>关闭</button>
        </div>
        {status === "ready" ? (
          <div className="download-ready">
            <strong>信息已提交</strong>
            <p>文件包含交易数据、项目详情、减排量明细及相关数据字典。</p>
            <a className="download-primary" href={localAsset("downloads/ccer-national-market-data-latest.xlsx")} download="CCER全国市场数据汇总_最新.xlsx">
              下载 Excel
            </a>
          </div>
        ) : (
          <form className="download-form" onSubmit={submit}>
            <label>
              <span>姓名</span>
              <input type="text" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} />
            </label>
            <label>
              <span>职业</span>
              <select value={occupation} onChange={(event) => setOccupation(event.target.value)} required>
                <option value="">请选择</option>
                <option value="科研与教育">科研与教育</option>
                <option value="政府与事业单位">政府与事业单位</option>
                <option value="企业管理与碳资产">企业管理与碳资产</option>
                <option value="金融与投资">金融与投资</option>
                <option value="咨询与专业服务">咨询与专业服务</option>
                <option value="媒体与公共传播">媒体与公共传播</option>
                <option value="学生">学生</option>
                <option value="其他">其他</option>
              </select>
            </label>
            <label>
              <span>单位</span>
              <input type="text" value={organization} onChange={(event) => setOrganization(event.target.value)} required maxLength={160} />
            </label>
            <label>
              <span>用途</span>
              <select value={purpose} onChange={(event) => setPurpose(event.target.value)} required>
                <option value="">请选择</option>
                <option value="学术研究">学术研究</option>
                <option value="政策研究">政策研究</option>
                <option value="市场分析">市场分析</option>
                <option value="项目开发与管理">项目开发与管理</option>
                <option value="投资决策">投资决策</option>
                <option value="教学与培训">教学与培训</option>
                <option value="新闻传播">新闻传播</option>
                <option value="其他">其他</option>
              </select>
            </label>
            {message ? <p className="form-error" role="alert">{message}</p> : null}
            <button className="download-primary" type="submit" disabled={status === "submitting"}>
              {status === "submitting" ? "正在提交…" : "提交并解锁下载"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [suggestions, setSuggestions] = useState([""]);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const reset = () => {
    setSuggestions([""]);
    setAttachments([]);
    setStatus("idle");
    setMessage("");
  };

  const close = () => {
    reset();
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const updateSuggestion = (index: number, value: string) => {
    setSuggestions((current) => current.map((item, itemIndex) => itemIndex === index ? value : item));
  };

  const removeSuggestion = (index: number) => {
    setSuggestions((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validSuggestions = suggestions.map((item) => item.trim()).filter(Boolean);
    if (!validSuggestions.length) {
      setStatus("error");
      setMessage("请至少填写一条建议。");
      return;
    }
    setStatus("submitting");
    setMessage("");
    if (IS_GITHUB_PAGES) {
      const body = [
        ...validSuggestions.map((item, index) => `## 建议 ${index + 1}\n\n${item}`),
        attachments.length
          ? "## 附件说明\n\n请在 GitHub Issue 编辑器中拖入需要附加的图片或文件。"
          : "",
      ].filter(Boolean).join("\n\n");
      const issueUrl = `https://github.com/bwh121/ccer-market-observatory/issues/new?title=${encodeURIComponent("CCER 信息追踪建议反馈")}&body=${encodeURIComponent(body)}`;
      window.open(issueUrl, "_blank", "noopener,noreferrer");
      setStatus("success");
      return;
    }
    try {
      const form = new FormData();
      validSuggestions.forEach((item) => form.append("message", item));
      attachments.forEach((file) => form.append("attachments", file));
      const response = await fetch("/api/feedback", { method: "POST", body: form });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "提交失败，请稍后重试。");
      setStatus("success");
    } catch (reason) {
      setStatus("error");
      setMessage(reason instanceof Error ? reason.message : "提交失败，请稍后重试。");
    }
  };

  return (
    <div className="download-layer feedback-layer" role="presentation" onMouseDown={close}>
      <section className="download-dialog feedback-dialog" role="dialog" aria-modal="true" aria-labelledby="feedback-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="download-dialog-head">
          <div>
            <div className="eyebrow">SUGGESTIONS & FEEDBACK</div>
            <h2 id="feedback-title">建议反馈</h2>
            <p>欢迎提交一条或多条建议，也可以附上图片、文档等附件。</p>
          </div>
          <button type="button" className="close-button" onClick={close}>关闭</button>
        </div>
        {status === "success" ? (
          <div className="feedback-success">
            <strong>谢谢你的建议</strong>
            <p>{IS_GITHUB_PAGES ? "已打开 GitHub 反馈页面；如有附件，请在该页面中拖入后提交。" : "反馈已经安全保存，作者可以在专属管理页面查看。"}</p>
            <div className="feedback-success-actions">
              <button type="button" className="download-primary" onClick={reset}>继续提交建议</button>
              <button type="button" className="secondary-button" onClick={close}>关闭</button>
            </div>
          </div>
        ) : (
          <form className="feedback-form" onSubmit={submit}>
            <div className="feedback-fields">
              {suggestions.map((suggestion, index) => (
                <label key={index}>
                  <span>建议 {index + 1}</span>
                  <textarea
                    value={suggestion}
                    onChange={(event) => updateSuggestion(index, event.target.value)}
                    placeholder="请写下你的建议、问题或需要补充的数据……"
                    maxLength={2000}
                    required
                  />
                  {suggestions.length > 1 ? (
                    <button type="button" className="feedback-remove" onClick={() => removeSuggestion(index)}>删除本条</button>
                  ) : null}
                </label>
              ))}
            </div>
            <button
              type="button"
              className="feedback-add"
              onClick={() => setSuggestions((current) => [...current, ""])}
              disabled={suggestions.length >= 10}
            >
              ＋ 添加一条建议
            </button>
            <label className="feedback-upload">
              <span>附件（可选，最多 5 个，单个不超过 8 MB）</span>
              <input
                type="file"
                multiple
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
                onChange={(event) => setAttachments(Array.from(event.target.files || []).slice(0, 5))}
              />
            </label>
            {IS_GITHUB_PAGES ? <p className="feedback-static-note">GitHub Pages 镜像将在反馈页面中继续添加附件。</p> : null}
            {attachments.length ? (
              <ul className="feedback-file-list">
                {attachments.map((file) => <li key={`${file.name}-${file.size}`}>{file.name}</li>)}
              </ul>
            ) : null}
            {message ? <p className="form-error" role="alert">{message}</p> : null}
            <button className="download-primary" type="submit" disabled={status === "submitting"}>
              {status === "submitting" ? "正在提交…" : "提交建议"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

function Drawer({ state, onClose }: { state: DrawerState | null; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState(() => state?.tabs?.[0]?.id || "");

  useEffect(() => {
    if (!state) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
    };
  }, [state, onClose]);

  if (!state) return null;
  const selectedTab = state.tabs?.find((tab) => tab.id === activeTab);
  const visibleItems = selectedTab?.items || state.items;
  const visibleGroups = selectedTab?.groups || state.groups || [];
  const allVisibleItems = visibleGroups.length
    ? visibleGroups.flatMap((group) => group.items)
    : visibleItems;
  const visibleColumns = (state.tableColumns || []).filter((column) =>
    allVisibleItems.some((item) => isVisibleValue(item.meta.find((entry) => entry.label === column)?.value)),
  );
  const exportRows: ExportRow[] = visibleGroups.length
    ? visibleGroups.flatMap((group) => group.items.map((item) => ({
        方法学领域: group.title,
        项目名称: item.title,
        ...Object.fromEntries(visibleColumns.map((column) => [
          column,
          item.meta.find((entry) => entry.label === column)?.value || "",
        ])),
      })))
    : visibleItems.map((item) => ({
        项目名称: item.title,
        ...Object.fromEntries(item.meta.map((entry) => [entry.label, entry.value])),
      }));
  return (
    <div className="drawer-layer" role="presentation" onMouseDown={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={state.title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="drawer-sticky-shell">
          <div className="drawer-head">
            <div>
              <div className="eyebrow">{state.eyebrow}</div>
              <h2>{state.title}</h2>
              <p>{state.description}</p>
            </div>
            <div className="drawer-head-actions">
              <button type="button" className="close-button" onClick={onClose} aria-label="关闭详情">
                关闭
              </button>
              <DataDownloadMenu
                fileName={state.exportFileName || state.title}
                sections={[{ title: selectedTab?.label || state.title, rows: exportRows }]}
              />
            </div>
          </div>
          {state.tabs?.length ? (
            <div className="drawer-tabs" role="tablist" aria-label="项目角色">
              {state.tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  className={activeTab === tab.id ? "active" : ""}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                  <span>{tab.items?.length || tab.groups?.reduce((total, group) => total + group.items.length, 0) || 0}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className={visibleGroups.length ? "drawer-scroll-region table-mode" : "drawer-scroll-region"}>
          {visibleGroups.length ? (
          <div className="drawer-table-scroll grouped-project-list">
            <table className="drawer-project-table grouped-unified-table">
              <thead>
                <tr>
                  <th>项目名称</th>
                  {visibleColumns.map((column) => <th key={column}>{column}</th>)}
                </tr>
              </thead>
              <tbody>
                {visibleGroups.map((group) => (
                  <Fragment key={group.title}>
                    <tr className="methodology-group-row">
                      <th colSpan={visibleColumns.length + 1}>
                        <span>{group.title}</span>
                        <small>{group.items.length} 个项目</small>
                      </th>
                    </tr>
                    {group.items.map((item, index) => (
                      <tr key={`${group.title}-${item.title}-${index}`}>
                        <td>
                          {item.href ? <a href={item.href} target="_blank" rel="noreferrer">{item.title}</a> : item.title}
                        </td>
                        {visibleColumns.map((column) => (
                          <td key={column}>{item.meta.find((entry) => entry.label === column)?.value || "—"}</td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="drawer-list">
            {visibleItems.length ? (
            visibleItems.map((item, index) => (
              <article className="drawer-item" key={`${item.title}-${index}`}>
                <div className="drawer-item-number">{String(index + 1).padStart(2, "0")}</div>
                <div className="drawer-item-body">
                  {item.href ? (
                    <a href={item.href} target="_blank" rel="noreferrer">
                      {item.title}
                    </a>
                  ) : (
                    <h4>{item.title}</h4>
                  )}
                  <dl>
                    {item.meta.map((entry) => (
                      <div key={`${entry.label}-${entry.value}`}>
                        <dt>{entry.label}</dt>
                        <dd>{entry.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </article>
            ))
            ) : (
              <div className="empty-state">当前筛选条件下没有记录。</div>
            )}
          </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function ChinaMaps({
  data,
  openProjects,
  openProvinceProjects,
}: {
  data: DashboardData;
  openProjects: (title: string, rows: Project[]) => void;
  openProvinceProjects: (
    title: string,
    rows: Project[],
    metric: "registeredProjects" | "actualReduction",
  ) => void;
}) {
  const [mapReady, setMapReady] = useState(false);
  const [mapProvinceNames, setMapProvinceNames] = useState<string[]>([]);
  const [heatMetric, setHeatMetric] = useState<"registeredProjects" | "actualReduction">("registeredProjects");
  const [pointStatus, setPointStatus] = useState<"2" | "4">("2");
  const [pointMethods, setPointMethods] = useState<Set<string>>(() => new Set(data.methodologies));

  useEffect(() => {
    let active = true;
    fetch(localAsset("china.json"))
      .then((response) => response.json())
      .then((geoJson) => {
        if (!active) return;
        echarts.registerMap("ccer-china", geoJson);
        setMapProvinceNames(
          (geoJson.features || [])
            .map((feature: { properties?: { name?: string } }) => feature.properties?.name || "")
            .filter(Boolean),
        );
        setMapReady(true);
      })
      .catch(() => setMapReady(false));
    return () => {
      active = false;
    };
  }, []);

  const heatData = useMemo(() => {
    const byProvince = new Map<string, number>();
    const rows = data.projects.filter((row) => row.categoryCode === (heatMetric === "registeredProjects" ? "2" : "4"));
    for (const row of rows) {
      const increment = heatMetric === "registeredProjects" ? 1 : row.actualReduction;
      byProvince.set(row.province, (byProvince.get(row.province) || 0) + increment);
    }
    const names = mapProvinceNames.length ? mapProvinceNames : data.provinces;
    const maxValue = Math.max(1, ...byProvince.values());
    const colors = ["#ffffff", "#dceee9", "#a9d2c8", "#61a99b", "#147d70", "#0b4f4a"];
    return names.map((name) => {
      const value = Number((byProvince.get(name) || 0).toFixed(2));
      const colorIndex = value === 0 ? 0 : Math.max(1, Math.ceil((value / maxValue) * (colors.length - 1)));
      return { name, value, itemStyle: { areaColor: colors[colorIndex] } };
    });
  }, [data.projects, data.provinces, heatMetric, mapProvinceNames]);

  const heatOption = useMemo<EChartsOption>(() => {
    return {
      animationDuration: 500,
      tooltip: {
        trigger: "item",
        formatter: (raw: unknown) => {
          const params = raw as { name?: string; value?: unknown };
          const value = Number(params.value || 0);
          return `<strong>${params.name || ""}</strong><br/>${
            heatMetric === "registeredProjects"
              ? `已登记项目：${exactNumber(value, 0)} 个`
              : `已登记减排量：${exactNumber(value, 0)} 吨`
          }`;
        },
      },
      series: [
        {
          type: "map",
          map: "ccer-china",
          roam: false,
          zoom: 1.06,
          left: 12,
          right: 118,
          top: 12,
          bottom: 12,
          data: heatData,
          label: { show: false },
          itemStyle: { areaColor: "#ffffff", borderColor: "#a5b8b4", borderWidth: 0.7 },
          emphasis: { label: { show: true, color: "#14211f" }, itemStyle: { areaColor: "#d9b36c" } },
        },
      ],
    };
  }, [heatData, heatMetric]);

  const pointRows = useMemo(
    () =>
      data.projects.filter(
        (row) =>
          row.categoryCode === pointStatus &&
          pointMethods.has(row.methodology) &&
          row.longitude != null &&
          row.latitude != null,
      ),
    [data.projects, pointMethods, pointStatus],
  );

  const visiblePointMethods = useMemo(
    () => data.methodologies.filter((methodology) => pointRows.some((row) => row.methodology === methodology)),
    [data.methodologies, pointRows],
  );

  const pointOption = useMemo<EChartsOption>(() => {
    const methodIndex = new Map(data.methodologies.map((method, index) => [method, index]));
    const symbols = ["circle", "rect", "roundRect", "triangle", "diamond", "pin", "arrow"];
    return {
      tooltip: {
        trigger: "item",
        formatter: (raw: unknown) => {
          const params = raw as { data?: { name?: string; methodology?: string; province?: string } };
          const row = params.data || {};
          return `<strong>${row.name || ""}</strong><br/>${row.methodology || ""}<br/>${row.province || ""}`;
        },
      },
      legend: {
        type: "scroll",
        orient: "vertical",
        right: 6,
        bottom: 6,
        selectedMode: false,
        data: visiblePointMethods,
        textStyle: { color: "#4b5c59", fontSize: 10 },
      },
      geo: {
        map: "ccer-china",
        roam: false,
        zoom: 1.06,
        left: 12,
        right: 118,
        top: 12,
        bottom: 12,
        itemStyle: { areaColor: "#edf2f0", borderColor: "#a6b8b4", borderWidth: 0.7 },
        emphasis: { itemStyle: { areaColor: "#dce9e5" }, label: { show: false } },
      },
      series: visiblePointMethods.map((method) => {
        const methodPosition = data.methodologies.indexOf(method);
        return {
        name: method,
        type: "scatter",
        coordinateSystem: "geo",
        symbol: symbols[methodPosition % symbols.length],
        symbolSize: 5,
        itemStyle: { color: methodColor(methodPosition), borderColor: "#ffffff", borderWidth: 0.5 },
        emphasis: { scale: 2 },
        data: pointRows
          .filter((row) => row.methodology === method)
          .map((row) => ({
            name: row.projectName,
            value: [row.longitude, row.latitude, row.expectedAnnual],
            methodology: row.methodology,
            province: row.province,
            snapshotKey: row.snapshotKey,
            methodIndex: methodIndex.get(method),
          })),
        };
      }),
    };
  }, [data.methodologies, pointRows, visiblePointMethods]);

  if (!mapReady) {
    return <div className="map-loading">省级底图加载中…</div>;
  }

  return (
    <div className="map-grid">
      <article className="panel map-panel">
        <PanelTitle
          label="MAP 01"
          title="省级分布热力图"
          note="地图着色按已登记项目或已登记减排量汇总；点击省份查看按方法学分组的项目清单。"
          controls={
            <label className="select-control">
              指标
              <select value={heatMetric} onChange={(event) => setHeatMetric(event.target.value as typeof heatMetric)}>
                <option value="registeredProjects">已登记项目数量</option>
                <option value="actualReduction">已登记减排量</option>
              </select>
            </label>
          }
        />
        <EChart
          option={heatOption}
          className="map-chart"
          ariaLabel="全国CCER省级分布热力图"
          exportTitle={`CCER${heatMetric === "registeredProjects" ? "已登记项目数量" : "已登记减排量"}省级分布`}
          exportFileName={`MAP-01-${heatMetric === "registeredProjects" ? "已登记项目数量" : "已登记减排量"}`}
          exportSections={[
            {
              title: "省级汇总",
              rows: heatData.map((row) => ({
                省份: row.name,
                指标: heatMetric === "registeredProjects" ? "已登记项目数量" : "已登记减排量",
                数值: row.value,
              })),
            },
            {
              title: "省级下钻明细",
              rows: projectExportRows(
                data.projects.filter((project) => project.categoryCode === (heatMetric === "registeredProjects" ? "2" : "4")),
                heatMetric === "registeredProjects" ? MAP_REGISTERED_COLUMNS : REDUCTION_COLUMNS,
              ).map((row, index) => ({ 省份: data.projects.filter((project) => project.categoryCode === (heatMetric === "registeredProjects" ? "2" : "4"))[index]?.province || "", ...row })),
            },
          ]}
          onClick={(params) => {
            const province = String(params.name || "");
            if (!province) return;
            const categoryCode = heatMetric === "registeredProjects" ? "2" : "4";
            const rows = data.projects.filter((project) => project.categoryCode === categoryCode && project.province === province);
            openProvinceProjects(
              `${province} · ${heatMetric === "registeredProjects" ? "已登记项目" : "已登记减排量项目"}`,
              rows,
              heatMetric,
            );
          }}
        />
      </article>

      <article className="panel map-panel">
        <PanelTitle
          label="MAP 02"
          title="项目经纬度与方法学分布"
          note={`${pointRows.length} 个项目坐标已纳入；右下角图例仅展示当前有项目的方法学领域。`}
          controls={
            <div className="map-filter-controls">
              <label className="select-control">
                项目状态
                <select value={pointStatus} onChange={(event) => setPointStatus(event.target.value as typeof pointStatus)}>
                  <option value="2">已登记项目</option>
                  <option value="4">已登记减排量项目</option>
                </select>
              </label>
              <MultiFilter
                label="方法学领域"
                options={data.methodologies.map((methodology) => ({ value: methodology, label: methodology }))}
                selected={pointMethods}
                onChange={setPointMethods}
              />
            </div>
          }
        />
        <EChart
          option={pointOption}
          className="map-chart"
          ariaLabel="全国CCER项目经纬度分布图"
          exportTitle="CCER项目地理位置与方法学分布"
          exportFileName="MAP-02-项目经纬度与方法学分布"
          exportSections={[
            {
              title: "地图点位",
              rows: pointRows.map((project) => ({
                项目名称: project.projectName,
                项目状态: project.categoryName,
                方法学领域: project.methodology,
                省份: project.province,
                经度: project.longitude,
                纬度: project.latitude,
              })),
            },
            {
              title: "点位下钻明细",
              rows: projectExportRows(pointRows, STATUS_DETAIL_COLUMNS),
            },
          ]}
          onClick={(params) => {
            const dataPoint = params.data as { snapshotKey?: string } | undefined;
            if (!dataPoint?.snapshotKey) return;
            const row = pointRows.find((project) => project.snapshotKey === dataPoint.snapshotKey);
            if (row) openProjects(row.projectName, [row]);
          }}
        />
      </article>
    </div>
  );
}

export default function DashboardClient() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [methodStatusFilter, setMethodStatusFilter] = useState<Set<string>>(new Set());
  const [ownerMethodFilter, setOwnerMethodFilter] = useState<Set<string>>(new Set());
  const [ownerSearch, setOwnerSearch] = useState("");
  const [ownerPage, setOwnerPage] = useState(1);
  const [ownerSortKey, setOwnerSortKey] = useState<OwnerSortKey>("projectCount");
  const [ownerSortDirection, setOwnerSortDirection] = useState<SortDirection>("desc");
  const [relationLimit, setRelationLimit] = useState("18");
  const [relationInstitutionLimit, setRelationInstitutionLimit] = useState("12");
  const [projectRegistrationGranularity, setProjectRegistrationGranularity] = useState<"month" | "day">("month");
  const [reductionRegistrationGranularity, setReductionRegistrationGranularity] = useState<"month" | "day">("day");
  const [bulletinPeriod, setBulletinPeriod] = useState<BulletinPeriod>("yesterday");

  useEffect(() => {
    fetch(localAsset("data/dashboard.json"))
      .then((response) => {
        if (!response.ok) throw new Error("数据文件读取失败");
        return response.json();
      })
      .then((payload: DashboardData) => {
        setData(payload);
        setOwnerMethodFilter(new Set(payload.methodologies));
        setMethodStatusFilter(new Set(payload.statusOrder.map((status) => status.code)));
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  const openProjectRows = (title: string, rows: Project[], description = "点击项目名称可在新窗口打开官方详情页。") => {
    const columns = [
      "项目状态",
      "项目业主",
      "开工日期",
      "登记日期",
      "预计年均减排量",
      "实际登记减排量",
      "登记年份",
      "减排量登记日期",
    ];
    setDrawer({
      eyebrow: "PROJECT RECORDS",
      title,
      description,
      items: [],
      groups: groupProjectsByMethodology(rows, (project) => projectMeta(project, columns)),
      tableColumns: columns,
      exportFileName: title,
    });
  };

  const openGroupedProjectRows = (
    title: string,
    rows: Project[],
    tableColumns: string[],
    buildMeta: (project: Project) => DrawerItem["meta"],
    description = "项目按方法学领域分组，并按登记日期由新到旧排列；点击项目名称可打开官方详情页。",
    sorter: (a: Project, b: Project) => number = compareProjectsByRegistration,
  ) => {
    setDrawer({
      eyebrow: "PROJECT RECORDS BY METHODOLOGY",
      title,
      description,
      items: [],
      groups: groupProjectsByMethodology(rows, buildMeta, sorter),
      tableColumns,
      exportFileName: title,
    });
  };

  const openProjectTable = (
    title: string,
    groupTitle: string,
    rows: Project[],
    tableColumns: string[],
    buildMeta: (project: Project) => DrawerItem["meta"],
    description: string,
  ) => {
    setDrawer({
      eyebrow: "PROJECT RECORDS",
      title,
      description,
      items: [],
      tableColumns,
      groups: [
        {
          title: groupTitle,
          items: rows.map((project) => ({
            title: project.projectName,
            href: project.detailUrl,
            meta: buildMeta(project),
          })),
        },
      ],
      exportFileName: title,
    });
  };

  const tradeOption = useMemo<EChartsOption>(() => {
    if (!data) return {};
    return {
      animationDuration: 500,
      color: ["#9fc8bf", "#9b4d5b"],
      grid: { left: 58, right: 66, top: 18, bottom: 82 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross", crossStyle: { color: "#71817e" } },
        formatter: (raw: unknown) => {
          const params = (Array.isArray(raw) ? raw : [raw]) as Array<{ dataIndex?: number }>;
          const row = data.trades[params[0]?.dataIndex || 0] || data.trades[0];
          return [
            `<strong>${row.date}</strong>`,
            `成交量：${exactNumber(row.volume, 0)} 吨`,
            `成交额：${exactNumber(row.turnover, 2)} 元`,
            `成交均价：${row.price == null ? "—" : `${exactNumber(row.price, 2)} 元/吨`}`,
          ].join("<br/>");
        },
      },
      dataZoom: [
        {
          type: "slider",
          start: 0,
          end: 100,
          height: 24,
          bottom: 18,
          brushSelect: false,
          borderColor: "#c7d4d1",
          fillerColor: "rgba(20,125,112,.18)",
          handleStyle: { color: "#147d70" },
        },
      ],
      xAxis: {
        type: "category",
        data: data.trades.map((row) => row.date),
        axisLine: { lineStyle: { color: "#aab9b6" } },
        axisLabel: { color: "#596966", hideOverlap: true },
      },
      yAxis: [
        {
          type: "value",
          name: "成交量（吨）",
          nameTextStyle: { color: "#596966" },
          splitLine: { lineStyle: { color: "#e7edeb" } },
          axisLabel: { formatter: (value: number) => compactNumber(value, 0), color: "#596966" },
        },
        {
          type: "value",
          name: "价格（元/吨）",
          nameTextStyle: { color: "#596966" },
          splitLine: { show: false },
          axisLabel: { color: "#596966" },
        },
      ],
      series: [
        {
          name: "每日成交量",
          type: "bar",
          data: data.trades.map((row) => row.volume),
          barMaxWidth: 18,
          itemStyle: { color: "#8fbfb4" },
        },
        {
          name: "成交均价",
          type: "line",
          yAxisIndex: 1,
          data: data.trades.map((row) => row.price),
          showSymbol: false,
          smooth: 0.18,
          lineStyle: { color: "#9b4d5b", width: 2 },
          itemStyle: { color: "#9b4d5b" },
          connectNulls: false,
        },
      ],
    };
  }, [data]);

  const carbonPriceComparisonOption = useMemo<EChartsOption>(() => {
    if (!data) return {};
    const rows = data.carbonPriceComparison.months;
    const premiumValues = rows
      .map((row) => row.premiumRate == null ? null : Number((row.premiumRate * 100).toFixed(2)))
      .filter((value): value is number => value != null);
    const premiumMin = Math.min(0, ...premiumValues);
    const premiumMax = Math.max(0, ...premiumValues);
    const premiumSpan = Math.max(10, premiumMax - premiumMin);
    const premiumAxisMin = premiumMin < 0
      ? Math.floor((premiumMin - premiumSpan * 0.08) / 5) * 5
      : 0;
    const premiumAxisMax = premiumMax > 0
      ? Math.ceil((premiumMax + premiumSpan * 0.08) / 5) * 5
      : 0;

    return {
      animationDuration: 500,
      color: ["#a14f39", "#147d70", "#c66b3d"],
      legend: {
        top: 2,
        left: "center",
        itemWidth: 16,
        itemHeight: 8,
        itemGap: 8,
        textStyle: { color: "#4e5f5c", fontSize: 10 },
      },
      grid: { left: 62, right: 62, top: 58, bottom: 82 },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross", crossStyle: { color: "#71817e" } },
        formatter: (raw: unknown) => {
          const params = (Array.isArray(raw) ? raw : [raw]) as Array<{ dataIndex?: number }>;
          const row = rows[params[0]?.dataIndex || 0] || rows[0];
          if (!row) return "";
          const premium = row.premiumRate == null ? "—" : `${exactNumber(row.premiumRate * 100, 2)}%`;
          const spread = row.priceSpread == null ? "—" : `${exactNumber(row.priceSpread, 2)} 元/吨`;
          return [
            `<strong>${row.month}</strong>`,
            `CCER 月成交均价：${row.ccerPrice == null ? "—" : `${exactNumber(row.ccerPrice, 2)} 元/吨`}`,
            `CEA 月成交均价：${row.ceaPrice == null ? "—" : `${exactNumber(row.ceaPrice, 2)} 元/吨`}`,
            `CCER 相对 CEA 价差：${spread}`,
            `CCER 相对 CEA 溢价率：${premium}`,
          ].join("<br/>");
        },
      },
      dataZoom: [
        {
          type: "slider",
          start: 0,
          end: 100,
          height: 24,
          bottom: 18,
          brushSelect: false,
          borderColor: "#c7d4d1",
          fillerColor: "rgba(20,125,112,.16)",
          handleStyle: { color: "#147d70" },
        },
      ],
      xAxis: {
        type: "category",
        data: rows.map((row) => row.month),
        axisLine: { lineStyle: { color: "#aab9b6" } },
        axisLabel: { color: "#596966", hideOverlap: true },
      },
      yAxis: [
        {
          type: "value",
          name: "价格（元/吨）",
          min: 0,
          nameTextStyle: { color: "#596966" },
          splitLine: { lineStyle: { color: "#e7edeb" } },
          axisLabel: { color: "#596966" },
        },
        {
          type: "value",
          name: "溢价率（%）",
          min: premiumAxisMin,
          max: premiumAxisMax,
          nameTextStyle: { color: "#596966" },
          splitLine: { show: false },
          axisLabel: { color: "#596966", formatter: (value: number) => `${value}%` },
        },
      ],
      series: [
        {
          name: "CCER 月均价",
          type: "line",
          data: rows.map((row) => row.ccerPrice),
          showSymbol: true,
          symbolSize: 5,
          smooth: 0.16,
          connectNulls: false,
          z: 4,
          lineStyle: { color: "#a14f39", width: 2.2 },
          itemStyle: { color: "#a14f39" },
        },
        {
          name: "CEA 月均价",
          type: "line",
          data: rows.map((row) => row.ceaPrice),
          showSymbol: true,
          symbolSize: 5,
          smooth: 0.16,
          connectNulls: false,
          z: 4,
          lineStyle: { color: "#147d70", width: 2.2 },
          itemStyle: { color: "#147d70" },
        },
        {
          name: "CCER 相对溢价率",
          type: "bar",
          yAxisIndex: 1,
          barMaxWidth: 18,
          z: 2,
          itemStyle: { color: "#c66b3d" },
          data: rows.map((row) => {
            if (row.premiumRate == null) return null;
            const value = Number((row.premiumRate * 100).toFixed(2));
            return {
              value,
              itemStyle: { color: value >= 0 ? "#c66b3d" : "#3e7f9b" },
            };
          }),
        },
      ],
    };
  }, [data]);

  const statusSummary = useMemo(() => {
    if (!data) return [];
    return data.statusOrder.map((status) => {
      const rows = data.projects.filter((row) => row.categoryCode === status.code);
      return {
        ...status,
        rows,
        count: rows.length,
        expectedAnnual: sum(rows, "expectedAnnual"),
        methodologies: data.methodologies.map((methodology) => {
          const methodRows = rows.filter((row) => row.methodology === methodology);
          return {
            methodology,
            count: methodRows.length,
            expectedAnnual: sum(methodRows, "expectedAnnual"),
          };
        }),
      };
    });
  }, [data]);

  const statusStackedOption = useMemo<EChartsOption>(() => {
    if (!data) return {};
    const series = data.methodologies.flatMap((methodology, index) => {
      const color = methodColor(index);
      return [
        {
          id: `count-${index}`,
          name: methodology,
          type: "bar" as const,
          stack: "project-count",
          yAxisIndex: 0,
          data: statusSummary.map((status) => status.methodologies.find((row) => row.methodology === methodology)?.count || 0),
          itemStyle: { color, opacity: 0.86 },
          emphasis: {
            itemStyle: {
              color,
              opacity: 1,
              borderColor: "#14211f",
              borderWidth: 1,
              shadowBlur: 6,
              shadowColor: "rgba(20, 33, 31, 0.28)",
            },
          },
          selectedMode: false,
          cursor: "pointer",
          barMaxWidth: 34,
        },
        {
          id: `annual-${index}`,
          name: methodology,
          type: "bar" as const,
          stack: "expected-annual",
          yAxisIndex: 1,
          data: statusSummary.map((status) => status.methodologies.find((row) => row.methodology === methodology)?.expectedAnnual || 0),
          itemStyle: { color, opacity: 0.62 },
          emphasis: {
            itemStyle: {
              color,
              opacity: 1,
              borderColor: "#14211f",
              borderWidth: 1,
              shadowBlur: 6,
              shadowColor: "rgba(20, 33, 31, 0.28)",
            },
          },
          selectedMode: false,
          cursor: "pointer",
          barMaxWidth: 34,
        },
      ];
    });
    return {
      color: data.methodologies.map((_, index) => methodColor(index)),
      grid: { left: 66, right: 260, top: 28, bottom: 58 },
      legend: {
        orient: "vertical",
        right: 4,
        top: 30,
        data: data.methodologies,
        selectedMode: false,
        itemGap: 12,
        textStyle: { color: "#475754", fontSize: 10, width: 210, overflow: "truncate" },
      },
      tooltip: {
        trigger: "item",
        confine: true,
        enterable: false,
        transitionDuration: 0,
        hideDelay: 100,
        formatter: (raw: unknown) => {
          const params = raw as {
            dataIndex?: number;
            seriesId?: string;
            seriesName?: string;
            value?: number;
          };
          const status = statusSummary[Number(params.dataIndex)];
          if (!status) return "";
          const isProjectCount = String(params.seriesId || "").startsWith("count-");
          const metric = isProjectCount ? "项目数量" : "预计年均减排量";
          const unit = isProjectCount ? "个" : "吨/年";
          return [
            `<strong>${status.name}</strong>`,
            `${params.seriesName || "未分类方法学"} · ${metric}`,
            `${exactNumber(Number(params.value || 0), 0)} ${unit}`,
          ].join("<br/>");
        },
      },
      xAxis: {
        type: "category",
        data: statusSummary.map((row) => row.name),
        axisLabel: { interval: 0, rotate: 0, color: "#475754", fontSize: 12 },
        axisLine: { lineStyle: { color: "#aab9b6" } },
      },
      yAxis: [
        {
          type: "value",
          name: "项目数量（个）",
          minInterval: 1,
          splitLine: { lineStyle: { color: "#e7edeb" } },
          axisLabel: { color: "#596966" },
        },
        {
          type: "value",
          name: "预计年均减排量（吨/年）",
          splitLine: { show: false },
          axisLabel: { formatter: (value: number) => compactNumber(value, 0), color: "#596966" },
        },
      ],
      series,
    };
  }, [data, statusSummary]);

  const registeredProjects = useMemo(() => data?.projects.filter((row) => row.categoryCode === "2") || [], [data]);
  const registeredReductionProjects = useMemo(() => data?.projects.filter((row) => row.categoryCode === "4") || [], [data]);

  const methodSummary = useMemo(() => {
    if (!data) return [];
    return data.methodologies
      .map((methodology) => {
        const methodRows = data.projects.filter((row) => row.methodology === methodology);
        const registered = methodRows.filter((row) => row.categoryCode === "2");
        const reduction = methodRows.filter((row) => row.categoryCode === "4");
        return {
          methodology,
          registeredCount: registered.length,
          registeredTotal: sum(registered, "expectedTotal"),
          reductionCount: reduction.length,
          actualReduction: sum(reduction, "actualReduction"),
        };
      })
      .sort((a, b) => b.registeredCount - a.registeredCount || a.methodology.localeCompare(b.methodology, "zh-CN"));
  }, [data]);

  const filteredMethodRows = useMemo(
    () => data?.projects.filter((row) => methodStatusFilter.has(row.categoryCode)) || [],
    [data, methodStatusFilter],
  );

  const methodChartData = useMemo(() => {
    if (!data) return [];
    return data.methodologies.map((methodology) => {
      const rows = filteredMethodRows.filter((row) => row.methodology === methodology);
      return { methodology, rows, count: rows.length, expectedAnnual: sum(rows, "expectedAnnual") };
    });
  }, [data, filteredMethodRows]);

  const methodCountData = useMemo(
    () => [...methodChartData].sort((a, b) => b.count - a.count || a.methodology.localeCompare(b.methodology, "zh-CN")),
    [methodChartData],
  );

  const methodExpectedData = useMemo(
    () => [...methodChartData].sort((a, b) => b.expectedAnnual - a.expectedAnnual || a.methodology.localeCompare(b.methodology, "zh-CN")),
    [methodChartData],
  );

  const methodCountOption = useMemo<EChartsOption>(() => ({
    grid: { left: 168, right: 56, top: 10, bottom: 38 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: {
      type: "value",
      minInterval: 1,
      splitLine: { lineStyle: { color: "#e7edeb" } },
      axisLine: { lineStyle: { color: "#aab9b6" } },
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: methodCountData.map((row) => row.methodology),
      axisLabel: { color: "#596966", fontSize: 10, width: 150, overflow: "truncate" },
      axisLine: { lineStyle: { color: "#aab9b6" } },
    },
    series: [
      {
        type: "bar",
        data: methodCountData.map((row) => row.count),
        barMaxWidth: 24,
        itemStyle: { color: "#147d70" },
        label: { show: true, position: "right", color: "#31403d" },
      },
    ],
  }), [methodCountData]);

  const methodExpectedOption = useMemo<EChartsOption>(() => ({
    grid: { left: 168, right: 68, top: 10, bottom: 38 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      valueFormatter: (value) => `${exactNumber(Number(value || 0), 0)} 吨/年`,
    },
    xAxis: {
      type: "value",
      axisLabel: { formatter: (value: number) => compactNumber(value, 0), color: "#596966" },
      splitLine: { lineStyle: { color: "#e7edeb" } },
      axisLine: { lineStyle: { color: "#aab9b6" } },
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: methodExpectedData.map((row) => row.methodology),
      axisLabel: { color: "#596966", fontSize: 10, width: 150, overflow: "truncate" },
      axisLine: { lineStyle: { color: "#aab9b6" } },
    },
    series: [
      {
        type: "bar",
        data: methodExpectedData.map((row) => row.expectedAnnual),
        barMaxWidth: 24,
        itemStyle: { color: "#1f5f8b" },
        label: { show: true, position: "right", color: "#31403d", formatter: (params: { value?: unknown }) => compactNumber(Number(params.value || 0), 0) },
      },
    ],
  }), [methodExpectedData]);

  const reductionTotals = useMemo(() => {
    if (!data) return [];
    return data.methodologies
      .map((methodology) => {
        const rows = registeredReductionProjects
          .filter((row) => row.methodology === methodology)
          .sort((a, b) => b.actualReduction - a.actualReduction || a.projectName.localeCompare(b.projectName, "zh-CN"));
        return { methodology, rows, actualReduction: sum(rows, "actualReduction") };
      })
      .sort((a, b) => b.actualReduction - a.actualReduction || a.methodology.localeCompare(b.methodology, "zh-CN"));
  }, [data, registeredReductionProjects]);

  const reductionTotalOption = useMemo<EChartsOption>(() => ({
    grid: { left: 168, right: 68, top: 66, bottom: 18 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (value) => `${exactNumber(Number(value || 0), 0)} 吨` },
    xAxis: {
      type: "value",
      position: "top",
      name: "累计登记减排量（tCO₂e）",
      nameLocation: "middle",
      nameGap: 34,
      nameTextStyle: { color: "#596966" },
      axisLabel: { formatter: (value: number) => compactNumber(value, 0), color: "#596966" },
      splitLine: { lineStyle: { color: "#e7edeb" } },
      axisLine: { lineStyle: { color: "#aab9b6" } },
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: reductionTotals.map((row) => row.methodology),
      axisLabel: { color: "#596966", fontSize: 10, width: 150, overflow: "truncate" },
      axisLine: { lineStyle: { color: "#aab9b6" } },
    },
    series: [{
      name: "累计登记减排量",
      type: "bar",
      data: reductionTotals.map((row) => row.actualReduction),
      barMaxWidth: 24,
      itemStyle: { color: "#1f5f8b" },
      label: { show: true, position: "right", color: "#31403d", formatter: (params: { value?: unknown }) => compactNumber(Number(params.value || 0), 0) },
    }],
  }), [reductionTotals]);

  const reductionComparison = useMemo(() => {
    if (!data) return [];
    return data.methodologies
      .map((methodology) => {
        const rows = registeredReductionProjects
          .filter((row) => row.methodology === methodology)
          .sort((a, b) => b.actualAnnualAverage - a.actualAnnualAverage || a.projectName.localeCompare(b.projectName, "zh-CN"));
        return {
          methodology,
          rows,
          annualStats: boxStatistics(rows.map((row) => row.actualAnnualAverage)),
          rateStats: boxStatistics(
            rows
              .map((row) => row.expectedAnnualAchievementRate)
              .filter((value): value is number => value != null)
              .map((value) => value * 100),
          ),
        };
      })
      .filter((row) => row.rows.length)
      .sort((a, b) => b.annualStats[2] - a.annualStats[2] || a.methodology.localeCompare(b.methodology, "zh-CN"));
  }, [data, registeredReductionProjects]);

  const reductionComparisonOption = useMemo<EChartsOption>(() => ({
    color: ["#147d70", "#9b4d5b"],
    title: [
      { text: "实际登记年均减排量分布", left: 128, top: 2, textStyle: { color: "#31403d", fontSize: 12, fontWeight: 600 } },
      { text: "预计年均减排量达成率分布", right: 18, top: 2, textStyle: { color: "#31403d", fontSize: 12, fontWeight: 600 } },
    ],
    grid: [
      { left: 128, width: "34%", top: 78, bottom: 26 },
      { right: 18, width: "34%", top: 78, bottom: 26 },
    ],
    tooltip: {
      trigger: "item",
      formatter: (raw: unknown) => {
        const params = raw as { name?: string; value?: unknown[]; seriesIndex?: number };
        const values = (params.value || []).map(Number);
        const box = values.slice(-5);
        const unit = params.seriesIndex === 1 ? "%" : " 吨/年";
        return [
          `<strong>${params.name || ""}</strong>`,
          `最大值：${exactNumber(box[4] || 0, 0)}${unit}`,
          `上四分位：${exactNumber(box[3] || 0, 0)}${unit}`,
          `中位数：${exactNumber(box[2] || 0, 0)}${unit}`,
          `下四分位：${exactNumber(box[1] || 0, 0)}${unit}`,
          `最小值：${exactNumber(box[0] || 0, 0)}${unit}`,
        ].join("<br/>");
      },
    },
    xAxis: [
      {
        type: "value",
        gridIndex: 0,
        position: "top",
        name: "吨/年",
        axisLabel: { formatter: (value: number) => compactNumber(Math.round(value), 0), color: "#596966" },
        splitLine: { lineStyle: { color: "#e7edeb" } },
      },
      {
        type: "value",
        gridIndex: 1,
        position: "top",
        name: "%",
        axisLabel: { formatter: (value: number) => `${Math.round(value)}%`, color: "#596966" },
        splitLine: { lineStyle: { color: "#e7edeb" } },
      },
    ],
    yAxis: [
      {
        type: "category",
        gridIndex: 0,
        inverse: true,
        data: reductionComparison.map((row) => row.methodology),
        axisLabel: { color: "#596966", fontSize: 10, width: 112, overflow: "truncate" },
        axisLine: { lineStyle: { color: "#aab9b6" } },
      },
      {
        type: "category",
        gridIndex: 1,
        inverse: true,
        data: reductionComparison.map((row) => row.methodology),
        axisLabel: { show: false },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#aab9b6" } },
      },
    ],
    series: [
      {
        name: "实际登记年均减排量",
        type: "boxplot",
        xAxisIndex: 0,
        yAxisIndex: 0,
        data: reductionComparison.map((row) => row.annualStats),
        boxWidth: [10, 28],
        itemStyle: { color: "rgba(20,125,112,.34)", borderColor: "#147d70", borderWidth: 1.5 },
      },
      {
        name: "预计年均减排量达成率",
        type: "boxplot",
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: reductionComparison.map((row) => row.rateStats),
        boxWidth: [10, 28],
        itemStyle: { color: "rgba(155,77,91,.3)", borderColor: "#9b4d5b", borderWidth: 1.5 },
      },
    ],
  }), [reductionComparison]);

  const projectRegistrationTimeline = useMemo(() => {
    const grouped = new Map<string, Project[]>();
    for (const row of registeredProjects) {
      if (!row.registrationDate) continue;
      const key = projectRegistrationGranularity === "month"
        ? row.registrationDate.slice(0, 7)
        : row.registrationDate;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)?.push(row);
    }
    return [...grouped.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, rows]) => ({ date, rows, count: rows.length, expectedAnnual: sum(rows, "expectedAnnual") }));
  }, [projectRegistrationGranularity, registeredProjects]);

  const projectRegistrationOption = useMemo<EChartsOption>(() => ({
    color: ["#147d70", "#1f5f8b"],
    grid: { left: 62, right: 72, top: 52, bottom: 86 },
    legend: { top: 0, data: ["登记项目数量", "预计年均减排量合计"], textStyle: { color: "#475754", fontSize: 10 } },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    dataZoom: projectRegistrationTimeline.length > 18 ? [{ type: "inside", start: 40, end: 100 }, { type: "slider", start: 40, end: 100, height: 20, bottom: 14 }] : [],
    xAxis: {
      type: "category",
      data: projectRegistrationTimeline.map((row) => row.date),
      axisLabel: {
        rotate: 28,
        color: "#596966",
        fontSize: 10,
        formatter: (value: string, index: number) => {
          if (projectRegistrationGranularity === "month") return value;
          const month = value.slice(0, 7);
          const previousMonth = projectRegistrationTimeline[index - 1]?.date.slice(0, 7);
          return index === 0 || month !== previousMonth ? month : "";
        },
      },
      axisLine: { lineStyle: { color: "#aab9b6" } },
    },
    yAxis: [
      { type: "value", name: "项目数量（个）", minInterval: 1, splitLine: { lineStyle: { color: "#e7edeb" } }, axisLabel: { color: "#596966" } },
      { type: "value", name: "预计年均减排量（吨/年）", splitLine: { show: false }, axisLabel: { formatter: (value: number) => compactNumber(value, 0), color: "#596966" } },
    ],
    series: [
      { name: "登记项目数量", type: "bar", data: projectRegistrationTimeline.map((row) => row.count), barMaxWidth: 24, itemStyle: { color: "#147d70" }, label: { show: true, position: "top", color: "#31403d" } },
      { name: "预计年均减排量合计", type: "bar", yAxisIndex: 1, data: projectRegistrationTimeline.map((row) => row.expectedAnnual), barMaxWidth: 24, itemStyle: { color: "#1f5f8b" } },
    ],
  }), [projectRegistrationGranularity, projectRegistrationTimeline]);

  const reductionRegistrationTimeline = useMemo(() => {
    const grouped = new Map<string, Project[]>();
    for (const row of registeredReductionProjects) {
      const sourceDate = row.reductionRegistrationDate || "before-2026-07-11";
      const key = sourceDate === "before-2026-07-11" || reductionRegistrationGranularity === "day"
        ? sourceDate
        : sourceDate.slice(0, 7);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)?.push(row);
    }
    return [...grouped.entries()]
      .sort((a, b) => a[0] === "before-2026-07-11" ? -1 : b[0] === "before-2026-07-11" ? 1 : a[0].localeCompare(b[0]))
      .map(([date, rows]) => ({
        date,
        label: date === "before-2026-07-11" ? "2026-07-11 前" : date,
        rows: rows.sort((a, b) => b.actualReduction - a.actualReduction),
        count: rows.length,
        actualReduction: sum(rows, "actualReduction"),
      }));
  }, [reductionRegistrationGranularity, registeredReductionProjects]);

  const reductionRegistrationOption = useMemo<EChartsOption>(() => ({
    grid: { left: 60, right: 24, top: 24, bottom: 72 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (raw: unknown) => {
        const params = (Array.isArray(raw) ? raw : [raw]) as Array<{ axisValue?: string }>;
        const row = reductionRegistrationTimeline.find((item) => item.label === params[0]?.axisValue);
        return row ? `<strong>${row.label}</strong><br/>登记记录：${row.count} 条<br/>登记减排量：${exactNumber(row.actualReduction, 0)} 吨` : "";
      },
    },
    xAxis: { type: "category", data: reductionRegistrationTimeline.map((row) => row.label), axisLabel: { rotate: 24, color: "#596966", fontSize: 10 }, axisLine: { lineStyle: { color: "#aab9b6" } } },
    yAxis: { type: "value", name: "登记记录（条）", minInterval: 1, splitLine: { lineStyle: { color: "#e7edeb" } }, axisLabel: { color: "#596966" } },
    series: [{ name: "减排量登记记录", type: "bar", data: reductionRegistrationTimeline.map((row) => row.count), barMaxWidth: 34, itemStyle: { color: "#9b4d5b" }, label: { show: true, position: "top", color: "#31403d" } }],
  }), [reductionRegistrationTimeline]);

  const ownerRows = useMemo<OwnerRow[]>(() => {
    if (!data) return [];
    const filtered = data.projects.filter((row) => ownerMethodFilter.has(row.methodology));
    const grouped = new Map<string, Project[]>();
    for (const row of filtered) {
      if (!grouped.has(row.owner)) grouped.set(row.owner, []);
      grouped.get(row.owner)?.push(row);
    }
    return [...grouped.entries()]
      .map(([name, rows]) => {
        const canonical = uniqueProjects(rows);
        const reduction = rows.filter((row) => row.categoryCode === "4");
        return {
          name,
          projectCount: new Set(rows.map((row) => row.projectName)).size,
          methodologies: [...new Set(canonical.map((row) => row.methodology))].sort((a, b) => a.localeCompare(b, "zh-CN")),
          registeredCount: new Set(rows.filter((row) => row.categoryCode === "2").map((row) => row.projectName)).size,
          registeredReductionCount: new Set(reduction.map((row) => row.projectName)).size,
          expectedTotal: sum(canonical, "expectedTotal"),
          actualReduction: sum(reduction, "actualReduction"),
          projects: canonical,
        };
      })
      .filter((row) => row.name.includes(ownerSearch.trim()))
      .sort((a, b) => {
        const aValue = ownerSortKey === "methodologies" ? a.methodologies.join("｜") : a[ownerSortKey];
        const bValue = ownerSortKey === "methodologies" ? b.methodologies.join("｜") : b[ownerSortKey];
        const comparison = typeof aValue === "number" && typeof bValue === "number"
          ? aValue - bValue
          : String(aValue).localeCompare(String(bValue), "zh-CN");
        return (ownerSortDirection === "asc" ? comparison : -comparison) || a.name.localeCompare(b.name, "zh-CN");
      });
  }, [data, ownerMethodFilter, ownerSearch, ownerSortDirection, ownerSortKey]);

  const ownerPageCount = Math.max(1, Math.ceil(ownerRows.length / OWNER_PAGE_SIZE));
  const pagedOwnerRows = ownerRows.slice((ownerPage - 1) * OWNER_PAGE_SIZE, ownerPage * OWNER_PAGE_SIZE);

  const institutionRows = useMemo<InstitutionRow[]>(() => {
    if (!data) return [];
    const grouped = new Map<string, { audit: Map<string, Project>; verify: Map<string, Project> }>();
    for (const project of data.projects) {
      for (const [name, role] of [
        [project.auditAgency, "审定"],
        [project.verifyAgency, "核查"],
      ] as const) {
        if (!name) continue;
        if (!grouped.has(name)) grouped.set(name, { audit: new Map(), verify: new Map() });
        const bucket = grouped.get(name);
        if (!bucket) continue;
        (role === "审定" ? bucket.audit : bucket.verify).set(project.projectName, project);
      }
    }
    return [...grouped.entries()]
      .map(([name, bucket]) => ({
        name,
        auditCount: bucket.audit.size,
        verifyCount: bucket.verify.size,
        totalCount: bucket.audit.size + bucket.verify.size,
        details: [
          ...[...bucket.audit.values()].map((project) => ({ role: "审定", project })),
          ...[...bucket.verify.values()].map((project) => ({ role: "核查", project })),
        ],
      }))
      .sort((a, b) => b.totalCount - a.totalCount || a.name.localeCompare(b.name, "zh-CN"));
  }, [data]);

  const relationData = useMemo(() => {
    if (!data) return { owners: [], institutions: [], cells: [], maxValue: 1 };
    const relationSeen = new Set<string>();
    const edges = new Map<string, { owner: string; institution: string; projects: Map<string, Project>; roles: Set<string>; value: number }>();
    for (const project of data.projects) {
      for (const [institution, role] of [
        [project.auditAgency, "审定"],
        [project.verifyAgency, "核查"],
      ] as const) {
        if (!institution) continue;
        const uniqueKey = `${project.owner}|${institution}|${project.projectName}|${role}`;
        if (relationSeen.has(uniqueKey)) continue;
        relationSeen.add(uniqueKey);
        const edgeKey = `${project.owner}|${institution}`;
        if (!edges.has(edgeKey)) {
          edges.set(edgeKey, { owner: project.owner, institution, projects: new Map(), roles: new Set(), value: 0 });
        }
        const edge = edges.get(edgeKey);
        if (edge) {
          edge.projects.set(project.projectName, project);
          edge.roles.add(role);
          edge.value += 1;
        }
      }
    }
    const ownerScores = new Map<string, number>();
    const institutionScores = new Map<string, number>();
    for (const edge of edges.values()) {
      ownerScores.set(edge.owner, (ownerScores.get(edge.owner) || 0) + edge.value);
      institutionScores.set(edge.institution, (institutionScores.get(edge.institution) || 0) + edge.value);
    }
    const owners = [...ownerScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, relationLimit === "all" ? undefined : Number(relationLimit))
      .map(([name]) => name);
    const institutions = [...institutionScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, relationInstitutionLimit === "all" ? undefined : Number(relationInstitutionLimit))
      .map(([name]) => name);
    const ownerIndex = new Map(owners.map((name, index) => [name, index]));
    const institutionIndex = new Map(institutions.map((name, index) => [name, index]));
    const cells = [...edges.values()]
      .filter((edge) => ownerIndex.has(edge.owner) && institutionIndex.has(edge.institution))
      .map((edge) => ({
        value: [ownerIndex.get(edge.owner), institutionIndex.get(edge.institution), edge.projects.size],
        owner: edge.owner,
        institution: edge.institution,
        roles: [...edge.roles].join(" / "),
        projects: [...edge.projects.values()],
      }));
    return { owners, institutions, cells, maxValue: Math.max(1, ...cells.map((cell) => Number(cell.value[2]))) };
  }, [data, relationInstitutionLimit, relationLimit]);

  const relationOption = useMemo<EChartsOption>(() => ({
    tooltip: {
      trigger: "item",
      formatter: (raw: unknown) => {
        const params = raw as { data?: { owner?: string; institution?: string; roles?: string; projects?: Project[] } };
        const cell = params.data || {};
        return `<strong>${cell.owner || ""}</strong><br/>合作机构：${cell.institution || ""}<br/>项目数量：${cell.projects?.length || 0}<br/>角色：${cell.roles || ""}`;
      },
    },
    grid: { left: 188, right: 34, top: 24, bottom: 150 },
    xAxis: {
      type: "category",
      data: relationData.owners,
      splitArea: { show: true, areaStyle: { color: ["#fafbf8", "#f3f6f3"] } },
      axisLabel: { rotate: 34, color: "#596966", fontSize: 9, width: 130, overflow: "truncate" },
    },
    yAxis: {
      type: "category",
      inverse: true,
      data: relationData.institutions,
      splitArea: { show: true, areaStyle: { color: ["#fafbf8", "#f3f6f3"] } },
      axisLabel: { color: "#596966", fontSize: 10, width: 170, overflow: "truncate" },
    },
    visualMap: {
      min: 0,
      max: relationData.maxValue,
      orient: "horizontal",
      left: "center",
      bottom: 18,
      text: ["合作项目多", "少"],
      inRange: { color: ["#edf4f1", "#9fc8bf", "#147d70", "#0b4f4a"] },
      textStyle: { color: "#596966", fontSize: 10 },
    },
    series: [
      {
        type: "heatmap",
        data: relationData.cells,
        label: { show: true, color: "#14211f", formatter: (raw: unknown) => String(((raw as { value?: unknown[] }).value || [])[2] || "") },
        emphasis: { itemStyle: { borderColor: "#14211f", borderWidth: 1 } },
      },
    ],
  }), [relationData]);

  if (error) return <main className="loading-screen">{error}</main>;
  if (!data) return <main className="loading-screen">正在装载 CCER 数据集…</main>;

  const methodOptions = data.methodologies.map((methodology) => ({ value: methodology, label: methodology }));
  const statusOptions = data.statusOrder.map((status) => ({ value: status.code, label: status.name }));
  const qualificationRows = [...new Set(INSTITUTION_QUALIFICATIONS.map((row) => row.name))]
    .sort((a, b) => a.localeCompare(b, "zh-CN"))
    .map((name, index) => {
      const rows = INSTITUTION_QUALIFICATIONS.filter((row) => row.name === name);
      return {
        index: index + 1,
        name,
        fields: [...new Set(rows.map((row) => row.field))],
        approvals: [...new Set(rows.map((row) => row.approval))],
      };
    });
  const snapshotDate = data.generatedAt.slice(0, 10);
  const bulletinRange = bulletinPeriodRange(snapshotDate, bulletinPeriod);
  const bulletinRangeLabel = bulletinPeriodLabel(snapshotDate, bulletinPeriod);
  const isInBulletinRange = (date: string) => (
    !bulletinRange.empty && date >= bulletinRange.start && date <= bulletinRange.end
  );
  const bulletinTrades = data.trades.filter((row) => isInBulletinRange(row.date));
  const bulletinTradeVolume = bulletinTrades.reduce((total, row) => total + row.volume, 0);
  const bulletinTradeTurnover = bulletinTrades.reduce((total, row) => total + row.turnover, 0);
  const bulletinAveragePrice = bulletinTradeVolume > 0 ? bulletinTradeTurnover / bulletinTradeVolume : null;
  const bulletinRegisteredProjects = data.projects.filter(
    (row) => row.categoryCode === "2" && isInBulletinRange(row.registrationDate),
  );
  const bulletinRegisteredReductions = data.projects.filter(
    (row) => row.categoryCode === "4" && isInBulletinRange(row.reductionRegistrationDate),
  );
  const handleOwnerSort = (key: OwnerSortKey) => {
    if (key === ownerSortKey) setOwnerSortDirection((direction) => (direction === "desc" ? "asc" : "desc"));
    else {
      setOwnerSortKey(key);
      setOwnerSortDirection(key === "name" || key === "methodologies" ? "asc" : "desc");
    }
    setOwnerPage(1);
  };

  const tradeExportSections: ExportSection[] = [{
    title: "每日交易数据",
    rows: data.trades.map((trade) => ({
      交易日期: trade.date,
      成交量_吨: trade.volume,
      成交额_元: trade.turnover,
      成交均价_元每吨: trade.price,
      累计成交量_吨: trade.cumulativeVolume,
      累计成交额_元: trade.cumulativeTurnover,
      官方来源: trade.sourceUrl,
    })),
  }];
  const carbonPriceComparisonExportSections: ExportSection[] = [{
    title: "CCER与CEA月度价格对比",
    rows: data.carbonPriceComparison.months.map((row) => ({
      月份: row.month,
      CCER成交量_吨: row.ccerVolume,
      CCER成交额_元: row.ccerTurnover,
      CCER月成交均价_元每吨: row.ccerPrice,
      CEA成交量_吨: row.ceaVolume,
      CEA成交额_元: row.ceaTurnover,
      CEA月成交均价_元每吨: row.ceaPrice,
      CCER相对CEA价差_元每吨: row.priceSpread,
      CCER相对CEA溢价率_百分比: row.premiumRate == null ? null : Number((row.premiumRate * 100).toFixed(2)),
    })),
  }];
  const statusExportSections: ExportSection[] = [
    {
      title: "状态与方法学汇总",
      rows: statusSummary.flatMap((status) => status.methodologies.map((methodology) => ({
        项目状态: status.name,
        方法学领域: methodology.methodology,
        项目数量: methodology.count,
        预计年均减排量_吨每年: methodology.expectedAnnual,
      }))),
    },
    {
      title: "状态下钻明细",
      rows: statusSummary.flatMap((status) => projectExportRows(status.rows, STATUS_DETAIL_COLUMNS, { 项目状态: status.name })),
    },
  ];
  const methodDetailColumns = [
    "项目状态",
    "项目业主",
    "开工日期",
    "登记日期",
    "预计年均减排量",
    "实际登记减排量",
    "登记年份",
    "减排量登记日期",
  ];
  const methodCountExportSections: ExportSection[] = [
    {
      title: "方法学项目数量汇总",
      rows: methodCountData.map((row) => ({ 方法学领域: row.methodology, 项目数量: row.count })),
    },
    {
      title: "方法学项目明细",
      rows: projectExportRows(filteredMethodRows, methodDetailColumns),
    },
  ];
  const methodExpectedExportSections: ExportSection[] = [
    {
      title: "方法学预计年均减排量汇总",
      rows: methodExpectedData.map((row) => ({
        方法学领域: row.methodology,
        预计年均减排量_吨每年: row.expectedAnnual,
      })),
    },
    {
      title: "方法学项目明细",
      rows: projectExportRows(filteredMethodRows, methodDetailColumns),
    },
  ];
  const reductionTotalExportSections: ExportSection[] = [
    {
      title: "方法学累计登记减排量汇总",
      rows: reductionTotals.map((row) => ({ 方法学领域: row.methodology, 累计登记减排量_吨: row.actualReduction })),
    },
    {
      title: "登记减排量项目明细",
      rows: projectExportRows(registeredReductionProjects, FIGURE_06_COLUMNS),
    },
  ];
  const boxStatRow = (methodology: string, metric: string, values: [number, number, number, number, number]): ExportRow => ({
    方法学领域: methodology,
    指标: metric,
    最小值: values[0],
    下四分位: values[1],
    中位数: values[2],
    上四分位: values[3],
    最大值: values[4],
  });
  const reductionComparisonExportSections: ExportSection[] = [
    {
      title: "箱形图统计值",
      rows: reductionComparison.flatMap((row) => [
        boxStatRow(row.methodology, "实际登记年均减排量（吨/年）", row.annualStats),
        boxStatRow(row.methodology, "预计年均减排量达成率（%）", row.rateStats),
      ]),
    },
    {
      title: "项目分布明细",
      rows: projectExportRows(registeredReductionProjects, FIGURE_07_COLUMNS),
    },
  ];
  const projectRegistrationExportSections: ExportSection[] = [
    {
      title: `项目登记${projectRegistrationGranularity === "month" ? "月度" : "日度"}汇总`,
      rows: projectRegistrationTimeline.map((row) => ({
        登记时间: row.date,
        登记项目数量: row.count,
        预计年均减排量合计_吨每年: row.expectedAnnual,
      })),
    },
    {
      title: "项目登记下钻明细",
      rows: projectExportRows(registeredProjects, FIGURE_08_COLUMNS),
    },
  ];
  const reductionRegistrationExportSections: ExportSection[] = [
    {
      title: `减排量登记${reductionRegistrationGranularity === "month" ? "月度" : "日度"}汇总`,
      rows: reductionRegistrationTimeline.map((row) => ({
        登记时间: row.label,
        登记记录数量: row.count,
        登记减排量_吨: row.actualReduction,
      })),
    },
    {
      title: "减排量登记下钻明细",
      rows: projectExportRows(registeredReductionProjects, REDUCTION_COLUMNS),
    },
  ];
  const relationExportSections: ExportSection[] = [
    {
      title: "合作矩阵汇总",
      rows: relationData.cells.map((cell) => ({
        项目业主: cell.owner,
        审定或核查机构: cell.institution,
        机构角色: cell.roles,
        合作项目数量: cell.projects.length,
      })),
    },
    {
      title: "合作项目下钻明细",
      rows: relationData.cells.flatMap((cell) => projectExportRows(
        cell.projects,
        ["项目状态", "登记日期"],
        { 项目业主: cell.owner, 审定或核查机构: cell.institution, 机构角色: cell.roles },
      )),
    },
  ];
  const ownerTableExportRows: ExportRow[] = ownerRows.map((row) => ({
    项目业主名称: row.name,
    项目数量: row.projectCount,
    涉及的方法学领域: row.methodologies.join("；"),
    已登记项目: row.registeredCount,
    已登记减排量项目: row.registeredReductionCount,
    预计计入期总减排量_吨: row.expectedTotal,
    已登记减排量_吨: row.actualReduction,
  }));
  const institutionTableExportRows: ExportRow[] = institutionRows.map((row) => ({
    机构名称: row.name,
    审定项目数量: row.auditCount,
    核查项目数量: row.verifyCount,
    合计: row.totalCount,
  }));

  return (
    <>
      <header className="site-header">
        <a className="header-title" href="#">全国温室气体自愿减排交易市场（CCER）信息追踪</a>
        <nav aria-label="页面章节">
          <a href="#trade">交易情况</a>
          <a href="#development">项目开发</a>
          <a href="#owners">项目业主</a>
          <a href="#institutions">审定与核查机构</a>
          <a href="#data-sources">数据来源与说明</a>
          <a href="#contact-author">联系作者</a>
        </nav>
        <div className="header-actions">
          <button type="button" className="feedback-trigger" onClick={() => setFeedbackOpen(true)}>建议反馈</button>
          <AccountAccessButton />
        </div>
      </header>

      <main className="dashboard-shell">
        <section className="hero">
          <div className="hero-copy hero-centered">
            <h1>全国温室气体自愿减排交易市场（CCER） 信息追踪</h1>
          </div>
        </section>

        <section className="market-pulse" aria-labelledby="market-pulse-title">
          <div className="market-pulse-heading">
            <div>
              <div className="eyebrow">MARKET AT A GLANCE</div>
              <h2 id="market-pulse-title">关键指标</h2>
            </div>
            <p>项目与减排量数据截至 {snapshotDate}，交易数据截至 {data.tradeSummary.latestDate}</p>
          </div>
          <div className="market-pulse-grid">
            <KpiCard label="已发布方法学数量" value={exactNumber(data.methodologies.length, 0)} unit="项" tone="ink" />
            <KpiCard label="已登记项目数量" value={exactNumber(registeredProjects.length, 0)} unit="个" tone="blue" />
            <KpiCard label="已登记减排量项目数量" value={exactNumber(registeredReductionProjects.length, 0)} unit="个" tone="rust" />
            <KpiCard
              label="已登记减排量"
              value={compactNumber(sum(registeredReductionProjects, "actualReduction"))}
              unit="吨"
              note={exactNumber(sum(registeredReductionProjects, "actualReduction"), 0)}
              tone="rust"
            />
            <KpiCard
              label="累计成交量"
              value={compactNumber(data.tradeSummary.cumulativeVolume)}
              unit="吨"
              note={exactNumber(data.tradeSummary.cumulativeVolume, 0)}
            />
            <KpiCard
              label="累计成交额"
              value={compactNumber(data.tradeSummary.cumulativeTurnover)}
              unit="元"
              note={exactNumber(data.tradeSummary.cumulativeTurnover, 2)}
              tone="blue"
            />
            <KpiCard
              label="累计平均成交价"
              value={exactNumber(data.tradeSummary.cumulativeAveragePrice || 0, 2)}
              unit="元/吨"
              note="累计成交额 ÷ 累计成交量"
              tone="rust"
            />
          </div>
        </section>

        <section className="latest-news" aria-labelledby="latest-updates-title">
          <div className="latest-news-heading">
            <div>
              <div className="eyebrow">LATEST BULLETIN</div>
              <h2 id="latest-updates-title">最新动态</h2>
            </div>
            <div className="bulletin-heading-actions">
              <div className="period-switch" role="group" aria-label="最新动态时间范围">
                {([
                  ["yesterday", "昨日"],
                  ["week", "本周"],
                  ["month", "本月"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    className={bulletinPeriod === value ? "active" : ""}
                    aria-pressed={bulletinPeriod === value}
                    onClick={() => setBulletinPeriod(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span>{bulletinRangeLabel}</span>
            </div>
          </div>
          <div className="latest-news-grid">
            <article className="bulletin-card trade-bulletin-card">
              <div className="bulletin-card-head">
                <div><span>MARKET TRANSACTIONS</span><h3>市场交易</h3></div>
                <small>{bulletinTrades.length} 个交易日</small>
              </div>
              <div className="bulletin-metrics">
                <div className="bulletin-metric">
                  <span>成交量</span>
                  <strong>{compactNumber(bulletinTradeVolume)}<small>吨</small></strong>
                  <em>{exactNumber(bulletinTradeVolume, 0)}</em>
                </div>
                <div className="bulletin-metric">
                  <span>成交额</span>
                  <strong>{compactNumber(bulletinTradeTurnover)}<small>元</small></strong>
                  <em>{exactNumber(bulletinTradeTurnover, 2)}</em>
                </div>
                <div className="bulletin-metric">
                  <span>成交均价</span>
                  <strong>{bulletinAveragePrice == null ? "—" : exactNumber(bulletinAveragePrice, 2)}<small>元/吨</small></strong>
                  <em>{bulletinTradeVolume > 0 ? "成交额 ÷ 成交量" : "本周期无成交"}</em>
                </div>
              </div>
            </article>
            <article className="bulletin-card project-bulletin-card">
              <div className="bulletin-card-head">
                <div><span>PROJECT REGISTRATION</span><h3>项目与减排量登记</h3></div>
                <small>点击指标查看时间分布</small>
              </div>
              <div className="bulletin-metrics">
                <button className="bulletin-metric interactive" type="button" onClick={() => document.getElementById("figure-08")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                  <span>登记项目数量</span>
                  <strong>{exactNumber(bulletinRegisteredProjects.length, 0)}<small>个</small></strong>
                  <em>前往 FIGURE 08</em>
                </button>
                <button className="bulletin-metric interactive" type="button" onClick={() => document.getElementById("figure-09")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                  <span>登记减排量项目数量</span>
                  <strong>{exactNumber(bulletinRegisteredReductions.length, 0)}<small>个</small></strong>
                  <em>前往 FIGURE 09</em>
                </button>
                <button className="bulletin-metric interactive" type="button" onClick={() => document.getElementById("figure-09")?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                  <span>登记减排量</span>
                  <strong>{compactNumber(sum(bulletinRegisteredReductions, "actualReduction"))}<small>吨</small></strong>
                  <em>{exactNumber(sum(bulletinRegisteredReductions, "actualReduction"), 0)}</em>
                </button>
              </div>
            </article>
          </div>
          <p className="bulletin-note">项目指标分别按项目登记日期和减排量登记日期统计，统计截止到昨日。</p>
        </section>

        <section id="trade" className="dashboard-section">
          <SectionHeading
            index="01"
            eyebrow="MARKET TRANSACTIONS"
            title="交易情况"
            description="观察全国 CCER 市场日度成交变化，并从月度口径比较 CCER 与全国碳市场 CEA 的价格关系。"
          />
          <div className="two-column-grid trade-chart-grid">
            <article className="panel">
              <PanelTitle
                label="FIGURE 01"
                title="每日成交量与成交均价"
                note="拖动底部时间滑块调整区间；悬停查看日期、成交量、成交额和成交均价。"
              />
              <EChart
                option={tradeOption}
                className="trend-chart"
                ariaLabel="全国CCER每日成交量和成交价格走势图"
                exportTitle="CCER每日成交量与成交均价"
                exportFileName="FIGURE-01-每日成交量与成交均价"
                exportSections={tradeExportSections}
              />
            </article>
            <article className="panel">
              <PanelTitle
                label="FIGURE 01B"
                title="CCER与CEA月成交均价及相对溢价率"
                note={`月均价按当月总成交额÷总成交量计算；暖色为溢价，冷色为折价。CEA 数据截至 ${data.carbonPriceComparison.ceaDataThrough}。`}
              />
              <EChart
                option={carbonPriceComparisonOption}
                className="trend-chart"
                ariaLabel="CCER与CEA月成交均价及CCER相对CEA溢价率组合图"
                exportTitle="CCER与CEA月成交均价及相对溢价率"
                exportFileName="FIGURE-01B-CCER与CEA月成交均价及相对溢价率"
                exportSections={carbonPriceComparisonExportSections}
              />
            </article>
          </div>
        </section>

        <section id="development" className="dashboard-section">
          <SectionHeading
            index="02"
            eyebrow="PROJECT DEVELOPMENT"
            title="项目开发情况"
            description="从空间分布、开发状态、方法学结构和登记时间观察项目供给及减排量登记。"
          />

          <ChinaMaps
            data={data}
            openProjects={(title, rows) => openProjectRows(title, rows)}
            openProvinceProjects={(title, rows, metric) => {
              const columns = metric === "registeredProjects" ? MAP_REGISTERED_COLUMNS : REDUCTION_COLUMNS;
              openGroupedProjectRows(
                title,
                rows,
                columns,
                (project) => projectMeta(project, columns),
                "项目按方法学领域分组，并按登记日期先后排列；点击项目名称可打开官方详情页。",
                compareProjectsByRegistrationAscending,
              );
            }
            }
          />

          <div className="subsection-heading">
            <span>2.1</span>
            <div>
              <h3>按项目状态</h3>
              <p>项目数量按官网状态记录计数；预计计入期总减排量为已登记项目对应指标求和。</p>
            </div>
          </div>
          <article className="panel wide-panel status-comparison-panel">
            <PanelTitle
              label="FIGURE 02–03"
              title="各状态项目数量与预计年均减排量"
              note="每个状态包含项目数量和预计年均减排量两根柱，均按方法学领域堆积；点击任一柱查看该状态全部项目。"
            />
            <EChart
              option={statusStackedOption}
              className="status-stacked-chart"
              ariaLabel="按方法学堆积的各项目状态项目数量和预计年均减排量双轴柱状图"
              exportTitle="CCER各项目状态的项目数量与预计年均减排量"
              exportFileName="FIGURE-02-03-各状态项目数量与预计年均减排量"
              exportSections={statusExportSections}
              onClick={(params) => {
                const dataIndex = Number(params.dataIndex);
                const row = Number.isInteger(dataIndex) ? statusSummary[dataIndex] : undefined;
                if (row) openGroupedProjectRows(
                  `${row.name} · ${row.count} 条项目记录`,
                  row.rows,
                  STATUS_DETAIL_COLUMNS,
                  (project) => projectMeta(project, STATUS_DETAIL_COLUMNS),
                  "项目按方法学领域分组；当前状态下全部为空的字段已自动收起。点击项目名称可打开官方详情页。",
                );
              }}
              onPlotAreaClick={({ offsetX, offsetY }, chart) => {
                const gridLeft = 66;
                const gridRight = 260;
                const plotWidth = chart.getWidth() - gridLeft - gridRight;
                if (plotWidth <= 0 || statusSummary.length === 0) return;

                const bandWidth = plotWidth / statusSummary.length;
                const dataIndex = Math.floor((offsetX - gridLeft) / bandWidth);
                const row = statusSummary[dataIndex];
                if (!row) return;

                const categoryCenter = gridLeft + (dataIndex + 0.5) * bandWidth;
                const clickableHalfWidth = Math.min(48, bandWidth * 0.42);
                const baseline = Number(chart.convertToPixel({ yAxisIndex: 0 }, 0));
                const countTop = Number(chart.convertToPixel({ yAxisIndex: 0 }, row.count));
                const annualTop = Number(chart.convertToPixel({ yAxisIndex: 1 }, row.expectedAnnual));
                const barTop = Math.min(countTop, annualTop);
                if (
                  Math.abs(offsetX - categoryCenter) > clickableHalfWidth
                  || !Number.isFinite(baseline)
                  || !Number.isFinite(barTop)
                  || offsetY < barTop - 6
                  || offsetY > baseline + 6
                ) return;

                openGroupedProjectRows(
                  `${row.name} · ${row.count} 条项目记录`,
                  row.rows,
                  STATUS_DETAIL_COLUMNS,
                  (project) => projectMeta(project, STATUS_DETAIL_COLUMNS),
                  "项目按方法学领域分组；当前状态下全部为空的字段已自动收起。点击项目名称可打开官方详情页。",
                );
              }}
            />
          </article>

          <div className="subsection-heading">
            <span>2.2</span>
            <div>
              <h3>按方法学领域</h3>
              <p>每张卡片只展示登记端核心指标；图表可按项目状态多选筛选。</p>
            </div>
          </div>
          <div className="method-card-grid">
            {methodSummary.map((row, index) => (
              <article className={row.registeredCount === 0 ? "method-card muted" : "method-card"} key={row.methodology} style={{ "--method-color": methodColor(index) } as CSSProperties}>
                <div className="method-index">M{String(index + 1).padStart(2, "0")}</div>
                <h4>{row.methodology}</h4>
                <dl>
                  <div>
                    <dt>已登记项目</dt>
                    <dd>{row.registeredCount}</dd>
                  </div>
                  <div>
                    <dt>预计计入期总减排量</dt>
                    <dd>{compactNumber(row.registeredTotal)}</dd>
                  </div>
                  <div>
                    <dt>已登记减排量项目</dt>
                    <dd>{row.reductionCount}</dd>
                  </div>
                  <div>
                    <dt>实际登记减排量</dt>
                    <dd>{compactNumber(row.actualReduction)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>

          <div className="method-charts-block">
            <StatusFilterBar options={statusOptions} selected={methodStatusFilter} onChange={setMethodStatusFilter} />
            <div className="two-column-grid method-chart-grid">
            <article className="panel">
              <PanelTitle label="FIGURE 04" title="各方法学项目数量（个）" note="按所选项目状态汇总并动态降序排列；点击横向柱查看项目。" />
              <EChart
                option={methodCountOption}
                className="method-chart"
                style={{ height: Math.max(390, methodCountData.length * 46 + 86) }}
                ariaLabel="按方法学领域划分的项目数量柱状图"
                exportTitle="CCER各方法学项目数量"
                exportFileName="FIGURE-04-各方法学项目数量"
                exportSections={methodCountExportSections}
                onClick={(params) => {
                  const name = String(params.name || "");
                  const row = methodChartData.find((item) => item.methodology === name);
                  if (row) openProjectRows(`${name} · 项目清单`, row.rows);
                }}
              />
            </article>
            <article className="panel">
              <PanelTitle label="FIGURE 05" title="各方法学预计年均减排量（tCO₂e）" note="按所选项目状态汇总并动态降序排列；柱尾展示汇总值。" />
              <EChart
                option={methodExpectedOption}
                className="method-chart"
                style={{ height: Math.max(390, methodExpectedData.length * 46 + 86) }}
                ariaLabel="按方法学领域划分的预计年均减排量柱状图"
                exportTitle="CCER各方法学预计年均减排量"
                exportFileName="FIGURE-05-各方法学预计年均减排量"
                exportSections={methodExpectedExportSections}
                onClick={(params) => {
                  const name = String(params.name || "");
                  const row = methodChartData.find((item) => item.methodology === name);
                  if (row) openProjectRows(`${name} · 预计年均减排量`, row.rows);
                }}
              />
            </article>
            </div>
          </div>

          <div className="two-column-grid reduction-grid">
            <article className="panel">
              <PanelTitle
                label="FIGURE 06"
                title="各方法学累计登记减排量"
                note="仅使用“已登记减排量”项目，汇总各方法学所有项目、所有登记年份的减排量。"
              />
              <EChart
                option={reductionTotalOption}
                className="method-chart"
                style={{ height: Math.max(390, reductionTotals.length * 46 + 86) }}
                ariaLabel="各方法学累计登记减排量柱状图"
                exportTitle="CCER各方法学累计登记减排量"
                exportFileName="FIGURE-06-各方法学累计登记减排量"
                exportSections={reductionTotalExportSections}
                onClick={(params) => {
                  const name = String(params.name || "");
                  const row = reductionTotals.find((item) => item.methodology === name);
                  if (row) openProjectTable(
                    `${name} · 累计登记减排量项目`,
                    name,
                    row.rows,
                    FIGURE_06_COLUMNS,
                    (project) => projectMeta(project, FIGURE_06_COLUMNS),
                    "项目按实际登记减排量从大到小排序；点击项目名称可打开官方详情页。",
                  );
                }}
              />
            </article>
            <article className="panel">
              <PanelTitle
                label="FIGURE 07"
                title="各方法学领域单个项目减排量登记情况"
                note="左右两张箱形图共用方法学领域轴，分别展示项目实际登记年均减排量和预计年均减排量达成率的分布。"
              />
              <EChart
                option={reductionComparisonOption}
                className="boxplot-chart"
                style={{ height: Math.max(540, reductionComparison.length * 54 + 128) }}
                ariaLabel="各方法学实际登记年均减排量与预计年均减排量达成率箱形图"
                exportTitle="CCER各方法学领域单个项目减排量登记情况"
                exportFileName="FIGURE-07-各方法学领域单个项目减排量登记情况"
                exportSections={reductionComparisonExportSections}
                onClick={(params) => {
                  const name = String(params.name || "");
                  const row = reductionComparison.find((item) => item.methodology === name);
                  if (row) openProjectTable(
                    `${name} · 单个项目年均减排量`,
                    name,
                    row.rows,
                    FIGURE_07_COLUMNS,
                    (project) => projectMeta(project, FIGURE_07_COLUMNS),
                    data.definitions.achievementRate,
                  );
                }}
              />
            </article>
          </div>

          <div className="subsection-heading">
            <span>2.3</span>
            <div>
              <h3>按项目登记时间</h3>
              <p>项目登记日期来自已登记项目页面；减排量登记日期从本次数据基线起按每日新增记录持续维护。</p>
            </div>
          </div>
          <div className="two-column-grid registration-grid">
            <article id="figure-08" className="panel figure-anchor">
              <PanelTitle
                label="FIGURE 08"
                title="项目登记日期分布"
                note={`双轴柱状图按${projectRegistrationGranularity === "month" ? "月" : "日"}汇总登记项目数量和预计年均减排量；横轴仅标注月份以保持清晰。`}
                controls={
                  <label className="select-control">
                    时间粒度
                    <select
                      value={projectRegistrationGranularity}
                      onChange={(event) => setProjectRegistrationGranularity(event.target.value as "month" | "day")}
                    >
                      <option value="month">按月</option>
                      <option value="day">按日</option>
                    </select>
                  </label>
                }
              />
              <EChart
                option={projectRegistrationOption}
                className="registration-chart"
                ariaLabel="按登记日期统计的已登记项目数量和预计年均减排量"
                exportTitle={`CCER已登记项目的登记时间分布（按${projectRegistrationGranularity === "month" ? "月" : "日"}）`}
                exportFileName={`FIGURE-08-项目登记日期分布-按${projectRegistrationGranularity === "month" ? "月" : "日"}`}
                exportSections={projectRegistrationExportSections}
                onClick={(params) => {
                  const date = String(params.name || "");
                  const row = projectRegistrationTimeline.find((item) => item.date === date);
                  if (row) openGroupedProjectRows(
                    `${date} · 登记项目`,
                    row.rows,
                    FIGURE_08_COLUMNS,
                    (project) => projectMeta(project, FIGURE_08_COLUMNS),
                  );
                }}
              />
            </article>
            <article id="figure-09" className="panel figure-anchor">
              <PanelTitle
                label="FIGURE 09"
                title="减排量登记记录日期分布"
                note={`现有历史记录统一归入“2026-07-11 前”；其余记录按${reductionRegistrationGranularity === "day" ? "日" : "月"}展示。`}
                controls={
                  <label className="select-control">
                    时间粒度
                    <select
                      value={reductionRegistrationGranularity}
                      onChange={(event) => setReductionRegistrationGranularity(event.target.value as "month" | "day")}
                    >
                      <option value="day">按日</option>
                      <option value="month">按月</option>
                    </select>
                  </label>
                }
              />
              <EChart
                option={reductionRegistrationOption}
                className="registration-chart"
                ariaLabel="按发现日期统计的减排量登记记录数量"
                exportTitle={`CCER已登记减排量的登记时间分布（按${reductionRegistrationGranularity === "day" ? "日" : "月"}）`}
                exportFileName={`FIGURE-09-减排量登记记录日期分布-按${reductionRegistrationGranularity === "day" ? "日" : "月"}`}
                exportSections={reductionRegistrationExportSections}
                onClick={(params) => {
                  const label = String(params.name || "");
                  const row = reductionRegistrationTimeline.find((item) => item.label === label);
                  if (row) openGroupedProjectRows(
                    `${label} · 减排量登记记录`,
                    row.rows,
                    REDUCTION_COLUMNS,
                    (project) => projectMeta(project, REDUCTION_COLUMNS),
                  );
                }}
              />
            </article>
          </div>
        </section>

        <section id="owners" className="dashboard-section">
          <SectionHeading
            index="03"
            eyebrow="PROJECT OWNERS"
            title="项目业主情况"
            description="按项目业主归并官网记录，展示项目组合、登记进展和减排量规模。"
          />
          <article className="panel table-panel">
            <PanelTitle
              label="TABLE 01"
              title="项目业主清单"
              note={`当前筛选显示 ${ownerRows.length} 家项目业主。项目数量按项目名称去重；默认按项目数量降序。`}
              controls={
                <div className="table-controls">
                  <DataDownloadMenu
                    fileName="TABLE-01-项目业主清单"
                    sections={[{ title: "当前筛选项目业主", rows: ownerTableExportRows }]}
                  />
                  <MultiFilter
                    label="方法学领域"
                    options={methodOptions}
                    selected={ownerMethodFilter}
                    onChange={(next) => {
                      setOwnerMethodFilter(next);
                      setOwnerPage(1);
                    }}
                  />
                  <label className="search-control">
                    <span>检索</span>
                    <input
                      value={ownerSearch}
                      onChange={(event) => {
                        setOwnerSearch(event.target.value);
                        setOwnerPage(1);
                      }}
                      placeholder="输入项目业主名称"
                    />
                  </label>
                </div>
              }
            />
            <div className="table-scroll owner-table-scroll">
              <table>
                <thead>
                  <tr>
                    <SortableHeader label="项目业主名称" sortKey="name" activeKey={ownerSortKey} direction={ownerSortDirection} onSort={handleOwnerSort} />
                    <SortableHeader label="项目数量" sortKey="projectCount" activeKey={ownerSortKey} direction={ownerSortDirection} onSort={handleOwnerSort} />
                    <SortableHeader label="涉及的方法学领域" sortKey="methodologies" activeKey={ownerSortKey} direction={ownerSortDirection} onSort={handleOwnerSort} />
                    <SortableHeader label="已登记项目" sortKey="registeredCount" activeKey={ownerSortKey} direction={ownerSortDirection} onSort={handleOwnerSort} />
                    <SortableHeader label="已登记减排量项目" sortKey="registeredReductionCount" activeKey={ownerSortKey} direction={ownerSortDirection} onSort={handleOwnerSort} />
                    <SortableHeader label="预计计入期总减排量（吨）" sortKey="expectedTotal" activeKey={ownerSortKey} direction={ownerSortDirection} onSort={handleOwnerSort} />
                    <SortableHeader label="已登记减排量（吨）" sortKey="actualReduction" activeKey={ownerSortKey} direction={ownerSortDirection} onSort={handleOwnerSort} />
                    <th>详情</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedOwnerRows.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      <td>{exactNumber(row.projectCount, 0)}</td>
                      <td><div className="methodology-cell">{row.methodologies.map((methodology) => <span key={methodology}>{methodology}</span>)}</div></td>
                      <td>{exactNumber(row.registeredCount, 0)}</td>
                      <td>{exactNumber(row.registeredReductionCount, 0)}</td>
                      <td>{exactNumber(row.expectedTotal, 0)}</td>
                      <td>{exactNumber(row.actualReduction, 0)}</td>
                      <td>
                        <button
                          type="button"
                          className="detail-button"
                          onClick={() => openGroupedProjectRows(
                            `${row.name} · 项目清单`,
                            row.projects,
                            TABLE_01_DETAIL_COLUMNS,
                            (project) => projectMeta(project, TABLE_01_DETAIL_COLUMNS),
                            "项目按方法学领域分组；当前项目业主下全部为空的字段已自动收起。点击项目名称可打开官方详情页。",
                          )}
                        >
                          查看
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination" aria-label="项目业主清单分页">
              <span>
                第 {ownerPage} / {ownerPageCount} 页 · 每页 {OWNER_PAGE_SIZE} 条
              </span>
              <div>
                <button type="button" onClick={() => setOwnerPage(1)} disabled={ownerPage === 1}>首页</button>
                <button type="button" onClick={() => setOwnerPage((page) => Math.max(1, page - 1))} disabled={ownerPage === 1}>上一页</button>
                <button type="button" onClick={() => setOwnerPage((page) => Math.min(ownerPageCount, page + 1))} disabled={ownerPage === ownerPageCount}>下一页</button>
                <button type="button" onClick={() => setOwnerPage(ownerPageCount)} disabled={ownerPage === ownerPageCount}>末页</button>
              </div>
            </div>
          </article>
        </section>

        <section id="institutions" className="dashboard-section">
          <SectionHeading
            index="04"
            eyebrow="VALIDATION & VERIFICATION"
            title="审定与核查机构情况"
            description="将审定机构和核查机构合并为统一机构清单，并展示其与项目业主之间的项目关系。"
          />
          <article className="panel table-panel qualification-panel">
            <PanelTitle
              label="TABLE 02"
              title="审定与核查机构资质情况"
              note="同一机构获批的多个行业领域合并在一行展示；行业领域及机构批准号依据国家认监委两批资质审批决定整理。"
            />
            <div className="qualification-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>序号</th>
                    <th>机构名称</th>
                    <th>行业领域</th>
                    <th>机构批准号</th>
                  </tr>
                </thead>
                <tbody>
                  {qualificationRows.map((row) => (
                      <tr key={row.name}>
                        <td>{row.index}</td>
                        <td>{row.name}</td>
                        <td>{row.fields.join("；")}</td>
                        <td>{row.approvals.map((approval) => <code key={approval}>{approval}</code>)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <div className="qualification-note">
              <strong>备注 · 信息来源</strong>
              {QUALIFICATION_SOURCES.map((source) => (
                <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label}</a>
              ))}
            </div>
          </article>
          <article className="panel table-panel">
            <PanelTitle
              label="TABLE 03"
              title="审定与核查机构业务情况"
              note={`共识别 ${institutionRows.length} 家机构；同一项目中的审定与核查角色分别统计，默认按合计降序。`}
              controls={
                <DataDownloadMenu
                  fileName="TABLE-03-审定与核查机构业务情况"
                  sections={[{ title: "机构业务", rows: institutionTableExportRows }]}
                />
              }
            />
            <div className="table-scroll institutions-table">
              <table>
                <thead>
                  <tr>
                    <th>机构名称</th>
                    <th>审定项目数量</th>
                    <th>核查项目数量</th>
                    <th>合计</th>
                    <th>详情</th>
                  </tr>
                </thead>
                <tbody>
                  {institutionRows.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      <td>{row.auditCount}</td>
                      <td>{row.verifyCount}</td>
                      <td><strong>{row.totalCount}</strong></td>
                      <td>
                        <button
                          type="button"
                          className="detail-button"
                          onClick={() =>
                            setDrawer({
                              eyebrow: "INSTITUTION DETAILS",
                              title: row.name,
                              description: `审定 ${row.auditCount} 个项目，核查 ${row.verifyCount} 个项目。`,
                              items: [],
                              tableColumns: ["项目业主", "项目状态"],
                              tabs: [
                                { id: "audit", label: "审定项目", role: "审定" },
                                { id: "verify", label: "核查项目", role: "核查" },
                              ].map((tab) => ({
                                id: tab.id,
                                label: tab.label,
                                groups: groupProjectsByMethodology(
                                  row.details.filter((detail) => detail.role === tab.role).map((detail) => detail.project),
                                  (project) => [
                                    { label: "项目业主", value: project.owner },
                                    { label: "项目状态", value: project.categoryName },
                                  ],
                                ),
                              })),
                            })
                          }
                        >
                          查看项目
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="panel wide-panel relation-panel">
            <PanelTitle
              label="FIGURE 10"
              title="项目业主—审定与核查机构合作矩阵"
              note="横轴为高关联项目业主，纵轴为高关联机构；颜色越深表示双方合作项目越多。点击矩阵单元格查看相关项目。"
              controls={
                <div className="relation-controls">
                  <label className="select-control">
                    项目业主
                    <select value={relationLimit} onChange={(event) => setRelationLimit(event.target.value)}>
                      <option value="8">前 8 家</option>
                      <option value="12">前 12 家</option>
                      <option value="18">前 18 家</option>
                    </select>
                  </label>
                  <label className="select-control">
                    机构
                    <select value={relationInstitutionLimit} onChange={(event) => setRelationInstitutionLimit(event.target.value)}>
                      <option value="8">前 8 家</option>
                      <option value="12">前 12 家</option>
                      <option value="18">前 18 家</option>
                    </select>
                  </label>
                </div>
              }
            />
            <EChart
              option={relationOption}
              className="relation-chart"
              ariaLabel="项目业主与审定核查机构合作矩阵"
              exportTitle="CCER项目业主与审定核查机构合作矩阵"
              exportFileName="FIGURE-10-项目业主与审定核查机构合作矩阵"
              exportSections={relationExportSections}
              onClick={(params) => {
                const cell = params.data as { owner?: string; institution?: string; projects?: Project[] } | undefined;
                if (!cell?.projects?.length) return;
                openGroupedProjectRows(
                  `${cell.owner || "项目业主"} × ${cell.institution || "机构"}`,
                  cell.projects,
                  ["项目状态", "登记日期"],
                  (project) => [
                    { label: "项目状态", value: project.categoryName },
                    { label: "登记日期", value: project.registrationDate || "—" },
                  ],
                );
              }}
            />
          </article>
        </section>

        <section id="data-sources" className="methodology-notes" aria-labelledby="data-sources-title">
          <div>
            <div className="eyebrow">METHODOLOGY & SOURCES</div>
            <h2 id="data-sources-title">数据来源与说明</h2>
          </div>
          <div className="definition-grid">
            <article>
              <span>01</span>
              <h3>实际登记减排量</h3>
              <p>{data.definitions.actualReduction}</p>
            </article>
            <article>
              <span>02</span>
              <h3>实际登记年均减排量</h3>
              <p>{data.definitions.actualAnnualAverage}</p>
            </article>
            <article>
              <span>03</span>
              <h3>预计年均减排量达成率</h3>
              <p>{data.definitions.achievementRate}</p>
            </article>
            <article>
              <span>04</span>
              <h3>状态记录</h3>
              <p>{data.definitions.statusGrain}</p>
            </article>
            <article>
              <span>05</span>
              <h3>质量说明</h3>
              <p>
                交易行情含 {data.quality.inferredTradeRows} 条相邻累计值反推记录、{data.quality.reviewedTradeRows} 条历史版式复核记录；
                经纬度纠正 {data.quality.swappedCoordinates} 条明显经纬颠倒记录。
              </p>
            </article>
          </div>
          <div className="sources-row">
            {data.sources.map((source) => (
              <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                {source.label}
              </a>
            ))}
          </div>
        </section>

        <section id="contact-author" className="contact-author" aria-labelledby="contact-author-title">
          <div className="contact-author-copy">
            <div className="eyebrow">CONTACT & NOTICE</div>
            <h2 id="contact-author-title">联系作者</h2>
            <p className="author-name">作者：<strong>逃跑大魔王</strong></p>
            <p>
              本网站基于官方公开数据进行统计分析，尚在持续完善中。作者将尽力保证数据准确、功能完备，
              但不对因使用本站数据产生的任何错误或后果承担责任。本站内容禁止商用。
            </p>
          </div>
          <figure className="contact-qr">
            {/* Keep the static GitHub Pages bundle independent of the Next image runtime. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={localAsset("wechat-author-qr.png")}
              alt="逃跑大魔王的微信二维码"
              width={639}
              height={637}
            />
            <figcaption>微信扫码联系作者</figcaption>
          </figure>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-brand">
          <strong>© 2026 逃跑大魔王。保留所有权利。</strong>
          <span>本站数据来源于官方公开渠道，原始数据相关权利归发布机构所有。</span>
        </div>
        <p>
          本站原创的数据整理、指标设计、文字说明、图表与页面呈现受相关知识产权法律保护。
          未经书面许可，禁止复制、镜像、抓取后再发布或用于商业用途；合理引用请注明作者及本站链接。
        </p>
        <span className="footer-snapshot">数据快照：{data.generatedAt.replace("T", " ")}</span>
      </footer>

      <DownloadDialog open={downloadOpen} onClose={() => setDownloadOpen(false)} />
      <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <Drawer key={drawer?.title || "closed"} state={drawer} onClose={() => setDrawer(null)} />
    </>
  );
}
