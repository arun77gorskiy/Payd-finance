/* PAYD browser client. Registration only; no requests until explicitly enabled.
 * No provider keys, ticker lookup, localStorage or snapshot fallback.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.PAYD_INTEL = root.PAYD_INTEL || {};
    root.PAYD_INTEL.PaydMarketClient = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FIELDS = Object.freeze([
    'price_usd', 'market_cap_usd', 'fdv_usd', 'volume_24h_usd',
    'change_1h_pct', 'change_24h_pct', 'change_7d_pct', 'change_30d_pct',
    'market_cap_rank', 'circulating_supply', 'total_supply', 'max_supply',
  ]);
  const STATUSES = new Set(['LIVE', 'PARTIAL', 'UPDATING', 'UNKNOWN_MAPPING',
    'MAPPING_CONFLICT', 'PROVIDER_UNAVAILABLE', 'PROVIDER_ERROR', 'RATE_LIMITED',
    'INVALID_RESPONSE', 'INVALID_ID']);
  const hasMarket = status => status === 'LIVE' || status === 'PARTIAL';
  const emptyMarket = () => Object.fromEntries(FIELDS.map(key => [key, null]));
  const unavailable = (id, status) => ({ canonical_id: id, status, market: null,
    provider: 'coinmarketcap', provider_id: null, symbol: null,
    provider_updated_at: null, retrieved_at: null });

  function createClient(options = {}) {
    // Explicit true is required. Loading this script never enables a page.
    if (options.enabled !== true) {
      return Object.freeze({ enabled: false,
        getMarket: async id => unavailable(id, 'UPDATING') });
    }
    if (!Array.isArray(options.records) || !options.records.length) {
      throw new Error('A reviewed canonical catalog is required');
    }
    const catalog = new Map();
    for (const row of options.records) {
      if (!row || typeof row.id !== 'string' || !row.id || catalog.has(row.id)) {
        throw new Error('Canonical catalog contains an invalid or duplicate id');
      }
      // Copy only identity fields so later UI mutation cannot change this client.
      catalog.set(row.id, { id: row.id, symbol: row.symbol, cmcId: row.cmcId });
    }
    const fetchImpl = options.fetch || globalThis.fetch;
    if (typeof fetchImpl !== 'function') throw new Error('fetch is required');
    const base = new URL(options.baseUrl || globalThis.location?.origin);
    if (base.username || base.password || base.search || base.hash || base.pathname !== '/' ||
        (base.protocol !== 'https:' && !(base.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname)))) {
      throw new Error('Use the HTTPS origin of the PAYD API, or local HTTP for development');
    }
    if (/(^|\.)(coinmarketcap\.com|coingecko\.com)$/i.test(base.hostname)) {
      throw new Error('Use the PAYD API origin');
    }
    const timeoutMs = options.timeoutMs === undefined ? 8000 : options.timeoutMs;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Invalid timeout');
    const inflight = new Map();

    async function request(id, expected) {
      const controller = new AbortController();
      let timer;
      // Race also bounds a stalled body reader or a fetch adapter ignoring abort.
      const deadline = new Promise(resolve => {
        timer = setTimeout(() => {
          controller.abort();
          resolve(unavailable(id, 'PROVIDER_UNAVAILABLE'));
        }, timeoutMs);
      });
      const work = (async () => {
        try {
          const url = new URL('/api/intelligence/market', base);
          url.searchParams.set('id', id);
          const response = await fetchImpl(url.href, { method: 'GET',
            headers: { Accept: 'application/json' }, credentials: 'omit',
            redirect: 'error', signal: controller.signal });
          if (response.status !== 200 && response.status !== 404) {
            return unavailable(id, response.status === 429 ? 'RATE_LIMITED' : 'PROVIDER_UNAVAILABLE');
          }
          let payload;
          try { payload = await response.json(); }
          catch (_) { return unavailable(id, 'INVALID_RESPONSE'); }
          const e = payload && payload.ok === true && payload.envelope;
          if (!e || e.canonical_id !== id || !STATUSES.has(e.status)) {
            return unavailable(id, 'INVALID_RESPONSE');
          }
          if (response.status !== (e.status === 'INVALID_ID' ? 404 : 200)) {
            return unavailable(id, 'INVALID_RESPONSE');
          }
          if (!hasMarket(e.status)) return unavailable(id, e.status);
          if (e.provider !== 'coinmarketcap' || e.access_mode !== 'PRO_API' ||
              !expected.cmcId || String(e.provider_id) !== String(expected.cmcId) ||
              typeof e.symbol !== 'string' || typeof expected.symbol !== 'string' ||
              e.symbol.toUpperCase() !== expected.symbol.toUpperCase()) {
            return unavailable(id, 'MAPPING_CONFLICT');
          }
          if (!e.market || typeof e.market !== 'object' ||
              !FIELDS.every(key => e.market[key] === null ||
                (typeof e.market[key] === 'number' && Number.isFinite(e.market[key]))) ||
              !(e.market.price_usd > 0)) return unavailable(id, 'INVALID_RESPONSE');
          return { canonical_id: id, status: e.status, symbol: e.symbol,
            provider: e.provider, provider_id: String(e.provider_id),
            provider_updated_at: e.provider_updated_at || null, retrieved_at: e.retrieved_at || null,
            market: Object.fromEntries(FIELDS.map(key => [key, e.market[key]])) };
        } catch (_) {
          // Never expose exception text, HTML protection pages or another source.
          return unavailable(id, 'PROVIDER_UNAVAILABLE');
        }
      })();
      try { return await Promise.race([work, deadline]); }
      finally { clearTimeout(timer); }
    }

    function getMarket(id) {
      // Exact catalog IDs only. No lowercasing, symbol search or alias inference.
      if (typeof id !== 'string' || !catalog.has(id)) {
        return Promise.resolve(unavailable(id, 'INVALID_ID'));
      }
      if (inflight.has(id)) return inflight.get(id);
      const promise = request(id, catalog.get(id)).finally(() => inflight.delete(id));
      inflight.set(id, promise);
      return promise;
    }
    return Object.freeze({ enabled: true, getMarket });
  }

  function toMarketView(envelope) {
    const status = envelope && STATUSES.has(envelope.status) ? envelope.status : 'INVALID_RESPONSE';
    // Replace the whole market view. Never merge with prior/snapshot fields.
    const market = emptyMarket();
    if (hasMarket(status) && envelope.market) {
      for (const key of FIELDS) {
        const value = envelope.market[key];
        market[key] = typeof value === 'number' && Number.isFinite(value) ? value : null;
      }
    }
    return { status, market,
      hint: hasMarket(status) ? null : 'Market data temporarily unavailable',
      provider_updated_at: hasMarket(status) ? envelope.provider_updated_at || null : null };
  }
  return Object.freeze({ createClient, toMarketView, FIELDS });
});
