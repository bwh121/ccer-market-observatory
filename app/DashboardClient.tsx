"use client";

import type { EChartsOption } from "echarts";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
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

type DrawerState = {
  eyebrow: string;
  title: string;
  description: string;
  items: DrawerItem[];
};

type OwnerRow = {
  name: string;
  projectCount: number;
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
  details: { role: string; project: Project }[];
};

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

function Drawer({ state, onClose }: { state: DrawerState | null; onClose: () => void }) {
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
        <div className="drawer-list">
          {state.items.length ? (
            state.items.map((item, index) => (
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
      </aside>
    </div>
  );
}

function ChinaMaps({ data, openProjects }: { data: DashboardData; openProjects: (title: string, rows: Project[]) => void }) {
  const [mapReady, setMapReady] = useState(false);
  const [heatMetric, setHeatMetric] = useState<"registeredProjects" | "actualReduction">("registeredProjects");
  const [pointStatus, setPointStatus] = useState<"2" | "4">("2");

  useEffect(() => {
    let active = true;
    fetch("/china.json")
      .then((response) => response.json())
      .then((geoJson) => {
        if (!active) return;
        echarts.registerMap("ccer-china", geoJson);
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
    return [...byProvince.entries()].map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }));
  }, [data.projects, heatMetric]);

  const heatOption = useMemo<EChartsOption>(() => {
    const maxValue = Math.max(1, ...heatData.map((row) => row.value));
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
      visualMap: {
        min: 0,
        max: maxValue,
        left: 16,
        bottom: 14,
        text: [heatMetric === "registeredProjects" ? "项目多" : "减排量高", "0"],
        inRange: { color: ["#e8f2ef", "#8cc4b7", "#147d70", "#0b4f4a"] },
        calculable: true,
        textStyle: { color: "#52615f", fontSize: 10 },
      },
      series: [
        {
          type: "map",
          map: "ccer-china",
          roam: true,
          zoom: 1.06,
          data: heatData,
          label: { show: false },
          itemStyle: { areaColor: "#eef3f1", borderColor: "#a5b8b4", borderWidth: 0.7 },
          emphasis: { label: { show: true, color: "#14211f" }, itemStyle: { areaColor: "#d9b36c" } },
        },
      ],
    };
  }, [heatData, heatMetric]);

  const pointRows = useMemo(
    () => data.projects.filter((row) => row.categoryCode === pointStatus && row.longitude != null && row.latitude != null),
    [data.projects, pointStatus],
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
        right: 4,
        top: 16,
        bottom: 16,
        textStyle: { color: "#4b5c59", fontSize: 10 },
      },
      geo: {
        map: "ccer-china",
        roam: true,
        zoom: 1.06,
        left: 12,
        right: 118,
        top: 12,
        bottom: 12,
        itemStyle: { areaColor: "#edf2f0", borderColor: "#a6b8b4", borderWidth: 0.7 },
        emphasis: { itemStyle: { areaColor: "#dce9e5" }, label: { show: false } },
      },
      series: data.methodologies.map((method, methodPosition) => ({
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
      })),
    };
  }, [data.methodologies, pointRows]);

  if (!mapReady) {
    return <div className="map-loading">省级底图加载中…</div>;
  }

  return (
    <div className="map-grid">
      <article className="panel map-panel">
        <PanelTitle
          label="MAP 01"
          title="省级分布热力图"
          note="地图着色按已登记项目或已登记减排量汇总。"
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
        <EChart option={heatOption} className="map-chart" ariaLabel="全国CCER省级分布热力图" />
      </article>

      <article className="panel map-panel">
        <PanelTitle
          label="MAP 02"
          title="项目经纬度与方法学分布"
          note={`${pointRows.length} 个项目坐标已纳入；颜色与形状区分方法学。`}
          controls={
            <label className="select-control">
              项目状态
              <select value={pointStatus} onChange={(event) => setPointStatus(event.target.value as typeof pointStatus)}>
                <option value="2">已登记项目</option>
                <option value="4">已登记减排量项目</option>
              </select>
            </label>
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
  const [methodStatusFilter, setMethodStatusFilter] = useState<Set<string>>(new Set(["1", "1-1", "2", "3", "3-1", "4"]));
  const [ownerMethodFilter, setOwnerMethodFilter] = useState<Set<string>>(new Set());
  const [ownerSearch, setOwnerSearch] = useState("");
  const [institutionSearch, setInstitutionSearch] = useState("");
  const [relationLimit, setRelationLimit] = useState("18");

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
          const denominator = row.expectedAnnual * Math.max(row.reductionYears, 1);
          const rate = denominator > 0 ? row.actualReduction / denominator : null;
          return {
            title: row.projectName,
            href: row.detailUrl,
            meta: [
              { label: "状态", value: row.categoryName },
              { label: "方法学", value: row.methodology },
              { label: "项目业主", value: row.owner },
              { label: "预计年均减排量", value: `${exactNumber(row.expectedAnnual, 0)} 吨` },
              { label: "实际登记减排量", value: `${exactNumber(row.actualReduction, 0)} 吨` },
              ...(rate == null ? [] : [{ label: "达成率", value: `${(rate * 100).toFixed(1)}%` }]),
            ],
          };
        }),
    });
  };

  const tradeOption = useMemo<EChartsOption>(() => {
    if (!data) return {};
    return {
      animationDuration: 500,
      color: ["#9fc8bf", "#9b4d5b"],
      grid: { left: 58, right: 66, top: 36, bottom: 82 },
      legend: { top: 0, right: 0, data: ["每日成交量", "成交均价"], textStyle: { color: "#475754" } },
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
        { type: "inside", start: 55, end: 100 },
        {
          type: "slider",
          start: 55,
          end: 100,
          height: 24,
          bottom: 18,
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
      },
    ],
  }), [statusSummary]);

  const registeredProjects = useMemo(() => data?.projects.filter((row) => row.categoryCode === "2") || [], [data]);
  const registeredReductionProjects = useMemo(() => data?.projects.filter((row) => row.categoryCode === "4") || [], [data]);

  const methodSummary = useMemo(() => {
    if (!data) return [];
    return data.methodologies.map((methodology) => {
      const methodRows = data.projects.filter((row) => row.methodology === methodology);
      const registered = methodRows.filter((row) => row.categoryCode === "2");
      const reduction = methodRows.filter((row) => row.categoryCode === "4");
      return {
        methodology,
        registeredCount: registered.length,
        registeredAnnual: sum(registered, "expectedAnnual"),
        reductionCount: reduction.length,
        actualReduction: sum(reduction, "actualReduction"),
      };
    });
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

  const methodCountOption = useMemo<EChartsOption>(() => ({
    grid: { left: 52, right: 16, top: 20, bottom: 118 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: {
      type: "category",
      data: methodChartData.map((row) => row.methodology),
      axisLabel: { interval: 0, rotate: 34, color: "#596966", fontSize: 10 },
      axisLine: { lineStyle: { color: "#aab9b6" } },
    },
    yAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: "#e7edeb" } } },
    series: [
      {
        type: "bar",
        data: methodChartData.map((row, index) => ({ value: row.count, itemStyle: { color: METHOD_COLORS[index % METHOD_COLORS.length] } })),
        barMaxWidth: 34,
        label: { show: true, position: "top", color: "#31403d" },
      },
    ],
  }), [methodChartData]);

  const methodExpectedOption = useMemo<EChartsOption>(() => ({
    grid: { left: 72, right: 16, top: 20, bottom: 118 },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      valueFormatter: (value) => `${exactNumber(Number(value || 0), 0)} 吨/年`,
    },
    xAxis: {
      type: "category",
      data: methodChartData.map((row) => row.methodology),
      axisLabel: { interval: 0, rotate: 34, color: "#596966", fontSize: 10 },
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
        data: methodChartData.map((row, index) => ({ value: row.expectedAnnual, itemStyle: { color: METHOD_COLORS[index % METHOD_COLORS.length] } })),
        barMaxWidth: 34,
      },
    ],
  }), [methodChartData]);

  const reductionComparison = useMemo(() => {
    if (!data) return [];
    return data.methodologies.map((methodology) => {
      const rows = registeredReductionProjects.filter((row) => row.methodology === methodology);
      return {
        methodology,
        rows,
        averageExpected: rows.length ? sum(rows, "expectedAnnual") / rows.length : 0,
        actualReduction: sum(rows, "actualReduction"),
      };
    });
  }, [data, registeredReductionProjects]);

  const reductionComparisonOption = useMemo<EChartsOption>(() => ({
    color: ["#147d70", "#9b4d5b"],
    grid: { left: 74, right: 76, top: 58, bottom: 118 },
    legend: { top: 0, data: ["实际登记减排量", "平均预计年均减排量"], textStyle: { color: "#475754" } },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
      formatter: (raw: unknown) => {
        const params = (Array.isArray(raw) ? raw : [raw]) as Array<{ seriesName?: string; value?: unknown; axisValue?: string }>;
        return [
          `<strong>${params[0]?.axisValue || ""}</strong>`,
          ...params.map((row) => `${row.seriesName || ""}：${exactNumber(Number(row.value || 0), 0)} 吨`),
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
        name: "实际登记减排量（吨）",
        nameTextStyle: { color: "#596966" },
        axisLabel: { formatter: (value: number) => compactNumber(value, 0), color: "#596966" },
        splitLine: { lineStyle: { color: "#e7edeb" } },
      },
      {
        type: "value",
        name: "平均预计年均减排量（吨）",
        nameTextStyle: { color: "#596966" },
        axisLabel: { formatter: (value: number) => compactNumber(value, 0), color: "#596966" },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "实际登记减排量",
        type: "bar",
        data: reductionComparison.map((row) => row.actualReduction),
        barMaxWidth: 38,
        itemStyle: { color: "#147d70" },
      },
      {
        name: "平均预计年均减排量",
        type: "line",
        yAxisIndex: 1,
        data: reductionComparison.map((row) => Number(row.averageExpected.toFixed(2))),
        symbolSize: 7,
        lineStyle: { color: "#9b4d5b", width: 2 },
        itemStyle: { color: "#9b4d5b" },
      },
    ],
  }), [reductionComparison]);

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
          registeredCount: new Set(rows.filter((row) => row.categoryCode === "2").map((row) => row.projectName)).size,
          registeredReductionCount: new Set(reduction.map((row) => row.projectName)).size,
          expectedTotal: sum(canonical, "expectedTotal"),
          actualReduction: sum(reduction, "actualReduction"),
          projects: canonical,
        };
      })
      .filter((row) => row.name.includes(ownerSearch.trim()))
      .sort((a, b) => b.actualReduction - a.actualReduction || b.projectCount - a.projectCount || a.name.localeCompare(b.name, "zh-CN"));
  }, [data, ownerMethodFilter, ownerSearch]);

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
        details: [
          ...[...bucket.audit.values()].map((project) => ({ role: "审定", project })),
          ...[...bucket.verify.values()].map((project) => ({ role: "核查", project })),
        ],
      }))
      .filter((row) => row.name.includes(institutionSearch.trim()))
      .sort((a, b) => b.auditCount + b.verifyCount - (a.auditCount + a.verifyCount) || a.name.localeCompare(b.name, "zh-CN"));
  }, [data, institutionSearch]);

  const relationData = useMemo(() => {
    if (!data) return { nodes: [], links: [], ownerProjects: new Map<string, Project[]>(), institutionProjects: new Map<string, Project[]>() };
    const relationSeen = new Set<string>();
    const edges = new Map<string, { owner: string; institution: string; projects: Set<string>; roles: Set<string>; value: number }>();
    const ownerProjects = new Map<string, Project[]>();
    const institutionProjects = new Map<string, Project[]>();
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
          edges.set(edgeKey, { owner: project.owner, institution, projects: new Set(), roles: new Set(), value: 0 });
        }
        const edge = edges.get(edgeKey);
        if (edge) {
          edge.projects.add(project.projectName);
          edge.roles.add(role);
          edge.value += 1;
        }
        if (!ownerProjects.has(project.owner)) ownerProjects.set(project.owner, []);
        ownerProjects.get(project.owner)?.push(project);
        if (!institutionProjects.has(institution)) institutionProjects.set(institution, []);
        institutionProjects.get(institution)?.push(project);
      }
    }
    const ownerScores = new Map<string, number>();
    for (const edge of edges.values()) ownerScores.set(edge.owner, (ownerScores.get(edge.owner) || 0) + edge.value);
    const selectedOwners = new Set(
      [...ownerScores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, relationLimit === "all" ? undefined : Number(relationLimit))
        .map(([name]) => name),
    );
    const selectedEdges = [...edges.values()].filter((edge) => selectedOwners.has(edge.owner));
    const institutions = new Set(selectedEdges.map((edge) => edge.institution));
    const nodes = [
      ...[...selectedOwners].map((name) => ({ name: `甲方｜${name}`, itemStyle: { color: "#1f5f8b" }, depth: 0 })),
      ...[...institutions].map((name) => ({ name: `乙方｜${name}`, itemStyle: { color: "#147d70" }, depth: 1 })),
    ];
    const links = selectedEdges.map((edge) => ({
      source: `甲方｜${edge.owner}`,
      target: `乙方｜${edge.institution}`,
      value: edge.value,
      projects: edge.projects.size,
      roles: [...edge.roles].join(" / "),
    }));
    return { nodes, links, ownerProjects, institutionProjects };
  }, [data, relationLimit]);

  const relationOption = useMemo<EChartsOption>(() => ({
    tooltip: {
      trigger: "item",
      formatter: (raw: unknown) => {
        const params = raw as { dataType?: string; name?: string; data?: { source?: string; target?: string; projects?: number; roles?: string } };
        if (params.dataType === "edge") {
          const edge = params.data || {};
          return `${String(edge.source || "").replace(/^甲方｜/, "")}<br/>→ ${String(edge.target || "").replace(/^乙方｜/, "")}<br/>项目：${edge.projects || 0}<br/>角色：${edge.roles || ""}`;
        }
        return String(params.name || "").replace(/^(甲方|乙方)｜/, "");
      },
    },
    series: [
      {
        type: "sankey",
        left: 12,
        right: 12,
        top: 18,
        bottom: 18,
        nodeAlign: "justify",
        nodeGap: 10,
        nodeWidth: 12,
        draggable: false,
        data: relationData.nodes,
        links: relationData.links,
        emphasis: { focus: "adjacency" },
        lineStyle: { color: "gradient", curveness: 0.48, opacity: 0.28 },
        label: {
          color: "#30413e",
          fontSize: 10,
          width: 180,
          overflow: "truncate",
          formatter: (params: { name?: string }) => String(params.name || "").replace(/^(甲方|乙方)｜/, ""),
        },
      },
    ],
  }), [relationData]);

  if (error) return <main className="loading-screen">{error}</main>;
  if (!data) return <main className="loading-screen">正在装载 CCER 数据集…</main>;

  const methodOptions = data.methodologies.map((methodology) => ({ value: methodology, label: methodology }));
  const statusOptions = data.statusOrder.map((status) => ({ value: status.code, label: status.name }));

  return (
    <>
      <header className="site-header">
        <div className="header-brand">
          <div className="brand-mark">CCER · RESEARCH</div>
          <div>
            <strong>全国温室气体自愿减排市场</strong>
            <span>交易、项目与机构研究数据门户</span>
          </div>
        </div>
        <nav aria-label="页面章节">
          <a href="#trade">交易情况</a>
          <a href="#development">项目开发</a>
          <a href="#owners">项目业主</a>
          <a href="#institutions">审定与核查</a>
        </nav>
        <div className="freshness">
          <span>DATA THROUGH</span>
          <strong>{data.dataThrough}</strong>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">NATIONAL CCER MARKET OBSERVATORY</div>
            <h1>从交易价格到项目履约，观察全国 CCER 市场的形成与扩展</h1>
            <p>
              基于全国 CCER 交易系统和项目公示平台逐日、逐项目整理。所有指标均可回溯至官方详情页，图表支持筛选、悬停与项目级下钻。
            </p>
          </div>
          <dl className="hero-meta">
            <div>
              <dt>交易记录</dt>
              <dd>{data.quality.tradeRecords}</dd>
            </div>
            <div>
              <dt>状态记录</dt>
              <dd>{data.quality.projectRecords}</dd>
            </div>
            <div>
              <dt>方法学</dt>
              <dd>{data.methodologies.length}</dd>
            </div>
            <div>
              <dt>地图坐标覆盖</dt>
              <dd>
                {data.quality.mappedRegistered}/{data.quality.registeredTotal}
              </dd>
            </div>
          </dl>
        </section>

        <section id="trade" className="dashboard-section">
          <SectionHeading
            index="01"
            eyebrow="MARKET TRANSACTIONS"
            title="交易情况"
            description="聚焦最新交易日与市场累计规模，并用同一时间轴观察成交量和成交价格。"
          />
          <div className="kpi-grid six">
            <KpiCard label="最近交易日成交均价" value={exactNumber(data.tradeSummary.latestPrice || 0, 2)} unit="元/吨" note={data.tradeSummary.latestDate} tone="rust" />
            <KpiCard label="最近交易日成交量" value={compactNumber(data.tradeSummary.latestVolume)} unit="吨" note={exactNumber(data.tradeSummary.latestVolume, 0)} />
            <KpiCard label="最近交易日成交额" value={compactNumber(data.tradeSummary.latestTurnover)} unit="元" note={exactNumber(data.tradeSummary.latestTurnover, 2)} tone="blue" />
            <KpiCard label="累计平均成交价" value={exactNumber(data.tradeSummary.cumulativeAveragePrice || 0, 2)} unit="元/吨" note="累计成交额 ÷ 累计成交量" tone="rust" />
            <KpiCard label="累计成交量" value={compactNumber(data.tradeSummary.cumulativeVolume)} unit="吨" note={exactNumber(data.tradeSummary.cumulativeVolume, 0)} />
            <KpiCard label="累计成交额" value={compactNumber(data.tradeSummary.cumulativeTurnover)} unit="元" note={exactNumber(data.tradeSummary.cumulativeTurnover, 2)} tone="blue" />
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
            description="从空间分布、开发状态和方法学结构三个角度观察项目供给及减排量登记。"
          />

          <ChinaMaps data={data} openProjects={(title, rows) => openProjectRows(title, rows)} />

          <div className="subsection-heading">
            <span>2.1</span>
            <div>
              <h3>按项目状态</h3>
              <p>项目数量按官网状态记录计数；预计年均减排量为各状态记录求和。</p>
            </div>
          </div>
          <div className="kpi-grid four">
            <KpiCard label="已登记项目数量" value={exactNumber(registeredProjects.length, 0)} unit="个" tone="blue" />
            <KpiCard label="已登记项目预计年均减排量" value={compactNumber(sum(registeredProjects, "expectedAnnual"))} unit="吨/年" note={exactNumber(sum(registeredProjects, "expectedAnnual"), 0)} />
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
                  if (row) openProjectRows(`${name} · ${row.count} 条`, row.rows);
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
                  if (row) openProjectRows(`${name} · 预计年均减排量`, row.rows);
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
              <article className="method-card" key={row.methodology} style={{ "--method-color": METHOD_COLORS[index % METHOD_COLORS.length] } as CSSProperties}>
                <div className="method-index">M{String(index + 1).padStart(2, "0")}</div>
                <h4>{row.methodology}</h4>
                <dl>
                  <div>
                    <dt>已登记项目</dt>
                    <dd>{row.registeredCount}</dd>
                  </div>
                  <div>
                    <dt>预计年均减排量</dt>
                    <dd>{compactNumber(row.registeredAnnual)}</dd>
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

          <div className="method-filter-row">
            <span>图表筛选</span>
            <MultiFilter label="项目状态" options={statusOptions} selected={methodStatusFilter} onChange={setMethodStatusFilter} />
          </div>
          <div className="two-column-grid">
            <article className="panel">
              <PanelTitle label="FIGURE 04" title="各方法学项目数量" note="按所选项目状态汇总；点击柱子查看项目。" />
              <EChart
                option={methodCountOption}
                className="method-chart"
                ariaLabel="按方法学领域划分的项目数量柱状图"
                onClick={(params) => {
                  const name = String(params.name || "");
                  const row = methodChartData.find((item) => item.methodology === name);
                  if (row) openProjectRows(`${name} · 项目清单`, row.rows);
                }}
              />
            </article>
            <article className="panel">
              <PanelTitle label="FIGURE 05" title="各方法学预计年均减排量" note="按所选项目状态汇总；点击柱子查看项目。" />
              <EChart
                option={methodExpectedOption}
                className="method-chart"
                ariaLabel="按方法学领域划分的预计年均减排量柱状图"
                onClick={(params) => {
                  const name = String(params.name || "");
                  const row = methodChartData.find((item) => item.methodology === name);
                  if (row) openProjectRows(`${name} · 预计年均减排量`, row.rows);
                }}
              />
            </article>
          </div>

          <article className="panel wide-panel">
            <PanelTitle
              label="FIGURE 06"
              title="已登记减排量：预计年均水平与实际登记量"
              note="仅使用“已登记减排量”项目。柱为跨年度实际登记减排量，折线为项目平均预计年均减排量；点击柱子查看达成率。"
            />
            <EChart
              option={reductionComparisonOption}
              className="comparison-chart"
              ariaLabel="各方法学预计年均减排量与实际登记减排量组合图"
              onClick={(params) => {
                const name = String(params.name || "");
                const row = reductionComparison.find((item) => item.methodology === name);
                if (row) openProjectRows(`${name} · 已登记减排量项目`, row.rows, data.definitions.achievementRate);
              }}
            />
          </article>
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
              note={`当前筛选显示 ${ownerRows.length} 家项目业主。项目数量按项目名称去重。`}
              controls={
                <div className="table-controls">
                  <MultiFilter label="方法学领域" options={methodOptions} selected={ownerMethodFilter} onChange={setOwnerMethodFilter} />
                  <label className="search-control">
                    <span>检索</span>
                    <input value={ownerSearch} onChange={(event) => setOwnerSearch(event.target.value)} placeholder="输入项目业主名称" />
                  </label>
                </div>
              }
            />
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>项目业主名称</th>
                    <th>项目数量</th>
                    <th>已登记项目</th>
                    <th>已登记减排量项目</th>
                    <th>预计计入期总减排量（吨）</th>
                    <th>已登记减排量（吨）</th>
                  </tr>
                </thead>
                <tbody>
                  {ownerRows.map((row) => (
                    <tr key={row.name}>
                      <td>
                        <button type="button" className="table-link" onClick={() => openProjectRows(`${row.name} · 项目清单`, row.projects)}>
                          {row.name}
                        </button>
                      </td>
                      <td>{exactNumber(row.projectCount, 0)}</td>
                      <td>{exactNumber(row.registeredCount, 0)}</td>
                      <td>{exactNumber(row.registeredReductionCount, 0)}</td>
                      <td>{exactNumber(row.expectedTotal, 0)}</td>
                      <td>{exactNumber(row.actualReduction, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
          <article className="panel table-panel">
            <PanelTitle
              label="TABLE 02"
              title="审定与核查机构清单"
              note={`共识别 ${institutionRows.length} 家机构；同一项目中的审定与核查角色分别统计。`}
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
                    <th>详情</th>
                  </tr>
                </thead>
                <tbody>
                  {institutionRows.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      <td>{row.auditCount}</td>
                      <td>{row.verifyCount}</td>
                      <td>
                        <button
                          type="button"
                          className="detail-button"
                          onClick={() =>
                            setDrawer({
                              eyebrow: "INSTITUTION DETAILS",
                              title: row.name,
                              description: `审定 ${row.auditCount} 个项目，核查 ${row.verifyCount} 个项目。`,
                              items: row.details.map(({ role, project }) => ({
                                title: project.projectName,
                                href: project.detailUrl,
                                meta: [
                                  { label: "机构角色", value: role },
                                  { label: "项目业主", value: project.owner },
                                  { label: "方法学", value: project.methodology },
                                  { label: "项目状态", value: project.categoryName },
                                ],
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
              label="FIGURE 07"
              title="项目业主—审定与核查机构关系"
              note="左侧为项目业主，右侧为机构；连线宽度表示双方涉及的审定或核查记录数。点击节点查看相关项目。"
              controls={
                <label className="select-control">
                  展示业主
                  <select value={relationLimit} onChange={(event) => setRelationLimit(event.target.value)}>
                    <option value="12">前 12 家</option>
                    <option value="18">前 18 家</option>
                    <option value="30">前 30 家</option>
                    <option value="all">全部</option>
                  </select>
                </label>
              }
            />
            <EChart
              option={relationOption}
              className="relation-chart"
              ariaLabel="项目业主与审定核查机构关系图"
              onClick={(params) => {
                if (params.dataType !== "node") return;
                const name = String(params.name || "");
                if (name.startsWith("甲方｜")) {
                  const owner = name.slice(3);
                  openProjectRows(`${owner} · 关联项目`, uniqueProjects(relationData.ownerProjects.get(owner) || []));
                } else if (name.startsWith("乙方｜")) {
                  const institution = name.slice(3);
                  openProjectRows(`${institution} · 关联项目`, uniqueProjects(relationData.institutionProjects.get(institution) || []));
                }
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
              <h3>达成率</h3>
              <p>{data.definitions.achievementRate}</p>
            </article>
            <article>
              <span>03</span>
              <h3>状态记录</h3>
              <p>{data.definitions.statusGrain}</p>
            </article>
            <article>
              <span>04</span>
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

      <Drawer state={drawer} onClose={() => setDrawer(null)} />
    </>
  );
}
