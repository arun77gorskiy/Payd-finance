/**
 * DecisionEvaluationEngine — Module 2 (Decision Validator).
 *
 * Принципы архитектуры (ПОСЛЕ ИНТЕГРАЦИИ):
 *   Это ТОНКИЙ ВАЛИДАТОР. Module 2 НЕ анализирует график.
 *   Module 2 НЕ интерпретирует SMC, моментум, объём, волатильность.
 *   Module 2 НЕ добавляет собственных правил для конкретных решений.
 *   Module 2 НЕ вызывает coreAnalysisEngine.analyzeMarket() сам —
 *         AnalysisResult поставляется через входной параметр marketAnalysis.
 *
 *   Единственный источник аналитических данных — Module X (coreAnalysisEngine).
 *   Module 2 только:
 *     1. Берёт готовое `bias` от Module X.
 *     2. Берёт готовые `signals` (keySignals) от Module X.
 *     3. Берёт готовые `scenarios` от Module X.
 *     4. Сравнивает решение пользователя с bias/category.
 *     5. Сверяет evidence пользователя с requiredEvidence решения из каталога.
 *     6. Подбирает betterAlternative из готовых scenarios Module X.
 *
 * Использование (КАННОНИЧЕСКИЙ СПОСОБ):
 *   const verdict = DecisionEvaluationEngine.evaluate({
 *       marketAnalysis: <AnalysisResult от coreAnalysisEngine.analyzeMarket()>
 *                      ИЛИ <результат Module 1 с прикреплённым moduleXOutput>,
 *       userDecision: <id решения из DecisionOptionsCatalog>,
 *       userEvidence: ['breakout', 'high-volume', ...]
 *   });
 *
 * Зависимости:
 *   - coreAnalysisEngine (Module X) — ЕДИНСТВЕННЫЙ источник аналитических данных.
 *     Module 2 ТОЛЬКО читает его AnalysisResult, не вызывая повторно.
 *   - DecisionOptionsCatalog (глобальный) — для справки по решениям
 */
