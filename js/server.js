// Optional server features. The static app works fully without them; when
// served by serve.py (or any backend with the same endpoints) it can:
//   - list the available versions and features (GET institutions)
//   - send anonymous completion counts and optional feedback (POST stats)
// Every call fails quietly back to the offline behaviour. Nothing here ever
// carries a name, a login or anything about Campus Realities.

async function call(path, { body, timeout = 4000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// { stats: boolean, versions: { institution id: latest pack version } }
export async function serverCapabilities() {
  if (!navigator.onLine) return { stats: false, versions: {} };
  const info = await call('institutions', { timeout: 2500 });
  const versions = Object.fromEntries((info?.institutions || []).map((i) => [i.id, i.version]));
  return { stats: Boolean(info?.features?.stats), versions };
}

// { device_id (random), chapter, completed, feedback? }
export async function sendStats(payload) {
  if (!navigator.onLine) return false;
  return Boolean(await call('stats', { body: payload }));
}

// Real completion counts for the About screen; null when there is no server.
export async function fetchStats() {
  if (!navigator.onLine) return null;
  return call('stats', { timeout: 2500 });
}
