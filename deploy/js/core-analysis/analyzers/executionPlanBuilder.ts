/**
 * executionPlanBuilder.ts — Module X / Analyzer #17 (v2.0.0)
 *
 * Назначение: формирует готовый торговый план (Entry, Confirmation,
 *              Stop Loss, Take Profit, Risk/Reward, Position Size,
 *              Management Rules).
 *
 * Зависимости: scenarios, smartMoney, supportResistance, marketStructure,
 *              riskAssessment, confluence.
 * Используется: НИКЕМ (финальный этап).
 *
 * Публичный API:
 *   - buildExecutionPlan(inputs: EPInputs): ExecutionPlan
 */

interface EPInputs {
    candles: any[];
    scenarios?: any[];
    smartMoney?: any;
    supportResistance?: any;
    marketStructure?: any;
    riskAssessment?: any;
    confluence?: any;
}

interface EPEntryZone { low: number; high: number; midpoint: number; }
interface EPStopLoss { price: number; distance: number; distancePct: number; }
interface EPTakeProfit { level: number; distance: number; distancePct: number; label: string; }

interface ExecutionPlan {
    direction: 'long' | 'short' | 'wait';
    basedOn: string;
    entryZone: EPEntryZone | null;
    confirmation: string;
    stopLoss: EPStopLoss | null;
    takeProfit: EPTakeProfit[];
    riskRewardRatio: number;
    positionSizeRecommendation: 'minimal' | 'small' | 'medium' | 'large' | 'no_trade';
    managementRules: string[];
    alternatives: Array<{ scenarioId: string; direction: 'long' | 'short'; reason: string }>;
    timestamp: string;
}

(function (global: any) {
    'use strict';

    function emptyResult(): ExecutionPlan {
        return {
            direction: 'wait',
            basedOn: 'none',
            entryZone: null,
            confirmation: 'Нет активных сценариев',
            stopLoss: null,
            takeProfit: [],
            riskRewardRatio: 0,
            positionSizeRecommendation: 'no_trade',
            managementRules: ['Дождаться формирования нового сценария'],
            alternatives: [],
            timestamp: new Date().toISOString()
        };
    }

    /**
     * buildExecutionPlan — основная публичная функция.
     * Принимает: свечи + результаты анализаторов.
     * Возвращает: ExecutionPlan.
     */
    function buildExecutionPlan(inputs: EPInputs): ExecutionPlan {
        if (!inputs || !inputs.candles || inputs.candles.length < 1) return emptyResult();
        // SKELETON: реальная логика (best scenario selection, ATR-based entry,
        // TP ladder, R/R ratio, position size по Risk+Confluence) будет
        // добавлена на следующем этапе.
        return emptyResult();
    }

    const executionPlanBuilder = {
        build: buildExecutionPlan,
        buildExecutionPlan: buildExecutionPlan,
        VERSION: '2.0.0'
    };

    if (typeof global !== 'undefined') global.executionPlanBuilder = executionPlanBuilder;
    if (typeof window !== 'undefined') (window as any).executionPlanBuilder = executionPlanBuilder;
    if (typeof module !== 'undefined' && module.exports) module.exports = executionPlanBuilder;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : globalThis));
