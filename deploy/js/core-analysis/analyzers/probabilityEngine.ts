/**
 * probabilityEngine.ts — Module X / Engine #2
 *
 * Назначение: детерминированный расчёт вероятностей направления (bullish/bearish/neutral)
 *              на основе Confluence Engine. Без случайных весов.
 *
 * Зависимости: confluenceEngine.
 * Используется: scenarioGenerator, confidenceEngine.
 *
 * Публичный API:
 *   - calculateProbabilities(confluence: ConfluenceResult, marketContext?: any): ProbabilityResult
 *
 * Гарантии:
 *   - Сумма (bullish + bearish + neutral) === 100 (округление скомпенсировано).
 *   - Никакого Math.random() — все веса детерминированы.
 *   - Базовый уровень 33/33/34 при отсутствии данных.
 */

interface ProbabilityInputs {
    confluenceScore: number;          // 0..100
    netScore: number;                 // -1..1 (bull-bear)
    dominantDirection: 'bullish' | 'bearish' | 'neutral';
    bullWeight: number;
    bearWeight: number;
    conflictingCount: number;
    bullishCount: number;
    bearishCount: number;
    neutralCount: number;
    alignmentPercent: number;
    sourcesCount: number;
}

interface MarketContext {
    trend?: { primaryTrend: string; strength: number };
    volatility?: { regime: string };
    momentum?: { rsi: number };
    volume?: { regime: string; bias: string };
}

interface ProbabilityResult {
    bullish: number;       // 0..100
    bearish: number;       // 0..100
    neutral: number;       // 0..100
    confidence: number;    // 0..100
    expected: 'bullish' | 'bearish' | 'neutral';
    breakdown: {
        confluenceContribution: number;
        netDirectionContribution: number;
        trendContribution: number;
        momentumContribution: number;
        volumeContribution: number;
        volatilityContribution: number;
        conflictPenalty: number;
    };
}

