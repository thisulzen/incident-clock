// RFC 5545 calendar export: one VEVENT per clock that has a due time.

const enc = new TextEncoder();

export function escapeText(s) {
  return String(s ?? "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Fold a content line at 75 octets, never splitting a UTF-8 character. */
export function fold(line) {
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = "";
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (curBytes + b > limit) {
      out.push(cur);
      cur = " ";
      curBytes = 1;
      limit = 75;
    }
    cur += ch;
    curBytes += b;
  }
  out.push(cur);
  return out.join("\r\n");
}

const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");

export function toIcs(clocks, incident, nowMs = Date.now()) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Incident Clock//EN", "CALSCALE:GREGORIAN"];
  const key = incident.id || incident.title || "incident";
  for (const c of clocks) {
    if (!c.dueAt) continue;
    const desc = [c.citation, `Regulator: ${c.regulator}`, c.source].join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(key).replace(/\s+/g, "-")}-${c.id}@incident-clock`,
      `DTSTAMP:${stamp(nowMs)}`,
      `DTSTART:${stamp(Date.parse(c.dueAt))}`,
      `SUMMARY:${escapeText(`Due: ${c.deliverable}`)}`,
      `DESCRIPTION:${escapeText(desc)}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeText(`Due in 2 hours: ${c.deliverable}`)}`,
      "TRIGGER:-PT2H",
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

