/* =================================================================
   PAYD Finance — DefiLlamaService
   DeFi протоколы: TVL, revenue, fees, DEX volume.
   Endpoint: https://api.llama.fi (открытый CORS API, без ключа).
   ================================================================= */

(function (global) {
    'use strict';

    const ServiceBase = global.PAYD_INTEL.ServiceBase;
    const DataModel = global.PAYD_INTEL.DataModel;

    class DefiLlamaService extends ServiceBase {
        constructor(config = {}) {
            super({
                name: 'defillama',
                baseUrl: 'https://api.llama.fi',
                cacheTtlMs: 60 * 60 * 1000, // 1 час
                rateLimit: { requests: 60, perMs: 60 * 1000 },
                ...config,
            });
        }

        /**
         * Получает протокол по slug.
         */
        async getProtocol(slug) {
            const url = `${this.baseUrl}/protocol/${encodeURIComponent(slug)}`;
            const response = await this.fetch(url);
            if (!response.ok) return null;
            return response.data;
        }

        /**
         * Получает TVL для протокола.
         */
        async getProtocolTvl(slug) {
            const data = await this.getProtocol(slug);
            if (!data) return null;
            return this._mapProtocol(data);
        }

        /**
         * Получает все протоколы (список).
         */
        async getProtocols() {
            const url = `${this.baseUrl}/protocols`;
            const response = await this.fetch(url);
            if (!response.ok || !Array.isArray(response.data)) return [];
            return response.data;
        }

        /**
         * Fees & Revenue.
         */
        async getProtocolFees(slug) {
            const url = `${this.baseUrl}/summary/fees/${encodeURIComponent(slug)}?dataType=protocolFee`;
            const response = await this.fetch(url);
            if (!response.ok) return null;
            return response.data;
        }

        /**
         * DEX Volumes.
         */
        async getDexVolumes() {
            const url = `${this.baseUrl}/overview/dexs`;
            const response = await this.fetch(url);
            if (!response.ok || !response.data || !response.data.protocols) return [];
            return response.data.protocols;
        }

        /**
         * Универсальный метод для FallbackManager.
         */
        async getField(field, args = {}) {
            const { slug } = args;
            if (!slug) return DataModel.missing(this.name, 'no_slug');
            const data = await this.getProtocolTvl(slug);
            if (!data) return DataModel.missing(this.name, 'fetch_failed');
            const value = data[field];
            if (!value || value.missing) {
                return DataModel.missing(this.name, 'field_missing');
            }
            return value;
        }

        _mapProtocol(raw) {
            const out = { source: this.name, timestamp: Date.now() };
            const ts = raw.timestamp ? raw.timestamp * 1000 : Date.now();
            if (raw.tvls && typeof raw.tvls === 'object') {
                const current = this._getCurrentTvl(raw);
                if (current !== null) {
                    out.tvl = DataModel.verified(current, this.name, ts);
                } else {
                    out.tvl = DataModel.missing(this.name, 'no_tvl_in_response');
                }
                out.historicalTvl = DataModel.verified(
                    Object.entries(raw.tvls).map(([date, val]) => ({ date, tvl: val })),
                    this.name, ts
                );
            } else {
                out.tvl = DataModel.missing(this.name, 'no_tvls_object');
            }

            if (raw.category) {
                out.protocolCategory = DataModel.verified(raw.category, this.name, ts);
            } else {
                out.protocolCategory = DataModel.missing(this.name, 'no_category');
            }
            if (raw.chains && Array.isArray(raw.chains)) {
                out.chains = DataModel.verified(raw.chains, this.name, ts);
            } else {
                out.chains = DataModel.missing(this.name, 'no_chains');
            }

            // Revenue / fees (если есть)
            if (typeof raw.revenue === 'number') {
                out.revenue = DataModel.verified(raw.revenue, this.name, ts);
            } else {
                out.revenue = DataModel.missing(this.name, 'no_revenue');
            }
            if (typeof raw.fees === 'number') {
                out.fees = DataModel.verified(raw.fees, this.name, ts);
            } else {
                out.fees = DataModel.missing(this.name, 'no_fees');
            }
            out.protocolIncome = DataModel.missing(this.name, 'protocol_income_unavailable');
            out.dexVolume = DataModel.missing(this.name, 'dex_volume_unavailable');
            return out;
        }

        _getCurrentTvl(raw) {
            if (typeof raw.tvl === 'number') return raw.tvl;
            if (raw.tvls) {
                const chains = Object.values(raw.tvls);
                if (chains.length === 0) return null;
                let total = 0;
                for (const v of chains) {
                    if (typeof v === 'number') total += v;
                }
                return total > 0 ? total : null;
            }
            return null;
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.DefiLlamaService = DefiLlamaService;

})(window);
