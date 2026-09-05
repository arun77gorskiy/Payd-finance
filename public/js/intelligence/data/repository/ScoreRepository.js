/* =================================================================
   PAYD Finance — ScoreRepository
   Единственная точка доступа к score_history.
   Делегирует все операции IDataProvider.
   ================================================================= */

(function (global) {
    'use strict';

    class ScoreRepository {
        /**
         * @param {IDataProvider} dataProvider
         */
        constructor(dataProvider) {
            if (!dataProvider) {
                throw new Error('[ScoreRepository] IDataProvider is required');
            }
            this.provider = dataProvider;
            this.entityName = 'score_history';
        }

        async getForProject(projectId) {
            return this.provider.getScores(projectId);
        }

        async getLatestForProject(projectId) {
            return this.provider.getLatestScores(projectId);
        }

        async save(scoreRecord) {
            return this.provider.saveScore(scoreRecord);
        }

        async getHistory(projectId, engineName = null, limit = 50) {
            const options = { eq: { project_id: projectId }, order: 'timestamp.asc', limit };
            if (engineName) options.eq = { ...options.eq, engine: engineName };
            return this.provider.query('score_history', options);
        }

        async getLatestValue(projectId, engineName) {
            const rows = await this.provider.query('score_history', {
                eq: { project_id: projectId, engine: engineName },
                order: 'timestamp.desc',
                limit: 1,
            });
            return rows.length > 0 ? rows[0] : null;
        }

        async compareLatestSnapshots(projectId) {
            const all = await this.provider.query('score_history', {
                eq: { project_id: projectId },
                order: 'timestamp.desc',
                limit: 2,
            });
            if (all.length < 2) return { hasComparison: false };
            const [current, previous] = all;
            return {
                hasComparison: true,
                current,
                previous,
                delta: (current.value || 0) - (previous.value || 0),
                timeDeltaMs: current.timestamp - previous.timestamp,
            };
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.ScoreRepository = ScoreRepository;

})(window);
