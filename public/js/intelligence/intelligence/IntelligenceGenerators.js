/* =================================================================
   PAYD Intelligence — IntelligenceGenerators
   Набор генераторов intelligence-отчётов.
   Каждый генератор читает ТОЛЬКО verified data + scores.
   Никаких выдуманных цифр.
   ================================================================= */

(function (global) {
    'use strict';

    /**
     * Базовый класс генератора.
     */
    class BaseIntelligenceGenerator {
        constructor(config = {}) {
            this.name = config.name || 'BaseGenerator';
            this.historyStore = config.historyStore || null;
        }

        async generate(opts) {
            throw new Error(`${this.name}.generate must be implemented`);
        }

        _saveToHistory(reportType, payload, cycleId) {
            if (!this.historyStore) return;
            this.historyStore.appendReport({
                reportType,
                cycleId,
                generatedAt: new Date().toISOString(),
                payload,
            });
        }
    }

    /**
     * WeeklyIntelligenceGenerator — общий обзор недавних изменений.
     */
    class WeeklyIntelligenceGenerator extends BaseIntelligenceGenerator {
        constructor(config = {}) {
            super({ ...config, name: 'WeeklyIntelligenceGenerator' });
        }

        async generate(opts = {}) {
            const { cycleId, aggregator, scoresByProject = {}, rankingEngine = null } = opts;
            const data = aggregator ? aggregator.getAllData() : {};
            const rankings = rankingEngine ? rankingEngine.getRankings() : null;

            const projects = Object.keys(data);
            const avgPayd = this._avgScore(scoresByProject, 'payd');
            const avgFundamental = this._avgScore(scoresByProject, 'fundamental');
            const avgRisk = this._avgScore(scoresByProject, 'risk');
            const avgOpportunity = this._avgScore(scoresByProject, 'opportunity');

            const report = {
                type: 'weekly_intelligence',
                cycleId,
                generatedAt: new Date().toISOString(),
                summary: {
                    totalProjects: projects.length,
                    avgPaydScore: avgPayd,
                    avgFundamentalScore: avgFundamental,
                    avgRiskScore: avgRisk,
                    avgOpportunityScore: avgOpportunity,
                },
                rankings,
                topPerformers: this._topPerformers(scoresByProject, data, 5),
                worstPerformers: this._worstPerformers(scoresByProject, data, 5),
            };

            this._saveToHistory('weekly_intelligence', report, cycleId);
            return { success: true, items: 1, report };
        }

        _avgScore(scoresByProject, key) {
            const values = [];
            for (const s of Object.values(scoresByProject)) {
                if (s && typeof s[key] === 'number') values.push(s[key]);
            }
            if (values.length === 0) return null;
            return parseFloat((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2));
        }

        _topPerformers(scoresByProject, data, n) {
            return Object.entries(scoresByProject)
                .map(([id, s]) => ({ id, score: s.payd || 0, name: data[id]?.projectName || id }))
                .sort((a, b) => b.score - a.score)
                .slice(0, n);
        }

        _worstPerformers(scoresByProject, data, n) {
            return Object.entries(scoresByProject)
                .map(([id, s]) => ({ id, score: s.payd || 0, name: data[id]?.projectName || id }))
                .filter(x => x.score > 0)
                .sort((a, b) => a.score - b.score)
                .slice(0, n);
        }
    }

    /**
     * OpportunityScanner — топ возможностей по opportunity score.
     */
    class OpportunityScanner extends BaseIntelligenceGenerator {
        constructor(config = {}) {
            super({ ...config, name: 'OpportunityScanner' });
            this.limit = config.limit || 20;
        }

        async generate(opts = {}) {
            const { cycleId, aggregator, scoresByProject = {} } = opts;
            const data = aggregator ? aggregator.getAllData() : {};

            const opportunities = Object.entries(scoresByProject)
                .map(([id, s]) => ({
                    id,
                    name: data[id]?.projectName || id,
                    sector: data[id]?.sector || null,
                    score: s.opportunity || 0,
                    tier: s.opportunity >= 75 ? 'A' : s.opportunity >= 50 ? 'B' : 'C',
                }))
                .filter(x => x.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, this.limit);

            const report = {
                type: 'opportunity_scanner',
                cycleId,
                generatedAt: new Date().toISOString(),
                opportunities,
            };

            this._saveToHistory('opportunity_scanner', report, cycleId);
            return { success: true, items: opportunities.length, report };
        }
    }

    /**
     * TopGainersByFundamentals — топ по фундаментальным метрикам.
     */
    class TopGainersByFundamentals extends BaseIntelligenceGenerator {
        constructor(config = {}) {
            super({ ...config, name: 'TopGainersByFundamentals' });
            this.limit = config.limit || 10;
        }

        async generate(opts = {}) {
            const { cycleId, aggregator, scoresByProject = {} } = opts;
            const data = aggregator ? aggregator.getAllData() : {};

            const items = Object.entries(scoresByProject)
                .map(([id, s]) => {
                    const snap = data[id] || {};
                    return {
                        id,
                        name: snap.projectName || id,
                        score: s.fundamental || 0,
                        tvl: snap.defiData?.tvl || null,
                        revenue: snap.defiData?.revenue24h || null,
                    };
                })
                .filter(x => x.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, this.limit);

            const report = {
                type: 'top_gainers_by_fundamentals',
                cycleId,
                generatedAt: new Date().toISOString(),
                items,
            };
            this._saveToHistory('top_gainers_by_fundamentals', report, cycleId);
            return { success: true, items: items.length, report };
        }
    }

    /**
     * DeveloperGrowthReport — топ по developer activity.
     */
    class DeveloperGrowthReport extends BaseIntelligenceGenerator {
        constructor(config = {}) {
            super({ ...config, name: 'DeveloperGrowthReport' });
            this.limit = config.limit || 10;
        }

        async generate(opts = {}) {
            const { cycleId, aggregator, scoresByProject = {} } = opts;
            const data = aggregator ? aggregator.getAllData() : {};

            const items = Object.entries(scoresByProject)
                .map(([id, s]) => {
                    const snap = data[id] || {};
                    return {
                        id,
                        name: snap.projectName || id,
                        growthScore: s.growth || 0,
                        commits: snap.githubData?.commits30d || 0,
                        contributors: snap.githubData?.contributors30d || 0,
                    };
                })
                .filter(x => x.growthScore > 0)
                .sort((a, b) => b.growthScore - a.growthScore)
                .slice(0, this.limit);

            const report = {
                type: 'developer_growth',
                cycleId,
                generatedAt: new Date().toISOString(),
                items,
            };
            this._saveToHistory('developer_growth', report, cycleId);
            return { success: true, items: items.length, report };
        }
    }

    /**
     * RevenueGrowthReport — топ по росту выручки.
     */
    class RevenueGrowthReport extends BaseIntelligenceGenerator {
        constructor(config = {}) {
            super({ ...config, name: 'RevenueGrowthReport' });
            this.limit = config.limit || 10;
        }

        async generate(opts = {}) {
            const { cycleId, aggregator, scoresByProject = {} } = opts;
            const data = aggregator ? aggregator.getAllData() : {};

            const items = Object.entries(data)
                .map(([id, snap]) => ({
                    id,
                    name: snap.projectName || id,
                    revenue24h: snap.defiData?.revenue24h || 0,
                    fees24h: snap.defiData?.fees24h || 0,
                }))
                .filter(x => x.revenue24h > 0)
                .sort((a, b) => b.revenue24h - a.revenue24h)
                .slice(0, this.limit);

            const report = {
                type: 'revenue_growth',
                cycleId,
                generatedAt: new Date().toISOString(),
                items,
            };
            this._saveToHistory('revenue_growth', report, cycleId);
            return { success: true, items: items.length, report };
        }
    }

    /**
     * GitHubGrowthReport — топ по GitHub активности.
     */
    class GitHubGrowthReport extends BaseIntelligenceGenerator {
        constructor(config = {}) {
            super({ ...config, name: 'GitHubGrowthReport' });
            this.limit = config.limit || 10;
        }

        async generate(opts = {}) {
            const { cycleId, aggregator } = opts;
            const data = aggregator ? aggregator.getAllData() : {};

            const items = Object.entries(data)
                .map(([id, snap]) => ({
                    id,
                    name: snap.projectName || id,
                    stars: snap.githubData?.stars || 0,
                    commits: snap.githubData?.commits30d || 0,
                    contributors: snap.githubData?.contributors30d || 0,
                }))
                .filter(x => x.commits > 0)
                .sort((a, b) => b.commits - a.commits)
                .slice(0, this.limit);

            const report = {
                type: 'github_growth',
                cycleId,
                generatedAt: new Date().toISOString(),
                items,
            };
            this._saveToHistory('github_growth', report, cycleId);
            return { success: true, items: items.length, report };
        }
    }

    /**
     * NewEmergingReport — новые проекты, попавшие в Emerging.
     */
    class NewEmergingReport extends BaseIntelligenceGenerator {
        constructor(config = {}) {
            super({ ...config, name: 'NewEmergingReport' });
        }

        async generate(opts = {}) {
            const { cycleId, rankingEngine } = opts;
            const rankings = rankingEngine ? rankingEngine.getRankings() : null;
            if (!rankings) {
                return { success: false, error: 'no_ranking_engine' };
            }
            const report = {
                type: 'new_emerging',
                cycleId,
                generatedAt: new Date().toISOString(),
                projects: rankings.emerging,
                count: rankings.emerging.length,
            };
            this._saveToHistory('new_emerging', report, cycleId);
            return { success: true, items: rankings.emerging.length, report };
        }
    }

    /**
     * CorePromotionsReport — промоушены в Core.
     */
    class CorePromotionsReport extends BaseIntelligenceGenerator {
        constructor(config = {}) {
            super({ ...config, name: 'CorePromotionsReport' });
        }

        async generate(opts = {}) {
            const { cycleId, rankingEngine, lastCycleMovements = [] } = opts;
            if (!rankingEngine) {
                return { success: false, error: 'no_ranking_engine' };
            }
            const promotions = lastCycleMovements
                .filter(m => m.to === 'core' && m.direction === 'promotion');

            const report = {
                type: 'core_promotions',
                cycleId,
                generatedAt: new Date().toISOString(),
                promotions,
                count: promotions.length,
            };
            this._saveToHistory('core_promotions', report, cycleId);
            return { success: true, items: promotions.length, report };
        }
    }

    /**
     * DemotionsReport — все демишены.
     */
    class DemotionsReport extends BaseIntelligenceGenerator {
        constructor(config = {}) {
            super({ ...config, name: 'DemotionsReport' });
        }

        async generate(opts = {}) {
            const { cycleId, lastCycleMovements = [] } = opts;
            const demotions = lastCycleMovements.filter(m => m.direction === 'demotion');
            const report = {
                type: 'demotions',
                cycleId,
                generatedAt: new Date().toISOString(),
                demotions,
                count: demotions.length,
            };
            this._saveToHistory('demotions', report, cycleId);
            return { success: true, items: demotions.length, report };
        }
    }

    /**
     * SectorLeadersReport — лидеры по секторам.
     */
    class SectorLeadersReport extends BaseIntelligenceGenerator {
        constructor(config = {}) {
            super({ ...config, name: 'SectorLeadersReport' });
            this.limitPerSector = config.limitPerSector || 3;
        }

        async generate(opts = {}) {
            const { cycleId, aggregator, scoresByProject = {} } = opts;
            const data = aggregator ? aggregator.getAllData() : {};

            // Сгруппировать по секторам
            const bySector = {};
            for (const [id, snap] of Object.entries(data)) {
                const sector = snap.sector || 'unknown';
                if (!bySector[sector]) bySector[sector] = [];
                bySector[sector].push({
                    id,
                    name: snap.projectName || id,
                    score: (scoresByProject[id] || {}).payd || 0,
                });
            }

            const leaders = {};
            for (const [sector, list] of Object.entries(bySector)) {
                leaders[sector] = list
                    .filter(x => x.score > 0)
                    .sort((a, b) => b.score - a.score)
                    .slice(0, this.limitPerSector);
            }

            const report = {
                type: 'sector_leaders',
                cycleId,
                generatedAt: new Date().toISOString(),
                leaders,
            };
            this._saveToHistory('sector_leaders', report, cycleId);
            return { success: true, items: Object.keys(leaders).length, report };
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.IntelligenceGenerators = {
        BaseIntelligenceGenerator,
        WeeklyIntelligenceGenerator,
        OpportunityScanner,
        TopGainersByFundamentals,
        DeveloperGrowthReport,
        RevenueGrowthReport,
        GitHubGrowthReport,
        NewEmergingReport,
        CorePromotionsReport,
        DemotionsReport,
        SectorLeadersReport,
    };

})(window);
