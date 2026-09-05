/* =================================================================
   PAYD Intelligence — GrowthAnalysisEngine
   Анализ роста проекта: developer activity, GitHub, TVL growth.
   Score: 0-100, где 100 = максимальный рост.
   ================================================================= */

(function (global) {
    'use strict';

    const BaseAnalysisEngine = global.PAYD_INTEL.BaseAnalysisEngine;

    class GrowthAnalysisEngine extends BaseAnalysisEngine {
        constructor(config = {}) {
            super({ ...config, name: 'GrowthAnalysisEngine' });
            this.weights = config.weights || {
                githubCommits: 0.25,
                contributors: 0.20,
                pullRequests: 0.15,
                developerScore: 0.15,
                tvlGrowth: 0.15,
                userGrowth: 0.10,
            };
        }

        _analyzeSnapshot(snapshot, opts) {
            const githubData = snapshot.githubData;
            const defiData = snapshot.defiData;
            const marketData = snapshot.marketData;

            const components = {};
            let totalScore = 0;
            let totalWeight = 0;

            // 1. GitHub commits (30d)
            if (githubData) {
                const commits = this._readNumber(githubData, 'commits30d');
                if (commits !== null) {
                    const score = Math.max(0, Math.min(100, commits * 1.0));
                    components.githubCommits = { value: commits, score };
                    totalScore += score * this.weights.githubCommits;
                    totalWeight += this.weights.githubCommits;
                }
            }

            // 2. Contributors
            if (githubData) {
                const contrib = this._readNumber(githubData, 'contributors30d');
                if (contrib !== null) {
                    const score = Math.max(0, Math.min(100, contrib * 5));
                    components.contributors = { value: contrib, score };
                    totalScore += score * this.weights.contributors;
                    totalWeight += this.weights.contributors;
                }
            }

            // 3. PRs
            if (githubData) {
                const prs = this._readNumber(githubData, 'pullRequests30d');
                if (prs !== null) {
                    const score = Math.max(0, Math.min(100, prs * 2));
                    components.pullRequests = { value: prs, score };
                    totalScore += score * this.weights.pullRequests;
                    totalWeight += this.weights.pullRequests;
                }
            }

            // 4. Developer score
            if (githubData) {
                const ds = this._readNumber(githubData, 'developerScore');
                if (ds !== null) {
                    components.developerScore = { value: ds, score: ds };
                    totalScore += ds * this.weights.developerScore;
                    totalWeight += this.weights.developerScore;
                }
            }

            // 5. TVL growth
            if (defiData) {
                const tvlChg = this._readNumber(defiData, 'tvlChange24h');
                if (tvlChg !== null) {
                    const score = Math.max(0, Math.min(100, 50 + tvlChg * 5));
                    components.tvlGrowth = { value: tvlChg, score };
                    totalScore += score * this.weights.tvlGrowth;
                    totalWeight += this.weights.tvlGrowth;
                }
            }

            // 6. Price change (7d) as proxy for momentum
            if (marketData) {
                const chg = this._readNumber(marketData, 'change7d');
                if (chg !== null) {
                    const score = Math.max(0, Math.min(100, 50 + chg));
                    components.userGrowth = { value: chg, score };
                    totalScore += score * this.weights.userGrowth;
                    totalWeight += this.weights.userGrowth;
                }
            }

            if (totalWeight === 0) return null;

            const finalScore = totalScore / totalWeight;

            return {
                score: parseFloat(finalScore.toFixed(2)),
                components,
                metadata: {
                    assessedAt: new Date().toISOString(),
                    dataAge: snapshot.refreshedAt,
                },
            };
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.GrowthAnalysisEngine = GrowthAnalysisEngine;

})(window);
