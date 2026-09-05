/* =================================================================
   PAYD Finance — ProjectService
   Application layer: оркестрация ProjectRepository + ScoreRepository.
   Не знает о БД, не знает о провайдере.
   ================================================================= */

(function (global) {
    'use strict';

    class ProjectService {
        /**
         * @param {Object} deps
         * @param {ProjectRepository} deps.projectRepository
         * @param {ScoreRepository} deps.scoreRepository
         * @param {DiscoveryRepository} [deps.discoveryRepository]
         */
        constructor(deps = {}) {
            if (!deps.projectRepository) {
                throw new Error('[ProjectService] projectRepository is required');
            }
            if (!deps.scoreRepository) {
                throw new Error('[ProjectService] scoreRepository is required');
            }
            this.projects = deps.projectRepository;
            this.scores = deps.scoreRepository;
            this.discovery = deps.discoveryRepository || null;
        }

        async getAllProjects() {
            return this.projects.getAll();
        }

        async getProjectWithScores(id) {
            const project = await this.projects.getById(id);
            if (!project) return null;
            const latestScores = await this.scores.getLatestForProject(id);
            return {
                ...project,
                scores: this._groupScoresByEngine(latestScores),
            };
        }

        async getProjectDetail(id) {
            return this.getProjectWithScores(id);
        }

        async getProjectsByStatus(status) {
            return this.projects.getByStatus(status);
        }

        async getProjectsBySector(sector) {
            return this.projects.getBySector(sector);
        }

        async searchProjects(criteria) {
            return this.projects.search(criteria);
        }

        async getRecentlyChanged(limit = 10) {
            const all = await this.projects.getAll();
            return all
                .filter(p => p.promoted_at || p.archived_at || p.discovered_at)
                .sort((a, b) => {
                    const ta = Math.max(a.promoted_at || 0, a.archived_at || 0, a.discovered_at || 0);
                    const tb = Math.max(b.promoted_at || 0, b.archived_at || 0, b.discovered_at || 0);
                    return tb - ta;
                })
                .slice(0, limit);
        }

        async getProjectCount() {
            return this.projects.count();
        }

        async getProjectCountByStatus() {
            const all = await this.projects.getAll();
            const counts = { emerging: 0, watchlist: 0, core: 0, archive: 0 };
            for (const p of all) {
                const s = p.status || 'core';
                counts[s] = (counts[s] || 0) + 1;
            }
            return counts;
        }

        async saveProject(project) {
            return this.projects.save(project);
        }

        async updateProject(id, patch) {
            return this.projects.update(id, patch);
        }

        async archiveProject(id) {
            return this.projects.archive(id);
        }

        async restoreProject(id) {
            return this.projects.restore(id);
        }

        // -------- helpers --------

        _groupScoresByEngine(scoreRecords) {
            const grouped = {};
            for (const r of scoreRecords || []) {
                grouped[r.engine] = {
                    value: r.value,
                    breakdown: r.breakdown,
                    classification: r.classification,
                    confidence: r.confidence,
                    confidenceScore: r.confidence_score,
                    labels: r.labels,
                    events: r.events,
                    timestamp: r.timestamp,
                };
            }
            return grouped;
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.ProjectService = ProjectService;

})(window);
