import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseImport, validateImport, cleanIncident, cleanProfile, MAX_IMPORT_BYTES } from "../src/model.js";
import { escapeText, toIcs } from "../src/ics.js";
import { incident } from "./helpers.js";

const good = () => ({ format: "incident-clock", version: 1, incident: { title: "T", awareAt: "2026-11-02T00:00:00.000Z", notifications: {} }, profile: { name: "Org", timeZone: "Australia/Perth", privacyAct: true } });
const bad = (data, re) => assert.throws(() => validateImport(data), re);

test("a valid export imports and keeps only known fields", () => {
  const { incident: i, profile } = validateImport(good());
  assert.equal(i.title, "T");
  assert.equal(profile.timeZone, "Australia/Perth");
  assert.deepEqual(Object.keys(i).sort(), Object.keys(cleanIncident({ awareAt: i.awareAt })).sort());
});

test("import rejects wrong types, bad timestamps and unknown fields", () => {
  const mutate = (f) => { const d = good(); f(d); return d; };
  bad(null, /not an Incident Clock/);
  bad([], /not an Incident Clock/);
  bad(mutate((d) => { d.format = "x"; }), /not an Incident Clock/);
  bad(mutate((d) => { d.extra = 1; }), /unknown field/);
  bad(mutate((d) => { d.incident.extra = 1; }), /unknown field/);
  bad(mutate((d) => { d.profile.extra = 1; }), /unknown field/);
  bad(mutate((d) => { d.incident.title = 5; }), /title/);
  bad(mutate((d) => { d.incident.awareAt = "yesterday"; }), /ISO/);
  bad(mutate((d) => { d.incident.awareAt = "2026-13-45T00:00:00Z"; }), /ISO/);
  bad(mutate((d) => { delete d.incident.awareAt; }), /awareness/);
  bad(mutate((d) => { d.incident.personalInfo = "yes"; }), /true or false/);
  bad(mutate((d) => { d.incident.sociImpact = "huge"; }), /sociImpact/);
  bad(mutate((d) => { d.incident.notifications = []; }), /object/);
  bad(mutate((d) => { d.incident.notifications = { nope: { at: "2026-11-02T00:00:00Z" } }; }), /known clock/);
  bad(mutate((d) => { d.incident.notifications = { "ndb-assessment": { at: "soon" } }; }), /valid time/);
  bad(mutate((d) => { d.profile.timeZone = "Mars/Base"; }), /time zone/);
  bad(mutate((d) => { d.profile.apraRegulated = 1; }), /true or false/);
  assert.throws(() => cleanProfile("nope"), /object/);
});

test("import refuses oversize files and invalid JSON", () => {
  assert.throws(() => parseImport(" ".repeat(MAX_IMPORT_BYTES + 1)), /too large/);
  assert.throws(() => parseImport("{nope"), /not valid JSON/);
  assert.deepEqual(parseImport('{"a":1}'), { a: 1 });
});

test("import refuses prototype-pollution keys at any depth", () => {
  for (const k of ["__proto__", "constructor", "prototype"]) {
    assert.throws(() => parseImport(`{"incident":{"${k}":{"x":1}}}`), /forbidden key/);
    assert.throws(() => parseImport(`{"${k}":1}`), /forbidden key/);
  }
  assert.equal({}.x, undefined);
  assert.throws(() => cleanIncident(JSON.parse('{"__proto__":{"x":1},"awareAt":"2026-11-02T00:00:00Z"}')), /unknown field/);
});

test("ICS values cannot inject lines", () => {
  assert.equal(escapeText("a\r\nBEGIN:VEVENT\nb\x00c"), "a\\nBEGIN:VEVENT\\nbc");
  const evil = incident({ id: "x\r\nEND:VCALENDAR", title: "t\r\nATTACH:evil" });
  const clock = { id: "c", dueAt: "2026-11-03T00:00:00Z", deliverable: "d\r\nATTACH:evil", citation: "c\nX:y", regulator: "r", source: "s" };
  const lines = toIcs([clock], evil, 0).split("\r\n");
  assert.ok(!lines.some((l) => /^(ATTACH|X|END:VCALENDAR\S)/.test(l)) && lines.filter((l) => l === "END:VCALENDAR").length === 1);
});

test("no markup sinks, inline styles or handlers, and the CSP and referrer tags are present", async () => {
  const src = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/.test(src));
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.ok(!/\sstyle=|\son[a-z]+=/i.test(html), "inline style or handler in index.html");
  assert.match(html, /Content-Security-Policy[^>]*script-src 'self'; style-src 'self'/);
  assert.match(html, /name="referrer" content="no-referrer"/);
  assert.ok(!/target="_blank"(?![^>]*noreferrer)/.test(html + src));
});

test("h() renders hostile titles as text, not markup", async () => {
  const evil = "<img src=x onerror=alert(1)>";
  const made = [];
  globalThis.document = {
    createElement: (tag) => {
      const el = { tag, kids: [], attrs: {}, style: {}, append(...k) { this.kids.push(...k); }, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener() {} };
      Object.defineProperty(el, "innerHTML", { set() { throw new Error("innerHTML used"); } });
      made.push(el);
      return el;
    },
    createTextNode: (text) => ({ nodeType: 3, text }),
  };
  const { h } = await import("../src/dom.js");
  assert.equal(h("h3", { text: evil }).textContent, evil);
  assert.deepEqual(h("p", {}, evil).kids, [{ nodeType: 3, text: evil }]);
  assert.equal(h("option", { value: evil, text: evil }).attrs.value, evil);
  delete globalThis.document;
});
