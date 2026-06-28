/**
 * coreAnalysisEngine.ts — Module X (Core Analysis Engine) v2.0.0
 *
 * Единый аналитический движок системы. Принимает только рыночные данные
 * (chartData) и возвращает полный структурированный объект анализа.
 *
 * Это самостоятельный, изолированный модуль. Он не зависит от других
 * модулей проекта и не должен подключаться к существующим модулям.
 *
 * Использование:
 *   const result = coreAnalysisEngine.analyzeMarket(chartData);
 *
 * Вход: chartData = { candles: [...], level?: number, timeframe?: string }
 *
 * Выход: AnalysisResult — единый объект со всеми секциями аналитики:
 *   marketStructure, trend, smartMoney, priceAction, volume, liquidity,
 *   volatility, momentum, supportResistance, probabilities, scenarios,
 *   confidence, evidence,
 *   confluence, riskAssessment, invalidation, marketPhase, executionPlan,
 *   meta
 *
 * Архитектурное правило:
 *   Ни один модуль после Module X не имеет права самостоятельно
 *   вычислять какие-либо аналитические показатели. Module 1, Module 2,
 *   Module 3 и все будущие модули могут только читать поля AnalysisResult.
 *   Если какого-то поля не хватает, оно должно быть добавлено в Module X,
 *   а не вычисляться повторно в другом модуле.
 */

// ================================================================
// Публичные интерфейсы (TypeScript-стиль)
// ================================================================

interface Candle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface ChartData {
    candles: Candle[];
    level?: number;
    timeframe?: string;
}

interface Swing {
    index: number;
    type: 'high' | 'low';
    price: number;
    time: number;
    klass?: 'HH' | 'HL' | 'LH' | 'LL';
}

interface MarketStructureResult {
    type: 'uptrend' | 'downtrend' | 'range' | 'consolidation' | 'expansion' | 'compression';
    swings: Swing[];
    higherHighs: Swing[];
    higherLows: Swing[];
    lowerHighs: Swing[];
    lowerLows: Swing[];
    structureShift: { type: 'BOS' | 'CHoCH' | 'MSS' | null; index: number; price: number };
    trendContinuation: boolean;
    trendReversal: boolean;
}

interface TrendResult {
    type: 'strong_bull' | 'weak_bull' | 'strong_bear' | 'weak_bear' | 'sideways';
    strength: number;        // 0..100
    slopePct: number;
    confidence: number;      // 0..100
    strongBullTrend: boolean;
    weakBullTrend: boolean;
    strongBearTrend: boolean;
    weakBearTrend: boolean;
    sidewaysTrend: boolean;
    trendExhaustion: { detected: boolean; description: string };
}

interface SmartMoneyResult {
    bos: Array<{ index: number; type: 'bullish' | 'bearish'; level: number }>;
    choch: Array<{ index: number; type: 'bullish' | 'bearish'; level: number }>;
    mss: Array<{ index: number; type: 'bullish' | 'bearish'; level: number }>;
    orderBlocks: Array<{ index: number; type: 'bullish' | 'bearish'; high: number; low: number }>;
    breakerBlocks: Array<{ index: number; type: 'bullish' | 'bearish'; high: number; low: number }>;
    mitigationBlocks: Array<{ index: number; type: 'bullish' | 'bearish'; high: number; low: number }>;
    fairValueGaps: Array<{ index: number; type: 'bullish' | 'bearish'; high: number; low: number; filled: boolean }>;
    liquiditySweeps: Array<{ index: number; side: 'buy_side' | 'sell_side'; price: number }>;
    equalHighs: Array<{ price: number; index1: number; index2: number }>;
    equalLows: Array<{ price: number; index1: number; index2: number }>;
}

interface PriceActionResult {
    patterns: Array<{
        index: number;
        type: string;
        reversal_prob: number;
        continuation_prob: number;
        time: number;
    }>;
}

interface VolumeResult {
    current: number;
    average: number;
    ratio: number;
    volumeSpike: boolean;
    buyingPressure: number;     // 0..1
    sellingPressure: number;    // 0..1
    absorption: boolean;
    exhaustion: boolean;
    volumeClimax: boolean;
    highVolume: boolean;
    lowVolume: boolean;
    increasingVolume: boolean;
    decliningVolume: boolean;
}

interface LiquidityResult {
    liquidityGrab: { detected: boolean; index: number; side: string };
    stopHunt: Array<{ index: number; side: string; price: number }>;
    liquidityVoid: Array<{ index: number; size: number }>;
    sweepHighs: Array<{ index: number; price: number }>;
    sweepLows: Array<{ index: number; price: number }>;
    restingLiquidity: {
        buySide: Array<{ price: number }>;
        sellSide: Array<{ price: number }>;
    };
}

interface VolatilityResult {
    atr: number;
    atrPercent: number;
    level: 'high' | 'low' | 'normal';
    atrExpansion: boolean;
    atrCompression: boolean;
    volatilityBreakout: boolean;
    volatilitySqueeze: boolean;
    explosiveExpansion: boolean;
    highVolatility: boolean;
    lowVolatility: boolean;
}

interface MomentumResult {
    rsi: number;
    strength: number;             // 0..100
    direction: 'up' | 'down' | 'neutral';
    strongMomentum: boolean;
    weakMomentum: boolean;
    divergence: boolean;
    acceleration: boolean;
    deceleration: boolean;
    impulseMove: boolean;
    correctiveMove: boolean;
}

interface SupportResistanceResult {
    majorSupport: Array<{ price: number; strength: number; touchCount: number }>;
    majorResistance: Array<{ price: number; strength: number; touchCount: number }>;
    supply: Array<{ price: number; low: number; high: number }>;
    demand: Array<{ price: number; low: number; high: number }>;
    supports: Array<{ price: number; strength: number }>;
    resistances: Array<{ price: number; strength: number }>;
}

interface ProbabilityResult {
    bullish: number;       // 0..100
    bearish: number;       // 0..100
    neutral: number;       // 0..100
    confidence: number;    // 0..100
}

interface Scenario {
    id: string;
    title: string;
    description: string;
    direction: 'long' | 'short' | 'neutral';
    category: string;
    riskLevel: 'low' | 'medium' | 'high';
    probability: number;
    confidence: number;
    entryZone?: { low: number; high: number } | null;
    stopLoss?: number | null;
    takeProfit?: number | null;
    riskRewardRatio?: string | null;
    reasons: string[];
    confirmations: string[];
    priority: number;
    applicable: boolean;
}

interface Evidence {
    signals: string[];
    reasons: string[];
    keySignals: string[];
}

// ================================================================
// Новые блоки (v2.0.0)
// ================================================================

/**
 * ConfluenceResult — совпадение сигналов разных моделей.
 * Например: Trend + BOS + FVG, OB + Pin Bar, Engulfing + Volume Spike,
 * Liquidity Sweep + CHoCH.
 */
interface ConfluenceResult {
    totalSignals: number;          // общее число активных сигналов
    bullishCount: number;
    bearishCount: number;
    neutralCount: number;
    confluences: Array<{
        combination: string[];     // какие модели сошлись
        direction: 'bullish' | 'bearish' | 'neutral';
        weight: number;            // вес совпадения
        description: string;
        models: string[];
    }>;
    strength: 'weak' | 'moderate' | 'strong' | 'very_strong';
    rating: number;               // 0..100
    dominantDirection: 'bullish' | 'bearish' | 'neutral';
    summary: string;
}

/**
 * RiskAssessment — оценка риска сценария (Low / Medium / High) и причины.
 */
interface RiskAssessment {
    level: 'low' | 'medium' | 'high';
    score: number;                // 0..100 (выше = рискованнее)
    factors: {
        volatility: number;       // 0..1
        volume: number;           // 0..1 (слабость объёма = риск)
        conflict: number;         // 0..1 (конфликт сигналов)
        counterTrend: number;     // 0..1 (торговля против тренда)
        liquidity: number;        // 0..1 (плохая ликвидность = риск)
    };
    reasons: string[];            // человекочитаемые причины
    recommendation: string;       // итоговая рекомендация
    warnings: string[];           // критические предупреждения
}

/**
 * InvalidationResult — что должно произойти, чтобы сценарий стал недействительным.
 */
interface InvalidationResult {
    invalidationLevels: Array<{
        scenarioId: string;
        price: number;
        type: 'above' | 'below';
        condition: string;
        probabilityDropTo: number;  // вероятность при пробое (0..100)
    }>;
    globalInvalidations: string[];  // общие условия отмены
    criticalLevels: number[];        // ключевые ценовые уровни
    timeBasedInvalidation: {
        candlesLimit: number;        // через сколько свечей сценарий устаревает
        expired: boolean;
    };
}

/**
 * MarketPhaseResult — текущая фаза рынка (Wyckoff + классика).
 */
interface MarketPhaseResult {
    current: 'accumulation' | 'markup' | 'distribution' | 'markdown' | 'consolidation' | 'expansion';
    previous: 'accumulation' | 'markup' | 'distribution' | 'markdown' | 'consolidation' | 'expansion' | null;
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

/**
 * ExecutionPlan — готовый торговый план.
 */
interface ExecutionPlan {
    direction: 'long' | 'short' | 'wait';
    basedOn: string;                // ID сценария, на котором основан план
    entryZone: { low: number; high: number; midpoint: number } | null;
    confirmation: string;           // что должно произойти для входа
    stopLoss: { price: number; distance: number; distancePct: number } | null;
    takeProfit: Array<{ level: number; distance: number; distancePct: number; label: string }>;
    riskRewardRatio: number;        // число (например 2.5)
    positionSizeRecommendation: 'minimal' | 'small' | 'medium' | 'large' | 'no_trade';
    managementRules: string[];      // правила сопровождения
    alternatives: Array<{
        scenarioId: string;
        direction: 'long' | 'short';
        reason: string;
    }>;
    timestamp: string;
}

interface AnalysisResult {
    marketStructure: MarketStructureResult;
    trend: TrendResult;
    smartMoney: SmartMoneyResult;
    priceAction: PriceActionResult;
    volume: VolumeResult;
    liquidity: LiquidityResult;
    volatility: VolatilityResult;
    momentum: MomentumResult;
    supportResistance: SupportResistanceResult;
    probabilities: ProbabilityResult;
    scenarios: Scenario[];
    confidence: number;
    evidence: Evidence;

