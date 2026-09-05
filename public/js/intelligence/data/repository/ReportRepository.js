/* =================================================================
   PAYD Finance — ReportRepository
   ================================================================= */

(function (global) {
    'use strict';

    class ReportRepository {
        constructor(dataProvider) {
            if (!dataProvider) {
                throw new Error('[ReportRepository] IDataProvider is required');
            }
            this.provider = dataProvider;
            this.entityName = 'reports';
        }

        async getAll() {
            return this.provider.getReports();
        }

        async getById(id) {
            return this.provider.getReport(id);
        }

        async save(report) {
            return this.provider.saveReport(report);
        }

        async getWeekly() {
            return this.provider.getWeeklyReports();
        }

        async getLatestWeekly() {
            const all = await this.provider.getWeeklyReports();
            return all.length > 0 ? all[0] : null;
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.ReportRepository = ReportRepository;

})(window);
