import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.resolve(here, "..");

const readArg = (name, fallback = "") => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const hasArg = (name) => process.argv.includes(name);

const resolveSitePath = (value) => (path.isAbsolute(value) ? value : path.resolve(siteDir, value));
const workDir = resolveSitePath(
  readArg("--work-dir", path.join(siteDir, "work", "cets-verification")),
);
const existingPath = resolveSitePath(
  readArg("--existing", path.join(siteDir, "public", "data", "cea-verification.json")),
);
const channel = readArg("--channel", process.env.CETS_BROWSER_CHANNEL || "");
const headless = !hasArg("--headed");
const probe = hasArg("--probe");
const refresh = hasArg("--refresh");
const skipDownload = hasArg("--skip-download") || probe;
const maxRecords = Number(readArg("--max-records", "0")) || Infinity;
const interactive = hasArg("--interactive");
const challengeTimeoutMs = Number(
  readArg("--challenge-timeout-ms", interactive ? "900000" : "90000"),
);
const profileDir = readArg("--profile-dir", "");
const sourceUrl = "https://www.cets.org.cn/xxgk/index.jhtml";

const provinceNames = [
  "北京市", "天津市", "河北省", "山西省", "内蒙古自治区", "辽宁省", "吉林省", "黑龙江省",
  "上海市", "江苏省", "浙江省", "安徽省", "福建省", "江西省", "山东省", "河南省",
  "湖北省", "湖南省", "广东省", "广西壮族自治区", "海南省", "重庆市", "四川省", "贵州省",
  "云南省", "西藏自治区", "陕西省", "甘肃省", "青海省", "宁夏回族自治区", "新疆维吾尔自治区",
  "新疆生产建设兵团", "台湾省", "香港特别行政区", "澳门特别行政区",
];

const directAdmin = new Set(["北京市", "天津市", "上海市", "重庆市"]);

const normalizeSpace = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const parseRegion = (raw) => {
  const value = normalizeSpace(raw);
  const province = provinceNames.find((name) => value.startsWith(name)) || "";
  if (!province) return { province: "", city: "", quality: "unparsed" };
  const remainder = value.slice(province.length);
  if (directAdmin.has(province)) {
    const city = remainder.match(/^(市辖区|县|[^区县]{1,8}[区县])/u)?.[1] || "";
    return { province, city, quality: "parsed" };
  }
  const city = remainder.match(/^(.{1,12}?(?:自治州|地区|盟|市))/u)?.[1] || "";
  return { province, city, quality: city ? "parsed" : "province_only" };
};

const stablePdfUrl = (value) => {
  if (!value) return "";
  try {
    const url = new URL(value, sourceUrl);
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
};

const pdfUrlFromObject = (value, seen = new Set()) => {
  if (value == null) return "";
  if (typeof value === "string") {
    return /(?:certificate\.cets\.org\.cn|\.pdf(?:\?|$))/i.test(value) ? stablePdfUrl(value) : "";
  }
  if (typeof value !== "object" || seen.has(value)) return "";
  seen.add(value);
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const match = pdfUrlFromObject(child, seen);
    if (match) return match;
  }
  return "";
};

const readJsonIfPresent = async (file, fallback) => {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
};

const existing = await readJsonIfPresent(existingPath, { details: [], targets: [] });
const existingPublishReady = Boolean(existing.quality?.publish_ready);
const existingBySourceKey = new Map(
  (existing.details || []).filter((row) => row.source_key).map((row) => [row.source_key, row]),
);
const existingByListId = new Map(
  (existing.details || [])
    .filter((row) => row.verification_list_id)
    .map((row) => [String(row.verification_list_id), row]),
);

const launchOptions = { headless };
if (channel) launchOptions.channel = channel;
let browser;
let context;
if (profileDir) {
  context = await chromium.launchPersistentContext(path.resolve(profileDir), {
    ...launchOptions,
    acceptDownloads: true,
    locale: "zh-CN",
    viewport: { width: 1440, height: 1100 },
  });
} else {
  browser = await chromium.launch(launchOptions);
  context = await browser.newContext({
    acceptDownloads: true,
    locale: "zh-CN",
    viewport: { width: 1440, height: 1100 },
  });
}
const page = await context.newPage();
page.setDefaultTimeout(30_000);

