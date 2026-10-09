/**
 * PAYD Market Gateway — Cache
 *
 * In-memory TTL cache keyed by `payd-market:<canonical_id>`.
 * Implements request coalescing: when multiple concurrent requests target
 * the same canonical id, they share a single in-flight promise.
 *
 * NOT a substitute for the provider's own freshness — cache TTL is 60s.
 * Cache entries do NOT cross assets and do NOT persist beyond process
 * lifetime. Local JSON snapshots must NEVER be persisted into this cache.
 */

'use strict';

const DEFAULT_TTL_MS = 60 * 1000;

class MarketCache {
  /**
   * @param {object} opts
   * @param {number} opts.ttlMs   time-to-live per entry, default 60_000
   * @param {number} opts.now     injectable clock for tests
   */
  constructor({ ttlMs = DEFAULT_TTL_MS, now = () => Date.now() } = {}) {
    this.ttlMs = ttlMs;
    this.now = now;
    /** @type {Map<string, {expiresAt:number, value:object}>} */
    this.entries = new Map();
    /** @type {Map<string, Promise<object>>} */
    this.inflight = new Map();
  }

  _key(canonicalId) {
    return `payd-market:${canonicalId}`;
  }

  /**
   * Synchronous cache lookup.
   * @returns {object|null} the cached envelope, or null on miss
   */
  getSync(canonicalId) {
    const key = this._key(canonicalId);
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry.value;
  }

  /**
   * Store a successful envelope in cache.
   */
  set(canonicalId, value) {
    if (!canonicalId || value === undefined || value === null) return;
    this.entries.set(this._key(canonicalId), {
      expiresAt: this.now() + this.ttlMs,
      value,
    });
  }

  /**
   * Coalesce concurrent identical fetches.
   *
   * If a fetch for canonicalId is already in-flight, the existing promise
   * is returned. Otherwise `loader()` is invoked and its promise registered.
   *
   * Caching is the loader's responsibility — transient failure envelopes
   * (e.g. RATE_LIMITED) must NOT be cached so the next caller can retry
   * the provider immediately. The loader can call this.set() directly
   * when its result is cacheable.
   */
  async coalesce(canonicalId, loader) {
    const key = this._key(canonicalId);

    const cached = this.getSync(canonicalId);
    if (cached) return cached;

    const existing = this.inflight.get(key);
    if (existing) return existing;

    const p = (async () => {
      try {
        const value = await loader();
        return value;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, p);
    return p;
  }

  /**
   * Drop a single entry — useful after a MAPPING_CONFLICT to force a retry
   * once the underlying dataset is corrected.
   */
  invalidate(canonicalId) {
    this.entries.delete(this._key(canonicalId));
  }

  clear() {
    this.entries.clear();
    this.inflight.clear();
  }

  stats() {
    return {
      size: this.entries.size,
      inflight: this.inflight.size,
      ttlMs: this.ttlMs,
    };
  }
}

module.exports = { MarketCache, DEFAULT_TTL_MS };
