// UI wiring: state, form binding, the clock board, timeline, export and print.

import { RULES_REVIEWED, TIME_ZONES } from "./rules.js";
import { computeClocks } from "./engine.js";
import { formatLocal, formatCountdown, formatElapsed, fromLocalInput, toLocalInput, HOUR, MINUTE } from "./time.js";
import { toIcs } from "./ics.js";
import { DEFAULT_PROFILE, PROFILE_BOOLS, blankIncident, cleanIncident, cleanProfile, parseImport, validateImport } from "./model.js";
import { h } from "./dom.js";
import * as store from "./store.js";

const $ = (id) => document.getElementById(id);

const nowMs = () => Date.now();
const minuteFloor = (ms) => Math.floor(ms / MINUTE) * MINUTE;
function sampleData() {
  const aware = minuteFloor(nowMs()) - 30 * HOUR;
  const iso = (ms) => new Date(ms).toISOString();
  return {
    profile: { ...DEFAULT_PROFILE, name: "Fernhill Utilities Pty Ltd", timeZone: "Australia/Melbourne", privacyAct: true, turnoverOver3m: true, sociResponsible: true },
    incident: {
      ...blankIncident(minuteFloor(nowMs())), title: "Ransomware on billing systems", awareAt: iso(aware), personalInfo: true,
      ndbSuspectedAt: iso(aware), sociImpact: "significant", asdOralReportAt: iso(aware + 10 * HOUR), ransomPaidAt: iso(aware + 20 * HOUR),
    },
  };
}

function loadProfile() {
  try { return cleanProfile(store.read("ic.profile", {})); } catch { return { ...DEFAULT_PROFILE }; }
}

const state = {
  profile: loadProfile(),
  incidents: [],
  activeId: store.read("ic.active", null),
  openDone: new Set(),
  drafts: {},
};
for (const raw of [].concat(store.read("ic.incidents", []))) {
  try { state.incidents.push(cleanIncident(raw, raw.id)); } catch { /* drop a corrupt entry; raw may be null, which also lands here */ }
}
if (!state.incidents.length) state.incidents.push(blankIncident(minuteFloor(nowMs())));
if (!state.incidents.some((i) => i.id === state.activeId)) state.activeId = state.incidents[0].id;

const active = () => state.incidents.find((i) => i.id === state.activeId);
const tz = () => state.profile.timeZone;
const saveProfile = () => store.write("ic.profile", state.profile);
const saveIncidents = () => {
  store.write("ic.incidents", state.incidents);
  store.write("ic.active", state.activeId);
};

function say(text, kind = "info") {
  const m = $("message");
  m.textContent = text;
  m.className = "message " + kind;
  m.hidden = !text;
}

/* ---------- profile ---------- */

const PROFILE_IDS = {
  privacyAct: "p-privacy", turnoverOver3m: "p-turnover", sociResponsible: "p-soci",
  governmentBody: "p-gov", apraRegulated: "p-apra", victorianPublicSector: "p-vps",
};

function fillProfile() {
  $("p-name").value = state.profile.name || "";
  const sel = $("p-tz");
  if (!sel.options.length) for (const z of TIME_ZONES) sel.append(h("option", { value: z, text: z.replace("Australia/", "") + (z === "Australia/Melbourne" ? " (default)" : "") }));
  sel.value = tz();
  for (const [k, id] of Object.entries(PROFILE_IDS)) $(id).checked = !!state.profile[k];
  const on = PROFILE_BOOLS.filter((k) => state.profile[k]).length;
  $("profile-summary").textContent = `${state.profile.name || "Unnamed organisation"}, ${tz().replace("Australia/", "")}, ${on} setting${on === 1 ? "" : "s"} ticked`;
}

function bindProfile() {
  $("p-name").addEventListener("input", (e) => { state.profile.name = e.target.value; saveProfile(); fillProfile(); renderAll(); });
  $("p-tz").addEventListener("change", (e) => { state.profile.timeZone = e.target.value; saveProfile(); fillProfile(); fillForm(); renderAll(); });
  for (const [k, id] of Object.entries(PROFILE_IDS)) {
    $(id).addEventListener("change", (e) => { state.profile[k] = e.target.checked; saveProfile(); fillProfile(); updateVisibility(); renderAll(); });
  }
}

/* ---------- incident form ---------- */

const TIME_FIELDS = {
  awareAt: "f-aware", ndbSuspectedAt: "f-suspected", ndbBelievedAt: "f-believed", asdOralReportAt: "f-oral",
  ransomPaidAt: "f-ransom", apraControlWeaknessAt: "f-weakness", criticalOpOutsideToleranceAt: "f-tolerance",
};
const BOOL_FIELDS = {
  personalInfo: "f-personal", apraMaterialInfosec: "f-infosec", apraMaterialOpRisk: "f-oprisk", vpsInfosecIncident: "f-vpsinc",
};

