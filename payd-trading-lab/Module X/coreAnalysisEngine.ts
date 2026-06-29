/**
 * coreAnalysisEngine.ts — Module X (Core Analysis Engine) v3.0.0
 *
 * КООРДИНАТОР: единственная задача этого файла — связать вызовы
 * независимых анализаторов и собрать единый объект AnalysisResult.
 *
 * Архитектура:
 *
 *   core-analysis/
 *     coreAnalysisEngine.ts        ← ЭТОТ ФАЙЛ (координатор, ~200 строк)
 *     analyzers/
 *       marketStructureAnalyzer.ts
 *       trendAnalyzer.ts
 *       smartMoneyAnalyzer.ts
 *       priceActionAnalyzer.ts
 *       volumeAnalyzer.ts
 *       liquidityAnalyzer.ts
 *       volatilityAnalyzer.ts
 *       momentumAnalyzer.ts
 *       supportResistanceAnalyzer.ts
 *       probabilityEngine.ts
 *       scenarioGenerator.ts
 *       confidenceEngine.ts
 *       confluenceAnalyzer.ts       (v2.0.0)
 *       riskAssessor.ts             (v2.0.0)
 *       invalidationBuilder.ts      (v2.0.0)
 *       marketPhaseAnalyzer.ts      (v2.0.0)
 *       executionPlanBuilder.ts     (v2.0.0)
 *
 * Каждый анализатор:
 *   - загружается отдельным <script> либо через require();
 *   - экспортируется в window / global / module.exports;
 *   - НЕ зависит от других анализаторов (кроме входных данных);
 *   - может быть подменён / переписан без правки координатора.
 *
 * Координатор НЕ выполняет аналитических вычислений. Только оркестрация.
 *
 * Использование:
 *   const result = coreAnalysisEngine.analyzeMarket(chartData);
 *
 * Вход:  chartData = { candles: Candle[], level?: number, timeframe?: string }
 * Выход: AnalysisResult — единый объект со всеми секциями аналитики.
 *
 * Архитектурное правило:
 *   Ни один модуль после Module X не имеет права самостоятельно
 *   вычислять какие-либо аналитические показатели. Module 1, Module 2,
 *   Module 3 и все будущие модули могут только читать поля AnalysisResult.
 *   Если какого-то поля не хватает — оно должно быть добавлено в Module X,
 *   а не вычисляться повторно в другом модуле.
 */

// ================================================================
// Интерфейсы (общие для координатора и UI)
// ================================================================

interface CXECandle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface CXEChartData {
    candles: CXECandle[];
    level?: number;
    timeframe?: string;
}

interface AnalysisResult {
    // Базовые блоки (v1)
    marketStructure: any;
    trend: any;
    smartMoney: any;
    priceAction: any;
    volume: any;
    liquidity: any;
    volatility: any;
    momentum: any;
    supportResistance: any;

    // Агрегированные блоки (v1)
    probabilities: any;
    scenarios: any[];
    confidence: number;
    evidence: any;

    // Новые блоки (v2.0.0)
    confluence: any;
    riskAssessment: any;
    invalidation: any;
    marketPhase: any;
    executionPlan: any;

    meta: {
        version: string;
        analyzedAt: string;
        candleCount: number;
        timeframe: string;
    };
}

// ================================================================
// Резолвер анализаторов
// ================================================================

