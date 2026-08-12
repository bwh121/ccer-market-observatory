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
    industry: row.industry || institution?.industry || "",
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

const detailIds = new Set((verification.details || []).map((row) => row.verification_list_id));
participants.verificationInstitutions = (participants.verificationInstitutions || []).map((row) => ({
  ...row,
  detailStatus: detailIds.has(row.id) ? "PDF已解析" : "待解析",
}));

const checkedAt = verification.quality?.checked_at || verification.generated_at || new Date().toISOString();
dashboard.generatedAt = checkedAt;
dashboard.participants.verificationDetails = verification.details || [];
dashboard.participants.verificationTargets = verificationTargets;
dashboard.quality.verificationPdfCoverage = {
  parsed: verification.quality?.matched_list_records ?? verification.details?.length ?? 0,
  expected: verification.quality?.expected_list_records ?? dashboard.participants.verificationRecords,
  targets: verificationTargets.length,
  coverageRate: verification.quality?.coverage_rate ?? 0,
  status: verification.quality?.publish_ready ? "complete" : "partial",
  publishReady: Boolean(verification.quality?.publish_ready),
  checkedAt,
  issueCount: verification.quality?.issue_count ?? 0,
};
delete dashboard.definitions.verificationSample;
dashboard.definitions.verificationCoverage = verification.quality?.publish_ready
  ? `核查机构PDF已按公开列表全量解析并通过完整性校验，共${verificationTargets.length.toLocaleString("zh-CN")}条机构—企业核查关系。`
  : `核查机构PDF当前解析${verification.details?.length || 0}份，未达到全量发布门槛；页面保留上一版通过校验的数据。`;

await Promise.all([
  writeAtomic(dashboardPath, dashboard),
  writeAtomic(participantsPath, participants),
]);

console.log(JSON.stringify({
  dashboardPath,
  participantsPath,
  details: verification.details?.length || 0,
  targets: verificationTargets.length,
  publishReady: Boolean(verification.quality?.publish_ready),
}, null, 2));