function updateVisibility() {
  const inc = active();
  $("g-personal").hidden = !inc.personalInfo;
  $("g-oral").hidden = inc.sociImpact === "none";
  $("g-apra").hidden = !state.profile.apraRegulated;
  $("g-vps").hidden = !state.profile.victorianPublicSector;
}

function fillForm() {
  const inc = active();
  $("f-title").value = inc.title || "";
  for (const [k, id] of Object.entries(TIME_FIELDS)) $(id).value = toLocalInput(inc[k], tz());
  for (const [k, id] of Object.entries(BOOL_FIELDS)) $(id).checked = !!inc[k];
  $("f-soci").value = inc.sociImpact || "none";
  document.querySelectorAll(".tz-label").forEach((e) => { e.textContent = tz(); });
  updateVisibility();
}

function fillSelector() {
  const sel = $("incident-select");
  sel.replaceChildren(...state.incidents.map((i) => h("option", { value: i.id, text: i.title || "Untitled incident" })));
  sel.value = state.activeId;
}

function bindForm() {
  $("f-title").addEventListener("input", (e) => { active().title = e.target.value; saveIncidents(); fillSelector(); renderAll(); });
  for (const [k, id] of Object.entries(TIME_FIELDS)) {
    $(id).addEventListener("change", (e) => {
      const inc = active();
      const prev = inc[k];
      inc[k] = fromLocalInput(e.target.value, tz());
      if (k === "awareAt" && inc.ndbSuspectedAt && inc.ndbSuspectedAt === prev) {
        inc.ndbSuspectedAt = inc.awareAt;
        $("f-suspected").value = toLocalInput(inc.awareAt, tz());
      }
      saveIncidents();
      renderAll();
    });
  }
  for (const [k, id] of Object.entries(BOOL_FIELDS)) {
    $(id).addEventListener("change", (e) => {
      const inc = active();
      inc[k] = e.target.checked;
      if (k === "personalInfo" && inc.personalInfo && !inc.ndbSuspectedAt && inc.awareAt) {
        inc.ndbSuspectedAt = inc.awareAt;
        $("f-suspected").value = toLocalInput(inc.awareAt, tz());
      }
      saveIncidents();
      updateVisibility();
      renderAll();
    });
  }
  $("f-soci").addEventListener("change", (e) => { active().sociImpact = e.target.value; saveIncidents(); updateVisibility(); renderAll(); });
}

/* ---------- incident management ---------- */

function setActive(id) {
  state.activeId = id;
  state.openDone.clear();
  state.drafts = {};
  $("delete-confirm").hidden = true;
  saveIncidents();
  fillSelector();
  fillForm();
  renderAll();
}

function bindIncidentButtons() {
  $("incident-select").addEventListener("change", (e) => setActive(e.target.value));
  $("btn-new").addEventListener("click", () => {
    const inc = blankIncident(minuteFloor(nowMs()));
    state.incidents.push(inc);
    say("");
    setActive(inc.id);
    $("f-title").focus();
  });
  $("btn-sample").addEventListener("click", () => {
    const s = sampleData();
    state.profile = s.profile;
    saveProfile();
    state.incidents.push(s.incident);
    fillProfile();
    say("Loaded the sample incident and the Fernhill Utilities profile.");
    setActive(s.incident.id);
  });
  $("btn-delete").addEventListener("click", () => { $("delete-confirm").hidden = false; $("btn-delete-no").focus(); });
  $("btn-delete-no").addEventListener("click", () => { $("delete-confirm").hidden = true; });
  $("btn-delete-yes").addEventListener("click", () => {
    state.incidents = state.incidents.filter((i) => i.id !== state.activeId);
    if (!state.incidents.length) state.incidents.push(blankIncident(minuteFloor(nowMs())));
    say("Incident deleted.");
    setActive(state.incidents[0].id);
  });
}

/* ---------- clock board ---------- */

let lastSignature = "";
const signature = (clocks) => clocks.map((c) => c.id + c.status).join("|");
const titleOf = (id, clocks) => (clocks.find((c) => c.id === id) || {}).title || id;

function statusLabel(c) {
  return { done: "Done", overdue: "Overdue", "due-soon": "Due soon", running: c.dueAt ? "Running" : "Open" }[c.status];
}

function countdownText(c, now) {
  if (c.dueAt) return formatCountdown(Date.parse(c.dueAt) - now);
  return "As soon as practicable: " + formatElapsed(now - Date.parse(c.startAt));
}

