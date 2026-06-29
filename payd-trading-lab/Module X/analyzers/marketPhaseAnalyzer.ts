/**
 * marketPhaseAnalyzer.ts — Module X / Analyzer #16 (v2.0.0)
 *
 * Назначение: определяет текущую фазу рынка (Wyckoff + классика):
 *              Accumulation, Markup, Distribution, Markdown, Consolidation,
 *              Expansion.
 *
 * Зависимости: candles, marketStructure, trend, volume, volatility, smartMoney.
 * Используется: scenarioGenerator (через weight), executionPlanBuilder.
 *
 * Публичный API:
 *   - analyzeMarketPhase(inputs: PhaseInputs): MarketPhaseResult
 */

interface Phase {
    type: 'accumulation' | 'markup' | 'distribution' | 'markdown' | 'consolidation' | 'expansion';
}

interface MPInputs {
    candles: any[];
    marketStructure?: any;
    trend?: any;
    volume?: any;
    volatility?: any;
    smartMoney?: any;
}

interface MarketPhaseResult {
    current: Phase['type'];
    previous: Phase['type'] | null;
    description: string;
    characteristics: string[];
    transition: {
        from: string | null;
        to: string;
        confirmed: boolean;
        candlesAgo: number;
    };
    durationCandles: number;
    expectedNext: string;
    signals: string[];
}

(function (global: any) {
    'use strict';

    function emptyResult(): MarketPhaseResult {
        return {
            current: 'consolidation',
            previous: null,
            description: 'Недостаточно данных',
            characteristics: [],
            transition: { from: null, to: 'consolidation', confirmed: false, candlesAgo: 0 },
            durationCandles: 0,
            expectedNext: 'consolidation',
            signals: []
        };
    }

    /**
     * analyzeMarketPhase — основная публичная функция.
     * Принимает: свечи + результаты анализаторов.
     * Возвращает: MarketPhaseResult.
     */
    function analyzeMarketPhase(inputs: MPInputs): MarketPhaseResult {
        if (!inputs || !inputs.candles || inputs.candles.length < 10) return emptyResult();
        // SKELETON: реальная логика (Wyckoff-style phase detection)
        // будет добавлена на следующем этапе.
        return emptyResult();
    }

    const marketPhaseAnalyzer = {
        analyze: analyzeMarketPhase,
        analyzeMarketPhase: analyzeMarketPhase,
        VERSION: '2.0.0'
    };

    if (typeof global !== 'undefined') global.marketPhaseAnalyzer = marketPhaseAnalyzer;
    if (typeof window !== 'undefined') (window as any).marketPhaseAnalyzer = marketPhaseAnalyzer;
    if (typeof module !== 'undefined' && module.exports) module.exports = marketPhaseAnalyzer;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : globalThis));
