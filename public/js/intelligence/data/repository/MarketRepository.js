/* =================================================================
   PAYD Finance — MarketRepository
   ================================================================= */

(function (global) {
    'use strict';

    class MarketRepository {
        constructor(dataProvider) {
            if (!dataProvider) {
                throw new Error('[MarketRepository] IDataProvider is required');
            }
            this.provider = dataProvider;
            this.entityName = 'market_history';
        }

        async getForProject(projectId) {
            return this.provider.getMarketData(projectId);
        }

        async save(record) {
            return this.provider.saveMarketData(record);
        }

        async getLatest(projectId) {
            const rows = await this.provider.query('market_history', {
                eq: { project_id: projectId },
                order: 'timestamp.desc',
                limit: 1,
            });
            return rows.length > 0 ? rows[0] : null;
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.MarketRepository = MarketRepository;

})(window);
