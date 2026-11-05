// computeClocks: pure function from (profile, incident, now) to clock objects.

import { RULES } from "./rules.js";
import { computeDue, statusFor } from "./time.js";

const toMs = (now) => (now instanceof Date ? now.getTime() : typeof now === "number" ? now : Date.parse(now));

export function computeClocks(profile, incident, now) {
  const nowMs = toMs(now);
  const applicable = RULES.filter((r) => r.appliesWhen(profile, incident) && r.start(incident));
  const ids = new Set(applicable.map((r) => r.id));
  const log = incident.notifications || {};

  const clocks = applicable.map((r) => {
    const startAt = r.start(incident);
    const dueAt = computeDue(startAt, r.due, profile.timeZone);
    const notification = log[r.id] || null;
    let status;
    let remainingMs = null;
    if (dueAt) {
      remainingMs = Date.parse(dueAt) - nowMs;
      status = statusFor({ startMs: Date.parse(startAt), dueMs: Date.parse(dueAt), nowMs, done: !!notification });
    } else {
      status = notification ? "done" : "running";
    }
    const notes = r.due.businessDays
      ? [r.notes, "Public holidays are not excluded; a holiday in the window will make the real deadline later than shown."].filter(Boolean).join(" ")
      : r.notes || "";
    return {
      id: r.id, regime: r.regime, title: r.title, regulator: r.regulator, deliverable: r.deliverable,
      citation: r.citation, source: r.source, notes, why: r.why(profile, incident),
      startAt, dueAt, status, remainingMs,
      coveredBy: r.id === "cps230-incident" && ids.has("cps234-incident") ? "cps234-incident" : null,
      notification,
    };
  });

  const rank = (c) => (c.status === "done" ? 2 : c.dueAt ? 1 : 0);
  return clocks.sort((a, b) => rank(a) - rank(b) || (a.dueAt ? Date.parse(a.dueAt) : 0) - (b.dueAt ? Date.parse(b.dueAt) : 0)
    || Date.parse(a.startAt) - Date.parse(b.startAt));
}
