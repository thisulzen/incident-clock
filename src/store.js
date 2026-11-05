// localStorage wrapper. Every access is wrapped; if storage is unavailable
// or throws (private mode, quota, blocked cookies) it falls back to memory.

const memory = new Map();

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function read(key, fallback = null) {
  try {
    const s = storage();
    const raw = s ? s.getItem(key) : memory.get(key) ?? null;
    if (raw == null) return memory.has(key) ? JSON.parse(memory.get(key)) : fallback;
    return JSON.parse(raw);
  } catch {
    try {
      return memory.has(key) ? JSON.parse(memory.get(key)) : fallback;
    } catch {
      return fallback;
    }
  }
}

export function write(key, value) {
  const raw = JSON.stringify(value);
  memory.set(key, raw);
  try {
    const s = storage();
    if (s) s.setItem(key, raw);
    return true;
  } catch {
    return false;
  }
}

export function remove(key) {
  memory.delete(key);
  try {
    const s = storage();
    if (s) s.removeItem(key);
  } catch {
    /* memory copy already removed */
  }
}
