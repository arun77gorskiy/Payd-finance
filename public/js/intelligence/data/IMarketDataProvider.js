/* =================================================================
   PAYD Finance — IMarketDataProvider
   Интерфейс для сбора проверенных рыночных данных.
   Реализации: CoinGeckoMarketDataProvider, CoinMarketCapMarketDataProvider.
   ================================================================= */

(function (global) {
    'use strict';

    /**
     * Интерфейс (duck-typed):
     *   - getMarketData(id): Promise<{
     *       marketCap: number,        // USD
     *       fdv: number,              // USD
     *       price: number,            // USD
     *       volume24h: number,        // USD
     *       circulatingSupply: number,
     *       totalSupply: number,
     *       maxSupply: number | null,
     *       change24h: number | null,
     *       rank: number | null,
     *       lastUpdated: string       // ISO timestamp
     *     } | null>
     */
    const REQUIRED_METHODS = ['getMarketData'];

    function isIMarketDataProvider(obj) {
        if (!obj || typeof obj !== 'object') return false;
        for (const m of REQUIRED_METHODS) {
            if (typeof obj[m] !== 'function') return false;
        }
        return true;
    }

    /**
     * Обёртка над CoinGeckoService, реализующая IMarketDataProvider.
     * Не дублирует логику HTTP, а переиспользует существующий сервис.
     */
    class CoinGeckoMarketDataProvider {
        constructor(coinGeckoService) {
            if (!coinGeckoService) {
                throw new Error('[CoinGeckoMarketDataProvider] coinGeckoService is required');
            }
            this.service = coinGeckoService;
            this.name = 'coingecko';
        }

        async getMarketData(coinId) {
            if (!coinId) return null;
            try {
                const data = await this.service.getProjectMarket(coinId);
                if (!data) return null;
                return {
                    marketCap: data.marketCap || 0,
                    fdv: data.fdv || 0,
                    price: data.price || 0,
                    volume24h: data.volume24h || 0,
                    circulatingSupply: data.circulatingSupply || 0,
                    totalSupply: data.totalSupply || 0,
                    maxSupply: data.maxSupply || null,
                    change24h: data.change24h || null,
                    rank: data.rank || null,
                    lastUpdated: data.lastUpdated || new Date().toISOString(),
                };
            } catch (e) {
                console.error('[CoinGeckoMarketDataProvider] fetch failed:', e);
                return null;
            }
        }
    }

    /**
     * Обёртка над CoinMarketCapService (для будущего использования).
     */
    class CoinMarketCapMarketDataProvider {
        constructor(coinMarketCapService) {
            if (!coinMarketCapService) {
                throw new Error('[CoinMarketCapMarketDataProvider] coinMarketCapService is required');
            }
            this.service = coinMarketCapService;
            this.name = 'coinmarketcap';
        }

        async getMarketData(cmcId) {
            if (!cmcId) return null;
            // Реализация зависит от CoinMarketCapService API.
            // Метод-заглушка: вернуть null, если сервис недоступен.
            try {
                if (typeof this.service.getProjectMarket === 'function') {
                    return await this.service.getProjectMarket(cmcId);
                }
                return null;
            } catch (e) {
                console.error('[CoinMarketCapMarketDataProvider] fetch failed:', e);
                return null;
            }
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.IMarketDataProvider = {
        isIMarketDataProvider,
        CoinGeckoMarketDataProvider,
        CoinMarketCapMarketDataProvider,
    };

})(window);
