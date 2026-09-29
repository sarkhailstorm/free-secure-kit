/**
 * The app's storage keys were renamed along with the app. A returning visitor
 * still has the old ones, so every read looks for the new key first and adopts
 * the old one if that is all there is.
 *
 * Reads are deliberately left to throw: callers use that to tell a blocked
 * private window from an empty one. Only the move itself is forgiving.
 */
function adopt(store: Storage, key: string, legacy: string): string | null {
  const current = store.getItem(key);
  if (current !== null) return current;

  const old = store.getItem(legacy);
  if (old === null) return null;

  try {
    store.setItem(key, old);
    store.removeItem(legacy);
  } catch {
    // Full or read-only. The value is still returned; it just moves next time.
  }
  return old;
}

export function readLocal(key: string, legacy: string): string | null {
  return adopt(localStorage, key, legacy);
}

export function readSession(key: string, legacy: string): string | null {
  return adopt(sessionStorage, key, legacy);
}

/** Separate attempts: a throw on the first must not skip the second. */
export function forgetLocal(key: string, legacy: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Blocked. Nothing further to try for this one.
  }
  try {
    localStorage.removeItem(legacy);
  } catch {
    // Same.
  }
}
