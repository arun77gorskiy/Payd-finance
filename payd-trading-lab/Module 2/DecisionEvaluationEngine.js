/**
 * DecisionEvaluationEngine — Module 2 (Decision Validator).
 *
 * ════════════════════════════════════════════════════════════════════════
 *  PAYD Trading Lab — Module 2 (финальная интеграция с Module X v1.0.0)
 * ════════════════════════════════════════════════════════════════════════
 *
 *  Архитектурный контракт:
 *    ✗ НЕ анализирует график
 *    ✗ НЕ интерпретирует структуру / моментум / объём / SMC / волатильность
 *    ✗ НЕ вызывает coreAnalysisEngine.analyzeMarket()
 *    ✗ НЕ вычисляет вероятности, тренды, силу сигналов
 *
 *    ✓ Только читает готовые поля AnalysisResult от Module X
 *    ✓ Сравнивает решение пользователя с bias/category/scenarios
 *    ✓ Сверяет evidence с requiredEvidence из каталога решений
 *    ✓ Выдаёт вердикт (correct / risky / incorrect) + объяснение
 *
 *  Вход:  { marketAnalysis: AnalysisResult, userDecision: id, userEvidence: [] }
 *  Выход: { verdict, verdictLabel, score, decision, explanation,
 *           evidenceAnalysis, meta }
 *
 *  Зависимости:
 *    - AnalysisResult (от Module X) — ЕДИНСТВЕННЫЙ источник данных
 *    - DecisionOptionsCatalog (опционально, через global)
 *
 *  Это УЗКИЙ валидатор. Не парсер. Не интерпретатор. Не аналитик.
 */
