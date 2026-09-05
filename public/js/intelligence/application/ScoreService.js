/* =================================================================
   PAYD Finance — ScoreService
   Application layer: оркестрация ScoreRepository + engines.
   ================================================================= */

(function (global) {
    'use strict';

    class ScoreService {
        /**
         * @param {Object} deps
         * @param {ScoreRepository} deps.scoreRepository
         * @param {ProjectRepository} deps.projectRepository
         * @param {Object} deps.engines - { payd, conviction, alpha, discovery }
         */
        constructor(deps = {}) {
            if (!deps.scoreRepository) {
                throw new Error('[ScoreService] scoreRepository is required');
            }
            if (!deps.engines) {
                throw new Error('[ScoreService] engines map is required');
            }
            this.scores = deps.scoreRepository;
            this.projects = deps.projectRepository;
            this.engines = deps.engines;
        }

        /**
         * Рассчитать и сохранить все 4 score для проекта.
         */
        async calculateAndSave(project, options = {}) {
            const projectId = project.id || project.coinId || project.symbol;
            const history = await this.scores.getHistory(projectId);
            const context = {
                history,
                allProjects: options.allProjects || [],
            };

            const results = {};
            for (const [engineName, engine] of Object.entries(this.engines)) {
                if (!engine || !engine.calculate) continue;
                try {
                    const res = engine.calculate(project, context);
                    results[engineName] = res;

                    // Сохранить в score_history
                    const record = {
                        project_id: projectId,
                        engine: engineName,
                        value: res.value,
                        breakdown: res.breakdown || {},
                        classification: res.classification || null,
                        explanation: res.explanation || '',
                        confidence: res.confidence || 'medium',
                        confidence_score: res.confidenceScore || 50,
                        sources: res.sources || [],
                        labels: res.labels || null,
                        events: res.events || null,
                        opportunity_score: res.opportunityScore || null,
                        run_id: options.runId || null,
                        trigger: options.trigger || 'manual',
                        timestamp: Date.now(),
                        date: new Date().toISOString(),
                    };
                    await this.scores.save(record);
                } catch (e) {
                    console.error(`[ScoreService] Engine ${engineName} failed for ${projectId}:`, e);
                    results[engineName] = { error: e.message };
                }
            }

            return results;
        }

        async getProjectScores(projectId) {
            return this.scores.getForProject(projectId);
        }

        async getLatestScores(projectId) {
            return this.scores.getLatestForProject(projectId);
        }

        async getScoreHistory(projectId, engineName) {
            return this.scores.getHistory(projectId, engineName);
        }

        async getScoreComparison(projectId) {
            return this.scores.compareLatestSnapshots(projectId);
        }

        async getTopOpportunities(limit = 10) {
            const allScores = await this.scores.provider.query('score_history', {
                eq: { engine: 'discovery' },
                order: 'timestamp.desc',
                limit: 500,
            });

            // dedup by project_id, keep latest
            const byProject = new Map();
            for (const s of allScores) {
                if (!byProject.has(s.project_id)) {
                    byProject.set(s.project_id, s);
                }
            }
            return Array.from(byProject.values())
                .sort((a, b) => (b.opportunity_score || 0) - (a.opportunity_score || 0))
                .slice(0, limit);
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.ScoreService = ScoreService;

})(window);