    // Новые блоки (v2.0.0)
    confluence: ConfluenceResult;
    riskAssessment: RiskAssessment;
    invalidation: InvalidationResult;
    marketPhase: MarketPhaseResult;
    executionPlan: ExecutionPlan;

    meta: {
        version: string;
        analyzedAt: string;
        candleCount: number;
        timeframe: string;
    };
}

// ================================================================
// Реализация (JavaScript-совместимый код внутри IIFE)
// ================================================================

(function (global) {
    'use strict';

    // ---------- Утилиты ----------
    function round(n, p) { if (p === undefined) p = 2; const k = Math.pow(10, p); return Math.round(n * k) / k; }
    function mean(arr) { if (!arr || arr.length === 0) return 0; return arr.reduce((a, b) => a + b, 0) / arr.length; }
    function isBull(c) { return c.close > c.open; }
    function isBear(c) { return c.close < c.open; }
    function bodySize(c) { return Math.abs(c.close - c.open); }
    function candleRange(c) { return c.high - c.low; }
    function upperWick(c) { return c.high - Math.max(c.open, c.close); }
    function lowerWick(c) { return Math.min(c.open, c.close) - c.low; }

    // ================================================================
    // 1. Market Structure
    // ================================================================
    function analyzeMarketStructure(candles) {
        const swings = [];
        const lookback = 3;
        for (let i = lookback; i < candles.length - lookback; i++) {
            let isHigh = true, isLow = true;
            for (let j = 1; j <= lookback; j++) {
                if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) isHigh = false;
                if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) isLow = false;
            }
            if (isHigh) swings.push({ index: i, type: 'high', price: candles[i].high, time: candles[i].time });
            if (isLow) swings.push({ index: i, type: 'low', price: candles[i].low, time: candles[i].time });
        }

        // Классификация HH/HL/LH/LL
        const higherHighs = [], higherLows = [], lowerHighs = [], lowerLows = [];
        let lastHigh = null, lastLow = null;
        const classified = swings.map(s => ({ ...s }));
        for (const s of classified) {
            if (s.type === 'high') {
                if (lastHigh !== null) {
                    s.klass = s.price > lastHigh ? 'HH' : 'LH';
                    if (s.klass === 'HH') higherHighs.push(s); else lowerHighs.push(s);
                }
                lastHigh = s.price;
            } else {
                if (lastLow !== null) {
                    s.klass = s.price > lastLow ? 'HL' : 'LL';
                    if (s.klass === 'HL') higherLows.push(s); else lowerLows.push(s);
                }
                lastLow = s.price;
            }
        }

        // Тип структуры
        const hh = higherHighs.length;
        const hl = higherLows.length;
        const lh = lowerHighs.length;
        const ll = lowerLows.length;
        let type = 'range';
        if (hh >= 2 && hh > lh && hl >= lh) type = 'uptrend';
        else if (ll >= 2 && ll > hl && lh >= hl) type = 'downtrend';
        else if (Math.abs(hh - ll) <= 1 && Math.abs(hl - lh) <= 1) type = 'range';
        else type = 'consolidation';

        // Structure Shift (последний значимый)
        const lastShift = classified.length > 0 ? {
            type: type === 'uptrend' ? 'BOS' : type === 'downtrend' ? 'CHoCH' : null,
            index: classified[classified.length - 1].index,
            price: classified[classified.length - 1].price
        } : { type: null, index: -1, price: 0 };

        const trendContinuation = type === 'uptrend' || type === 'downtrend';
        const trendReversal = (lastShift.type === 'CHoCH' || lastShift.type === 'MSS');

        return {
            type: type,
            swings: classified,
            higherHighs, higherLows, lowerHighs, lowerLows,
            structureShift: lastShift,
            trendContinuation,
            trendReversal
        };
    }

    // ================================================================
    // 2. Trend Analysis
    // ================================================================
    function analyzeTrend(candles, structure) {
        const closes = candles.map(c => c.close);
        const n = closes.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        for (let i = 0; i < n; i++) {
            sumX += i; sumY += closes[i]; sumXY += i * closes[i]; sumXX += i * i;
        }
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const avgPrice = mean(closes);
        const slopePct = (slope / avgPrice) * 100;
        const strength = Math.min(100, Math.abs(slopePct) * 50);

        let type;
        if (slopePct > 0.05 && strength > 30) type = 'strong_bull';
        else if (slopePct > 0 && strength > 10) type = 'weak_bull';
        else if (slopePct < -0.05 && strength > 30) type = 'strong_bear';
        else if (slopePct < 0 && strength > 10) type = 'weak_bear';
        else type = 'sideways';

        const recentAvg = mean(closes.slice(-Math.floor(n / 4)));
        const earlyAvg = mean(closes.slice(0, Math.floor(n / 4)));
        const trendExhaustion = {
            detected: Math.abs(recentAvg - earlyAvg) < avgPrice * 0.02 && strength > 40,
            description: type === 'sideways' ? 'Боковик — признак истощения' : 'Тренд активен'
        };

        return {
            type, strength: round(strength), slopePct: round(slopePct, 4),
            confidence: structure.type === 'uptrend' || structure.type === 'downtrend' ? 70 : 40,
            strongBullTrend: type === 'strong_bull',
            weakBullTrend: type === 'weak_bull',
            strongBearTrend: type === 'strong_bear',
            weakBearTrend: type === 'weak_bear',
            sidewaysTrend: type === 'sideways',
            trendExhaustion
        };
    }

    // ================================================================
    // 3. Smart Money Concepts (SMC)
    // ================================================================
    function analyzeSmartMoney(candles, structure) {
        const bos = [], choch = [], mss = [];
        const swings = structure.swings;
        const lastPrice = candles[candles.length - 1].close;

        // BOS — пробой предыдущего свинга
        for (let i = 1; i < swings.length; i++) {
            const prev = swings[i - 1], cur = swings[i];
            if (cur.type === 'high' && cur.price > prev.price * 1.001) {
                bos.push({ index: cur.index, type: 'bullish', level: cur.price });
            } else if (cur.type === 'low' && cur.price < prev.price * 0.999) {
                bos.push({ index: cur.index, type: 'bearish', level: cur.price });
            }
        }

        // Order Blocks
        const orderBlocks = [];
        for (let i = 2; i < candles.length - 1; i++) {
            const c = candles[i], next = candles[i + 1];
            if (isBear(c) && isBull(next) && next.close > c.high) {
                orderBlocks.push({ index: i, type: 'bullish', high: c.high, low: c.low });
            }
            if (isBull(c) && isBear(next) && next.close < c.low) {
                orderBlocks.push({ index: i, type: 'bearish', high: c.high, low: c.low });
            }
        }

        // Breaker Blocks (сломанные OB)
        const breakerBlocks = [];
        for (const ob of orderBlocks.slice(-10)) {
            if (ob.type === 'bullish') {
                const broken = candles.slice(ob.index + 1).find(c => c.close < ob.low);
                if (broken) breakerBlocks.push({ ...ob, type: 'bearish' });
            } else {
                const broken = candles.slice(ob.index + 1).find(c => c.close > ob.high);
                if (broken) breakerBlocks.push({ ...ob, type: 'bullish' });
            }
        }

        // Mitigation Blocks (OB после mitigated move)
        const mitigationBlocks = orderBlocks.slice(-3).map(ob => ({
            index: ob.index,
            type: ob.type === 'bullish' ? 'bearish' : 'bullish',
            high: ob.high,
            low: ob.low
        }));

        // Fair Value Gaps
        const fairValueGaps = [];
        for (let i = 2; i < candles.length; i++) {
            const prev2 = candles[i - 2], cur = candles[i];
            if (cur.low > prev2.high) {
                fairValueGaps.push({ index: i, type: 'bullish', high: cur.low, low: prev2.high, filled: false });
            } else if (cur.high < prev2.low) {
                fairValueGaps.push({ index: i, type: 'bearish', high: prev2.low, low: cur.high, filled: false });
            }
        }
        // Помечаем заполненные FVG
        for (const fvg of fairValueGaps) {
            for (let j = fvg.index + 1; j < candles.length; j++) {
                if (fvg.type === 'bullish' && candles[j].low <= fvg.low) { fvg.filled = true; break; }
                if (fvg.type === 'bearish' && candles[j].high >= fvg.high) { fvg.filled = true; break; }
            }
        }

        // Liquidity Sweeps
        const liquiditySweeps = [];
        const recentSwings = swings.slice(-10);
        for (let i = 1; i < candles.length - 1; i++) {
            const c = candles[i];
            for (const sw of recentSwings) {
                if (sw.type === 'high' && c.high > sw.price && c.close < sw.price) {
                    liquiditySweeps.push({ index: i, side: 'buy_side', price: sw.price });
                }
                if (sw.type === 'low' && c.low < sw.price && c.close > sw.price) {
                    liquiditySweeps.push({ index: i, side: 'sell_side', price: sw.price });
                }
            }
        }

        // Equal Highs / Equal Lows
        const equalHighs = [], equalLows = [];
        const tolerance = 0.002;
        const highs = swings.filter(s => s.type === 'high').slice(-20);
        const lows = swings.filter(s => s.type === 'low').slice(-20);
        for (let i = 0; i < highs.length; i++) {
            for (let j = i + 1; j < highs.length; j++) {
                if (Math.abs(highs[i].price - highs[j].price) / highs[i].price < tolerance) {
                    equalHighs.push({ price: (highs[i].price + highs[j].price) / 2, index1: highs[i].index, index2: highs[j].index });
                }
            }
        }
        for (let i = 0; i < lows.length; i++) {
            for (let j = i + 1; j < lows.length; j++) {
                if (Math.abs(lows[i].price - lows[j].price) / lows[i].price < tolerance) {
                    equalLows.push({ price: (lows[i].price + lows[j].price) / 2, index1: lows[i].index, index2: lows[j].index });
                }
            }
        }

        // CHoCH — смена характера движения (последний значимый)
        if (structure.structureShift.type === 'CHoCH') {
            choch.push(structure.structureShift);
        }

        return {
            bos: bos.slice(-5),
            choch: choch.slice(-5),
            mss: mss.slice(-5),
            orderBlocks: orderBlocks.slice(-5),
            breakerBlocks: breakerBlocks.slice(-5),
            mitigationBlocks: mitigationBlocks.slice(-5),
            fairValueGaps: fairValueGaps.slice(-5),
            liquiditySweeps: liquiditySweeps.slice(-5),
            equalHighs: equalHighs.slice(-5),
            equalLows: equalLows.slice(-5)
        };
    }

