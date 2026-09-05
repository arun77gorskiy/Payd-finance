/* =================================================================
   PAYD Finance — CoinGeckoService
   Primary провайдер рыночных данных.
   Endpoint: https://api.coingecko.com/api/v3
   Поддерживает CORS для браузерных запросов.
   ================================================================= */

(function (global) {
    'use strict';

    const ServiceBase = global.PAYD_INTEL.ServiceBase;
    const DataModel = global.PAYD_INTEL.DataModel;

    class CoinGeckoService extends ServiceBase {
        constructor(config = {}) {
            super({
                name: 'coingecko',
                baseUrl: 'https://api.coingecko.com/api/v3',
                cacheTtlMs: 5 * 60 * 1000, // 5 мин
                rateLimit: { requests: 10, perMs: 60 * 1000 }, // 10 req/min для free tier
                ...config,
            });
            this._fieldMap = {
                price: 'current_price',
                marketCap: 'market_cap',
                fdv: 'fully_diluted_valuation',
                circulatingSupply: 'circulating_supply',
                totalSupply: 'total_supply',
                maxSupply: 'max_supply',
                volume24h: 'total_volume',
                change24h: 'price_change_percentage_24h',
                change7d: 'price_change_percentage_7d',
                change30d: 'price_change_percentage_30d',
                ath: 'ath',
                atl: 'atl',
                lastUpdated: 'last_updated',
            };
        }

        /**
         * Получает рыночные данные для одного проекта.
         */
        async getProjectMarket(coinId) {
            const url = `${this.baseUrl}/coins/${encodeURIComponent(coinId)}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`;
            const response = await this.fetch(url);
            if (!response.ok) return null;
            return this._mapMarketData(response.data, coinId);
        }

        /**
         * Получает рыночные данные для нескольких проектов одним запросом.
         */
        async getMarkets(coinIds) {
            if (!Array.isArray(coinIds) || coinIds.length === 0) return {};
            const ids = coinIds.join(',');
            const url = `${this.baseUrl}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids)}&order=market_cap_desc&per_page=${coinIds.length}&page=1&sparkline=false&price_change_percentage=24h,7d,30d`;
            const response = await this.fetch(url);
            if (!response.ok || !Array.isArray(response.data)) return {};
            const result = {};
            for (const item of response.data) {
                result[item.id] = this._mapMarketData(item, item.id);
            }
            return result;
        }

        /**
         * Получает market cap rank.
         */
        async getGlobalMarket() {
            const url = `${this.baseUrl}/global`;
            const response = await this.fetch(url);
            if (!response.ok || !response.data || !response.data.data) return null;
            return response.data.data;
        }

        /**
         * Универсальный метод для FallbackManager.
         */
        async getField(field, args = {}) {
            const { coinId } = args;
            if (!coinId) return DataModel.missing(this.name, 'no_coin_id');
            const market = await this.getProjectMarket(coinId);
            if (!market) return DataModel.missing(this.name, 'fetch_failed');
            const value = market[field];
            if (value === undefined || value === null) {
                return DataModel.missing(this.name, 'field_missing');
            }
            return DataModel.verified(value, this.name);
        }

        _mapMarketData(raw, coinId) {
            const out = { source: this.name, coinId, timestamp: Date.now() };
            for (const [ourField, cgField] of Object.entries(this._fieldMap)) {
                let v = raw[cgField];
                if (v === undefined || v === null) {
                    out[ourField] = DataModel.missing(this.name, 'field_not_in_response');
                } else {
                    out[ourField] = DataModel.verified(v, this.name, raw.last_updated ? new Date(raw.last_updated).getTime() : Date.now());
                }
            }
            if (raw.market_cap_rank !== undefined) {
                out.rank = DataModel.verified(raw.market_cap_rank, this.name);
            }
            return out;
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.CoinGeckoService = CoinGeckoService;

})(window);
