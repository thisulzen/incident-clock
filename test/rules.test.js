import test from "node:test";
import assert from "node:assert/strict";
import { RULES, RULES_REVIEWED, TIME_ZONES } from "../src/rules.js";
import { computeClocks } from "../src/engine.js";
import { profile, incident } from "./helpers.js";

const NOW = Date.parse("2026-11-03T00:00:00Z");
const ids = (p, i) => computeClocks(p, i, NOW).map((c) => c.id);
const AWARE = "2026-11-02T00:00:00.000Z";

test("rules reviewed date", () => assert.equal(RULES_REVIEWED, "2026-11-05"));
test("twelve rules, unique ids", () => {
  assert.equal(RULES.length, 12);
  assert.equal(new Set(RULES.map((r) => r.id)).size, 12);
});
test("seven time zones offered", () => assert.equal(TIME_ZONES.length, 7));

test("every rule is complete", () => {
  for (const r of RULES) {
    for (const k of ["id", "title", "regulator", "citation", "regime", "deliverable"]) {
      assert.ok(r[k] && typeof r[k] === "string", `${r.id}.${k}`);
    }
    assert.ok(r.source.startsWith("https://"), `${r.id} source`);
    assert.equal(typeof r.appliesWhen, "function");
    assert.equal(typeof r.why, "function");
    assert.equal(typeof r.start, "function");
    const d = r.due;
    const ok = d.asap === true
      || (Number.isInteger(d.hours) && d.hours > 0)
      || (Number.isInteger(d.days) && d.days > 0)
      || (Number.isInteger(d.businessDays) && d.businessDays > 0);
    assert.ok(ok, `${r.id} due`);
  }
});

test("rule durations and citations are as specified", () => {
  const by = Object.fromEntries(RULES.map((r) => [r.id, r]));
  assert.deepEqual(by["ndb-assessment"].due, { days: 30 });
  assert.deepEqual(by["ndb-notify"].due, { asap: true });
  assert.deepEqual(by["soci-critical"].due, { hours: 12 });
  assert.deepEqual(by["soci-critical-written"].due, { hours: 84 });
  assert.deepEqual(by["soci-relevant"].due, { hours: 72 });
  assert.deepEqual(by["soci-relevant-written"].due, { hours: 48 });
  assert.deepEqual(by["csa-ransomware"].due, { hours: 72 });
  assert.deepEqual(by["cps234-incident"].due, { hours: 72 });
  assert.deepEqual(by["cps234-weakness"].due, { businessDays: 10 });
  assert.deepEqual(by["cps230-incident"].due, { hours: 72 });
  assert.deepEqual(by["cps230-disruption"].due, { hours: 24 });
  assert.deepEqual(by["ovic-vpdss"].due, { days: 30 });
  assert.equal(by["soci-critical"].citation, "s30BC, Security of Critical Infrastructure Act 2018 (Cth)");
  assert.equal(by["soci-relevant"].citation, "s30BD, Security of Critical Infrastructure Act 2018 (Cth)");
});

test("privacy rules", () => {
  assert.deepEqual(ids(profile({ privacyAct: true }), incident({ personalInfo: true })), ["ndb-assessment"]);
  assert.deepEqual(ids(profile({ privacyAct: false }), incident({ personalInfo: true })), []);
  assert.deepEqual(ids(profile({ privacyAct: true }), incident({ personalInfo: false })), []);
  const both = ids(profile({ privacyAct: true }), incident({ personalInfo: true, ndbBelievedAt: "2026-11-02T06:00:00.000Z" }));
  assert.deepEqual(both.sort(), ["ndb-assessment", "ndb-notify"]);
  assert.deepEqual(ids(profile(), incident({ personalInfo: true, ndbBelievedAt: "2026-11-02T06:00:00.000Z" })), []);
});

test("ndb-assessment starts at suspicion, else awareness", () => {
  const p = profile({ privacyAct: true });
  const a = computeClocks(p, incident({ personalInfo: true }), NOW)[0];
  assert.equal(a.startAt, AWARE);
  const b = computeClocks(p, incident({ personalInfo: true, ndbSuspectedAt: "2026-11-02T03:00:00.000Z" }), NOW)[0];
  assert.equal(b.startAt, "2026-11-02T03:00:00.000Z");
});

test("SOCI rules", () => {
  const p = profile({ sociResponsible: true });
  assert.deepEqual(ids(p, incident({ sociImpact: "significant" })), ["soci-critical"]);
  assert.deepEqual(ids(p, incident({ sociImpact: "relevant" })), ["soci-relevant"]);
  assert.deepEqual(ids(p, incident({ sociImpact: "none" })), []);
  assert.deepEqual(ids(profile(), incident({ sociImpact: "significant" })), []);
  const oral = "2026-11-02T05:00:00.000Z";
  assert.deepEqual(ids(p, incident({ sociImpact: "significant", asdOralReportAt: oral })).sort(), ["soci-critical", "soci-critical-written"]);
  assert.deepEqual(ids(p, incident({ sociImpact: "relevant", asdOralReportAt: oral })).sort(), ["soci-relevant", "soci-relevant-written"]);
  assert.deepEqual(ids(p, incident({ sociImpact: "none", asdOralReportAt: oral })), []);
});

