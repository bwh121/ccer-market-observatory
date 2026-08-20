import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { bulletinPeriodLabel, bulletinPeriodRange, previousCalendarWeek, shiftDate } from "../app/dateUtils.ts";

const HISTORICAL_REGISTRATION_BUCKET = "before-2026-07-11";
const HISTORICAL_REGISTRATION_LABEL = "2026-07-11 前";
const HISTORICAL_METHODOLOGY_BASELINE = 9;
const HISTORICAL_REGISTERED_REDUCTION_BASELINE = 21_775_733;
const HISTORICAL_CEA_DATA_THROUGH_BASELINE = "2026-08-19";
const HISTORICAL_CEA_DAILY_ROWS_BASELINE = 4825;
const HISTORICAL_CEA_KEY_EMITTER_RECORDS_BASELINE = 22358;
const HISTORICAL_CEA_VERIFICATION_RECORDS_BASELINE = 1325;
const HISTORICAL_CEA_FULFILLMENT_RECORDS_BASELINE = 8555;
const REGISTRATION_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertRegistrationBucket(date, label) {
  assert.ok(date === HISTORICAL_REGISTRATION_BUCKET || REGISTRATION_DATE_PATTERN.test(date));
  assert.equal(label, date === HISTORICAL_REGISTRATION_BUCKET ? HISTORICAL_REGISTRATION_LABEL : date);
}

