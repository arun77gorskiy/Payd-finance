/* =================================================================
   PAYD Finance — ProjectRepository
   Единственная точка доступа к проектам.
   Делегирует все операции IDataProvider.
   Никакой бизнес-логики.
   ================================================================= */

(function (global) {
    'use strict';

    class ProjectRepository {
        /**
         * @param {IDataProvider} dataProvider
         */
        constructor(dataProvider) {
            if (!dataProvider) {
                throw new Error('[ProjectRepository] IDataProvider is required');
            }
            this.provider = dataProvider;
            this.entityName = 'projects';
        }

        async getAll() {
            return this.provider.getProjects();
        }

        async getById(id) {
            return this.provider.getProject(id);
        }

        async getByStatus(status) {
            return this.provider.searchProjects({ status });
        }

        async getBySector(sector) {
            return this.provider.searchProjects({ sector });
        }

        async search(criteria) {
            return this.provider.searchProjects(criteria);
        }

        async save(project) {
            return this.provider.saveProject(project);
        }

        async update(id, patch) {
            return this.provider.updateProject(id, patch);
        }

        async archive(id) {
            return this.provider.archiveProject(id);
        }

        async restore(id) {
            return this.provider.restoreProject(id);
        }

        async exists(id) {
            const p = await this.getById(id);
            return p !== null;
        }

        async count() {
            return this.provider.count('projects');
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.ProjectRepository = ProjectRepository;

})(window);
