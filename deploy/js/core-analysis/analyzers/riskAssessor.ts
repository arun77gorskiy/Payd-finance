/**
 * riskAssessor.ts — Module X / Analyzer #14 (v2.0.0)
 *
 * Назначение: оценивает риск сценария (Low / Medium / High) и его причины.
 *              5 факторов: volatility, volume, conflict, counterTrend, liquidity.
 *
 * Зависимости: marketStructure, trend, volatility, volume, momentum, liquidity,
 *              scenarios, probabilities.
 * Используется: executionPlanBuilder.
 *
 * Публичный API:
 *   - assessRisk(inputs: RiskInputs): RiskAssessment
 */

interface RAInputs {
    marketStructure?: any;
    trend?: any;
    volatility?: { atrExpansion: boolean; atrCompression: boolean };
    volume?: { ratio?: number; buyingPressure: number; sellingPressure: number; exhaustion?: boolean };
    momentum?: any;
    liquidity?: { liquidityVoids: any[] };
    scenarios?: Array<{ applicable: boolean; direction: 'long' | 'short' | 'neutral' }>;
    probabilities?: { bullish: number; bearish: number };
}

interface RiskAssessment {
    level: 'low' | 'medium' | 'high';
    score: number;                // 0..100 (выше = рискованнее)
    factors: {
        volatility: number;
        volume: number;
        conflict: number;
        counterTrend: number;
        liquidity: number;
    };
    reasons: string[];
    recommendation: string;
    warnings: string[];
}

(function (global: any) {
    'use strict';

    function emptyResult(): RiskAssessment {
        return {
            level: 'medium',
            score: 50,
            factors: { volatility: 0.5, volume: 0.5, conflict: 0.5, counterTrend: 0.5, liquidity: 0.5 },
            reasons: [],
            recommendation: 'Недостаточно данных для оценки',
            warnings: []
        };
    }

    /**
     * assessRisk — основная публичная функция.
     * Принимает: объект с результатами анализаторов и probabilities.
     * Возвращает: RiskAssessment.
     */
    function assessRisk(inputs: RAInputs): RiskAssessment {
        if (!inputs) return emptyResult();
        // SKELETON: реальная логика (5-факторная модель) будет добавлена
        // на следующем этапе.
        return emptyResult();
    }

    const riskAssessor = {
        assess: assessRisk,
        assessRisk: assessRisk,
        VERSION: '2.0.0'
    };

    if (typeof global !== 'undefined') global.riskAssessor = riskAssessor;
    if (typeof window !== 'undefined') (window as any).riskAssessor = riskAssessor;
    if (typeof module !== 'undefined' && module.exports) module.exports = riskAssessor;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : globalThis));