test("SOCI due times", () => {
  const H = 3600000;
  const oral = "2026-11-02T05:00:00.000Z";
  const p = profile({ sociResponsible: true });
  const crit = computeClocks(p, incident({ sociImpact: "significant", asdOralReportAt: oral }), NOW);
  assert.equal(Date.parse(crit.find((c) => c.id === "soci-critical").dueAt), Date.parse(AWARE) + 12 * H);
  assert.equal(Date.parse(crit.find((c) => c.id === "soci-critical-written").dueAt), Date.parse(oral) + 84 * H);
  const rel = computeClocks(p, incident({ sociImpact: "relevant", asdOralReportAt: oral }), NOW);
  assert.equal(Date.parse(rel.find((c) => c.id === "soci-relevant").dueAt), Date.parse(AWARE) + 72 * H);
  assert.equal(Date.parse(rel.find((c) => c.id === "soci-relevant-written").dueAt), Date.parse(oral) + 48 * H);
});

test("ransomware rule", () => {
  const paid = "2026-11-02T10:00:00.000Z";
  const i = incident({ ransomPaidAt: paid });
  assert.deepEqual(ids(profile({ turnoverOver3m: true }), i), ["csa-ransomware"]);
  assert.deepEqual(ids(profile({ sociResponsible: true }), i), ["csa-ransomware"]);
  assert.deepEqual(ids(profile({ turnoverOver3m: true, governmentBody: true }), i), []);
  assert.deepEqual(ids(profile({ sociResponsible: true, governmentBody: true }), i), []);
  assert.deepEqual(ids(profile(), i), []);
  assert.deepEqual(ids(profile({ turnoverOver3m: true }), incident()), []);
  const c = computeClocks(profile({ turnoverOver3m: true }), i, NOW)[0];
  assert.equal(c.startAt, paid);
  assert.equal(Date.parse(c.dueAt), Date.parse(paid) + 72 * 3600000);
});

test("APRA rules", () => {
  const p = profile({ apraRegulated: true });
  assert.deepEqual(ids(p, incident({ apraMaterialInfosec: true })), ["cps234-incident"]);
  assert.deepEqual(ids(profile(), incident({ apraMaterialInfosec: true })), []);
  assert.deepEqual(ids(p, incident({ apraControlWeaknessAt: AWARE })), ["cps234-weakness"]);
  assert.deepEqual(ids(profile(), incident({ apraControlWeaknessAt: AWARE })), []);
  assert.deepEqual(ids(p, incident({ apraMaterialOpRisk: true })), ["cps230-incident"]);
  assert.deepEqual(ids(profile(), incident({ apraMaterialOpRisk: true })), []);
  assert.deepEqual(ids(p, incident({ criticalOpOutsideToleranceAt: AWARE })), ["cps230-disruption"]);
  assert.deepEqual(ids(profile(), incident({ criticalOpOutsideToleranceAt: AWARE })), []);
});

test("VPDSS rule", () => {
  assert.deepEqual(ids(profile({ victorianPublicSector: true }), incident({ vpsInfosecIncident: true })), ["ovic-vpdss"]);
  assert.deepEqual(ids(profile(), incident({ vpsInfosecIncident: true })), []);
  assert.deepEqual(ids(profile({ victorianPublicSector: true }), incident()), []);
});

test("cps230-incident is covered by cps234-incident when both apply", () => {
  const p = profile({ apraRegulated: true });
  const both = computeClocks(p, incident({ apraMaterialInfosec: true, apraMaterialOpRisk: true }), NOW);
  assert.equal(both.find((c) => c.id === "cps230-incident").coveredBy, "cps234-incident");
  assert.equal(both.find((c) => c.id === "cps234-incident").coveredBy, null);
  const alone = computeClocks(p, incident({ apraMaterialOpRisk: true }), NOW);
  assert.equal(alone[0].coveredBy, null);
});

test("clocks are sorted: asap first, then soonest, done last", () => {
  const p = profile({ privacyAct: true, sociResponsible: true });
  const i = incident({
    personalInfo: true, sociImpact: "significant", ndbBelievedAt: "2026-11-02T06:00:00.000Z",
    notifications: { "soci-critical": { at: NOW, note: "" } },
  });
  const out = computeClocks(p, i, NOW).map((c) => c.id);
  assert.deepEqual(out, ["ndb-notify", "ndb-assessment", "soci-critical"]);
});

test("engine does not read the real clock", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../src/engine.js", import.meta.url), "utf8");
  assert.ok(!/Date\.now|new Date\(\)/.test(src));
});