function doneText(c) {
  const at = Date.parse(c.notification.at);
  const when = formatLocal(new Date(at).toISOString(), tz());
  if (!c.dueAt) return `Notified ${when}, ${formatElapsed(at - Date.parse(c.startAt)).replace(" elapsed", "")} after the clock started.`;
  const diff = Date.parse(c.dueAt) - at;
  const span = formatCountdown(Math.abs(diff)).replace(" left", "");
  return diff >= 0 ? `Notified ${span} before the deadline (${when}).` : `Notified ${span} after the deadline (${when}).`;
}

function clockCard(c, all, now) {
  const inc = active();
  const card = h("article", { class: `clock ${c.status}`, "data-id": c.id });
  const chip = h("span", { class: `chip ${c.status}`, "data-role": "chip", text: statusLabel(c) });
  card.append(h("div", { class: "clock-top" },
    h("span", { class: "regulator", text: `${c.regulator} · ${c.regime}` }), chip));
  card.append(h("h3", { class: "deliverable", text: c.deliverable }));

  card.append(h("p", { class: "due" }, h("span", { class: "label", text: "Due " }), c.dueAt ? formatLocal(c.dueAt, tz()) : "As soon as practicable"));
  card.append(h("p", { class: "started muted small", text: `Clock started ${formatLocal(c.startAt, tz())}` }));

  if (c.notification) card.append(h("p", { class: "countdown done-text", text: doneText(c) }));
  else card.append(h("p", { class: "countdown", "data-role": "countdown", text: countdownText(c, now) }));

  card.append(h("p", { class: "why" }, h("strong", { text: "Why this clock started: " }), c.why));
  if (c.coveredBy) {
    card.append(h("p", { class: "covered", text: `Covered by the "${titleOf(c.coveredBy, all)}" notification (CPS 234). If it is the same event, APRA does not need a second notification.` }));
  }
  card.append(h("p", { class: "citation" },
    h("a", { href: c.source, target: "_blank", rel: "noopener noreferrer" }, c.citation)));
  if (c.notes) card.append(h("p", { class: "notes muted small", text: c.notes }));

  if (c.notification) {
    if (c.notification.note) card.append(h("p", { class: "note-text small" }, h("strong", { text: "Note: " }), c.notification.note));
    card.append(h("button", { type: "button", class: "btn small-btn", onclick: () => {
      delete inc.notifications[c.id];
      saveIncidents();
      renderAll();
    } }, "Undo"));
  } else if (state.openDone.has(c.id)) {
    const input = h("input", { type: "text", placeholder: "Optional note, for example a reference number", value: state.drafts[c.id] || "", "aria-label": "Note for this notification" });
    input.addEventListener("input", () => { state.drafts[c.id] = input.value; });
    const commit = () => {
      inc.notifications = inc.notifications || {};
      inc.notifications[c.id] = { at: new Date().toISOString(), note: input.value.trim() };
      state.openDone.delete(c.id);
      delete state.drafts[c.id];
      saveIncidents();
      renderAll();
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") commit(); });
    card.append(h("div", { class: "done-form" }, input,
      h("button", { type: "button", class: "btn primary", onclick: commit }, "Record notification"),
      h("button", { type: "button", class: "btn", onclick: () => { state.openDone.delete(c.id); renderAll(); } }, "Cancel")));
  } else {
    card.append(h("button", { type: "button", class: "btn", onclick: () => { state.openDone.add(c.id); renderAll(); setTimeout(() => {
      const el = document.querySelector(`.clock[data-id="${c.id}"] .done-form input`);
      if (el) el.focus();
    }, 0); } }, "Mark as done"));
  }
  return card;
}

function currentClocks(now) {
  const inc = active();
  if (!inc.awareAt) return [];
  return computeClocks(state.profile, inc, now);
}

function renderBoard(now) {
  const board = $("board");
  const inc = active();
  const clocks = currentClocks(now);
  lastSignature = signature(clocks);
  if (!inc.awareAt) {
    board.replaceChildren(h("div", { class: "empty" }, h("h3", { text: "Enter when the organisation became aware" }),
      h("p", { text: "Every deadline is measured from a start time. Add the awareness time above and the clocks will appear." })));
    return clocks;
  }
  if (!clocks.length) {
    board.replaceChildren(h("div", { class: "empty" },
      h("h3", { text: "No reporting clocks apply yet" }),
      h("p", { text: "Clocks start when the profile and the incident together meet a rule's trigger. For example, the Privacy Act clock needs an APP entity and personal information; the SOCI clocks need a responsible entity and an impact level; the ransomware clock needs a payment time and a business over $3 million turnover or a SOCI responsible entity." }),
      h("p", { class: "muted", text: "Tick what applies in the organisation profile and the incident form, or load the sample incident to see a full board." })));
    return clocks;
  }
  board.replaceChildren(...clocks.map((c) => clockCard(c, clocks, now)));
  return clocks;
}

/* ---------- timeline ---------- */

function renderTimeline(clocks, now) {
  const box = $("timeline");
  const inc = active();
  const timed = clocks.filter((c) => c.dueAt);
  if (!inc.awareAt || !timed.length) {
    box.replaceChildren(h("p", { class: "muted", text: "The timeline appears once there is at least one deadline with a due time." }));
    return;
  }
  const startMs = Math.min(Date.parse(inc.awareAt), now);
  const dues = timed.map((c) => Date.parse(c.dueAt));
  const endMs = Math.max(...dues, now);
  const span = Math.max(endMs - startMs, HOUR);
  const pad = span * 0.04;
  const lo = startMs - pad;
  const total = span + pad * 2;
  const pct = (ms) => (((ms - lo) / total) * 100).toFixed(2) + "%";
  const sorted = [...timed].sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));

  const track = h("div", { class: "track" });
  track.append(h("div", { class: "track-line" }));
  track.append(h("div", { class: "marker start", style: `left:${pct(Date.parse(inc.awareAt))}` },
    h("span", { class: "label", text: "Aware" })));
  for (const c of sorted) {
    track.append(h("div", { class: `marker ${c.status}`, style: `left:${pct(Date.parse(c.dueAt))}`, title: `${c.deliverable}: ${formatLocal(c.dueAt, tz())}` },
      h("span", { class: "label", text: `${c.regulator}${c.id.includes("written") ? " (written)" : ""}` })));
  }
  track.append(h("div", { class: "now-line", style: `left:${pct(now)}` }, h("span", { text: "Now" })));
  box.replaceChildren(track,
    h("p", { class: "muted small", text: `From ${formatLocal(inc.awareAt, tz())} to ${formatLocal(new Date(endMs).toISOString(), tz())}. Hover a marker for its deliverable.` }));
  layoutLabels(track);
}

