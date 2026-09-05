/* =================================================================
   PAYD Finance — PaydDiscoveryEngine
   Движок автодискаверинга проектов с растущим Alpha Score.
   Генерирует лейблы:
     🔥 High Alpha Opportunity
     🚀 Early Growth
     ⭐ Emerging Leader
     💎 Hidden Gem Candidate
   И события:
     - Promotion (переход в более высокий alpha-тир)
     - Demotion  (понижение)
     - Milestone (пересечение порога)
   ================================================================= */

(function (global) {
    'use strict';

    const BaseEngine = global.PAYD_INTEL.BaseEngine;

    const LABELS = {
        HIGH_ALPHA: {
            id: 'high_alpha',
            icon: '🔥',
            label: 'High Alpha Opportunity',
            color: '#D4AF37',
            minAlpha: 85,
        },
        EARLY_GROWTH: {
            id: 'early_growth',
            icon: '🚀',
            label: 'Early Growth',
            color: '#22c55e',
            minAlpha: 70,
            minDelta: 5, // +5% delta
        },
        EMERGING_LEADER: {
            id: 'emerging_leader',
            icon: '⭐',
            label: 'Emerging Leader',
            color: '#7B61FF',
            minAlpha: 80,
            minPayd: 75,
        },
        HIDDEN_GEM: {
            id: 'hidden_gem',
            icon: '💎',
            label: 'Hidden Gem Candidate',
            color: '#06b6d4',
            minAlpha: 75,
            maxMcap: 500_000_000, // <500M
        },
    };

    class PaydDiscoveryEngine extends BaseEngine {
        constructor(config = {}) {
            super(config);
            this.name = 'discovery';
            this.label = 'Payd Discovery';
            this.description = 'Auto-discovery labels';
            // Discovery engine не возвращает value, а набор лейблов
            this.range = [0, 0];
        }

        /**
         * На вход: проект + контекст { history, allProjects }
         * Возвращает: { labels, events, opportunityScore, rank }
         */
        calculate(project, context = {}) {
            const history = context.history || (project._history) || [];
            const scores = project._scores || context.scores || {};
            const alpha = scores.alpha || {};
            const payd = scores.payd || {};

            const alphaValue = alpha.value != null ? alpha.value : 0;
            const paydValue = payd.value != null ? payd.value : 0;
            const mcap = unwrap(project.market && project.market.marketCap, 0);

            // ---- Расчёт дельт ----
            const deltas = computeDeltas(history, alphaValue, paydValue);

            // ---- Определение лейблов ----
            const labels = [];

            // 🔥 High Alpha
            if (alphaValue >= LABELS.HIGH_ALPHA.minAlpha) {
                labels.push({
                    ...LABELS.HIGH_ALPHA,
                    reason: `Alpha Score ${alphaValue} ≥ ${LABELS.HIGH_ALPHA.minAlpha}`,
                });
            }

            // 🚀 Early Growth (Alpha растёт)
            if (alphaValue >= LABELS.EARLY_GROWTH.minAlpha
                && deltas.alphaDelta !== null
                && deltas.alphaDelta >= LABELS.EARLY_GROWTH.minDelta) {
                labels.push({
                    ...LABELS.EARLY_GROWTH,
                    reason: `Alpha вырос на +${deltas.alphaDelta.toFixed(1)} п.п.`,
                });
            }

            // ⭐ Emerging Leader (Alpha + Payd)
            if (alphaValue >= LABELS.EMERGING_LEADER.minAlpha
                && paydValue >= LABELS.EMERGING_LEADER.minPayd) {
                labels.push({
                    ...LABELS.EMERGING_LEADER,
                    reason: `Alpha ${alphaValue} + Payd ${paydValue}`,
                });
            }

            // 💎 Hidden Gem (Alpha + small-cap)
            if (alphaValue >= LABELS.HIDDEN_GEM.minAlpha
                && mcap > 0 && mcap < LABELS.HIDDEN_GEM.maxMcap) {
                labels.push({
                    ...LABELS.HIDDEN_GEM,
                    reason: `Alpha ${alphaValue} + small-cap $${(mcap/1e6).toFixed(0)}M`,
                });
            }

            // ---- События (promotion/demotion/milestone) ----
            const events = computeEvents(history, alphaValue);

            // ---- Opportunity score для сортировки ----
            // Композитный: 0.6 * alpha + 0.2 * delta + 0.2 * (100 - payd)
            const opportunityScore = Math.round(
                0.6 * alphaValue
              + 0.2 * Math.max(0, Math.min(100, 50 + (deltas.alphaDelta || 0) * 2))
              + 0.2 * (100 - Math.max(0, paydValue))
            );

            return this.buildResult({
                value: opportunityScore,
                range: [0, 100],
                breakdown: {
                    alphaValue,
                    paydValue,
                    alphaDelta: deltas.alphaDelta,
                    paydDelta: deltas.paydDelta,
                    opportunityScore,
                },
                factors: labels.map(l => ({
                    name: l.label,
                    value: l.minAlpha || 0,
                    max: 100,
                    delta: 0,
                    direction: 'positive',
                    detail: l.reason,
                })),
                explanation: buildExplanation({ labels, events, deltas, alphaValue, paydValue }),
                confidence: deltas.alphaDelta !== null ? 'high' : 'medium',
                confidenceScore: deltas.alphaDelta !== null ? 85 : 60,
                sources: ['payd_score_engine', 'payd_alpha_engine', 'payd_conviction_engine'],
            }).withExtras({
                labels,
                events,
                opportunityScore,
            });
        }

        /**
         * Получить топ-N opportunities среди списка проектов.
         * @param {Array<Object>} projects
         * @param {number} limit
         */
        getTopOpportunities(projects, limit = 10) {
            const results = projects.map(p => {
                const scores = p._scores || {};
                const res = this.calculate(p, {
                    history: p._history || [],
                    scores,
                });
                return {
                    projectId: p.id || p.coinId,
                    name: p.name,
                    ticker: p.ticker,
                    labels: res.labels,
                    opportunityScore: res.opportunityScore,
                    alphaValue: res.breakdown.alphaValue,
                    paydValue: res.breakdown.paydValue,
                    alphaDelta: res.breakdown.alphaDelta,
                };
            });

            return results
                .sort((a, b) => b.opportunityScore - a.opportunityScore)
                .slice(0, limit);
        }
    }

    // ---------- helpers ----------

    function unwrap(field, fallback = 0) {
        if (field === undefined || field === null) return fallback;
        if (typeof field === 'object' && 'value' in field) return field.value;
        return field;
    }

    function computeDeltas(history, currentAlpha, currentPayd) {
        if (!Array.isArray(history) || history.length === 0) {
            return { alphaDelta: null, paydDelta: null };
        }
        const last = history[history.length - 1];
        const lastScores = last.scores || {};
        const lastAlpha = (lastScores.alpha && lastScores.alpha.value) || 0;
        const lastPayd = (lastScores.payd && lastScores.payd.value) || 0;
        return {
            alphaDelta: currentAlpha - lastAlpha,
            paydDelta: currentPayd - lastPayd,
        };
    }

    function computeEvents(history, currentAlpha) {
        const events = [];
        if (!Array.isArray(history) || history.length === 0) return events;

        const last = history[history.length - 1];
        const lastScores = last.scores || {};
        const lastAlpha = (lastScores.alpha && lastScores.alpha.value) || 0;
        const lastTier = tierOf(lastAlpha);
        const curTier = tierOf(currentAlpha);

        if (curTier.rank > lastTier.rank) {
            events.push({
                type: 'promotion',
                from: lastTier.label,
                to: curTier.label,
                delta: +(currentAlpha - lastAlpha).toFixed(1),
                timestamp: Date.now(),
            });
        } else if (curTier.rank < lastTier.rank) {
            events.push({
                type: 'demotion',
                from: lastTier.label,
                to: curTier.label,
                delta: +(currentAlpha - lastAlpha).toFixed(1),
                timestamp: Date.now(),
            });
        }

        // Milestones
        const milestones = [60, 70, 80, 90, 95];
        for (const m of milestones) {
            if (lastAlpha < m && currentAlpha >= m) {
                events.push({
                    type: 'milestone',
                    threshold: m,
                    timestamp: Date.now(),
                });
            }
        }

        return events;
    }

    function tierOf(value) {
        if (value >= 95) return { rank: 6, label: 'Exceptional' };
        if (value >= 90) return { rank: 5, label: 'Very High' };
        if (value >= 80) return { rank: 4, label: 'High' };
        if (value >= 70) return { rank: 3, label: 'Moderate' };
        if (value >= 60) return { rank: 2, label: 'Low' };
        return              { rank: 1, label: 'Weak' };
    }

    function buildExplanation({ labels, events, deltas, alphaValue, paydValue }) {
        const parts = [];
        if (labels.length === 0) {
            parts.push('Нет активных лейблов discovery.');
        } else {
            parts.push('Активные лейблы: ' + labels.map(l => l.icon + ' ' + l.label).join(', '));
        }
        if (deltas.alphaDelta !== null) {
            if (deltas.alphaDelta > 0) {
                parts.push(`Alpha вырос на +${deltas.alphaDelta.toFixed(1)} п.п.`);
            } else if (deltas.alphaDelta < 0) {
                parts.push(`Alpha снизился на ${deltas.alphaDelta.toFixed(1)} п.п.`);
            }
        }
        if (events.length > 0) {
            const promo = events.find(e => e.type === 'promotion');
            const demo  = events.find(e => e.type === 'demotion');
            if (promo) parts.push(`⬆️ Промоушн: ${promo.from} → ${promo.to}`);
            if (demo)  parts.push(`⬇️ Демоушн: ${demo.from} → ${demo.to}`);
        }
        return parts.join('. ');
    }

    // Расширяем BaseEngine чтобы можно было добавить extras в результат
    const origBuild = BaseEngine.prototype.buildResult;
    BaseEngine.prototype.buildResult = function (data) {
        const result = origBuild.call(this, data);
        result.withExtras = function (extras) {
            Object.assign(result, extras);
            return result;
        };
        return result;
    };

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.PaydDiscoveryEngine = PaydDiscoveryEngine;
    global.PAYD_INTEL.PAYD_LABELS = LABELS;

})(window);
