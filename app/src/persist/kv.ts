// Tiny IndexedDB key/value store. Everything is best-effort: private browsing or a blocked
// store must never break the room, so callers wrap these in try/catch.
const DB = "tutorme";
const STORE = "kv";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Debounce writes so a fast pen stroke does not hammer the store. */
export function debouncedSetter(key: string, ms: number) {
  let timer: number | null = null;
  let last: unknown;
  return (value: unknown) => {
    last = value;
    if (timer !== null) return;
    timer = window.setTimeout(() => {
      timer = null;
      kvSet(key, last).catch(() => { /* storage unavailable */ });
    }, ms);
  };
}
