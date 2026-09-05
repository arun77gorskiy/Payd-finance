/* =================================================================
   PAYD Finance — IDataProvider
   Универсальный интерфейс доступа к данным.
   ВСЕ database-провайдеры (LocalJsonDataProvider, ApiDataProvider,
   DatabaseProvider) ОБЯЗАНЫ реализовать этот контракт.
   Никто выше этого слоя не должен знать о реализации хранения.
   ================================================================= */

(function (global) {
    'use strict';

    /**
     * @typedef {Object} QueryOptions
     * @property {Object<string, any>} [eq]        - условия равенства { column: value }
     * @property {Object<string, any>} [in]        - условия IN { column: [values] }
     * @property {Object<string, any>} [gt]        - условия > { column: value }
     * @property {Object<string, any>} [lt]        - условия < { column: value }
     * @property {Object<string, any>} [contains]  - для JSONB/string contains
     * @property {string} [order]                  - "column.asc" | "column.desc"
     * @property {number} [limit]                  - максимум записей
     * @property {number} [offset]                 - пропустить записей
     * @property {string} [select]                 - список полей через запятую
     */

    /**
     * @typedef {Object} IDataProvider
     * Контракт, который должен реализовать каждый провайдер.
     *
     * Жизненный цикл:
     *   1. const provider = DataProviderFactory.create(config);
     *   2. await provider.connect();        // инициализация
     *   3. await provider.query(...);       // использование
     *   4. await provider.disconnect();    // shutdown
     *
     * Гарантии:
     *   - query() возвращает Promise<Array<Object>>
     *   - insert/update/remove возвращают Promise<{ count: number, ids?: string[] }>
     *   - все методы идемпотентны (повторный вызов безопасен)
     *   - ошибки провайдера бросаются как Error с префиксом [DataProvider:NAME]
     */

    class IDataProvider {
        constructor(config = {}) {
            if (new.target === IDataProvider) {
                throw new Error('[IDataProvider] Cannot instantiate interface directly');
            }
            this.config = config;
            this.name = 'IDataProvider';
            this.connected = false;
        }

        // -------- Lifecycle --------

        async connect() {
            throw new Error('[IDataProvider] connect() not implemented');
        }

        async disconnect() {
            throw new Error('[IDataProvider] disconnect() not implemented');
        }

        isConnected() {
            return this.connected;
        }

        // -------- Generic CRUD --------

        async query(table, options = {}) {
            throw new Error('[IDataProvider] query() not implemented');
        }

        async insert(table, records) {
            throw new Error('[IDataProvider] insert() not implemented');
        }

        async update(table, options, patch) {
            throw new Error('[IDataProvider] update() not implemented');
        }

        async remove(table, options) {
            throw new Error('[IDataProvider] remove() not implemented');
        }

        async count(table, options = {}) {
            const rows = await this.query(table, options);
            return rows.length;
        }

        async findOne(table, options = {}) {
            const rows = await this.query(table, { ...options, limit: 1 });
            return rows.length > 0 ? rows[0] : null;
        }

        async findById(table, id) {
            return this.findOne(table, { eq: { id } });
        }

        // -------- Projects --------

        async getProjects() {
            return this.query('projects');
        }

        async getProject(id) {
            return this.findById('projects', id);
        }

        async saveProject(project) {
            return this.insert('projects', project);
        }

        async updateProject(id, patch) {
            return this.update('projects', { eq: { id } }, patch);
        }

        async searchProjects(criteria = {}) {
            const options = {};
            if (criteria.status) options.eq = { ...(options.eq || {}), status: criteria.status };
            if (criteria.sector) options.eq = { ...(options.eq || {}), sector: criteria.sector };
            if (criteria.query) {
                // naive search: provider should support contains
                options.contains = { name: criteria.query };
            }
            if (criteria.order) options.order = criteria.order;
            if (criteria.limit) options.limit = criteria.limit;
            return this.query('projects', options);
        }

        async archiveProject(id) {
            return this.update('projects', { eq: { id } }, {
                status: 'archive',
                archived_at: Date.now(),
            });
        }

        async restoreProject(id) {
            return this.update('projects', { eq: { id } }, {
                status: 'watchlist',
                archived_at: null,
            });
        }

        // -------- Scores --------

        async getScores(projectId = null) {
            const options = projectId ? { eq: { project_id: projectId } } : {};
            options.order = 'timestamp.desc';
            return this.query('score_history', options);
        }

        async saveScore(scoreRecord) {
            return this.insert('score_history', scoreRecord);
        }

        async getLatestScores(projectId) {
            return this.query('score_history', {
                eq: { project_id: projectId },
                order: 'timestamp.desc',
                limit: 4,
            });
        }

        // -------- Snapshots --------

        async getSnapshots(projectId = null) {
            const options = projectId ? { eq: { project_id: projectId } } : {};
            options.order = 'timestamp.desc';
            return this.query('snapshots', options);
        }

        async saveSnapshot(snapshot) {
            return this.insert('snapshots', snapshot);
        }

        // -------- Market Data --------

        async getMarketData(projectId = null) {
            const options = projectId ? { eq: { project_id: projectId } } : {};
            options.order = 'timestamp.desc';
            return this.query('market_history', options);
        }

        async saveMarketData(record) {
            return this.insert('market_history', record);
        }

        // -------- Reports --------

        async getReports() {
            return this.query('reports', { order: 'created_at.desc' });
        }

        async getReport(id) {
            return this.findById('reports', id);
        }

        async saveReport(report) {
            return this.insert('reports', report);
        }

        async getWeeklyReports() {
            return this.query('reports', {
                eq: { type: 'weekly' },
                order: 'created_at.desc',
            });
        }

        // -------- Dashboards --------

        async getDashboard(id) {
            return this.findById('dashboards', id);
        }

        async saveDashboard(dashboard) {
            return this.insert('dashboards', dashboard);
        }

        // -------- Research --------

        async getResearch() {
            return this.query('research', { order: 'created_at.desc' });
        }

        async getResearchItem(id) {
            return this.findById('research', id);
        }

        async saveResearch(item) {
            return this.insert('research', item);
        }

        // -------- Discovery (V2) --------

        async getDiscoveryCandidates(status = null) {
            const options = status ? { eq: { status } } : {};
            options.order = 'fetched_at.desc';
            return this.query('discovery_candidates', options);
        }

        async saveDiscoveryCandidate(candidate) {
            return this.insert('discovery_candidates', candidate);
        }

        async updateCandidateStatus(id, status, meta = {}) {
            return this.update('discovery_candidates',
                { eq: { id } },
                { status, ...meta, updated_at: Date.now() }
            );
        }

        async getLifecycleEvents(projectId = null, limit = 50) {
            const options = {};
            if (projectId) options.eq = { project_id: projectId };
            options.order = 'timestamp.desc';
            options.limit = limit;
            return this.query('lifecycle_events', options);
        }

        async saveLifecycleEvent(event) {
            return this.insert('lifecycle_events', event);
        }

        async getSectorConfig() {
            return this.query('sector_config');
        }

        async saveSectorConfig(sector) {
            return this.insert('sector_config', sector);
        }

        async updateSectorConfig(sector, patch) {
            return this.update('sector_config', { eq: { sector } }, patch);
        }

        // -------- Generic helpers --------

        async transaction(fn) {
            // Default: just run fn, providers can override for atomicity
            return fn(this);
        }

        getStats() {
            return {
                provider: this.name,
                connected: this.connected,
                config: { ...this.config, secrets: undefined },
            };
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.IDataProvider = IDataProvider;

})(window);
