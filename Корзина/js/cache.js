export const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 часов

export function readCache(key, ver, ttlMs = CACHE_TTL_MS) {
  const raw = sessionStorage.getItem(key);
  if (!raw) return { state: "miss" };
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { state: "legacy", data: parsed };
    if (parsed.ver !== ver) return { state: "ver_mismatch" };
    const age = Date.now() - (parsed.fetchedAt || 0);
    const fresh = age <= ttlMs;
    return { state: fresh ? "fresh" : "stale", data: parsed.data };
  } catch (_) {
    sessionStorage.removeItem(key);
    return { state: "error" };
  }
}

export function writeCache(key, ver, data) {
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({
        ver,
        fetchedAt: Date.now(),
        data,
      })
    );
  } catch (_) {}
}

export async function loadWithCache({ key, version, fetcher, onData }) {
  const cache = readCache(key, version);
  if (cache.data) {
    onData(cache.data, cache.state);
    if (cache.state === "fresh") return cache;
  }

  try {
    const freshData = await fetcher();
    onData(freshData, "fresh");
    writeCache(key, version, freshData);
    return { state: "fresh", data: freshData };
  } catch (e) {
    if (!cache.data) throw e;
    return { state: cache.state, data: cache.data, error: e };
  }
}
