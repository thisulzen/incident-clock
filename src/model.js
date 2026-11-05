// The saved data shapes: defaults, and the validators used for imported files and stored data.

import { RULES, TIME_ZONES } from "./rules.js";

export const MAX_IMPORT_BYTES = 1024 * 1024;
const BAD_KEYS = ["__proto__", "constructor", "prototype"];

export const PROFILE_BOOLS = ["privacyAct", "turnoverOver3m", "sociResponsible", "governmentBody", "apraRegulated", "victorianPublicSector"];
const BOOLS = ["personalInfo", "apraMaterialInfosec", "apraMaterialOpRisk", "vpsInfosecIncident"];
const TIMES = ["awareAt", "ndbSuspectedAt", "ndbBelievedAt", "asdOralReportAt", "ransomPaidAt", "apraControlWeaknessAt", "criticalOpOutsideToleranceAt"];
const SOCI = ["none", "relevant", "significant"];
const RULE_IDS = RULES.map((r) => r.id);

export const DEFAULT_PROFILE = {
  name: "", timeZone: "Australia/Melbourne", ...Object.fromEntries(PROFILE_BOOLS.map((k) => [k, false])),
};

export function blankIncident(nowMs) {
  return {
    id: "inc-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), title: "",
    awareAt: new Date(nowMs).toISOString(), sociImpact: "none", notifications: {},
    ...Object.fromEntries(TIMES.slice(1).map((k) => [k, ""])), ...Object.fromEntries(BOOLS.map((k) => [k, false])),
  };
}

const fail = (m) => { throw new Error(m); };
const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const isIso = (v) => typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v) && !Number.isNaN(Date.parse(v));

function onlyKnown(obj, known, what) {
  for (const k of Object.keys(obj)) if (!known.includes(k)) fail(`The ${what} has an unknown field "${k}".`);
}

/** Parse an imported file's text: size limit, then JSON with prototype-pollution keys refused anywhere. */
export function parseImport(text) {
  if (text.length > MAX_IMPORT_BYTES) fail("The file is too large to be an Incident Clock export.");
  try {
    return JSON.parse(text, (k, v) => (BAD_KEYS.includes(k) ? fail(`The file contains the forbidden key "${k}".`) : v));
  } catch (err) {
    throw err.message.startsWith("The file") ? err : new Error("The file is not valid JSON.");
  }
}

export function cleanProfile(p) {
  if (!isObject(p)) fail("The profile must be an object.");
  onlyKnown(p, ["name", "timeZone", ...PROFILE_BOOLS], "profile");
  if (p.name != null && typeof p.name !== "string") fail("The profile name must be text.");
  if (p.timeZone != null && !TIME_ZONES.includes(p.timeZone)) fail("The profile time zone is not one this tool supports.");
  const out = { ...DEFAULT_PROFILE, name: (p.name || "").slice(0, 200), timeZone: p.timeZone || DEFAULT_PROFILE.timeZone };
  for (const k of PROFILE_BOOLS) {
    if (p[k] != null && typeof p[k] !== "boolean") fail(`Profile "${k}" must be true or false.`);
    out[k] = !!p[k];
  }
  return out;
}

/** Validate an incident and copy only known fields. `id` is kept for stored incidents; imports get a fresh one. */
export function cleanIncident(src, id) {
  if (!isObject(src)) fail("The file has no incident.");
  onlyKnown(src, ["id", "title", "sociImpact", "notifications", ...TIMES, ...BOOLS], "incident");
  const inc = blankIncident(0);
  if (id) inc.id = id.slice(0, 80);
  if (src.title != null && typeof src.title !== "string") fail("The incident title must be text.");
  inc.title = (src.title || "").slice(0, 200);
  for (const k of TIMES) {
    if (src[k] == null || src[k] === "") { inc[k] = ""; continue; }
    if (!isIso(src[k])) fail(`"${k}" is not a valid ISO date and time.`);
    inc[k] = new Date(src[k]).toISOString();
  }
  if (!inc.awareAt) fail("The incident has no awareness time.");
  for (const k of BOOLS) {
    if (src[k] != null && typeof src[k] !== "boolean") fail(`"${k}" must be true or false.`);
    inc[k] = !!src[k];
  }
  if (src.sociImpact != null && !SOCI.includes(src.sociImpact)) fail('"sociImpact" must be none, relevant or significant.');
  inc.sociImpact = src.sociImpact || "none";
  if (src.notifications != null && !isObject(src.notifications)) fail('"notifications" must be an object.');
  for (const [rid, n] of Object.entries(src.notifications || {})) {
    if (!RULE_IDS.includes(rid)) fail(`Notification "${rid}" is not a known clock.`);
    if (!isObject(n) || !isIso(n.at)) fail(`Notification "${rid}" has no valid time.`);
    if (n.note != null && typeof n.note !== "string") fail(`Notification "${rid}" note must be text.`);
    inc.notifications[rid] = { at: new Date(n.at).toISOString(), note: (n.note || "").slice(0, 500) };
  }
  return inc;
}

export function validateImport(data) {
  if (!isObject(data) || data.format !== "incident-clock") fail("The file is not an Incident Clock export.");
  onlyKnown(data, ["format", "version", "exportedAt", "rulesReviewed", "profile", "incident"], "file");
  return { incident: cleanIncident(data.incident), profile: data.profile == null ? null : cleanProfile(data.profile) };
}
