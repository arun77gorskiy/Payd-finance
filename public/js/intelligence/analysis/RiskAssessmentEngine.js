/* =================================================================
   PAYD Intelligence — RiskAssessmentEngine
   Оценка рисков проекта на основе verified data.
   Учитывает:
     - Концентрация supply (FDV/MC ratio)
     - Волатильность (изменения цены)
     - Ликвидность (volume/MC)
     - Token unlocks (будущие разблокировки)
     - Активность разработки (GitHub commits)
     - Возраст проекта (через unlock schedule)

   Score: 0-100, где 100 = самый безопасный.
   ============================================================== */

(function (global) {
    'use strict';

    const BaseAnalysisEngine = global.PAYD_INTEL.BaseAnalysisEngine;

    class RiskAssessmentEngine extends BaseAnalysisEngine {
        constructor(config = {}) {
            super({ ...config, name: 'RiskAssessmentEngine' });
            this.weights = config.weights || {
                fdvToMcRatio: 0.20,      // ниже = безопаснее
                volatility: 0.20,        // ниже = безопаснее
                liquidity: 0.15,         // выше = безопаснее
                upcomingUnlocks: 0.20,   // меньше разблокировок = безопаснее
                developerActivity: 0.15, // больше = безопаснее
                marketCap: 0.10,         // больше = безопаснее
            };
        }

        _analyzeSnapshot(snapshot, opts) {
            const marketData = snapshot.marketData;
            const defiData = snapshot.defiData;
            const githubData = snapshot.githubData;
            const unlockSchedule = snapshot.unlockSchedule;

            const components = {};
            let totalScore = 0;
            let totalWeight = 0;

            // 1. FDV/MC ratio
            if (marketData) {
                const mc = this._readNumber(marketData, 'marketCap');
                const fdv = this._readNumber(marketData, 'fdv');
                if (mc && fdv && mc > 0) {
                    const ratio = fdv / mc;
                    // ratio 1.0 = score 100, ratio 5.0 = score 0
                    const score = Math.max(0, Math.min(100, 100 - (ratio - 1) * 25));
                    components.fdvToMcRatio = { value: ratio, score };
                    totalScore += score * this.weights.fdvToMcRatio;
                    totalWeight += this.weights.fdvToMcRatio;
                }
            }

            // 2. Волатильность (|change7d|)
            if (marketData) {
                const change7d = this._readNumber(marketData, 'change7d');
                if (change7d !== null) {
                    // 0% = score 100, 50% = score 50, 100%+ = score 0
                    const score = Math.max(0, Math.min(100, 100 - Math.abs(change7d)));
                    components.volatility = { value: change7d, score };
                    totalScore += score * this.weights.volatility;
                    totalWeight += this.weights.volatility;
                }
            }

            // 3. Ликвидность (volume/MC ratio)
            if (marketData) {
                const mc = this._readNumber(marketData, 'marketCap');
                const vol = this._readNumber(marketData, 'volume24h');
                if (mc && vol && mc > 0) {
                    const liqRatio = vol / mc;
                    // 0.05 (5%) = score 100, 0 = score 0
                    const score = Math.max(0, Math.min(100, (liqRatio / 0.05) * 100));
                    components.liquidity = { value: liqRatio, score };
                    totalScore += score * this.weights.liquidity;
                    totalWeight += this.weights.liquidity;
                }
            }

            // 4. Upcoming unlocks
            if (unlockSchedule) {
                const nextUnlockPct = this._readNumber(unlockSchedule, 'nextUnlockPercent');
                if (nextUnlockPct !== null) {
                    // 0% = score 100, 5%+ = score 0
                    const score = Math.max(0, Math.min(100, 100 - nextUnlockPct * 20));
                    components.upcomingUnlocks = { value: nextUnlockPct, score };
                    totalScore += score * this.weights.upcomingUnlocks;
                    totalWeight += this.weights.upcomingUnlocks;
                }
            }

            // 5. Developer activity
            if (githubData) {
                const commits = this._readNumber(githubData, 'commits30d');
                if (commits !== null) {
                    // 0 = score 0, 100+ = score 100
                    const score = Math.max(0, Math.min(100, commits));
                    components.developerActivity = { value: commits, score };
                    totalScore += score * this.weights.developerActivity;
                    totalWeight += this.weights.developerActivity;
                }
            }

            // 6. Market cap (size bonus)
            if (marketData) {
                const mc = this._readNumber(marketData, 'marketCap');
                if (mc !== null) {
                    // $1B+ = 100, $10M = 50, ниже = ниже
                    const score = Math.max(0, Math.min(100, Math.log10(Math.max(mc, 1)) * 20));
                    components.marketCap = { value: mc, score };
                    totalScore += score * this.weights.marketCap;
                    totalWeight += this.weights.marketCap;
                }
            }

            if (totalWeight === 0) {
                return null;
            }

            const finalScore = totalScore / totalWeight;
            const riskLevel = finalScore >= 75 ? 'low' : finalScore >= 50 ? 'medium' : 'high';

            return {
                score: parseFloat(finalScore.toFixed(2)),
                riskLevel,
                components,
                metadata: {
                    assessedAt: new Date().toISOString(),
                    dataAge: snapshot.refreshedAt,
                },
            };
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.RiskAssessmentEngine = RiskAssessmentEngine;

})(window);
