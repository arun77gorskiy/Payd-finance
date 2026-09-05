/* =================================================================
   PAYD Finance — DiscoveryEngineV2
   Оркестратор V2: discoveryService + qualityFilter + sectorSizeManager + lifecycleManager.
   Не знает о БД напрямую — общается через репозитории.
   ================================================================= */

(function (global) {
    'use strict';

    const BaseEngine = global.PAYD_INTEL.BaseEngine;

    class DiscoveryEngineV2 extends BaseEngine {
        /**
         * @param {Object} deps
         * @param {Object} deps.discoveryService - DiscoveryServiceCore (HTTP)
         * @param {Object} deps.qualityFilter - QualityFilter
         * @param {Object} deps.sectorSizeManager - SectorSizeManager
         * @param {Object} deps.lifecycleManager - ProjectLifecycleManager
         * @param {Object} deps.repositories - { discovery, projects, scores }
         * @param {Object} [config]
         */
        constructor(deps = {}, config = {}) {
            super(config);
            this.name = 'discoveryV2';
            this.label = 'Payd Discovery V2';
            this.description = 'Autonomous project discovery + lifecycle management';
            this.range = [0, 100];
            this.deps = deps;
        }

        /**
         * Главный метод: получить кандидатов → отфильтровать → зачислить.
         */
        async discoverAndIngest(options = {}) {
            const result = {
                fetched: 0,
                added: [],
                rejected: [],
                errors: [],
            };

            // 1. Получить кандидатов (или из кеша, если передан candidates)
            let candidates = options.candidates;
            if (!candidates) {
                try {
                    candidates = await this.deps.discoveryService.fetchCandidates({
                        pages: options.pages || 1,
                        perPage: options.perPage || 50,
                    });
                } catch (e) {
                    result.errors.push({ phase: 'fetch', message: e.message });
                    return result;
                }
            }
            result.fetched = candidates.length;

            // 2. Проверить дедупликацию с БД
            const { discovery, projects } = this.deps.repositories;

            for (const candidate of candidates) {
                try {
                    // Уже есть?
                    const existing = await projects.getById(candidate.external_id);
                    if (existing) {
                        result.rejected.push({ candidate, reason: 'already_tracked' });
                        continue;
                    }

                    // Уже в candidates?
                    const pendingDup = await discovery.getCandidateByExternalId(candidate.external_id);
                    if (pendingDup) {
                        result.rejected.push({ candidate, reason: 'duplicate_candidate' });
                        continue;
                    }

                    // Качество?
                    const qualityCheck = this.deps.qualityFilter.meetsThreshold(candidate);
                    if (!qualityCheck.qualified) {
                        // Save as rejected candidate for analytics
                        await discovery.saveCandidate({
                            ...candidate,
                            id: `cand_${candidate.external_id}_${Date.now()}`,
                            status: 'rejected',
                            rejection_reasons: qualityCheck.reasons || qualityCheck.hardFails,
                            quality_score: qualityCheck.score || 0,
                            fetched_at: Date.now(),
                        });
                        result.rejected.push({
                            candidate,
                            reason: 'quality_filter',
                            details: qualityCheck,
                        });
                        continue;
                    }

                    // Sector size?
                    const sector = this.deps.discoveryService.classifyBySector(candidate);
                    const sectorCheck = await this.deps.sectorSizeManager.canAddToSector(sector, candidate);
                    if (!sectorCheck.allowed) {
                        await discovery.saveCandidate({
                            ...candidate,
                            id: `cand_${candidate.external_id}_${Date.now()}`,
                            sector,
                            status: 'rejected',
                            rejection_reasons: [sectorCheck.message || 'sector_saturated'],
                            quality_score: qualityCheck.score,
                            fetched_at: Date.now(),
                        });
                        result.rejected.push({
                            candidate,
                            reason: 'sector_saturated',
                            details: sectorCheck,
                        });
                        continue;
                    }

                    // ✅ Qualified — добавить как emerging project
                    const newProject = {
                        id: candidate.external_id,
                        ticker: candidate.ticker,
                        name: candidate.name,
                        sector,
                        logo: candidate.image,
                        description: null,
                        status: 'emerging',
                        discovered_at: Date.now(),
                        promoted_at: null,
                        archived_at: null,
                        consecutive_deltas: {},
                        quality_score: qualityCheck.score,
                        metadata: {
                            source: 'coingecko',
                            external_id: candidate.external_id,
                            first_listed_at: candidate.first_listed_at,
                        },
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    };
                    await projects.save(newProject);
                    await discovery.saveCandidate({
                        ...candidate,
                        id: `cand_${candidate.external_id}_${Date.now()}`,
                        sector,
                        status: 'qualified',
                        quality_score: qualityCheck.score,
                        fetched_at: Date.now(),
                    });
                    result.added.push(newProject);

                    // Log lifecycle event
                    await discovery.saveLifecycleEvent({
                        project_id: candidate.external_id,
                        from_status: null,
                        to_status: 'emerging',
                        reason: 'discovered via V2 discovery engine',
                        metrics_snapshot: {
                            qualityScore: qualityCheck.score,
                            sector,
                            source: 'coingecko',
                        },
                        timestamp: Date.now(),
                    });
                } catch (e) {
                    result.errors.push({ candidate: candidate.external_id, message: e.message });
                }
            }

            return result;
        }

        /**
         * Оценить жизненный цикл для одного проекта.
         */
        async evaluateProjectLifecycle(project, scores) {
            return this.deps.lifecycleManager.evaluateProject(project);
        }

        /**
         * Стандартный V1-метод для совместимости — вычисляет opportunity score.
         */
        calculate(project, context = {}) {
            const scores = project._scores || context.scores || {};
            const alpha = scores.alpha || {};
            const payd = scores.payd || {};
            const alphaValue = alpha.value || 0;
            const paydValue = payd.value || 0;
            const opportunityScore = Math.round(0.6 * alphaValue + 0.4 * paydValue);
            return this.buildResult({
                value: opportunityScore,
                range: [0, 100],
                breakdown: { alphaValue, paydValue, opportunityScore },
                factors: [],
                explanation: `V2 composite: ${opportunityScore}`,
                confidence: 'medium',
                confidenceScore: 60,
                sources: ['discoveryV2'],
            });
        }

        getTopOpportunities(projects, limit = 10) {
            return projects
                .map(p => {
                    const scores = p._scores || {};
                    const alpha = (scores.alpha && scores.alpha.value) || 0;
                    const payd = (scores.payd && scores.payd.value) || 0;
                    return {
                        projectId: p.id || p.coinId,
                        ticker: p.ticker,
                        opportunityScore: Math.round(0.6 * alpha + 0.4 * payd),
                    };
                })
                .sort((a, b) => b.opportunityScore - a.opportunityScore)
                .slice(0, limit);
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.DiscoveryEngineV2 = DiscoveryEngineV2;

})(window);