    // ================================================================
    // 4. Price Action
    // ================================================================
    function analyzePriceAction(candles) {
        const patterns = [];
        for (let i = 1; i < candles.length; i++) {
            const c = candles[i], prev = candles[i - 1], prev2 = i >= 2 ? candles[i - 2] : null;
            const body = bodySize(c), range = candleRange(c);
            if (range === 0) continue;
            const bodyPct = body / range, upPct = upperWick(c) / range, loPct = lowerWick(c) / range;

            let pat = null;
            // Pin Bar
            if (loPct > 0.66 && bodyPct < 0.34 && isBull(c)) pat = { type: 'pin_bar', reversal_prob: 0.65, continuation_prob: 0.15, direction: 'bullish' };
            else if (upPct > 0.66 && bodyPct < 0.34 && isBear(c)) pat = { type: 'pin_bar', reversal_prob: 0.65, continuation_prob: 0.15, direction: 'bearish' };
            // Hammer / Shooting Star
            else if (loPct > 0.5 && bodyPct < 0.4 && upPct < 0.25) pat = { type: 'hammer', reversal_prob: 0.60, continuation_prob: 0.15, direction: 'bullish' };
            else if (upPct > 0.5 && bodyPct < 0.4 && loPct < 0.25) pat = { type: 'shooting_star', reversal_prob: 0.60, continuation_prob: 0.15, direction: 'bearish' };
            // Engulfing
            else if (prev && isBear(prev) && isBull(c) && c.close > prev.open && c.open < prev.close) pat = { type: 'engulfing', reversal_prob: 0.70, continuation_prob: 0.10, direction: 'bullish' };
            else if (prev && isBull(prev) && isBear(c) && c.close < prev.open && c.open > prev.close) pat = { type: 'engulfing', reversal_prob: 0.70, continuation_prob: 0.10, direction: 'bearish' };
            // Harami
            else if (prev && isBear(prev) && isBull(c) && c.open > prev.close && c.close < prev.open) pat = { type: 'harami', reversal_prob: 0.55, continuation_prob: 0.20, direction: 'bullish' };
            else if (prev && isBull(prev) && isBear(c) && c.open < prev.close && c.close > prev.open) pat = { type: 'harami', reversal_prob: 0.55, continuation_prob: 0.20, direction: 'bearish' };
            // Doji
            else if (bodyPct < 0.1) pat = { type: 'doji', reversal_prob: 0.45, continuation_prob: 0.30, direction: 'neutral' };
            // Inside / Outside Bar
            else if (prev && c.high < prev.high && c.low > prev.low) pat = { type: 'inside_bar', reversal_prob: 0.40, continuation_prob: 0.50, direction: 'neutral' };
            else if (prev && c.high > prev.high && c.low < prev.low) pat = { type: 'outside_bar', reversal_prob: 0.45, continuation_prob: 0.45, direction: 'neutral' };
            // Morning / Evening Star
            else if (prev2 && isBear(prev2) && bodySize(prev) < bodySize(prev2) * 0.3 && isBull(c) && c.close > (prev2.open + prev2.close) / 2) pat = { type: 'morning_star', reversal_prob: 0.75, continuation_prob: 0.10, direction: 'bullish' };
            else if (prev2 && isBull(prev2) && bodySize(prev) < bodySize(prev2) * 0.3 && isBear(c) && c.close < (prev2.open + prev2.close) / 2) pat = { type: 'evening_star', reversal_prob: 0.75, continuation_prob: 0.10, direction: 'bearish' };

            if (pat) {
                patterns.push({ index: i, time: c.time, ...pat });
            }
        }
        return { patterns: patterns.slice(-10) };
    }

    // ================================================================
    // 5. Volume Analysis
    // ================================================================
    function analyzeVolume(candles) {
        const volumes = candles.map(c => c.volume);
        const avgVol = mean(volumes);
        const lastVol = volumes[volumes.length - 1];
        const ratio = lastVol / avgVol;

        // Buying / Selling Pressure
        let buyVol = 0, sellVol = 0;
        const recent = candles.slice(-10);
        for (const c of recent) {
            if (isBull(c)) buyVol += c.volume || 0;
            else sellVol += c.volume || 0;
        }
        const total = buyVol + sellVol || 1;
        const buyingPressure = buyVol / total;
        const sellingPressure = sellVol / total;

        // Absorption: высокий объём + маленькое тело
        const lastCandle = candles[candles.length - 1];
        const lastRange = candleRange(lastCandle);
        const absorption = ratio > 1.5 && lastRange > 0 && bodySize(lastCandle) / lastRange < 0.3;

        // Exhaustion: высокий объём + большая свеча против движения
        const lastN = 5;
        const priceChange = candles[candles.length - 1].close - candles[candles.length - lastN].close;
        const exhaustion = ratio > 2.5 && (
            (isBull(lastCandle) && priceChange < 0) ||
            (isBear(lastCandle) && priceChange > 0)
        );

        // Тренд объёма
        const recent5 = mean(volumes.slice(-5));
        const earlier5 = mean(volumes.slice(-10, -5));
        const increasingVolume = recent5 > earlier5 * 1.2;
        const decliningVolume = recent5 < earlier5 * 0.8;

        return {
            current: round(lastVol),
            average: round(avgVol),
            ratio: round(ratio, 2),
            volumeSpike: ratio > 2,
            volumeClimax: ratio > 4,
            buyingPressure: round(buyingPressure, 2),
            sellingPressure: round(sellingPressure, 2),
            absorption,
            exhaustion,
            highVolume: ratio > 1.5,
            lowVolume: ratio < 0.5,
            increasingVolume,
            decliningVolume
        };
    }

    // ================================================================
    // 6. Liquidity Analysis
    // ================================================================
    function analyzeLiquidity(candles, smc) {
        const lastPrice = candles[candles.length - 1].close;
        const sweeps = smc.liquiditySweeps;
        const lastSweep = sweeps[sweeps.length - 1] || null;

        const liquidityGrab = lastSweep ? {
            detected: true,
            index: lastSweep.index,
            side: lastSweep.side
        } : { detected: false, index: -1, side: 'none' };

        const stopHunt = sweeps.slice(0, 3);
        const sweepHighs = sweeps.filter(s => s.side === 'buy_side').slice(0, 5);
        const sweepLows = sweeps.filter(s => s.side === 'sell_side').slice(0, 5);

        // Liquidity Void — большие незаполненные FVG
        const atrApprox = mean(candles.slice(-14).map(candleRange));
        const liquidityVoid = smc.fairValueGaps.filter(f => !f.filled && (f.high - f.low) > atrApprox * 0.5);

        // Resting Liquidity
        const buySideResting = smc.equalHighs.map(e => ({ price: e.price }));
        const sellSideResting = smc.equalLows.map(e => ({ price: e.price }));

        return {
            liquidityGrab,
            stopHunt,
            liquidityVoid: liquidityVoid.slice(0, 5),
            sweepHighs,
            sweepLows,
            restingLiquidity: {
                buySide: buySideResting.slice(0, 5),
                sellSide: sellSideResting.slice(0, 5)
            }
        };
    }

    // ================================================================
    // 7. Volatility Analysis
    // ================================================================
    function analyzeVolatility(candles) {
        const period = 14;
        const trs = [];
        for (let i = 1; i < candles.length; i++) {
            const high = candles[i].high, low = candles[i].low;
            const prevClose = candles[i - 1].close;
            trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
        }
        const atr = mean(trs.slice(-period));
        const lastPrice = candles[candles.length - 1].close;
        const atrPercent = (atr / lastPrice) * 100;

        const recentTrs = trs.slice(-5);
        const earlierTrs = trs.slice(-10, -5);
        const recentATR = mean(recentTrs);
        const earlierATR = mean(earlierTrs);
        const atrExpansion = recentATR > earlierATR * 1.2;
        const atrCompression = recentATR < earlierATR * 0.8;

        const volatilityBreakout = atrExpansion && atrCompression === false;
        const volatilitySqueeze = atrCompression && atrPercent < 1.0;
        const explosiveExpansion = atrExpansion && atrPercent > 3;

        let level = 'normal';
        if (atrPercent > 2) level = 'high';
        else if (atrPercent < 0.5) level = 'low';

        return {
            atr: round(atr),
            atrPercent: round(atrPercent, 2),
            level,
            atrExpansion,
            atrCompression,
            volatilityBreakout,
            volatilitySqueeze,
            explosiveExpansion,
            highVolatility: atrPercent > 2,
            lowVolatility: atrPercent < 0.5
        };
    }

