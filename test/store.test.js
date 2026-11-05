import test from "node:test";
import assert from "node:assert/strict";

test("store falls back to memory when localStorage throws", async () => {
  const boom = () => { throw new Error("blocked"); };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: boom, setItem: boom, removeItem: boom },
  });
  const store = await import("../src/store.js");
  assert.equal(store.write("k", { a: 1 }), false);
  assert.deepEqual(store.read("k"), { a: 1 });
  assert.equal(store.read("missing", "dflt"), "dflt");
  store.remove("k");
  assert.equal(store.read("k", null), null);
});

test("store falls back to memory when localStorage access itself throws", async () => {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("denied"); } });
  const store = await import("../src/store.js");
  store.write("z", [1, 2]);
  assert.deepEqual(store.read("z"), [1, 2]);
});

test("store uses localStorage when it works", async () => {
  const data = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) },
  });
  const store = await import("../src/store.js");
  assert.equal(store.write("w", { ok: true }), true);
  assert.equal(data.get("w"), '{"ok":true}');
  assert.deepEqual(store.read("w"), { ok: true });
  store.remove("w");
  assert.equal(data.has("w"), false);
});

test("corrupt stored JSON returns the fallback", async () => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => "{not json", setItem() {}, removeItem() {} },
  });
  const store = await import("../src/store.js");
  assert.equal(store.read("never-written", "fb"), "fb");
});
