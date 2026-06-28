/**
 * supportResistanceAnalyzer.ts — Module X / Analyzer #9
 *
 * Назначение: определяет ключевые уровни поддержки/сопротивления
 *              (Supply, Demand, Major Levels, Pivot Points, Dynamic Levels).
 *
 * Зависимости: marketStructureAnalyzer (опционально для swing levels).
 * Используется: scenarioGenerator, invalidationBuilder, executionPlanBuilder.
 *
 * Публичный API:
 *   - analyzeSupportResistance(candles: Candle[], marketStructure?: MarketStructureResult): SupportResistanceResult
 *
 * Алгоритмы:
 *   1. Pivot Point Clustering — группировка ценовых экстремумов в зоны.
 *   2. Fractal Highs/Lows — рекурсивный поиск локальных экстремумов.
 *   3. Classical Pivot Points (Floor) — на основе High/Low/Close предыдущего периода.
 *   4. Fibonacci Levels — откаты от min/max диапазона.
 *   5. EMA-based Dynamic Levels — динамические S/R как EMA-периоды.
 *   6. Volume-weighted Levels — уровни с высоким объёмом.
 *   7. Strength Score — кол-во касаний + возраст + близость к текущей цене.
 */

interface SRCandle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface SRMarketStructureResult {
    swings: Array<{ index: number; type: 'high' | 'low'; price: number; time: number }>;
}

interface SRLevel { price: number; strength: number; touches: number; type: 'supply' | 'demand' | 'major'; firstSeen: number; lastTouched: number; }

interface SupportResistanceResult {
    supply: SRLevel[];                    // Зоны сопротивления (над ценой)
    demand: SRLevel[];                    // Зоны поддержки (под ценой)
    majorLevels: SRLevel[];               // Ключевые уровни (объединяют S/R)
    levels: SRLevel[];                    // Все уровни (supply + demand + major + pivot fallback)
    pivotPoints: { pp: number; r1: number; r2: number; r3: number; s1: number; s2: number; s3: number; };
    fibonacci: { level: number; price: number; type: 'retracement' | 'extension' }[];
    dynamicLevels: { ema20: number; ema50: number; ema200: number; vwap?: number };
    nearestSupport: { price: number; strength: number } | null;
    nearestResistance: { price: number; strength: number } | null;
    pricePosition: 'in_supply' | 'in_demand' | 'neutral' | 'at_level';
    metadata: {
        supplyCount: number;
        demandCount: number;
        levelCount: number;
        fibLevels: number;
    };
}

