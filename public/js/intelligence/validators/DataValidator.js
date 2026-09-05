/* =================================================================
   PAYD Finance — DataValidator
   Валидация верифицированных значений.
   Проверяет типы, диапазоны, логические связи.
   НЕ генерирует значений — только отбраковывает подозрительные.
   ================================================================= */

(function (global) {
    'use strict';

    const INT_RANGES = {
        rank: { min: 1, max: 100000 },
        stars: { min: 0, max: 10000000 },
        forks: { min: 0, max: 10000000 },
        contributors: { min: 0, max: 1000000 },
        commits: { min: 0, max: 1000000 },
        pullRequests: { min: 0, max: 1000000 },
        releases: { min: 0, max: 100000 },
        issues: { min: 0, max: 1000000 },
    };

    const PCT_RANGES = {
        change24h: { min: -99.99, max: 9999.99 },
        change7d: { min: -99.99, max: 9999.99 },
        change30d: { min: -99.99, max: 9999.99 },
        unlockedPct: { min: 0, max: 100 },
    };

    /**
     * Проверяет, что значение — корректное число.
     */
    function isValidNumber(v) {
        return typeof v === 'number' && Number.isFinite(v);
    }

    /**
     * Валидирует одно verified-значение.
     * Возвращает { valid, reason }.
     */
    function validateNumeric(verifiedObj, fieldName) {
        if (!verifiedObj || verifiedObj.missing) {
            return { valid: false, reason: 'missing' };
        }
        const v = verifiedObj.value;
        if (v === null || v === undefined) {
            return { valid: false, reason: 'null' };
        }
        if (!isValidNumber(v)) {
            return { valid: false, reason: 'not_a_number' };
        }

        const range = INT_RANGES[fieldName] || PCT_RANGES[fieldName];
        if (range) {
            if (v < range.min || v > range.max) {
                return { valid: false, reason: `out_of_range[${range.min},${range.max}]` };
            }
        }
        return { valid: true, reason: null };
    }

    /**
     * Валидация логических связей между verified-значениями.
     * Например: circulating <= total <= max.
     */
    function validateMarketRelationships(marketObj) {
        const issues = [];
        const c = marketObj.circulatingSupply.value;
        const t = marketObj.totalSupply.value;
        const m = marketObj.maxSupply.value;

        if (isValidNumber(c) && isValidNumber(t) && c > t) {
            issues.push('circulating_supply > total_supply');
        }
        if (isValidNumber(t) && isValidNumber(m) && m > 0 && t > m) {
            issues.push('total_supply > max_supply');
        }
        if (isValidNumber(c) && c < 0) {
            issues.push('negative_circulating_supply');
        }

        // Market cap / FDV соотношение
        const mc = marketObj.marketCap.value;
        const fdv = marketObj.fdv.value;
        if (isValidNumber(mc) && isValidNumber(fdv) && mc > fdv * 1.001) {
            issues.push('market_cap > fdv');
        }
        return { valid: issues.length === 0, issues };
    }

    /**
     * Валидирует всю ProjectModel.
     * Возвращает { valid, score (0-100), issues, validatedFields, totalFields }.
     */
    function validateProject(project) {
        const totalFields = 30;
        let validatedFields = 0;
        const issues = [];

        // Market
        ['price', 'marketCap', 'fdv', 'circulatingSupply', 'totalSupply',
         'volume24h', 'change24h', 'change7d', 'change30d', 'rank',
         'ath', 'atl'].forEach(field => {
            const r = validateNumeric(project.market[field], field);
            if (r.valid) validatedFields++;
            else if (r.reason !== 'missing') issues.push(`market.${field}: ${r.reason}`);
        });

        // DeFi
        ['tvl', 'revenue', 'fees', 'protocolIncome', 'dexVolume'].forEach(field => {
            const r = validateNumeric(project.defi[field], field);
            if (r.valid) validatedFields++;
            else if (r.reason !== 'missing') issues.push(`defi.${field}: ${r.reason}`);
        });

        // Unlocks
        ['unlockedPct', 'lockedSupply', 'nextUnlockAmount'].forEach(field => {
            const r = validateNumeric(project.unlocks[field], field);
            if (r.valid) validatedFields++;
            else if (r.reason !== 'missing') issues.push(`unlocks.${field}: ${r.reason}`);
        });

        // Development
        ['stars', 'forks', 'contributors', 'commits', 'pullRequests', 'releases'].forEach(field => {
            const r = validateNumeric(project.development[field], field);
            if (r.valid) validatedFields++;
            else if (r.reason !== 'missing') issues.push(`development.${field}: ${r.reason}`);
        });

        const marketRel = validateMarketRelationships(project.market);
        if (!marketRel.valid) {
            issues.push(...marketRel.issues);
        }

        const score = Math.round((validatedFields / totalFields) * 100);
        return {
            valid: issues.length === 0,
            score,
            validatedFields,
            totalFields,
            issues,
        };
    }

    /**
     * Помечает подозрительные значения как missing, оставляя чистые.
     * Возвращает копию объекта.
     */
    function sanitizeProject(project) {
        const p = JSON.parse(JSON.stringify(project));
        const allFields = [
            ['market', p.market], ['defi', p.defi],
            ['unlocks', p.unlocks], ['development', p.development],
        ];
        for (const [section, obj] of allFields) {
            for (const key of Object.keys(obj)) {
                if (typeof obj[key] === 'object' && obj[key] !== null) {
                    const r = validateNumeric(obj[key], key);
                    if (!r.valid && r.reason !== 'missing') {
                        obj[key] = global.PAYD_INTEL.DataModel.missing(
                            obj[key].source, 'validation_failed: ' + r.reason
                        );
                    }
                }
            }
        }
        return p;
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.DataValidator = {
        validateNumeric,
        validateMarketRelationships,
        validateProject,
        sanitizeProject,
        isValidNumber,
    };

})(window);