test("derives the latest bulletin reporting periods", () => {
  assert.equal(shiftDate("2026-07-20", -1), "2026-07-19");
  assert.equal(shiftDate("2026-08-01", -1), "2026-07-31");
  assert.equal(shiftDate("2028-03-01", -1), "2028-02-29");
  assert.deepEqual(previousCalendarWeek("2026-07-20"), {
    start: "2026-07-13",
    end: "2026-07-19",
  });
  assert.deepEqual(bulletinPeriodRange("2026-08-09", "yesterday"), {
    start: "2026-08-08",
    end: "2026-08-08",
    empty: false,
  });
  assert.deepEqual(bulletinPeriodRange("2026-08-09", "week"), {
    start: "2026-08-03",
    end: "2026-08-08",
    empty: false,
  });
  assert.deepEqual(bulletinPeriodRange("2026-08-09", "month"), {
    start: "2026-08-03",
    end: "2026-08-08",
    empty: false,
  });
  assert.deepEqual(bulletinPeriodRange("2026-08-10", "week"), {
    start: "2026-08-10",
    end: "2026-08-09",
    empty: true,
  });
  assert.deepEqual(bulletinPeriodRange("2026-09-01", "month"), {
    start: "2026-08-31",
    end: "2026-08-31",
    empty: false,
  });
  assert.equal(bulletinPeriodLabel("2026-08-10", "week"), "本周数据暂未更新");
  assert.equal(bulletinPeriodLabel("2026-08-11", "week"), "统计区间：2026-08-10日至2026-08-10日");
  assert.equal(bulletinPeriodLabel("2026-09-01", "month"), "统计区间：2026-08-31日至2026-08-31日");
  assert.equal(bulletinPeriodLabel("2026-09-02", "month"), "统计区间：2026-08-31日至2026-09-01日");
  assert.equal(bulletinPeriodLabel("2026-08-20", "week"), "统计区间：2026-08-17日至2026-08-19日");
  assert.equal(bulletinPeriodLabel("2026-08-20", "month"), "统计区间：2026-08-17日至2026-08-19日");
});

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the CCER research dashboard shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>全国温室气体自愿减排交易市场（CCER）信息追踪<\/title>/);
  assert.match(html, /全国 CCER 交易、项目开发/);
  assert.match(html, /http:\/\/localhost:3000\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);

  const dashboardSource = await readFile(new URL("../app/DashboardClient.tsx", import.meta.url), "utf8");
  const chartSource = await readFile(new URL("../app/components/EChart.tsx", import.meta.url), "utf8");
  const dataActionsSource = await readFile(new URL("../app/components/DataActions.tsx", import.meta.url), "utf8");
  const dateUtilsSource = await readFile(new URL("../app/dateUtils.ts", import.meta.url), "utf8");
  const stylesSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  const exportAccessSource = await readFile(new URL("../app/components/ExportAccess.tsx", import.meta.url), "utf8");
  const pagesConfigSource = await readFile(new URL("../vite.github-pages.config.ts", import.meta.url), "utf8");
  const pagesWorkflowSource = await readFile(new URL("../.github/workflows/deploy-pages.yml", import.meta.url), "utf8");
  const exportMigration = await readFile(new URL("../supabase/migrations/20260809_export_access.sql", import.meta.url), "utf8");
  const privateExportMigration = await readFile(new URL("../supabase/migrations/20260810_email_auth_private_exports.sql", import.meta.url), "utf8");
  const securityMigration = await readFile(new URL("../supabase/migrations/20260811_harden_export_security.sql", import.meta.url), "utf8");
  const quotaRestrictionMigration = await readFile(new URL("../supabase/migrations/20260811_restrict_quota_rpc.sql", import.meta.url), "utf8");
  const exportFunction = await readFile(new URL("../supabase/functions/export-download/index.ts", import.meta.url), "utf8");
  assert.match(dashboardSource, /建议反馈/);
  assert.match(dashboardSource, /最新动态/);
  assert.match(dashboardSource, /全国温室气体自愿减排交易市场（CCER） 信息追踪<\/h1>/);
  assert.doesNotMatch(dashboardSource, /信息追踪。<\/h1>/);
  assert.match(dashboardSource, /bulletinPeriodRange\(snapshotDate, bulletinPeriod\)/);
  assert.match(dashboardSource, /bulletinPeriodLabel\(snapshotDate, bulletinPeriod\)/);
  assert.match(dateUtilsSource, /本周数据暂未更新/);
  assert.match(dateUtilsSource, /本月数据暂未更新/);
  assert.match(dashboardSource, /登记项目数量/);
  assert.match(dashboardSource, /document\.getElementById\("figure-08"\)/);
  assert.match(dashboardSource, /document\.getElementById\("figure-09"\)/);
  assert.match(dashboardSource, /数据来源与说明/);
  assert.match(dashboardSource, /联系作者/);
  assert.match(dashboardSource, /wechat-author-qr\.png/);
  assert.doesNotMatch(dashboardSource, /from ["']next\/image["']/);
  assert.doesNotMatch(dashboardSource, /institutionSearch|输入机构名称/);
  assert.match(dashboardSource, /id="market-pulse-title">关键指标<\/h2>/);
  assert.match(dashboardSource, /projectDataThrough = shiftDate\(snapshotDate, -1\)/);
  assert.match(dashboardSource, /已发布方法学数量/);
  assert.match(dashboardSource, /各状态项目数量与预计年均减排量/);
  assert.match(dashboardSource, /stack:\s*"project-count"/);
  assert.match(dashboardSource, /stack:\s*"expected-annual"/);
  assert.match(dashboardSource, /trigger:\s*"item"/);
  assert.match(dashboardSource, /transitionDuration:\s*0/);
  assert.match(dashboardSource, /onPlotAreaClick=/);
  assert.doesNotMatch(dashboardSource, /blurScope:\s*"coordinateSystem"/);
  assert.match(dashboardSource, /各方法学领域单个项目减排量登记情况/);
  assert.match(dashboardSource, /type:\s*"boxplot"/);
  assert.match(dashboardSource, /projectRegistrationGranularity/);
  assert.match(dashboardSource, /reductionRegistrationGranularity/);
  assert.match(dashboardSource, /TABLE_01_DETAIL_COLUMNS/);
  assert.match(chartSource, /label: "保存图片"/);
  assert.match(chartSource, /ExportActionMenu/);
  assert.match(chartSource, /exportSections/);
  assert.match(chartSource, /chart\.getZr\(\)\.on\("click", plotHandler\)/);
  assert.match(dataActionsSource, /来源：全国 CCER 市场信息追踪 · 作者：逃跑大魔王/);
  assert.match(dataActionsSource, /下载数据/);
  assert.match(dataActionsSource, /className="export-menu-trigger"/);
  assert.match(dataActionsSource, /createPortal/);
  assert.match(dataActionsSource, /window\.addEventListener\("scroll", close, true\)/);
  assert.match(dashboardSource, /drawer-scroll-region table-mode/);
  assert.match(stylesSource, /\.drawer\s*\{[\s\S]*?width: min\(1360px, 98vw\)/);
  assert.match(stylesSource, /\.status-stacked-chart\s*\{[\s\S]*?height: 470px/);
  assert.match(exportAccessSource, /token\?grant_type=password/);
  assert.match(exportAccessSource, /email: normalized/);
  assert.match(exportAccessSource, /token\?grant_type=password"[\s\S]*?\.\.\.captchaBody\(captchaToken\)/);
  assert.match(exportAccessSource, /action="login"/);
  assert.match(exportAccessSource, /captchaVersion/);
  assert.match(exportAccessSource, /再次确认密码/);
  assert.match(exportAccessSource, /resend\?redirect_to=/);
  assert.match(exportAccessSource, /未收到验证邮件？/);
  assert.match(exportAccessSource, /recover\?redirect_to=/);
  assert.match(exportAccessSource, /method: "PUT", token: session\.access_token/);
  assert.match(exportAccessSource, /Cloudflare Turnstile/);
  assert.match(exportAccessSource, /functions\/v1\/export-download/);
  assert.doesNotMatch(exportAccessSource, /normalizePhone|type: "sms"|短信验证码/);
  assert.match(exportMigration, /timezone\('Asia\/Shanghai', now\(\)\)/);
  assert.match(exportMigration, /usage\.used_count < 2/);
  assert.match(exportMigration, /private\.claim_export_quota/);
  assert.match(exportMigration, /security definer/);
  assert.match(exportMigration, /set search_path = ''/);
  assert.match(privateExportMigration, /account_plans/);
  assert.match(privateExportMigration, /'institutional'/);
  assert.match(privateExportMigration, /get_export_access/);
  assert.match(privateExportMigration, /ccer-private-exports/);
  assert.match(privateExportMigration, /release_failed_export/);
  assert.match(securityMigration, /alter function public\.get_export_access\(\) security invoker/);
  assert.match(securityMigration, /from public, anon/);
  assert.match(quotaRestrictionMigration, /public\.claim_export_quota\(text, text\) from anon/);
  assert.match(exportFunction, /claim_export_quota/);
  assert.match(exportFunction, /storage\/v1\/object\/sign/);
  assert.match(exportFunction, /signed_url/);
  assert.match(exportFunction, /releaseQuota/);
  assert.match(exportFunction, /Export event update failed/);
  assert.match(stylesSource, /\.panel-title-row\s*\{[\s\S]*?position: static/);
  assert.match(stylesSource, /\.chart-export-menu\s*\{[\s\S]*?top: 12px;[\s\S]*?right: 12px/);
  assert.match(stylesSource, /\.export-menu\.chart-export-menu\s*\{[\s\S]*?position: absolute/);
  assert.match(stylesSource, /\.hero-copy\s*\{[\s\S]*?max-width: none/);
  assert.match(stylesSource, /html\s*\{[\s\S]*?overflow-x: clip/);
  assert.match(pagesConfigSource, /envDir: "\.\."/);
  assert.match(pagesWorkflowSource, /vars\.SUPABASE_URL \|\| 'https:\/\/rqujxecmlhoomaacwdlz\.supabase\.co'/);
  assert.doesNotMatch(dashboardSource, /className="download-trigger"/);
  assert.doesNotMatch(dashboardSource, /trade-kpi-groups/);
  const pulseSource = dashboardSource.slice(
    dashboardSource.indexOf("<section className=\"market-pulse\""),
    dashboardSource.indexOf("<section className=\"latest-news\""),
  );
  assert.equal((pulseSource.match(/<KpiCard\b/g) || []).length, 7);
  assert.doesNotMatch(pulseSource, /已登记项目预计计入期总减排量/);
  const table02Source = dashboardSource.slice(
    dashboardSource.indexOf('label="TABLE 02"'),
    dashboardSource.indexOf('label="TABLE 03"'),
  );
  assert.doesNotMatch(table02Source, /DataDownloadMenu/);
  assert.match(dashboardSource, /exportTitle="CCER每日成交量与成交均价"/);
  assert.match(dashboardSource, /title="CCER每日成交量与成交均价"/);
  assert.match(dashboardSource, /CCER与CEA月成交均价及相对溢价率/);
  assert.match(dashboardSource, /carbonPriceComparisonOption/);
  assert.match(dashboardSource, /value >= 0 \? "#b5523b" : "#2f7d68"/);
  assert.match(dashboardSource, /溢价率＝CCER月均价÷CEA月均价－1/);
  assert.match(dashboardSource, /note="月均价按当月总成交额÷总成交量计算；溢价率＝CCER月均价÷CEA月均价－1。"/);
  assert.doesNotMatch(dashboardSource, /正值表示溢价、负值表示折价/);
  assert.doesNotMatch(dashboardSource, /拖动底部时间滑块可同步调整两张图/);
  assert.match(dashboardSource, /buildCompressedTradeTimeline/);
  assert.match(dashboardSource, /targetGapDuration = Math\.min\(31 \* DAY_MS/);
  assert.match(dashboardSource, /formatter: "无成交"/);
  assert.match(dashboardSource, /label="FIGURE 01A"/);
  assert.match(dashboardSource, /label="FIGURE 01A"\s+title="CCER每日成交量与成交均价"\s+\/>/);
  assert.doesNotMatch(dashboardSource, /label="FIGURE 01"/);
  assert.match(dashboardSource, /buildCalendarAxisSeries/);
  assert.match(dashboardSource, /endOfUtcMonth\(rangeEndMonth\)/);
  assert.match(dashboardSource, /text: `\$\{Number\(api\.value\(1\)\)\}月`/);
  assert.match(dashboardSource, /text: `\$\{Number\(api\.value\(2\)\)\}年`/);
  assert.match(dashboardSource, /filterMode: "none"/);
  assert.match(dashboardSource, /maxInterval: 31 \* DAY_MS/);
  assert.match(dashboardSource, /xAxisIndex: \[0, 1\]/);
  assert.match(dashboardSource, /onZeroAxisIndex: 0/);
  assert.match(dashboardSource, /value < 0 \? "" : exactNumber\(value, 0\)/);
  assert.equal((dashboardSource.match(/group="trade-time-range"/g) || []).length, 2);
  assert.match(chartSource, /echarts\.connect\(group\)/);
  assert.match(stylesSource, /\.trade-chart-grid\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(stylesSource, /\.trade-chart-grid \.trend-chart\s*\{[\s\S]*?aspect-ratio: 5 \/ 1/);
  assert.match(dashboardSource, /id: "count-total-label"/);
  assert.match(dashboardSource, /id: "annual-total-label"/);
  assert.match(dashboardSource, /className="two-column-grid trade-chart-grid"/);
  assert.match(dashboardSource, /selectedMode: false/);
  assert.match(dashboardSource, /legend: \{[\s\S]*?orient: "vertical",[\s\S]*?right: 4,[\s\S]*?selectedMode: false/);
  assert.ok((dashboardSource.match(/position: "top"/g) || []).length >= 3);
  assert.equal(
    (dashboardSource.match(/<EChart\b/g) || []).length,
    (dashboardSource.match(/exportSections=/g) || []).length,
    "every dashboard chart must expose downloadable chart and drilldown data",
  );
  assert.doesNotMatch(dashboardSource, /METHOD_COLORS|methodolog(?:y|ies).{0,30}(?:===|==)\s*9/i);
  assert.match(dashboardSource, /useState\("18"\)/);
  assert.match(dashboardSource, /className="table-total-row"/);
  assert.match(dashboardSource, /\(row\.share \* 100\)\.toFixed\(2\)/);
});

test("ships a complete and internally consistent dashboard dataset", async () => {
  const payload = JSON.parse(await readFile(new URL("../public/data/dashboard.json", import.meta.url), "utf8"));
  const map = JSON.parse(await readFile(new URL("../public/china.json", import.meta.url), "utf8"));
  const projectRegistrationRegistry = JSON.parse(
    await readFile(new URL("../data/project-registration-dates.json", import.meta.url), "utf8"),
  );
  const reductionRegistrationRegistry = JSON.parse(
    await readFile(new URL("../data/reduction-registration-dates.json", import.meta.url), "utf8"),
  );

  assert.equal(payload.trades.length, payload.quality.tradeRecords);
  assert.equal(payload.projects.length, payload.quality.projectRecords);
  assert.equal(payload.trades.at(-1).date, payload.dataThrough);
  assert.match(payload.carbonPriceComparison.ceaDataThrough, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(payload.carbonPriceComparison.ccerDataThrough, payload.dataThrough);
  assert.ok(payload.carbonPriceComparison.months.length > 0);
  assert.equal(payload.carbonPriceComparison.months.at(-1).month, payload.dataThrough.slice(0, 7));
  assert.deepEqual(payload.sources.map((source) => source.label), ["全国 CCER 市场每日行情", "项目与减排量信息公开"]);
  const firstCcerTradeMonth = payload.trades.find((row) => row.volume > 0).date.slice(0, 7);
  assert.equal(payload.carbonPriceComparison.months[0].month, firstCcerTradeMonth);
  for (const row of payload.carbonPriceComparison.months) {
    const ccerTrades = payload.trades.filter((trade) => trade.date.startsWith(row.month));
    const ccerVolume = ccerTrades.reduce((total, trade) => total + trade.volume, 0);
    const ccerTurnover = ccerTrades.reduce((total, trade) => total + trade.turnover, 0);
    assert.ok(Math.abs(row.ccerVolume - ccerVolume) < 0.011);
    assert.ok(Math.abs(row.ccerTurnover - ccerTurnover) < 0.011);
    if (row.ccerVolume > 0) {
      assert.ok(Math.abs(row.ccerPrice - row.ccerTurnover / row.ccerVolume) < 0.00011);
    } else {
      assert.equal(row.ccerPrice, null);
    }
    if (row.ceaVolume > 0) {
      assert.ok(Math.abs(row.ceaPrice - row.ceaTurnover / row.ceaVolume) < 0.00011);
    } else {
      assert.equal(row.ceaPrice, null);
    }
    if (row.ccerPrice != null && row.ceaPrice != null) {
      assert.ok(Math.abs(row.priceSpread - (row.ccerPrice - row.ceaPrice)) < 0.00011);
      assert.ok(Math.abs(row.premiumRate - (row.ccerPrice / row.ceaPrice - 1)) < 0.0000011);
    }
  }
  const expectedMethodologies = [...new Set(payload.projects.map((row) => row.methodology))].sort((a, b) =>
    a.localeCompare(b, "zh-CN"),
  );
  assert.deepEqual(payload.methodologies, expectedMethodologies);
  assert.ok(
    [...new Set(payload.projects.map((row) => row.categoryCode))]
      .every((categoryCode) => payload.statusOrder.some((status) => status.code === categoryCode)),
    "every discovered project status must be represented in statusOrder",
  );
  assert.ok(
    payload.methodologies.length >= HISTORICAL_METHODOLOGY_BASELINE,
    `methodology count regressed below the historical baseline: ${payload.methodologies.length}`,
  );
  assert.equal(map.features.length, 35);
  assert.ok(payload.projects.every((row) => row.projectName && row.categoryCode && row.detailUrl));
  assert.ok(
    payload.projects
      .filter((row) => row.categoryCode === "2" || row.categoryCode === "4")
      .every((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.registrationDate)),
  );

  const actualReduction = payload.projects
    .filter((row) => row.categoryCode === "4")
    .reduce((total, row) => total + row.actualReduction, 0);
  assert.ok(
    actualReduction >= HISTORICAL_REGISTERED_REDUCTION_BASELINE,
    `registered reduction total regressed below the historical baseline: ${actualReduction}`,
  );
  assert.equal(
    Object.values(projectRegistrationRegistry).filter((date) => date === HISTORICAL_REGISTRATION_BUCKET).length,
    40,
  );
  assert.equal(
    Object.values(reductionRegistrationRegistry).filter((date) => date === HISTORICAL_REGISTRATION_BUCKET).length,
    21,
  );

  for (const project of payload.projects.filter((row) => row.categoryCode === "4")) {
    const expectedAverage = project.reductionYears > 0 ? project.actualReduction / project.reductionYears : 0;
    assert.ok(Math.abs(project.actualAnnualAverage - expectedAverage) < 0.011);
    if (project.expectedAnnual > 0) {
      assert.ok(
        Math.abs(project.expectedAnnualAchievementRate - project.actualAnnualAverage / project.expectedAnnual) < 0.0000011,
      );
    }
    assert.equal(project.reductionYearLabels.length, project.reductionYears);
    assert.ok(project.commencementDate.match(/^\d{4}-\d{2}-\d{2}$/));
    assert.ok(project.accountingPeriodSequence);
    assert.ok(project.reductionEntries.length >= project.reductionYears);
    assert.ok(
      Math.abs(project.reductionEntries.reduce((total, entry) => total + entry.amount, 0) - project.actualReduction) < 0.01,
    );
    assert.ok(project.reductionEntries.every((entry) => entry.accountingPeriodSequence === project.accountingPeriodSequence));
    assert.ok(project.reductionEntries.every((entry) => entry.reductionRegistrationDate === project.reductionRegistrationDate));
    assert.deepEqual(
      [...new Set(project.reductionEntries.map((entry) => entry.registrationYear))].sort(),
      project.reductionYearLabels,
    );
    assert.equal(project.reductionRegistrationDate, reductionRegistrationRegistry[project.snapshotKey]);
    assertRegistrationBucket(project.reductionRegistrationDate, project.reductionRegistrationLabel);
    assert.ok(project.reductionYearLabels.every((year) => /^\d{4}$/.test(year)));
    assert.match(project.accountingPeriodStart, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(project.accountingPeriodEnd, /^\d{4}-\d{2}-\d{2}$/);
  }

  for (const project of payload.projects.filter((row) => row.categoryCode === "2")) {
    assert.match(project.creditingStart, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(project.creditingEnd, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(project.projectLifetimeYears > 0);
    assert.equal(project.projectFirstSeenDate, projectRegistrationRegistry[project.snapshotKey]);
    assertRegistrationBucket(project.projectFirstSeenDate, project.projectFirstSeenLabel);
  }

  const workbook = await stat(new URL("../public/downloads/ccer-national-market-data-latest.xlsx", import.meta.url));
  assert.ok(workbook.size > 100_000);

  const authorQr = await stat(new URL("../public/wechat-author-qr.png", import.meta.url));
  assert.ok(authorQr.size > 50_000);
});

test("adds a separate CEA view without replacing the CCER dashboard", async () => {
  const marketShellSource = await readFile(new URL("../app/MarketShell.tsx", import.meta.url), "utf8");
  const ceaSource = await readFile(new URL("../app/CeaDashboardClient.tsx", import.meta.url), "utf8");
  const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const pagesEntrySource = await readFile(new URL("../github-pages/main.tsx", import.meta.url), "utf8");

  assert.match(marketShellSource, /自愿碳市场/);
  assert.match(marketShellSource, /强制碳市场/);
  assert.match(marketShellSource, /market === "cea" \? <CeaDashboardClient \/> : <DashboardClient \/>/);
  assert.match(pageSource, /<MarketShell \/>/);
  assert.match(pagesEntrySource, /<MarketShell \/>/);
  assert.match(ceaSource, /覆盖范围/);
  assert.match(ceaSource, /市场交易/);
  assert.match(ceaSource, /市场参与方/);
  assert.match(ceaSource, /priceView === "kline"/);
  assert.match(ceaSource, /无交易日期保持空白/);
  assert.match(ceaSource, /label="覆盖行业数量" value="4"/);
  assert.match(ceaSource, /年度市场换手率/);
  assert.match(ceaSource, /CEA—CCER月度价格比较/);
  assert.match(ceaSource, /省内机构与省外机构结构/);
  assert.match(ceaSource, /服务的重点排放单位/);
  assert.match(ceaSource, /tradeCalendarText/);
  assert.doesNotMatch(ceaSource, /1,227个预期交易日/);
  assert.doesNotMatch(ceaSource, /PUBLIC LIST SNAPSHOT/);
  assert.doesNotMatch(ceaSource, /label="FIGURE 02"/);
  assert.doesNotMatch(ceaSource, /label="FIGURE 14"/);
  assert.match(ceaSource, /relationshipBadge/);
});

test("ships a reconciled CEA dashboard snapshot and complete participant lists", async () => {
  const payload = JSON.parse(await readFile(new URL("../public/data/cea-dashboard.json", import.meta.url), "utf8"));
  const participants = JSON.parse(await readFile(new URL("../public/data/cea-participants.json", import.meta.url), "utf8"));

  assert.match(payload.tradeDataThrough, REGISTRATION_DATE_PATTERN);
  assert.match(payload.priceComparisonDataThrough, REGISTRATION_DATE_PATTERN);
  assert.ok(payload.tradeDataThrough >= HISTORICAL_CEA_DATA_THROUGH_BASELINE);
  assert.ok(payload.priceComparisonDataThrough >= HISTORICAL_CEA_DATA_THROUGH_BASELINE);
  assert.ok(payload.daily.length >= HISTORICAL_CEA_DAILY_ROWS_BASELINE);
  assert.equal(payload.marketSummary.latestDate, payload.tradeDataThrough);
  assert.ok(payload.daily.every((row) => [row.open, row.high, row.low, row.close].every((value) => value == null || value > 0)));
  assert.ok(payload.participants.keyEmitterRecords >= HISTORICAL_CEA_KEY_EMITTER_RECORDS_BASELINE);
  assert.ok(payload.participants.verificationRecords >= HISTORICAL_CEA_VERIFICATION_RECORDS_BASELINE);
  assert.ok(payload.participants.fulfillmentRecords >= HISTORICAL_CEA_FULFILLMENT_RECORDS_BASELINE);
  assert.equal(participants.keyEmitters.length, payload.participants.keyEmitterRecords);
  assert.equal(participants.verificationInstitutions.length, payload.participants.verificationRecords);
  assert.equal(participants.fulfillment.length, payload.participants.fulfillmentRecords);
  assert.equal(payload.quality.verificationPdfCoverage.parsed, payload.participants.verificationDetails.length);
  assert.equal(payload.quality.verificationPdfCoverage.targets, payload.participants.verificationTargets.length);
  assert.ok(payload.quality.verificationPdfCoverage.parsed <= payload.quality.verificationPdfCoverage.expected);
  if (!payload.quality.verificationPdfCoverage.publishReady) {
    assert.equal(payload.participants.verificationDetails.length, 0);
    assert.equal(payload.participants.verificationTargets.length, 0);
  }

  assert.equal(payload.officialCoverage.managedEntities, 3378);
  assert.equal(
    payload.officialCoverage.sectorCounts.reduce((total, row) => total + row.count, 0),
    payload.officialCoverage.managedEntities,
  );
  assert.deepEqual(payload.officialCoverage.gases, ["二氧化碳（CO₂）", "四氟化碳（CF₄）", "六氟化二碳（C₂F₆）"]);
  assert.deepEqual(payload.quotaBasis.map((row) => row.allowance), [8e9, 4.5e9, 4.5e9, 5e9, 5e9, 7e9]);
  assert.ok(payload.turnoverByYear.every((row) => Math.abs(row.turnoverRate - row.volume / row.allowance) < 1e-8));

  for (const row of payload.priceComparison.filter((item) => item.ceaPrice && item.ccerPrice)) {
    assert.ok(Math.abs(row.spreadRatio - (row.ccerPrice / row.ceaPrice - 1)) < 1e-7);
  }

  const latestCoverage = payload.coverage.yearStats.find((row) => row.year === "2026");
  assert.ok(latestCoverage.records >= 3910);
  assert.ok(latestCoverage.uniqueEntities > 3800);
  assert.ok(payload.coverage.provinceIndustryYear.length > 0);
});

test("guards the automated CETS PDF refresh with a fail-closed publish gate", async () => {
  const workflow = await readFile(new URL("../.github/workflows/update-cets-verification.yml", import.meta.url), "utf8");
  const parser = await readFile(new URL("../data-pipeline/parse_verification_pdfs.py", import.meta.url), "utf8");
  const crawler = await readFile(new URL("../data-pipeline/update-cets-verification.mjs", import.meta.url), "utf8");
  const sync = await readFile(new URL("../data-pipeline/sync-verification-dashboard.mjs", import.meta.url), "utf8");
  const publisher = await readFile(new URL("../data-pipeline/github_actions_cets.py", import.meta.url), "utf8");

  assert.match(workflow, /cron: "30 12 \* \* 1-5"/);
  assert.match(workflow, /runs-on: \[self-hosted, Windows, X64, cets-collector\]/);
  assert.match(workflow, /CETS_PROFILE_DIR/);
  assert.match(workflow, /CETS_WORK_DIR/);
  assert.match(workflow, /--cdp-endpoint http:\/\/127\.0\.0\.1:9223/);
  assert.match(workflow, /--allow-source-missing-pdf/);
  assert.match(workflow, /--min-coverage 1\.0/);
  assert.equal(
    workflow.match(/if: \$\{\{ failure\(\) \|\| cancelled\(\) \}\}/g)?.length,
    2,
    "diagnostics and alerts must also run after a cancelled refresh",
  );
  assert.doesNotMatch(workflow, /^\s+uses:/m);
  assert.match(workflow, /git clone --depth 1 --filter=blob:none --no-checkout/);
  assert.match(workflow, /Summarize diagnostics/);
  assert.match(workflow, /github_actions_cets\.py publish/);
  assert.match(workflow, /CETS_SOURCE_DIR/);
  assert.match(publisher, /"git\/blobs"/);
  assert.match(publisher, /"git\/trees"/);
  assert.match(publisher, /"git\/refs\/heads\/main"/);
  assert.match(publisher, /actions\/workflows\/deploy-pages\.yml\/dispatches/);
  assert.match(parser, /effective_coverage >= args\.min_coverage/);
  assert.match(parser, /not remaining_missing_ids/);
  assert.match(parser, /error_count == 0/);
  assert.match(parser, /missing_list_ids/);
  assert.match(parser, /duplicate_detail_ids/);
  assert.match(crawler, /verification-pdf-manifest\.json/);
  assert.match(crawler, /CETS public-information page did not become available/);
  assert.match(sync, /did not pass the publish-ready quality gate/);
});
