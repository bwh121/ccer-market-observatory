import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.resolve(__dirname, "..");
const workspace = process.env.CCER_WORKSPACE
  ? path.resolve(process.env.CCER_WORKSPACE)
  : path.resolve(siteDir, "..");
const snapshotRoot = process.env.CEA_SNAPSHOT_ROOT
  ? path.resolve(process.env.CEA_SNAPSHOT_ROOT)
  : path.join(workspace, "outputs", "019fea8f-1712-7b01-bb43-f2bea0fb57cb");
const tradeDir = process.env.CEA_TRADE_DIR
  ? path.resolve(process.env.CEA_TRADE_DIR)
  : path.join(snapshotRoot, "cea_market");
const publicInfoDir = path.join(snapshotRoot, "cets_public_information");

const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const readJsonIfPresent = async (file, fallback = null) => {
  try {
    return await readJson(file);
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
};
const [
  dailyWideRaw,
  tradeQuality,
  keyEmittersRaw,
  verificationRaw,
  fulfillmentRaw,
  keyEmitterQuality,
  verificationQuality,
  fulfillmentQuality,
  ccerDashboard,
  existingCeaDashboard,
  publishedVerification,
] = await Promise.all([
  readJson(path.join(tradeDir, "data", "daily_wide.json")),
  readJson(path.join(tradeDir, "data", "quality_report.json")),
  readJsonIfPresent(path.join(publicInfoDir, "data", "key_emitters_enterprise.json"), []),
  readJsonIfPresent(path.join(publicInfoDir, "data", "verification_list.json"), []),
  readJsonIfPresent(path.join(publicInfoDir, "data", "fulfillment_enterprise.json"), []),
  readJsonIfPresent(path.join(publicInfoDir, "qa", "key_emitters_enterprise_quality.json")),
  readJsonIfPresent(path.join(publicInfoDir, "qa", "verification_list_quality.json")),
  readJsonIfPresent(path.join(publicInfoDir, "qa", "fulfillment_enterprise_quality.json")),
  readJson(path.join(siteDir, "public", "data", "dashboard.json")),
  readJsonIfPresent(path.join(siteDir, "public", "data", "cea-dashboard.json")),
  readJsonIfPresent(path.join(siteDir, "public", "data", "cea-verification.json")),
]);

const hasPublicInformationSnapshot = keyEmittersRaw.length > 0
  && verificationRaw.length > 0
  && fulfillmentRaw.length > 0;

// Never promote the three-document development sample into the production
// dashboard. A published verification snapshot is usable only after the
// parser's fail-closed completeness gate has passed.
const verificationPdfQuality = publishedVerification?.quality?.publish_ready
  ? publishedVerification.quality
  : null;
const verificationDetailsRaw = verificationPdfQuality ? publishedVerification.details || [] : [];
const verificationTargetsRaw = verificationPdfQuality ? publishedVerification.targets || [] : [];
const sourceMissingPdfIds = new Set(verificationPdfQuality?.source_missing_pdf_ids || []);
const sourceUnavailablePdfIds = new Set(verificationPdfQuality?.source_unavailable_pdf_ids || []);

const numberOrNull = (value) => {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const numberOrZero = (value) => numberOrNull(value) ?? 0;
const priceOrNull = (value) => {
  const parsed = numberOrNull(value);
  return parsed != null && parsed > 0 ? parsed : null;
};

const shanghaiTimestamp = () => `${new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
}).format(new Date()).replace(" ", "T")}+08:00`;

const subjects = [
  { code: "COMCEA", label: "综合行情" },
  { code: "CEA", label: "CEA" },
  { code: "CEA21", label: "CEA21" },
  { code: "CEA22", label: "CEA22" },
  { code: "CEA23", label: "CEA23" },
  { code: "CEA24", label: "CEA24" },
  { code: "CEA25", label: "CEA25" },
];

const tradeMethods = [
  {
    code: "10",
    key: "listing",
    name: "挂牌协议交易",
    shortName: "挂牌协议",
    volumeField: "listing_volume_t",
    amountField: "listing_amount_cny",
  },
  {
    code: "20",
    key: "block",
    name: "大宗协议交易",
    shortName: "大宗协议",
    volumeField: "block_volume_t",
    amountField: "block_amount_cny",
  },
  {
    code: "21",
    key: "auction",
    name: "单向竞价交易",
    shortName: "单向竞价",
    volumeField: "auction_volume_t",
    amountField: "auction_amount_cny",
  },
];

const daily = dailyWideRaw
  .map((row) => ({
    date: row.trade_date,
    subject: row.subject_code,
    open: priceOrNull(row.open_price_cny_per_t),
    high: priceOrNull(row.high_price_cny_per_t),
    low: priceOrNull(row.low_price_cny_per_t),
    close: priceOrNull(row.close_price_cny_per_t),
    changeRate: numberOrNull(row.change_rate),
    listingVolume: numberOrZero(row.listing_volume_t),
    listingAmount: numberOrZero(row.listing_amount_cny),
    blockVolume: numberOrZero(row.block_volume_t),
    blockAmount: numberOrZero(row.block_amount_cny),
    auctionVolume: numberOrZero(row.auction_volume_t),
    auctionAmount: numberOrZero(row.auction_amount_cny),
    totalVolume: numberOrZero(row.subtotal_volume_t),
    totalAmount: numberOrZero(row.subtotal_amount_cny),
  }))
  .sort((a, b) => a.date.localeCompare(b.date) || a.subject.localeCompare(b.subject));

const aggregateTrade = (periodOf) => {
  const index = new Map();
  for (const row of daily) {
    const period = periodOf(row.date);
    for (const method of tradeMethods) {
      const volume = row[`${method.key}Volume`];
      const amount = row[`${method.key}Amount`];
      const key = `${period}|${row.subject}|${method.code}`;
      if (!index.has(key)) {
        index.set(key, {
          period,
          subject: row.subject,
          methodCode: method.code,
          method: method.shortName,
          volume: 0,
          amount: 0,
        });
      }
      const bucket = index.get(key);
      bucket.volume += volume;
      bucket.amount += amount;
    }
  }
  return [...index.values()]
    .map((row) => ({
      ...row,
      volume: Number(row.volume.toFixed(4)),
      amount: Number(row.amount.toFixed(4)),
      averagePrice: row.volume > 0 ? Number((row.amount / row.volume).toFixed(4)) : null,
    }))
    .sort((a, b) => a.period.localeCompare(b.period) || a.subject.localeCompare(b.subject) || a.methodCode.localeCompare(b.methodCode));
};

const annualTrade = aggregateTrade((date) => date.slice(0, 4));
const monthlyTrade = aggregateTrade((date) => date.slice(0, 7));

const quotaByYear = new Map([
  ["2021", 8_000_000_000],
  ["2022", 4_500_000_000],
  ["2023", 4_500_000_000],
  ["2024", 5_000_000_000],
  ["2025", 5_000_000_000],
  ["2026", 7_000_000_000],
]);

const turnoverByYear = [...quotaByYear.entries()].map(([year, allowance]) => {
  const rows = annualTrade.filter((row) => row.period === year && row.subject === "COMCEA");
  const volume = rows.reduce((total, row) => total + row.volume, 0);
  return {
    year,
    allowance,
    volume: Number(volume.toFixed(4)),
    turnoverRate: allowance > 0 ? Number((volume / allowance).toFixed(8)) : null,
  };
});

const groupCounts = (rows, keyOf) => {
  const index = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    index.set(key, (index.get(key) || 0) + 1);
  }
  return [...index.entries()];
};

const emitterYears = [...new Set(keyEmittersRaw.map((row) => String(row.year)))].sort();
const coverageYearStats = emitterYears.map((year) => {
  const rows = keyEmittersRaw.filter((row) => String(row.year) === year);
  return {
    year,
    records: rows.length,
    uniqueEntities: new Set(rows.map((row) => row.unified_social_credit_code)).size,
    provinces: new Set(rows.map((row) => row.province).filter(Boolean)).size,
    industries: new Set(rows.map((row) => row.industry).filter(Boolean)).size,
  };
});

const coverageProvinceYear = groupCounts(
  keyEmittersRaw,
  (row) => `${row.year}|${row.province || "未披露"}`,
).map(([key, records]) => {
  const [year, province] = key.split("|");
  const rows = keyEmittersRaw.filter(
    (row) => String(row.year) === year && (row.province || "未披露") === province,
  );
  return {
    year,
    province,
    records,
    uniqueEntities: new Set(rows.map((row) => row.unified_social_credit_code)).size,
  };
});

const coverageIndustryYear = groupCounts(
  keyEmittersRaw,
  (row) => `${row.year}|${row.industry || "未披露"}`,
).map(([key, records]) => {
  const [year, industry] = key.split("|");
  return { year, industry, records };
});

const coverageProvinceIndustryYear = groupCounts(
  keyEmittersRaw,
  (row) => `${row.year}|${row.province || "未披露"}|${row.industry || "未披露"}`,
).map(([key, records]) => {
  const [year, province, industry] = key.split("|");
  const rows = keyEmittersRaw.filter(
    (row) => String(row.year) === year
      && (row.province || "未披露") === province
      && (row.industry || "未披露") === industry,
  );
  return {
    year,
    province,
    industry,
    records,
    uniqueEntities: new Set(rows.map((row) => row.unified_social_credit_code)).size,
  };
});

const keyEmitters = keyEmittersRaw.map((row) => ({
  id: row.key_emitter_record_id,
  year: String(row.year),
  province: row.province || "",
  city: row.city || "",
  industry: row.industry || "未披露",
  subindustry: row.subindustry || "",
  name: row.entity_name,
  uscc: row.unified_social_credit_code,
  authority: row.publishing_authority || "",
  publishedAt: row.published_at,
}));

const detailIds = new Set(verificationDetailsRaw.map((row) => row.verification_list_id));
const verificationInstitutions = verificationRaw.map((row) => ({
  id: row.verification_list_id,
  year: String(row.year),
  province: row.province || "",
  city: row.city || "",
  industry: row.industry,
  name: row.institution_name,
  uscc: row.unified_social_credit_code,
  authority: row.publishing_authority,
  publishedAt: row.published_at,
  detailStatus: detailIds.has(row.verification_list_id)
    ? "PDF已解析"
    : sourceMissingPdfIds.has(row.verification_list_id)
      ? "官网未附PDF"
      : sourceUnavailablePdfIds.has(row.verification_list_id)
        ? "官网链接失效"
        : "待解析",
}));

const fulfillment = fulfillmentRaw.map((row) => ({
  id: row.fulfillment_id,
  year: String(row.year),
  province: row.province || "",
  city: row.city || "",
  industry: row.industry || "",
  name: row.entity_name,
  uscc: row.unified_social_credit_code,
  onTime: row.completed_on_time,
  overdue: row.completed_overdue,
  incomplete: row.incomplete,
  punishment: row.punishment_for_late_completion,
  remarks: row.remarks || "",
  authority: row.publishing_authority,
  publishedAt: row.published_at,
}));

const fulfillmentYearStats = [...new Set(fulfillment.map((row) => row.year))]
  .sort()
  .map((year) => {
    const rows = fulfillment.filter((row) => row.year === year);
    return {
      year,
      records: rows.length,
      onTime: rows.filter((row) => row.onTime === "是").length,
      overdue: rows.filter((row) => row.overdue === "是").length,
      incomplete: rows.filter((row) => row.incomplete === "是").length,
    };
  });

const emitterLookup = new Map();
for (const row of keyEmitters) {
  emitterLookup.set(`${row.year}|${row.uscc}`, row);
  if (!emitterLookup.has(row.uscc)) emitterLookup.set(row.uscc, row);
}
const verificationLookup = new Map(verificationInstitutions.map((row) => [row.id, row]));

const mappedVerificationTargets = verificationTargetsRaw.map((row) => {
  const target = emitterLookup.get(`${row.year}|${row.target_uscc}`) || emitterLookup.get(row.target_uscc);
  const institution = verificationLookup.get(row.verification_list_id);
  return {
    verificationId: row.verification_list_id,
    year: String(row.year),
    industry: target?.industry && target.industry !== "未披露"
      ? target.industry
      : row.industry || institution?.industry || "",
    institutionName: row.institution_name,
    institutionUscc: row.institution_uscc,
    institutionProvince: institution?.province || "",
    targetOrder: row.target_order,
    targetName: row.target_entity_name,
    targetUscc: row.target_uscc,
    targetProvince: target?.province || "未匹配",
    targetCity: target?.city || "",
    timeliness: row.timeliness,
    result: row.result,
    pdfUrl: row.pdf_url,
    isLocal: Boolean(institution?.province && target?.province && institution.province === target.province),
  };
});
const seenVerificationRelationships = new Set();
const analyticalVerificationTargets = mappedVerificationTargets.filter((row) => {
  const key = [row.pdfUrl, row.year, row.institutionUscc, row.targetUscc].join("|");
  if (seenVerificationRelationships.has(key)) return false;
  seenVerificationRelationships.add(key);
  return true;
});
const verificationTargets = hasPublicInformationSnapshot
  ? analyticalVerificationTargets
  : existingCeaDashboard?.participants?.verificationTargets || [];

const comparison = ccerDashboard.carbonPriceComparison.months.map((row) => ({
  month: row.month,
  ceaVolume: row.ceaVolume,
  ceaAmount: row.ceaTurnover,
  ceaPrice: row.ceaPrice,
  ccerVolume: row.ccerVolume,
  ccerAmount: row.ccerTurnover,
  ccerPrice: row.ccerPrice,
  spreadRatio:
    row.ceaPrice != null && row.ccerPrice != null && row.ceaPrice !== 0
      ? Number((row.ccerPrice / row.ceaPrice - 1).toFixed(8))
      : null,
}));

const compositeRows = daily.filter((row) => row.subject === "COMCEA");
const latestPriceRow = [...compositeRows].reverse().find((row) => row.close != null);
const cumulativeVolume = compositeRows.reduce((total, row) => total + row.totalVolume, 0);
const cumulativeAmount = compositeRows.reduce((total, row) => total + row.totalAmount, 0);

const payload = {
  generatedAt: shanghaiTimestamp(),
  tradeDataThrough: tradeQuality.summary.last_data_date,
  priceComparisonDataThrough: ccerDashboard.carbonPriceComparison.ceaDataThrough,
  participantCapturedAt: keyEmittersRaw[0]?.captured_at || existingCeaDashboard?.participantCapturedAt || "",
  subjects,
  tradeMethods: tradeMethods.map((method) => ({
    code: method.code,
    key: method.key,
    name: method.name,
    shortName: method.shortName,
  })),
  marketSummary: {
    latestDate: latestPriceRow?.date || "",
    latestClose: latestPriceRow?.close ?? null,
    cumulativeVolume: Number(cumulativeVolume.toFixed(4)),
    cumulativeAmount: Number(cumulativeAmount.toFixed(4)),
    cumulativeAveragePrice:
      cumulativeVolume > 0 ? Number((cumulativeAmount / cumulativeVolume).toFixed(4)) : null,
  },
  officialCoverage: {
    year: "2025",
    managedEntities: 3378,
    sectorCounts: [
      { sector: "发电", count: 2087 },
      { sector: "钢铁", count: 232 },
      { sector: "水泥", count: 962 },
      { sector: "铝冶炼", count: 97 },
    ],
    carbonDioxideShare: "60%以上",
    gases: ["二氧化碳（CO₂）", "四氟化碳（CF₄）", "六氟化二碳（C₂F₆）"],
  },
  quotaBasis: [...quotaByYear.entries()].map(([year, allowance]) => ({ year, allowance })),
  turnoverByYear,
  daily,
  annualTrade,
  monthlyTrade,
  priceComparison: comparison,
  coverage: hasPublicInformationSnapshot ? {
    yearStats: coverageYearStats,
    provinceYear: coverageProvinceYear,
    provinceIndustryYear: coverageProvinceIndustryYear,
    industryYear: coverageIndustryYear,
  } : existingCeaDashboard.coverage,
  participants: {
    keyEmitterRecords: hasPublicInformationSnapshot ? keyEmitters.length : existingCeaDashboard.participants.keyEmitterRecords,
    verificationRecords: hasPublicInformationSnapshot ? verificationInstitutions.length : existingCeaDashboard.participants.verificationRecords,
    fulfillmentRecords: hasPublicInformationSnapshot ? fulfillment.length : existingCeaDashboard.participants.fulfillmentRecords,
    fulfillmentYearStats: hasPublicInformationSnapshot ? fulfillmentYearStats : existingCeaDashboard.participants.fulfillmentYearStats,
    verificationDetails: verificationDetailsRaw,
    verificationTargets,
    detailFile: "data/cea-participants.json",
  },
  quality: {
    trade: tradeQuality,
    keyEmitters: keyEmitterQuality || existingCeaDashboard.quality.keyEmitters,
    verification: verificationQuality || existingCeaDashboard.quality.verification,
    fulfillment: fulfillmentQuality || existingCeaDashboard.quality.fulfillment,
    verificationPdfCoverage: {
      parsed: verificationPdfQuality?.matched_list_records ?? verificationDetailsRaw.length,
      expected: verificationPdfQuality?.expected_list_records ?? verificationQuality?.expected_total ?? existingCeaDashboard.participants.verificationRecords,
      targets: verificationTargets.length,
      rawTargets: hasPublicInformationSnapshot
        ? mappedVerificationTargets.length
        : existingCeaDashboard.quality.verificationPdfCoverage?.rawTargets ?? verificationTargets.length,
      duplicateRelationshipsRemoved: hasPublicInformationSnapshot
        ? mappedVerificationTargets.length - verificationTargets.length
        : existingCeaDashboard.quality.verificationPdfCoverage?.duplicateRelationshipsRemoved ?? 0,
      coverageRate: verificationPdfQuality?.coverage_rate
        ?? existingCeaDashboard.quality.verificationPdfCoverage?.coverageRate
        ?? verificationDetailsRaw.length / Math.max(1, verificationQuality?.expected_total || 0),
      effectiveCoverageRate: verificationPdfQuality?.effective_coverage_rate
        ?? existingCeaDashboard.quality.verificationPdfCoverage?.effectiveCoverageRate
        ?? 0,
      sourceMissingPdf: verificationPdfQuality?.source_missing_pdf_count
        ?? existingCeaDashboard.quality.verificationPdfCoverage?.sourceMissingPdf
        ?? 0,
      sourceUnavailablePdf: verificationPdfQuality?.source_unavailable_pdf_count
        ?? existingCeaDashboard.quality.verificationPdfCoverage?.sourceUnavailablePdf
        ?? 0,
      unresolved: verificationPdfQuality?.remaining_missing_record_ids?.length
        ?? existingCeaDashboard.quality.verificationPdfCoverage?.unresolved
        ?? 0,
      errors: verificationPdfQuality?.error_count
        ?? existingCeaDashboard.quality.verificationPdfCoverage?.errors
        ?? 0,
      status: verificationPdfQuality
        ? (verificationPdfQuality.publish_ready ? "complete" : "partial")
        : existingCeaDashboard.quality.verificationPdfCoverage?.status || "partial",
      publishReady: verificationPdfQuality
        ? Boolean(verificationPdfQuality.publish_ready)
        : Boolean(existingCeaDashboard.quality.verificationPdfCoverage?.publishReady),
      checkedAt: verificationPdfQuality?.checked_at
        || existingCeaDashboard.quality.verificationPdfCoverage?.checkedAt
        || "",
      issueCount: verificationPdfQuality?.issue_count
        ?? existingCeaDashboard.quality.verificationPdfCoverage?.issueCount
        ?? 0,
    },
  },
  definitions: {
    composite: "综合行情（COMCEA）为交易发布网站提供的综合价格口径；成交量为各配额规格成交量汇总。",
    averagePrice: "成交均价＝统计期成交额÷统计期成交量；无成交量时不计算。",
    turnoverRate: "换手率＝年度综合行情成交量÷用户给定的年度市场总配额。该总配额为分析假设，不等同于官方最终清缴量。",
    normalizedPrice: "每条年度曲线以当年首个有收盘价的交易日为100；2021年基期为开市首日，而非自然日1月1日。",
    coverageList: "重点排放单位列表按数据年度保留原始公开记录；同一企业跨年度重复出现属于正常年度快照。",
    verificationCoverage: verificationPdfQuality?.publish_ready
      ? `核查机构PDF已按公开列表全量解析并通过完整性校验，共${verificationTargets.length.toLocaleString("zh-CN")}条机构—企业核查关系。`
      : "核查机构PDF尚未达到全量发布门槛；关系图暂不形成全国性结论，候选数据不会覆盖线上版本。",
  },
  sources: [
    { label: "全国碳排放权交易信息发布", url: "https://shyx.cneeex.com/qdata.html" },
    { label: "全国碳市场信息网", url: "https://www.cets.org.cn/xxgk/index.jhtml" },
    {
      label: "生态环境部：全国碳市场扩围工作方案",
      url: "https://www.mee.gov.cn/xxgk2018/xxgk/xxgk03/202503/t20250326_1104736.html",
    },
    {
      label: "生态环境部：2025年全国碳市场运行情况",
      url: "https://www.mee.gov.cn/ywgz/ydqhbh/wsqtkz/202601/t20260101_1139528.shtml",
    },
    {
      label: "生态环境部：2025年度应对气候变化报告",
      url: "https://www.mee.gov.cn/ywgz/ydqhbh/wsqtkz/202510/W020251029517340644930.pdf",
    },
  ],
};

const output = path.join(siteDir, "public", "data", "cea-dashboard.json");
const participantOutput = path.join(siteDir, "public", "data", "cea-participants.json");
await fs.writeFile(
  participantOutput,
  hasPublicInformationSnapshot
    ? JSON.stringify({ keyEmitters, verificationInstitutions, fulfillment })
    : await fs.readFile(participantOutput, "utf8"),
  "utf8",
);
await fs.writeFile(output, JSON.stringify(payload), "utf8");
console.log(
  JSON.stringify(
    {
      output,
      bytes: (await fs.stat(output)).size,
      participantOutput,
      participantBytes: (await fs.stat(participantOutput)).size,
      dailyRows: daily.length,
      keyEmitters: keyEmitters.length,
      verificationInstitutions: verificationInstitutions.length,
      fulfillment: fulfillment.length,
      verificationTargets: verificationTargets.length,
    },
    null,
    2,
  ),
);
