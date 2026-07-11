"use client";

import type { EChartsOption } from "echarts";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { EChart, echarts } from "./components/EChart";

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

type Project = {
  snapshotKey: string;
  categoryCode: string;
  categoryName: string;
  statusName: string;
  projectName: string;
  projectCode: string;
  registrationDate: string;
  projectFirstSeenDate: string;
  projectFirstSeenLabel: string;
  creditingStart: string;
  creditingEnd: string;
  projectLifetimeYears: number;
  accountingPeriodStart: string;
  accountingPeriodEnd: string;
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

const METHOD_COLORS = [
  "#147d70",
  "#1f5f8b",
  "#bd6b38",
  "#747f3d",
  "#7b5ea7",
  "#277da1",
  "#9b4d5b",
  "#486d7a",
  "#8b6f47",
];

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

const groupProjectsByMethodology = (
  rows: Project[],
  buildMeta: (project: Project) => DrawerItem["meta"],
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
      items: projects.sort(compareProjectsByRegistration).map((project) => ({
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
            <a className="download-primary" href="/downloads/ccer-national-market-data-latest.xlsx" download="CCER全国市场数据汇总_最新.xlsx">
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
  return (
    <div className="drawer-layer" role="presentation" onMouseDown={onClose}>
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={state.title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="drawer-head">
          <div>
            <div className="eyebrow">{state.eyebrow}</div>
            <h2>{state.title}</h2>
            <p>{state.description}</p>
          </div>
          <button type="button" className="close-button" onClick={onClose} aria-label="关闭详情">
            关闭
          </button>
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
        {visibleGroups.length ? (
          <div className="drawer-table-scroll grouped-project-list">
            <table className="drawer-project-table grouped-unified-table">
              <thead>
                <tr>
                  <th>项目名称</th>
                  {(state.tableColumns || []).map((column) => <th key={column}>{column}</th>)}
                </tr>
              </thead>
              <tbody>
                {visibleGroups.map((group) => (
                  <Fragment key={group.title}>
                    <tr className="methodology-group-row">
                      <th colSpan={(state.tableColumns || []).length + 1}>
                        <span>{group.title}</span>
                        <small>{group.items.length} 个项目</small>
                      </th>
                    </tr>
                    {group.items.map((item, index) => (
                      <tr key={`${group.title}-${item.title}-${index}`}>
                        <td>
                          {item.href ? <a href={item.href} target="_blank" rel="noreferrer">{item.title}</a> : item.title}
                        </td>
                        {(state.tableColumns || []).map((column) => (
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
  openProvinceProjects: (title: string, rows: Project[]) => void;
}) {
  const [mapReady, setMapReady] = useState(false);
  const [mapProvinceNames, setMapProvinceNames] = useState<string[]>([]);
  const [heatMetric, setHeatMetric] = useState<"registeredProjects" | "actualReduction">("registeredProjects");
  const [pointStatus, setPointStatus] = useState<"2" | "4">("2");
  const [pointMethods, setPointMethods] = useState<Set<string>>(() => new Set(data.methodologies));

  useEffect(() => {
    let active = true;
    fetch("/china.json")
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
          zoom: 1.16,
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
        symbolSize: 10,
        itemStyle: { color: METHOD_COLORS[methodPosition % METHOD_COLORS.length], borderColor: "#ffffff", borderWidth: 0.8 },
        emphasis: { scale: 1.8 },
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
          onClick={(params) => {
            const province = String(params.name || "");
            if (!province) return;
            const categoryCode = heatMetric === "registeredProjects" ? "2" : "4";
            const rows = data.projects.filter((project) => project.categoryCode === categoryCode && project.province === province);
            openProvinceProjects(`${province} · ${heatMetric === "registeredProjects" ? "已登记项目" : "已登记减排量项目"}`, rows);
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
  const [methodStatusFilter, setMethodStatusFilter] = useState<Set<string>>(new Set(["1", "1-1", "2", "3", "3-1", "4"]));
  const [ownerMethodFilter, setOwnerMethodFilter] = useState<Set<string>>(new Set());
  const [ownerSearch, setOwnerSearch] = useState("");
  const [ownerPage, setOwnerPage] = useState(1);
  const [ownerSortKey, setOwnerSortKey] = useState<OwnerSortKey>("projectCount");
  const [ownerSortDirection, setOwnerSortDirection] = useState<SortDirection>("desc");
  const [institutionSearch, setInstitutionSearch] = useState("");
  const [relationLimit, setRelationLimit] = useState("12");
  const [relationInstitutionLimit, setRelationInstitutionLimit] = useState("12");

  useEffect(() => {
    fetch("/data/dashboard.json")
      .then((response) => {
        if (!response.ok) throw new Error("数据文件读取失败");
        return response.json();
      })
      .then((payload: DashboardData) => {
        setData(payload);
        setOwnerMethodFilter(new Set(payload.methodologies));
      })
      .catch((reason: Error) => setError(reason.message));
  }, []);

  const openProjectRows = (title: string, rows: Project[], description = "点击项目名称可在新窗口打开官方详情页。") => {
    setDrawer({
      eyebrow: "PROJECT RECORDS",
      title,
      description,
      items: rows
        .slice()
        .sort((a, b) => b.actualReduction - a.actualReduction || b.expectedAnnual - a.expectedAnnual)
        .map((row) => {
          const rate = row.expectedAnnualAchievementRate;
          return {
            title: row.projectName,
            href: row.detailUrl,
            meta: [
              { label: "状态", value: row.categoryName },
              { label: "方法学", value: row.methodology },
              { label: "项目业主", value: row.owner },
              { label: "预计年均减排量", value: `${exactNumber(row.expectedAnnual, 0)} 吨` },
              { label: "实际登记减排量", value: `${exactNumber(row.actualReduction, 0)} 吨` },
              { label: "实际登记年均减排量", value: `${exactNumber(row.actualAnnualAverage, 0)} 吨/年` },
              ...(rate == null ? [] : [{ label: "预计年均减排量达成率", value: `${(rate * 100).toFixed(1)}%` }]),
            ],
          };
        }),
    });
  };

  const openGroupedProjectRows = (
    title: string,
    rows: Project[],
    tableColumns: string[],
    buildMeta: (project: Project) => DrawerItem["meta"],
    description = "项目按方法学领域分组，并按登记日期由新到旧排列；点击项目名称可打开官方详情页。",
  ) => {
    setDrawer({
      eyebrow: "PROJECT RECORDS BY METHODOLOGY",
      title,
      description,
      items: [],
      groups: groupProjectsByMethodology(rows, buildMeta),
      tableColumns,
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

  const statusSummary = useMemo(() => {
    if (!data) return [];
    return data.statusOrder.map((status) => {
      const rows = data.projects.filter((row) => row.categoryCode === status.code);
      return {
        ...status,
        rows,
        count: rows.length,
        expectedAnnual: sum(rows, "expectedAnnual"),
      };
    });
  }, [data]);

  const statusCountOption = useMemo<EChartsOption>(() => ({
    grid: { left: 52, right: 16, top: 24, bottom: 88 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: {
      type: "category",
      data: statusSummary.map((row) => row.name),
      axisLabel: { interval: 0, rotate: 28, color: "#596966", fontSize: 10 },
      axisLine: { lineStyle: { color: "#aab9b6" } },
    },
    yAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: "#e7edeb" } } },
    series: [
      {
        type: "bar",
        data: statusSummary.map((row) => ({ value: row.count, itemStyle: { color: STATUS_COLORS[row.code] } })),
        barMaxWidth: 36,
        label: { show: true, position: "top", color: "#31403d" },
      },
    ],
  }), [statusSummary]);

  const statusExpectedOption = useMemo<EChartsOption>(() => ({
    grid: { left: 70, right: 16, top: 24, bottom: 88 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      valueFormatter: (value) => `${exactNumber(Number(value || 0), 0)} 吨/年`,
    },
    xAxis: {
      type: "category",
      data: statusSummary.map((row) => row.name),
      axisLabel: { interval: 0, rotate: 28, color: "#596966", fontSize: 10 },
      axisLine: { lineStyle: { color: "#aab9b6" } },
    },
    yAxis: {
      type: "value",
      axisLabel: { formatter: (value: number) => compactNumber(value, 0), color: "#596966" },
      splitLine: { lineStyle: { color: "#e7edeb" } },
    },
    series: [
      {
        type: "bar",
        data: statusSummary.map((row) => ({ value: row.expectedAnnual, itemStyle: { color: STATUS_COLORS[row.code] } })),
        barMaxWidth: 36,
        label: { show: true, position: "top", color: "#31403d", formatter: (params: { value?: unknown }) => compactNumber(Number(params.value || 0), 0) },
      },
    ],
  }), [statusSummary]);

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
    grid: { left: 72, right: 24, top: 28, bottom: 112 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (value) => `${exactNumber(Number(value || 0), 0)} 吨` },
    xAxis: {
      type: "category",
      data: reductionTotals.map((row) => row.methodology),
      axisLabel: { interval: 0, rotate: 34, color: "#596966", fontSize: 10 },
      axisLine: { lineStyle: { color: "#aab9b6" } },
    },
    yAxis: {
      type: "value",
      name: "累计登记减排量（吨）",
      nameTextStyle: { color: "#596966" },
      axisLabel: { formatter: (value: number) => compactNumber(value, 0), color: "#596966" },
      splitLine: { lineStyle: { color: "#e7edeb" } },
    },
    series: [{
      name: "累计登记减排量",
      type: "bar",
      data: reductionTotals.map((row) => row.actualReduction),
      barMaxWidth: 34,
      itemStyle: { color: "#1f5f8b" },
      label: { show: true, position: "top", color: "#31403d", formatter: (params: { value?: unknown }) => compactNumber(Number(params.value || 0), 0) },
    }],
  }), [reductionTotals]);

  const reductionComparison = useMemo(() => {
    if (!data) return [];
    return data.methodologies.map((methodology) => {
      const rows = registeredReductionProjects.filter((row) => row.methodology === methodology);
      const actualAnnualAverage = rows.reduce((total, row) => total + row.actualAnnualAverage, 0);
      const expectedAnnual = sum(rows, "expectedAnnual");
      return {
        methodology,
        rows: rows.sort((a, b) => b.actualAnnualAverage - a.actualAnnualAverage || a.projectName.localeCompare(b.projectName, "zh-CN")),
        averageActualAnnualReduction: rows.length > 0 ? actualAnnualAverage / rows.length : 0,
        actualAnnualAverage,
        expectedAnnual,
        achievementRate: expectedAnnual > 0 ? actualAnnualAverage / expectedAnnual : 0,
      };
    }).sort((a, b) => b.averageActualAnnualReduction - a.averageActualAnnualReduction || a.methodology.localeCompare(b.methodology, "zh-CN"));
  }, [data, registeredReductionProjects]);

  const reductionComparisonOption = useMemo<EChartsOption>(() => ({
    color: ["#147d70", "#9b4d5b"],
    grid: { left: 74, right: 76, top: 58, bottom: 112 },
    legend: { top: 0, data: ["平均单个项目年均减排量", "预计年均减排量达成率"], textStyle: { color: "#475754", fontSize: 10 } },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
      formatter: (raw: unknown) => {
        const params = (Array.isArray(raw) ? raw : [raw]) as Array<{ axisValue?: string }>;
        const summary = reductionComparison.find((row) => row.methodology === params[0]?.axisValue);
        if (!summary) return "";
        return [
          `<strong>${summary.methodology}</strong>`,
          `平均单个项目年均减排量：${exactNumber(summary.averageActualAnnualReduction, 0)} 吨/年`,
          `方法学实际登记年均减排量合计：${exactNumber(summary.actualAnnualAverage, 0)} 吨/年`,
          `预计年均减排量：${exactNumber(summary.expectedAnnual, 0)} 吨/年`,
          `预计年均减排量达成率：${(summary.achievementRate * 100).toFixed(1)}%`,
        ].join("<br/>");
      },
    },
    xAxis: {
      type: "category",
      data: reductionComparison.map((row) => row.methodology),
      axisLabel: { interval: 0, rotate: 34, color: "#596966", fontSize: 10 },
      axisLine: { lineStyle: { color: "#aab9b6" } },
    },
    yAxis: [
      {
        type: "value",
        name: "平均单项目年均减排量（吨/年）",
        nameTextStyle: { color: "#596966" },
        axisLabel: { formatter: (value: number) => compactNumber(value, 0), color: "#596966" },
        splitLine: { lineStyle: { color: "#e7edeb" } },
      },
      {
        type: "value",
        name: "预计年均减排量达成率（%）",
        nameTextStyle: { color: "#596966" },
        axisLabel: { formatter: (value: number) => `${value}%`, color: "#596966" },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "平均单个项目年均减排量",
        type: "bar",
        data: reductionComparison.map((row) => Number(row.averageActualAnnualReduction.toFixed(2))),
        barMaxWidth: 38,
        itemStyle: { color: "#147d70" },
      },
      {
        name: "预计年均减排量达成率",
        type: "line",
        yAxisIndex: 1,
        data: reductionComparison.map((row) => Number((row.achievementRate * 100).toFixed(2))),
        symbolSize: 7,
        lineStyle: { color: "#9b4d5b", width: 2 },
        itemStyle: { color: "#9b4d5b" },
      },
    ],
  }), [reductionComparison]);

  const projectRegistrationTimeline = useMemo(() => {
    const grouped = new Map<string, Project[]>();
    for (const row of registeredProjects) {
      if (!row.registrationDate) continue;
      if (!grouped.has(row.registrationDate)) grouped.set(row.registrationDate, []);
      grouped.get(row.registrationDate)?.push(row);
    }
    return [...grouped.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, rows]) => ({ date, rows, count: rows.length, expectedAnnual: sum(rows, "expectedAnnual") }));
  }, [registeredProjects]);

  const projectRegistrationOption = useMemo<EChartsOption>(() => ({
    color: ["#147d70", "#1f5f8b"],
    grid: { left: 62, right: 72, top: 52, bottom: 86 },
    legend: { top: 0, data: ["当日登记项目数量", "预计年均减排量合计"], textStyle: { color: "#475754", fontSize: 10 } },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    dataZoom: projectRegistrationTimeline.length > 18 ? [{ type: "inside", start: 40, end: 100 }, { type: "slider", start: 40, end: 100, height: 20, bottom: 14 }] : [],
    xAxis: {
      type: "category",
      data: projectRegistrationTimeline.map((row) => row.date),
      axisLabel: { rotate: 36, color: "#596966", fontSize: 10 },
      axisLine: { lineStyle: { color: "#aab9b6" } },
    },
    yAxis: [
      { type: "value", name: "项目数量（个）", minInterval: 1, splitLine: { lineStyle: { color: "#e7edeb" } }, axisLabel: { color: "#596966" } },
      { type: "value", name: "预计年均减排量（吨/年）", splitLine: { show: false }, axisLabel: { formatter: (value: number) => compactNumber(value, 0), color: "#596966" } },
    ],
    series: [
      { name: "当日登记项目数量", type: "bar", data: projectRegistrationTimeline.map((row) => row.count), barMaxWidth: 24, itemStyle: { color: "#147d70" }, label: { show: true, position: "top", color: "#31403d" } },
      { name: "预计年均减排量合计", type: "bar", yAxisIndex: 1, data: projectRegistrationTimeline.map((row) => row.expectedAnnual), barMaxWidth: 24, itemStyle: { color: "#1f5f8b" } },
    ],
  }), [projectRegistrationTimeline]);

  const reductionRegistrationTimeline = useMemo(() => {
    const grouped = new Map<string, Project[]>();
    for (const row of registeredReductionProjects) {
      const key = row.reductionRegistrationDate || "before-2026-07-11";
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
  }, [registeredReductionProjects]);

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
      .filter((row) => row.name.includes(institutionSearch.trim()))
      .sort((a, b) => b.totalCount - a.totalCount || a.name.localeCompare(b.name, "zh-CN"));
  }, [data, institutionSearch]);

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
  const latestTradeRow = data.trades.at(-1);
  const previousTradeWithPrice = data.trades
    .slice(0, -1)
    .reverse()
    .find((row) => row.price != null && row.price > 0);
  const latestPriceChange = latestTradeRow?.price != null && previousTradeWithPrice?.price
    ? (latestTradeRow.price - previousTradeWithPrice.price) / previousTradeWithPrice.price
    : null;
  const latestRegisteredProjects = data.projects.filter(
    (row) => row.categoryCode === "2" && row.projectFirstSeenDate === snapshotDate,
  );
  const latestRegisteredReductions = data.projects.filter(
    (row) => row.categoryCode === "4" && row.reductionRegistrationDate === snapshotDate,
  );
  const latestProjectMethods = [...new Set(latestRegisteredProjects.map((row) => row.methodology))]
    .map((methodology) => ({
      methodology,
      count: latestRegisteredProjects.filter((row) => row.methodology === methodology).length,
    }))
    .sort((a, b) => b.count - a.count || a.methodology.localeCompare(b.methodology, "zh-CN"));
  const latestReductionMethods = [...new Set(latestRegisteredReductions.map((row) => row.methodology))]
    .map((methodology) => {
      const rows = latestRegisteredReductions.filter((row) => row.methodology === methodology);
      return { methodology, count: rows.length, amount: sum(rows, "actualReduction") };
    })
    .sort((a, b) => b.amount - a.amount || a.methodology.localeCompare(b.methodology, "zh-CN"));
  const handleOwnerSort = (key: OwnerSortKey) => {
    if (key === ownerSortKey) setOwnerSortDirection((direction) => (direction === "desc" ? "asc" : "desc"));
    else {
      setOwnerSortKey(key);
      setOwnerSortDirection(key === "name" || key === "methodologies" ? "asc" : "desc");
    }
    setOwnerPage(1);
  };

  return (
    <>
      <header className="site-header">
        <a className="header-title" href="#">全国自愿减排交易市场（CCER）信息追踪</a>
        <nav aria-label="页面章节">
          <a href="#trade">交易情况</a>
          <a href="#development">项目开发</a>
          <a href="#owners">项目业主</a>
          <a href="#institutions">审定与核查</a>
        </nav>
        <button type="button" className="download-trigger" onClick={() => setDownloadOpen(true)}>下载数据</button>
      </header>

      <main className="dashboard-shell">
        <section className="hero">
          <div className="hero-copy hero-centered">
            <h1>全国自愿减排交易市场（CCER）信息追踪</h1>
            <p className="hero-byline">
              <span>数据时间：{data.dataThrough}</span>
              <span>数据来源：全国温室气体自愿减排交易系统、全国温室气体自愿减排注册登记系统</span>
              <span>作者：逃跑大魔王</span>
            </p>
          </div>
        </section>

        <section className="latest-news" aria-labelledby="latest-news-title">
          <div className="latest-news-heading">
            <div>
              <div className="eyebrow">LATEST BULLETIN</div>
              <h2 id="latest-news-title">最新资讯</h2>
            </div>
            <span>数据更新于 {snapshotDate}</span>
          </div>
          <div className="latest-news-grid">
            <article>
              <div className="news-label">市场交易</div>
              <p>
                {latestTradeRow && latestTradeRow.volume > 0 ? (
                  <>
                    {latestTradeRow.date}，全国 CCER 市场成交量 <strong>{exactNumber(latestTradeRow.volume, 0)} 吨</strong>，
                    成交额 <strong>{exactNumber(latestTradeRow.turnover, 2)} 元</strong>，成交均价
                    <strong> {exactNumber(latestTradeRow.price || 0, 2)} 元/吨</strong>
                    {latestPriceChange == null ? "。" : (
                      <>，较前一交易日<strong>{latestPriceChange > 0 ? "上涨" : latestPriceChange < 0 ? "下跌" : "持平"} {Math.abs(latestPriceChange * 100).toFixed(2)}%</strong>。</>
                    )}
                  </>
                ) : (
                  <>{latestTradeRow?.date || snapshotDate}无成交。</>
                )}
              </p>
            </article>
            <article>
              <div className="news-label">项目开发</div>
              <p>
                {snapshotDate}新登记项目 <strong>{latestRegisteredProjects.length} 个</strong>
                {latestProjectMethods.length ? <>，其中{latestProjectMethods.map((row, index) => (
                  <Fragment key={row.methodology}>{index ? "，" : ""}{row.methodology} <strong>{row.count} 个</strong></Fragment>
                ))}</> : ""}；新登记减排量项目 <strong>{latestRegisteredReductions.length} 个</strong>，
                共登记减排量 <strong>{exactNumber(sum(latestRegisteredReductions, "actualReduction"), 0)} 吨</strong>
                {latestReductionMethods.length ? <>，其中{latestReductionMethods.map((row, index) => (
                  <Fragment key={row.methodology}>{index ? "，" : ""}{row.methodology} <strong>{row.count} 个、{exactNumber(row.amount, 0)} 吨</strong></Fragment>
                ))}</> : ""}。
              </p>
            </article>
          </div>
        </section>

        <section id="trade" className="dashboard-section">
          <SectionHeading
            index="01"
            eyebrow="MARKET TRANSACTIONS"
            title="交易情况"
            description="聚焦最新交易日与市场累计规模，并用同一时间轴观察成交量和成交价格。"
          />
          <div className="trade-kpi-groups">
            <div className="kpi-period-group">
              <div className="kpi-period-label">最近交易日 · {data.tradeSummary.latestDate}</div>
              <div className="kpi-grid three">
                <KpiCard label="成交量" value={compactNumber(data.tradeSummary.latestVolume)} unit="吨" note={exactNumber(data.tradeSummary.latestVolume, 0)} />
                <KpiCard label="成交额" value={compactNumber(data.tradeSummary.latestTurnover)} unit="元" note={exactNumber(data.tradeSummary.latestTurnover, 2)} tone="blue" />
                <KpiCard label="成交均价" value={exactNumber(data.tradeSummary.latestPrice || 0, 2)} unit="元/吨" tone="rust" />
              </div>
            </div>
            <div className="kpi-period-group">
              <div className="kpi-period-label">市场累计</div>
              <div className="kpi-grid three">
                <KpiCard label="累计成交量" value={compactNumber(data.tradeSummary.cumulativeVolume)} unit="吨" note={exactNumber(data.tradeSummary.cumulativeVolume, 0)} />
                <KpiCard label="累计成交额" value={compactNumber(data.tradeSummary.cumulativeTurnover)} unit="元" note={exactNumber(data.tradeSummary.cumulativeTurnover, 2)} tone="blue" />
                <KpiCard label="累计平均成交价" value={exactNumber(data.tradeSummary.cumulativeAveragePrice || 0, 2)} unit="元/吨" note="累计成交额 ÷ 累计成交量" tone="rust" />
              </div>
            </div>
          </div>
          <article className="panel wide-panel">
            <PanelTitle
              label="FIGURE 01"
              title="每日成交量与成交均价"
              note="拖动底部时间滑块调整区间；悬停查看日期、成交量、成交额和成交均价。"
            />
            <EChart option={tradeOption} className="trend-chart" ariaLabel="全国CCER每日成交量和成交价格走势图" />
          </article>
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
            openProvinceProjects={(title, rows) =>
              openGroupedProjectRows(title, rows, ["项目业主"], (project) => [
                { label: "项目业主", value: project.owner },
              ])
            }
          />

          <div className="subsection-heading">
            <span>2.1</span>
            <div>
              <h3>按项目状态</h3>
              <p>项目数量按官网状态记录计数；预计计入期总减排量为已登记项目对应指标求和。</p>
            </div>
          </div>
          <div className="kpi-grid four">
            <KpiCard label="已登记项目数量" value={exactNumber(registeredProjects.length, 0)} unit="个" tone="blue" />
            <KpiCard label="已登记项目预计计入期总减排量" value={compactNumber(sum(registeredProjects, "expectedTotal"))} unit="吨" note={exactNumber(sum(registeredProjects, "expectedTotal"), 0)} />
            <KpiCard label="已登记减排量项目数量" value={exactNumber(registeredReductionProjects.length, 0)} unit="个" tone="rust" />
            <KpiCard label="已登记减排量" value={compactNumber(sum(registeredReductionProjects, "actualReduction"))} unit="吨" note={exactNumber(sum(registeredReductionProjects, "actualReduction"), 0)} tone="rust" />
          </div>
          <div className="two-column-grid">
            <article className="panel">
              <PanelTitle label="FIGURE 02" title="各状态项目数量" note="点击柱子查看该状态下的项目清单。" />
              <EChart
                option={statusCountOption}
                className="medium-chart"
                ariaLabel="各项目状态的项目数量柱状图"
                onClick={(params) => {
                  const name = String(params.name || "");
                  const row = statusSummary.find((item) => item.name === name);
                  if (row) openGroupedProjectRows(`${name} · ${row.count} 条`, row.rows, ["项目业主"], (project) => [
                    { label: "项目业主", value: project.owner },
                  ]);
                }}
              />
            </article>
            <article className="panel">
              <PanelTitle label="FIGURE 03" title="各状态预计年均减排量" note="点击柱子查看项目及其预计年均减排量。" />
              <EChart
                option={statusExpectedOption}
                className="medium-chart"
                ariaLabel="各项目状态预计年均减排量柱状图"
                onClick={(params) => {
                  const name = String(params.name || "");
                  const row = statusSummary.find((item) => item.name === name);
                  if (row) openGroupedProjectRows(
                    `${name} · 减排量指标`,
                    row.rows,
                    ["项目业主", "预计年均减排量", "实际登记减排量", "实际登记年均减排量", "预计年均减排量达成率"],
                    (project) => [
                      { label: "项目业主", value: project.owner },
                      { label: "预计年均减排量", value: `${exactNumber(project.expectedAnnual, 0)} 吨/年` },
                      { label: "实际登记减排量", value: `${exactNumber(project.actualReduction, 0)} 吨` },
                      { label: "实际登记年均减排量", value: `${exactNumber(project.actualAnnualAverage, 0)} 吨/年` },
                      { label: "预计年均减排量达成率", value: project.expectedAnnualAchievementRate == null ? "—" : `${(project.expectedAnnualAchievementRate * 100).toFixed(1)}%` },
                    ],
                  );
                }}
              />
            </article>
          </div>

          <div className="subsection-heading">
            <span>2.2</span>
            <div>
              <h3>按方法学领域</h3>
              <p>每张卡片只展示登记端核心指标；图表可按项目状态多选筛选。</p>
            </div>
          </div>
          <div className="method-card-grid">
            {methodSummary.map((row, index) => (
              <article className={row.registeredCount === 0 ? "method-card muted" : "method-card"} key={row.methodology} style={{ "--method-color": METHOD_COLORS[index % METHOD_COLORS.length] } as CSSProperties}>
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
              <PanelTitle label="FIGURE 04" title="各方法学项目数量" note="按所选项目状态汇总并动态降序排列；点击横向柱查看项目。" />
              <EChart
                option={methodCountOption}
                className="method-chart"
                style={{ height: Math.max(390, methodCountData.length * 46 + 86) }}
                ariaLabel="按方法学领域划分的项目数量柱状图"
                onClick={(params) => {
                  const name = String(params.name || "");
                  const row = methodChartData.find((item) => item.methodology === name);
                  if (row) openProjectRows(`${name} · 项目清单`, row.rows);
                }}
              />
            </article>
            <article className="panel">
              <PanelTitle label="FIGURE 05" title="各方法学预计年均减排量" note="按所选项目状态汇总并动态降序排列；柱尾展示汇总值。" />
              <EChart
                option={methodExpectedOption}
                className="method-chart"
                style={{ height: Math.max(390, methodExpectedData.length * 46 + 86) }}
                ariaLabel="按方法学领域划分的预计年均减排量柱状图"
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
                className="comparison-chart half-chart"
                ariaLabel="各方法学累计登记减排量柱状图"
                onClick={(params) => {
                  const name = String(params.name || "");
                  const row = reductionTotals.find((item) => item.methodology === name);
                  if (row) openProjectTable(
                    `${name} · 累计登记减排量项目`,
                    name,
                    row.rows,
                    ["实际登记减排量", "登记年份"],
                    (project) => [
                      { label: "实际登记减排量", value: `${exactNumber(project.actualReduction, 0)} 吨` },
                      { label: "登记年份", value: project.reductionYearLabels.join("，") || "—" },
                    ],
                    "项目按实际登记减排量从大到小排序；点击项目名称可打开官方详情页。",
                  );
                }}
              />
            </article>
            <article className="panel">
              <PanelTitle
                label="FIGURE 07"
                title="平均单个项目年均减排量情况"
                note="柱为各方法学下项目实际登记年均减排量的平均值；折线仍为实际登记年均减排量汇总值 ÷ 预计年均减排量汇总值。"
              />
              <EChart
                option={reductionComparisonOption}
                className="comparison-chart half-chart"
                ariaLabel="各方法学平均单个项目年均减排量与预计年均减排量达成率组合图"
                onClick={(params) => {
                  const name = String(params.name || "");
                  const row = reductionComparison.find((item) => item.methodology === name);
                  if (row) openProjectTable(
                    `${name} · 平均单个项目年均减排量`,
                    name,
                    row.rows,
                    ["预计年均减排量", "实际登记减排量", "登记年份", "实际登记年均减排量", "预计年均减排量达成率"],
                    (project) => [
                      { label: "预计年均减排量", value: `${exactNumber(project.expectedAnnual, 0)} 吨/年` },
                      { label: "实际登记减排量", value: `${exactNumber(project.actualReduction, 0)} 吨` },
                      { label: "登记年份", value: project.reductionYearLabels.join("，") || "—" },
                      { label: "实际登记年均减排量", value: `${exactNumber(project.actualAnnualAverage, 0)} 吨/年` },
                      { label: "预计年均减排量达成率", value: project.expectedAnnualAchievementRate == null ? "—" : `${(project.expectedAnnualAchievementRate * 100).toFixed(1)}%` },
                    ],
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
            <article className="panel">
              <PanelTitle
                label="FIGURE 08"
                title="项目登记日期分布"
                note="双轴柱状图分别展示当日登记项目数量和当日登记项目预计年均减排量合计。"
              />
              <EChart
                option={projectRegistrationOption}
                className="registration-chart"
                ariaLabel="按登记日期统计的已登记项目数量和预计年均减排量"
                onClick={(params) => {
                  const date = String(params.name || "");
                  const row = projectRegistrationTimeline.find((item) => item.date === date);
                  if (row) openGroupedProjectRows(
                    `${date} · 登记项目`,
                    row.rows,
                    ["项目业主", "计入期开始时间", "计入期结束时间", "预计年均减排量", "项目寿命期限"],
                    (project) => [
                      { label: "项目业主", value: project.owner },
                      { label: "计入期开始时间", value: project.creditingStart || "—" },
                      { label: "计入期结束时间", value: project.creditingEnd || "—" },
                      { label: "预计年均减排量", value: `${exactNumber(project.expectedAnnual, 0)} 吨/年` },
                      { label: "项目寿命期限", value: project.projectLifetimeYears ? `${exactNumber(project.projectLifetimeYears, 0)} 年` : "—" },
                    ],
                  );
                }}
              />
            </article>
            <article className="panel">
              <PanelTitle
                label="FIGURE 09"
                title="减排量登记记录日期分布"
                note="现有历史记录统一归入“2026-07-11 前”；以后每次更新发现的新记录按更新当日登记。"
              />
              <EChart
                option={reductionRegistrationOption}
                className="registration-chart"
                ariaLabel="按发现日期统计的减排量登记记录数量"
                onClick={(params) => {
                  const label = String(params.name || "");
                  const row = reductionRegistrationTimeline.find((item) => item.label === label);
                  if (row) openGroupedProjectRows(
                    `${label} · 减排量登记记录`,
                    row.rows,
                    ["项目业主", "登记减排量", "本次核算期覆盖日期"],
                    (project) => [
                      { label: "项目业主", value: project.owner },
                      { label: "登记减排量", value: `${exactNumber(project.actualReduction, 0)} 吨` },
                      { label: "本次核算期覆盖日期", value: project.accountingPeriodStart && project.accountingPeriodEnd ? `${project.accountingPeriodStart} 至 ${project.accountingPeriodEnd}` : "—" },
                    ],
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
                            ["项目状态", "登记日期"],
                            (project) => [
                              { label: "项目状态", value: project.categoryName },
                              { label: "登记日期", value: project.registrationDate || "—" },
                            ],
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
                <label className="search-control">
                  <span>检索</span>
                  <input value={institutionSearch} onChange={(event) => setInstitutionSearch(event.target.value)} placeholder="输入机构名称" />
                </label>
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

        <section className="methodology-notes" aria-labelledby="methodology-title">
          <div>
            <div className="eyebrow">METHODOLOGY & SOURCES</div>
            <h2 id="methodology-title">指标口径与数据来源</h2>
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
      </main>

      <footer>
        <span>全国 CCER 市场研究数据门户</span>
        <span>数据快照：{data.generatedAt.replace("T", " ")}</span>
      </footer>

      <DownloadDialog open={downloadOpen} onClose={() => setDownloadOpen(false)} />
      <Drawer key={drawer?.title || "closed"} state={drawer} onClose={() => setDrawer(null)} />
    </>
  );
}
