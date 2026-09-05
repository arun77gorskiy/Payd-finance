/* =================================================================
   PAYD Intelligence — PipelineBootstrap
   Инициализирует и связывает все компоненты пайплайна:
     - Scheduler (LocalBrowserScheduler)
     - DataAggregator + источники
     - Validator
     - ReplacementService
     - Scoring Engines
     - RankingEngine
     - IntelligenceGenerators
     - HistoryStore
     - LifecycleLogger
     - UpdateOrchestrator

   После инициализации регистрирует единственный job
   "intelligence-update" с cron "0 9 * * 1,3,5" (Пн/Ср/Пт в 09:00).
   ================================================================= */

(function (global) {
    'use strict';

    const PAYD_INTEL = global.PAYD_INTEL || {};

    /**
     * Загрузка projects.json из дефолтного места.
     * Работает как в браузере (через fetch), так и в Node.js (через fs).
     * Возвращает массив проектов или [] при неудаче.
     */
    function _loadDefaultProjects(log = console) {
        const SOURCE = '/data/projects.json';

        // 1) Браузерная среда — fetch
        if (typeof global.fetch === 'function' && typeof global.localStorage !== 'undefined') {
            return fetch(SOURCE)
                .then(r => {
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    return r.json();
                })
                .then(data => Array.isArray(data) ? data : (data.projects || []))
                .catch(err => {
                    log.warn('[PipelineBootstrap] failed to fetch', SOURCE, err.message);
                    return [];
                });
        }

        // 2) Node.js среда (тесты) — прямой readFile
        try {
            if (typeof require !== 'undefined') {
                const fs = require('fs');
                const path = require('path');
                const candidates = [
                    path.join(process.cwd(), 'data', 'projects.json'),
                    path.join(__dirname, '..', '..', '..', 'data', 'projects.json'),
                    path.join(__dirname, '..', '..', 'data', 'projects.json'),
                ];
                for (const p of candidates) {
                    if (fs.existsSync(p)) {
                        const raw = fs.readFileSync(p, 'utf-8');
                        const data = JSON.parse(raw);
                        const list = Array.isArray(data) ? data : (data.projects || []);
                        log.log?.(`[PipelineBootstrap] loaded ${list.length} projects from ${p}`);
                        return list;
                    }
                }
            }
        } catch (e) {
            log.warn?.('[PipelineBootstrap] Node.js load failed:', e.message);
        }

        return Promise.resolve([]);
    }

    class PipelineBootstrap {
        constructor(config = {}) {
            this.config = config;
            this.scheduler = null;
            this.aggregator = null;
            this.validator = null;
            this.replacementService = null;
            this.lifecycleLogger = null;
            this.historyStore = null;
            this.orchestrator = null;
            this.scoringEngines = {};
            this.rankingEngine = null;
            this.intelligenceGenerators = {};
            this._initialised = false;
            this._projects = null;
        }

        async init() {
            if (this._initialised) {
                return this._buildStatus();
            }

            // 1. HistoryStore (создаём первым — все будут в него писать)
            this.historyStore = new PAYD_INTEL.HistoryStore({
                persistent: this.config.persistent !== false,
            });

            // 2. LifecycleLogger
            this.lifecycleLogger = new PAYD_INTEL.LifecycleLogger({
                persistent: this.config.persistent !== false,
            });

            // 3. Scheduler (LocalBrowserScheduler для текущей версии)
            this.scheduler = new PAYD_INTEL.LocalBrowserScheduler({
                persistent: this.config.persistent !== false,
                tickIntervalMs: this.config.tickIntervalMs || 60000,
            });

            // 4. Разрешаем список проектов.
            // Приоритет:
            //   1) config.projects (явно передан вызывающим кодом)
            //   2) data/projects.json (source of truth) — автозагрузка
            //   3) [] (fallback — пустой universe)
            const projects = await this._resolveProjects();
            this._projects = projects;

            // 4. DataAggregator + источники
            this.aggregator = new PAYD_INTEL.DataAggregator({
                projects,
                concurrency: this.config.concurrency || 5,
            });
            // Регистрируем mock-источник (текущая версия)
            this.aggregator.registerSource(new PAYD_INTEL.MockDataSource({
                name: 'mock-primary',
                enabled: true,
            }));
            // В будущем здесь добавятся REST API клиенты:
            // this.aggregator.registerSource(new RealCoinGeckoProvider({ apiKey: ... }));
            // this.aggregator.registerSource(new RealCoinMarketCapProvider({ apiKey: ... }));
            // ...

            // 5. Validator
            this.validator = new PAYD_INTEL.EnhancedMarketDataValidator({
                maxDataAgeHours: this.config.maxDataAgeHours || 48,
                requireBothMarketAndDefi: false,
            });

            // 6. ReplacementService
            this.replacementService = new PAYD_INTEL.EnhancedProjectReplacementService({
                discoveryCandidates: this.config.discoveryCandidates || [],
                minSectorSize: this.config.minSectorSize || 30,
                lifecycleLogger: this.lifecycleLogger,
                projects,
            });

            // 7. Scoring engines
            this.scoringEngines = {
                RiskAssessmentEngine: new PAYD_INTEL.RiskAssessmentEngine({
                    historyStore: this.historyStore,
                }),
                FundamentalAnalysisEngine: new PAYD_INTEL.FundamentalAnalysisEngine({
                    historyStore: this.historyStore,
                }),
                GrowthAnalysisEngine: new PAYD_INTEL.GrowthAnalysisEngine({
                    historyStore: this.historyStore,
                }),
                OpportunityAnalysisEngine: new PAYD_INTEL.OpportunityAnalysisEngine({
                    historyStore: this.historyStore,
                }),
                InvestmentSummaryEngine: new PAYD_INTEL.InvestmentSummaryEngine({
                    historyStore: this.historyStore,
                    otherEngines: this.scoringEngines, // будет дополнено после создания
                }),
            };
            // Передаём все engines в InvestmentSummaryEngine
            this.scoringEngines.InvestmentSummaryEngine.otherEngines = this.scoringEngines;

            // 8. Ranking Engine
            this.rankingEngine = new PAYD_INTEL.RankingEngine({
                lifecycleLogger: this.lifecycleLogger,
                historyStore: this.historyStore,
            });
            // Инициализируем rankings если есть
            if (this.config.initialRankings) {
                this.rankingEngine.setInitialRankings(this.config.initialRankings);
            }

            // 9. Intelligence Generators
            this.intelligenceGenerators = {
                WeeklyIntelligenceGenerator: new PAYD_INTEL.IntelligenceGenerators.WeeklyIntelligenceGenerator({
                    historyStore: this.historyStore,
                }),
                OpportunityScanner: new PAYD_INTEL.IntelligenceGenerators.OpportunityScanner({
                    historyStore: this.historyStore,
                }),
                TopGainersByFundamentals: new PAYD_INTEL.IntelligenceGenerators.TopGainersByFundamentals({
                    historyStore: this.historyStore,
                }),
                DeveloperGrowthReport: new PAYD_INTEL.IntelligenceGenerators.DeveloperGrowthReport({
                    historyStore: this.historyStore,
                }),
                RevenueGrowthReport: new PAYD_INTEL.IntelligenceGenerators.RevenueGrowthReport({
                    historyStore: this.historyStore,
                }),
                GitHubGrowthReport: new PAYD_INTEL.IntelligenceGenerators.GitHubGrowthReport({
                    historyStore: this.historyStore,
                }),
                NewEmergingReport: new PAYD_INTEL.IntelligenceGenerators.NewEmergingReport({
                    historyStore: this.historyStore,
                }),
                CorePromotionsReport: new PAYD_INTEL.IntelligenceGenerators.CorePromotionsReport({
                    historyStore: this.historyStore,
                }),
                DemotionsReport: new PAYD_INTEL.IntelligenceGenerators.DemotionsReport({
                    historyStore: this.historyStore,
                }),
                SectorLeadersReport: new PAYD_INTEL.IntelligenceGenerators.SectorLeadersReport({
                    historyStore: this.historyStore,
                }),
            };

            // 10. UpdateOrchestrator
            this.orchestrator = new PAYD_INTEL.UpdateOrchestrator({
                scheduler: this.scheduler,
                dataAggregator: this.aggregator,
                validator: this.validator,
                replacementService: this.replacementService,
                scoringEngines: this.scoringEngines,
                rankingEngine: this.rankingEngine,
                intelligenceGenerators: this.intelligenceGenerators,
                historyStore: this.historyStore,
                maxRetries: this.config.maxRetries || 3,
            });

            // 11. Регистрируем cron job
            this.scheduler.registerJob({
                id: 'intelligence-update',
                name: 'Intelligence Update Cycle (Mon/Wed/Fri 09:00 UTC)',
                cron: PAYD_INTEL.IScheduler.STANDARD_CRON.MON_WED_FRI_09,
                timezone: 'UTC',
                handler: (payload, opts) => this._runScheduledCycle(opts),
            });

            this._initialised = true;
            return this._buildStatus();
        }

        async _runScheduledCycle(opts) {
            if (!this.orchestrator) {
                return { success: false, error: 'orchestrator_not_initialised' };
            }
            const projects = this._projects || [];
            this.aggregator.setProjects(projects);
            const result = await this.orchestrator.runCycle({ trigger: opts.trigger || 'scheduled' });
            return result;
        }

        /**
         * Разрешить список проектов.
         * Приоритет: config.projects -> data/projects.json -> []
         * Если config.autoLoadProjects === false — никогда не ходим в сеть/файл.
         */
        async _resolveProjects() {
            if (Array.isArray(this.config.projects) && this.config.projects.length > 0) {
                console.log?.(`[PipelineBootstrap] using ${this.config.projects.length} projects from config`);
                return this.config.projects;
            }
            if (this.config.autoLoadProjects === false) {
                return [];
            }
            const loaded = await _loadDefaultProjects(console);
            if (loaded.length > 0) {
                console.log?.(`[PipelineBootstrap] auto-loaded ${loaded.length} projects from data/projects.json`);
            } else {
                console.warn?.('[PipelineBootstrap] no projects available — universe is empty');
            }
            return loaded;
        }

        /**
         * Запустить цикл обновления вручную (для отладки и UI).
         */
        async runManualCycle() {
            if (!this.orchestrator) {
                await this.init();
            }
            return this.orchestrator.runCycle({ trigger: 'manual' });
        }

        /**
         * Получить текущий статус пайплайна.
         */
        getStatus() {
            return this._buildStatus();
        }

        _buildStatus() {
            return {
                initialised: this._initialised,
                scheduler: this.scheduler ? this.scheduler.listJobs() : [],
                orchestrator: this.orchestrator ? {
                    isRunning: this.orchestrator.isRunning(),
                    currentCycle: this.orchestrator.getCurrentCycle(),
                } : null,
                rankingEngine: this.rankingEngine ? {
                    lastUpdate: this.rankingEngine.getLastUpdate(),
                    rankings: this.rankingEngine.getRankings(),
                } : null,
                history: this.historyStore ? this.historyStore.getStats() : null,
                lifecycle: this.lifecycleLogger ? this.lifecycleLogger.getStats() : null,
            };
        }

        /**
         * Экспортировать всю историю для отправки на будущий backend.
         */
        exportAll() {
            return {
                history: this.historyStore ? this.historyStore.exportAll() : null,
                lifecycle: this.lifecycleLogger ? this.lifecycleLogger.export() : null,
                status: this.getStatus(),
            };
        }
    }

    PAYD_INTEL.PipelineBootstrap = PipelineBootstrap;

})(window);