(function (global) {
    'use strict';

    // ================================================================
    // Нормализация контекста — прокидывает данные Module X как есть
    // ================================================================

    /**
     * Извлекает унифицированный контекст из любого формата входа.
     * Module 2 НЕ делает никакого собственного анализа — только прокидывает
     * уже вычисленные Module X поля.
     */
    function _extractContext(input) {
        const market = input.marketAnalysis;
        if (!market) {
            throw new Error('[DecisionEvaluationEngine] marketAnalysis is required');
        }

        // Путь 1: Module 1 с прикреплённым moduleXOutput (рекомендуемый)
        if (market.moduleXOutput &&
            market.moduleXOutput.structure &&
            market.moduleXOutput.summary) {
            return _normalizeX(market.moduleXOutput);
        }

        // Путь 2: прямой Module X
        if (market.structure && market.summary && market.scenarios !== undefined) {
            return _normalizeX(market);
        }

        // Путь 3: legacy Module 1 (без Module X)
        return _normalizeLegacy(market);
    }

    /**
     * Нормализация вывода Module X — просто прокидываем готовые поля.
     * Никакой собственной интерпретации.
     */
    function _normalizeX(x) {
        return {
            bias: x.summary.bias,
            confidence: x.summary.confidence,
            context: x.summary.context,
            probabilities: x.summary.probabilities,
            // keySignals — это уже готовые сигналы от Module X.
            // Module 2 использует их как есть, не добавляя новых.
            signals: x.summary.keySignals || [],
            // Готовые сценарии Module X — для подбора betterAlternative
            scenarios: x.scenarios || [],
            // Полные данные Module X прокидываются as-is для UI / Module 3
            raw: x
        };
    }

    /**
     * Нормализация legacy Module 1 (fallback).
     */
    function _normalizeLegacy(market) {
        return {
            bias: market.bias || 'neutral',
            confidence: market.confidence || 50,
            context: market.context || 'unknown',
            probabilities: market.probabilities || { continuation: 50, reversal: 50 },
            signals: market.keySignals || [],
            scenarios: [],
            raw: market
        };
    }

    // ================================================================
    // Получение решения из каталога
    // ================================================================

    function _getDecision(decisionId) {
        if (global.DecisionOptionsCatalog &&
            typeof global.DecisionOptionsCatalog.getDecisionById === 'function') {
            const d = global.DecisionOptionsCatalog.getDecisionById(decisionId);
            if (d) return d;
        }
        // Fallback: минимальный объект решения
        return {
            id: decisionId,
            label: decisionId,
            shortLabel: decisionId.toUpperCase(),
            direction: decisionId.includes('short') ? 'short'
                      : (decisionId === 'no-trade' || decisionId === 'wait' ? 'neutral' : 'long'),
            category: decisionId === 'wait' || decisionId === 'no-trade' ? 'neutral' : 'directional',
            riskLevel: 'medium',
            entryStyle: 'immediate',
            requiredEvidence: [],
            recommendedEvidence: [],
            rrExpectation: '1:2'
        };
    }

    // ================================================================
    // Базовый скоринг по bias и категории решения
    // ================================================================

    /**
     * Определяет базовый score на основе соответствия направления решения bias-у рынка.
     * Логика общая для всех решений — никакой специфики для отдельных сценариев.
     */
    function baseScore(bias, decision) {
        const category = decision.category;

        if (category === 'neutral') {
            return { score: 0, base: 'neutral' };
        }

        if (category === 'counter-trend') {
            if (bias === 'neutral') return { score: +1, base: 'counter_in_transition' };
            return { score: -3, base: 'against_trend_aggressive' };
        }

        if (category === 'directional') {
            if (bias === 'bullish' && decision.direction === 'long')  return { score: +1, base: 'direction_match' };
            if (bias === 'bearish' && decision.direction === 'short') return { score: +1, base: 'direction_match' };
            if (bias !== 'neutral')                                  return { score: -2, base: 'against_trend' };
            return { score: 0, base: 'premature' };
        }

        if (category === 'conditional') {
            const dir = decision.direction;
            const style = decision.entryStyle;
            if (style === 'on-pullback' || style === 'conditional') {
                if ((bias === 'bullish' && dir === 'long') || (bias === 'bearish' && dir === 'short')) {
                    return { score: +1, base: 'conditional_with_trend' };
                }
                return { score: 0, base: 'conditional_no_trend' };
            }
            if (style === 'on-breakout') {
                if ((bias === 'bullish' && dir === 'long') || (bias === 'bearish' && dir === 'short')) {
                    return { score: +1, base: 'breakout_with_trend' };
                }
                return { score: -1, base: 'breakout_against_context' };
            }
            return { score: 0, base: 'conditional_neutral' };
        }

        if (category === 'risk-managed') {
            const dir = decision.direction;
            if ((bias === 'bullish' && dir === 'long') || (bias === 'bearish' && dir === 'short')) {
                return { score: +1, base: 'risk_managed_with_trend' };
            }
            if (bias === 'neutral' && decision.id === 'partial-position') {
                return { score: +1, base: 'partial_in_neutral' };
            }
            if (bias === 'neutral' && decision.id === 'scale-in') {
                return { score: 0, base: 'scale_in_neutral' };
            }
            return { score: -1, base: 'risk_managed_against_trend' };
        }

        return { score: 0, base: 'unknown' };
    }

    // ================================================================
    // Модификаторы по сигналам Module X
    // ================================================================

    /**
     * Модификаторы по сигналам.
     * Это ОБЩИЕ правила — Module X говорит "есть сигнал X", Module 2 реагирует.
     * Module 2 НЕ интерпретирует данные Module X — он только реагирует на
     * уже агрегированные keySignals, которые вернул Module X.
     *
     * Если Module X добавляет новые сигналы — Module 2 их просто проигнорирует,
     * пока для них нет правила (это нормально — архитектура расширяемая).
     */
    const SIGNAL_MODIFIERS = {
        'uptrend_structure':       { 'long': +1, 'breakout-entry': +1, 'pullback-entry': +1, 'conservative-long': +1, 'aggressive-long': +1, 'scale-in': +1, 'partial-position': +1, 'counter-trend': -1 },
        'downtrend_structure':     { 'short': +1, 'breakout-entry': +1, 'pullback-entry': +1, 'conservative-long': 0, 'aggressive-long': +1, 'scale-in': +1, 'partial-position': +1, 'counter-trend': -1 },
        'strong_bullish_momentum': { 'long': +1, 'aggressive-long': +1, 'breakout-entry': +1, 'pullback-entry': +1, 'conservative-long': +1, 'scale-in': +1, 'partial-position': +1, 'counter-trend': -2 },
        'strong_bearish_momentum': { 'short': +1, 'aggressive-long': -1, 'breakout-entry': +1, 'pullback-entry': +1, 'scale-in': +1, 'partial-position': +1, 'counter-trend': -2 },
        'price_above_resistance':  { 'long': +1, 'breakout-entry': +1, 'aggressive-long': +1, 'conservative-long': +1, 'scale-in': +1, 'partial-position': +1, 'pullback-entry': +1 },
        'price_below_support':     { 'short': +1, 'breakout-entry': +1, 'aggressive-long': +1, 'scale-in': +1, 'partial-position': +1, 'pullback-entry': +1 },
        'at_key_level':            { 'breakout-entry': 0, 'pullback-entry': +1, 'conservative-long': +1, 'aggressive-long': -2, 'scale-in': +1, 'partial-position': +1, 'counter-trend': +1 },
        'multiple_level_touches':  { 'pullback-entry': +1, 'conservative-long': +1, 'aggressive-long': -2, 'partial-position': +2, 'scale-in': +1, 'wait': +1, 'no-trade': +1 },
        'potential_breakout':      { 'breakout-entry': +2, 'pullback-entry': +1, 'aggressive-long': +1, 'scale-in': +1, 'partial-position': +1, 'conservative-long': +1, 'wait': +1 },
        'volume_climax':           { 'breakout-entry': -1, 'aggressive-long': -2, 'long': -1, 'short': -1, 'pullback-entry': +1, 'wait': +1, 'no-trade': +1 },
        'low_volume':              { 'breakout-entry': -1, 'aggressive-long': -2, 'long': -1, 'short': -1, 'pullback-entry': -1, 'partial-position': +1, 'wait': +1, 'no-trade': +1 }
    };

    /**
     * Применяет модификаторы сигналов к score.
     * Возвращает массив bullets с пояснениями.
     */
    function _applySignalModifiers(decision, signals) {
        let delta = 0;
        const bulletsMatch = [];
        const bulletsMismatch = [];

        signals.forEach(sig => {
            const mod = SIGNAL_MODIFIERS[sig];
            if (mod && mod[decision.id] !== undefined && mod[decision.id] !== 0) {
                delta += mod[decision.id];
                if (mod[decision.id] > 0) {
                    bulletsMatch.push(`Сигнал Module X «${_humanizeSignal(sig)}» поддерживает решение «${decision.shortLabel}».`);
                } else {
                    bulletsMismatch.push(`Сигнал Module X «${_humanizeSignal(sig)}» противоречит решению «${decision.shortLabel}».`);
                }
            }
        });

        return { delta, bulletsMatch, bulletsMismatch };
    }

    // ================================================================
    // Модификаторы по evidence пользователя
    // ================================================================

    /**
     * Сравнивает evidence пользователя с required/recommended в решении из каталога.
     * Логика полностью основана на данных решения из DecisionOptionsCatalog —
     * никаких собственных правил для конкретных решений.
     */
    function _applyEvidenceModifiers(decision, userEvidence) {
        const userSet = new Set(userEvidence || []);
        const required = decision.requiredEvidence || [];
        const recommended = decision.recommendedEvidence || [];

        let delta = 0;
        const matches = [];
        const misses = [];

        required.forEach(r => {
            if (userSet.has(r)) {
                matches.push(r);
            } else {
                misses.push(r);
                delta -= 1;
            }
        });

        let recHits = 0;
        recommended.forEach(r => {
            if (userSet.has(r)) recHits++;
        });
        if (recommended.length > 0) {
            const recRatio = recHits / recommended.length;
            delta += Math.round(recRatio * 2);
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
    // Подбор betterAlternative — из готовых scenarios Module X
    // ================================================================

    /**
     * Подбирает лучшую альтернативу из готовых scenarios Module X.
     *
     * Module 2 НЕ "знает" о конкретных сценариях — он только фильтрует
     * готовый список scenarios от Module X по простым критериям:
     *   - не совпадает с текущим решением
     *   - направление соответствует bias
     *   - исключены wait/no-trade
     *   - выбирается по приоритету и вероятности
     *
     * Если Module X вернул сценарий с ID, который есть в DecisionOptionsCatalog,
     * используется полный объект из каталога. Иначе — объект конструируется
     * из сценария as-is.
     */
    function _findBetterAlternative(currentDecision, ctx) {
        if (!ctx.scenarios || ctx.scenarios.length === 0) {
            return null;
        }

        const bias = ctx.bias;

        // Фильтрация готовых сценариев Module X по простым критериям
        const candidates = ctx.scenarios
            .filter(s => s.id !== currentDecision.id)
            .filter(s => s.id !== 'wait' && s.id !== 'no-trade')
            .filter(s => {
                if (bias === 'bullish') return s.direction === 'long';
                if (bias === 'bearish') return s.direction === 'short';
                return true; // neutral — все направления подходят
            })
            .sort((a, b) => {
                // По приоритету + вероятности (готовые поля Module X)
                const scoreA = (a.priority || 0) + (a.probability || 0) * 100;
                const scoreB = (b.priority || 0) + (b.probability || 0) * 100;
                return scoreB - scoreA;
            });

        if (candidates.length === 0) return null;

        const best = candidates[0];

        // Попытаться найти полный объект решения в каталоге
        if (global.DecisionOptionsCatalog &&
            typeof global.DecisionOptionsCatalog.getDecisionById === 'function') {
            const fromCatalog = global.DecisionOptionsCatalog.getDecisionById(best.id);
            if (fromCatalog) return fromCatalog;
        }

        // Если в каталоге нет — вернуть объект as-is из сценария Module X
        return {
            id: best.id,
            label: best.title || best.id,
            shortLabel: (best.title || best.id).toUpperCase().substring(0, 6),
            direction: best.direction || 'neutral',
            category: best.category || 'conditional',
            riskLevel: best.riskLevel || 'medium',
            entryStyle: (best.confirmations || []).includes('retest') ? 'on-pullback'
                      : (best.confirmations || []).includes('breakout') ? 'on-breakout'
                      : 'conditional',
            requiredEvidence: best.confirmations || [],
            recommendedEvidence: [],
            rrExpectation: best.riskRewardRatio || '1:2',
            description: best.description,
            reasons: best.reasons,
            entryZone: best.entryZone,
            stopLoss: best.stopLoss,
            takeProfit: best.takeProfit,
            probability: best.probability,
            confidence: best.confidence
        };
    }

    // ================================================================
    // Формирование объяснения
    // ================================================================

    function _buildExplanation(verdict, decision, ctx, signalBullets, evidenceBullets, riskDescription, betterAlternative) {
        const exp = {
            decision: decision.label,
            decisionShort: decision.shortLabel,
            direction: decision.direction,
            category: decision.category,
            riskLevel: decision.riskLevel,
            entryStyle: decision.entryStyle,
            rrExpectation: decision.rrExpectation,
            match: '',
            evidence: [],
            evidenceMisses: [],
            risk: '',
            betterAlternative: null,
            contextSummary: {
                bias: ctx.bias,
                context: ctx.context,
                confidence: ctx.confidence,
                continuationPct: ctx.probabilities ? ctx.probabilities.continuation : null
            }
        };

        const allMatch = signalBullets.bulletsMatch;
        const allMismatch = signalBullets.bulletsMismatch.concat(evidenceBullets.bulletsMismatch);

        if (verdict === 'correct') {
            exp.match = allMatch[0] || 'Решение соответствует контексту рынка по данным Module X.';
            exp.evidence = allMatch.slice();
            exp.risk = 'Умеренный риск. Решение согласовано с выводами Module X.';
        } else if (verdict === 'risky') {
            exp.match = 'Решение частично соответствует контексту, но противоречит части выводов Module X.';
            exp.evidence = allMatch.concat(allMismatch);
            exp.risk = riskDescription;
            exp.betterAlternative = betterAlternative;
        } else {
            exp.evidence = allMismatch;
            exp.match = 'Решение противоречит контексту рынка по выводам Module X.';
            exp.risk = riskDescription;
            exp.betterAlternative = betterAlternative;
        }

        if (evidenceBullets.evidenceMisses.length > 0) {
            exp.evidenceMisses = evidenceBullets.evidenceMisses;
        }

        return exp;
    }

    // ================================================================
    // Главная функция: evaluate
    // ================================================================

    function evaluate(input) {
        // 1. Получаем унифицированный контекст (готовые данные Module X)
        const ctx = _extractContext(input);

        const decisionId = input.userDecision;
        if (!decisionId) throw new Error('[DecisionEvaluationEngine] userDecision is required');

        // 2. Получаем решение из каталога
        const decision = _getDecision(decisionId);

        // 3. Базовый скоринг по bias и категории
        const baseRow = baseScore(ctx.bias, decision);
        let score = baseRow.score;
        const baseBullets = [];

        if (baseRow.base === 'direction_match') {
            baseBullets.push(`Module X определил ${ctx.bias === 'bullish' ? 'восходящий' : 'нисходящий'} bias (вероятность продолжения ~${ctx.probabilities.continuation}%). Решение «${decision.shortLabel}» согласовано с направлением.`);
        } else if (baseRow.base === 'against_trend') {
            baseBullets.push(`Module X определил ${ctx.bias === 'bullish' ? 'восходящий' : 'нисходящий'} bias. Решение «${decision.shortLabel}» идёт против тренда.`);
        } else if (baseRow.base === 'against_trend_aggressive') {
            baseBullets.push(`Module X зафиксировал ${ctx.bias === 'bullish' ? 'бычий' : 'медвежий'} bias. Контртрендовая сделка против преобладающего движения — очень рискованный подход.`);
        } else if (baseRow.base === 'conditional_with_trend') {
            baseBullets.push(`Module X подтверждает ${ctx.bias === 'bullish' ? 'бычий' : 'медвежий'} bias. Условный вход «${decision.shortLabel}» (${decision.entryStyle}) — разумный вариант.`);
        } else if (baseRow.base === 'breakout_with_trend') {
            baseBullets.push(`Module X видит ${ctx.bias === 'bullish' ? 'бычий' : 'медвежий'} bias с потенциалом пробоя. Breakout Entry согласован с контекстом.`);
        } else if (baseRow.base === 'breakout_against_context') {
            baseBullets.push(`Breakout Entry в направлении, противоположном bias от Module X. Пробой против тренда — высокий риск ложного пробоя.`);
        } else if (baseRow.base === 'risk_managed_with_trend') {
            baseBullets.push(`Module X видит ${ctx.bias === 'bullish' ? 'бычий' : 'медвежий'} bias. Управление размером позиции («${decision.shortLabel}») — дисциплинированный подход.`);
        } else if (baseRow.base === 'partial_in_neutral') {
            baseBullets.push(`Контекст нейтральный (range / у уровня). Partial Position — осторожный вход неполным объёмом уместен.`);
        } else if (baseRow.base === 'counter_in_transition') {
            baseBullets.push(`Module X видит переходную фазу рынка. Контртрендовая сделка в переходе может быть оправдана, но всё равно рискованна.`);
        } else if (baseRow.base === 'neutral') {
            baseBullets.push(`Решение «${decision.shortLabel}» не зависит от направления — это позиционный выбор (дисциплина).`);
        }

        // 4. Модификаторы по сигналам Module X
        const signalResult = _applySignalModifiers(decision, ctx.signals);
        score += signalResult.delta;

        // 5. Модификаторы по evidence
        const evResult = _applyEvidenceModifiers(decision, input.userEvidence || []);
        score += evResult.delta;

        const labels = {
            'breakout':     'пробой уровня',
            'close-above':  'закрытие за уровнем',
            'high-volume':  'повышенный объём',
            'retest':       'ретест',
            'hold':         'удержание уровня',
            'impulse':      'импульс',
            'rejection':    'отбой',
            'low-volume':   'низкий объём',
            'insufficient': 'недостаточные данные'
        };
        const evidenceMisses = [];
        evResult.misses.forEach(missId => {
            const label = labels[missId] || missId;
            evidenceMisses.push(`Для решения «${decision.shortLabel}» требуется подтверждение «${label}», но вы его не отметили.`);
        });
        const evidenceBullets = {
            bulletsMatch: [],
            bulletsMismatch: evResult.misses.map(missId => {
                const label = labels[missId] || missId;
                return `Не отмечено обязательное подтверждение «${label}» — для «${decision.shortLabel}» оно критично.`;
            }),
            evidenceMisses: evidenceMisses
        };
        if (evResult.recommendedTotal > 0 && evResult.recommendedHits < evResult.recommendedTotal) {
            evidenceBullets.bulletsMismatch.push(
                `Из ${evResult.recommendedTotal} рекомендованных подтверждений отмечено только ${evResult.recommendedHits}.`
            );
        }

        // 6. Сборка всех bullets
        const allMatch = baseBullets.concat(signalResult.bulletsMatch);
        const allMismatch = signalResult.bulletsMismatch.concat(evidenceBullets.bulletsMismatch);

        // 7. Финальный verdict
        let verdict, verdictLabel, riskDescription, betterAlternative;
        if (score >= 2) {
            verdict = 'correct';
            verdictLabel = '✓ Correct Decision';
            riskDescription = 'Умеренный риск. Решение согласовано с контекстом и подтверждениями.';
            betterAlternative = null;
        } else if (score >= 0) {
            verdict = 'risky';
            verdictLabel = '~ Risky Decision';
            riskDescription = `Повышенный риск. Решение «${decision.shortLabel}» частично противоречит выводам Module X или не хватает подтверждений.`;
            betterAlternative = _findBetterAlternative(decision, ctx);
        } else {
            verdict = 'incorrect';
            verdictLabel = '✗ Incorrect Decision';
            riskDescription = `Высокий риск. Решение «${decision.shortLabel}» противоречит контексту рынка по выводам Module X.`;
            betterAlternative = _findBetterAlternative(decision, ctx);
        }

        // 8. Сборка результата
        const explanation = _buildExplanation(
            verdict, decision, ctx,
            { bulletsMatch: allMatch, bulletsMismatch: allMismatch },
            evidenceBullets,
            riskDescription,
            betterAlternative
        );

        return {
            verdict: verdict,
            verdictLabel: verdictLabel,
            score: score,
            decision: decision,
            explanation: explanation,
            evidenceAnalysis: {
                modifier: evResult.delta,
                matches: evResult.matches,
                misses: evResult.misses,
                recommendedHits: evResult.recommendedHits,
                recommendedTotal: evResult.recommendedTotal
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
    // Helpers
    // ================================================================

    function _humanizeSignal(sig) {
        const map = {
            'uptrend_structure': 'восходящая структура',
            'downtrend_structure': 'нисходящая структура',
            'range_structure': 'боковая структура',
            'strong_bullish_momentum': 'сильный бычий моментум',
            'strong_bearish_momentum': 'сильный медвежий моментум',
            'volume_climax': 'резкий рост объёма',
            'low_volume': 'низкий объём',
            'at_key_level': 'позиция у ключевого уровня',
            'multiple_level_touches': 'множественные касания уровня',
            'potential_breakout': 'потенциал пробоя',
            'price_above_resistance': 'цена выше сопротивления',
            'price_below_support': 'цена ниже поддержки'
        };
        return map[sig] || sig;
    }

    // ================================================================
    // Экспорт
    // ================================================================

    global.DecisionEvaluationEngine = {
        evaluate: evaluate,
        // Внутренние методы для тестирования и отладки
        _internal: {
            _extractContext: _extractContext,
            _normalizeX: _normalizeX,
            _normalizeLegacy: _normalizeLegacy,
            baseScore: baseScore,
            _applySignalModifiers: _applySignalModifiers,
            _applyEvidenceModifiers: _applyEvidenceModifiers,
            _findBetterAlternative: _findBetterAlternative
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = global.DecisionEvaluationEngine;
    }

})(typeof window !== 'undefined' ? window : globalThis);
