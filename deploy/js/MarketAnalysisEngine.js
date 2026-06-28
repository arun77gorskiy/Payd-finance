/**
 * MarketAnalysisEngine — Module 1 (Market Intelligence / Presentation Layer).
 *
 * Назначение:
 *   ТОЛЬКО форматирование результатов Module X (coreAnalysisEngine)
 *   в человекочитаемое описание для UI.
 *
 *   Модуль НЕ выполняет никакого собственного анализа графика.
 *   Вся аналитика (структура, тренд, моментум, объём, волатильность,
 *   позиция у уровня, signals, scenarios) уже вычислена в Module X.
 *
 *   Это «слой представления»:
 *     - Module X = источник всех данных (chart → structured analysis)
 *     - Module 1 = перевод структурированного объекта в строки для UI
 *     - Module 2 = валидация решений пользователя
 *     - Module 3 = анализ ошибок пользователя
 *
 * Вход:  { history: [candles...], level?: number }
 * Выход: { context, bias, confidence, reasons[], structure, momentum, volume,
 *          volatility, levels, probabilities, keySignals[],
 *          extended, moduleXOutput, meta }
 *
 * Зависимости:
 *   - coreAnalysisEngine (Module X) — ЕДИНСТВЕННЫЙ источник данных
 */
(function (global) {
    'use strict';

    // ================================================================
    // Доступ к Module X
    // ================================================================

    function _getX() {
        if (global.coreAnalysisEngine) return global.coreAnalysisEngine;
        // fallback на старое имя на период миграции
        if (global.CoreAnalysisEngine) return global.CoreAnalysisEngine;
        throw new Error('[MarketAnalysisEngine] coreAnalysisEngine is not available');
    }

    // ================================================================
    // Форматирование — чисто строковые операции, без вычислений
    // ================================================================

    function _round(n) { return Math.round(n * 100) / 100; }

    function _formatStructureLabel(label) {
        return label === 'uptrend' ? 'восходящий тренд (HH/HL)'
             : label === 'downtrend' ? 'нисходящий тренд (LH/LL)'
             : label === 'range' ? 'боковик'
             : 'переходная фаза';
    }

    function _formatLevelPosition(pos) {
        if (!pos) return null;
        const fmt = pos.level.toLocaleString('en-US');
        if (pos.position === 'at_level') {
            return `у ключевого уровня $${fmt}`;
        }
        if (pos.position === 'above_level') {
            return `выше уровня $${fmt} (+${pos.distancePct}%)`;
        }
        return `ниже уровня $${fmt} (${pos.distancePct}%)`;
    }

    /**
     * Построить массив reasons — человекочитаемое описание результатов Module X.
     * Только форматирование, никаких вычислений.
     */
    function _buildReasons(x, interp, currentPrice) {
        const reasons = [];
        const s = x.structure;
        const m = x.momentum;
        const v = x.volume;
        const vol = x.volatility;
        const prob = x.summary.probabilities;
        const keySignals = x.summary.keySignals;

        // Структура — берём label из Module X
        reasons.push('Структура: ' + _formatStructureLabel(interp.structureLabel)
            + ` (${s.type}, HH=${s.hh}, HL=${s.hl}, LH=${s.lh}, LL=${s.ll})`);

        // Моментум — description из Module X
        reasons.push(`Моментум: ${m.description} (RSI=${m.rsi}, signal=${interp.momentumSignal})`);

        // Объём — описание из Module X
        reasons.push(`Объём: ${v.description} (ratio=${v.ratio}, trend=${interp.volumeTrend})`);

        // Волатильность
        reasons.push(`Волатильность: ${vol.description} (signal=${interp.volatilitySignal})`);

        // Позиция относительно уровня
        const posStr = _formatLevelPosition(interp.position);
        if (posStr) reasons.push('Позиция: цена ' + posStr);

        // Вероятности из Module X
        reasons.push(`Вероятность продолжения текущего движения: ~${prob.continuation}%`);

        // Дополнительные факторы — просто проверка наличия в keySignals
        if (keySignals.includes('volume_climax')) {
            reasons.push('⚠ Резкий рост объёма — возможен кульминационный момент');
        }
        if (keySignals.includes('multiple_level_touches')) {
            reasons.push('Несколько касаний уровня — сопротивление/поддержка сильная');
        }
        if (keySignals.includes('potential_breakout')) {
            reasons.push('Потенциал пробоя — моментум и позиция у уровня совпали');
        }
        if (keySignals.includes('low_volume')) {
            reasons.push('Низкий объём — движение может быть неподтверждённым');
        }

        return reasons;
    }

    // ================================================================
    // Главная точка входа — вызывает Module X, форматирует результат
    // ================================================================

    /**
     * analyze — основная точка входа Module 1.
     * Получает полный анализ от Module X (coreAnalysisEngine.analyzeMarket)
     * и форматирует его для UI.
     *
     * Module 1 НЕ выполняет собственного анализа графика.
     * Только чтение полей AnalysisResult и их форматирование в строки.
     */
    function analyze(input) {
        const history = (input && input.history) || [];
        const level = input && input.level;

        if (history.length === 0) {
            throw new Error('[MarketAnalysisEngine] history is empty');
        }

        // === Получаем полный анализ от Module X (КАННОНИЧЕСКИЙ ВХОД) ===
        // analyzeMarket() — единственная точка входа Module X.
        // Любая аналитика (тренд, SMC, моментум, объём, уровни, вероятности)
        // выполняется ТОЛЬКО внутри coreAnalysisEngine. Module 1 НИЧЕГО не считает.
        const x = _getX().analyzeMarket({ history: history, level: level });
        if (!x) return null;

        // Проверяем, что Module X вернул интерпретации
        if (!x.interpretations) {
            throw new Error('[MarketAnalysisEngine] Module X output missing interpretations');
        }

        const interp = x.interpretations;
        const currentPrice = history[history.length - 1].close;

        // === Форматируем старые поля для обратной совместимости ===
        // Все берутся из Module X без пересчёта

        const structure = {
            structure: interp.structureLabel,
            hh: x.structure.hh,
            hl: x.structure.hl,
            lh: x.structure.lh,
            ll: x.structure.ll
        };

        const momentum = {
            signal: interp.momentumSignal,
            strength: x.momentum.strength,
            description: x.momentum.description,
            rsi: x.momentum.rsi
        };

        const volume = {
            trend: interp.volumeTrend,
            ratio: x.volume.ratio,
            current: x.volume.current,
            average: x.volume.average,
            description: x.volume.description
        };

        const volatility = {
            signal: interp.volatilitySignal,
            atr: x.volatility.atr,
            percent: x.volatility.atrPercent,
            description: x.volatility.description
        };

        const levels = {
            support: x.levels.supports.map(s => ({ price: s.price, strength: s.strength })),
            resistance: x.levels.resistances.map(r => ({ price: r.price, strength: r.strength }))
        };

        const probabilities = {
            continuation: x.summary.probabilities.continuation,
            reversal: x.summary.probabilities.reversal
        };

        const keySignals = x.summary.keySignals;

        // === Формируем reasons ===
        const reasons = _buildReasons(x, interp, currentPrice);

        // === Дополнительные данные из Module X (для расширенного UI) ===
        const extendedData = {
            structureShift: x.structure.structureShift,
            swings: x.structure.swings,
            smc: {
                bos: x.smc.bos,
                choch: x.smc.choch,
                orderBlocks: x.smc.orderBlocks,
                fairValueGaps: x.smc.fairValueGaps,
                liquiditySweeps: x.smc.liquiditySweeps,
                displacement: x.smc.displacement,
                buySideLiquidity: x.smc.buySideLiquidity,
                sellSideLiquidity: x.smc.sellSideLiquidity,
                premiumZone: x.smc.premiumZone,
                discountZone: x.smc.discountZone
            },
            trend: x.trend,
            liquidity: x.liquidity,
            probability: x.probability,
            scenarios: x.scenarios,
            priceAction: x.priceAction,
            interpretations: interp
        };

        return {
            // ---- Основные поля (обратная совместимость) ----
            context: x.summary.context,
            bias: x.summary.bias,
            confidence: x.summary.confidence,
            reasons: reasons,

            // ---- Детальные поля ----
            structure: structure,
            momentum: momentum,
            volume: volume,
            volatility: volatility,
            levels: levels,
            levelPosition: interp.position,
            probabilities: probabilities,
            keySignals: keySignals,

            // ---- Расширенные данные Module X ----
            extended: extendedData,
            moduleXOutput: x,

            // ---- Метаданные ----
            meta: {
                analyzedAt: new Date().toISOString(),
                candlesCount: history.length,
                currentPrice: _round(currentPrice),
                poweredBy: 'Module X (coreAnalysisEngine)'
            }
        };
    }

    global.MarketAnalysisEngine = { analyze: analyze };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = global.MarketAnalysisEngine;
    }

})(typeof window !== 'undefined' ? window : globalThis);
