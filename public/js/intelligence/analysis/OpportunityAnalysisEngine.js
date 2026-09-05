/* =================================================================
   PAYD Intelligence — OpportunityAnalysisEngine
   Выявление инвестиционных возможностей на основе:
     - Низкий риск + сильный fundamentals
     - Сильный momentum (рост цены + рост TVL)
     - Недооценённость (FDV/MC ratio)
     - Активная разработка
   Score: 0-100, где 100 = лучшая возможность.
   ================================================================= */

(function (global) {
    'use strict';

    const BaseAnalysisEngine = global.PAYD_INTEL.BaseAnalysisEngine;

    class OpportunityAnalysisEngine extends BaseAnalysisEngine {
        constructor(config = {}) {
            super({ ...config, name: 'OpportunityAnalysisEngine' });
            this.weights = config.weights || {
                upside: 0.30,        // потенциал роста
                undervaluation: 0.20,// недооценённость
                momentum: 0.20,      // моментум
                fundamentals: 0.15,  // сильные fundamentals
                development: 0.15,   // активная разработка
            };
        }

        _analyzeSnapshot(snapshot, opts) {
            const marketData = snapshot.marketData;
            const defiData = snapshot.defiData;
            const githubData = snapshot.githubData;

            const components = {};
            let totalScore = 0;
            let totalWeight = 0;

            // 1. Upside — distance from ATH
            if (marketData) {
                const ath = this._readNumber(marketData, 'ath');
                const price = this._readNumber(marketData, 'price');
                if (ath && price && ath > 0) {
                    const dropPct = (1 - price / ath) * 100;
                    // 0% drop = 0 score (нет потенциала), 90% drop = 90 score
                    const score = Math.max(0, Math.min(100, dropPct));
                    components.upside = { value: -dropPct, score };
                    totalScore += score * this.weights.upside;
                    totalWeight += this.weights.upside;
                }
            }

            // 2. Undervaluation — FDV/MC ratio
            if (marketData) {
                const mc = this._readNumber(marketData, 'marketCap');
                const fdv = this._readNumber(marketData, 'fdv');
                if (mc && fdv && mc > 0) {
                    const ratio = fdv / mc;
                    // ratio 1.0 = 0, ratio 3.0 = 100 (высокая недооценённость)
                    const score = Math.max(0, Math.min(100, (ratio - 1) * 50));
                    components.undervaluation = { value: ratio, score };
                    totalScore += score * this.weights.undervaluation;
                    totalWeight += this.weights.undervaluation;
                }
            }

            // 3. Momentum — combination of changes
            if (marketData) {
                const chg7d = this._readNumber(marketData, 'change7d');
                if (chg7d !== null) {
                    const score = Math.max(0, Math.min(100, 50 + chg7d));
                    components.momentum = { value: chg7d, score };
                    totalScore += score * this.weights.momentum;
                    totalWeight += this.weights.momentum;
                }
            }

            // 4. Fundamentals — TVL existence
            if (defiData) {
                const tvl = this._readNumber(defiData, 'tvl');
                if (tvl !== null) {
                    const score = Math.max(0, Math.min(100, Math.log10(Math.max(tvl, 1)) * 20));
                    components.fundamentals = { value: tvl, score };
                    totalScore += score * this.weights.fundamentals;
                    totalWeight += this.weights.fundamentals;
                }
            }

            // 5. Development activity
            if (githubData) {
                const commits = this._readNumber(githubData, 'commits30d');
                if (commits !== null) {
                    const score = Math.max(0, Math.min(100, commits * 1.0));
                    components.development = { value: commits, score };
                    totalScore += score * this.weights.development;
                    totalWeight += this.weights.development;
                }
            }

            if (totalWeight === 0) return null;

            const finalScore = totalScore / totalWeight;
            const tier = finalScore >= 75 ? 'A' : finalScore >= 50 ? 'B' : 'C';

            return {
                score: parseFloat(finalScore.toFixed(2)),
                tier,
                components,
                metadata: {
                    assessedAt: new Date().toISOString(),
                    dataAge: snapshot.refreshedAt,
                },
            };
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.OpportunityAnalysisEngine = OpportunityAnalysisEngine;

})(window);
