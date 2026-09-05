/* =================================================================
   PAYD Finance — ReportService
   ================================================================= */

(function (global) {
    'use strict';

    class ReportService {
        constructor(deps = {}) {
            if (!deps.reportRepository) {
                throw new Error('[ReportService] reportRepository is required');
            }
            if (!deps.projectRepository) {
                throw new Error('[ReportService] projectRepository is required');
            }
            if (!deps.scoreRepository) {
                throw new Error('[ReportService] scoreRepository is required');
            }
            this.reports = deps.reportRepository;
            this.projects = deps.projectRepository;
            this.scores = deps.scoreRepository;
        }

        async getAllReports() {
            return this.reports.getAll();
        }

        async getLatestWeekly() {
            return this.reports.getLatestWeekly();
        }

        async generateWeeklyReport() {
            const allProjects = await this.projects.getAll();
            const topMovers = [];

            for (const p of allProjects) {
                const comparison = await this.scores.compareLatestSnapshots(p.id);
                if (comparison.hasComparison && Math.abs(comparison.delta) > 5) {
                    topMovers.push({
                        project: p,
                        engine: comparison.current.engine,
                        value: comparison.current.value,
                        delta: comparison.delta,
                    });
                }
            }

            topMovers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

            const report = {
                id: `weekly_${Date.now()}`,
                type: 'weekly',
                title: `Weekly Intelligence Report — ${new Date().toISOString().slice(0, 10)}`,
                summary: `${allProjects.length} projects tracked, ${topMovers.length} significant moves.`,
                topMovers: topMovers.slice(0, 20),
                created_at: new Date().toISOString(),
            };

            await this.reports.save(report);
            return report;
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.ReportService = ReportService;

})(window);
