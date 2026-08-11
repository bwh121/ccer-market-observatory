import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.resolve(__dirname, "..");
const workspace = process.env.CCER_WORKSPACE
  ? path.resolve(process.env.CCER_WORKSPACE)
  : path.resolve(siteDir, "..");
const dataDir = path.join(
  workspace,
  "outputs",
  "019f4bb3-63bc-7e62-96dc-895128b03979",
  "data",
);
const ceaDataDir = process.env.CEA_DATA_DIR
  ? path.resolve(process.env.CEA_DATA_DIR)
  : path.join(workspace, "outputs", "cea-market", "data");

const readJson = async (name) => JSON.parse(await fs.readFile(path.join(dataDir, name), "utf8"));
const readCeaJson = async (name) => JSON.parse(await fs.readFile(path.join(ceaDataDir, name), "utf8"));
const [tradesRaw, projectsRaw, reductionsRaw, quality, ceaDailyRaw, ceaQuality] = await Promise.all([
  readJson("trade_daily.json"),
  readJson("project_details.json"),
  readJson("reduction_amount_details.json"),
  readJson("quality_report.json"),
  readCeaJson("daily_wide.json"),
  readCeaJson("quality_report.json"),
]);

const STATUS_ORDER = [
  ["1", "公示中项目"],
  ["1-1", "公示结束项目"],
  ["2", "已登记项目"],
  ["3", "公示中减排量"],
  ["3-1", "公示结束减排量"],
  ["4", "已登记减排量"],
  ["6", "已注销项目"],
];

const asNumber = (value) => {
  if (value == null || value === "") return 0;
  const parsed = Number(String(value).replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const normalizeDate = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 8) return "";
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
};

const monthRange = (start, end) => {
  if (!/^\d{4}-\d{2}$/.test(start || "") || !/^\d{4}-\d{2}$/.test(end || "") || start > end) return [];
  const result = [];
  let [year, month] = start.split("-").map(Number);
  while (`${year}-${String(month).padStart(2, "0")}` <= end) {
    result.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month === 13) {
      year += 1;
      month = 1;
    }
  }
  return result;
};

const addMonthlyTrade = (index, date, volume, turnover) => {
  const month = String(date || "").slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return;
  if (!index.has(month)) index.set(month, { volume: 0, turnover: 0 });
  const bucket = index.get(month);
  bucket.volume += asNumber(volume);
  bucket.turnover += asNumber(turnover);
};

const reductionRegistrationRegistryPath = path.join(
  siteDir,
  "data",
  "reduction-registration-dates.json",
);
const projectRegistrationRegistryPath = path.join(
  siteDir,
  "data",
  "project-registration-dates.json",
);

let reductionRegistrationRegistry = {};
let reductionRegistrationRegistryExists = true;
let projectRegistrationRegistry = {};
let projectRegistrationRegistryExists = true;
try {
  reductionRegistrationRegistry = JSON.parse(
    await fs.readFile(reductionRegistrationRegistryPath, "utf8"),
  );
} catch {
  reductionRegistrationRegistryExists = false;
}
try {
  projectRegistrationRegistry = JSON.parse(
    await fs.readFile(projectRegistrationRegistryPath, "utf8"),
  );
} catch {
  projectRegistrationRegistryExists = false;
}

const currentSnapshotDate = normalizeDate(quality.generated_at) || new Date().toISOString().slice(0, 10);
const HISTORICAL_REDUCTION_BUCKET = "before-2026-07-11";
const HISTORICAL_PROJECT_BUCKET = "before-2026-07-11";

