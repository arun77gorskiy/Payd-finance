/* =================================================================
   PAYD Finance — DiscoveryService (Application Layer)
   Application-layer оркестратор discoveryEngine + repositories.
   Не знает о БД напрямую — общается через репозитории.
   ================================================================= */

(function (global) {
    'use strict';

    class DiscoveryService {
        /**
         * @param {Object} deps
         * @param {DiscoveryRepository} deps.discoveryRepository
         * @param {ProjectRepository} deps.projectRepository
         * @param {ScoreRepository} deps.scoreRepository
         * @param {Object} deps.engine - DiscoveryEngineV2
         */
        constructor(deps = {}) {
            if (!deps.discoveryRepository) {
                throw new Error('[DiscoveryService] discoveryRepository is required');
            }
            if (!deps.projectRepository) {
                throw new Error('[DiscoveryService] projectRepository is required');
            }
            if (!deps.engine) {
                throw new Error('[DiscoveryService] discovery engine is required');
            }
            this.discovery = deps.discoveryRepository;
            this.projects = deps.projectRepository;
            this.scores = deps.scoreRepository;
            this.engine = deps.engine;
        }

        /**
         * Запустить полный discovery-цикл.
         * 1. Получить кандидатов
         * 2. Применить фильтр качества
         * 3. Проверить лимиты секторов
         * 4. Добавить qualified в projects
         */
        async runDiscoveryCycle(options = {}) {
            const result = await this.engine.discoverAndIngest(options);
            return result;
        }

        /**
         * Запустить оценку lifecycle-переходов.
         * 1. Получить все активные проекты
         * 2. Получить их score history
         * 3. Применить правила lifecycle
         * 4. Сохранить transitions в lifecycle_events
         */
        async runLifecycleEvaluation(options = {}) {
            const projects = await this.projects.getAll();
            const transitions = [];
            for (const p of projects) {
                if (p.status === 'archive') continue;
                const scores = await this.scores.getLatestForProject(p.id);
                const decision = await this.engine.evaluateProjectLifecycle(p, scores);
                if (decision && decision.transition) {
                    transitions.push(decision);
                    await this.discovery.saveLifecycleEvent({
                        project_id: p.id,
                        from_status: decision.from,
                        to_status: decision.to,
                        reason: decision.reason,
                        metrics_snapshot: decision.metrics,
                        timestamp: Date.now(),
                    });
                    if (decision.to === 'archive') {
                        await this.projects.archive(p.id);
                    } else {
                        await this.projects.update(p.id, {
                            status: decision.to,
                            quality_score: decision.metrics?.qualityScore,
                            consecutive_deltas: decision.metrics?.consecutiveDeltas,
                        });
                    }
                }
            }
            return { transitions, evaluated: projects.length };
        }

        async getCandidates(status = null) {
            return this.discovery.getCandidates(status);
        }

        async getLifecycleEvents(projectId = null, limit = 50) {
            return this.discovery.getLifecycleEvents(projectId, limit);
        }

        async getRecentTransitions(days = 30) {
            return this.discovery.getRecentTransitions(days);
        }

        async getSectorConfig() {
            return this.discovery.getSectorConfig();
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.DiscoveryServiceApplication = DiscoveryService;

})(window);
