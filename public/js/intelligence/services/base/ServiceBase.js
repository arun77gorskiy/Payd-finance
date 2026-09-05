/* =================================================================
   PAYD Finance — ServiceBase
   Базовый класс для всех сервисов данных.
   Обеспечивает: HTTP fetch, retry, кеш, метрики, нормализацию ответов.
   ================================================================= */

(function (global) {
    'use strict';

    const CACHE_PREFIX = 'payd_svc_';
    const DEFAULT_TIMEOUT_MS = 12000;
    const DEFAULT_RETRIES = 2;

    /**
     * Базовый класс сервиса. Не вызывается напрямую — наследуется
     * конкретными провайдерами (CoinGecko, DefiLlama и т.д.).
     */
    class ServiceBase {
        constructor(config = {}) {
            this.name = config.name || 'UnknownService';
            this.baseUrl = config.baseUrl || '';
            this.timeoutMs = config.timeoutMs || DEFAULT_TIMEOUT_MS;
            this.maxRetries = config.maxRetries ?? DEFAULT_RETRIES;
            this.cacheTtlMs = config.cacheTtlMs || 5 * 60 * 1000; // 5 минут по умолчанию
            this.enabled = config.enabled !== false;
            this.headers = config.headers || {};
            this.rateLimit = config.rateLimit || null; // { requests, perMs }

            this._lastCallTs = 0;
            this._rateQueue = [];
            this._stats = {
                requests: 0,
                cacheHits: 0,
                errors: 0,
                avgLatencyMs: 0,
            };
        }

        /**
         * Нормализованный ответ — единый контракт для всех провайдеров.
         * @param {Object} raw — сырой ответ API
         * @param {string} source — название источника
         * @returns {Object} — { ok, data, source, timestamp, error }
         */
        normalize(raw, source) {
            return {
                ok: raw != null,
                data: raw,
                source: source || this.name,
                timestamp: Date.now(),
                lastUpdated: new Date().toISOString(),
                error: null,
            };
        }

        /**
         * Ошибочный нормализованный ответ.
         */
        normalizeError(error, source) {
            return {
                ok: false,
                data: null,
                source: source || this.name,
                timestamp: Date.now(),
                lastUpdated: new Date().toISOString(),
                error: error instanceof Error ? error.message : String(error),
            };
        }

        /**
         * Безопасный fetch с timeout, retry, rate-limit и CORS-headers.
         * @param {string} url
         * @param {Object} options
         * @returns {Promise<Object>} — нормализованный ответ
         */
        async fetch(url, options = {}) {
            if (!this.enabled) {
                return this.normalizeError('Service disabled', this.name);
            }

            const cacheKey = this._cacheKey(url, options);
            const cached = this._readCache(cacheKey);
            if (cached && !options.skipCache) {
                this._stats.cacheHits++;
                return cached;
            }

            await this._respectRateLimit();

            const start = Date.now();
            let lastError = null;

            for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
                try {
                    const response = await this._fetchWithTimeout(url, options);
                    const text = await response.text();
                    let json = null;
                    try { json = text ? JSON.parse(text) : null; } catch (e) { json = text; }

                    const latency = Date.now() - start;
                    this._stats.requests++;
                    this._stats.avgLatencyMs = Math.round(
                        (this._stats.avgLatencyMs * (this._stats.requests - 1) + latency) / this._stats.requests
                    );

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const normalized = this.normalize(json, this.name);
                    this._writeCache(cacheKey, normalized, this.cacheTtlMs);
                    return normalized;
                } catch (error) {
                    lastError = error;
                    this._stats.errors++;
                    if (attempt < this.maxRetries) {
                        await this._backoff(attempt);
                    }
                }
            }

            // Все попытки провалились — возвращаем кешированную версию (даже если устарела)
            const stale = this._readCache(cacheKey, { allowStale: true });
            if (stale) {
                stale.stale = true;
                return stale;
            }
            return this.normalizeError(lastError, this.name);
        }

        /**
         * Fetch с timeout через AbortController.
         */
        async _fetchWithTimeout(url, options = {}) {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), this.timeoutMs);
            try {
                const response = await fetch(url, {
                    ...options,
                    headers: { ...this.headers, ...(options.headers || {}) },
                    signal: controller.signal,
                    mode: 'cors',
                    credentials: 'omit',
                });
                return response;
            } finally {
                clearTimeout(timer);
            }
        }

        /**
         * Exponential backoff.
         */
        async _backoff(attempt) {
            const delay = Math.min(2000, 300 * Math.pow(2, attempt));
            await new Promise(r => setTimeout(r, delay));
        }

        /**
         * Rate limit через sliding window.
         */
        async _respectRateLimit() {
            if (!this.rateLimit) return;
            const now = Date.now();
            const { requests, perMs } = this.rateLimit;
            this._rateQueue = this._rateQueue.filter(ts => ts > now - perMs);
            if (this._rateQueue.length >= requests) {
                const wait = this._rateQueue[0] + perMs - now;
                if (wait > 0) await new Promise(r => setTimeout(r, wait));
            }
            this._rateQueue.push(Date.now());
        }

        /**
         * Кеш-ключ.
         */
        _cacheKey(url, options) {
            return CACHE_PREFIX + this.name + ':' + url + ':' + (options.method || 'GET');
        }

        /**
         * Прочитать из localStorage с проверкой TTL.
         */
        _readCache(key, { allowStale = false } = {}) {
            try {
                const raw = localStorage.getItem(key);
                if (!raw) return null;
                const entry = JSON.parse(raw);
                if (!entry || !entry.timestamp) return null;
                const age = Date.now() - entry.timestamp;
                if (!allowStale && age > this.cacheTtlMs) return null;
                return entry;
            } catch (e) { return null; }
        }

        /**
         * Записать в localStorage.
         */
        _writeCache(key, value, ttlMs) {
            try {
                const entry = { ...value, _cachedAt: Date.now(), _ttlMs: ttlMs };
                localStorage.setItem(key, JSON.stringify(entry));
            } catch (e) { /* localStorage quota exceeded */ }
        }

        /**
         * Очистить кеш сервиса.
         */
        clearCache() {
            const prefix = CACHE_PREFIX + this.name + ':';
            const toRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(prefix)) toRemove.push(key);
            }
            toRemove.forEach(k => localStorage.removeItem(k));
        }

        /**
         * Получить статистику сервиса.
         */
        getStats() {
            return { ...this._stats, name: this.name, enabled: this.enabled };
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.ServiceBase = ServiceBase;

})(window);
