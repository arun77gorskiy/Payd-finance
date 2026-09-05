/* =================================================================
   PAYD Finance — TokenomicsEngine
   Полная модель токеномики на verified данных.
   - FDV, Market Cap, Circulating Supply, Max Supply
   - Inflation Rate (из supply history)
   - Unlock Schedule: investor, team, treasury, foundation
   - FDV/Market Cap ratio (dilution assessment)
   - Vesting periods
   НИКОГДА не вычисляет/выдумывает FDV — только из verified данных.
   ================================================================= */

(function (global) {
    'use strict';

    const DataModel = global.PAYD_INTEL.DataModel;

    /**
     * TokenomicsEngine работает с verified-обёртками.
     * Если критические поля отсутствуют — возвращает null с reason.
     */
    class TokenomicsEngine {
        constructor(db) {
            this.db = db;
        }

        /**
         * Вычисляет TokenomicsModel на основе verified данных.
         * @param {Object} project — ProjectModel с .market, .unlocks
         * @returns {Object} — TokenomicsModel
         */
        analyze(project) {
            const market = project.market;
            const unlocks = project.unlocks;

            const result = {
                fdv: market.fdv || DataModel.missing('coingecko', 'no_fdv'),
                marketCap: market.marketCap || DataModel.missing('coingecko', 'no_market_cap'),
                circulatingSupply: market.circulatingSupply || DataModel.missing('coingecko', 'no_circulating_supply'),
                totalSupply: market.totalSupply || DataModel.missing('coingecko', 'no_total_supply'),
                maxSupply: market.maxSupply || DataModel.missing('coingecko', 'no_max_supply'),
                inflationRate: this._computeInflationRate(project),
                fdvToMcapRatio: this._computeFdvMcapRatio(market.fdv, market.marketCap),
                dilutionAssessment: this._assessDilution(market.fdv, market.marketCap, market.circulatingSupply, market.totalSupply),
                unlockSchedule: unlocks.calendar || DataModel.missing('tokenunlocks', 'no_calendar'),
                allocations: this._buildAllocations(unlocks),
                vestingSummary: this._summarizeVesting(unlocks),
                timestamp: Date.now(),
            };

            result.overallConfidence = this._computeOverallConfidence(result);
            return result;
        }

        /**
         * Inflation Rate — вычисление из supply history.
         * Если есть history — вычисляем. Если нет — возвращаем missing.
         */
        _computeInflationRate(project) {
            if (!this.db) return DataModel.missing('no_db', 'no_database_available');

            const history = this.db.getHistorical('market', project.id, 'circulatingSupply', 365);
            if (history.length < 2) {
                return DataModel.missing('insufficient_history', 'need_at_least_2_data_points');
            }

            const first = history[0];
            const last = history[history.length - 1];
            const daysBetween = (last.timestamp - first.timestamp) / (1000 * 60 * 60 * 24);
            if (daysBetween <= 0 || first.value <= 0) {
                return DataModel.missing('invalid_history', 'invalid_time_range_or_zero_start');
            }

            const annualRate = ((last.value - first.value) / first.value) * (365 / daysBetween) * 100;
            return DataModel.verified(
                Math.round(annualRate * 100) / 100,
                'tokenomics.inflation_calculator',
                last.timestamp,
                'high',
                'computed_from_history'
            );
        }

        /**
         * FDV / Market Cap ratio.
         * - ratio = 1: вся supply в обращении
         * - ratio > 1: есть неразблокированные токены (potential dilution)
         * - ratio = 0: ошибка данных
         */
        _computeFdvMcapRatio(fdvObj, mcapObj) {
            const fdv = DataModel.unwrap(fdvObj);
            const mcap = DataModel.unwrap(mcapObj);
            if (fdv === null || mcap === null || mcap <= 0) {
                return DataModel.missing('coingecko', 'cannot_compute_ratio');
            }
            const ratio = fdv / mcap;
            let interpretation = 'Fully circulating';
            if (ratio > 2) interpretation = 'High dilution risk';
            else if (ratio > 1.5) interpretation = 'Moderate dilution';
            else if (ratio > 1.1) interpretation = 'Some locked supply';
            return DataModel.verified(
                { ratio: Math.round(ratio * 100) / 100, interpretation },
                'tokenomics.ratio_calculator',
                Date.now(),
                'high',
                'computed'
            );
        }

        /**
         * Оценка dilution risk.
         */
        _assessDilution(fdvObj, mcapObj, circObj, totalObj) {
            const fdv = DataModel.unwrap(fdvObj);
            const mcap = DataModel.unwrap(mcapObj);
            const circ = DataModel.unwrap(circObj);
            const total = DataModel.unwrap(totalObj);

            if (fdv === null || mcap === null) {
                return DataModel.missing('coingecko', 'insufficient_market_data');
            }

            // Оценка основана на % токенов в обращении
            let circulatingPct = null;
            if (circ !== null && total !== null && total > 0) {
                circulatingPct = (circ / total) * 100;
            } else if (fdv > 0 && mcap > 0) {
                circulatingPct = (mcap / fdv) * 100;
            }

            if (circulatingPct === null) {
                return DataModel.missing('coingecko', 'cannot_determine_circulating_pct');
            }

            let level = 'Unknown';
            let riskScore = 0;
            if (circulatingPct >= 80) { level = 'Low risk'; riskScore = 1; }
            else if (circulatingPct >= 50) { level = 'Moderate risk'; riskScore = 2; }
            else if (circulatingPct >= 25) { level = 'High risk'; riskScore = 3; }
            else { level = 'Very high risk'; riskScore = 4; }

            return DataModel.verified(
                { level, riskScore, circulatingPct: Math.round(circulatingPct * 100) / 100 },
                'tokenomics.dilution_evaluator',
                Date.now(),
                'high',
                'computed'
            );
        }

        /**
         * Allocations — структура с investor/team/treasury/foundation.
         * Берётся из unlock provider (если есть).
         */
        _buildAllocations(unlocks) {
            const result = {};
            const allocKeys = ['investorUnlocks', 'teamUnlocks', 'treasuryUnlocks'];
            for (const key of allocKeys) {
                if (unlocks[key] && !unlocks[key].missing) {
                    result[key] = unlocks[key];
                } else {
                    result[key] = DataModel.missing('tokenunlocks', 'no_allocation_data');
                }
            }
            return result;
        }

        /**
         * Краткая сводка по вестингу.
         */
        _summarizeVesting(unlocks) {
            const calendar = DataModel.unwrap(unlocks.calendar, null);
            if (!calendar || !Array.isArray(calendar) || calendar.length === 0) {
                return DataModel.missing('tokenunlocks', 'no_calendar_for_vesting_summary');
            }

            const now = Date.now();
            const future = calendar
                .filter(e => e.date && new Date(e.date).getTime() > now)
                .sort((a, b) => new Date(a.date) - new Date(b.date));

            if (future.length === 0) {
                return DataModel.verified(
                    { nextEvent: null, totalFutureEvents: 0, summary: 'All known unlocks have passed' },
                    'tokenomics.vesting_summary',
                    Date.now(),
                    'high',
                    'computed'
                );
            }

            const next = future[0];
            const totalUpcoming = future.length;
            return DataModel.verified(
                {
                    nextEvent: next,
                    totalFutureEvents: totalUpcoming,
                    summary: `${totalUpcoming} future unlock events scheduled`,
                },
                'tokenomics.vesting_summary',
                Date.now(),
                'high',
                'computed'
            );
        }

        /**
         * Общий confidence модели токеномики.
         */
        _computeOverallConfidence(model) {
            const confidences = [];
            const collect = (obj) => {
                if (obj && typeof obj === 'object') {
                    if (obj.confidence) confidences.push(obj.confidence);
                    for (const k of Object.keys(obj)) {
                        if (typeof obj[k] === 'object' && obj[k] !== null) collect(obj[k]);
                    }
                }
            };
            collect(model);
            if (confidences.length === 0) return 'none';
            const high = confidences.filter(c => c === 'high').length;
            const ratio = high / confidences.length;
            if (ratio >= 0.7) return 'high';
            if (ratio >= 0.4) return 'medium';
            return 'low';
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.TokenomicsEngine = TokenomicsEngine;

})(window);
