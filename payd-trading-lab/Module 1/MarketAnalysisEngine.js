/**
 * MarketAnalysisEngine — Module 1 (Market Intelligence / Presentation Layer).
 *
 * ════════════════════════════════════════════════════════════════════════
 *  PAYD Trading Lab — Module 1 (финальная интеграция с Module X v1.0.0)
 * ════════════════════════════════════════════════════════════════════════
 *
 *  Назначение:
 *    ТОЛЬКО форматирование AnalysisResult от Module X в человекочитаемое
 *    описание для UI.
 *
 *  Запрещено:
 *    ✗ Анализировать график
 *    ✗ Вычислять тренд, структуру, моментум, объём, волатильность
 *    ✗ Вычислять вероятности, scenarios, signals
 *    ✗ Делать любые собственные аналитические расчёты
 *
 *  Разрешено:
 *    ✓ Вызвать coreAnalysisEngine.analyzeMarket() — единственный источник
 *    ✓ Читать поля AnalysisResult
 *    ✓ Форматировать значения в строки
 *    ✓ Структурировать данные для UI
 *
 *  Вход:  { history: [candles...], level?: number }
 *  Выход: { context, bias, confidence, reasons[], structure, momentum,
 *           volume, volatility, levels, probabilities, keySignals[],
 *           extended, moduleXOutput, meta }
 *
 *  Зависимости:
 *    - coreAnalysisEngine (Module X v1.0.0) — ЕДИНСТВЕННЫЙ источник данных
 */
