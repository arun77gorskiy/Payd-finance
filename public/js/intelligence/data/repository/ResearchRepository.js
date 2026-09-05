/* =================================================================
   PAYD Finance — ResearchRepository
   ================================================================= */

(function (global) {
    'use strict';

    class ResearchRepository {
        constructor(dataProvider) {
            if (!dataProvider) {
                throw new Error('[ResearchRepository] IDataProvider is required');
            }
            this.provider = dataProvider;
            this.entityName = 'research';
        }

        async getAll() {
            return this.provider.getResearch();
        }

        async getById(id) {
            return this.provider.getResearchItem(id);
        }

        async save(item) {
            return this.provider.saveResearch(item);
        }

        async getByProject(projectId) {
            return this.provider.query('research', { eq: { project_id: projectId } });
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.ResearchRepository = ResearchRepository;

})(window);
