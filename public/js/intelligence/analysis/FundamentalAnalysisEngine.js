/* =================================================================
   PAYD Intelligence — FundamentalAnalysisEngine
   Фундаментальный анализ: TVL, Revenue, Fees, Active Users, Liquidity.
   Score: 0-100, где 100 = самые сильные fundamentals.
   ================================================================= */

(function (global) {
    'use strict';

    const BaseAnalysisEngine = global.PAYD_INTEL.BaseAnalysisEngine;

    class FundamentalAnalysisEngine extends BaseAnalysisEngine {
        constructor(config = {}) {
            super({ ...config, name: 'FundamentalAnalysisEngine' });
            this.weights = config.weights || {
                tvl: 0.30,
                tvlGrowth: 0.15,
                revenue: 0.20,
                fees: 0.10,
                activeUsers: 0.15,
                liquidity: 0.10,
            };
        }

        _analyzeSnapshot(snapshot, opts) {
            const defiData = snapshot.defiData;
            const marketData = snapshot.marketData;

            if (!defiData && !marketData) return null;

            const components = {};
            let totalScore = 0;
            let totalWeight = 0;

            // 1. TVL
            if (defiData) {
                const tvl = this._readNumber(defiData, 'tvl');
                if (tvl !== null) {
                    // $100M+ = 100, $1M = 50
                    const score = Math.max(0, Math.min(100, Math.log10(Math.max(tvl, 1)) * 20));
                    components.tvl = { value: tvl, score };
                    totalScore += score * this.weights.tvl;
                    totalWeight += this.weights.tvl;
                }
            }

            // 2. TVL growth
            if (defiData) {
                const tvlChg = this._readNumber(defiData, 'tvlChange24h');
                if (tvlChg !== null) {
                    // +10% = 100, 0 = 50, -10% = 0
                    const score = Math.max(0, Math.min(100, 50 + tvlChg * 5));
                    components.tvlGrowth = { value: tvlChg, score };
                    totalScore += score * this.weights.tvlGrowth;
                    totalWeight += this.weights.tvlGrowth;
                }
            }

            // 3. Revenue
            if (defiData) {
                const rev = this._readNumber(defiData, 'revenue24h');
                if (rev !== null) {
                    const score = Math.max(0, Math.min(100, Math.log10(Math.max(rev, 1)) * 25));
                    components.revenue = { value: rev, score };
                    totalScore += score * this.weights.revenue;
                    totalWeight += this.weights.revenue;
                }
            }

            // 4. Fees
            if (defiData) {
                const fees = this._readNumber(defiData, 'fees24h');
                if (fees !== null) {
                    const score = Math.max(0, Math.min(100, Math.log10(Math.max(fees, 1)) * 25));
                    components.fees = { value: fees, score };
                    totalScore += score * this.weights.fees;
                    totalWeight += this.weights.fees;
                }
            }

            // 5. Active Users
            if (defiData) {
                const users = this._readNumber(defiData, 'activeUsers24h');
                if (users !== null) {
                    const score = Math.max(0, Math.min(100, Math.log10(Math.max(users, 1)) * 25));
                    components.activeUsers = { value: users, score };
                    totalScore += score * this.weights.activeUsers;
                    totalWeight += this.weights.activeUsers;
                }
            }

            // 6. Liquidity
            if (defiData) {
                const liq = this._readNumber(defiData, 'liquidityUsd');
                if (liq !== null) {
                    const score = Math.max(0, Math.min(100, Math.log10(Math.max(liq, 1)) * 20));
                    components.liquidity = { value: liq, score };
                    totalScore += score * this.weights.liquidity;
                    totalWeight += this.weights.liquidity;
                }
            }

            if (totalWeight === 0) {
                return null;
            }

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
    global.PAYD_INTEL.FundamentalAnalysisEngine = FundamentalAnalysisEngine;

})(window);
