// Time arithmetic and formatting. Everything works on ISO instants (UTC)
// and converts to local wall-clock time through Intl for a named zone.

export const HOUR = 3600000;
export const MINUTE = 60000;
export const DAY = 24 * HOUR;

const fmtCache = new Map();
function dtf(timeZone) {
  if (!fmtCache.has(timeZone)) {
    fmtCache.set(timeZone, new Intl.DateTimeFormat("en-AU", {
      timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short",
    }));
  }
  return fmtCache.get(timeZone);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Local wall-clock parts of an instant in a zone. weekday: 0 = Sunday. */
export function localParts(isoOrMs, timeZone) {
  const ms = typeof isoOrMs === "number" ? isoOrMs : Date.parse(isoOrMs);
  const o = {};
  for (const p of dtf(timeZone).formatToParts(new Date(ms))) o[p.type] = p.value;
  return {
    year: +o.year, month: +o.month, day: +o.day,
    hour: +o.hour, minute: +o.minute, second: +o.second,
    weekday: WEEKDAYS.indexOf(o.weekday),
  };
}

/** Offset of the zone from UTC at an instant, in ms (positive = ahead). */
export function offsetAt(ms, timeZone) {
  const p = localParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * Convert local wall time to an instant (ms). Guess with the offset at the
 * start instant, then correct once with the offset at the result. If the
 * local time falls in a spring-forward gap it does not exist, so move
 * forward to the next valid time.
 */
export function localToInstant(parts, timeZone, guessOffset) {
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0);
  const first = wall - guessOffset;
  const second = wall - offsetAt(first, timeZone);
  const lp = localParts(second, timeZone);
  const matches = Date.UTC(lp.year, lp.month - 1, lp.day, lp.hour, lp.minute, lp.second) === wall;
  if (matches) return second;
  // Gap: the wall time was skipped. The clocks jumped forward, so the first
  // guess (old offset) lands on the equivalent time after the jump.
  return Math.max(first, second);
}

/** Same local wall-clock time n calendar days later (n may be negative). */
export function addCalendarDays(iso, n, timeZone) {
  const start = Date.parse(iso);
  const p = localParts(start, timeZone);
  const shifted = new Date(Date.UTC(p.year, p.month - 1, p.day + n));
  const target = {
    year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate(),
    hour: p.hour, minute: p.minute, second: p.second,
  };
  return new Date(localToInstant(target, timeZone, offsetAt(start, timeZone))).toISOString();
}

/**
 * Add n Monday-to-Friday days, keeping the same local time. A weekend start
 * counts from the following Monday (Saturday + 1 business day = Tuesday).
 * ponytail: public holidays are not excluded. Ceiling: a deadline can be
 * one or more days early around a holiday. Upgrade path: a holiday table
 * per state and territory, passed in and skipped in the loop below.
 */
export function addBusinessDays(iso, n, timeZone) {
  let cur = iso;
  // A weekend start is treated as Monday, same local time.
  for (let wd = localParts(cur, timeZone).weekday; wd === 0 || wd === 6; wd = localParts(cur, timeZone).weekday) {
    cur = addCalendarDays(cur, 1, timeZone);
  }
  let left = n;
  while (left > 0) {
    cur = addCalendarDays(cur, 1, timeZone);
    const wd = localParts(cur, timeZone).weekday;
    if (wd !== 0 && wd !== 6) left--;
  }
  return cur;
}

/** Due instant (ISO) for a rule's `due` spec, or null for asap. */
export function computeDue(startIso, due, timeZone) {
  if (!startIso || due.asap) return null;
  if (due.hours != null) return new Date(Date.parse(startIso) + due.hours * HOUR).toISOString();
  if (due.days != null) return addCalendarDays(startIso, due.days, timeZone);
  if (due.businessDays != null) return addBusinessDays(startIso, due.businessDays, timeZone);
  return null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function zoneAbbreviation(ms, timeZone) {
  const parts = new Intl.DateTimeFormat("en-AU", { timeZone, timeZoneName: "short" }).formatToParts(new Date(ms));
  const name = parts.find((x) => x.type === "timeZoneName").value;
  if (/^(AEDT|AEST|ACDT|ACST|AWST)$/.test(name)) return name;
  // Some runtimes return "GMT+11"; map from the offset.
  const off = offsetAt(ms, timeZone) / HOUR;
  const map = {
    "Australia/Melbourne": { 11: "AEDT", 10: "AEST" }, "Australia/Sydney": { 11: "AEDT", 10: "AEST" },
    "Australia/Hobart": { 11: "AEDT", 10: "AEST" }, "Australia/Brisbane": { 10: "AEST" },
    "Australia/Adelaide": { 10.5: "ACDT", 9.5: "ACST" }, "Australia/Darwin": { 9.5: "ACST" },
    "Australia/Perth": { 8: "AWST" },
  };
  return (map[timeZone] && map[timeZone][off]) || name;
}

/** e.g. "Fri 6 Nov 2026, 3:15 pm AEDT" */
export function formatLocal(iso, timeZone) {
  const ms = Date.parse(iso);
  const p = localParts(ms, timeZone);
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  const mm = String(p.minute).padStart(2, "0");
  const ampm = p.hour < 12 ? "am" : "pm";
  return `${WEEKDAYS[p.weekday]} ${p.day} ${MONTHS[p.month - 1]} ${p.year}, ${h12}:${mm} ${ampm} ${zoneAbbreviation(ms, timeZone)}`;
}

function span(ms) {
  const total = Math.floor(Math.abs(ms) / MINUTE);
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  return d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** "2d 4h 13m left" or "Overdue by 3h 2m" */
export function formatCountdown(remainingMs) {
  return remainingMs >= 0 ? `${span(remainingMs)} left` : `Overdue by ${span(remainingMs)}`;
}

/** Elapsed time for asap clocks, e.g. "1d 2h 5m ago". */
export function formatElapsed(ms) {
  return ms < 0 ? `starts in ${span(ms)}` : `${span(ms)} elapsed`;
}

/** running | due-soon | overdue | done. due-soon: under max(25% of window, 2h) left. */
export function statusFor({ startMs, dueMs, nowMs, done }) {
  if (done) return "done";
  if (nowMs > dueMs) return "overdue";
  const threshold = Math.max((dueMs - startMs) * 0.25, 2 * HOUR);
  return dueMs - nowMs < threshold ? "due-soon" : "running";
}

/** Local `datetime-local` value (YYYY-MM-DDTHH:mm) for an instant. */
export function toLocalInput(iso, timeZone) {
  if (!iso) return "";
  const p = localParts(iso, timeZone);
  const z = (n, w = 2) => String(n).padStart(w, "0");
  return `${z(p.year, 4)}-${z(p.month)}-${z(p.day)}T${z(p.hour)}:${z(p.minute)}`;
}

/** Parse a `datetime-local` value as wall time in the zone; returns ISO or "". */
export function fromLocalInput(value, timeZone) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || "");
  if (!m) return "";
  const parts = { year: +m[1], month: +m[2], day: +m[3], hour: +m[4], minute: +m[5], second: 0 };
  const guess = offsetAt(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - 10 * HOUR, timeZone);
  return new Date(localToInstant(parts, timeZone, guess)).toISOString();
}