(function (global: any) {
    'use strict';

    // ============================================================
    // КОНФИГУРАЦИЯ ВЕСОВ (сумма ≤ 1.0; остаток — на нейтральную часть)
    // ============================================================
    const WEIGHTS = {
        CONFLUENCE: 0.30,
        NET_DIRECTION: 0.30,
        TREND: 0.15,
        MOMENTUM: 0.10,
        VOLUME: 0.10,
        VOLATILITY: 0.05,
        CONFLICT_PENALTY: 0.20     // Штраф за конфликты (вычитается из направленной части)
    };

    // ============================================================
    // ОСНОВНАЯ ЛОГИКА
    // ============================================================
    function calculateProbabilities(confluence: any, marketContext?: MarketContext): ProbabilityResult {
        // Базовый результат при отсутствии данных
        const baseResult: ProbabilityResult = {
            bullish: 33.34,
            bearish: 33.33,
            neutral: 33.33,
            confidence: 0,
            expected: 'neutral',
            breakdown: {
                confluenceContribution: 0,
                netDirectionContribution: 0,
                trendContribution: 0,
                momentumContribution: 0,
                volumeContribution: 0,
                volatilityContribution: 0,
                conflictPenalty: 0
            }
        };

        if (!confluence || typeof confluence !== 'object') return baseResult;

        // 1. Confluence contribution (0..1) — насколько сильное совпадение
        // confluenceScore 0..100 → 0..1
        const confScore = (typeof confluence.confluenceScore === 'number' ? confluence.confluenceScore : 0) / 100;
        // 0 = все нейтрально, 1 = все в одну сторону
        const confluenceContribution = confScore;

        // 2. Net direction contribution (-1..1)
        const netScore = typeof confluence.netScore === 'number' ? confluence.netScore : 0;

        // 3. Trend contribution (-1..1)
        let trendContribution = 0;
        if (marketContext?.trend) {
            const t = marketContext.trend;
            if (t.primaryTrend === 'strong_bull' || t.primaryTrend === 'bull') trendContribution = (t.strength || 0.5);
            else if (t.primaryTrend === 'strong_bear' || t.primaryTrend === 'bear') trendContribution = -(t.strength || 0.5);
        }

        // 4. Momentum contribution (-1..1)
        let momentumContribution = 0;
        if (marketContext?.momentum) {
            const rsi = marketContext.momentum.rsi;
            if (rsi !== undefined) {
                if (rsi < 30) momentumContribution = (30 - rsi) / 30;     // Бычий (перепродан)
                else if (rsi > 70) momentumContribution = -(rsi - 70) / 30; // Медвежий (перекуплен)
                else if (rsi >= 50) momentumContribution = (rsi - 50) / 40;
                else momentumContribution = -(50 - rsi) / 40;
                momentumContribution = Math.max(-1, Math.min(1, momentumContribution));
            }
        }

        // 5. Volume contribution (-1..1)
        let volumeContribution = 0;
        if (marketContext?.volume) {
            const v = marketContext.volume;
            if (v.bias === 'bullish') volumeContribution = 0.7;
            else if (v.bias === 'bearish') volumeContribution = -0.7;
            if (v.regime === 'climax') volumeContribution *= 0.5; // Климакс — нейтрализует
        }

        // 6. Volatility contribution (-1..1)
        let volatilityContribution = 0;
        if (marketContext?.volatility) {
            const va = marketContext.volatility;
            if (va.regime === 'extreme_low' || va.regime === 'low') {
                // Сжатие — неопределённость, склоняем к нейтральности (не вносим вклад)
                volatilityContribution = 0;
            } else if (va.regime === 'extreme_high') {
                // Экстремальная волатильность — неопределённость
                volatilityContribution = 0;
            }
        }

        // 7. Conflict penalty (0..1) — чем больше конфликтов, тем меньше уверенность
        const conflictCount = confluence.conflictingCount || 0;
        const conflictPenalty = Math.min(1, conflictCount / 10);

        // ============================================================
        // СБОРКА ВЕРОЯТНОСТЕЙ
        // ============================================================
        // Взвешенная сумма направленных сигналов
        const directionalScore =
            (confluenceContribution * WEIGHTS.CONFLUENCE) * (netScore) +
            (confluenceContribution * WEIGHTS.CONFLUENCE) * (-(1 - Math.abs(netScore)) * 0.1) + // небольшая примесь neutral из conf
            trendContribution * WEIGHTS.TREND +
            momentumContribution * WEIGHTS.MOMENTUM +
            volumeContribution * WEIGHTS.VOLUME +
            volatilityContribution * WEIGHTS.VOLATILITY;

        // Применяем штраф за конфликты (уменьшаем амплитуду)
        const damped = directionalScore * (1 - conflictPenalty * WEIGHTS.CONFLICT_PENALTY);
        const clamped = Math.max(-1, Math.min(1, damped));

        // Распределение: 50% базово нейтрально, остальное — направленно
        // confidence основан на |directionalScore|
        const baseNeutral = 0.34;       // 34% нейтральности по умолчанию
        const confidence = Math.abs(clamped);

        // Направленная часть распределяется между bullish/bearish
        // baseNeutral и directedWeight — десятичные дроби в диапазоне 0..1.
        // Чтобы получить значения в шкале 0..100 и гарантировать сумму = 100,
        // умножаем на (100 - neutralPct) = 95.
        // Это обеспечивает bearPct/bullPct >= 0 даже при максимальной уверенности.
        let bullPct: number, bearPct: number, neutralPct: number;

        if (clamped > 0) {
            // Бычий сценарий
            const directedWeight = (1 - baseNeutral) * (0.5 + 0.5 * confidence);
            bullPct = (baseNeutral + directedWeight) * (100 - 5);
            bearPct = 100 - bullPct - 5; // остаток уходит медвежьей части
            neutralPct = 5;
        } else if (clamped < 0) {
            // Медвежий сценарий
            const directedWeight = (1 - baseNeutral) * (0.5 + 0.5 * confidence);
            bearPct = (baseNeutral + directedWeight) * (100 - 5);
            bullPct = 100 - bearPct - 5;
            neutralPct = 5;
        } else {
            // Полностью нейтрально
            bullPct = 33.34;
            bearPct = 33.33;
            neutralPct = 33.33;
        }

        // Нормализация: сумма должна быть ровно 100
        const total = bullPct + bearPct + neutralPct;
        if (total !== 100) {
            const factor = 100 / total;
            bullPct *= factor;
            bearPct *= factor;
            neutralPct *= factor;
        }

        // Округление до 2 знаков и коррекция для строгого равенства 100
        bullPct = Math.round(bullPct * 100) / 100;
        bearPct = Math.round(bearPct * 100) / 100;
        neutralPct = Math.round(neutralPct * 100) / 100;
        // Корректируем остаток
        const sumRounded = bullPct + bearPct + neutralPct;
        if (sumRounded !== 100) {
            neutralPct += (100 - sumRounded);
            neutralPct = Math.round(neutralPct * 100) / 100;
        }

        // Ожидаемое направление
        let expected: 'bullish' | 'bearish' | 'neutral';
        if (bullPct > bearPct && bullPct > neutralPct) expected = 'bullish';
        else if (bearPct > bullPct && bearPct > neutralPct) expected = 'bearish';
        else expected = 'neutral';

        // Confidence (0..100)
        const conf = Math.round(confidence * 100 * (1 - conflictPenalty * 0.5));

        return {
            bullish: Math.max(0, Math.min(100, bullPct)),
            bearish: Math.max(0, Math.min(100, bearPct)),
            neutral: Math.max(0, Math.min(100, neutralPct)),
            confidence: Math.max(0, Math.min(100, conf)),
            expected,
            breakdown: {
                confluenceContribution: confluenceContribution * WEIGHTS.CONFLUENCE,
                netDirectionContribution: netScore * WEIGHTS.CONFLUENCE,
                trendContribution: trendContribution * WEIGHTS.TREND,
                momentumContribution: momentumContribution * WEIGHTS.MOMENTUM,
                volumeContribution: volumeContribution * WEIGHTS.VOLUME,
                volatilityContribution: volatilityContribution * WEIGHTS.VOLATILITY,
                conflictPenalty: conflictPenalty * WEIGHTS.CONFLICT_PENALTY
            }
        };
    }

    // ============================================================
    // ПУБЛИЧНЫЙ API
    // ============================================================
    const probabilityEngine = {
        calculate: calculateProbabilities,
        calculateProbabilities: calculateProbabilities,
        VERSION: '2.0.0',
        CONFIG: { WEIGHTS }
    };

    if (typeof global !== 'undefined') global.probabilityEngine = probabilityEngine;
    if (typeof window !== 'undefined') (window as any).probabilityEngine = probabilityEngine;
    if (typeof module !== 'undefined' && module.exports) module.exports = probabilityEngine;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : globalThis));