    // ================================================================
    // 8. Momentum Analysis
    // ================================================================
    function analyzeMomentum(candles) {
        const period = 14;
        let gains = 0, losses = 0;
        for (let i = candles.length - period; i < candles.length; i++) {
            const change = candles[i].close - candles[i - 1].close;
            if (change > 0) gains += change;
            else losses -= change;
        }
        const avgGain = gains / period;
        const avgLoss = losses / period;
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        const rsi = 100 - (100 / (1 + rs));
        const strength = Math.abs(50 - rsi) * 2;
        const direction = rsi > 55 ? 'up' : rsi < 45 ? 'down' : 'neutral';

        // Acceleration
        const halfChanges = [];
        for (let i = Math.max(1, candles.length - period); i < candles.length; i++) {
            halfChanges.push(candles[i].close - candles[i - 1].close);
        }
        const firstHalf = mean(halfChanges.slice(0, Math.floor(halfChanges.length / 2)));
        const secondHalf = mean(halfChanges.slice(Math.floor(halfChanges.length / 2)));
        const acceleration = secondHalf - firstHalf;

        // Divergence: цена обновляет high, RSI — нет
        const halfN = Math.floor(candles.length / 2);
        const recentHigh = Math.max(...candles.slice(-halfN).map(c => c.high));
        const earlierHigh = Math.max(...candles.slice(0, halfN).map(c => c.high));
        const recentLow = Math.min(...candles.slice(-halfN).map(c => c.low));
        const earlierLow = Math.min(...candles.slice(0, halfN).map(c => c.low));
        const divergence = (candles[candles.length - 1].close > earlierHigh && rsi < 60) ||
                           (candles[candles.length - 1].close < earlierLow && rsi > 40);

        // Impulse / Corrective
        const atrApprox = mean(candles.slice(-14).map(candleRange));
        const lastRange = candleRange(candles[candles.length - 1]);
        const impulseMove = lastRange > atrApprox * 1.5;

        let correctiveStreak = 0;
        const recent5 = candles.slice(-5);
        const recentDir = isBull(recent5[recent5.length - 1]) ? 'bullish' : 'bearish';
        for (let i = recent5.length - 1; i >= 0; i--) {
            const c = recent5[i];
            const cDir = isBull(c) ? 'bullish' : 'bearish';
            if (cDir !== recentDir && candleRange(c) < atrApprox * 0.7) correctiveStreak++;
            else break;
        }
        const correctiveMove = correctiveStreak >= 3;

        return {
            rsi: round(rsi, 1),
            strength: round(strength),
            direction,
            strongMomentum: strength > 60,
            weakMomentum: strength < 20,
            divergence,
            acceleration: acceleration > 0,
            deceleration: acceleration < 0,
            impulseMove,
            correctiveMove
        };
    }

    // ================================================================
    // 9. Support / Resistance
    // ================================================================
    function analyzeSupportResistance(candles, structure) {
        const lastPrice = candles[candles.length - 1].close;
        const tolerance = lastPrice * 0.005;

        const supports = [], resistances = [];
        for (const s of structure.lowerLows) supports.push({ price: round(s.price), strength: 60 });
        for (const s of structure.higherLows) supports.push({ price: round(s.price), strength: 70 });
        for (const s of structure.higherHighs) resistances.push({ price: round(s.price), strength: 60 });
        for (const s of structure.lowerHighs) resistances.push({ price: round(s.price), strength: 70 });

        // Считаем touch count
        for (const lvl of [...supports, ...resistances]) {
            let touches = 0;
            for (const c of candles) {
                if (Math.abs(c.high - lvl.price) < tolerance || Math.abs(c.low - lvl.price) < tolerance) touches++;
            }
            lvl.touchCount = touches;
        }

        const majorSupport = supports.filter(s => s.touchCount >= 3).slice(0, 3).map(s => ({ ...s, strength: 90 }));
        const majorResistance = resistances.filter(r => r.touchCount >= 3).slice(0, 3).map(r => ({ ...r, strength: 90 }));

        // Supply / Demand Zones (через swing low/high)
        const supply = structure.higherHighs.concat(structure.lowerHighs).slice(0, 5).map(s => ({
            price: round(s.price), low: round(s.price * 0.995), high: round(s.price * 1.002)
        }));
        const demand = structure.higherLows.concat(structure.lowerLows).slice(0, 5).map(s => ({
            price: round(s.price), low: round(s.price * 0.998), high: round(s.price * 1.005)
        }));

        return {
            majorSupport,
            majorResistance,
            supply,
            demand,
            supports: supports.slice(0, 5),
            resistances: resistances.slice(0, 5)
        };
    }

    // ================================================================
    // 10. Probability Engine
    // ================================================================
    function calculateProbability(structure, trend, momentum, volume, smc) {
        let trendScore = 50;
        if (trend.type === 'strong_bull') trendScore = 80;
        else if (trend.type === 'weak_bull') trendScore = 60;
        else if (trend.type === 'strong_bear') trendScore = 20;
        else if (trend.type === 'weak_bear') trendScore = 40;

        let momentumScore = 50;
        if (momentum.direction === 'up' && momentum.rsi > 55) momentumScore = 70;
        else if (momentum.direction === 'down' && momentum.rsi < 45) momentumScore = 30;
        if (momentum.divergence) momentumScore = momentumScore > 50 ? momentumScore - 15 : momentumScore + 15;

        let structureScore = 50;
        if (structure.type === 'uptrend') structureScore = 70;
        else if (structure.type === 'downtrend') structureScore = 30;

        const smcBullish = smc.bos.filter(b => b.type === 'bullish').length;
        const smcBearish = smc.bos.filter(b => b.type === 'bearish').length;
        let smcScore = 50 + (smcBullish - smcBearish) * 5;

        const bullish = Math.round((trendScore * 0.35 + momentumScore * 0.25 + structureScore * 0.25 + smcScore * 0.15));
        const boundedBullish = Math.max(5, Math.min(95, bullish));
        const boundedBearish = Math.max(5, Math.min(95, 100 - boundedBullish));
        const neutral = Math.round(100 - boundedBullish - boundedBearish);
        const confidence = Math.round(Math.abs(boundedBullish - 50) * 2);

        return {
            bullish: boundedBullish,
            bearish: boundedBearish,
            neutral: Math.max(0, neutral),
            confidence
        };
    }

