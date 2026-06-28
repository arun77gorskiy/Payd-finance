/**
 * invalidationBuilder.ts — Module X / Analyzer #15 (v2.0.0)
 *
 * Назначение: определяет уровни и условия, при которых активные сценарии
 *              становятся недействительными.
 *
 * Зависимости: scenarios, smartMoney, supportResistance, marketStructure.
 * Используется: executionPlanBuilder.
 *
 * Публичный API:
 *   - buildInvalidation(inputs: InvalidationInputs): InvalidationResult
 */

interface IIInputs {
    candles?: any[];
    scenarios?: Array<{ id: string; applicable: boolean; direction: string; stopLoss?: number; probability?: number; title?: string }>;
    smartMoney?: { bos?: any[]; choch?: any[] };
    supportResistance?: { supply: any[]; demand: any[]; majorLevels: any[] };
    marketStructure?: any;
}

interface IILevel {
    scenarioId: string;
    price: number;
    type: 'above' | 'below';
    condition: string;
    probabilityDropTo: number;
}

interface InvalidationResult {
    invalidationLevels: IILevel[];
    globalInvalidations: string[];
    criticalLevels: number[];
    timeBasedInvalidation: {
        candlesLimit: number;
        expired: boolean;
    };
}

(function (global: any) {
    'use strict';

    function emptyResult(): InvalidationResult {
        return {
            invalidationLevels: [],
            globalInvalidations: [],
            criticalLevels: [],
            timeBasedInvalidation: { candlesLimit: 50, expired: false }
        };
    }

    /**
     * buildInvalidation — основная публичная функция.
     * Принимает: объект с candles и результатами анализаторов.
     * Возвращает: InvalidationResult.
     */
    function buildInvalidation(inputs: IIInputs): InvalidationResult {
        if (!inputs) return emptyResult();
        // SKELETON: реальная логика (per-scenario invalidation, BOS/CHoCH
        // global invalidations, time decay) будет добавлена на следующем этапе.
        return emptyResult();
    }

    const invalidationBuilder = {
        build: buildInvalidation,
        buildInvalidation: buildInvalidation,
        VERSION: '2.0.0'
    };

    if (typeof global !== 'undefined') global.invalidationBuilder = invalidationBuilder;
    if (typeof window !== 'undefined') (window as any).invalidationBuilder = invalidationBuilder;
    if (typeof module !== 'undefined' && module.exports) module.exports = invalidationBuilder;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : globalThis));