(function (global) {
    'use strict';

    // ================================================================
    // Доступ к каталогу решений (опционально)
    // ================================================================

    function _getCatalog() {
        if (global.DecisionOptionsCatalog &&
            typeof global.DecisionOptionsCatalog.getDecisionById === 'function') {
            return global.DecisionOptionsCatalog;
        }
        return null;
    }

    function _getDecision(id) {
        const cat = _getCatalog();
        if (cat) {
            const d = cat.getDecisionById(id);
            if (d) return d;
        }
        // Fallback: минимальный объект решения
        return {
            id: id,
            label: id,
            shortLabel: id.toUpperCase(),
            direction: id.includes('short') ? 'short'
                      : (id === 'no-trade' || id === 'wait' ? 'neutral' : 'long'),
            category: id === 'wait' || id === 'no-trade' ? 'neutral' : 'directional',
            riskLevel: 'medium',
            entryStyle: 'immediate',
            requiredEvidence: [],
            recommendedEvidence: [],
            rrExpectation: '1:2'
        };
    }

    // ================================================================
    // READ-функции — извлекают готовые данные из AnalysisResult.
    // ТОЛЬКО чтение полей. Никаких вычислений.
    // ================================================================

    /** bias: bullish / bearish / neutral */
    function _readBias(x) {
        // Приоритет: trend.primaryTrend > marketStructure.type
        if (x.trend && x.trend.primaryTrend) {
            const t = x.trend.primaryTrend;
            if (/bull/i.test(t) && !/bear/i.test(t)) return 'bullish';
            if (/bear/i.test(t)) return 'bearish';
        }
        const type = x.marketStructure && x.marketStructure.type;
        if (type === 'uptrend')    return 'bullish';
        if (type === 'downtrend')  return 'bearish';
        return 'neutral';
    }

    /** confidence в шкале 0..100 */
    function _readConfidence(x) {
        if (x.confidence && typeof x.confidence.percent === 'number') {
            return Math.round(x.confidence.percent);
        }
        if (typeof x.confidence === 'number') {
            return Math.round(x.confidence);
        }
        return null;
    }

    /** context: marketPhase.phase или fallback на structure.type */
    function _readContext(x) {
        if (x.marketPhase && x.marketPhase.phase) return x.marketPhase.phase;
        if (x.marketStructure && x.marketStructure.type) return x.marketStructure.type;
        return 'unknown';
    }

    /** continuationPct в процентах */
    function _readContinuationPct(x) {
        if (!x.probabilities || typeof x.probabilities.continuation !== 'number') return null;
        const p = x.probabilities.continuation;
        return p <= 1 ? Math.round(p * 100) : Math.round(p);
    }

    /** signals: evidence.keySignals */
    function _readSignals(x) {
        if (x.evidence && Array.isArray(x.evidence.keySignals)) return x.evidence.keySignals;
        return [];
    }

    /** scenarios: x.scenarios[] */
    function _readScenarios(x) {
        return Array.isArray(x.scenarios) ? x.scenarios : [];
    }

    // ================================================================
    // SCORING — оценка решения пользователя
    // (операции над строками и числами, НЕ анализ графика)
    // ================================================================

    /**
     * Базовый скоринг: соответствие направления решения bias-у рынка.
     * Сравнивает две строки: decision.direction ↔ bias.
     */
    function _scoreByBiasMatch(decision, bias) {
        const cat = decision.category;
        if (cat === 'neutral') {
            return { score: 0, base: 'neutral_choice' };
        }

        const dir = decision.direction;
        const matchesBias =
            (bias === 'bullish' && dir === 'long') ||
            (bias === 'bearish' && dir === 'short');
        const trendUnclear = (bias === 'neutral');

        if (cat === 'directional') {
            if (matchesBias)   return { score: +3, base: 'direction_match' };
            if (trendUnclear)  return { score: 0,  base: 'premature_directional' };
            return { score: -3, base: 'against_trend' };
        }

        if (cat === 'counter-trend') {
            if (matchesBias)   return { score: -1, base: 'not_actually_counter_trend' };
            if (trendUnclear)  return { score: +1, base: 'counter_in_transition' };
            return { score: -4, base: 'counter_against_trend' };
        }

        if (cat === 'conditional') {
            if (matchesBias)   return { score: +2, base: 'conditional_with_trend' };
            if (trendUnclear)  return { score: 0,  base: 'conditional_neutral' };
            return { score: -1, base: 'conditional_against_trend' };
        }

        if (cat === 'risk-managed') {
            if (matchesBias)   return { score: +1, base: 'risk_managed_with_trend' };
            return { score: 0, base: 'risk_managed_other' };
        }

        return { score: 0, base: 'unknown_category' };
    }

    /**
     * Модификатор по уверенности Module X.
     * Высокая confidence → усиливает знак score.
     * Низкая confidence → ослабляет.
     */
    function _scoreByConfidence(confidence) {
        if (confidence === null || confidence === undefined) {
            return { delta: 0, level: 'unknown' };
        }
        if (confidence >= 80) return { delta: +1, level: 'high' };
        if (confidence < 50)  return { delta: -1, level: 'low' };
        return { delta: 0, level: 'medium' };
    }

    /**
     * Модификатор по evidence пользователя.
     * Каждое пропущенное required → -2.
     * Каждое попадание в recommended → +(2/total).
     */
    function _scoreByEvidence(decision, userEvidence) {
        const userSet = new Set(userEvidence || []);
        const required = decision.requiredEvidence || [];
        const recommended = decision.recommendedEvidence || [];

        let delta = 0;
        const matches = [];
        const misses = [];

        for (const r of required) {
            if (userSet.has(r)) {
                matches.push(r);
            } else {
                misses.push(r);
                delta -= 2;
            }
        }

        let recHits = 0;
        for (const r of recommended) {
            if (userSet.has(r)) recHits++;
        }
        if (recommended.length > 0) {
            delta += Math.round((recHits / recommended.length) * 2);
        }

        return {
            delta,
            matches,
            misses,
            recommendedHits: recHits,
            recommendedTotal: recommended.length
        };
    }

    // ================================================================
    // BETTER ALTERNATIVE — подбор из готовых scenarios Module X
    // ================================================================

    /**
     * Подбирает лучшую альтернативу из готовых scenarios Module X.
     * Простая фильтрация: не совпадает с текущим, не wait/no-trade,
     * направление соответствует bias. Сортировка по priority+probability.
     */
    function _findBetterAlternative(currentDecisionId, bias, scenarios) {
        if (!scenarios || scenarios.length === 0) return null;

        const biasDir =
            bias === 'bullish' ? 'long' :
            bias === 'bearish' ? 'short' : null;

        const candidates = scenarios
            .filter(s => s.id !== currentDecisionId)
            .filter(s => s.id !== 'wait' && s.id !== 'no-trade')
            .filter(s => {
                if (!biasDir) return s.direction && s.direction !== 'neutral';
                return s.direction === biasDir;
            })
            .sort((a, b) => {
                const scoreA = (a.priority || 0) + (a.probability || 0) * 100;
                const scoreB = (b.priority || 0) + (b.probability || 0) * 100;
                return scoreB - scoreA;
            });

        if (candidates.length === 0) return null;
        return candidates[0];
    }

    // ================================================================
    // EXPLANATION — формирование объяснения
    // ================================================================

    /**
     * Описывает базу скоринга на человеческом языке.
     */
    function _describeBase(base, ctx, decision) {
        const shortL = decision.shortLabel;
        switch (base) {
            case 'direction_match':
                return `Решение «${shortL}» соответствует ${ctx.bias === 'bullish' ? 'бычьему' : 'медвежьему'} bias-у по данным Module X (вероятность продолжения ~${ctx.continuationPct ?? '—'}%).`;
            case 'against_trend':
                return `Решение «${shortL}» идёт против ${ctx.bias === 'bullish' ? 'бычьего' : 'медвежьего'} bias-а от Module X.`;
            case 'counter_against_trend':
                return `Решение «${shortL}» — агрессивный контртренд против преобладающего bias-а.`;
            case 'conditional_with_trend':
                return `Условный вход «${shortL}» (${decision.entryStyle}) согласован с bias-ом от Module X.`;
            case 'conditional_against_trend':
                return `Условный вход «${shortL}» идёт против bias-а от Module X.`;
            case 'risk_managed_with_trend':
                return `Управление позицией «${shortL}» согласовано с bias-ом от Module X.`;
            case 'risk_managed_other':
                return `Управление позицией «${shortL}» не зависит от направления тренда.`;
            case 'neutral_choice':
                return `Решение «${shortL}» нейтральное (дисциплина / ожидание).`;
            case 'premature_directional':
                return `Решение «${shortL}» направленное, но bias рынка не определён.`;
            case 'counter_in_transition':
                return `Контртрендовая сделка в переходной фазе рынка по данным Module X.`;
            case 'not_actually_counter_trend':
                return `Решение «${shortL}» помечено как counter-trend, но совпадает с bias-ом рынка.`;
            case 'conditional_neutral':
                return `Условный вход «${shortL}» при нейтральном bias-е рынка.`;
            default:
                return `Решение «${shortL}» оценено Module 2 (база: ${base}).`;
        }
    }

    /**
     * Описание риска в зависимости от вердикта.
     */
    function _describeRisk(verdict, decision) {
        const shortL = decision.shortLabel;
        if (verdict === 'correct') {
            return 'Умеренный риск. Решение согласовано с выводами Module X.';
        }
        if (verdict === 'risky') {
            return `Повышенный риск. Решение «${shortL}» частично противоречит выводам Module X или не хватает подтверждений.`;
        }
        return `Высокий риск. Решение «${shortL}» противоречит контексту рынка по выводам Module X.`;
    }

    /**
     * Формирует структуру объяснения на основе скоринга.
     * ТОЛЬКО компоновка строк — никаких новых вычислений.
     */
    function _buildExplanation(ctx, decision, verdict, baseRow, evidenceRow, betterAlternative) {
        const match = _describeBase(baseRow.base, ctx, decision);

        const evidenceMisses = [];
        if (evidenceRow && Array.isArray(evidenceRow.misses) && evidenceRow.misses.length > 0) {
            for (const m of evidenceRow.misses) {
                evidenceMisses.push(`Не отмечено обязательное подтверждение «${m}» для решения «${decision.shortLabel}».`);
            }
        }
        if (evidenceRow && evidenceRow.recommendedTotal > 0 && evidenceRow.recommendedHits < evidenceRow.recommendedTotal) {
            evidenceMisses.push(`Из ${evidenceRow.recommendedTotal} рекомендованных подтверждений отмечено только ${evidenceRow.recommendedHits}.`);
        }

        return {
            decision: decision.label,
            decisionShort: decision.shortLabel,
            direction: decision.direction,
            category: decision.category,
            riskLevel: decision.riskLevel,
            match: match,
            evidence: [match],
            evidenceMisses: evidenceMisses,
            risk: _describeRisk(verdict, decision),
            betterAlternative: betterAlternative,
            contextSummary: {
                bias: ctx.bias,
                context: ctx.context,
                confidence: ctx.confidence,
                continuationPct: ctx.continuationPct
            }
        };
    }

    // ================================================================
    // MAIN: evaluate
    // ================================================================

    /**
     * evaluate — главная точка входа Module 2.
     *
     * @param {Object} input
     * @param {Object} input.marketAnalysis — AnalysisResult от Module X
     * @param {string} input.userDecision — id решения (из DecisionOptionsCatalog)
     * @param {string[]} [input.userEvidence] — массив подтверждений от пользователя
     * @returns {Object} структурированный вердикт + объяснение
     */
    function evaluate(input) {
        if (!input || !input.marketAnalysis) {
            throw new Error('[DecisionEvaluationEngine] marketAnalysis is required');
        }
        const x = input.marketAnalysis;

        if (!input.userDecision) {
            throw new Error('[DecisionEvaluationEngine] userDecision is required');
        }
        const userDecision = input.userDecision;
        const userEvidence = input.userEvidence || [];

        // === Шаг 1: извлекаем унифицированный контекст из AnalysisResult ===
        const ctx = {
            bias:            _readBias(x),
            confidence:      _readConfidence(x),
            context:         _readContext(x),
            continuationPct: _readContinuationPct(x),
            signals:         _readSignals(x),
            scenarios:       _readScenarios(x)
        };

        // === Шаг 2: получаем решение пользователя из каталога ===
        const decision = _getDecision(userDecision);

        // === Шаг 3: скоринг (операции над строками/числами, НЕ анализ графика) ===
        const baseRow       = _scoreByBiasMatch(decision, ctx.bias);
        const confidenceRow = _scoreByConfidence(ctx.confidence);
        const evidenceRow   = _scoreByEvidence(decision, userEvidence);

        const score = baseRow.score + confidenceRow.delta + evidenceRow.delta;

        // === Шаг 4: финальный вердикт ===
        let verdict, verdictLabel;
        if (score >= 3) {
            verdict = 'correct';
            verdictLabel = '✓ Correct Decision';
        } else if (score >= 0) {
            verdict = 'risky';
            verdictLabel = '~ Risky Decision';
        } else {
            verdict = 'incorrect';
            verdictLabel = '✗ Incorrect Decision';
        }

        // === Шаг 5: подбор better alternative (только для не-correct) ===
        const betterAlternative = (verdict !== 'correct')
            ? _findBetterAlternative(decision.id, ctx.bias, ctx.scenarios)
            : null;

        // === Шаг 6: объяснение ===
        const explanation = _buildExplanation(
            ctx, decision, verdict, baseRow, evidenceRow, betterAlternative
        );

        // === Шаг 7: финальный результат ===
        return {
            verdict: verdict,
            verdictLabel: verdictLabel,
            score: score,
            decision: decision,
            explanation: explanation,
            evidenceAnalysis: {
                modifier: evidenceRow.delta,
                matches: evidenceRow.matches,
                misses: evidenceRow.misses,
                recommendedHits: evidenceRow.recommendedHits,
                recommendedTotal: evidenceRow.recommendedTotal
            },
            meta: {
                bias: ctx.bias,
                confidence: ctx.confidence,
                marketContext: ctx.context,
                decisionAt: new Date().toISOString(),
                signalsCount: ctx.signals.length
            }
        };
    }

    // ================================================================
    // Экспорт
    // ================================================================

    global.DecisionEvaluationEngine = {
        evaluate: evaluate,
        // Приватные методы выставлены для тестирования и отладки
        _internal: {
            _readBias: _readBias,
            _readConfidence: _readConfidence,
            _readContext: _readContext,
            _readContinuationPct: _readContinuationPct,
            _readSignals: _readSignals,
            _readScenarios: _readScenarios,
            _scoreByBiasMatch: _scoreByBiasMatch,
            _scoreByConfidence: _scoreByConfidence,
            _scoreByEvidence: _scoreByEvidence,
            _findBetterAlternative: _findBetterAlternative,
            _describeBase: _describeBase,
            _describeRisk: _describeRisk,
            _buildExplanation: _buildExplanation,
            _getDecision: _getDecision
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = global.DecisionEvaluationEngine;
    }
})(typeof window !== 'undefined' ? window : globalThis);
