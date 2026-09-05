/* =================================================================
   PAYD Finance — Data Architecture Bootstrap
   Инициализирует все 6 сервисов-провайдеров, кеш, fallback manager
   и UnifiedDataStore. Делает их доступными через window.PAYD_INTEL.
   ================================================================= */

(function (global) {
    'use strict';

    /**
     * @param {Object} config
     * @param {string} [config.coinmarketcapApiKey]
     * @param {string} [config.githubToken]
     * @param {Array<string>} [config.industryFeeds]
     * @param {Array<string>} [config.syncCategories]
     * @param {boolean} [config.autoStartSync]
     */
    function initDataArchitecture(config = {}) {
        const cache = new global.PAYD_INTEL.CacheManager();
        const fallback = new global.PAYD_INTEL.FallbackManager();

        const services = {
            coingecko: new global.PAYD_INTEL.CoinGeckoService(),
            coinmarketcap: new global.PAYD_INTEL.CoinMarketCapService({
                apiKey: config.coinmarketcapApiKey,
            }),
            defillama: new global.PAYD_INTEL.DefiLlamaService(),
            tokenunlocks: new global.PAYD_INTEL.TokenUnlockService(),
            github: new global.PAYD_INTEL.GitHubService({
                token: config.githubToken,
            }),
            news: new global.PAYD_INTEL.NewsService({
                industryFeeds: config.industryFeeds,
            }),
        };

        fallback.services = services;

        const store = new global.PAYD_INTEL.UnifiedDataStore({
            cache,
            fallback,
            services,
        });

        const research = new global.PAYD_INTEL.ResearchEngine(store);

        // IntelligenceDatabase — localStorage-based, 100% local
        const database = new global.PAYD_INTEL.IntelligenceDatabase();

        // Scoring Engine Registry — 4 независимых scoring engines
        const scoring = new global.PAYD_INTEL.ScoringEngineRegistry();
        if (global.PAYD_INTEL.PaydScoreEngine) {
            scoring.register(new global.PAYD_INTEL.PaydScoreEngine());
        }
        if (global.PAYD_INTEL.PaydConvictionEngine) {
            scoring.register(new global.PAYD_INTEL.PaydConvictionEngine());
        }
        if (global.PAYD_INTEL.PaydAlphaEngine) {
            scoring.register(new global.PAYD_INTEL.PaydAlphaEngine());
        }
        if (global.PAYD_INTEL.PaydDiscoveryEngine) {
            scoring.register(new global.PAYD_INTEL.PaydDiscoveryEngine());
        }

        // IntelligenceScheduler — расписание обновлений Пн/Ср/Пт
        const scheduler = new global.PAYD_INTEL.IntelligenceScheduler({
            store,
            database,
            projects: config.projects || [],
            scheduleHours: config.scheduleHours,        // [9, 9, 9] по умолчанию
            scheduleDays: config.scheduleDays,          // [1, 3, 5] по умолчанию
            updateTypes: config.schedulerUpdateTypes,   // ['market','defi','unlocks','github']
            autoStart: config.autoStartScheduler !== false,
        });

        if (config.autoStartSync !== false) {
            const categories = config.syncCategories || ['news'];
            store.startBackgroundSync(categories);
        }

        const architecture = {
            cache,
            fallback,
            services,
            store,
            research,
            database,
            scheduler,
            scoring,
            version: '2.0.0',
        };

        global.PAYD_INTEL.architecture = architecture;
        global.PAYD_INTEL.store = store;
        global.PAYD_INTEL.research = research;
        global.PAYD_INTEL.services = services;
        global.PAYD_INTEL.database = database;
        global.PAYD_INTEL.scheduler = scheduler;
        global.PAYD_INTEL.scoring = scoring;

        return architecture;
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.initDataArchitecture = initDataArchitecture;

})(window);