(function (global: any) {
    'use strict';

    /**
     * Берёт анализатор из window/global/module.exports.
     * Если анализатор не загружен — возвращает заглушку, которая бросает
     * понятную ошибку при вызове (это лучше, чем молча вернуть мусор).
     */
    function resolveAnalyzer(name: string): any {
        const candidates = [
            (typeof globalThis !== 'undefined' ? (globalThis as any)[name] : null),
            (typeof window !== 'undefined' ? (window as any)[name] : null),
            (typeof global !== 'undefined' ? (global as any)[name] : null)
        ].filter(Boolean);

        if (candidates.length === 0) {
            // Заглушка с диагностическим сообщением
            return {
                _missing: true,
                _name: name,
                analyze() {
                    throw new Error(
                        '[coreAnalysisEngine] Analyzer "' + name + '" is not loaded. ' +
                        'Include its <script> tag before coreAnalysisEngine.ts.'
                    );
                }
            };
        }
        return candidates[0];
    }

    // ================================================================
    // Координация
    // ================================================================

    function analyzeMarket(chartData: CXEChartData): AnalysisResult | { error: string; candlesProvided: number } {
        const candles = (chartData && chartData.candles) || [];
        const timeframe = (chartData && chartData.timeframe) || 'unknown';

        if (candles.length < 10) {
            return {
                error: 'Insufficient data: minimum 10 candles required',
                candlesProvided: candles.length
            };
        }

        // Резолвим анализаторы один раз
        const ms  = resolveAnalyzer('marketStructureAnalyzer');
        const ta  = resolveAnalyzer('trendAnalyzer');
        const sma = resolveAnalyzer('smartMoneyAnalyzer');
        const pa  = resolveAnalyzer('priceActionAnalyzer');
        const va  = resolveAnalyzer('volumeAnalyzer');
        const la  = resolveAnalyzer('liquidityAnalyzer');
        const vl  = resolveAnalyzer('volatilityAnalyzer');
        const mm  = resolveAnalyzer('momentumAnalyzer');
        const sr  = resolveAnalyzer('supportResistanceAnalyzer');

        const pe  = resolveAnalyzer('probabilityEngine');
        const sg  = resolveAnalyzer('scenarioGenerator');
        const ce  = resolveAnalyzer('confidenceEngine');

        const ca  = resolveAnalyzer('confluenceAnalyzer');
        const ra  = resolveAnalyzer('riskAssessor');
        const ib  = resolveAnalyzer('invalidationBuilder');
        const mpa = resolveAnalyzer('marketPhaseAnalyzer');
        const epb = resolveAnalyzer('executionPlanBuilder');

        // ---------- Шаг 1: базовые анализаторы (независимы друг от друга) ----------
        const marketStructure    = ms.analyzeMarketStructure(candles);
        const trend              = ta.analyzeTrend(candles, marketStructure);
        const smartMoney         = sma.analyzeSmartMoney(candles, marketStructure);
        const priceAction        = pa.analyzePriceAction(candles);
        const volume             = va.analyzeVolume(candles);
        const volatility         = vl.analyzeVolatility(candles);
        const momentum           = mm.analyzeMomentum(candles);
        const supportResistance  = sr.analyzeSupportResistance(candles, marketStructure);

        // ---------- Шаг 2: зависимые от базовых ----------
        const liquidity          = la.analyzeLiquidity(candles, smartMoney);

        // ---------- Шаг 3: агрегаторы ----------
        const probabilities      = pe.calculateProbabilities({
            marketStructure, trend, smartMoney, momentum, volume
        });

        const scenarios          = sg.generateScenarios({
            candles, marketStructure, trend, smartMoney,
            momentum, volume, probabilities
        });

        // evidence пока формируется как заглушка (может стать отдельным
        // анализатором на следующем этапе; пока это просто список signals)
        const evidence = {
            signals: [],
            reasons: [],
            keySignals: []
        };

        const confidence         = ce.calculateConfidence({
            probabilities, scenarios, evidence
        });

        // ---------- Шаг 4: блоки v2.0.0 ----------
        const confluence         = ca.analyzeConfluence({
            marketStructure, trend, smartMoney, priceAction,
            volume, liquidity, momentum, supportResistance, scenarios
        });

        const riskAssessment     = ra.assessRisk({
            marketStructure, trend, volatility, volume,
            momentum, liquidity, scenarios, probabilities
        });

        const invalidation       = ib.buildInvalidation({
            candles, scenarios, smartMoney, supportResistance, marketStructure
        });

        const marketPhase        = mpa.analyzeMarketPhase({
            candles, marketStructure, trend, volume, volatility, smartMoney
        });

        const executionPlan      = epb.buildExecutionPlan({
            candles, scenarios, smartMoney, supportResistance,
            marketStructure, riskAssessment, confluence
        });

        // ---------- Шаг 5: финальная сборка AnalysisResult ----------
        return {
            marketStructure,
            trend,
            smartMoney,
            priceAction,
            volume,
            liquidity,
            volatility,
            momentum,
            supportResistance,
            probabilities,
            scenarios,
            confidence,
            evidence,
            confluence,
            riskAssessment,
            invalidation,
            marketPhase,
            executionPlan,
            meta: {
                version: '3.0.0',
                analyzedAt: new Date().toISOString(),
                candleCount: candles.length,
                timeframe: timeframe
            }
        };
    }

    // ================================================================
    // Экспорт
    // ================================================================

    const coreAnalysisEngine = {
        analyzeMarket: analyzeMarket,
        // Утилиты
        resolveAnalyzer: resolveAnalyzer,
        VERSION: '3.0.0'
    };

    if (typeof global !== 'undefined') (global as any).coreAnalysisEngine = coreAnalysisEngine;
    if (typeof window !== 'undefined') (window as any).coreAnalysisEngine = coreAnalysisEngine;
    if (typeof module !== 'undefined' && module.exports) module.exports = coreAnalysisEngine;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : globalThis));
