import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.resolve(here, "..");

const readArg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const allowPartial = process.argv.includes("--allow-partial");
const verificationPath = path.resolve(
  readArg("--verification-json", path.join(siteDir, "public", "data", "cea-verification.json")),
);
const dashboardPath = path.resolve(
  readArg("--dashboard-json", path.join(siteDir, "public", "data", "cea-dashboard.json")),
);
const participantsPath = path.resolve(
  readArg("--participants-json", path.join(siteDir, "public", "data", "cea-participants.json")),
);

const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const writeAtomic = async (file, value) => {
  const temporary = `${file}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value), "utf8");
  await fs.rename(temporary, file);
};

const [verification, dashboard, participants] = await Promise.all([
  readJson(verificationPath),
  readJson(dashboardPath),
  readJson(participantsPath),
]);

if (!verification?.quality?.publish_ready && !allowPartial) {
  throw new Error("Verification PDF candidate did not pass the publish-ready quality gate");
}

const emitterLookup = new Map();
for (const row of participants.keyEmitters || []) {
  emitterLookup.set(`${row.year}|${row.uscc}`, row);
  if (!emitterLookup.has(row.uscc)) emitterLookup.set(row.uscc, row);
}
const institutionLookup = new Map(
  (participants.verificationInstitutions || []).map((row) => [row.id, row]),
);

const verificationTargets = (verification.targets || []).map((row) => {
  const target = emitterLookup.get(`${row.year}|${row.target_uscc}`) || emitterLookup.get(row.target_uscc);
  const institution = institutionLookup.get(row.verification_list_id);
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
const seenRelationships = new Set();
const analyticalVerificationTargets = verificationTargets.filter((row) => {
  const key = [row.pdfUrl, row.year, row.institutionUscc, row.targetUscc].join("|");
  if (seenRelationships.has(key)) return false;
  seenRelationships.add(key);
  return true;
});

const detailIds = new Set((verification.details || []).map((row) => row.verification_list_id));
const sourceMissingIds = new Set(verification.quality?.source_missing_pdf_ids || []);
const sourceUnavailableIds = new Set(verification.quality?.source_unavailable_pdf_ids || []);
participants.verificationInstitutions = (participants.verificationInstitutions || []).map((row) => ({
  ...row,
  detailStatus: detailIds.has(row.id)
    ? "PDF已解析"
    : sourceMissingIds.has(row.id)
      ? "官网未附PDF"
      : sourceUnavailableIds.has(row.id)
        ? "官网链接失效"
        : "待解析",
}));

const checkedAt = verification.quality?.checked_at || verification.generated_at || new Date().toISOString();
dashboard.generatedAt = checkedAt;
dashboard.participants.verificationDetails = verification.details || [];
dashboard.participants.verificationTargets = analyticalVerificationTargets;
dashboard.quality.verificationPdfCoverage = {
  parsed: verification.quality?.matched_list_records ?? verification.details?.length ?? 0,
  expected: verification.quality?.expected_list_records ?? dashboard.participants.verificationRecords,
  targets: analyticalVerificationTargets.length,
  rawTargets: verificationTargets.length,
  duplicateRelationshipsRemoved: verificationTargets.length - analyticalVerificationTargets.length,
  coverageRate: verification.quality?.coverage_rate ?? 0,
  effectiveCoverageRate: verification.quality?.effective_coverage_rate ?? 0,
  sourceMissingPdf: verification.quality?.source_missing_pdf_count ?? 0,
  sourceUnavailablePdf: verification.quality?.source_unavailable_pdf_count ?? 0,
  unresolved: verification.quality?.remaining_missing_record_ids?.length ?? 0,
  errors: verification.quality?.error_count ?? 0,
  status: verification.quality?.publish_ready ? "complete" : "partial",
  publishReady: Boolean(verification.quality?.publish_ready),
  checkedAt,
  issueCount: verification.quality?.issue_count ?? 0,
};
delete dashboard.definitions.verificationSample;
const expected = verification.quality?.expected_list_records ?? 0;
const parsed = verification.quality?.matched_list_records ?? verification.details?.length ?? 0;
const sourceMissing = verification.quality?.source_missing_pdf_count ?? 0;
const sourceUnavailable = verification.quality?.source_unavailable_pdf_count ?? 0;
dashboard.definitions.verificationCoverage = verification.quality?.publish_ready
  ? `公开列表${expected.toLocaleString("zh-CN")}条已逐条核对：解析${parsed.toLocaleString("zh-CN")}条PDF，官网未附PDF ${sourceMissing.toLocaleString("zh-CN")}条、官方链接失效${sourceUnavailable.toLocaleString("zh-CN")}条，未解释缺口和解析错误均为0；PDF共提取${verificationTargets.length.toLocaleString("zh-CN")}行，按同一附件、年度、机构和企业去重后形成${analyticalVerificationTargets.length.toLocaleString("zh-CN")}条分析关系。`
  : `核查机构PDF当前解析${verification.details?.length || 0}份，未达到全量发布门槛；页面保留上一版通过校验的数据。`;

await Promise.all([
  writeAtomic(dashboardPath, dashboard),
  writeAtomic(participantsPath, participants),
]);

console.log(JSON.stringify({
  dashboardPath,
  participantsPath,
  details: verification.details?.length || 0,
  rawTargets: verificationTargets.length,
  targets: analyticalVerificationTargets.length,
  publishReady: Boolean(verification.quality?.publish_ready),
}, null, 2));
