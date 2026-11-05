import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const BANNED = [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /EventSource/, /importScripts/, /https?:\/\/[^\s"'`]*\.(js|mjs)\b/];

test("no network APIs anywhere under src/", async () => {
  const dir = new URL("../src/", import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".js"));
  assert.ok(files.length >= 6);
  for (const f of files) {
    const text = await readFile(new URL(f, dir), "utf8");
    for (const re of BANNED) assert.ok(!re.test(text), `${f} matches ${re}`);
  }
});

test("index.html loads nothing from another origin", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.ok(!/<(script|link|img)[^>]+(src|href)=["']https?:/i.test(html.replace(/<a\s[^>]*>/gi, "")));
});