const ensurePublicPage = async () => {
  await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 90_000 });
  if (interactive) {
    console.log("浏览器已打开。若网站显示安全验证，请在窗口中完成；脚本会自动继续。 ");
  }
  try {
    await page.locator('li.infd-li[data-li="核查机构信息公开"]').waitFor({
      state: "visible",
      timeout: challengeTimeoutMs,
    });
  } catch (error) {
    const diagnostics = path.join(workDir, "diagnostics");
    await fs.mkdir(diagnostics, { recursive: true });
    await page.screenshot({ path: path.join(diagnostics, "cets-challenge.png"), fullPage: true }).catch(() => {});
    await fs.writeFile(path.join(diagnostics, "cets-challenge.html"), await page.content(), "utf8").catch(() => {});
    throw new Error(`CETS public-information page did not become available within ${challengeTimeoutMs} ms: ${error.message}`);
  }
  await page.locator('li.infd-li[data-li="核查机构信息公开"]').click();
  await page.locator("table.el-table__body:visible tbody tr").first().waitFor({ state: "visible", timeout: 60_000 });

  const sizeInput = page.locator(".el-pagination:visible .el-select input");
  const currentSize = await sizeInput.inputValue().catch(() => "");
  if (!currentSize.includes("40")) {
    await sizeInput.click();
    await page.getByText("40条/页", { exact: true }).last().click();
    await page.waitForFunction(
      () => document.querySelectorAll("table.el-table__body:visible tbody tr").length >= 20,
      null,
      { timeout: 30_000 },
    );
  }
};

const openPdfFromRow = async (rowLocator) => {
  const popupPromise = page.waitForEvent("popup", { timeout: 30_000 });
  await rowLocator.locator("td:last-child span").click();
  const popup = await popupPromise;
  await popup.waitForLoadState("commit", { timeout: 30_000 }).catch(() => {});
  await popup.waitForTimeout(250);
  const pdfUrl = stablePdfUrl(popup.url());
  await popup.close().catch(() => {});
  return pdfUrl;
};