/** Put each label on the first row below the line where it clears the labels already there. */
function layoutLabels(track) {
  const rows = [];
  const tw = track.clientWidth;
  const markers = [...track.querySelectorAll(".marker")].sort((a, b) => a.offsetLeft - b.offsetLeft);
  for (const m of markers) {
    const el = m.querySelector(".label");
    const w = el.offsetWidth;
    const cx = m.offsetLeft + 8;
    const l = Math.max(-16, Math.min(cx - w / 2, tw + 16 - w));
    let r = rows.findIndex((row) => row.every(([a, b]) => l >= b + 8 || l + w <= a - 8));
    if (r < 0) { rows.push([]); r = rows.length - 1; }
    rows[r].push([l, l + w]);
    el.style.left = `${l - m.offsetLeft}px`;
    el.style.top = `${24 + r * 20}px`;
  }
  track.style.height = `${84 + Math.max(rows.length, 1) * 20}px`;
}

/* ---------- tick ---------- */

function renderAll(now = nowMs()) {
  renderTimeline(renderBoard(now), now);
}

function tick() {
  const now = nowMs();
  const clocks = currentClocks(now);
  if (signature(clocks) !== lastSignature) {
    renderAll(now);
    return;
  }
  for (const c of clocks) {
    if (c.notification) continue;
    const card = document.querySelector(`.clock[data-id="${c.id}"]`);
    if (!card) continue;
    const cd = card.querySelector('[data-role="countdown"]');
    if (cd) cd.textContent = countdownText(c, now);
  }
  renderTimeline(clocks, now);
}

/* ---------- export, import, print ---------- */

