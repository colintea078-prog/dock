/* Storage adapters.
 *
 * Every app talks to one of these and never to localStorage or fetch
 * directly. That is the whole point: the public build runs entirely in the
 * browser with no backend, a private deployment points the same code at a
 * real API, and no app file changes between the two.
 *
 * Both adapters implement the same six methods. If you add a third
 * (IndexedDB, a different backend), implement those six and nothing else
 * needs to know.
 */

const PREFIX = 'dock:';

/* ------------------------------------------------------------------ local */

export class LocalStore {
  constructor() { this.kind = 'local'; }

  _key(app, coll) { return `${PREFIX}${app}:${coll}`; }

  _read(app, coll) {
    try { return JSON.parse(localStorage.getItem(this._key(app, coll))) || []; }
    catch { return []; }
  }

  _write(app, coll, rows) {
    localStorage.setItem(this._key(app, coll), JSON.stringify(rows));
  }

  async list(app, coll = 'items') {
    return this._read(app, coll);
  }

  async add(app, coll, record) {
    const rows = this._read(app, coll);
    const row = { id: Date.now() + Math.floor(Math.random() * 1000), ...record };
    rows.push(row);
    this._write(app, coll, rows);
    return row;
  }

  async remove(app, coll, id) {
    const rows = this._read(app, coll).filter(r => r.id !== id);
    this._write(app, coll, rows);
    return true;
  }

  /* Small scalar settings — a rate, a preference, a last-used value. */
  async get(app, key, fallback = null) {
    const raw = localStorage.getItem(`${PREFIX}${app}#${key}`);
    if (raw === null) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
  }

  async set(app, key, value) {
    localStorage.setItem(`${PREFIX}${app}#${key}`, JSON.stringify(value));
    return value;
  }

  /* Everything, as one object. Used by the export button and by the
   * snapshot job that pushes a copy somewhere durable. */
  dump() {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith(PREFIX)) out[k] = localStorage.getItem(k);
    }
    return out;
  }

  restore(obj) {
    Object.entries(obj).forEach(([k, v]) => {
      if (k.startsWith(PREFIX)) localStorage.setItem(k, v);
    });
  }
}

/* -------------------------------------------------------------------- api */

export class ApiStore {
  /* base: e.g. "/api/ledger". token is appended as a query param because
   * that is what the deployment this was built for expects; swap for a
   * header if yours differs. */
  constructor({ base, token = '' }) {
    this.kind = 'api';
    this.base = base.replace(/\/$/, '');
    this.token = token;
  }

  async _req(path, opts = {}) {
    const url = this.base + path + (this.token ? `?token=${encodeURIComponent(this.token)}` : '');
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...opts
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.status === 204 ? null : res.json();
  }

  async list(app, coll = 'items') {
    return this._req(`/${app}/${coll}`);
  }

  async add(app, coll, record) {
    return this._req(`/${app}/${coll}`, {
      method: 'POST', body: JSON.stringify(record)
    });
  }

  async remove(app, coll, id) {
    await this._req(`/${app}/${coll}/${id}`, { method: 'DELETE' });
    return true;
  }

  async get(app, key, fallback = null) {
    try { return (await this._req(`/${app}/settings/${key}`)).value; }
    catch { return fallback; }
  }

  async set(app, key, value) {
    return this._req(`/${app}/settings/${key}`, {
      method: 'POST', body: JSON.stringify({ value })
    });
  }
}

/* ----------------------------------------------------------------- factory */

export function createStorage(cfg) {
  if (cfg.storage === 'api') {
    if (!cfg.api || !cfg.api.base) {
      console.warn('storage: "api" selected but config.api.base is missing — falling back to local');
      return new LocalStore();
    }
    return new ApiStore(cfg.api);
  }
  return new LocalStore();
}