    // ================================================================
    // 11. Scenario Generator
    // ================================================================
    function generateScenarios(candles, structure, trend, smc, momentum, volume, probabilities) {
        const lastPrice = candles[candles.length - 1].close;
        const atr = mean(candles.slice(-14).map(candleRange));
        const scenarios = [];

        const isBullish = trend.type === 'strong_bull' || trend.type === 'weak_bull';
        const isBearish = trend.type === 'strong_bear' || trend.type === 'weak_bear';

        function pushScenario(s) { scenarios.push(s); }

        // Long
        if (isBullish && structure.type === 'uptrend') {
            pushScenario({
                id: 'long', title: 'Long', description: 'Покупка по тренду.', direction: 'long',
                category: 'directional', riskLevel: 'medium', probability: round(0.55 + trend.strength / 200, 2),
                confidence: round(60 + trend.strength / 3),
                entryZone: { low: round(lastPrice - atr * 0.3), high: round(lastPrice + atr * 0.1) },
                stopLoss: round(lastPrice - atr * 1.5), takeProfit: round(lastPrice + atr * 3),
                riskRewardRatio: '1:2', reasons: ['Бычий тренд', 'Структура HH/HL'], confirmations: ['retest', 'hold'], priority: 80, applicable: true
            });
        }

        // Short
        if (isBearish && structure.type === 'downtrend') {
            pushScenario({
                id: 'short', title: 'Short', description: 'Продажа по тренду.', direction: 'short',
                category: 'directional', riskLevel: 'medium', probability: round(0.55 + trend.strength / 200, 2),
                confidence: round(60 + trend.strength / 3),
                entryZone: { low: round(lastPrice - atr * 0.1), high: round(lastPrice + atr * 0.3) },
                stopLoss: round(lastPrice + atr * 1.5), takeProfit: round(lastPrice - atr * 3),
                riskRewardRatio: '1:2', reasons: ['Медвежий тренд', 'Структура LH/LL'], confirmations: ['retest', 'hold'], priority: 80, applicable: true
            });
        }

        // Wait
        pushScenario({
            id: 'wait', title: 'Wait', description: 'Ожидание подтверждения.', direction: 'neutral',
            category: 'neutral', riskLevel: 'low', probability: 1.0, confidence: 50,
            entryZone: null, stopLoss: null, takeProfit: null, riskRewardRatio: null,
            reasons: ['Сохранение капитала'], confirmations: [], priority: 30, applicable: true
        });

        // Pullback
        if ((isBullish || isBearish) && probabilities.confidence > 40) {
            pushScenario({
                id: 'pullback', title: 'Pullback', description: 'Вход на откате.', direction: isBullish ? 'long' : 'short',
                category: 'conditional', riskLevel: 'medium', probability: 0.52, confidence: 65,
                entryZone: { low: round(lastPrice - atr * 0.4), high: round(lastPrice + atr * 0.4) },
                stopLoss: round(lastPrice - (isBullish ? atr : -atr) * 1.2),
                takeProfit: round(lastPrice + (isBullish ? atr : -atr) * 2.5),
                riskRewardRatio: '1:2', reasons: ['Откат в тренде'], confirmations: ['retest', 'hold'], priority: 70, applicable: true
            });
        }

        // Breakout
        if (smc.bos.length > 0 && volume.ratio > 1.2) {
            const lastBOS = smc.bos[smc.bos.length - 1];
            pushScenario({
                id: 'breakout', title: 'Breakout', description: 'Вход на пробое.', direction: lastBOS.type === 'bullish' ? 'long' : 'short',
                category: 'conditional', riskLevel: 'medium', probability: 0.50, confidence: 60,
                entryZone: { low: round(lastBOS.level), high: round(lastBOS.level + atr * 0.2) },
                stopLoss: round(lastBOS.level - atr), takeProfit: round(lastBOS.level + atr * 2),
                riskRewardRatio: '1:2', reasons: ['BOS подтверждён объёмом'], confirmations: ['breakout', 'high-volume'], priority: 65, applicable: true
            });
        }

        // BOS Continuation
        if (smc.bos.length > 0) {
            const lastBOS = smc.bos[smc.bos.length - 1];
            pushScenario({
                id: 'bos-continuation', title: 'BOS Continuation', description: 'Продолжение после BOS.',
                direction: lastBOS.type === 'bullish' ? 'long' : 'short',
                category: 'conditional', riskLevel: 'medium', probability: 0.55, confidence: 65,
                entryZone: { low: round(lastBOS.level), high: round(lastBOS.level + atr * 0.2) },
                stopLoss: round(lastBOS.level - atr), takeProfit: round(lastBOS.level + atr * 2),
                riskRewardRatio: '1:2', reasons: [`${lastBOS.type} BOS обнаружен`], confirmations: ['impulse', 'high-volume'], priority: 70, applicable: true
            });
        }

        // CHoCH Reversal
        if (smc.choch.length > 0) {
            const lastCHoCH = smc.choch[smc.choch.length - 1];
            const direction = lastPrice > lastCHoCH.price ? 'short' : 'long';
            pushScenario({
                id: 'choch-reversal', title: 'CHoCH Reversal', description: 'Разворот после CHoCH.',
                direction, category: 'counter-trend', riskLevel: 'high', probability: 0.40, confidence: 50,
                entryZone: { low: round(lastCHoCH.price), high: round(lastCHoCH.price + atr * 0.3) },
                stopLoss: round(direction === 'long' ? lastCHoCH.price - atr * 1.5 : lastCHoCH.price + atr * 1.5),
                takeProfit: round(direction === 'long' ? lastCHoCH.price + atr * 3 : lastCHoCH.price - atr * 3),
                riskRewardRatio: '1:2', reasons: ['Смена характера движения'], confirmations: ['breakout'], priority: 55, applicable: true
            });
        }

        // Order Block Entry
        if (smc.orderBlocks.length > 0) {
            const lastOB = smc.orderBlocks[smc.orderBlocks.length - 1];
            pushScenario({
                id: 'order-block-entry', title: 'Order Block Entry', description: 'Вход в OB.',
                direction: lastOB.type === 'bullish' ? 'long' : 'short',
                category: 'conditional', riskLevel: 'low', probability: 0.52, confidence: 65,
                entryZone: { low: round(lastOB.low), high: round(lastOB.high) },
                stopLoss: round(lastOB.type === 'bullish' ? lastOB.low - atr * 0.5 : lastOB.high + atr * 0.5),
                takeProfit: round(lastOB.type === 'bullish' ? lastOB.high + atr * 2 : lastOB.low - atr * 2),
                riskRewardRatio: '1:2', reasons: [`${lastOB.type} order block`], confirmations: ['retest', 'hold'], priority: 70, applicable: true
            });
        }

        // FVG Entry
        if (smc.fairValueGaps.length > 0) {
            const lastFVG = smc.fairValueGaps[smc.fairValueGaps.length - 1];
            pushScenario({
                id: 'fvg-entry', title: 'FVG Entry', description: 'Вход на ретесте FVG.',
                direction: lastFVG.type === 'bullish' ? 'long' : 'short',
                category: 'conditional', riskLevel: 'low', probability: 0.50, confidence: 60,
                entryZone: { low: round(lastFVG.low), high: round(lastFVG.high) },
                stopLoss: round(lastFVG.type === 'bullish' ? lastFVG.low - atr * 0.5 : lastFVG.high + atr * 0.5),
                takeProfit: round(lastFVG.type === 'bullish' ? lastFVG.high + atr * 2 : lastFVG.low - atr * 2),
                riskRewardRatio: '1:2', reasons: ['Незаполненный FVG'], confirmations: ['retest', 'hold'], priority: 65, applicable: true
            });
        }

        // Pin Bar Entry
        const pinBar = momentum.impulseMove && (candles[candles.length - 1] && lowerWick(candles[candles.length - 1]) / candleRange(candles[candles.length - 1]) > 0.5);
        if (pinBar) {
            const dir = isBull(candles[candles.length - 1]) ? 'long' : 'short';
            pushScenario({
                id: 'pin-bar-entry', title: 'Pin Bar Entry', description: 'Вход по Pin Bar.',
                direction: dir, category: 'conditional', riskLevel: 'medium', probability: 0.60, confidence: 65,
                entryZone: { low: round(candles[candles.length - 1].low), high: round(candles[candles.length - 1].high) },
                stopLoss: round(dir === 'long' ? candles[candles.length - 1].low - atr * 0.3 : candles[candles.length - 1].high + atr * 0.3),
                takeProfit: round(dir === 'long' ? lastPrice + atr * 2 : lastPrice - atr * 2),
                riskRewardRatio: '1:2', reasons: ['Pin Bar detected'], confirmations: ['rejection', 'hold'], priority: 60, applicable: true
            });
        }

        // Engulfing Entry
        if (candles.length >= 2) {
            const c = candles[candles.length - 1], prev = candles[candles.length - 2];
            if (isBear(prev) && isBull(c) && c.close > prev.open && c.open < prev.close) {
                pushScenario({
                    id: 'engulfing-entry', title: 'Engulfing Entry', description: 'Вход по Bullish Engulfing.',
                    direction: 'long', category: 'conditional', riskLevel: 'medium', probability: 0.65, confidence: 70,
                    entryZone: { low: round(c.low), high: round(c.high) },
                    stopLoss: round(c.low - atr * 0.5), takeProfit: round(lastPrice + atr * 2),
                    riskRewardRatio: '1:2', reasons: ['Bullish Engulfing'], confirmations: ['breakout', 'impulse'], priority: 65, applicable: true
                });
            } else if (isBull(prev) && isBear(c) && c.close < prev.open && c.open > prev.close) {
                pushScenario({
                    id: 'engulfing-entry', title: 'Engulfing Entry', description: 'Вход по Bearish Engulfing.',
                    direction: 'short', category: 'conditional', riskLevel: 'medium', probability: 0.65, confidence: 70,
                    entryZone: { low: round(c.low), high: round(c.high) },
                    stopLoss: round(c.high + atr * 0.5), takeProfit: round(lastPrice - atr * 2),
                    riskRewardRatio: '1:2', reasons: ['Bearish Engulfing'], confirmations: ['breakout', 'impulse'], priority: 65, applicable: true
                });
            }
        }

        // No Trade
        if (probabilities.confidence < 30 || structure.type === 'range') {
            pushScenario({
                id: 'no-trade', title: 'No Trade', description: 'Не входить в рынок.',
                direction: 'neutral', category: 'neutral', riskLevel: 'low', probability: 1.0, confidence: 0,
                entryZone: null, stopLoss: null, takeProfit: null, riskRewardRatio: null,
                reasons: ['Нет подходящего сетапа'], confirmations: [], priority: 10, applicable: true
            });
        }

        return scenarios.sort((a, b) => b.priority - a.priority);
    }

    // ================================================================
    // Evidence Builder
    // ================================================================
    function buildEvidence(structure, trend, smc, momentum, volume, scenarios) {
        const signals = [];
        const reasons = [];
        const keySignals = [];

        if (structure.type === 'uptrend') keySignals.push('uptrend_structure');
        if (structure.type === 'downtrend') keySignals.push('downtrend_structure');
        if (structure.type === 'range' || structure.type === 'consolidation') keySignals.push('range_structure');
        if (smc.bos.length > 0) keySignals.push('bos_detected');
        if (smc.choch.length > 0) keySignals.push('choch_detected');
        if (smc.orderBlocks.length > 0) keySignals.push('order_blocks');
        if (smc.fairValueGaps.length > 0) keySignals.push('fvg_detected');
        if (smc.liquiditySweeps.length > 0) keySignals.push('liquidity_sweep');
        if (momentum.divergence) keySignals.push('momentum_divergence');
        if (volume.volumeSpike) keySignals.push('volume_spike');
        if (volume.absorption) keySignals.push('absorption');

        signals.push(`trend=${trend.type}`);
        signals.push(`structure=${structure.type}`);
        signals.push(`rsi=${momentum.rsi}`);
        if (volume.volumeSpike) signals.push('volume_spike');
        if (momentum.divergence) signals.push('divergence');

        reasons.push(`Тренд: ${trend.type}, сила ${trend.strength}`);
        reasons.push(`Структура: ${structure.type}`);
        reasons.push(`Моментум: RSI=${momentum.rsi}, направление ${momentum.direction}`);
        if (smc.bos.length > 0) reasons.push(`BOS: ${smc.bos.length}`);
        if (volume.volumeSpike) reasons.push('Обнаружен volume spike');

        return { signals, reasons, keySignals };
    }

