/* =================================================================
   PAYD Finance — CoinMarketCapService
   Secondary провайдер рыночных данных.
   Endpoint: https://pro-api.coinmarketcap.com/v1
   Используется ТОЛЬКО если CoinGecko не вернул значение.
   Без API-ключа возвращает graceful degradation.
   ================================================================= */

(function (global) {
    'use strict';

    const ServiceBase = global.PAYD_INTEL.ServiceBase;
    const DataModel = global.PAYD_INTEL.DataModel;

    class CoinMarketCapService extends ServiceBase {
        constructor(config = {}) {
            super({
                name: 'coinmarketcap',
                baseUrl: 'https://pro-api.coinmarketcap.com/v1',
                cacheTtlMs: 5 * 60 * 1000,
                rateLimit: { requests: 30, perMs: 60 * 1000 }, // 30 req/min
                enabled: !!config.apiKey,
                headers: config.apiKey ? { 'X-CMC_PRO_API_KEY': config.apiKey } : {},
                ...config,
            });
            this._fieldMap = {
                price: 'price',
                marketCap: 'market_cap',
                fdv: 'fully_diluted_market_cap',
                circulatingSupply: 'circulating_supply',
                totalSupply: 'total_supply',
                maxSupply: 'max_supply',
                volume24h: 'volume_24h',
                change24h: 'percent_change_24h',
                change7d: 'percent_change_7d',
                change30d: 'percent_change_30d',
                rank: 'cmc_rank',
            };
        }

        /**
         * Получает quotes для одного или нескольких символов.
         */
        async getQuotes(symbols) {
            if (!this.enabled) {
                return DataModel.missing(this.name, 'no_api_key');
            }
            if (!Array.isArray(symbols)) symbols = [symbols];
            const sym = symbols.join(',');
            const url = `${this.baseUrl}/cryptocurrency/quotes/latest?symbol=${encodeURIComponent(sym)}&convert=USD`;
            const response = await this.fetch(url);
            if (!response.ok || !response.data || !response.data.data) return {};
            const result = {};
            for (const [s, item] of Object.entries(response.data.data)) {
                result[s.toLowerCase()] = this._mapQuote(item);
            }
            return result;
        }

        async getProjectMarket(symbol) {
            const quotes = await this.getQuotes([symbol]);
            const data = quotes[symbol.toLowerCase()];
            if (!data) return null;
            return this._mapQuote(data);
        }

        async getField(field, args = {}) {
            if (!this.enabled) {
                return DataModel.missing(this.name, 'no_api_key');
            }
            const symbol = args.symbol || args.coinId;
            if (!symbol) return DataModel.missing(this.name, 'no_symbol');
            const data = await this.getProjectMarket(symbol);
            if (!data) return DataModel.missing(this.name, 'fetch_failed');
            const value = data[field];
            if (value === undefined || value === null || value.missing) {
                return DataModel.missing(this.name, 'field_missing');
            }
            return value;
        }

        _mapQuote(raw) {
            const out = { source: this.name, timestamp: Date.now() };
            const quote = raw.quote && raw.quote.USD ? raw.quote.USD : null;
            const src = quote || raw;
            for (const [ourField, cmcField] of Object.entries(this._fieldMap)) {
                let v = src[cmcField];
                if (v === undefined || v === null) {
                    out[ourField] = DataModel.missing(this.name, 'field_not_in_response');
                } else {
                    const ts = quote && quote.last_updated ? new Date(quote.last_updated).getTime() : Date.now();
                    out[ourField] = DataModel.verified(v, this.name, ts);
                }
            }
            if (raw.symbol) out.ticker = raw.symbol;
            if (raw.name) out.name = raw.name;
            return out;
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.CoinMarketCapService = CoinMarketCapService;

})(window);
