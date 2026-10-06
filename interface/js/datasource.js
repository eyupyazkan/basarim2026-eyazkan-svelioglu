export class DataSource {

  async info() { throw new Error('not implemented'); }

  async catalog() { throw new Error('not implemented'); }

  async analyzeByName(name) { throw new Error('not implemented'); }

  get kind() { return 'abstract'; }
}

export class SourceError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function asJson(res) {
  let body = null;
  try { body = await res.json(); } catch (e) { body = null; }
  if (!res.ok) {
    const msg = (body && (body.detail || body.message)) || `HTTP ${res.status}`;
    throw new SourceError(typeof msg === 'string' ? msg : JSON.stringify(msg), res.status);
  }
  return body;
}

class CachingSource extends DataSource {
  constructor() { super(); this._cache = new Map(); }
  _get(url) {
    if (this._cache.has(url)) return this._cache.get(url);
    const p = fetch(url, { headers: { Accept: 'application/json' } }).then(asJson);
    this._cache.set(url, p); p.catch(() => this._cache.delete(url));
    return p;
  }
}

export class LiveSource extends CachingSource {
  get kind() { return 'live'; }
  info() { return this._get('/api/info'); }
  catalog() { return this._get('/api/catalog'); }
  analyzeByName(name) { return this._get(`/api/structures/${encodeURIComponent(name)}/analysis`); }
}

export class ReplaySource extends CachingSource {
  constructor(base = 'data/') { super(); this.base = base; this._ids = null; }
  get kind() { return 'replay'; }
  info() { return this._get(`${this.base}info.json`); }
  async catalog() {
    const c = await this._get(`${this.base}catalog.json`);
    this._ids = new Map(c.rows.map((r) => [r.name, r.id]));
    return c;
  }
  async analyzeByName(name) {
    if (!this._ids) await this.catalog();
    const id = this._ids.get(name);
    if (!id) throw new SourceError('Not one of the default structures.', 404);
    return this._get(`${this.base}structures/${id}.json`);
  }
}

export function createSource() {
  return (typeof window !== 'undefined' && window.MXSI_SOURCE === 'replay') ? new ReplaySource('data/') : new LiveSource();
}
