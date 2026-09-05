/* =================================================================
   PAYD Finance — DashboardRepository
   ================================================================= */

(function (global) {
    'use strict';

    class DashboardRepository {
        constructor(dataProvider) {
            if (!dataProvider) {
                throw new Error('[DashboardRepository] IDataProvider is required');
            }
            this.provider = dataProvider;
            this.entityName = 'dashboards';
        }

        async get(id) {
            return this.provider.getDashboard(id);
        }

        async save(dashboard) {
            return this.provider.saveDashboard(dashboard);
        }

        async getDefault() {
            return this.provider.findOne('dashboards', { eq: { id: 'default' } });
        }

        async saveDefault(dashboard) {
            return this.provider.saveDashboard({ id: 'default', ...dashboard });
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.DashboardRepository = DashboardRepository;

})(window);
