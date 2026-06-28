/**
 * confidenceEngine.ts — Module X / Engine #3
 *
 * Назначение: рассчитывает общий показатель confidence (0..1) на основе
 *              6 факторов качества: подтверждения, сила, конфликты,
 *              качество структуры, объёмов, тренда, ликвидности.
 *
 * Зависимости: confluenceEngine, probabilityEngine, results всех анализаторов.
 * Используется: финальный агрегатор в coreAnalysisEngine.ts.
 *
 * Публичный API:
 *   - calculateConfidence(inputs: ConfidenceInputs): ConfidenceResult
 *
 * Возвращает: число 0..1 + breakdown по факторам.
 */

interface ConfidenceInputs {
    confluence?: any;                  // Результат Confluence Engine (ConfluenceResult)
    probability?: any;                 // Результат Probability Engine (ProbabilityResult)
    marketStructure?: { type: string; structureShift?: any };
    trend?: { primaryTrend: string; strength: number; adx?: number };
    momentum?: { rsi: number; macdHistogram: number };
    priceAction?: { totalPatterns: number; bullishPatterns: any[]; bearishPatterns: any[] };
    smartMoney?: {
        bos: any[]; choch: any[]; mss: any[]; orderBlocks: any[];
        fairValueGaps: any[]; liquiditySweeps: any[];
        internalTrend?: string;
    };
    volume?: {
        bias: string; regime: string;
        buyingPressure: number; sellingPressure: number;
        volumeSpike?: boolean;
        divergences?: any[];
    };
    liquidity?: { bias: string; stopHunts: any[]; liquidityGrabs: any[]; liquidityVoids: any[] };
    volatility?: {
        regime: string; bias: string;
        inSqueeze?: boolean; squeezeStrength?: number;
    };
    supportResistance?: { pricePosition: string; nearestSupport?: any; nearestResistance?: any };
    scenarios?: Array<{ applicable: boolean; confidence: number; priority: number }>;
}

interface ConfidenceFactor {
    name: string;
    score: number;        // 0..1
    weight: number;       // 0..1
    contribution: number; // score * weight
    description: string;
}

interface ConfidenceResult {
    confidence: number;            // 0..1
    percent: number;               // 0..100
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    factors: ConfidenceFactor[];
    penalties: string[];
    bonuses: string[];
    summary: string;
}