(function (global) {
    'use strict';

    // ================================================================
    // Доступ к Module X v1.0.0
    // ================================================================

    /**
     * Возвращает экземпляр coreAnalysisEngine.
     * Бросает понятную ошибку, если Module X не загружен.
     */
    function _getX() {
        if (global.coreAnalysisEngine && typeof global.coreAnalysisEngine.analyzeMarket === 'function') {
            return global.coreAnalysisEngine;
        }
        throw new Error('[MarketAnalysisEngine] coreAnalysisEngine (Module X) is not available');
    }

    // ================================================================
    // Helpers форматирования (чисто строковые операции)
    // ================================================================

    function _round(n) {
        return n === null || n === undefined ? null : Math.round(n * 100) / 100;
    }

    function _formatStructureLabel(type) {
        if (type === 'uptrend')        return 'восходящий тренд (HH/HL)';
        if (type === 'downtrend')      return 'нисходящий тренд (LH/LL)';
        if (type === 'range')          return 'боковик (range)';
        if (type === 'consolidation')  return 'консолидация';
        if (type === 'expansion')      return 'расширение волатильности';
        if (type === 'compression')    return 'сжатие волатильности';
        return 'переходная фаза';
    }

    function _formatLevelPosition(pos) {
        if (!pos) return null;
        const fmt = pos.level.toLocaleString('en-US');
        if (pos.position === 'at_level')  return `у ключевого уровня $${fmt}`;
        if (pos.position === 'above_level') return `выше уровня $${fmt} (+${pos.distancePct}%)`;
        return `ниже уровня $${fmt} (${pos.distancePct}%)`;
    }

    /**
     * Форматирует bias из trend + marketStructure в человекочитаемое значение.
     * НЕ вычисляет bias — только читает из AnalysisResult.
     */
    function _readBias(x) {
        // Приоритет: trend.primaryTrend > marketStructure.type
        if (x.trend && x.trend.primaryTrend) {
            const t = x.trend.primaryTrend;
            if (/bull|strong_bull/i.test(t))  return 'bullish';
            if (/bear|strong_bear/i.test(t))  return 'bearish';
        }
        const type = x.marketStructure && x.marketStructure.type;
        if (type === 'uptrend')    return 'bullish';
        if (type === 'downtrend')  return 'bearish';
        return 'neutral';
    }

    /**
     * Confidence в шкале 0..100 из confidence.percent.
     * Если percent отсутствует — берём из confidence (число).
     */
    function _readConfidence(x) {
        const c = x.confidence;
        if (typeof c === 'number') return Math.round(c);
        if (c && typeof c === 'object') {
            if (typeof c.percent === 'number') return Math.round(c.percent);
            if (typeof c.value === 'number')  return Math.round(c.value * 100);
        }
        return null;
    }

    /**
     * Probability continuation в процентах.
     * Читает из AnalysisResult (НЕ вычисляет).
     */
    function _readContinuationPct(x) {
        const p = x.probabilities;
        if (!p) return null;
        if (typeof p.continuation === 'number') {
            return p.continuation <= 1 ? Math.round(p.continuation * 100) : Math.round(p.continuation);
        }
        return null;
    }

    /**
     * Probability reversal в процентах.
     */
    function _readReversalPct(x) {
        const p = x.probabilities;
        if (!p) return null;
        if (typeof p.reversal === 'number') {
            return p.reversal <= 1 ? Math.round(p.reversal * 100) : Math.round(p.reversal);
        }
        return null;
    }

    /**
     * Контекст рынка (читаем marketPhase или fallback на структуру).
     */
    function _readContext(x) {
        if (x.marketPhase && x.marketPhase.phase) return x.marketPhase.phase;
        if (x.marketStructure && x.marketStructure.type) return x.marketStructure.type;
        return 'unknown';
    }

    /**
     * KeySignals — собираем из evidence и smartMoney + priceAction.
     * ТОЛЬКО чтение из AnalysisResult, никаких собственных вычислений.
     */
    function _readKeySignals(x) {
        const signals = [];
        // Из evidence
        if (x.evidence && Array.isArray(x.evidence.keySignals)) {
            signals.push(...x.evidence.keySignals);
        }
        // Из smartMoney: структурные сдвиги
        if (x.smartMoney) {
            if (x.smartMoney.bos) signals.push('bos_detected');
            if (x.smartMoney.choch) signals.push('choch_detected');
            if (Array.isArray(x.smartMoney.orderBlocks) && x.smartMoney.orderBlocks.length > 0) signals.push('order_block_present');
            if (Array.isArray(x.smartMoney.fairValueGaps) && x.smartMoney.fairValueGaps.length > 0) signals.push('fvg_present');
        }
        // Из priceAction: паттерны
        if (x.priceAction && Array.isArray(x.priceAction.patterns) && x.priceAction.patterns.length > 0) {
            signals.push('price_action_pattern');
        }
        // Из momentum: сильный моментум
        if (x.momentum && (x.momentum.signal === 'strong_bull' || x.momentum.signal === 'strong_bullish')) {
            signals.push('strong_bullish_momentum');
        }
        if (x.momentum && (x.momentum.signal === 'strong_bear' || x.momentum.signal === 'strong_bearish')) {
            signals.push('strong_bearish_momentum');
        }
        // Из структуры
        if (x.marketStructure && x.marketStructure.type === 'range') signals.push('range_structure');
        if (x.marketStructure && x.marketStructure.type === 'uptrend') signals.push('uptrend_structure');
        if (x.marketStructure && x.marketStructure.type === 'downtrend') signals.push('downtrend_structure');
        // Volume
        if (x.volume && x.volume.signal === 'climax') signals.push('volume_climax');
        if (x.volume && x.volume.signal === 'low') signals.push('low_volume');
        return signals;
    }

    /**
     * Строит массив reasons — человекочитаемое описание результатов Module X.
     * ТОЛЬКО форматирование.
     */
    function _buildReasons(x) {
        const reasons = [];
        const ms = x.marketStructure || {};
        const mom = x.momentum || {};
        const vol = x.volume || {};
        const vlt = x.volatility || {};
        const sr = x.supportResistance || {};
        const mp = x.marketPhase || {};

        // Структура
        const hhCount = (ms.higherHighs || []).length;
        const hlCount = (ms.higherLows || []).length;
        const lhCount = (ms.lowerHighs || []).length;
        const llCount = (ms.lowerLows || []).length;
        reasons.push(`Структура: ${_formatStructureLabel(ms.type)} (${ms.type}, HH=${hhCount}, HL=${hlCount}, LH=${lhCount}, LL=${llCount})`);

        // Моментум
        if (mom.signal && (mom.rsi !== undefined || mom.value !== undefined)) {
            const rsi = mom.rsi !== undefined ? mom.rsi : (mom.value || '—');
            reasons.push(`Моментум: ${mom.signal} (RSI=${rsi})`);
        }

        // Объём
        if (vol.description) {
            reasons.push(`Объём: ${vol.description} (ratio=${vol.ratio !== undefined ? vol.ratio : '—'})`);
        } else if (vol.signal) {
            reasons.push(`Объём: signal=${vol.signal}`);
        }

        // Волатильность
        if (vlt.description) {
            reasons.push(`Волатильность: ${vlt.description} (ATR=${vlt.atr || '—'})`);
        } else if (vlt.signal) {
            reasons.push(`Волатильность: signal=${vlt.signal}`);
        }

        // Фаза рынка
        if (mp.phase) {
            reasons.push(`Фаза рынка: ${mp.phase}`);
        }

        // Вероятности
        const cont = _readContinuationPct(x);
        if (cont !== null) {
            reasons.push(`Вероятность продолжения текущего движения: ~${cont}%`);
        }

        // Confluence
        if (x.confluence && typeof x.confluence.score === 'number') {
            reasons.push(`Confluence score: ${x.confluence.score} (${x.confluence.grade || '—'})`);
        }

        return reasons;
    }

    // ================================================================
    // Главная точка входа
    // ================================================================

    /**
     * analyze — основная точка входа Module 1.
     * Получает полный анализ от Module X (coreAnalysisEngine.analyzeMarket)
     * и форматирует его для UI.
     *
     * Module 1 НЕ выполняет собственного анализа графика.
     * Только чтение полей AnalysisResult и их форматирование в строки.
     *
     * @param {Object} input
     * @param {Array}  input.history - массив свечей (минимум 10)
     * @param {number} [input.level] - ключевой уровень (опционально)
     * @returns {Object} отформатированный результат для UI
     */
    function analyze(input) {
        const history = (input && input.history) || [];
        const level = input && input.level;

        if (history.length === 0) {
            throw new Error('[MarketAnalysisEngine] history is empty');
        }

        // === Шаг 1: получаем AnalysisResult от Module X (ЕДИНСТВЕННЫЙ источник) ===
        const x = _getX().analyzeMarket({
            candles: history,
            level: level,
            timeframe: 'unknown'
        });

        if (!x) return null;

        // Обработка ошибки "недостаточно данных" от Module X
        if (x.error) {
            throw new Error(`[MarketAnalysisEngine] Module X error: ${x.error}`);
        }

        // === Шаг 2: читаем готовые поля из AnalysisResult ===
        const bias         = _readBias(x);
        const confidence   = _readConfidence(x);
        const context      = _readContext(x);
        const continuation = _readContinuationPct(x);
        const reversal     = _readReversalPct(x);
        const keySignals   = _readKeySignals(x);

        // === Шаг 3: форматируем секции для UI ===
        const structure = {
            type:    x.marketStructure ? x.marketStructure.type : 'unknown',
            label:   _formatStructureLabel(x.marketStructure ? x.marketStructure.type : null),
            higherHighs: (x.marketStructure && x.marketStructure.higherHighs) || [],
            higherLows:  (x.marketStructure && x.marketStructure.higherLows)  || [],
            lowerHighs:  (x.marketStructure && x.marketStructure.lowerHighs)  || [],
            lowerLows:   (x.marketStructure && x.marketStructure.lowerLows)   || [],
            swings:      (x.marketStructure && x.marketStructure.swings)      || [],
            structureShift: (x.marketStructure && x.marketStructure.structureShift) || null,
            summary: (x.marketStructure && x.marketStructure.summary) || ''
        };

        const momentum = {
            signal:     x.momentum ? x.momentum.signal : 'neutral',
            strength:   x.momentum ? x.momentum.strength : null,
            rsi:        x.momentum ? x.momentum.rsi : null,
            value:      x.momentum ? x.momentum.value : null,
            description: x.momentum ? (x.momentum.description || x.momentum.signal) : ''
        };

        const volume = {
            signal:      x.volume ? x.volume.signal : 'neutral',
            ratio:       x.volume ? x.volume.ratio : null,
            current:     x.volume ? x.volume.current : null,
            average:     x.volume ? x.volume.average : null,
            description: x.volume ? (x.volume.description || x.volume.signal) : ''
        };

        const volatility = {
            signal:      x.volatility ? x.volatility.signal : 'neutral',
            atr:         x.volatility ? x.volatility.atr : null,
            atrPercent:  x.volatility ? x.volatility.atrPercent : null,
            description: x.volatility ? (x.volatility.description || x.volatility.signal) : ''
        };

        const levels = {
            support:    ((x.supportResistance && x.supportResistance.supports)    || []).map(s => ({ price: s.price, strength: s.strength })),
            resistance: ((x.supportResistance && x.supportResistance.resistances) || []).map(r => ({ price: r.price, strength: r.strength }))
        };

        // Позиция относительно уровня (если уровень передан)
        const levelPosition = level !== undefined
            ? {
                level: level,
                distancePct: (() => {
                    const last = history[history.length - 1].close;
                    return _round(((last - level) / level) * 100);
                })(),
                position: (() => {
                    const last = history[history.length - 1].close;
                    const diff = Math.abs(last - level);
                    const tolerance = (level * 0.001);
                    if (diff <= tolerance) return 'at_level';
                    return last > level ? 'above_level' : 'below_level';
                })()
            }
            : null;

        const probabilities = {
            continuation: continuation,
            reversal: reversal
        };

        // === Шаг 4: формируем reasons ===
        const reasons = _buildReasons(x);

        // === Шаг 5: расширенные данные Module X для детального UI ===
        const extendedData = {
            structure: structure,
            trend:             x.trend             || null,
            smartMoney:        x.smartMoney        || null,
            priceAction:       x.priceAction       || null,
            liquidity:         x.liquidity         || null,
            supportResistance: x.supportResistance || null,
            momentum:          x.momentum          || null,
            probability:       x.probabilities     || null,
            scenarios:         x.scenarios         || [],
            confidence:        x.confidence        || null,
            confluence:        x.confluence        || null,
            riskAssessment:    x.riskAssessment    || null,
            invalidation:      x.invalidation      || null,
            marketPhase:       x.marketPhase       || null,
            executionPlan:     x.executionPlan     || null
        };

        // === Шаг 6: финальный результат ===
        return {
            // Основные поля
            context: context,
            bias: bias,
            confidence: confidence,
            reasons: reasons,

            // Детальные поля
            structure: structure,
            momentum: momentum,
            volume: volume,
            volatility: volatility,
            levels: levels,
            levelPosition: levelPosition,
            probabilities: probabilities,
            keySignals: keySignals,

            // Расширенные данные Module X
            extended: extendedData,
            moduleXOutput: x,

            // Метаданные
            meta: {
                analyzedAt: new Date().toISOString(),
                candlesCount: history.length,
                currentPrice: _round(history[history.length - 1].close),
                poweredBy: 'Module X v1.0.0 (coreAnalysisEngine)'
            }
        };
    }

    // ================================================================
    // Экспорт
    // ================================================================

    global.MarketAnalysisEngine = { analyze: analyze };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = global.MarketAnalysisEngine;
    }

})(typeof window !== 'undefined' ? window : globalThis);