try {
  await ensurePublicPage();
  const totalText = normalizeSpace(await page.locator(".el-pagination:visible").innerText());
  const total = Number(totalText.match(/共\s*(\d+)\s*条/u)?.[1] || 0);
  const pageSize = 40;
  const pageCount = Math.ceil(total / pageSize);
  const records = [];

  for (let pageNo = 1; pageNo <= pageCount && records.length < maxRecords; pageNo += 1) {
    const table = page.locator("table.el-table__body:visible");
    const rows = table.locator("tbody tr");
    const rowCount = await rows.count();
    const rawState = await page.evaluate(() => {
      const app = globalThis.example1;
      return {
        available: Boolean(app),
        count: app?.checkCount ?? null,
        pageNo: app?.pageNo_3 ?? null,
        pageSize: app?.pageSize_3 ?? null,
        rows: app?.checkOrgLists ? JSON.parse(JSON.stringify(app.checkOrgLists)) : [],
      };
    });

    if (probe) {
      console.log(JSON.stringify({
        total,
        pageCount,
        rowCount,
        rawAvailable: rawState.available,
        rawKeys: Object.keys(rawState.rows[0] || {}),
        firstRawRow: rawState.rows[0] || null,
        firstRawPdfUrl: pdfUrlFromObject(rawState.rows[0]),
      }, null, 2));
      break;
    }

    for (let rowIndex = 0; rowIndex < rowCount && records.length < maxRecords; rowIndex += 1) {
      const row = rows.nth(rowIndex);
      const cells = (await row.locator("td").allTextContents()).map(normalizeSpace);
      if (cells.length < 9) throw new Error(`Unexpected verification row at page ${pageNo}, row ${rowIndex + 1}`);
      const [displayIndex, year, registeredAddress, industry, institutionName, uscc, authority, publishedAt] = cells;
      const sourceKey = [year, registeredAddress, industry, institutionName, uscc, authority, publishedAt].join("|");
      const rawRow = rawState.rows[rowIndex] || null;
      let pdfUrl = pdfUrlFromObject(rawRow) || existingBySourceKey.get(sourceKey)?.pdf_url || "";
      if (!pdfUrl) pdfUrl = await openPdfFromRow(row);
      const region = parseRegion(registeredAddress);
      const globalIndex = records.length + 1;
      records.push({
        verification_list_id: `VER-${String(globalIndex).padStart(4, "0")}`,
        source_key: sourceKey,
        source_page: pageNo,
        source_row_number: Number(displayIndex) || rowIndex + 1,
        year,
        registered_address_raw: registeredAddress,
        province: region.province,
        city: region.city,
        region_parse_quality: region.quality,
        industry,
        institution_name: institutionName,
        unified_social_credit_code: uscc,
        publishing_authority: authority,
        published_at: publishedAt,
        pdf_url: pdfUrl,
        pdf_filename: pdfUrl ? path.basename(new URL(pdfUrl).pathname) : "",
        source_url: sourceUrl,
      });
      if (records.length % 25 === 0 || records.length === total) {
        console.log(`captured ${records.length}/${Math.min(total, maxRecords)}`);
      }
    }

    if (pageNo < pageCount && records.length < maxRecords) {
      const firstRowBefore = normalizeSpace(await rows.first().innerText());
      await page.locator(".el-pagination:visible .btn-next").click();
      await page.waitForFunction(
        (previous) => {
          const first = document.querySelector("table.el-table__body:visible tbody tr");
          return first && (first.textContent || "").replace(/\s+/g, " ").trim() !== previous;
        },
        firstRowBefore,
        { timeout: 30_000 },
      );
    }
  }

  if (!probe) {
    await fs.mkdir(workDir, { recursive: true });
    const listPath = path.join(workDir, "verification-list.json");
    const manifestPath = path.join(workDir, "verification-pdf-manifest.json");
    await fs.writeFile(listPath, JSON.stringify(records, null, 2), "utf8");
    await fs.writeFile(manifestPath, JSON.stringify({
      captured_at: new Date().toISOString(),
      source_url: sourceUrl,
      total,
      records,
    }, null, 2), "utf8");

    const missingLinks = records.filter((row) => !row.pdf_url);
    if (missingLinks.length) {
      throw new Error(`${missingLinks.length} verification rows do not have a PDF URL`);
    }

    let downloaded = 0;
    let reused = 0;
    if (!skipDownload) {
      const pdfDir = path.join(workDir, "pdfs");
      await fs.mkdir(pdfDir, { recursive: true });
      const queue = [...records];
      const worker = async () => {
        while (queue.length) {
          const record = queue.shift();
          const output = path.join(pdfDir, record.pdf_filename);
          const existingDetail = existingByListId.get(record.verification_list_id);
          if (
            !refresh
            && existingDetail
            && existingPublishReady
            && !["needs_ocr", "needs_list_match"].includes(existingDetail.parse_status)
            && existingDetail.pdf_filename === record.pdf_filename
            && stablePdfUrl(existingDetail.pdf_url) === record.pdf_url
          ) {
            reused += 1;
            continue;
          }
          if (!refresh) {
            try {
              const existingPdf = await fs.readFile(output);
              if (existingPdf.length > 1024 && existingPdf.subarray(0, 5).toString() === "%PDF-") {
                reused += 1;
                continue;
              }
            } catch (error) {
              if (error?.code !== "ENOENT") throw error;
            }
          }
          let lastError;
          for (let attempt = 1; attempt <= 3; attempt += 1) {
            try {
              const response = await context.request.get(record.pdf_url, { timeout: 60_000 });
              if (!response.ok()) throw new Error(`HTTP ${response.status()}`);
              const body = await response.body();
              if (body.length < 1024 || body.subarray(0, 5).toString() !== "%PDF-") {
                throw new Error(`Invalid PDF body (${body.length} bytes)`);
              }
              await fs.writeFile(output, body);
              downloaded += 1;
              lastError = null;
              break;
            } catch (error) {
              lastError = error;
              await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
            }
          }
          if (lastError) throw new Error(`Failed to download ${record.pdf_url}: ${lastError.message}`);
          if ((downloaded + reused) % 50 === 0) {
            console.log(`pdfs ${downloaded + reused}/${records.length}`);
          }
        }
      };
      await Promise.all(Array.from({ length: 6 }, () => worker()));
    }

    console.log(JSON.stringify({
      listPath,
      manifestPath,
      total,
      captured: records.length,
      pdfLinks: records.filter((row) => row.pdf_url).length,
      downloaded,
      reused,
    }, null, 2));
  }
} finally {
  if (browser) await browser.close();
  else await context.close();
}
