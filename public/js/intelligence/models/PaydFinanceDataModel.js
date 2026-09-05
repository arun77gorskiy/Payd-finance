/* =================================================================
   PAYD Finance — PaydFinanceDataModel
   Единая модель данных платформы.
   Каждое поле содержит: { value, source, timestamp, lastUpdated, confidence, confidenceReason }
   Frontend читает ТОЛЬКО эту модель — провайдеры скрыты.
   ================================================================= */

(function (global) {
    'use strict';

    /**
     * Confidence уровни.
     * - 'high' = primary provider (level 1) returned data
     * - 'medium' = fallback (level 2) returned data
     * - 'low' = tertiary (level 3) returned data
     * - 'none' = no data
     */
    const CONFIDENCE_LEVELS = {
        HIGH: 'high',
        MEDIUM: 'medium',
        LOW: 'low',
        NONE: 'none',
    };

    /**
     * Создаёт "верифицированное значение" — обёртку вокруг любого числа/строки,
     * которая гарантирует наличие источника, временной метки и confidence.
     * AI НИКОГДА не должен создавать значение, у которого нет источника.
     *
     * @param {*} value
     * @param {string} source — provider name
     * @param {number} timestamp
     * @param {string} confidence — 'high' | 'medium' | 'low'
     * @param {string} reason — основа для confidence
     */
    function verified(value, source, timestamp, confidence, reason) {
        const ts = timestamp || Date.now();
        const conf = confidence || CONFIDENCE_LEVELS.MEDIUM;
        return {
            value: value,
            source: source || 'unknown',
            timestamp: ts,
            lastUpdated: new Date(ts).toISOString(),
            verified: true,
            confidence: conf,
            confidenceReason: reason || 'default',
        };
    }

    /**
     * "Пустое" верифицированное значение — не ошибка, но и не данные.
     * Используется, когда источник недоступен, и fallback тоже не сработал.
     * В UI должно отображаться как "Data unavailable".
     */
    function missing(source, reason) {
        return {
            value: null,
            source: source || 'none',
            timestamp: Date.now(),
            lastUpdated: new Date().toISOString(),
            verified: false,
            missing: true,
            confidence: CONFIDENCE_LEVELS.NONE,
            confidenceReason: reason || 'no_data',
        };
    }

    /**
     * Confidence по уровню fallback chain (1=primary, 2=secondary, 3=tertiary).
     */
    function confidenceFromSourceLevel(level) {
        if (level === 1) return CONFIDENCE_LEVELS.HIGH;
        if (level === 2) return CONFIDENCE_LEVELS.MEDIUM;
        if (level === 3) return CONFIDENCE_LEVELS.LOW;
        return CONFIDENCE_LEVELS.NONE;
    }

    /**
     * Token identifiers — уникальная идентификация актива.
     * Многие проекты имеют несколько токенов, поэтому храним
     * все известные идентификаторы.
     */
    class TokenIdentifier {
        constructor(meta = {}) {
            this.coingeckoId = meta.coingeckoId || null;     // напр. "bitcoin"
            this.symbol = meta.symbol || null;                // напр. "BTC"
            this.name = meta.name || null;                    // напр. "Bitcoin"
            this.contractAddress = meta.contractAddress || null; // напр. "0x..."
            this.chain = meta.chain || null;                  // напр. "ethereum"
            this.coinmarketcapId = meta.coinmarketcapId || null; // numeric id
            this.defillamaSlug = meta.defillamaSlug || null;  // напр. "aave"
            this.aliases = Array.isArray(meta.aliases) ? meta.aliases : []; // альтернативные имена для поиска
        }

        hasMinimumIdentification() {
            return !!(this.coingeckoId || this.symbol);
        }
    }

    /**
     * Модель проекта — нормализованное представление одного крипто-проекта.
     * Объединяет данные из всех 6 провайдеров в одну запись.
     */
    class ProjectModel {
        constructor(id) {
            this.id = id;
            this.name = null;
            this.ticker = null;
            this.logo = null;
            this.category = null;
            this.sector = null;
            this.chains = [];

            // Market data (CoinGecko + CoinMarketCap)
            this.market = {
                price: missing('coingecko'),
                marketCap: missing('coingecko'),
                fdv: missing('coingecko'),
                circulatingSupply: missing('coingecko'),
                totalSupply: missing('coingecko'),
                maxSupply: missing('coingecko'),
                volume24h: missing('coingecko'),
                change24h: missing('coingecko'),
                change7d: missing('coingecko'),
                change30d: missing('coingecko'),
                rank: missing('coingecko'),
                ath: missing('coingecko'),
                atl: missing('coingecko'),
                lastUpdated: missing('coingecko'),
            };

            // DeFi metrics (DefiLlama)
            this.defi = {
                tvl: missing('defillama'),
                revenue: missing('defillama'),
                fees: missing('defillama'),
                protocolIncome: missing('defillama'),
                dexVolume: missing('defillama'),
                chains: missing('defillama'),
                protocolCategory: missing('defillama'),
                historicalTvl: missing('defillama'),
            };

            // Unlocks (Token Unlocks)
            this.unlocks = {
                upcoming: missing('tokenunlocks'),
                calendar: missing('tokenunlocks'),
                unlockedPct: missing('tokenunlocks'),
                lockedSupply: missing('tokenunlocks'),
                nextUnlockDate: missing('tokenunlocks'),
                nextUnlockAmount: missing('tokenunlocks'),
                investorUnlocks: missing('tokenunlocks'),
                teamUnlocks: missing('tokenunlocks'),
                treasuryUnlocks: missing('tokenunlocks'),
                riskLevel: missing('tokenunlocks'),
            };

            // Development (GitHub)
            this.development = {
                commits: missing('github'),
                pullRequests: missing('github'),
                releases: missing('github'),
                contributors: missing('github'),
                activeDevelopers: missing('github'),
                stars: missing('github'),
                forks: missing('github'),
                issues: missing('github'),
                lastCommitDate: missing('github'),
                developmentTrend: missing('github'),
            };

            // AI Score (derived from verified data only — never from AI generation)
            this.paidScore = null;
        }
    }

    /**
     * Извлекает "сырое" значение из verified-обёртки.
     * Если verified=false, вернёт fallback.
     */
    function unwrap(verifiedObj, fallback = null) {
        if (!verifiedObj) return fallback;
        if (verifiedObj.missing) return fallback;
        return verifiedObj.value !== null && verifiedObj.value !== undefined
            ? verifiedObj.value
            : fallback;
    }

    /**
     * Форматирует verified-значение для отображения в UI.
     */
    function format(verifiedObj, formatter, fallbackText = '—') {
        const v = unwrap(verifiedObj);
        if (v === null) return fallbackText;
        try { return formatter(v); } catch (e) { return String(v); }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.DataModel = {
        verified: verified,
        missing: missing,
        ProjectModel: ProjectModel,
        TokenIdentifier: TokenIdentifier,
        unwrap: unwrap,
        format: format,
        confidenceFromSourceLevel: confidenceFromSourceLevel,
        CONFIDENCE_LEVELS: CONFIDENCE_LEVELS,
    };

})(window);
