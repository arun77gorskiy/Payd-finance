/* =================================================================
   PAYD Finance — ApiDataProvider (ARCHITECTURE STUB)
   Это ЗАГЛУШКА. Реализация НЕ создана.
   Провайдер предназначен для будущих интеграций с внешними API:
     - CoinGecko
     - CoinMarketCap
     - GitHub
     - DefiLlama
     - Token Unlocks
     - RSS
     - OpenAI
   Когда он будет реализован, остальной код менять НЕ нужно.
   ================================================================= */

(function (global) {
    'use strict';

    const IDataProvider = global.PAYD_INTEL.IDataProvider;

    class ApiDataProvider extends IDataProvider {
        constructor(config = {}) {
            super(config);
            this.name = 'ApiDataProvider';
            this.baseUrl = config.baseUrl || '';
            this.timeout = config.timeout || 10000;
            this._stats = {
                apiCalls: 0,
                errors: 0,
            };
        }

        async connect() {
            // TODO: future — initialize API clients (CoinGecko, CMC, GitHub, etc.)
            this.connected = true;
            return { connected: true, provider: this.name, mode: 'stub' };
        }

        async disconnect() {
            // TODO: future — close persistent connections
            this.connected = false;
            return { disconnected: true };
        }

        _notImplemented(method) {
            throw new Error(
                `[ApiDataProvider] Method "${method}" is not implemented. ` +
                `This is an architecture stub. To enable, set ACTIVE_PROVIDER to 'local-json' ` +
                `or implement ApiDataProvider with integrations: CoinGecko, CoinMarketCap, ` +
                `GitHub, DefiLlama, Token Unlocks, RSS, OpenAI.`
            );
        }

        // -------- Generic CRUD --------

        async query() { this._notImplemented('query'); }
        async insert() { this._notImplemented('insert'); }
        async update() { this._notImplemented('update'); }
        async remove() { this._notImplemented('remove'); }

        getStats() {
            return {
                ...super.getStats(),
                mode: 'stub',
                futureIntegrations: [
                    'CoinGecko',
                    'CoinMarketCap',
                    'GitHub',
                    'DefiLlama',
                    'Token Unlocks',
                    'RSS',
                    'OpenAI',
                ],
            };
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.ApiDataProvider = ApiDataProvider;

})(window);
