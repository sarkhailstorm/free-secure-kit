// Keys were renamed with the app, so a read falls back to the old key and moves the value across
// Reads are left to throw: callers use that to tell a blocked private window from an empty one
function adopt(store: Storage, key: string, legacy: string): string | null {
  const current = store.getItem(key);
  if (current !== null) return current;

  const old = store.getItem(legacy);
  if (old === null) return null;

  try {
    store.setItem(key, old);
    store.removeItem(legacy);
  } catch {
    // Full or read-only; the value still comes back, it just moves next time
  }
  return old;
}

export function readLocal(key: string, legacy: string): string | null {
  return adopt(localStorage, key, legacy);
}

export function readSession(key: string, legacy: string): string | null {
  return adopt(sessionStorage, key, legacy);
}

// Separate try blocks: a throw on the first must not skip the second
export function forgetLocal(key: string, legacy: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage blocked
  }
  try {
    localStorage.removeItem(legacy);
  } catch {
    // Storage blocked
  }
}
