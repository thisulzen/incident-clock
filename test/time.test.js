import test from "node:test";
import assert from "node:assert/strict";
import { addCalendarDays, addBusinessDays, computeDue, formatLocal, formatCountdown, statusFor, fromLocalInput, toLocalInput, localParts, HOUR } from "../src/time.js";
import { computeClocks } from "../src/engine.js";
import { MEL, local, profile, incident } from "./helpers.js";

test("72-hour clock across Melbourne's DST end", () => {
  const start = local("2026-04-03T10:00");
  assert.equal(formatLocal(start, MEL), "Fri 3 Apr 2026, 10:00 am AEDT");
  const due = computeDue(start, { hours: 72 }, MEL);
  assert.equal(Date.parse(due) - Date.parse(start), 72 * HOUR);
  assert.equal(formatLocal(due, MEL), "Mon 6 Apr 2026, 9:00 am AEST");
});

test("30-day calendar clock across DST keeps the wall-clock time", () => {
  const start = local("2026-04-03T10:00");
  const due = addCalendarDays(start, 30, MEL);
  assert.equal(formatLocal(due, MEL), "Sun 3 May 2026, 10:00 am AEST");
  assert.notEqual(Date.parse(due) - Date.parse(start), 30 * 24 * HOUR);
  const p = localParts(due, MEL);
  assert.deepEqual([p.hour, p.minute], [10, 0]);
});

test("calendar days across DST start, and negative days", () => {
  const start = local("2026-09-20T08:30");
  assert.equal(formatLocal(addCalendarDays(start, 30, MEL), MEL), "Tue 20 Oct 2026, 8:30 am AEDT");
  assert.equal(formatLocal(addCalendarDays(start, -1, MEL), MEL), "Sat 19 Sep 2026, 8:30 am AEST");
});

test("a local time in the spring-forward gap moves to the next valid time", () => {
  const start = local("2026-10-03T02:30");
  const due = addCalendarDays(start, 1, MEL);
  assert.equal(formatLocal(due, MEL), "Sun 4 Oct 2026, 3:30 am AEDT");
});

test("an ambiguous local time in the autumn overlap resolves to a real instant", () => {
  const start = local("2026-04-04T02:30");
  const due = addCalendarDays(start, 1, MEL);
  const p = localParts(due, MEL);
  assert.deepEqual([p.day, p.hour, p.minute], [5, 2, 30]);
});

test("zones without DST", () => {
  const start = fromLocalInput("2026-04-03T10:00", "Australia/Brisbane");
  assert.equal(formatLocal(addCalendarDays(start, 30, "Australia/Brisbane"), "Australia/Brisbane"), "Sun 3 May 2026, 10:00 am AEST");
  assert.equal(formatLocal(fromLocalInput("2026-11-05T09:00", "Australia/Perth"), "Australia/Perth"), "Thu 5 Nov 2026, 9:00 am AWST");
  assert.equal(formatLocal(fromLocalInput("2026-11-05T09:00", "Australia/Adelaide"), "Australia/Adelaide"), "Thu 5 Nov 2026, 9:00 am ACDT");
  assert.equal(formatLocal(fromLocalInput("2026-07-05T09:00", "Australia/Darwin"), "Australia/Darwin"), "Sun 5 Jul 2026, 9:00 am ACST");
});

test("business days: Thursday + 10 lands on the Thursday two weeks later", () => {
  const start = local("2026-11-05T09:00");
  assert.equal(localParts(start, MEL).weekday, 4);
  assert.equal(formatLocal(addBusinessDays(start, 10, MEL), MEL), "Thu 19 Nov 2026, 9:00 am AEDT");
});

test("business days: a Saturday start counts from Monday", () => {
  const sat = local("2026-11-07T09:00");
  assert.equal(localParts(sat, MEL).weekday, 6);
  assert.equal(formatLocal(addBusinessDays(sat, 1, MEL), MEL), "Tue 10 Nov 2026, 9:00 am AEDT");
  assert.equal(formatLocal(addBusinessDays(sat, 10, MEL), MEL), "Mon 23 Nov 2026, 9:00 am AEDT");
  const sun = local("2026-11-08T09:00");
  assert.equal(formatLocal(addBusinessDays(sun, 10, MEL), MEL), "Mon 23 Nov 2026, 9:00 am AEDT");
});

test("business days skip weekends and carry a note about holidays", () => {
  const fri = local("2026-11-06T16:00");
  assert.equal(formatLocal(addBusinessDays(fri, 1, MEL), MEL), "Mon 9 Nov 2026, 4:00 pm AEDT");
  const c = computeClocks(profile({ apraRegulated: true }), incident({ apraControlWeaknessAt: fri }), Date.parse(fri))[0];
  assert.match(c.notes, /Public holidays are not excluded/);
});

test("status transitions", () => {
  const startMs = Date.parse("2026-11-02T00:00:00Z");
  const dueMs = startMs + 72 * HOUR;
  const s = (nowMs, done = false) => statusFor({ startMs, dueMs, nowMs, done });
  assert.equal(s(startMs + HOUR), "running");
  assert.equal(s(dueMs - 19 * HOUR), "running");
  assert.equal(s(dueMs - 17 * HOUR), "due-soon");
  assert.equal(s(dueMs - 1), "due-soon");
  assert.equal(s(dueMs + 1), "overdue");
  assert.equal(s(dueMs + 1, true), "done");
  // short windows use the 2 hour floor
  const short = (nowMs) => statusFor({ startMs, dueMs: startMs + 4 * HOUR, nowMs, done: false });
  assert.equal(short(startMs + 1.5 * HOUR), "running");
  assert.equal(short(startMs + 2.5 * HOUR), "due-soon");
});

test("engine statuses and remaining time", () => {
  const p = profile({ sociResponsible: true });
  const i = incident({ sociImpact: "significant", awareAt: "2026-11-02T00:00:00.000Z" });
  const at = (h) => computeClocks(p, i, Date.parse(i.awareAt) + h * HOUR)[0];
  assert.equal(at(1).status, "running");
  assert.equal(at(11).status, "due-soon");
  assert.equal(at(13).status, "overdue");
  assert.equal(at(13).remainingMs, -HOUR);
  const done = computeClocks(p, { ...i, notifications: { "soci-critical": { at: "2026-11-02T05:00:00.000Z", note: "" } } }, Date.parse(i.awareAt) + 13 * HOUR)[0];
  assert.equal(done.status, "done");
});

test("countdown formatting", () => {
  assert.equal(formatCountdown(2 * 86400000 + 4 * HOUR + 13 * 60000 + 59000), "2d 4h 13m left");
  assert.equal(formatCountdown(-(3 * HOUR + 2 * 60000)), "Overdue by 3h 2m");
  assert.equal(formatCountdown(5 * 60000), "5m left");
});

test("datetime-local round trip in each zone", () => {
  for (const tz of ["Australia/Melbourne", "Australia/Perth", "Australia/Adelaide", "Australia/Darwin"]) {
    const iso = fromLocalInput("2026-11-05T09:41", tz);
    assert.equal(toLocalInput(iso, tz), "2026-11-05T09:41");
  }
  assert.equal(fromLocalInput("", MEL), "");
  assert.equal(fromLocalInput("garbage", MEL), "");
});