function parseCoordinate(value) {
  if (value == null || value === "") return null;
  const text = String(value)
    .trim()
    .replaceAll("º", "°")
    .replaceAll("′", "'")
    .replaceAll("’", "'")
    .replaceAll("″", '"')
    .replaceAll("”", '"');
  const direct = Number(text);
  if (Number.isFinite(direct)) return direct;
  const match = text.match(/(-?\d+(?:\.\d+)?)\s*°\s*(?:(\d+(?:\.\d+)?)\s*')?\s*(?:(\d+(?:\.\d+)?)\s*")?/);
  if (!match) return null;
  const degrees = Number(match[1]);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  const sign = degrees < 0 ? -1 : 1;
  return sign * (Math.abs(degrees) + minutes / 60 + seconds / 3600);
}

let swappedCoordinates = 0;
function normalizedCoordinates(longitude, latitude) {
  let lon = parseCoordinate(longitude);
  let lat = parseCoordinate(latitude);
  if (lon == null || lat == null) return [null, null];
  const lonLooksLikeLatitude = lon >= 15 && lon <= 55;
  const latLooksLikeLongitude = lat >= 70 && lat <= 140;
  if (lonLooksLikeLatitude && latLooksLikeLongitude) {
    [lon, lat] = [lat, lon];
    swappedCoordinates += 1;
  }
  if (lon < 70 || lon > 140 || lat < 10 || lat > 60) return [null, null];
  return [Number(lon.toFixed(6)), Number(lat.toFixed(6))];
}

const reductionBySnapshot = new Map();
for (const row of reductionsRaw) {
  if (String(row._category_code) !== "4") continue;
  const key = row._snapshot_key;
  if (!reductionBySnapshot.has(key)) {
    reductionBySnapshot.set(key, { total: 0, years: new Set(), entries: [] });
  }
  const bucket = reductionBySnapshot.get(key);
  const amount = asNumber(row.applyVol);
  const registrationYear = row.regYear == null ? "" : String(row.regYear);
  bucket.total += amount;
  if (registrationYear) bucket.years.add(registrationYear);
  bucket.entries.push({
    detailIndex: asNumber(row.detail_index),
    registrationYear,
    amount,
    status: row.statusCn || "",
  });
}

for (const row of projectsRaw.filter((project) => String(project._category_code) === "4")) {
  if (!reductionRegistrationRegistry[row._snapshot_key]) {
    reductionRegistrationRegistry[row._snapshot_key] = reductionRegistrationRegistryExists
      ? currentSnapshotDate
      : HISTORICAL_REDUCTION_BUCKET;
  }
}
for (const row of projectsRaw.filter((project) => String(project._category_code) === "2")) {
  if (!projectRegistrationRegistry[row._snapshot_key]) {
    projectRegistrationRegistry[row._snapshot_key] = projectRegistrationRegistryExists
      ? currentSnapshotDate
      : HISTORICAL_PROJECT_BUCKET;
  }
}

const projects = projectsRaw.map((row) => {
  const [longitude, latitude] = normalizedCoordinates(row.longitude, row.latitude);
  const reduction = reductionBySnapshot.get(row._snapshot_key);
  const expectedAnnual = asNumber(row.expectYearNum);
  const actualReduction = reduction ? Number(reduction.total.toFixed(2)) : 0;
  const reductionYears = reduction ? reduction.years.size : 0;
  const reductionYearLabels = reduction
    ? [...reduction.years].sort((a, b) => a.localeCompare(b))
    : [];
  const reductionRegistrationDate =
    String(row._category_code || "") === "4"
      ? reductionRegistrationRegistry[row._snapshot_key] || HISTORICAL_REDUCTION_BUCKET
      : "";
  const projectFirstSeenDate =
    String(row._category_code || "") === "2"
      ? projectRegistrationRegistry[row._snapshot_key] || HISTORICAL_PROJECT_BUCKET
      : "";
  const actualAnnualAverage = reductionYears > 0 ? Number((actualReduction / reductionYears).toFixed(2)) : 0;
  const accountingPeriodSequence = String(row.certificationPeriodNo || "");
  const reductionEntries = reduction
    ? reduction.entries
        .slice()
        .sort((a, b) => a.registrationYear.localeCompare(b.registrationYear) || a.detailIndex - b.detailIndex)
        .map((entry) => ({
          ...entry,
          accountingPeriodSequence,
          reductionRegistrationDate,
        }))
    : [];
  return {
    snapshotKey: row._snapshot_key,
    categoryCode: String(row._category_code || ""),
    categoryName: row._category_name || "未分类",
    statusName: row.applyStatusName || row.list_statusName || row.statusName || "未注明",
    projectName: row.projectName || row.list_projectName || "未命名项目",
    projectCode: row.projectCode || row.ccerCode || "",
    commencementDate: normalizeDate(row.commencementDate),
    registrationDate: normalizeDate(row.registrationTime || row.projectRegDateTime),
    projectFirstSeenDate,
    projectFirstSeenLabel:
      projectFirstSeenDate === HISTORICAL_PROJECT_BUCKET
        ? "2026-07-11 前"
        : projectFirstSeenDate,
    creditingStart: normalizeDate(row.firstReckonDate),
    creditingEnd: normalizeDate(row.endReckonDate),
    projectLifetimeYears: asNumber(row.conclusionDate),
    accountingPeriodStart: normalizeDate(row.regAppStartDate),
    accountingPeriodEnd: normalizeDate(row.regAppEndDate),
    accountingPeriodSequence,
    detailUrl: row._detail_url || row._source_list_url || quality.sources.project_list,
    province: row.provinceName || "未注明",
    longitude,
    latitude,
    methodology: row.methodologyName || row.projectTypeName || row.list_projectTypeName || "未注明方法学",
    methodologyCode: row.methodologyNum || row.projectType || "",
    owner: row.orgCustomerName || row.list_orgCustomerName || "未注明项目业主",
    auditAgency: row.approvalAuthorityName || "",
    verifyAgency: row.verificationAgencyName || "",
    expectedAnnual,
    expectedTotal: asNumber(row.expectMaxNum),
    certifiedNum: asNumber(row.certifiedNum),
    actualReduction,
    reductionYears,
    reductionYearLabels,
    reductionRegistrationDate,
    reductionRegistrationLabel:
      reductionRegistrationDate === HISTORICAL_REDUCTION_BUCKET
        ? "2026-07-11 前"
        : reductionRegistrationDate,
    reductionEntries,
    actualAnnualAverage,
    expectedAnnualAchievementRate:
      expectedAnnual > 0 ? Number((actualAnnualAverage / expectedAnnual).toFixed(6)) : null,
  };
});

const trades = tradesRaw
  .map((row) => ({
    date: row.trade_date,
    volume: asNumber(row.daily_volume_tons),
    turnover: asNumber(row.daily_turnover_yuan),
    price: row.daily_avg_price_yuan_per_ton == null ? null : asNumber(row.daily_avg_price_yuan_per_ton),
    cumulativeVolume: asNumber(row.cumulative_volume_tons),
    cumulativeTurnover: asNumber(row.cumulative_turnover_yuan),
    status: row.parse_status,
    note: row.parse_notes || "",
    sourceUrl: row.article_url,
  }))
  .sort((a, b) => String(a.date).localeCompare(String(b.date)));

if (ceaQuality.status === "FAIL" || Number(ceaQuality.summary?.error_issues || 0) > 0) {
  throw new Error("CEA quality report is not publishable");
}

const ccerMonthly = new Map();
for (const row of trades) addMonthlyTrade(ccerMonthly, row.date, row.volume, row.turnover);
const ceaMonthly = new Map();
for (const row of ceaDailyRaw) {
  if (row.subject_code !== "COMCEA") continue;
  addMonthlyTrade(ceaMonthly, row.trade_date, row.subtotal_volume_t, row.subtotal_amount_cny);
}
const firstCcerMonth = trades.find((row) => row.volume > 0)?.date.slice(0, 7) || "";
const latestCcerMonth = trades.at(-1)?.date.slice(0, 7) || "";
const carbonPriceMonths = monthRange(firstCcerMonth, latestCcerMonth).map((month) => {
  const ccer = ccerMonthly.get(month) || { volume: 0, turnover: 0 };
  const cea = ceaMonthly.get(month) || { volume: 0, turnover: 0 };
  const ccerPrice = ccer.volume > 0 ? Number((ccer.turnover / ccer.volume).toFixed(4)) : null;
  const ceaPrice = cea.volume > 0 ? Number((cea.turnover / cea.volume).toFixed(4)) : null;
  const priceSpread = ccerPrice != null && ceaPrice != null
    ? Number((ccerPrice - ceaPrice).toFixed(4))
    : null;
  const premiumRate = ccerPrice != null && ceaPrice != null && ceaPrice > 0
    ? Number((ccerPrice / ceaPrice - 1).toFixed(6))
    : null;
  return {
    month,
    ccerVolume: Number(ccer.volume.toFixed(2)),
    ccerTurnover: Number(ccer.turnover.toFixed(2)),
    ccerPrice,
    ceaVolume: Number(cea.volume.toFixed(2)),
    ceaTurnover: Number(cea.turnover.toFixed(2)),
    ceaPrice,
    priceSpread,
    premiumRate,
  };
});
const carbonPriceComparison = {
  ccerDataThrough: quality.trade.date_max,
  ceaDataThrough: ceaQuality.summary?.last_data_date || "",
  months: carbonPriceMonths,
};

const latestTrade = trades.at(-1);
const tradeSummary = latestTrade
  ? {
      latestDate: latestTrade.date,
      latestPrice: latestTrade.price,
      latestVolume: latestTrade.volume,
      latestTurnover: latestTrade.turnover,
      cumulativeAveragePrice:
        latestTrade.cumulativeVolume > 0
          ? Number((latestTrade.cumulativeTurnover / latestTrade.cumulativeVolume).toFixed(2))
          : null,
      cumulativeVolume: latestTrade.cumulativeVolume,
      cumulativeTurnover: latestTrade.cumulativeTurnover,
    }
  : null;

const methodologies = [...new Set(projects.map((row) => row.methodology))].sort((a, b) =>
  a.localeCompare(b, "zh-CN"),
);
const provinces = [...new Set(projects.map((row) => row.province))].sort((a, b) =>
  a.localeCompare(b, "zh-CN"),
);
const mappedRegistered = projects.filter(
  (row) => ["2", "4"].includes(row.categoryCode) && row.longitude != null && row.latitude != null,
).length;
const registeredTotal = projects.filter((row) => ["2", "4"].includes(row.categoryCode)).length;
const knownStatusCodes = new Set(STATUS_ORDER.map(([code]) => code));
const discoveredStatuses = [...new Map(
  projects.map((row) => [row.categoryCode, row.categoryName]),
).entries()]
  .filter(([code]) => !knownStatusCodes.has(code))
  .sort((a, b) => a[0].localeCompare(b[0]));
const statusOrder = [...STATUS_ORDER, ...discoveredStatuses].map(([code, name]) => ({ code, name }));

const dashboard = {
  generatedAt: quality.generated_at,
  dataThrough: quality.trade.date_max,
  tradeSummary,
  trades,
  carbonPriceComparison,
  projects,
  methodologies,
  provinces,
  statusOrder,
  quality: {
    projectRecords: projects.length,
    tradeRecords: trades.length,
    mappedRegistered,
    registeredTotal,
    swappedCoordinates,
    attachmentAccess: "官方下载接口要求登录；网页仅展示附件索引口径，不展示附件正文。",
    inferredTradeRows: trades.filter((row) => row.status === "inferred").length,
    reviewedTradeRows: trades.filter((row) => row.status === "review").length,
  },
  definitions: {
    actualReduction: "已登记减排量页面中，各项目减排量申请明细（applyVol）跨年度求和。",
    actualAnnualAverage: "项目实际登记减排量 ÷ 该项目减排量申请明细覆盖年份数。",
    cumulativeAveragePrice: "最新累计成交额 ÷ 最新累计成交量。",
    monthlyWeightedAveragePrice: "CCER、CEA 月成交均价均按当月总成交额 ÷ 当月总成交量计算。",
    ccerCeaPremiumRate: "CCER 相对 CEA 溢价率 = CCER 月成交均价 ÷ CEA 月成交均价 - 1。",
    achievementRate:
      "实际登记年均减排量 ÷ 预计年均减排量；方法学层面采用两项指标汇总值之比。",
    statusGrain: "项目状态图按官网七类公开页面中的状态记录计数；同一项目可能在不同状态页面出现。",
  },
  sources: [
    { label: "全国 CCER 市场每日行情", url: quality.sources.trade_index },
    { label: "全国碳排放配额（CEA）交易数据", url: "https://shyx.cneeex.com/qdata.html" },
    { label: "项目与减排量信息公开", url: quality.sources.project_list },
    {
      label: "中国省级行政区划底图",
      url: "https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json",
    },
  ],
};

await fs.mkdir(path.join(siteDir, "public", "data"), { recursive: true });
await fs.mkdir(path.dirname(reductionRegistrationRegistryPath), { recursive: true });
await fs.writeFile(
  reductionRegistrationRegistryPath,
  `${JSON.stringify(reductionRegistrationRegistry, null, 2)}\n`,
  "utf8",
);
await fs.writeFile(
  projectRegistrationRegistryPath,
  `${JSON.stringify(projectRegistrationRegistry, null, 2)}\n`,
  "utf8",
);
const outputPath = path.join(siteDir, "public", "data", "dashboard.json");
await fs.writeFile(outputPath, JSON.stringify(dashboard), "utf8");
console.log(
  JSON.stringify(
    {
      outputPath,
      trades: trades.length,
      carbonPriceMonths: carbonPriceMonths.length,
      ceaDataThrough: carbonPriceComparison.ceaDataThrough,
      projects: projects.length,
      methodologies: methodologies.length,
      registeredReductionRows: projects.filter((row) => row.categoryCode === "4").length,
      actualReduction: projects
        .filter((row) => row.categoryCode === "4")
        .reduce((sum, row) => sum + row.actualReduction, 0),
      mappedRegistered,
      registeredTotal,
      swappedCoordinates,
    },
    null,
    2,
  ),
);
