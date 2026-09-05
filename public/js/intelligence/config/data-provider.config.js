/* =================================================================
   PAYD Finance — DataProvider Configuration
   ЕДИНСТВЕННОЕ место, где указывается, какой провайдер активен.
   Чтобы переключить провайдер, достаточно изменить ACTIVE_PROVIDER.
   Остальной код не меняется.
   ================================================================= */

(function (global) {
    'use strict';

    /**
     * Доступные провайдеры:
     *
     * - 'local-json'  → LocalJsonDataProvider (development, testing, MiniMax preview)
     *                   Хранит данные в public/data/*.json файлах.
     *                   Не требует сети, не требует аутентификации.
     *
     * - 'api'         → ApiDataProvider (architecture only, не реализован)
     *                   Для будущих интеграций с CoinGecko, CoinMarketCap,
     *                   GitHub, DefiLlama, Token Unlocks, RSS, OpenAI и др.
     *
     * - 'database'    → DatabaseProvider (architecture only, не реализован)
     *                   Для будущих PostgreSQL, Firebase,
     *                   MongoDB, Neon, PlanetScale и др.
     */
    const ACTIVE_PROVIDER = 'local-json';

    const PROVIDER_CONFIGS = {
        'local-json': {
            dataDir: '/data',          // относительный путь к JSON файлам
            cacheEnabled: true,
            persistOnWrite: true,
            prettyJson: true,
        },
        'api': {
            // Будет настроен при реализации ApiDataProvider
            baseUrl: '',
            timeout: 10000,
        },
        'database': {
            // Будет настроен при реализации DatabaseProvider
            connectionString: '',
            poolSize: 5,
        },
    };

    function getActiveProvider() {
        return ACTIVE_PROVIDER;
    }

    function getProviderConfig(providerName) {
        return PROVIDER_CONFIGS[providerName] || {};
    }

    function listAvailableProviders() {
        return Object.keys(PROVIDER_CONFIGS);
    }

    /**
     * Feature flags для архитектуры.
     */
    const FEATURES = {
        v2Discovery: true,             // PAYD Discovery Engine V2
        v1Fallback: true,              // backward compat с V1
        logProviderEvents: true,      // логировать события провайдера
    };

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.DataProviderConfig = {
        ACTIVE_PROVIDER,
        PROVIDER_CONFIGS,
        FEATURES,
        getActiveProvider,
        getProviderConfig,
        listAvailableProviders,
    };

})(window);
