/**
 * PAYD Market Gateway — CoinMarketCap Adapter
 *
 * Single provider adapter. Responsible ONLY for:
 *   - access-mode selection (PRO_API vs KEYLESS_PUBLIC)
 *   - request construction
 *   - authentication (only for PRO_API)
 *   - timeout (default 4000ms)
 *   - response parsing & status classification
 *   - normalizer-input prep
 *
 * Pure I/O. No caching, no normalization, no business logic.
 *
 * Two access modes are supported (per STEP 2.5 spec):
 *
 *   MODE A — PRO_API
 *     Triggered when CMC_API_KEY is configured.
 *     URL: https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest
 *     Auth header: X-CMC_PRO_API_KEY
 *
 *   MODE B — KEYLESS_PUBLIC
 *     Triggered when CMC_API_KEY is NOT configured.
 *     URL: https://pro-api.coinmarketcap.com/public-api/v3/cryptocurrency/quotes/latest
 *     No auth header.
 *
 *   Response shape:
 *     PRO_API       → data: { "<id>": {...}, ... }, quote: { USD: {...} }
 *     KEYLESS_PUBLIC → data: [ {...}, ... ], quote: [ { ...USD... }, ... ]
 *
 * The adapter's job is to fetch and roughly validate the payload; the
 * normalizer handles both shapes and produces a single canonical PAYD
 * envelope.
 *
 * Env vars:
 *   CMC_API_KEY              — optional. When present → PRO_API mode.
 *   CMC_BASE_URL             — optional override of base hostname.
 *   CMC_TIMEOUT_MS           — optional override (default 4000)
 *   CMC_FORCE_KEYLESS        — optional. When set to "true", forces
 *                              KEYLESS_PUBLIC even if a key is configured
 *                              (used by tests to validate both code paths).
 */

'use strict';

const { URL } = require('url');
const {
  ProviderUnavailableError,
  RateLimitedError,
  ProviderError,
  TimeoutError,
  InvalidResponseError,
} = require('./market_errors');

const PRO_BASE = 'https://pro-api.coinmarketcap.com';
const KEYLESS_BASE = 'https://pro-api.coinmarketcap.com';
const DEFAULT_TIMEOUT_MS = 4000;

const MODE_PRO_API = 'PRO_API';
const MODE_KEYLESS_PUBLIC = 'KEYLESS_PUBLIC';

class CoinMarketCapAdapter {
  /**
   * @param {object} opts
   * @param {string} [opts.apiKey]        overrides env CMC_API_KEY
   * @param {string} [opts.baseUrl]       defaults to env CMC_BASE_URL or PRO_BASE
   * @param {number} [opts.timeoutMs]     defaults to env CMC_TIMEOUT_MS or 4000
   * @param {typeof fetch} [opts.fetch]   injectable fetch (for tests)
   * @param {boolean}[opts.forceKeyless]  if true, KEYLESS_PUBLIC mode regardless of apiKey
   */
  constructor({
    apiKey,
    baseUrl,
    timeoutMs,
    fetch: fetchImpl,
    forceKeyless,
  } = {}) {
    this.apiKey = apiKey !== undefined ? apiKey : (process.env.CMC_API_KEY || '');
    this.baseUrl = (baseUrl !== undefined ? baseUrl : (process.env.CMC_BASE_URL || PRO_BASE)).replace(/\/$/, '');
    this.timeoutMs = Number.isFinite(Number(timeoutMs))
      ? Number(timeoutMs)
      : (Number.isFinite(Number(process.env.CMC_TIMEOUT_MS)) ? Number(process.env.CMC_TIMEOUT_MS) : DEFAULT_TIMEOUT_MS);
    this.fetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    const envForce = String(process.env.CMC_FORCE_KEYLESS || '').toLowerCase() === 'true';
    this.forceKeyless = !!(forceKeyless || envForce);
  }

  /**
   * Resolve the access mode for this adapter instance.
   * Key always wins unless explicitly forced to keyless.
   */
  getAccessMode() {
    if (this.forceKeyless) return MODE_KEYLESS_PUBLIC;
    return this._hasKey() ? MODE_PRO_API : MODE_KEYLESS_PUBLIC;
  }

