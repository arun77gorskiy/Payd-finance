/* =================================================================
   PAYD Finance — FallbackManager (v2)
   Управляет fallback-цепочками между провайдерами.
   3-уровневая логика:
     Level 1: Primary (CoinGecko) — confidence=high
     Level 2: Secondary (CoinMarketCap) — confidence=medium
     Level 3: Tertiary (DefiLlama / docs) — confidence=low
   При отсутствии данных у ВСЕХ источников — Data unavailable.
   Discrepancies между провайдерами логируются для анализа.
   ================================================================= */

(function (global) {
    'use strict';

    const DataModel = global.PAYD_INTEL.DataModel;

    /**
     * Цепочки fallback для каждой категории.
     * Каждый уровень — это провайдер, который будет опрошен.
     */
    const FALLBACK_CHAINS = {
        market: {
            levels: [
                { provider: 'coingecko',     level: 1, confidence: 'high' },
                { provider: 'coinmarketcap', level: 2, confidence: 'medium' },
                { provider: 'defillama',     level: 3, confidence: 'low' },
            ],
            fields: [
                'price', 'marketCap', 'fdv', 'circulatingSupply', 'totalSupply',
                'maxSupply', 'volume24h', 'change24h', 'change7d', 'change30d',
                'rank', 'ath', 'atl', 'lastUpdated',
            ],
            // DefiLlama не предоставляет эти поля, поэтому tertiary их не покрывает
            tertiarySupport: {
                price: false, marketCap: false, fdv: false,
                circulatingSupply: false, totalSupply: false, maxSupply: false,
                volume24h: false, change24h: false, change7d: false, change30d: false,
                rank: false, ath: false, atl: false, lastUpdated: false,
            },
        },
        defi: {
            levels: [
                { provider: 'defillama', level: 1, confidence: 'high' },
            ],
            fields: ['tvl', 'revenue', 'fees', 'protocolIncome', 'dexVolume', 'chains', 'protocolCategory', 'historicalTvl'],
        },
        unlocks: {
            levels: [
                { provider: 'tokenunlocks', level: 1, confidence: 'high' },
            ],
            fields: ['upcoming', 'calendar', 'unlockedPct', 'lockedSupply', 'nextUnlockDate', 'nextUnlockAmount',
                     'investorUnlocks', 'teamUnlocks', 'treasuryUnlocks', 'riskLevel'],
        },
        github: {
            levels: [
                { provider: 'github', level: 1, confidence: 'high' },
            ],
            fields: ['commits', 'pullRequests', 'releases', 'contributors', 'activeDevelopers', 'stars', 'forks', 'issues', 'lastCommitDate', 'developmentTrend', 'repositoryHealth', 'developmentFrequency'],
        },
        news: {
            levels: [
                { provider: 'news', level: 1, confidence: 'high' },
            ],
            fields: ['articles'],
        },
        tokenomics: {
            levels: [
                { provider: 'coingecko',     level: 1, confidence: 'high' },
                { provider: 'coinmarketcap', level: 2, confidence: 'medium' },
            ],
            fields: ['fdv', 'marketCap', 'circulatingSupply', 'totalSupply', 'maxSupply',
                     'inflationRate', 'unlockSchedule', 'allocations'],
        },
    };

    class FallbackManager {
        constructor(services) {
            this.services = services || {};
            this._chainStats = {};
            this._discrepancies = [];
        }

        /**
         * Получает одно поле с 3-уровневой fallback логикой.
         * @param {string} category
         * @param {string} field
         * @param {Object} args
         * @returns {Promise<Object>} — verified-обёртка с confidence
         */
        async fetchField(category, field, args = {}) {
            const chain = FALLBACK_CHAINS[category];
            if (!chain) {
                return DataModel.missing('none', 'unknown_category');
            }

            const collectedValues = [];
            let lastError = null;

            for (const levelInfo of chain.levels) {
                // Tertiary-провайдер может не поддерживать конкретное поле
                if (levelInfo.level === 3 && chain.tertiarySupport && chain.tertiarySupport[field] === false) {
                    continue;
                }

                const providerName = levelInfo.provider;
                const svc = this.services[providerName];

                if (!svc || !svc.enabled || typeof svc.getField !== 'function') {
                    this._recordStat(category, field, providerName, 'skipped');
                    continue;
                }

                try {
                    const result = await svc.getField(field, { ...args, _level: levelInfo.level });
                    if (result && result.verified && result.value !== null && result.value !== undefined) {
                        const enriched = {
                            ...result,
                            confidence: levelInfo.confidence,
                            confidenceReason: levelInfo.level === 1
                                ? 'primary_provider'
                                : (levelInfo.level === 2 ? 'fallback_secondary' : 'fallback_tertiary'),
                        };
                        collectedValues.push({ provider: providerName, value: result.value, level: levelInfo.level });

                        if (collectedValues.length > 1) {
                            this._logDiscrepancy(category, field, collectedValues);
                        }

                        this._recordStat(category, field, providerName, 'ok');
                        return enriched;
                    }
                } catch (e) {
                    lastError = e;
                    this._recordStat(category, field, providerName, 'error');
                }
            }

            this._recordStat(category, field, 'all', 'missing');
            return DataModel.missing('all', lastError ? lastError.message : 'all_sources_failed');
        }

        /**
         * Получает несколько полей одной категории параллельно.
         */
        async fetchFields(category, fields, args = {}) {
            const results = {};
            await Promise.all(fields.map(async f => {
                results[f] = await this.fetchField(category, f, args);
            }));
            return results;
        }

        /**
         * Получает всю категорию.
         */
        async fetchCategory(category, args = {}) {
            const chain = FALLBACK_CHAINS[category];
            if (!chain) return {};
            return this.fetchFields(category, chain.fields, args);
        }

        /**
         * Получает ВСЕ поля проекта из ВСЕХ категорий.
         * Используется для полного сбора данных перед расчётом Payd Score.
         */
        async fetchAllForProject(projectMeta) {
            const result = {};
            for (const category of Object.keys(FALLBACK_CHAINS)) {
                result[category] = await this.fetchCategory(category, projectMeta);
            }
            return result;
        }

        /**
         * Логирование расхождений между провайдерами.
         * @param {string} category
         * @param {string} field
         * @param {Array} values — [{provider, value, level}]
         */
        _logDiscrepancy(category, field, values) {
            if (values.length < 2) return;
            const numericValues = values.filter(v => typeof v.value === 'number' && Number.isFinite(v.value));
            if (numericValues.length < 2) return;

            const min = Math.min(...numericValues.map(v => v.value));
            const max = Math.max(...numericValues.map(v => v.value));
            const diffPct = min > 0 ? ((max - min) / min) * 100 : 0;

            if (diffPct > 1) {
                const entry = {
                    timestamp: Date.now(),
                    category,
                    field,
                    values: numericValues.map(v => ({ provider: v.provider, value: v.value, level: v.level })),
                    diffPct: Number(diffPct.toFixed(2)),
                    resolution: 'use_primary',
                };
                this._discrepancies.push(entry);
                if (this._discrepancies.length > 1000) {
                    this._discrepancies = this._discrepancies.slice(-500);
                }
            }
        }

        _recordStat(category, field, source, status) {
            const key = category + ':' + field;
            if (!this._chainStats[key]) {
                this._chainStats[key] = {
                    primary_ok: 0, primary_error: 0,
                    secondary_ok: 0, secondary_error: 0,
                    tertiary_ok: 0, tertiary_error: 0,
                    missing: 0,
                };
            }
            const stat = this._chainStats[key];
            if (status === 'ok' && source === 'coingecko') stat.primary_ok++;
            else if (status === 'error' && source === 'coingecko') stat.primary_error++;
            else if (status === 'ok' && source === 'coinmarketcap') stat.secondary_ok++;
            else if (status === 'error' && source === 'coinmarketcap') stat.secondary_error++;
            else if (status === 'ok' && (source === 'defillama' || source === 'docs')) stat.tertiary_ok++;
            else if (status === 'error' && (source === 'defillama' || source === 'docs')) stat.tertiary_error++;
            else if (status === 'missing') stat.missing++;
        }

        getStats() { return JSON.parse(JSON.stringify(this._chainStats)); }

        getDiscrepancies(limit = 50) {
            return this._discrepancies.slice(-limit);
        }

        getChains() { return JSON.parse(JSON.stringify(FALLBACK_CHAINS)); }

        /**
         * Ретрай с другим token-identifier.
         * Используется, когда основной coingeckoId не нашёл проект —
         * пробуем альтернативы (symbol, contract address).
         */
        async retryWithAlternativeIdentifier(category, field, originalArgs, alternatives) {
            for (const alt of alternatives) {
                const result = await this.fetchField(category, field, { ...originalArgs, ...alt });
                if (result.verified && result.value !== null) {
                    return result;
                }
            }
            return DataModel.missing('all', 'no_alternative_identifier_worked');
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.FallbackManager = FallbackManager;

})(window);