    // ================================================================
    // Главная точка входа
    // ================================================================
    function analyzeMarket(chartData) {
        const candles = (chartData && chartData.candles) || [];
        const level = chartData && chartData.level;
        const timeframe = (chartData && chartData.timeframe) || 'unknown';

        if (candles.length < 10) {
            return {
                error: 'Insufficient data: minimum 10 candles required',
                candlesProvided: candles.length
            };
        }

        // Шаг 1: Market Structure (база для всего остального)
        const marketStructure = analyzeMarketStructure(candles);

        // Шаг 2: Trend
        const trend = analyzeTrend(candles, marketStructure);

        // Шаг 3: Smart Money
        const smartMoney = analyzeSmartMoney(candles, marketStructure);

        // Шаг 4: Price Action
        const priceAction = analyzePriceAction(candles);

        // Шаг 5: Volume
        const volume = analyzeVolume(candles);

        // Шаг 6: Liquidity (зависит от SMC)
        const liquidity = analyzeLiquidity(candles, smartMoney);

        // Шаг 7: Volatility
        const volatility = analyzeVolatility(candles);

        // Шаг 8: Momentum
        const momentum = analyzeMomentum(candles);

        // Шаг 9: Support / Resistance
        const supportResistance = analyzeSupportResistance(candles, marketStructure);

        // Шаг 10: Probability Engine
        const probabilities = calculateProbability(marketStructure, trend, momentum, volume, smartMoney);

        // Шаг 11: Scenario Generator
        const scenarios = generateScenarios(candles, marketStructure, trend, smartMoney, momentum, volume, probabilities);

        // Шаг 12: Confidence
        const confidence = probabilities.confidence;

        // Шаг 13: Evidence
        const evidence = buildEvidence(marketStructure, trend, smartMoney, momentum, volume, scenarios);

        // Шаг 14: Confluence (новое)
        const confluence = analyzeConfluence(
            marketStructure, trend, smartMoney, priceAction,
            volume, liquidity, momentum, supportResistance, scenarios
        );

        // Шаг 15: Risk Assessment (новое)
        const riskAssessment = assessRisk(
            marketStructure, trend, volatility, volume,
            momentum, liquidity, scenarios, probabilities
        );

        // Шаг 16: Invalidation (новое)
        const invalidation = buildInvalidation(
            candles, scenarios, smartMoney, supportResistance, marketStructure
        );

        // Шаг 17: Market Phase (новое)
        const marketPhase = analyzeMarketPhase(
            candles, marketStructure, trend, volume, volatility, smartMoney
        );

        // Шаг 18: Execution Plan (новое)
        const executionPlan = buildExecutionPlan(
            candles, scenarios, smartMoney, supportResistance,
            marketStructure, riskAssessment, confluence
        );

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

            // Новые блоки (v2.0.0)
            confluence,
            riskAssessment,
            invalidation,
            marketPhase,
            executionPlan,

            meta: {
                version: '2.0.0',
                analyzedAt: new Date().toISOString(),
                candleCount: candles.length,
                timeframe: timeframe
            }
        };
    }

    // ================================================================
    // Реализации новых блоков (v2.0.0)
    // ================================================================

    /**
     * analyzeConfluence — подсчёт совпадений сигналов разных моделей.
     * Каждое совпадение взвешивается: чем больше моделей сошлось и чем они
     * сильнее, тем выше вес и итоговый рейтинг.
     */
    function analyzeConfluence(ms, trend, sm, pa, vol, liq, mom, sr, scenarios) {
        const confluences = [];
        let bullishCount = 0;
        let bearishCount = 0;
        let neutralCount = 0;

        // ---- Блок 1: Trend + BOS + FVG ----
        if (trend && (trend.strongBullTrend || trend.weakBullTrend) &&
            sm && sm.bos && sm.bos.some(b => b.type === 'bullish') &&
            sm && sm.fairValueGaps && sm.fairValueGaps.some(f => f.type === 'bullish' && !f.filled)) {
            const w = (trend.strongBullTrend ? 3 : 2) + sm.bos.length + sm.fairValueGaps.length;
            confluences.push({
                combination: ['Trend (bull)', 'BOS', 'FVG'],
                direction: 'bullish',
                weight: w,
                description: 'Бычий тренд подтверждён BOS и невыполненным FVG',
                models: ['trend', 'bos', 'fvg']
            });
            bullishCount++;
        }
        if (trend && (trend.strongBearTrend || trend.weakBearTrend) &&
            sm && sm.bos && sm.bos.some(b => b.type === 'bearish') &&
            sm && sm.fairValueGaps && sm.fairValueGaps.some(f => f.type === 'bearish' && !f.filled)) {
            const w = (trend.strongBearTrend ? 3 : 2) + sm.bos.length + sm.fairValueGaps.length;
            confluences.push({
                combination: ['Trend (bear)', 'BOS', 'FVG'],
                direction: 'bearish',
                weight: w,
                description: 'Медвежий тренд подтверждён BOS и невыполненным FVG',
                models: ['trend', 'bos', 'fvg']
            });
            bearishCount++;
        }

        // ---- Блок 2: Order Block + Pin Bar ----
        if (sm && sm.orderBlocks && sm.orderBlocks.length > 0 &&
            pa && pa.patterns && pa.patterns.some(p => p.type === 'pin_bar' || p.type === 'hammer')) {
            const lastOB = sm.orderBlocks[sm.orderBlocks.length - 1];
            const w = 3;
            confluences.push({
                combination: ['Order Block', 'Pin Bar'],
                direction: lastOB.type === 'bullish' ? 'bullish' : 'bearish',
                weight: w,
                description: 'Подтверждение Order Block пин-баром',
                models: ['order_block', 'price_action']
            });
            if (lastOB.type === 'bullish') bullishCount++; else bearishCount++;
        }

        // ---- Блок 3: Engulfing + Volume Spike ----
        if (pa && pa.patterns && pa.patterns.some(p => p.type === 'engulfing') &&
            vol && vol.volumeSpike) {
            const eng = pa.patterns.find(p => p.type === 'engulfing');
            // направление определяется по reversal_prob/continuation_prob
            const dir = eng && eng.reversal_prob > eng.continuation_prob ? 'bullish_or_bearish' : 'neutral';
            const w = 4;
            confluences.push({
                combination: ['Engulfing', 'Volume Spike'],
                direction: eng && eng.reversal_prob >= eng.continuation_prob
                    ? (eng.type === 'bullish_engulfing' ? 'bullish' : 'bearish')
                    : 'neutral',
                weight: w,
                description: 'Паттерн Engulfing подтверждён всплеском объёма',
                models: ['price_action', 'volume']
            });
            if (confluences[confluences.length - 1].direction === 'bullish') bullishCount++;
            else if (confluences[confluences.length - 1].direction === 'bearish') bearishCount++;
            else neutralCount++;
        }

        // ---- Блок 4: Liquidity Sweep + CHoCH ----
        if (sm && sm.liquiditySweeps && sm.liquiditySweeps.length > 0 &&
            sm && sm.choch && sm.choch.length > 0) {
            const lastSweep = sm.liquiditySweeps[sm.liquiditySweeps.length - 1];
            const lastChoch = sm.choch[sm.choch.length - 1];
            // Свип снизу + бычий CHoCH → разворот вверх
            // Свип сверху + медвежий CHoCH → разворот вниз
            const dir = (lastSweep.side === 'sell_side' && lastChoch.type === 'bullish') ? 'bullish'
                      : (lastSweep.side === 'buy_side' && lastChoch.type === 'bearish') ? 'bearish'
                      : 'neutral';
            if (dir !== 'neutral') {
                confluences.push({
                    combination: ['Liquidity Sweep', 'CHoCH'],
                    direction: dir,
                    weight: 5,
                    description: 'Свип ликвидности сменяется CHoCH — сильный сигнал разворота',
                    models: ['liquidity', 'smart_money']
                });
                if (dir === 'bullish') bullishCount++; else bearishCount++;
            }
        }

        // ---- Бонусные совпадения ----
        // Momentum + Volume
        if (mom && mom.strongMomentum && vol && vol.buyingPressure > 0.6) {
            confluences.push({
                combination: ['Strong Momentum', 'Buying Pressure'],
                direction: 'bullish',
                weight: 2,
                description: 'Сильный моментум + доминирование покупателей',
                models: ['momentum', 'volume']
            });
            bullishCount++;
        }
        if (mom && mom.strongMomentum && vol && vol.sellingPressure > 0.6) {
            confluences.push({
                combination: ['Strong Momentum', 'Selling Pressure'],
                direction: 'bearish',
                weight: 2,
                description: 'Сильный моментум + доминирование продавцов',
                models: ['momentum', 'volume']
            });
            bearishCount++;
        }

        // Support/Resistance + Price Action
        if (sr && sr.majorLevels && sr.majorLevels.length > 0 && pa && pa.patterns && pa.patterns.length > 0) {
            confluences.push({
                combination: ['Major Level', 'Price Action Pattern'],
                direction: 'neutral',
                weight: 1,
                description: 'Реакция на ключевом уровне с формированием паттерна',
                models: ['support_resistance', 'price_action']
            });
            neutralCount++;
        }

        // Расчёт итогов
        const totalSignals = bullishCount + bearishCount + neutralCount;
        let dominantDirection = 'neutral';
        if (bullishCount > bearishCount) dominantDirection = 'bullish';
        else if (bearishCount > bullishCount) dominantDirection = 'bearish';

        // Strength — от количества и веса совпадений
        const totalWeight = confluences.reduce((s, c) => s + c.weight, 0);
        let strength = 'weak';
        if (totalWeight >= 12) strength = 'very_strong';
        else if (totalWeight >= 7) strength = 'strong';
        else if (totalWeight >= 3) strength = 'moderate';

        // Rating 0..100
        const rating = Math.min(100, Math.round(totalWeight * 6 + (totalSignals * 4)));

        return {
            totalSignals,
            bullishCount,
            bearishCount,
            neutralCount,
            confluences,
            strength,
            rating,
            dominantDirection,
            summary: `Найдено ${confluences.length} совпадений сигналов (${bullishCount} бычьих / ${bearishCount} медвежьих). Доминирование: ${dominantDirection}.`
        };
    }

    /**
     * assessRisk — оценка риска с учётом 5 факторов:
     * волатильность, объём, конфликт сигналов, торговля против тренда, ликвидность.
     */
    function assessRisk(ms, trend, vol, volume, mom, liq, scenarios, probs) {
        const factors = {
            volatility: 0,
            volume: 0,
            conflict: 0,
            counterTrend: 0,
            liquidity: 0
        };
        const reasons = [];
        const warnings = [];

        // 1. Volatility
        if (vol && vol.atrExpansion) {
            factors.volatility = 0.8;
            reasons.push('Высокая волатильность (ATR Expansion) — расширенные стопы');
            warnings.push('Расширенная волатильность увеличивает размер стоп-лосса');
        } else if (vol && vol.atrCompression) {
            factors.volatility = 0.3;
            reasons.push('Сжатие волатильности (ATR Compression) — возможен скорый пробой');
        } else {
            factors.volatility = 0.5;
        }

        // 2. Volume
        if (volume && volume.ratio && volume.ratio < 0.7) {
            factors.volume = 0.7;
            reasons.push('Слабый объём — подтверждение движений ненадёжно');
            warnings.push('Объём ниже среднего, движение может быть ложным');
        } else if (volume && volume.ratio && volume.ratio > 1.3) {
            factors.volume = 0.3;
            reasons.push('Сильный объём — движения подтверждены');
        } else {
            factors.volume = 0.5;
        }

        // 3. Conflict (разница между bullish и bearish probability)
        if (probs && typeof probs.bullish === 'number' && typeof probs.bearish === 'number') {
            const diff = Math.abs(probs.bullish - probs.bearish);
            if (diff < 15) {
                factors.conflict = 0.8;
                reasons.push('Сильный конфликт сигналов — бычьи и медвежьи вероятности близки');
                warnings.push('Конфликт сигналов: рынок неопределён');
            } else if (diff < 30) {
                factors.conflict = 0.5;
            } else {
                factors.conflict = 0.2;
                reasons.push('Сигналы согласованы — низкий конфликт');
            }
        } else {
            factors.conflict = 0.4;
        }

        // 4. Counter-trend (проверяем активные сценарии против тренда)
        if (trend && scenarios && scenarios.length > 0) {
            const activeLongs = scenarios.filter(s => s.applicable && s.direction === 'long').length;
            const activeShorts = scenarios.filter(s => s.applicable && s.direction === 'short').length;
            const trendBull = trend.strongBullTrend || trend.weakBullTrend;
            const trendBear = trend.strongBearTrend || trend.weakBearTrend;

            if (trendBull && activeShorts > activeLongs) {
                factors.counterTrend = 0.8;
                reasons.push('Сценарии лонг/шорт конфликтуют с трендом');
                warnings.push('Часть активных сценариев работает против тренда');
            } else if (trendBear && activeLongs > activeShorts) {
                factors.counterTrend = 0.8;
                reasons.push('Сценарии лонг/шорт конфликтуют с трендом');
                warnings.push('Часть активных сценариев работает против тренда');
            } else {
                factors.counterTrend = 0.2;
            }
        } else {
            factors.counterTrend = 0.3;
        }

        // 5. Liquidity (Liquidity Void / отсутствие ликвидности = риск)
        if (liq && liq.liquidityVoids && liq.liquidityVoids.length > 0) {
            factors.liquidity = 0.7;
            reasons.push('Обнаружены зоны ликвидного вакуума — резкие движения вероятны');
            warnings.push('Liquidity Void — зона без ликвидности');
        } else {
            factors.liquidity = 0.3;
        }

        // Итоговая оценка риска
        const score = Math.round(
            (factors.volatility * 25) +
            (factors.volume * 20) +
            (factors.conflict * 25) +
            (factors.counterTrend * 20) +
            (factors.liquidity * 10)
        );

        let level = 'medium';
        if (score >= 65) level = 'high';
        else if (score <= 35) level = 'low';

        let recommendation = '';
        if (level === 'low') {
            recommendation = 'Условия благоприятные. Можно рассматривать вход по подтверждённым сценариям стандартным лотом.';
        } else if (level === 'medium') {
            recommendation = 'Условия средние. Рекомендуется уменьшить размер позиции и ждать подтверждения.';
        } else {
            recommendation = 'Условия рискованные. Рекомендуется воздержаться от входа или торговать минимальным лотом.';
        }

        return {
            level,
            score,
            factors,
            reasons,
            recommendation,
            warnings
        };
    }

    /**
     * buildInvalidation — определяет уровни и условия, при которых сценарий
     * становится недействительным.
     */
    function buildInvalidation(candles, scenarios, sm, sr, ms) {
        const invalidationLevels = [];
        const globalInvalidations = [];
        const criticalLevels = [];

        const lastCandle = candles[candles.length - 1];
        const currentPrice = lastCandle ? lastCandle.close : 0;

        // 1. По каждому применимому сценарию
        if (scenarios && scenarios.length > 0) {
            scenarios.forEach(sc => {
                if (!sc.applicable) return;

                if (sc.direction === 'long' && sc.stopLoss != null) {
                    invalidationLevels.push({
                        scenarioId: sc.id,
                        price: sc.stopLoss,
                        type: 'below',
                        condition: `Пробой уровня ${sc.stopLoss.toFixed(2)} вниз отменяет бычий сценарий "${sc.title}"`,
                        probabilityDropTo: Math.max(0, Math.min(100, (sc.probability || 50) - 40))
                    });
                    criticalLevels.push(sc.stopLoss);
                } else if (sc.direction === 'short' && sc.stopLoss != null) {
                    invalidationLevels.push({
                        scenarioId: sc.id,
                        price: sc.stopLoss,
                        type: 'above',
                        condition: `Пробой уровня ${sc.stopLoss.toFixed(2)} вверх отменяет медвежий сценарий "${sc.title}"`,
                        probabilityDropTo: Math.max(0, Math.min(100, (sc.probability || 50) - 40))
                    });
                    criticalLevels.push(sc.stopLoss);
                }

                // Take profit как уровень фиксации (но не инвалидации) — не добавляем
            });
        }

        // 2. Глобальные инвалидации от SMC
        if (sm && sm.bos && sm.bos.length > 0) {
            const lastBos = sm.bos[sm.bos.length - 1];
            globalInvalidations.push(
                `BOS уровня ${lastBos.level.toFixed(2)} (${lastBos.type}) — пробой в обратную сторону отменяет текущий нарратив`
            );
            criticalLevels.push(lastBos.level);
        }

        if (sm && sm.choch && sm.choch.length > 0) {
            const lastChoch = sm.choch[sm.choch.length - 1];
            globalInvalidations.push(
                `CHoCH уровня ${lastChoch.level.toFixed(2)} — следующий CHoCH в противоположную сторону инвалидирует структуру`
            );
            criticalLevels.push(lastChoch.level);
        }

        // 3. Уровни поддержки/сопротивления как критические
        if (sr && sr.supply && sr.supply.length > 0) {
            sr.supply.forEach(s => {
                if (typeof s === 'number') criticalLevels.push(s);
                else if (s && typeof s.price === 'number') criticalLevels.push(s.price);
            });
        }
        if (sr && sr.demand && sr.demand.length > 0) {
            sr.demand.forEach(d => {
                if (typeof d === 'number') criticalLevels.push(d);
                else if (d && typeof d.price === 'number') criticalLevels.push(d.price);
            });
        }
        if (sr && sr.majorLevels && sr.majorLevels.length > 0) {
            sr.majorLevels.forEach(l => {
                if (typeof l === 'number') criticalLevels.push(l);
                else if (l && typeof l.price === 'number') criticalLevels.push(l.price);
            });
        }

        // 4. Временная инвалидация (через 50 свечей сценарий устаревает)
        const candlesLimit = 50;
        const expired = candles.length > candlesLimit
            ? false
            : (candles.length > candlesLimit * 1.5);

        return {
            invalidationLevels,
            globalInvalidations,
            criticalLevels: [...new Set(criticalLevels)].sort((a, b) => a - b),
            timeBasedInvalidation: {
                candlesLimit,
                expired
            }
        };
    }

    /**
     * analyzeMarketPhase — определяет текущую фазу рынка (Wyckoff-style).
     */
    function analyzeMarketPhase(candles, ms, trend, vol, volatility, sm) {
        const last = candles[candles.length - 1];
        const first = candles[0];
        if (!last || !first) {
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

        const priceChange = ((last.close - first.close) / first.close) * 100;
        const absChange = Math.abs(priceChange);
        const isUptrend = ms && (ms.type === 'uptrend' || ms.type === 'expansion');
        const isDowntrend = ms && ms.type === 'downtrend';
        const isRange = ms && (ms.type === 'range' || ms.type === 'consolidation' || ms.type === 'compression');

        const volExpansion = volatility && volatility.atrExpansion;
        const volCompression = volatility && volatility.atrCompression;
        const volExhaustion = vol && vol.exhaustion;
        const buyingDom = vol && vol.buyingPressure > 0.55;
        const sellingDom = vol && vol.sellingPressure > 0.55;

        const signals = [];
        let current = 'consolidation';
        let description = '';
        let characteristics = [];

        // === Markup / Markdown — направленный тренд с объёмом ===
        if (isUptrend && buyingDom && !volExhaustion) {
            current = 'markup';
            description = 'Фаза роста: восходящий тренд с доминированием покупателей';
            characteristics = [
                'Цена выше ключевых скользящих средних',
                'Объём растёт на росте и падает на откатах',
                'Формируются HH/HL',
                'Импульсные движения вверх'
            ];
            signals.push('Uptrend', 'Buying Pressure', 'HH/HL');
        } else if (isDowntrend && sellingDom && !volExhaustion) {
            current = 'markdown';
            description = 'Фаза снижения: нисходящий тренд с доминированием продавцов';
            characteristics = [
                'Цена ниже ключевых скользящих средних',
                'Объём растёт на падении',
                'Формируются LL/LH',
                'Импульсные движения вниз'
            ];
            signals.push('Downtrend', 'Selling Pressure', 'LL/LH');
        }
        // === Distribution — боковик после роста с признаками разгрузки ===
        else if (isRange && (volExhaustion || (volatility && volatility.atrCompression && priceChange > 5))) {
            current = 'distribution';
            description = 'Фаза распределения: боковик после роста, крупный игрок разгружает позиции';
            characteristics = [
                'Боковое движение после восходящего тренда',
                'Высокий объём на откатах, низкий на росте',
                'Equal Highs / Equal Lows',
                'Возможен разворот вниз'
            ];
            signals.push('Range', 'Volume Exhaustion', 'Equal Highs');
        }
        // === Accumulation — боковик после падения с признаками набора позиций ===
        else if (isRange && (volExhaustion || (volatility && volatility.atrCompression && priceChange < -5))) {
            current = 'accumulation';
            description = 'Фаза накопления: боковик после снижения, крупный игрок набирает позиции';
            characteristics = [
                'Боковое движение после нисходящего тренда',
                'Низкий объём на откатах, повышенный на росте',
                'Equal Lows',
                'Возможен разворот вверх'
            ];
            signals.push('Range', 'Volume Exhaustion', 'Equal Lows');
        }
        // === Expansion — выход из сжатия ===
        else if (volExpansion && absChange > 2) {
            current = 'expansion';
            description = 'Фаза расширения: пробой из зоны сжатия с резким движением';
            characteristics = [
                'ATR Expansion',
                'Сильный импульс',
                'Объём резко вырос',
                'Пробой ключевого уровня'
            ];
            signals.push('ATR Expansion', 'Volume Spike');
        }
        // === Consolidation — обычный боковик ===
        else {
            current = 'consolidation';
            description = 'Фаза консолидации: боковое движение без выраженного направления';
            characteristics = [
                'Узкий диапазон',
                'Низкая активность',
                'Ожидание направления'
            ];
            signals.push('Range');
        }

        // previous phase (по последним 20 свечам)
        const previous = candles.length >= 40
            ? inferPreviousPhase(candles.slice(0, candles.length - 20), ms)
            : null;

        // transition
        let transitionFrom = previous;
        let transitionConfirmed = previous !== null && previous !== current;
        let candlesAgo = 20;

        // expected next
        const expectedNext = current === 'markup' ? 'distribution'
                           : current === 'distribution' ? 'markdown'
                           : current === 'markdown' ? 'accumulation'
                           : current === 'accumulation' ? 'markup'
                           : current === 'expansion' ? 'consolidation'
                           : 'markup or markdown';

        return {
            current,
            previous,
            description,
            characteristics,
            transition: {
                from: transitionFrom,
                to: current,
                confirmed: transitionConfirmed,
                candlesAgo
            },
            durationCandles: candlesAgo,
            expectedNext,
            signals
        };
    }

    /**
     * Вспомогательная: определяет фазу на отрезке свечей.
     */
    function inferPreviousPhase(candlesSubset, ms) {
        if (!candlesSubset || candlesSubset.length < 2) return null;
        const first = candlesSubset[0];
        const last = candlesSubset[candlesSubset.length - 1];
        const change = ((last.close - first.close) / first.close) * 100;
        if (change > 3) return 'markup';
        if (change < -3) return 'markdown';
        return 'consolidation';
    }

    /**
     * buildExecutionPlan — формирует готовый торговый план по лучшему сценарию.
     */
    function buildExecutionPlan(candles, scenarios, sm, sr, ms, risk, confluence) {
        const last = candles[candles.length - 1];
        const currentPrice = last ? last.close : 0;

        // Выбираем лучший применимый сценарий
        let best = null;
        if (scenarios && scenarios.length > 0) {
            const applicable = scenarios.filter(s => s.applicable);
            if (applicable.length > 0) {
                best = applicable.reduce((a, b) =>
                    ((b.priority || 0) > (a.priority || 0) ? b : a)
                );
            }
        }

        if (!best || !currentPrice) {
            return {
                direction: 'wait',
                basedOn: 'none',
                entryZone: null,
                confirmation: 'Нет активных сценариев — рекомендуется ожидание',
                stopLoss: null,
                takeProfit: [],
                riskRewardRatio: 0,
                positionSizeRecommendation: 'no_trade',
                managementRules: [
                    'Дождаться формирования нового сценария',
                    'Не открывать позиции без подтверждения'
                ],
                alternatives: [],
                timestamp: new Date().toISOString()
            };
        }

        const direction = best.direction === 'long' ? 'long'
                        : best.direction === 'short' ? 'short'
                        : 'wait';

        // Entry zone — если есть у сценария, иначе строим по текущей цене ± ATR
        let entryZone = null;
        if (best.entryZone && typeof best.entryZone.low === 'number' && typeof best.entryZone.high === 'number') {
            const mid = (best.entryZone.low + best.entryZone.high) / 2;
            entryZone = {
                low: best.entryZone.low,
                high: best.entryZone.high,
                midpoint: mid
            };
        } else if (direction !== 'wait') {
            // ATR-буфер
            const atr = calculateATR(candles, 14);
            const buffer = atr * 0.25;
            const low = direction === 'long' ? currentPrice - buffer : currentPrice + buffer;
            const high = direction === 'long' ? currentPrice + buffer : currentPrice - buffer;
            entryZone = {
                low: Math.min(low, high),
                high: Math.max(low, high),
                midpoint: (low + high) / 2
            };
        }

        // Stop Loss
        let stopLoss = null;
        if (best.stopLoss != null && direction !== 'wait') {
            const distance = Math.abs(currentPrice - best.stopLoss);
            const distancePct = (distance / currentPrice) * 100;
            stopLoss = {
                price: best.stopLoss,
                distance: distance,
                distancePct: distancePct
            };
        }

        // Take Profit
        const takeProfit = [];
        if (best.takeProfit != null && direction !== 'wait' && stopLoss) {
            const riskDist = stopLoss.distance;
            // TP1 — 1R, TP2 — 2R, TP3 — 3R
            [1, 2, 3].forEach((mult, i) => {
                const level = direction === 'long'
                    ? currentPrice + riskDist * mult
                    : currentPrice - riskDist * mult;
                takeProfit.push({
                    level: level,
                    distance: riskDist * mult,
                    distancePct: (riskDist * mult / currentPrice) * 100,
                    label: `TP${i + 1} (${mult}R)`
                });
            });
        }

        // Risk/Reward
        let rr = 0;
        if (stopLoss && takeProfit.length > 0) {
            rr = takeProfit[0].distance / stopLoss.distance;
        }

        // Position size по уровню риска и confluence
        let positionSize = 'no_trade';
        if (direction !== 'wait' && rr >= 1.5) {
            if (risk && risk.level === 'low' && confluence && confluence.rating >= 60) {
                positionSize = 'medium';
            } else if (risk && risk.level === 'medium' && confluence && confluence.rating >= 40) {
                positionSize = 'small';
            } else if (confluence && confluence.rating >= 20) {
                positionSize = 'minimal';
            }
        }

        // Management rules
        const managementRules = [];
        if (direction === 'long') {
            managementRules.push('Стоп-лосс переносится в безубыток после достижения TP1 (1R)');
            managementRules.push('Частичная фиксация: 30% на TP1, 30% на TP2, 40% на TP3');
            managementRules.push('При появлении CHoCH против позиции — закрыть немедленно');
        } else if (direction === 'short') {
            managementRules.push('Стоп-лосс переносится в безубыток после достижения TP1 (1R)');
            managementRules.push('Частичная фиксация: 30% на TP1, 30% на TP2, 40% на TP3');
            managementRules.push('При появлении CHoCH против позиции — закрыть немедленно');
        }
        if (confluence && confluence.rating < 40) {
            managementRules.push('Слабая конвергенция — рекомендуется уменьшить размер позиции');
        }
        if (risk && risk.warnings && risk.warnings.length > 0) {
            managementRules.push('Учесть предупреждения по риску: ' + risk.warnings[0]);
        }

        // Alternatives — следующие по приоритету сценарии
        const alternatives = [];
        if (scenarios && scenarios.length > 1) {
            const others = scenarios
                .filter(s => s.applicable && s.id !== best.id)
                .sort((a, b) => (b.priority || 0) - (a.priority || 0))
                .slice(0, 3);
            others.forEach(o => {
                alternatives.push({
                    scenarioId: o.id,
                    direction: o.direction === 'neutral' ? 'long' : o.direction,
                    reason: o.title || o.description || ''
                });
            });
        }

        return {
            direction,
            basedOn: best.id,
            entryZone,
            confirmation: best.confirmations && best.confirmations.length > 0
                ? best.confirmations.join('; ')
                : `Подтверждение входа по сценарию "${best.title}"`,
            stopLoss,
            takeProfit,
            riskRewardRatio: Number(rr.toFixed(2)),
            positionSizeRecommendation: positionSize,
            managementRules,
            alternatives,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Вспомогательная: расчёт ATR (Average True Range) за n периодов.
     */
    function calculateATR(candles, period) {
        if (!candles || candles.length < period + 1) return 0;
        const trs = [];
        for (let i = candles.length - period; i < candles.length; i++) {
            if (i <= 0) continue;
            const c = candles[i];
            const p = candles[i - 1];
            const tr = Math.max(
                c.high - c.low,
                Math.abs(c.high - p.close),
                Math.abs(c.low - p.close)
            );
            trs.push(tr);
        }
        if (trs.length === 0) return 0;
        return trs.reduce((s, v) => s + v, 0) / trs.length;
    }

    // ================================================================
    // Экспорт
    // ================================================================
    const coreAnalysisEngine = {
        analyzeMarket: analyzeMarket,
        // Публичные суб-функции для тонкой настройки
        analyzeMarketStructure: analyzeMarketStructure,
        analyzeTrend: analyzeTrend,
        analyzeSmartMoney: analyzeSmartMoney,
        analyzePriceAction: analyzePriceAction,
        analyzeVolume: analyzeVolume,
        analyzeLiquidity: analyzeLiquidity,
        analyzeVolatility: analyzeVolatility,
        analyzeMomentum: analyzeMomentum,
        analyzeSupportResistance: analyzeSupportResistance,
        calculateProbability: calculateProbability,
        generateScenarios: generateScenarios,
        buildEvidence: buildEvidence,
        // Новые блоки (v2.0.0)
        analyzeConfluence: analyzeConfluence,
        assessRisk: assessRisk,
        buildInvalidation: buildInvalidation,
        analyzeMarketPhase: analyzeMarketPhase,
        buildExecutionPlan: buildExecutionPlan,
        // Версия
        VERSION: '2.0.0'
    };

    // Глобальный экспорт (для совместимости)
    if (typeof global !== 'undefined') {
        global.coreAnalysisEngine = coreAnalysisEngine;
    }
    if (typeof window !== 'undefined') {
        window.coreAnalysisEngine = coreAnalysisEngine;
    }

    // CommonJS экспорт (для Node.js)
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = coreAnalysisEngine;
    }

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : globalThis));
