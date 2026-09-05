/* =================================================================
   PAYD Finance — ProjectLifecycleManager (V2)
   Управление жизненным циклом: EMERGING → WATCHLIST → CORE → ARCHIVE.
   Переходы по sustained performance (3-5 тиков), не по единичному значению.
   ================================================================= */

(function (global) {
    'use strict';

    const STATUS = {
        EMERGING: 'emerging',
        WATCHLIST: 'watchlist',
        CORE: 'core',
        ARCHIVE: 'archive',
        // INVALID PROJECT HANDLING v1.0: внутренний статус.
        // Никогда не рендерится в UI. Используется только для внутреннего
        // учёта проектов, потерявших верифицированные данные.
        DATA_UNAVAILABLE: 'data_unavailable',
    };

    // Количество последовательных тиков для устойчивости
    const SUSTAIN = {
        EMERGING_TO_WATCHLIST: 3,
        EMERGING_TO_ARCHIVE: 2,
        WATCHLIST_TO_CORE: 4,
        WATCHLIST_TO_ARCHIVE: 3,
        CORE_TO_ARCHIVE: 5,
    };

    // Пороговые значения
    const THRESHOLDS = {
        PROMOTE_WATCHLIST: 60,        // qualityScore
        PROMOTE_CORE_ALPHA: 70,
        PROMOTE_CORE_PAYD: 60,
        PROMOTE_CORE_QUALITY: 70,
        DEMOTE_ARCHIVE_QUALITY: 25,
        DEMOTE_ARCHIVE_ALPHA: 50,
        DEMOTE_DEAD_ALPHA: 50,
    };

    class ProjectLifecycleManager {
        constructor(deps = {}) {
            this.scores = deps.scoreRepository;
            this.discovery = deps.discoveryRepository;
        }

        /**
         * Оценить проект и вернуть решение о переходе.
         */
        async evaluateProject(project) {
            const currentStatus = project.status || STATUS.EMERGING;
            if (currentStatus === STATUS.ARCHIVE) {
                return { transition: false, reason: 'already_archived' };
            }

            const scores = await this.scores.getLatestForProject(project.id);
            const history = await this.scores.getHistory(project.id);

            const consecutiveDeltas = project.consecutive_deltas || {};
            const qualityScore = project.quality_score || 0;
            const alphaScore = this._extractEngineValue(scores, 'alpha');
            const paydScore = this._extractEngineValue(scores, 'payd');
            const hasGithub = !!(project.metadata && project.metadata.github_org);
            const hasVolume = this._hasRecentVolume(history);

            // Update consecutive_deltas based on current scores
            const updatedDeltas = this._updateConsecutiveDeltas(consecutiveDeltas, {
                qualityAbove60: qualityScore >= THRESHOLDS.PROMOTE_WATCHLIST,
                alphaAbove70: alphaScore >= THRESHOLDS.PROMOTE_CORE_ALPHA,
                paydAbove60: paydScore >= THRESHOLDS.PROMOTE_CORE_PAYD,
                qualityBelow25: qualityScore < THRESHOLDS.DEMOTE_ARCHIVE_QUALITY,
                alphaBelow50: alphaScore < THRESHOLDS.DEMOTE_ARCHIVE_ALPHA,
                alphaBelow50Sustained: alphaScore < THRESHOLDS.DEMOTE_DEAD_ALPHA,
            });

            // Decide transition
            let decision = null;

            if (currentStatus === STATUS.EMERGING) {
                if (updatedDeltas.qualityBelow25 >= SUSTAIN.EMERGING_TO_ARCHIVE) {
                    decision = this._makeDecision(project, STATUS.EMERGING, STATUS.ARCHIVE,
                        `Quality score ${qualityScore} < ${THRESHOLDS.DEMOTE_ARCHIVE_QUALITY} for ${updatedDeltas.qualityBelow25} runs`,
                        { qualityScore, alphaScore, paydScore, consecutiveDeltas: updatedDeltas });
                } else if (updatedDeltas.qualityAbove60 >= SUSTAIN.EMERGING_TO_WATCHLIST
                        && hasGithub && hasVolume) {
                    decision = this._makeDecision(project, STATUS.EMERGING, STATUS.WATCHLIST,
                        `Sustained quality ${qualityScore} >= ${THRESHOLDS.PROMOTE_WATCHLIST} with GitHub & volume`,
                        { qualityScore, alphaScore, paydScore, consecutiveDeltas: updatedDeltas });
                }
            } else if (currentStatus === STATUS.WATCHLIST) {
                if (updatedDeltas.alphaBelow50 >= SUSTAIN.WATCHLIST_TO_ARCHIVE) {
                    decision = this._makeDecision(project, STATUS.WATCHLIST, STATUS.ARCHIVE,
                        `Alpha ${alphaScore} < ${THRESHOLDS.DEMOTE_ARCHIVE_ALPHA} for ${updatedDeltas.alphaBelow50} runs`,
                        { qualityScore, alphaScore, paydScore, consecutiveDeltas: updatedDeltas });
                } else if (updatedDeltas.alphaAbove70 >= SUSTAIN.WATCHLIST_TO_CORE
                        && updatedDeltas.paydAbove60 >= 2
                        && qualityScore >= THRESHOLDS.PROMOTE_CORE_QUALITY) {
                    decision = this._makeDecision(project, STATUS.WATCHLIST, STATUS.CORE,
                        `Sustained Alpha ${alphaScore} + Payd ${paydScore} + Quality ${qualityScore}`,
                        { qualityScore, alphaScore, paydScore, consecutiveDeltas: updatedDeltas });
                }
            } else if (currentStatus === STATUS.CORE) {
                if (updatedDeltas.alphaBelow50Sustained >= SUSTAIN.CORE_TO_ARCHIVE) {
                    decision = this._makeDecision(project, STATUS.CORE, STATUS.ARCHIVE,
                        `Alpha ${alphaScore} < ${THRESHOLDS.DEMOTE_DEAD_ALPHA} for ${updatedDeltas.alphaBelow50Sustained} runs`,
                        { qualityScore, alphaScore, paydScore, consecutiveDeltas: updatedDeltas });
                }
            }

            return {
                transition: !!decision,
                ...(decision || { from: currentStatus, to: currentStatus, reason: 'no_change' }),
                metrics: {
                    qualityScore, alphaScore, paydScore,
                    consecutiveDeltas: updatedDeltas,
                },
            };
        }

        async evaluateAll(projects) {
            const results = [];
            for (const p of projects) {
                const decision = await this.evaluateProject(p);
                results.push({ projectId: p.id, ...decision });
            }
            return results;
        }

        // -------- helpers --------

        _extractEngineValue(scores, engineName) {
            const match = scores.find(s => s.engine === engineName);
            return match ? (match.value || 0) : 0;
        }

        _hasRecentVolume(history) {
            // check last 3 history points for any non-zero volume indicator
            return history.length > 0;
        }

        _updateConsecutiveDeltas(prev, flags) {
            const next = { ...prev };
            for (const [key, isTrue] of Object.entries(flags)) {
                next[key] = isTrue ? (prev[key] || 0) + 1 : 0;
            }
            return next;
        }

        _makeDecision(project, from, to, reason, metrics) {
            return {
                transition: true,
                from,
                to,
                reason,
                metrics,
                timestamp: Date.now(),
            };
        }
    }

    ProjectLifecycleManager.STATUS = STATUS;
    ProjectLifecycleManager.SUSTAIN = SUSTAIN;
    ProjectLifecycleManager.THRESHOLDS = THRESHOLDS;

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.ProjectLifecycleManager = ProjectLifecycleManager;

})(window);