(function (global: any) {
    'use strict';

    // ============================================================
    // КОНФИГУРАЦИЯ
    // ============================================================
    const FRACTAL_DEPTH = 2;              // Глубина фракталов
    const CLUSTER_TOLERANCE_PCT = 0.005;  // 0.5% допуск для кластеризации
    const MIN_TOUCHES = 2;                // Минимум касаний для уровня
    const EMA_FAST = 20;
    const EMA_MID = 50;
    const EMA_SLOW = 200;
    const LOOKBACK = 200;                 // Окно для поиска уровней

    // ============================================================
    // УТИЛИТЫ
    // ============================================================
    function ema(arr: number[], period: number): number[] {
        const out: number[] = [];
        const k = 2 / (period + 1);
        for (let i = 0; i < arr.length; i++) {
            if (i === 0) out.push(arr[0]);
            else out.push(arr[i] * k + out[i - 1] * (1 - k));
        }
        return out;
    }

    // ============================================================
    // 1. FRACTAL HIGHS / LOWS
    // ============================================================
    function findFractals(candles: SRCandle[], depth: number = FRACTAL_DEPTH): { highs: { index: number; price: number }[]; lows: { index: number; price: number }[] } {
        const highs: { index: number; price: number }[] = [];
        const lows: { index: number; price: number }[] = [];
        if (candles.length < depth * 2 + 1) return { highs, lows };

        for (let i = depth; i < candles.length - depth; i++) {
            let isHigh = true, isLow = true;
            for (let j = 1; j <= depth; j++) {
                if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) isHigh = false;
                if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) isLow = false;
            }
            if (isHigh) highs.push({ index: i, price: candles[i].high });
            if (isLow) lows.push({ index: i, price: candles[i].low });
        }
        return { highs, lows };
    }

    // ============================================================
    // 2. КЛАСТЕРИЗАЦИЯ УРОВНЕЙ
    // ============================================================
    function clusterLevels(prices: { index: number; price: number }[], tolerance: number): { price: number; touches: number; firstSeen: number; lastTouched: number; indices: number[] }[] {
        if (prices.length === 0) return [];
        const sorted = [...prices].sort((a, b) => a.price - b.price);
        const clusters: { price: number; touches: number; firstSeen: number; lastTouched: number; indices: number[] }[] = [];
        let cur: { price: number; touches: number; firstSeen: number; lastTouched: number; indices: number[] } = {
            price: sorted[0].price,
            touches: 1,
            firstSeen: sorted[0].index,
            lastTouched: sorted[0].index,
            indices: [sorted[0].index]
        };

        for (let i = 1; i < sorted.length; i++) {
            const toleranceAbs = cur.price * tolerance;
            if (Math.abs(sorted[i].price - cur.price) <= toleranceAbs) {
                cur.price = (cur.price * cur.touches + sorted[i].price) / (cur.touches + 1);
                cur.touches++;
                cur.lastTouched = sorted[i].index;
                cur.indices.push(sorted[i].index);
            } else {
                clusters.push(cur);
                cur = {
                    price: sorted[i].price,
                    touches: 1,
                    firstSeen: sorted[i].index,
                    lastTouched: sorted[i].index,
                    indices: [sorted[i].index]
                };
            }
        }
        clusters.push(cur);
        return clusters;
    }

    // ============================================================
    // 3. STRENGTH SCORE
    // ============================================================
    function calcStrength(cluster: { touches: number; firstSeen: number; lastTouched: number; price: number }, totalCandles: number, curPrice: number): number {
        const touchScore = Math.min(1, cluster.touches / 5);
        const recencyScore = Math.max(0, 1 - (totalCandles - cluster.lastTouched) / totalCandles);
        const proximityScore = Math.max(0.2, 1 - Math.abs(cluster.price - curPrice) / curPrice);
        // Чем больше возраст (firstSeen давно) и много касаний, тем сильнее
        const ageScore = Math.min(1, (cluster.lastTouched - cluster.firstSeen) / totalCandles);
        return (touchScore * 0.4 + recencyScore * 0.2 + proximityScore * 0.2 + ageScore * 0.2);
    }

    // ============================================================
    // 4. CLASSICAL PIVOT POINTS (Floor)
    // ============================================================
    function computePivots(candles: SRCandle[]): { pp: number; r1: number; r2: number; r3: number; s1: number; s2: number; s3: number } {
        if (candles.length < 2) return { pp: 0, r1: 0, r2: 0, r3: 0, s1: 0, s2: 0, s3: 0 };
        // Берём предыдущий "период" (здесь — последние N/4 свечей, эквивалент недели для часовых)
        const periodSize = Math.max(1, Math.floor(candles.length / 4));
        const prev = candles.slice(-(periodSize + 1), -1);
        if (prev.length === 0) return { pp: 0, r1: 0, r2: 0, r3: 0, s1: 0, s2: 0, s3: 0 };
        const high = Math.max(...prev.map(c => c.high));
        const low = Math.min(...prev.map(c => c.low));
        const close = prev[prev.length - 1].close;
        const pp = (high + low + close) / 3;
        return {
            pp,
            r1: 2 * pp - low,
            r2: pp + (high - low),
            r3: high + 2 * (pp - low),
            s1: 2 * pp - high,
            s2: pp - (high - low),
            s3: low - 2 * (high - pp)
        };
    }

    // ============================================================
    // 5. FIBONACCI RETRACEMENT & EXTENSION
    // ============================================================
    function computeFibonacci(candles: SRCandle[]): { level: number; price: number; type: 'retracement' | 'extension' }[] {
        if (candles.length < 20) return [];
        const look = Math.min(LOOKBACK, candles.length);
        const slice = candles.slice(-look);
        const high = Math.max(...slice.map(c => c.high));
        const low = Math.min(...slice.map(c => c.low));
        const range = high - low;
        const fibRatios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
        const extRatios = [1.272, 1.414, 1.618, 2.0];
        const fibs: { level: number; price: number; type: 'retracement' | 'extension' }[] = [];
        for (const r of fibRatios) {
            fibs.push({ level: r, price: high - range * r, type: 'retracement' });
        }
        for (const r of extRatios) {
            fibs.push({ level: r, price: high + range * (r - 1), type: 'extension' });
        }
        return fibs;
    }

    // ============================================================
    // ГЛАВНАЯ ФУНКЦИЯ
    // ============================================================
    function analyzeSupportResistance(candles: SRCandle[], marketStructure?: SRMarketStructureResult): SupportResistanceResult {
        const result: SupportResistanceResult = {
            supply: [],
            demand: [],
            majorLevels: [],
            levels: [],
            pivotPoints: { pp: 0, r1: 0, r2: 0, r3: 0, s1: 0, s2: 0, s3: 0 },
            fibonacci: [],
            dynamicLevels: { ema20: 0, ema50: 0, ema200: 0 },
            nearestSupport: null,
            nearestResistance: null,
            pricePosition: 'neutral',
            metadata: { supplyCount: 0, demandCount: 0, levelCount: 0, fibLevels: 0 }
        };

        if (!candles || candles.length < 20) return result;

        const curPrice = candles[candles.length - 1].close;
        const closes = candles.map(c => c.close);

        // 1. Фракталы + свинги из marketStructure
        const fractals = findFractals(candles);
        const fractalPrices = [...fractals.highs, ...fractals.lows];
        if (marketStructure && marketStructure.swings) {
            for (const sw of marketStructure.swings) {
                fractalPrices.push({ index: sw.index, price: sw.price });
            }
        }

        // 2. Кластеризация
        const clusters = clusterLevels(fractalPrices, CLUSTER_TOLERANCE_PCT);

        // 3. Построение уровней с фильтрацией
        const allLevels: SRLevel[] = [];
        for (const cluster of clusters) {
            if (cluster.touches < MIN_TOUCHES) continue;
            const strength = calcStrength(cluster, candles.length, curPrice);
            const type: 'supply' | 'demand' | 'major' = cluster.price > curPrice ? 'supply' : (cluster.price < curPrice ? 'demand' : 'major');
            allLevels.push({
                price: cluster.price,
                strength,
                touches: cluster.touches,
                type,
                firstSeen: cluster.firstSeen,
                lastTouched: cluster.lastTouched
            });
        }
        // Сортируем по силе
        allLevels.sort((a, b) => b.strength - a.strength);

        // 4. Разделение на S/R
        result.supply = allLevels.filter(l => l.type === 'supply').slice(0, 10);
        result.demand = allLevels.filter(l => l.type === 'demand').slice(0, 10);
        result.majorLevels = allLevels.filter(l => l.type === 'major' || l.strength > 0.7).slice(0, 10);

        // 5. Ближайшие уровни
        const supplyAbove = result.supply.filter(l => l.price > curPrice).sort((a, b) => a.price - b.price);
        const demandBelow = result.demand.filter(l => l.price < curPrice).sort((a, b) => b.price - a.price);
        result.nearestSupport = demandBelow.length > 0 ? { price: demandBelow[0].price, strength: demandBelow[0].strength } : null;
        result.nearestResistance = supplyAbove.length > 0 ? { price: supplyAbove[0].price, strength: supplyAbove[0].strength } : null;

        // 6. Price Position
        if (result.nearestSupport && Math.abs(curPrice - result.nearestSupport.price) / curPrice < 0.005) {
            result.pricePosition = 'at_level';
        } else if (result.nearestResistance && Math.abs(curPrice - result.nearestResistance.price) / curPrice < 0.005) {
            result.pricePosition = 'at_level';
        } else if (result.nearestSupport && result.nearestResistance) {
            const range = result.nearestResistance.price - result.nearestSupport.price;
            const distFromSupport = (curPrice - result.nearestSupport.price) / range;
            result.pricePosition = distFromSupport > 0.7 ? 'in_supply' : (distFromSupport < 0.3 ? 'in_demand' : 'neutral');
        }

        // 7. Pivot Points
        result.pivotPoints = computePivots(candles);

        // 7.1 Fallback-уровни из Pivot Points, если кластеры не дали результатов
        // (на монотонных трендах фракталы могут отсутствовать → уровней нет)
        if (allLevels.length === 0 && result.pivotPoints.pp > 0) {
            const piv = result.pivotPoints;
            const lastIdx = candles.length - 1;
            const pivLevels: SRLevel[] = [];
            const addPivot = (price: number, type: 'supply' | 'demand' | 'major') => {
                if (price <= 0) return;
                pivLevels.push({
                    price,
                    strength: 0.6,
                    touches: 1,
                    type,
                    firstSeen: lastIdx,
                    lastTouched: lastIdx
                });
            };
            addPivot(piv.s1, 'demand');
            addPivot(piv.s2, 'demand');
            addPivot(piv.s3, 'demand');
            addPivot(piv.pp, 'major');
            addPivot(piv.r1, 'supply');
            addPivot(piv.r2, 'supply');
            addPivot(piv.r3, 'supply');

            result.supply = pivLevels.filter(l => l.type === 'supply');
            result.demand = pivLevels.filter(l => l.type === 'demand');
            result.majorLevels = pivLevels.filter(l => l.type === 'major');

            // Пересчитаем ближайшие уровни с учётом pivot
            const supplyAbove = result.supply.filter(l => l.price > curPrice).sort((a, b) => a.price - b.price);
            const demandBelow = result.demand.filter(l => l.price < curPrice).sort((a, b) => b.price - a.price);
            result.nearestSupport = demandBelow.length > 0 ? { price: demandBelow[0].price, strength: demandBelow[0].strength } : null;
            result.nearestResistance = supplyAbove.length > 0 ? { price: supplyAbove[0].price, strength: supplyAbove[0].strength } : null;

            // Пересчитаем pricePosition с учётом pivot-уровней
            if (result.nearestSupport && Math.abs(curPrice - result.nearestSupport.price) / curPrice < 0.005) {
                result.pricePosition = 'at_level';
            } else if (result.nearestResistance && Math.abs(curPrice - result.nearestResistance.price) / curPrice < 0.005) {
                result.pricePosition = 'at_level';
            } else if (result.nearestSupport && result.nearestResistance) {
                const range = result.nearestResistance.price - result.nearestSupport.price;
                const distFromSupport = (curPrice - result.nearestSupport.price) / range;
                result.pricePosition = distFromSupport > 0.7 ? 'in_supply' : (distFromSupport < 0.3 ? 'in_demand' : 'neutral');
            }

            allLevels.push(...pivLevels);
        }

        // 7.2 Все уровни в одном массиве (для тестов и удобства потребителей)
        result.levels = [...allLevels];

        // 8. Fibonacci
        result.fibonacci = computeFibonacci(candles);
        result.metadata.fibLevels = result.fibonacci.length;

        // 9. Dynamic Levels (EMA)
        const ema20 = ema(closes, EMA_FAST);
        const ema50 = ema(closes, EMA_MID);
        const ema200 = ema(closes, EMA_SLOW);
        result.dynamicLevels = {
            ema20: ema20[ema20.length - 1] || 0,
            ema50: ema50[ema50.length - 1] || 0,
            ema200: ema200[ema200.length - 1] || 0
        };

        // 10. Metadata
        result.metadata.supplyCount = result.supply.length;
        result.metadata.demandCount = result.demand.length;
        result.metadata.levelCount = result.levels.length;

        return result;
    }

    // ============================================================
    // ПУБЛИЧНЫЙ API
    // ============================================================
    const supportResistanceAnalyzer = {
        analyze: analyzeSupportResistance,
        analyzeSupportResistance: analyzeSupportResistance,
        VERSION: '2.0.0',
        CONFIG: {
            FRACTAL_DEPTH,
            CLUSTER_TOLERANCE_PCT,
            MIN_TOUCHES,
            EMA_FAST, EMA_MID, EMA_SLOW,
            LOOKBACK
        },
        _internal: {
            ema, findFractals, clusterLevels, calcStrength, computePivots, computeFibonacci
        }
    };

    if (typeof global !== 'undefined') global.supportResistanceAnalyzer = supportResistanceAnalyzer;
    if (typeof window !== 'undefined') (window as any).supportResistanceAnalyzer = supportResistanceAnalyzer;
    if (typeof module !== 'undefined' && module.exports) module.exports = supportResistanceAnalyzer;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : globalThis));
