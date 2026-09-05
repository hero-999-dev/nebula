let saveHook = null;

export function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function setSaveHook(fn) {
  saveHook = fn;
}

export function saveJson(key, value) {
  const serialized = JSON.stringify(value);
  try {
    saveHook?.(key, serialized);
  } catch { /* disk mirror must not block in-app save */ }
  localStorage.setItem(key, serialized);
}

export function generateId(prefix = 'n') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
