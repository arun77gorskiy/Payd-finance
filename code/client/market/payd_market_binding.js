/* Explicit adapter for the existing PAYD canonical runtime.
 * Registration does not activate a page or modify a project.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./payd_market_client'));
  } else {
    root.PAYD_INTEL = root.PAYD_INTEL || {};
    root.PAYD_INTEL.PaydMarketBinding = factory(root.PAYD_INTEL.PaydMarketClient);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Client) {
  'use strict';
  function createBinding({ client, runtime, format, onChange = () => {}, concurrency = 4 } = {}) {
    if (!client || client.enabled !== true) {
      return Object.freeze({ enabled: false, refresh: async () => [], dispose() {} });
    }
    if (!Client || !runtime || typeof runtime.projects?.get !== 'function' ||
        typeof runtime.projects?.values !== 'function' || !format ||
        typeof format.usd !== 'function' || typeof format.pct !== 'function' ||
        typeof client.getMarket !== 'function' || typeof onChange !== 'function') {
      throw new Error('A canonical runtime, enabled PAYD client and canonical formatters are required');
    }
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
      throw new Error('Concurrency must be an integer from 1 to 8');
    }
    let active = true;
    const generations = new Map();
    const queue = [];
    let running = 0;
    const waiting = id => ({ canonical_id: id, status: 'UPDATING', market: null });
    const unavailable = id => ({ canonical_id: id, status: 'PROVIDER_UNAVAILABLE', market: null });
    function notify(ids) {
      // A rendering callback must not turn a valid provider result into a fallback.
      try { onChange(ids); } catch (_) { /* UI owns its rendering error boundary. */ }
    }
    function usd(value) {
      // The site's six-decimal formatter would print tiny nonzero quotes as $0.
      return typeof value === 'number' && value !== 0 && Math.abs(value) < 0.000001
        ? '$' + value.toExponential(4) : format.usd(value);
    }
    function apply(id, envelope) {
      const p = runtime.projects.get(id);
      if (!p) return;
      const e = envelope?.canonical_id === id ? envelope :
        { canonical_id: id, status: 'MAPPING_CONFLICT', market: null };
      const view = Client.toMarketView(e);
      // Replace every market field. Do not merge snapshot ATH/ATL or timestamp.
      p.market = { ...view.market, ath: null, atl: null,
        last_updated: view.provider_updated_at };
      p.market_status = view.status;
      p.market_hint = view.hint;
      p.market_updated_at = view.provider_updated_at;
      p.market_symbol = view.status === 'LIVE' || view.status === 'PARTIAL' ? e.symbol || null : null;
      p.market_provider_id = view.status === 'LIVE' || view.status === 'PARTIAL' ? e.provider_id || null : null;
      p._display = { ...p._display,
        price: usd(view.market.price_usd),
        market_cap: usd(view.market.market_cap_usd),
        fdv: usd(view.market.fdv_usd),
        volume_24h: usd(view.market.volume_24h_usd),
        change_24h: format.pct(view.market.change_24h_pct),
        rank: view.market.market_cap_rank === null ? null : '#' + view.market.market_cap_rank };
      // The main site's V1 renderer memoizes a view containing old market values.
      // Invalidate it on UPDATING, success and error, before a UI redraw.
      delete p._v1_view;
    }
    // Call this adapter before first render only when the market flag is enabled.
    // Name, symbol, sectors, token classification, TVL and AI stay with their owners.
    const allIds = Array.from(runtime.projects.values(), p => p.id);
    allIds.forEach(id => apply(id, waiting(id)));
    notify(allIds);

    async function refresh(ids) {
      if (!active) return [];
      if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !runtime.projects.has(id))) {
        throw new Error('refresh requires exact canonical IDs from this runtime');
      }
      const selected = [...new Set(ids)];
      const tickets = new Map();
      for (const id of selected) {
        const generation = (generations.get(id) || 0) + 1;
        generations.set(id, generation); tickets.set(id, generation);
        apply(id, waiting(id));
      }
      if (selected.length) notify(selected);
      const results = selected.map(id => new Promise(resolve => {
        queue.push({ id, generation: tickets.get(id), resolve });
      }));
      pump();
      return Promise.all(results);
    }
    function pump() {
      while (active && running < concurrency && queue.length) {
        const job = queue.shift();
        if (generations.get(job.id) !== job.generation) {
          job.resolve(waiting(job.id)); continue;
        }
        running++;
        (async () => {
          let envelope;
          try { envelope = await client.getMarket(job.id); }
          catch (_) { envelope = unavailable(job.id); }
          if (active && generations.get(job.id) === job.generation) {
            apply(job.id, envelope); notify([job.id]);
          }
          job.resolve(envelope);
        })().finally(() => { running--; pump(); });
      }
    }
    function dispose() {
      if (!active) return;
      active = false;
      while (queue.length) {
        const job = queue.shift(); job.resolve(waiting(job.id));
      }
      allIds.forEach(id => apply(id, waiting(id)));
      notify(allIds);
    }
    return Object.freeze({ enabled: true, refresh, dispose });
  }
  return Object.freeze({ createBinding });
});
