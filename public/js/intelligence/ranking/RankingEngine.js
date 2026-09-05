/* =================================================================
   PAYD Intelligence — RankingEngine
   Управление списками: Core, Watchlist, Emerging, Archive.
   На основе verified scores принимает решения о промоушене
   и демишене проектов.

   Логика (пороги по умолчанию):
     Core     : paydScore >= 75 и verified, не старше 365 дней
     Watchlist: paydScore 60-74, или trending up
     Emerging : paydScore 40-59, или новые проекты
     Archive  : paydScore < 40, или не verified, или inactive 180+ дней

   Переходы:
     Emerging → Watchlist: paydScore 60+ AND fundamentals >= 50
     Watchlist → Core: paydScore 75+ AND risk >= 60
     Watchlist → Emerging: paydScore < 50
     Core → Watchlist: paydScore < 65
     любой → Archive: paydScore < 35 OR not verified OR inactive
   ================================================================= */

(function (global) {
    'use strict';

    const RANKS = ['archive', 'emerging', 'watchlist', 'core'];

    const DEFAULT_THRESHOLDS = {
        core: { minScore: 75, minFundamentals: 55, minRisk: 60 },
        watchlist: { minScore: 60, minFundamentals: 40 },
        emerging: { minScore: 40 },
        archive: { maxScore: 35, inactiveDays: 180 },
        promotion: {
            toWatchlist: 60,
            toCore: 75,
            requiredFundamentalsForCore: 55,
            requiredRiskForCore: 60,
        },
        demotion: {
            fromCore: 65,
            fromWatchlist: 50,
            fromEmerging: 35,
        },
    };

    class RankingEngine {
        constructor(config = {}) {
            this.thresholds = { ...DEFAULT_THRESHOLDS, ...config.thresholds };
            this.lifecycleLogger = config.lifecycleLogger || null;
            this.historyStore = config.historyStore || null;
            this._currentRankings = {
                core: [],
                watchlist: [],
                emerging: [],
                archive: [],
            };
            this._lastUpdate = null;
        }

        setInitialRankings(rankings) {
            if (rankings && typeof rankings === 'object') {
                for (const r of RANKS) {
                    if (Array.isArray(rankings[r])) {
                        this._currentRankings[r] = rankings[r].slice();
                    }
                }
            }
        }

        getRankings() {
            return {
                core: this._currentRankings.core.slice(),
                watchlist: this._currentRankings.watchlist.slice(),
                emerging: this._currentRankings.emerging.slice(),
                archive: this._currentRankings.archive.slice(),
            };
        }

        /**
         * Обновить все rankings на основе scores.
         * @param {Object} opts
         * @param {string} opts.cycleId
         * @param {Object} opts.aggregator — DataAggregator
         * @param {Object} opts.scoresByProject — { projectId: { payd, fundamental, risk, opportunity, ... } }
         * @returns {{promoted, demoted, unchanged, movements: Array}}
         */
        async updateAllRankings(opts = {}) {
            const { cycleId, aggregator, scoresByProject = {} } = opts;
            const movements = [];
            let promoted = 0;
            let demoted = 0;
            let unchanged = 0;

            // Собираем все проекты из всех списков
            const allProjects = new Set();
            for (const rank of RANKS) {
                for (const p of this._currentRankings[rank]) {
                    allProjects.add(typeof p === 'string' ? p : p.id);
                }
            }

            // Также добавляем проекты из aggregator'а
            if (aggregator) {
                for (const id of Object.keys(aggregator.getAllData())) {
                    allProjects.add(id);
                }
            }

            // Вычисляем новый rank для каждого проекта
            const newAssignments = {};
            for (const projectId of allProjects) {
                const scores = scoresByProject[projectId] || {};
                const newRank = this._decideRank(projectId, scores);
                newAssignments[projectId] = newRank;
            }

            // Применяем изменения
            const newRankings = {
                core: [], watchlist: [], emerging: [], archive: [],
            };

            for (const [projectId, newRank] of Object.entries(newAssignments)) {
                newRankings[newRank].push(projectId);
            }

            // Сравниваем и фиксируем движения
            for (const rank of RANKS) {
                const oldSet = new Set(this._currentRankings[rank].map(p =>
                    typeof p === 'string' ? p : p.id));
                const newSet = new Set(newRankings[rank].map(p =>
                    typeof p === 'string' ? p : p.id));

                for (const id of newSet) {
                    if (!oldSet.has(id)) {
                        // Найдём старый rank
                        let oldRank = null;
                        for (const r of RANKS) {
                            if (this._currentRankings[r].some(p =>
                                (typeof p === 'string' ? p : p.id) === id)) {
                                oldRank = r;
                                break;
                            }
                        }
                        const move = {
                            projectId: id,
                            from: oldRank,
                            to: rank,
                            direction: RANKS.indexOf(rank) > RANKS.indexOf(oldRank) ? 'promotion' : 'demotion',
                            cycleId,
                        };
                        movements.push(move);
                        if (move.direction === 'promotion') {
                            promoted++;
                            if (this.lifecycleLogger) {
                                this.lifecycleLogger.log({
                                    type: 'promoted',
                                    projectId: id,
                                    from: oldRank,
                                    to: rank,
                                    cycleId,
                                });
                            }
                        } else {
                            demoted++;
                            if (this.lifecycleLogger) {
                                this.lifecycleLogger.log({
                                    type: 'demoted',
                                    projectId: id,
                                    from: oldRank,
                                    to: rank,
                                    cycleId,
                                });
                            }
                        }
                        if (this.historyStore) {
                            this.historyStore.appendLabelEvent({
                                projectId: id,
                                from: oldRank,
                                to: rank,
                                direction: move.direction,
                                cycleId,
                            });
                        }
                    } else {
                        unchanged++;
                    }
                }
            }

            this._currentRankings = newRankings;
            this._lastUpdate = new Date().toISOString();

            return { promoted, demoted, unchanged, movements };
        }

        /**
         * Решить, в какой rank поместить проект.
         */
        _decideRank(projectId, scores) {
            const payd = scores.payd || scores.PaydScoreEngine || 0;
            const fundamental = scores.fundamental || scores.FundamentalAnalysisEngine || 0;
            const risk = scores.risk || scores.RiskAssessmentEngine || 0;
            const opportunity = scores.opportunity || scores.OpportunityAnalysisEngine || 0;
            const verified = scores.verified !== false; // по умолчанию verified

            // Archive: не verified или очень низкий score
            if (!verified || payd < this.thresholds.demotion.fromEmerging) {
                return 'archive';
            }

            // Core
            if (payd >= this.thresholds.promotion.toCore
                && fundamental >= this.thresholds.promotion.requiredFundamentalsForCore
                && risk >= this.thresholds.promotion.requiredRiskForCore) {
                return 'core';
            }

            // Watchlist
            if (payd >= this.thresholds.promotion.toWatchlist) {
                return 'watchlist';
            }

            // Emerging
            if (payd >= this.thresholds.demotion.fromEmerging) {
                return 'emerging';
            }

            return 'archive';
        }

        getLastUpdate() {
            return this._lastUpdate;
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.RankingEngine = RankingEngine;
    global.PAYD_INTEL.RANKING_THRESHOLDS = DEFAULT_THRESHOLDS;

})(window);
