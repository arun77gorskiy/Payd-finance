/* =================================================================
   PAYD Finance — MarketDataValidationService
   Application Layer (V2): валидация рыночных данных проекта.
   Применяет политику "Invalid Project Handling v1.0".

   Ответственность:
     - Проверить, что проект имеет verified market cap, FDV, price
     - Проверить актуальность данных (last_updated)
     - Проверить наличие CoinGecko/CoinMarketCap ID
     - Вернуть { isValid, data, errors }

   Не отвечает за:
     - Рендеринг UI (это делает Render Layer)
     - Замену проектов (это ProjectReplacementService)
     - Хранение статуса (это делает Repository Layer)

   Зависимости (внедряются через DI):
     - marketDataProvider (IMarketDataProvider): primary
     - fallbackProvider (IMarketDataProvider, optional): secondary
     - cache (CacheManager, optional)
   ================================================================= */

(function (global) {
    'use strict';

    const VERIFICATION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней
    const FieldUtils = (global.PAYD_INTEL && global.PAYD_INTEL.FieldUtils) || null;

    function _readField(project, name) {
        if (FieldUtils && typeof FieldUtils.getField === 'function') {
            return FieldUtils.getField(project, name, project && project.metadata);
        }
        if (!project) return undefined;
        const meta = project.metadata;
        if (project[name] !== undefined && project[name] !== null) return project[name];
        const snake = name.replace(/([A-Z])/g, '_$1').toLowerCase();
        if (project[snake] !== undefined && project[snake] !== null) return project[snake];
        if (meta) {
            if (meta[name] !== undefined && meta[name] !== null) return meta[name];
            if (meta[snake] !== undefined && meta[snake] !== null) return meta[snake];
        }
        return undefined;
    }

    class MarketDataValidationService {
        /**
         * @param {Object} deps
         * @param {Object} deps.marketDataProvider — primary (CoinGecko)
         * @param {Object} [deps.fallbackProvider]  — secondary (CoinMarketCap)
         * @param {Object} [deps.cache]             — CacheManager
         */
        constructor(deps = {}) {
            if (!deps.marketDataProvider) {
                throw new Error('[MarketDataValidationService] marketDataProvider is required');
            }
            this.primary = deps.marketDataProvider;
            this.fallback = deps.fallbackProvider || null;
            this.cache = deps.cache || null;
            this._maxAgeMs = deps.maxAgeMs || VERIFICATION_MAX_AGE_MS;
        }

        /**
         * Валидирует проект.
         * @param {Object} project — модель проекта
         * @returns {Promise<{isValid: boolean, data: Object|null, errors: string[]}>}
         */
        async validateProject(project) {
            const errors = [];
            if (!project) {
                return { isValid: false, data: null, errors: ['no_project'] };
            }

            // 1. ID checks (поддержка camelCase и snake_case)
            const cgId  = _readField(project, 'coingeckoId');
            const cmcId = _readField(project, 'cmcId');
            if (!cgId && !cmcId) {
                errors.push('missing_coin_id');
            }

            // 2. Fetch market data (with fallback)
            let marketData = null;
            if (cgId) {
                marketData = await this._fetchWithCache('coingecko', cgId, () => this.primary.getMarketData(cgId));
                if (!marketData && this.fallback && cmcId) {
                    marketData = await this._fetchWithCache('cmc', cmcId, () => this.fallback.getMarketData(cmcId));
                }
            } else if (cmcId && this.fallback) {
                marketData = await this._fetchWithCache('cmc', cmcId, () => this.fallback.getMarketData(cmcId));
            }

            if (!marketData) {
                errors.push('no_market_data');
                return { isValid: false, data: null, errors };
            }

            // 3. Required numeric fields
            if (!Number.isFinite(marketData.marketCap) || marketData.marketCap <= 0) {
                errors.push('missing_market_cap');
            }
            if (!Number.isFinite(marketData.fdv) || marketData.fdv <= 0) {
                errors.push('missing_fdv');
            }
            if (!Number.isFinite(marketData.price) || marketData.price <= 0) {
                errors.push('missing_price');
            }

            // 4. Freshness check
            const lastUpdated = marketData.lastUpdated ? new Date(marketData.lastUpdated).getTime() : 0;
            if (!lastUpdated) {
                errors.push('missing_last_updated');
            } else if ((Date.now() - lastUpdated) > this._maxAgeMs) {
                errors.push('stale_data');
            }

            // 5. GitHub activity (if project has github_org/githubOrg)
            const ghOrg = _readField(project, 'githubOrg');
            if (ghOrg) {
                // Сохраняем для последующей валидации; не блокируем на этом этапе
                marketData._hasGithub = true;
            }

            const isValid = errors.length === 0;
            return { isValid, data: isValid ? marketData : null, errors };
        }

        /**
         * Batch-валидация: проверяет много проектов параллельно с ограничением concurrency.
         * @param {Object[]} projects
         * @param {Object} [opts]
         * @param {number} [opts.concurrency=5]
         * @returns {Promise<Object[]>} — список {projectId, isValid, data, errors}
         */
        async validateBatch(projects, opts = {}) {
            const concurrency = opts.concurrency || 5;
            const results = [];
            for (let i = 0; i < projects.length; i += concurrency) {
                const chunk = projects.slice(i, i + concurrency);
                const chunkResults = await Promise.all(
                    chunk.map(async (p) => {
                        const r = await this.validateProject(p);
                        return { projectId: p.id, ticker: p.ticker, ...r };
                    })
                );
                results.push(...chunkResults);
            }
            return results;
        }

        async _fetchWithCache(source, key, fetcher) {
            if (this.cache) {
                const cacheKey = `market:${source}:${key}`;
                const cached = await this.cache.get(cacheKey);
                if (cached) return cached;
                const fresh = await fetcher();
                if (fresh) {
                    await this.cache.set(cacheKey, fresh, this._maxAgeMs);
                }
                return fresh;
            }
            return fetcher();
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.MarketDataValidationService = MarketDataValidationService;

})(window);
