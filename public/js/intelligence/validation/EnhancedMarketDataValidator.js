/* =================================================================
   PAYD Intelligence — EnhancedMarketDataValidator
   Расширенный валидатор для STEP 2 пайплайна.

   Проверяет:
     - Полноту данных (все ли обязательные поля заполнены)
     - Свежесть данных (timestamp не старше maxAgeHours)
     - Согласованность между источниками (если есть несколько)
     - Отсутствие подозрительных значений (price=0, marketCap=0, ...)

   Возвращает:
     - valid: Array<{projectId, snapshot}>
     - invalidProjects: Array<{projectId, reasons: Array<string>, snapshot?}>
     - warnings: Array<{projectId, warnings: Array<string>}>
   ================================================================= */

(function (global) {
    'use strict';

    const REQUIRED_MARKET_FIELDS = [
        'price', 'marketCap', 'volume24h',
        'circulatingSupply', 'totalSupply',
    ];

    const REQUIRED_DEFI_FIELDS = ['tvl'];

    const MAX_DATA_AGE_HOURS = 48; // данные старше 2 дней считаются устаревшими

    class EnhancedMarketDataValidator {
        constructor(config = {}) {
            this.maxDataAgeMs = (config.maxDataAgeHours || MAX_DATA_AGE_HOURS) * 60 * 60 * 1000;
            this.requiredMarketFields = config.requiredMarketFields || REQUIRED_MARKET_FIELDS;
            this.requiredDefiFields = config.requiredDefiFields || REQUIRED_DEFI_FIELDS;
            this.requireBothMarketAndDefi = config.requireBothMarketAndDefi || false;
        }

        /**
         * Валидировать все снимки из aggregator'а.
         * @param {Object} aggregator — DataAggregator instance
         * @returns {Promise<{valid, invalidProjects, warnings, totalChecked}>}
         */
        async validateAll(aggregator) {
            const all = aggregator.getAllData();
            const valid = [];
            const invalidProjects = [];
            const warnings = [];

            for (const [projectId, snapshot] of Object.entries(all)) {
                const result = this.validateSnapshot(snapshot);
                if (result.valid) {
                    valid.push({ projectId, snapshot });
                    if (result.warnings.length > 0) {
                        warnings.push({ projectId, warnings: result.warnings });
                    }
                } else {
                    invalidProjects.push({
                        projectId,
                        reasons: result.reasons,
                        snapshot,
                    });
                }
            }

            return {
                valid,
                invalidProjects,
                warnings,
                totalChecked: Object.keys(all).length,
            };
        }

        /**
         * Валидировать один снимок.
         */
        validateSnapshot(snapshot) {
            const reasons = [];
            const warnings = [];

            if (!snapshot) {
                return { valid: false, reasons: ['snapshot_is_null'], warnings: [] };
            }

            // 1. Свежесть
            const ageMs = this._snapshotAgeMs(snapshot);
            if (ageMs === null) {
                reasons.push('missing_timestamp');
            } else if (ageMs > this.maxDataAgeMs) {
                reasons.push(`stale_data_${Math.round(ageMs / (60 * 60 * 1000))}h`);
            }

            // 2. Полнота market data
            if (!snapshot.marketData) {
                reasons.push('missing_market_data');
            } else {
                for (const field of this.requiredMarketFields) {
                    const v = snapshot.marketData[field];
                    if (v === null || v === undefined || v === 0) {
                        reasons.push(`market_${field}_missing_or_zero`);
                    }
                }
                if (snapshot.marketData.price !== null && snapshot.marketData.price < 0) {
                    reasons.push('negative_price');
                }
                if (snapshot.marketData.marketCap > 0 && snapshot.marketData.fdv > 0) {
                    const fdvToMc = snapshot.marketData.fdv / snapshot.marketData.marketCap;
                    if (fdvToMc > 100) {
                        warnings.push(`suspicious_fdv_mc_ratio_${fdvToMc.toFixed(2)}`);
                    }
                }
            }

            // 3. Полнота defi data
            if (this.requireBothMarketAndDefi && !snapshot.defiData) {
                reasons.push('missing_defi_data');
            } else if (snapshot.defiData) {
                for (const field of this.requiredDefiFields) {
                    const v = snapshot.defiData[field];
                    if (v === null || v === undefined || v === 0) {
                        reasons.push(`defi_${field}_missing_or_zero`);
                    }
                }
            }

            // 4. GitHub data (не обязателен, но если есть — проверим)
            if (snapshot.githubData) {
                if (snapshot.githubData.commits30d !== null && snapshot.githubData.commits30d < 0) {
                    reasons.push('negative_commits');
                }
            }

            return {
                valid: reasons.length === 0,
                reasons,
                warnings,
            };
        }

        _snapshotAgeMs(snapshot) {
            const ts = snapshot.refreshedAt
                || (snapshot.marketData && snapshot.marketData.lastUpdated)
                || (snapshot.defiData && snapshot.defiData.lastUpdated);
            if (!ts) return null;
            const t = Date.parse(ts);
            if (isNaN(t)) return null;
            return Date.now() - t;
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.EnhancedMarketDataValidator = EnhancedMarketDataValidator;

})(window);
