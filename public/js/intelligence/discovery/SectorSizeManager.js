/* =================================================================
   PAYD Finance — SectorSizeManager (V2)
   Динамическое управление размером секторов.
   Использует DiscoveryRepository (не знает о БД).
   ================================================================= */

(function (global) {
    'use strict';

    const BYPASS_THRESHOLD = 85; // qualityScore >= 85 bypasses max limit

    class SectorSizeManager {
        /**
         * @param {Object} deps
         * @param {DiscoveryRepository} deps.discoveryRepository
         * @param {ProjectRepository} deps.projectRepository
         */
        constructor(deps = {}) {
            if (!deps.discoveryRepository) {
                throw new Error('[SectorSizeManager] discoveryRepository is required');
            }
            if (!deps.projectRepository) {
                throw new Error('[SectorSizeManager] projectRepository is required');
            }
            this.discovery = deps.discoveryRepository;
            this.projects = deps.projectRepository;
            this._configCache = null;
            this._cacheTime = 0;
            this.CACHE_TTL = 5 * 60 * 1000; // 5 min
        }

        async _getConfig() {
            const now = Date.now();
            if (this._configCache && (now - this._cacheTime) < this.CACHE_TTL) {
                return this._configCache;
            }
            const config = await this.discovery.getSectorConfig();
            const map = {};
            for (const c of config) {
                map[c.sector] = c;
            }
            this._configCache = map;
            this._cacheTime = now;
            return map;
        }

        async getCurrentSectorCounts() {
            const all = await this.projects.getAll();
            const counts = {};
            for (const p of all) {
                if (p.status === 'archive') continue;
                const sector = p.sector || 'Uncategorized';
                counts[sector] = (counts[sector] || 0) + 1;
            }
            return counts;
        }

        async canAddToSector(sector, candidate) {
            const config = await this._getConfig();
            const sectorCfg = config[sector];
            if (!sectorCfg) {
                return {
                    allowed: true,
                    reason: 'no_config',
                    currentCount: 0,
                    max: Infinity,
                    min: 0,
                };
            }
            const counts = await this.getCurrentSectorCounts();
            const current = counts[sector] || 0;
            const max = sectorCfg.max_projects;
            const min = sectorCfg.min_projects;
            const qualityScore = candidate.quality_score || candidate.qualityScore || 0;

            // bypass for top candidates
            if (qualityScore >= BYPASS_THRESHOLD) {
                return {
                    allowed: true,
                    reason: 'top_candidate_bypass',
                    currentCount: current,
                    max,
                    min,
                    bypass: true,
                };
            }

            if (current >= max) {
                return {
                    allowed: false,
                    reason: 'saturated',
                    currentCount: current,
                    max,
                    min,
                    message: `Sector ${sector} is saturated (${current}/${max})`,
                };
            }

            return {
                allowed: true,
                reason: current < min ? 'under_min' : 'within_limits',
                currentCount: current,
                max,
                min,
            };
        }

        async getExpansionOpportunities() {
            const config = await this._getConfig();
            const counts = await this.getCurrentSectorCounts();
            const opportunities = [];
            for (const [sector, cfg] of Object.entries(config)) {
                const current = counts[sector] || 0;
                if (current < cfg.min_projects) {
                    opportunities.push({
                        sector,
                        current,
                        min: cfg.min_projects,
                        gap: cfg.min_projects - current,
                        priority: cfg.min_projects - current,
                    });
                }
            }
            return opportunities.sort((a, b) => b.priority - a.priority);
        }

        async getContractionTargets() {
            const all = await this.projects.getAll();
            const targets = [];
            for (const p of all) {
                if (p.status === 'archive') continue;
                const qScore = p.quality_score || 0;
                if (qScore < 30) {
                    targets.push({
                        projectId: p.id,
                        name: p.name,
                        sector: p.sector,
                        qualityScore: qScore,
                    });
                }
            }
            return targets.sort((a, b) => a.qualityScore - b.qualityScore);
        }

        async recomputeSectorStats() {
            const config = await this._getConfig();
            const counts = await this.getCurrentSectorCounts();
            for (const [sector, cfg] of Object.entries(config)) {
                await this.discovery.updateSectorConfig(sector, {
                    current_count: counts[sector] || 0,
                    updated_at: new Date().toISOString(),
                });
            }
            this._cacheTime = 0; // invalidate cache
            return { sectors: Object.keys(config), counts };
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.SectorSizeManager = SectorSizeManager;

})(window);
