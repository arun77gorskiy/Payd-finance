/* =================================================================
   PAYD Finance — DashboardService
   ================================================================= */

(function (global) {
    'use strict';

    class DashboardService {
        constructor(deps = {}) {
            this.dashboards = deps.dashboardRepository;
            this.projects = deps.projectRepository;
            this.scores = deps.scoreRepository;
            this.discovery = deps.discoveryRepository;
        }

        async getDefaultDashboard() {
            if (!this.dashboards) return this._buildDefaultDashboard();
            const existing = await this.dashboards.getDefault();
            if (existing) return existing;
            const built = this._buildDefaultDashboard();
            if (this.dashboards) await this.dashboards.saveDefault(built);
            return built;
        }

        async _buildDefaultDashboard() {
            const counts = await this.projects.getAll().then(list => {
                const c = { emerging: 0, watchlist: 0, core: 0, archive: 0, total: list.length };
                for (const p of list) {
                    const s = p.status || 'core';
                    c[s] = (c[s] || 0) + 1;
                }
                return c;
            });

            const recentEvents = this.discovery
                ? await this.discovery.getRecentTransitions(30)
                : [];

            return {
                id: 'default',
                type: 'dashboard',
                title: 'PAYD Intelligence Dashboard',
                generated_at: new Date().toISOString(),
                summary: counts,
                recentEvents: recentEvents.slice(0, 10),
                widgets: [
                    { id: 'project-counts', title: 'Projects by Status', data: counts },
                    { id: 'recent-transitions', title: 'Recent Lifecycle Transitions', data: recentEvents.slice(0, 5) },
                ],
            };
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.DashboardService = DashboardService;

})(window);
