import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

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
  assert.match(html, /<title>全国 CCER 市场研究观测站<\/title>/);
  assert.match(html, /全国 CCER 交易、项目开发/);
  assert.match(html, /http:\/\/localhost:3000\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("ships a complete and internally consistent dashboard dataset", async () => {
  const payload = JSON.parse(await readFile(new URL("../public/data/dashboard.json", import.meta.url), "utf8"));
  const map = JSON.parse(await readFile(new URL("../public/china.json", import.meta.url), "utf8"));

  assert.equal(payload.trades.length, payload.quality.tradeRecords);
  assert.equal(payload.projects.length, payload.quality.projectRecords);
  assert.equal(payload.trades.at(-1).date, payload.dataThrough);
  assert.equal(payload.methodologies.length, 9);
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
  assert.equal(actualReduction, 21_775_733);

  for (const project of payload.projects.filter((row) => row.categoryCode === "4")) {
    const expectedAverage = project.reductionYears > 0 ? project.actualReduction / project.reductionYears : 0;
    assert.ok(Math.abs(project.actualAnnualAverage - expectedAverage) < 0.011);
    if (project.expectedAnnual > 0) {
      assert.ok(
        Math.abs(project.expectedAnnualAchievementRate - project.actualAnnualAverage / project.expectedAnnual) < 0.0000011,
      );
    }
    assert.equal(project.reductionYearLabels.length, project.reductionYears);
    assert.equal(project.reductionRegistrationDate, "before-2026-07-11");
    assert.equal(project.reductionRegistrationLabel, "2026-07-11 前");
    assert.ok(project.reductionYearLabels.every((year) => /^\d{4}$/.test(year)));
    assert.match(project.accountingPeriodStart, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(project.accountingPeriodEnd, /^\d{4}-\d{2}-\d{2}$/);
  }

  for (const project of payload.projects.filter((row) => row.categoryCode === "2")) {
    assert.match(project.creditingStart, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(project.creditingEnd, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(project.projectLifetimeYears > 0);
  }

  const workbook = await stat(new URL("../public/downloads/ccer-national-market-data-20260710.xlsx", import.meta.url));
  assert.ok(workbook.size > 100_000);
});
