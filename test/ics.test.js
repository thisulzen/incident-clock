import test from "node:test";
import assert from "node:assert/strict";
import { toIcs, escapeText, fold } from "../src/ics.js";
import { computeClocks } from "../src/engine.js";
import { profile, incident } from "./helpers.js";

const NOW = Date.parse("2026-11-03T00:00:00Z");
const p = profile({ privacyAct: true, sociResponsible: true });
const i = incident({ personalInfo: true, sociImpact: "significant", ndbBelievedAt: "2026-11-02T06:00:00.000Z" });
const clocks = computeClocks(p, i, NOW);

test("ICS structure", () => {
  const ics = toIcs(clocks, i, NOW);
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Incident Clock//EN\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.ok(!/[^\r]\n/.test(ics), "bare LF found");
  const timed = clocks.filter((c) => c.dueAt).length;
  assert.equal(timed, 2);
  assert.equal(ics.split("BEGIN:VEVENT").length - 1, timed);
  assert.equal(ics.split("BEGIN:VALARM").length - 1, timed);
  assert.match(ics, /DTSTART:20261102T120000Z/);
  assert.match(ics, /DTSTAMP:20261103T000000Z/);
  assert.match(ics, /TRIGGER:-PT2H/);
  assert.match(ics, /UID:inc-1-soci-critical@incident-clock/);
});

test("ICS UIDs are stable", () => {
  assert.equal(toIcs(clocks, i, NOW), toIcs(clocks, i, NOW));
  assert.equal(toIcs(clocks, i, NOW).match(/UID:.*/g).length, 2);
});

test("ICS escapes commas, semicolons, backslashes and newlines", () => {
  assert.equal(escapeText("a,b;c\\d\ne"), "a\\,b\\;c\\\\d\\ne");
  const ics = toIcs(clocks, i, NOW).replace(/\r\n /g, "");
  assert.match(ics, /s30BC\\, Security of Critical/);
  assert.match(ics, /SUMMARY:Due: Report the critical cyber security incident to ASD's ACSC/);
});

test("ICS folds long lines at 75 octets without splitting characters", () => {
  const ics = toIcs(clocks, i, NOW);
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  const folded = fold("X:" + "é".repeat(100));
  for (const line of folded.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75);
  assert.equal(folded.replace(/\r\n /g, ""), "X:" + "é".repeat(100));
});