  _hasKey() {
    return typeof this.apiKey === 'string' && this.apiKey.trim().length > 0;
  }

  /**
   * Back-compat with STEP 2 callers that used isAuthAvailable().
   * In STEP 2.5 the adapter is always usable: PRO_API when keyed,
   * KEYLESS_PUBLIC otherwise.
   */
  isAuthAvailable() {
    return true;
  }

  /**
   * Build the request URL and headers for the active access mode.
   * Returns { url, headers, mode }.
   */
  _buildRequest(cmcId) {
    const mode = this.getAccessMode();
    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'PAYD-Market-Gateway/1.0',
    };

    if (mode === MODE_PRO_API) {
      const url = new URL('/v1/cryptocurrency/quotes/latest', this.baseUrl + '/');
      url.searchParams.set('id', String(cmcId));
      url.searchParams.set('aux', 'num_market_pairs,cmc_rank,date_added,tags,platform,max_supply,circulating_supply,total_supply,is_active,is_fiat');
      headers['X-CMC_PRO_API_KEY'] = this.apiKey;
      return { url: url.toString(), headers, mode };
    }

    // MODE_KEYLESS_PUBLIC
    const url = new URL('/public-api/v3/cryptocurrency/quotes/latest', this.baseUrl + '/');
    url.searchParams.set('id', String(cmcId));
    url.searchParams.set('convert', 'USD');
    return { url: url.toString(), headers, mode };
  }

  /**
   * Fetch the latest quote for a single CMC asset, by numeric id.
   *
   * @param {string|number} cmcId
   * @returns {Promise<{payload:object, mode:string, rawStatus:number, rawUrl:string}>}
   * @throws MarketError subclasses on every failure mode
   */
  async fetchQuoteById(cmcId) {
    if (!this.fetch) {
      throw new ProviderUnavailableError('No fetch implementation is available in this runtime');
    }
    if (cmcId === undefined || cmcId === null || cmcId === '') {
      throw new InvalidResponseError('fetchQuoteById called without a cmcId');
    }

    const { url, headers, mode } = this._buildRequest(cmcId);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res;
    try {
      res = await this.fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err && (err.name === 'AbortError' || /aborted/i.test(String(err.message || '')))) {
        throw new TimeoutError(`CMC request timed out after ${this.timeoutMs}ms`);
      }
      throw new ProviderUnavailableError('CMC request failed: ' + (err && err.message ? err.message : 'network'), { cause: err });
    }
    clearTimeout(timer);

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after')) || null;
      throw new RateLimitedError(`CMC rate-limited (HTTP 429)`, { retryAfterMs: retryAfter ? retryAfter * 1000 : null });
    }
    if (res.status === 401 || res.status === 403) {
      throw new ProviderUnavailableError(`CMC auth rejected (HTTP ${res.status})`);
    }
    if (!res.ok) {
      let body = '';
      try { body = await res.text(); } catch { /* ignore */ }
      throw new ProviderError(`CMC HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    let payload;
    try {
      payload = await res.json();
    } catch (err) {
      throw new InvalidResponseError('CMC response was not valid JSON', { cause: err });
    }

    if (!payload) {
      throw new InvalidResponseError('CMC response body was empty');
    }

    // CMC returns 200 with status.error_code != 0 in some failure paths
    if (payload.status && payload.status.error_code !== undefined && payload.status.error_code !== 0 && payload.status.error_code !== '0') {
      const msg = (payload.status && payload.status.error_message) || `CMC status.error_code=${payload.status.error_code}`;
      if (/rate limit|too many/i.test(msg)) {
        throw new RateLimitedError(msg);
      }
      throw new ProviderError(msg);
    }

    return { payload, mode, rawStatus: res.status, rawUrl: url };
  }
}

module.exports = {
  CoinMarketCapAdapter,
  DEFAULT_TIMEOUT_MS,
  PRO_BASE,
  KEYLESS_BASE,
  MODE_PRO_API,
  MODE_KEYLESS_PUBLIC,
};