function download(name, type, text) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h("a", { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const slug = (s) => (s || "incident").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "incident";

function bindExport() {
  $("btn-json").addEventListener("click", () => {
    const inc = active();
    const payload = { format: "incident-clock", version: 1, exportedAt: new Date().toISOString(), rulesReviewed: RULES_REVIEWED, profile: state.profile, incident: inc };
    download(`incident-clock-${slug(inc.title)}.json`, "application/json", JSON.stringify(payload, null, 2));
    say("Downloaded the incident as JSON.");
  });
  $("file-import").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { incident, profile } = validateImport(parseImport(await file.text()));
      if (profile) { state.profile = profile; saveProfile(); fillProfile(); }
      state.incidents.push(incident);
      setActive(incident.id);
      say(`Imported "${incident.title || "Untitled incident"}"${profile ? " and its organisation profile" : ""}.`);
    } catch (err) {
      say(`Import failed. ${err.message}`, "error");
    }
  });
  $("import-label").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("file-import").click(); } });
  $("btn-ics").addEventListener("click", () => {
    const now = nowMs();
    const clocks = currentClocks(now);
    if (!clocks.some((c) => c.dueAt)) { say("There are no timed deadlines to add to a calendar yet.", "error"); return; }
    const inc = active();
    download(`incident-clock-${slug(inc.title)}.ics`, "text/calendar", toIcs(clocks, inc, now));
    say("Downloaded a calendar file with one event per timed deadline.");
  });
  $("incident-form").addEventListener("submit", (e) => e.preventDefault());
  $("btn-print").addEventListener("click", () => window.print());
  window.addEventListener("beforeprint", buildReport);
}

const yn = (v) => (v ? "Yes" : "No");

function buildReport() {
  const now = nowMs();
  const inc = active();
  const p = state.profile;
  const clocks = currentClocks(now);
  const when = (iso) => (iso ? formatLocal(iso, tz()) : "Not set");
  const dl = (rows) => h("dl", { class: "kv" }, rows.flatMap(([k, v]) => [h("dt", { text: k }), h("dd", { text: v })]));
  const log = clocks.filter((c) => c.notification);
  $("print-report").replaceChildren(
    h("h1", { text: "Incident Clock report" }),
    h("p", { class: "small", text: `Prepared ${formatLocal(new Date(now).toISOString(), tz())}. Rules reviewed 5 November 2026. General information, not legal advice.` }),
    h("h2", { text: "Incident" }),
    dl([
      ["Title", inc.title || "Untitled incident"], ["Became aware", when(inc.awareAt)],
      ["Personal information involved", yn(inc.personalInfo)],
      ["Suspected eligible data breach", when(inc.ndbSuspectedAt)], ["Believed eligible data breach", when(inc.ndbBelievedAt)],
      ["SOCI impact", inc.sociImpact], ["Oral report to ASD", when(inc.asdOralReportAt)], ["Ransomware payment", when(inc.ransomPaidAt)],
      ["Material information security incident (CPS 234)", yn(inc.apraMaterialInfosec)], ["Control weakness identified", when(inc.apraControlWeaknessAt)],
      ["Material operational risk incident (CPS 230)", yn(inc.apraMaterialOpRisk)], ["Critical operation outside tolerance", when(inc.criticalOpOutsideToleranceAt)],
      ["Victorian public sector security incident", yn(inc.vpsInfosecIncident)],
    ]),
    h("h2", { text: "Organisation profile" }),
    dl([
      ["Name", p.name || "Not set"], ["Time zone", p.timeZone], ["Privacy Act (APP entity)", yn(p.privacyAct)],
      ["Turnover over $3 million", yn(p.turnoverOver3m)], ["SOCI responsible entity", yn(p.sociResponsible)],
      ["Commonwealth or state body", yn(p.governmentBody)], ["APRA-regulated", yn(p.apraRegulated)], ["Victorian public sector (VPDSS)", yn(p.victorianPublicSector)],
    ]),
    h("h2", { text: "Deadlines" }),
    clocks.length ? h("table", {},
      h("thead", {}, h("tr", {}, ["Deliverable", "Regulator", "Started", "Due", "Status", "Citation"].map((t) => h("th", { text: t })))),
      h("tbody", {}, clocks.map((c) => h("tr", {},
        h("td", { text: c.deliverable }), h("td", { text: c.regulator }), h("td", { text: formatLocal(c.startAt, tz()) }),
        h("td", { text: c.dueAt ? formatLocal(c.dueAt, tz()) : "As soon as practicable" }),
        h("td", { text: statusLabel(c) + (c.dueAt && !c.notification ? ` (${formatCountdown(Date.parse(c.dueAt) - now)})` : "") }),
        h("td", {}, c.citation, h("br"), h("span", { class: "url", text: c.source })))))) : h("p", { text: "No reporting clocks apply." }),
    h("h2", { text: "Notification log" }),
    log.length ? h("ul", {}, log.map((c) => h("li", { text: `${formatLocal(c.notification.at, tz())}: ${c.deliverable}. ${doneText(c)}${c.notification.note ? " Note: " + c.notification.note : ""}` })))
      : h("p", { text: "No notifications recorded." }),
  );
}

/* ---------- start ---------- */

function init() {
  fillProfile();
  fillSelector();
  fillForm();
  bindProfile();
  bindForm();
  bindIncidentButtons();
  bindExport();
  renderAll();
  setInterval(tick, 1000);
}

init();