(function (global: any) {
    'use strict';

    // ============================================================
    // КОНФИГУРАЦИЯ ВЕСОВ (сумма = 1.0)
    // ============================================================
    const WEIGHTS = {
        CONFIRMATIONS: 0.25,   // Кол-во совпадающих сигналов
        STRENGTH: 0.15,        // Сила основного сигнала
        NO_CONFLICTS: 0.15,    // Отсутствие конфликтов
        STRUCTURE: 0.15,       // Качество структуры рынка
        VOLUME: 0.10,          // Качество объёмов
        TREND: 0.10,           // Сила тренда
        LIQUIDITY: 0.10        // Наличие ликвидности
    };

    // ============================================================
    // ФАКТОР 1: Подтверждения (кол-во сигналов в одном направлении)
    // ============================================================
    function factorConfirmations(inputs: ConfidenceInputs): ConfidenceFactor {
        const conf = inputs.confluence || {};
        const bullCount = conf.bullishCount || 0;
        const bearCount = conf.bearishCount || 0;
        const maxDir = Math.max(bullCount, bearCount);
        // 0 сигналов → 0; 5+ сигналов → 1
        const score = Math.min(1, maxDir / 5);
        return {
            name: 'Confirmations',
            score,
            weight: WEIGHTS.CONFIRMATIONS,
            contribution: score * WEIGHTS.CONFIRMATIONS,
            description: `${maxDir} направленных сигналов в одном направлении`
        };
    }

    // ============================================================
    // ФАКТОР 2: Сила основного сигнала
    // ============================================================
    function factorStrength(inputs: ConfidenceInputs): ConfidenceFactor {
        const conf = inputs.confluence || {};
        const score = Math.min(1, Math.abs(conf.netScore || 0));
        return {
            name: 'Signal Strength',
            score,
            weight: WEIGHTS.STRENGTH,
            contribution: score * WEIGHTS.STRENGTH,
            description: `Чистая направленность: ${(score * 100).toFixed(0)}%`
        };
    }

    // ============================================================
    // ФАКТОР 3: Отсутствие конфликтов
    // ============================================================
    function factorNoConflicts(inputs: ConfidenceInputs): ConfidenceFactor {
        const conf = inputs.confluence || {};
        const conflicts = conf.conflictingCount || 0;
        // 0 конфликтов → 1; 10+ конфликтов → 0
        const score = Math.max(0, 1 - conflicts / 10);
        return {
            name: 'No Conflicts',
            score,
            weight: WEIGHTS.NO_CONFLICTS,
            contribution: score * WEIGHTS.NO_CONFLICTS,
            description: `${conflicts} конфликтующих пар сигналов`
        };
    }

    // ============================================================
    // ФАКТОР 4: Качество структуры рынка
    // ============================================================
    function factorStructure(inputs: ConfidenceInputs): ConfidenceFactor {
        let score = 0;
        const ms = inputs.marketStructure;
        if (ms) {
            if (ms.type === 'uptrend' || ms.type === 'downtrend') score += 0.5;
            if (ms.structureShift?.type) score += 0.3;
        }
        const sm = inputs.smartMoney;
        if (sm) {
            if ((sm.bos?.length || 0) > 0) score += 0.1;
            if ((sm.choch?.length || 0) > 0) score += 0.1;
        }
        score = Math.min(1, score);
        return {
            name: 'Market Structure',
            score,
            weight: WEIGHTS.STRUCTURE,
            contribution: score * WEIGHTS.STRUCTURE,
            description: ms ? `Тип структуры: ${ms.type}` : 'Структура не определена'
        };
    }

    // ============================================================
    // ФАКТОР 5: Качество объёмов
    // ============================================================
    function factorVolume(inputs: ConfidenceInputs): ConfidenceFactor {
        let score = 0;
        const v = inputs.volume;
        if (v) {
            if (v.regime === 'high_volume' || v.regime === 'climax') score += 0.3;
            if (v.bias !== 'neutral') score += 0.3;
            // Давление > 0.6 или < 0.4 → сильное
            const pressure = v.buyingPressure || 0.5;
            if (pressure > 0.6 || pressure < 0.4) score += 0.2;
            if (v.volumeSpike) score += 0.2;
        }
        score = Math.min(1, score);
        return {
            name: 'Volume Quality',
            score,
            weight: WEIGHTS.VOLUME,
            contribution: score * WEIGHTS.VOLUME,
            description: v ? `Bias: ${v.bias}, regime: ${v.regime}` : 'Объём не определён'
        };
    }

    // ============================================================
    // ФАКТОР 6: Сила тренда
    // ============================================================
    function factorTrend(inputs: ConfidenceInputs): ConfidenceFactor {
        let score = 0;
        const t = inputs.trend;
        if (t) {
            if (t.primaryTrend === 'strong_bull' || t.primaryTrend === 'strong_bear') score += 0.5;
            else if (t.primaryTrend === 'bull' || t.primaryTrend === 'bear') score += 0.3;
            score += Math.min(0.3, (t.strength || 0) * 0.3);
            if (t.adx && t.adx > 25) score += 0.2;
        }
        score = Math.min(1, score);
        return {
            name: 'Trend Strength',
            score,
            weight: WEIGHTS.TREND,
            contribution: score * WEIGHTS.TREND,
            description: t ? `Trend: ${t.primaryTrend}, strength ${(t.strength || 0).toFixed(2)}` : 'Тренд не определён'
        };
    }

    // ============================================================
    // ФАКТОР 7: Ликвидность
    // ============================================================
    function factorLiquidity(inputs: ConfidenceInputs): ConfidenceFactor {
        let score = 0;
        const l = inputs.liquidity;
        if (l) {
            if (l.bias !== 'neutral') score += 0.4;
            const hunts = (l.stopHunts?.length || 0) + (l.liquidityGrabs?.length || 0);
            if (hunts > 0) score += Math.min(0.3, hunts * 0.1);
            if ((l.liquidityVoids?.length || 0) > 0) score += 0.3;
        }
        score = Math.min(1, score);
        return {
            name: 'Liquidity',
            score,
            weight: WEIGHTS.LIQUIDITY,
            contribution: score * WEIGHTS.LIQUIDITY,
            description: l ? `Bias: ${l.bias}` : 'Ликвидность не определена'
        };
    }

    // ============================================================
    // БОНУСЫ И ШТРАФЫ
    // ============================================================
    function calcBonusesPenalties(inputs: ConfidenceInputs, factors: ConfidenceFactor[]): { bonuses: string[]; penalties: string[] } {
        const bonuses: string[] = [];
        const penalties: string[] = [];

        const sm = inputs.smartMoney;
        if (sm?.choch && sm.choch.length > 0) bonuses.push('CHoCH подтверждение');
        if (sm?.mss && sm.mss.length > 0) bonuses.push('MSS подтверждение');

        const v = inputs.volume;
        if (v?.divergences && v.divergences.length > 0) bonuses.push('Volume divergence');

        const va = inputs.volatility;
        if (va?.inSqueeze && va.squeezeStrength > 0.6) bonuses.push('Volatility squeeze');

        const pa = inputs.priceAction;
        if (pa && pa.totalPatterns >= 3) bonuses.push(`Множественные PA паттерны (${pa.totalPatterns})`);

        const conf = inputs.confluence;
        if (conf?.confluenceScore >= 70) bonuses.push('High confluence score');
        if (conf?.conflictingCount >= 5) penalties.push('Множественные конфликты');

        return { bonuses, penalties };
    }

    // ============================================================
    // ОСНОВНАЯ ФУНКЦИЯ
    // ============================================================
    function calculateConfidence(inputs: ConfidenceInputs): ConfidenceResult {
        const empty: ConfidenceResult = {
            confidence: 0,
            percent: 0,
            grade: 'F',
            factors: [],
            penalties: [],
            bonuses: [],
            summary: 'Нет данных для расчёта confidence'
        };

        if (!inputs) return empty;

        // Собираем все факторы
        const factors: ConfidenceFactor[] = [
            factorConfirmations(inputs),
            factorStrength(inputs),
            factorNoConflicts(inputs),
            factorStructure(inputs),
            factorVolume(inputs),
            factorTrend(inputs),
            factorLiquidity(inputs)
        ];

        // Итоговый confidence (0..1)
        const rawScore = factors.reduce((sum, f) => sum + f.contribution, 0);

        // Бонусы/штрафы
        const { bonuses, penalties } = calcBonusesPenalties(inputs, factors);
        const bonusMult = Math.min(0.15, bonuses.length * 0.03);
        const penaltyMult = Math.min(0.20, penalties.length * 0.05);

        const finalScore = Math.max(0, Math.min(1, rawScore + bonusMult - penaltyMult));
        const percent = Math.round(finalScore * 100);

        // Grade
        let grade: 'A' | 'B' | 'C' | 'D' | 'F';
        if (percent >= 85) grade = 'A';
        else if (percent >= 70) grade = 'B';
        else if (percent >= 55) grade = 'C';
        else if (percent >= 40) grade = 'D';
        else grade = 'F';

        const summary = `Confidence ${percent}% (${grade}): ${factors.filter(f => f.score >= 0.7).length}/${factors.length} сильных факторов, ${bonuses.length} бонусов, ${penalties.length} штрафов`;

        return {
            confidence: finalScore,
            percent,
            grade,
            factors,
            bonuses,
            penalties,
            summary
        };
    }

    // ============================================================
    // ПУБЛИЧНЫЙ API
    // ============================================================
    const confidenceEngine = {
        calculate: calculateConfidence,
        calculateConfidence: calculateConfidence,
        VERSION: '2.0.0',
        CONFIG: { WEIGHTS }
    };

    if (typeof global !== 'undefined') global.confidenceEngine = confidenceEngine;
    if (typeof window !== 'undefined') (window as any).confidenceEngine = confidenceEngine;
    if (typeof module !== 'undefined' && module.exports) module.exports = confidenceEngine;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : globalThis));
