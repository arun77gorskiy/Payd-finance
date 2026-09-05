/* =================================================================
   PAYD Finance — DiscoveryRepository
   Доступ к discovery_candidates, lifecycle_events, sector_config.
   ================================================================= */

(function (global) {
    'use strict';

    class DiscoveryRepository {
        constructor(dataProvider) {
            if (!dataProvider) {
                throw new Error('[DiscoveryRepository] IDataProvider is required');
            }
            this.provider = dataProvider;
        }

        // -------- Candidates --------

        async getCandidates(status = null) {
            return this.provider.getDiscoveryCandidates(status);
        }

        async getPendingCandidates() {
            return this.provider.getDiscoveryCandidates('pending');
        }

        async getQualifiedCandidates() {
            return this.provider.getDiscoveryCandidates('qualified');
        }

        async saveCandidate(candidate) {
            return this.provider.saveDiscoveryCandidate(candidate);
        }

        async updateCandidateStatus(id, status, meta = {}) {
            return this.provider.updateCandidateStatus(id, status, meta);
        }

        async getCandidateByExternalId(externalId) {
            return this.provider.findOne('discovery_candidates', { eq: { external_id: externalId } });
        }

        // -------- Lifecycle events --------

        async getLifecycleEvents(projectId = null, limit = 50) {
            return this.provider.getLifecycleEvents(projectId, limit);
        }

        async saveLifecycleEvent(event) {
            return this.provider.saveLifecycleEvent(event);
        }

        async getRecentTransitions(days = 30) {
            const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
            return this.provider.query('lifecycle_events', {
                gt: { timestamp: cutoff },
                order: 'timestamp.desc',
            });
        }

        // -------- Sector config --------

        async getSectorConfig() {
            return this.provider.getSectorConfig();
        }

        async getSectorConfigByName(sector) {
            return this.provider.findOne('sector_config', { eq: { sector } });
        }

        async saveSectorConfig(sector) {
            return this.provider.saveSectorConfig(sector);
        }

        async updateSectorConfig(sector, patch) {
            return this.provider.updateSectorConfig(sector, patch);
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.DiscoveryRepository = DiscoveryRepository;

})(window);
