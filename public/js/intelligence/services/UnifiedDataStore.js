/* =================================================================
   PAYD Finance — UnifiedDataStore
   Единая точка доступа ко всем верифицированным данным.
   Frontend читает ТОЛЬКО через этот store.
   Каждое значение — verified-обёртка с source/timestamp.
   Background sync с разными интервалами.
   ================================================================= */

(function (global) {
    'use strict';

    const DataModel = global.PAYD_INTEL.DataModel;
    const ServiceBase = global.PAYD_INTEL.ServiceBase;
    const CacheManager = global.PAYD_INTEL.CacheManager;
    const FallbackManager = global.PAYD_INTEL.FallbackManager;
    const DataValidator = global.PAYD_INTEL.DataValidator;

    // Helper: имя engine -> имя класса
    function engineClassName(name) {
        const map = {
            payd: 'PaydScoreEngine',
            conviction: 'PaydConvictionEngine',
            alpha: 'PaydAlphaEngine',
            discovery: 'PaydDiscoveryEngine',
        };
        return map[name] || null;
    }

    const SYNC_INTERVALS = {
        market:    5 * 60 * 1000,
        defi:      60 * 60 * 1000,
        unlocks:   24 * 60 * 60 * 1000,
        github:    60 * 60 * 1000,
        news:      15 * 60 * 1000,
        research:  6 * 60 * 60 * 1000,
    };

    class UnifiedDataStore {
        constructor(config = {}) {
            this.cache = config.cache || new CacheManager();
            this.fallback = config.fallback || new FallbackManager();
            this.services = config.services || {};
            this.fallback.services = this.services;
            this._syncTimers = {};
            this._syncStatus = {
                market: { lastSync: null, inProgress: false, error: null },
                defi: { lastSync: null, inProgress: false, error: null },
                unlocks: { lastSync: null, inProgress: false, error: null },
                github: { lastSync: null, inProgress: false, error: null },
                news: { lastSync: null, inProgress: false, error: null },
            };
        }

        /**
         * Зарегистрировать сервис.
         */
        registerService(name, instance) {
            this.services[name] = instance;
            this.fallback.services = this.services;
        }

        /**
         * Загрузить проект — собрать данные из всех источников.
         * @param {Object} projectMeta — { coinId, symbol, defillamaSlug, github: {owner, repo} }
         * @returns {Promise<Object>} — ProjectModel со всеми verified-значениями
         */
        async loadProject(projectMeta) {
            const project = new DataModel.ProjectModel(projectMeta.coinId || projectMeta.symbol);
            project.name = projectMeta.name || projectMeta.coinId;
            project.ticker = projectMeta.symbol || projectMeta.ticker;
            project.category = projectMeta.category || null;
            project.sector = projectMeta.sector || null;
            project.logo = projectMeta.logo || null;
            project.chains = projectMeta.chains || [];

            // Market
            if (projectMeta.coinId || projectMeta.symbol) {
                const marketData = await this.fallback.fetchCategory('market', {
                    coinId: projectMeta.coinId,
                    symbol: projectMeta.symbol,
                });
                project.market = marketData;
            }

            // DeFi
            if (projectMeta.defillamaSlug) {
                const defiData = await this.fallback.fetchCategory('defi', { slug: projectMeta.defillamaSlug });
                project.defi = defiData;
            }

            // Unlocks
            if (projectMeta.symbol) {
                const unlocksData = await this.fallback.fetchCategory('unlocks', { symbol: projectMeta.symbol });
                project.unlocks = unlocksData;
            }

            // GitHub
            if (projectMeta.github && projectMeta.github.owner && projectMeta.github.repo) {
                const ghData = await this.fallback.fetchCategory('github', {
                    owner: projectMeta.github.owner,
                    repo: projectMeta.github.repo,
                });
                project.development = ghData;
            }

            // Валидация
            const validation = DataValidator.validateProject(project);
            project._validation = validation;

            // Все 4 scores вычисляются независимо
            const allScores = await this.calculateAllScores(project, { saveToDb: false });
            project._scores = allScores;

            // Backward compat — paidScore = Payd Score
            project.paidScore = allScores.payd;

            return project;
        }

        /**
         * Вычислить все 4 scores для проекта через ScoringEngineRegistry.
         * Каждый engine — полностью изолирован и принимает только verified-данные.
         * @param {Object} project
         * @param {Object} [options] — { history, saveToDb, runId, trigger }
         * @returns {Promise<{payd, conviction, alpha, discovery}>}
         */
        async calculateAllScores(project, options = {}) {
            const projectId = project.id || project.coinId || project.symbol;
            const history = options.history || this._loadScoreHistory(projectId);

            const context = {
                history,
                scores: {}, // будет заполнен по мере расчёта
            };

            // Payd — независим
            const payd = this._runEngine('payd', project, context);
            // Conviction — независим
            const conviction = this._runEngine('conviction', project, context);
            // Alpha — независим
            const alpha = this._runEngine('alpha', project, context);

            // Discovery — зависит от payd/alpha (читает scores)
            const [paydR, convictionR, alphaR] = await Promise.all([payd, conviction, alpha]);
            context.scores = { payd: paydR, conviction: convictionR, alpha: alphaR };
            const discovery = await this._runEngine('discovery', project, context);

            const scores = { payd: paydR, conviction: convictionR, alpha: alphaR, discovery };

            // Сохранение в IntelligenceDatabase
            if (options.saveToDb !== false && projectId && global.PAYD_INTEL.IntelligenceDatabase) {
                const db = global.PAYD_INTEL.database;
                if (db && typeof db.addScoreSnapshots === 'function') {
                    db.addScoreSnapshots(projectId, scores, {
                        runId: options.runId || null,
                        trigger: options.trigger || 'loadProject',
                    });
                }
            }

            return scores;
        }

        /**
         * Запуск одного engine.
         */
        async _runEngine(name, project, context) {
            const engine = global.PAYD_INTEL[engineClassName(name)];
            if (!engine) {
                return { engine: name, value: null, error: 'engine_not_loaded' };
            }
            try {
                const instance = (engine.prototype && engine.prototype.calculate)
                    ? new engine()
                    : null;
                if (!instance) return { engine: name, value: null, error: 'invalid_engine' };
                return instance.calculate(project, context);
            } catch (e) {
                console.error(`[UnifiedDataStore] Engine ${name} failed:`, e);
                return { engine: name, value: null, error: e.message, timestamp: Date.now() };
            }
        }

        /**
         * Получить историю score'ов проекта.
         * @param {string} projectId
         * @param {string} [engineName] — если null, вернёт для всех engines
         */
        getScoreHistory(projectId, engineName = null) {
            const db = global.PAYD_INTEL.database;
            if (!db) return [];
            return db.getScoreHistory(projectId, engineName);
        }

        /**
         * Получить все последние scores проекта.
         */
        getLatestScores(projectId) {
            const db = global.PAYD_INTEL.database;
            if (!db) return {};
            return db.getLatestScores(projectId);
        }

        /**
         * Загрузить историю scores из DB.
         * @private
         */
        _loadScoreHistory(projectId) {
            if (!projectId) return [];
            const db = global.PAYD_INTEL.database;
            if (!db) return [];
            const engines = ['payd', 'conviction', 'alpha'];
            const allHistory = [];
            for (const engine of engines) {
                const series = db.getScoreHistory(projectId, engine, 50);
                for (const r of series) {
                    allHistory.push({
                        timestamp: r.timestamp,
                        scores: { [engine]: { value: r.value, engine: r.engine } },
                        snapshot: null,
                    });
                }
            }
            // Сортируем по timestamp
            allHistory.sort((a, b) => a.timestamp - b.timestamp);
            // Группируем по timestamp (одно и то же время = один snapshot)
            return allHistory;
        }

        /**
         * Batch-загрузка проектов (с ограничением параллелизма).
         */
        async loadProjects(projectMetas, concurrency = 4) {
            const results = [];
            const queue = [...projectMetas];
            const workers = Array.from({ length: concurrency }, async () => {
                while (queue.length > 0) {
                    const meta = queue.shift();
                    if (!meta) break;
                    try {
                        const p = await this.loadProject(meta);
                        results.push(p);
                    } catch (e) {
                        results.push({ id: meta.coinId || meta.symbol, error: e.message });
                    }
                }
            });
            await Promise.all(workers);
            return results;
        }

        /**
         * Получить новости.
         */
        async getNews(force = false) {
            const cached = this.cache.get('news', 'industry', { allowStale: !force });
            if (cached && !force) return cached.data;
            const news = await this.services.news.getIndustryNews();
            this.cache.set('news', 'industry', news);
            this._syncStatus.news.lastSync = Date.now();
            return news;
        }

        /**
         * Запустить фоновую синхронизацию.
         * @param {Array<string>} categories — какие категории синхронизировать
         */
        startBackgroundSync(categories = ['market', 'defi', 'unlocks', 'github', 'news']) {
            this.stopBackgroundSync();
            for (const cat of categories) {
                const interval = SYNC_INTERVALS[cat] || SYNC_INTERVALS.market;
                this._syncTimers[cat] = setInterval(() => {
                    this._syncCategory(cat).catch(err => {
                        this._syncStatus[cat].error = err.message;
                    });
                }, interval);
            }
        }

        stopBackgroundSync() {
            Object.values(this._syncTimers).forEach(t => clearInterval(t));
            this._syncTimers = {};
        }

        async _syncCategory(category) {
            if (this._syncStatus[category].inProgress) return;
            this._syncStatus[category].inProgress = true;
            try {
                switch (category) {
                    case 'news':
                        await this.getNews(true);
                        break;
                    default:
                        // Другие категории — pre-warming не делаем, они on-demand.
                        break;
                }
                this._syncStatus[category].error = null;
            } finally {
                this._syncStatus[category].inProgress = false;
                this._syncStatus[category].lastSync = Date.now();
            }
        }

        /**
         * Payd Score — backward-compat обёртка.
         * Реальный расчёт теперь делает PaydScoreEngine (см. scoring/PaydScoreEngine.js).
         * @param {Object} project
         * @returns {Object} — verified-обёртка
         */
        _computePaidScore(project) {
            const engineClass = global.PAYD_INTEL.PaydScoreEngine;
            if (engineClass) {
                const engine = new engineClass();
                const result = engine.calculate(project, {});
                return DataModel.verified(result, 'payd_score_engine', Date.now());
            }
            // Fallback — если engine не загружен
            return DataModel.verified(0, 'payd_score_fallback', Date.now());
        }

        /**
         * Получить статус синхронизации (для дашборда).
         */
        getSyncStatus() {
            return JSON.parse(JSON.stringify(this._syncStatus));
        }

        /**
         * Получить метрики.
         */
        getMetrics() {
            return {
                cache: this.cache.getMetrics(),
                fallback: this.fallback.getStats(),
                services: Object.entries(this.services).map(([name, svc]) =>
                    svc && svc.getStats ? svc.getStats() : { name, available: false }
                ),
            };
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.UnifiedDataStore = UnifiedDataStore;

})(window);
