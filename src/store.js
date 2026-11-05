// localStorage wrapper. Every access is wrapped; if storage is unavailable,
// throws (private mode, quota, blocked cookies) or holds corrupt JSON, it falls back to memory.

const memory = new Map();

const storage = () => {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
};

export function read(key, fallback = null) {
  for (const get of [() => storage().getItem(key), () => memory.get(key)]) {
    try {
      const raw = get();
      if (raw != null) return JSON.parse(raw);
    } catch { /* try the memory copy */ }
  }
  return fallback;
}

export function write(key, value) {
  const raw = JSON.stringify(value);
  memory.set(key, raw);
  try {
    storage().setItem(key, raw);
    return true;
  } catch {
    return false;
  }
}
