/**
 * liquidityAnalyzer.ts — Module X / Analyzer #6
 *
 * Назначение: анализ ликвидности — Stop Hunt, Liquidity Grab, Liquidity Void,
 *              Buy-side / Sell-side Liquidity, Resting Liquidity.
 *
 * Зависимости: smartMoneyAnalyzer (опционально для sweep/equal HL сигналов).
 * Используется: confluenceEngine, scenarioGenerator, riskAssessor.
 *
 * Публичный API:
 *   - analyzeLiquidity(candles: Candle[], smartMoney?: SmartMoneyResult): LiquidityResult
 *
 * Алгоритмы:
 *   1. Swing-based Liquidity Levels — кластеры свингов формируют зоны ликвидности.
 *   2. Equal Highs/Lows — повторяющиеся экстремумы (зоны скопления стопов).
 *   3. Stop Hunt — быстрый пробой swing с возвратом.
 *   4. Liquidity Grab — wick за уровень + close обратно (rejection).
 *   5. Liquidity Void — большие импульсные свечи (FVG-подобные разрывы).
 *   6. Buy-side Liquidity — стопы над swing highs (для продавцов).
 *   7. Sell-side Liquidity — стопы под swing lows (для покупателей).
 */

interface LACandle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface LASwing { index: number; price: number; type: 'high' | 'low'; }
interface LASmartMoney {
    liquiditySweeps: Array<{ index: number; side: 'buy_side' | 'sell_side'; price: number; sweptLevel: number }>;
    equalHighs: Array<{ price: number; index1: number; index2: number }>;
    equalLows: Array<{ price: number; index1: number; index2: number }>;
    swings?: LASwing[];
}

interface LALiquidityEvent { index: number; price: number; type: 'stop_hunt' | 'liquidity_grab' | 'liquidity_void'; level?: number; strength: number; description?: string; }
interface LALiquidityVoid { fromIndex: number; toIndex: number; low: number; high: number; gapSize: number; direction: 'bullish' | 'bearish'; }
interface LALiquidityLevel { price: number; type: 'buy_side' | 'sell_side'; strength: number; touches: number; swept: boolean; }

interface LiquidityResult {
    stopHunts: LALiquidityEvent[];
    liquidityGrabs: LALiquidityEvent[];
    liquidityVoids: LALiquidityVoid[];
    buySideLiquidity: LALiquidityLevel[];     // Стопы над swing highs
    sellSideLiquidity: LALiquidityLevel[];    // Стопы под swing lows
    restingLiquidity: LALiquidityLevel[];     // Все нетронутые уровни
    liquidityMap: {
        nearestBuySide: number | null;
        nearestSellSide: number | null;
        totalBuySideLevels: number;
        totalSellSideLevels: number;
        sweptBuySide: number;
        sweptSellSide: number;
    };
    bias: 'bullish' | 'bearish' | 'neutral';
    metadata: {
        swingCount: number;
        equalHLCount: number;
        sweepCount: number;
        grabCount: number;
        voidCount: number;
    };
}

(function (global: any) {
    'use strict';

    // ============================================================
    // КОНФИГУРАЦИЯ
    // ============================================================
    const SWING_LOOKBACK = 3;
    const STOP_HUNT_REVERSAL_WINDOW = 4;
    const GRAB_WICK_RATIO = 0.5;        // wick должен быть ≥ 50% диапазона
    const VOID_MIN_SIZE_PCT = 0.01;     // 1% gap
    const LEVEL_TOLERANCE_PCT = 0.005;  // 0.5% — для кластеризации свингов

    // ============================================================
    // УТИЛИТЫ
    // ============================================================
    function findSwings(candles: LACandle[], lookback: number = SWING_LOOKBACK): LASwing[] {
        const swings: LASwing[] = [];
        if (candles.length < lookback * 2 + 1) return swings;
        for (let i = lookback; i < candles.length - lookback; i++) {
            let isH = true, isL = true;
            for (let j = 1; j <= lookback; j++) {
                if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) isH = false;
                if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) isL = false;
            }
            if (isH) swings.push({ index: i, price: candles[i].high, type: 'high' });
            if (isL) swings.push({ index: i, price: candles[i].low, type: 'low' });
        }
        return swings;
    }

    // ============================================================
    // 1. КЛАСТЕРИЗАЦИЯ СВИНГОВ → УРОВНИ ЛИКВИДНОСТИ
    // ============================================================
    function clusterSwings(swings: LASwing[], candles: LACandle[]): LALiquidityLevel[] {
        const levels: LALiquidityLevel[] = [];
        const groups: Map<string, LASwing[]> = new Map();

        for (const sw of swings) {
            // Ключ по типу + округлённой цене
            const key = sw.type + ':' + Math.round(sw.price / candles[0].close * 200) / 200;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key)!.push(sw);
        }

        for (const [key, group] of groups) {
            if (group.length === 0) continue;
            const avgPrice = group.reduce((s, sw) => s + sw.price, 0) / group.length;
            const type: 'buy_side' | 'sell_side' = key.startsWith('high') ? 'buy_side' : 'sell_side';
            // Strength: кол-во касаний × близость к текущей цене
            const curPrice = candles[candles.length - 1].close;
            const proximity = Math.max(0.3, 1 - Math.abs(avgPrice - curPrice) / curPrice);
            const strength = Math.min(1, group.length / 5) * proximity;

            // Проверяем, swept ли уровень
            let swept = false;
            const lastIdx = candles.length - 1;
            for (let i = group[group.length - 1].index + 1; i <= lastIdx; i++) {
                if (type === 'buy_side' && candles[i].high > avgPrice * (1 + LEVEL_TOLERANCE_PCT / 2)) {
                    // Считаем swept, если после пробоя цена вернулась
                    let returned = false;
                    for (let j = i + 1; j <= lastIdx; j++) {
                        if (candles[j].close < avgPrice) { returned = true; break; }
                    }
                    if (returned) { swept = true; break; }
                } else if (type === 'sell_side' && candles[i].low < avgPrice * (1 - LEVEL_TOLERANCE_PCT / 2)) {
                    let returned = false;
                    for (let j = i + 1; j <= lastIdx; j++) {
                        if (candles[j].close > avgPrice) { returned = true; break; }
                    }
                    if (returned) { swept = true; break; }
                }
            }

            levels.push({
                price: avgPrice,
                type,
                strength,
                touches: group.length,
                swept
            });
        }
        return levels.sort((a, b) => b.strength - a.strength);
    }

    // ============================================================
    // 2. STOP HUNT (быстрый пробой + возврат)
    // ============================================================
    function detectStopHunts(candles: LACandle[], swings: LASwing[]): LALiquidityEvent[] {
        const events: LALiquidityEvent[] = [];
        for (let i = 2; i < candles.length; i++) {
            const c = candles[i];
            const curPrice = c.close;

            // Ищем ближайший swing high перед i
            for (const sw of swings) {
                if (sw.index >= i || sw.type !== 'high') continue;
                if (i - sw.index > 20) continue;
                if (c.high > sw.price && curPrice < sw.price) {
                    // Пробой + закрытие ниже → stop hunt
                    let reversed = false;
                    for (let j = i + 1; j < Math.min(candles.length, i + STOP_HUNT_REVERSAL_WINDOW); j++) {
                        if (candles[j].close < sw.price) { reversed = true; break; }
                    }
                    if (reversed) {
                        const strength = Math.min(1, (c.high - sw.price) / sw.price * 50);
                        events.push({
                            index: i,
                            price: c.high,
                            type: 'stop_hunt',
                            level: sw.price,
                            strength,
                            description: `Stop hunt above ${sw.price.toFixed(2)}`
                        });
                        break;
                    }
                }
            }

            // Sell-side stop hunt
            for (const sw of swings) {
                if (sw.index >= i || sw.type !== 'low') continue;
                if (i - sw.index > 20) continue;
                if (c.low < sw.price && curPrice > sw.price) {
                    let reversed = false;
                    for (let j = i + 1; j < Math.min(candles.length, i + STOP_HUNT_REVERSAL_WINDOW); j++) {
                        if (candles[j].close > sw.price) { reversed = true; break; }
                    }
                    if (reversed) {
                        const strength = Math.min(1, (sw.price - c.low) / sw.price * 50);
                        events.push({
                            index: i,
                            price: c.low,
                            type: 'stop_hunt',
                            level: sw.price,
                            strength,
                            description: `Stop hunt below ${sw.price.toFixed(2)}`
                        });
                        break;
                    }
                }
            }
        }
        return events;
    }

    // ============================================================
    // 3. LIQUIDITY GRAB (wick за уровень + close обратно)
    // ============================================================
    function detectLiquidityGrabs(candles: LACandle[], swings: LASwing[]): LALiquidityEvent[] {
        const events: LALiquidityEvent[] = [];
        for (let i = 1; i < candles.length; i++) {
            const c = candles[i];
            const range = c.high - c.low;
            if (range === 0) continue;

            // Buy-side grab: high за уровень, close ниже уровня
            for (const sw of swings) {
                if (sw.index >= i || sw.type !== 'high') continue;
                if (i - sw.index > 15) continue;
                const upperWick = c.high - Math.max(c.open, c.close);
                if (c.high > sw.price && c.close < sw.price && upperWick / range >= GRAB_WICK_RATIO) {
                    const strength = upperWick / range;
                    events.push({
                        index: i,
                        price: c.high,
                        type: 'liquidity_grab',
                        level: sw.price,
                        strength,
                        description: `Buy-side grab at ${sw.price.toFixed(2)}`
                    });
                    break;
                }
            }

            // Sell-side grab: low за уровень, close выше уровня
            for (const sw of swings) {
                if (sw.index >= i || sw.type !== 'low') continue;
                if (i - sw.index > 15) continue;
                const lowerWick = Math.min(c.open, c.close) - c.low;
                if (c.low < sw.price && c.close > sw.price && lowerWick / range >= GRAB_WICK_RATIO) {
                    const strength = lowerWick / range;
                    events.push({
                        index: i,
                        price: c.low,
                        type: 'liquidity_grab',
                        level: sw.price,
                        strength,
                        description: `Sell-side grab at ${sw.price.toFixed(2)}`
                    });
                    break;
                }
            }
        }
        return events;
    }

    // ============================================================
    // 4. LIQUIDITY VOIDS (импульсные разрывы)
    // ============================================================
    function detectLiquidityVoids(candles: LACandle[]): LALiquidityVoid[] {
        const voids: LALiquidityVoid[] = [];
        const refPrice = candles[candles.length - 1].close;
        const minSize = refPrice * VOID_MIN_SIZE_PCT;

        for (let i = 2; i < candles.length; i++) {
            const c1 = candles[i - 2];
            const c2 = candles[i - 1]; // impulse candle
            const c3 = candles[i];

            // Bullish void: low of c3 > high of c1, при этом c2 — большая бычья
            if (c3.low > c1.high && (c2.close - c2.open) > 0 && (c2.close - c2.open) > (c2.high - c2.low) * 0.5) {
                const gapSize = c3.low - c1.high;
                if (gapSize >= minSize) {
                    voids.push({
                        fromIndex: i - 2,
                        toIndex: i,
                        low: c1.high,
                        high: c3.low,
                        gapSize,
                        direction: 'bullish'
                    });
                }
            }

            // Bearish void
            if (c3.high < c1.low && (c2.open - c2.close) > 0 && (c2.open - c2.close) > (c2.high - c2.low) * 0.5) {
                const gapSize = c1.low - c3.high;
                if (gapSize >= minSize) {
                    voids.push({
                        fromIndex: i - 2,
                        toIndex: i,
                        low: c3.high,
                        high: c1.low,
                        gapSize,
                        direction: 'bearish'
                    });
                }
            }
        }
        return voids;
    }

    // ============================================================
    // ГЛАВНАЯ ФУНКЦИЯ
    // ============================================================
    function analyzeLiquidity(candles: LACandle[], smartMoney?: LASmartMoney): LiquidityResult {
        const result: LiquidityResult = {
            stopHunts: [],
            liquidityGrabs: [],
            liquidityVoids: [],
            buySideLiquidity: [],
            sellSideLiquidity: [],
            restingLiquidity: [],
            liquidityMap: {
                nearestBuySide: null,
                nearestSellSide: null,
                totalBuySideLevels: 0,
                totalSellSideLevels: 0,
                sweptBuySide: 0,
                sweptSellSide: 0
            },
            bias: 'neutral',
            metadata: { swingCount: 0, equalHLCount: 0, sweepCount: 0, grabCount: 0, voidCount: 0 }
        };

        if (!candles || candles.length < 10) return result;

        // 1. Свинги
        const swings: LASwing[] = (smartMoney && smartMoney.swings && smartMoney.swings.length > 0)
            ? smartMoney.swings
            : findSwings(candles);
        result.metadata.swingCount = swings.length;

        // 2. Equal HL — из smartMoney (если есть) или считаем сами
        let equalHLCount = 0;
        if (smartMoney) {
            equalHLCount = (smartMoney.equalHighs?.length || 0) + (smartMoney.equalLows?.length || 0);
        }
        result.metadata.equalHLCount = equalHLCount;

        // 3. Кластеры уровней
        const allLevels = clusterSwings(swings, candles);
        result.restingLiquidity = allLevels.filter(l => !l.swept);
        result.buySideLiquidity = allLevels.filter(l => l.type === 'buy_side');
        result.sellSideLiquidity = allLevels.filter(l => l.type === 'sell_side');
        result.liquidityMap.totalBuySideLevels = result.buySideLiquidity.length;
        result.liquidityMap.totalSellSideLevels = result.sellSideLiquidity.length;
        result.liquidityMap.sweptBuySide = result.buySideLiquidity.filter(l => l.swept).length;
        result.liquidityMap.sweptSellSide = result.sellSideLiquidity.filter(l => l.swept).length;

        // Ближайшие уровни по обе стороны
        const curPrice = candles[candles.length - 1].close;
        const buyAbove = result.buySideLiquidity.filter(l => l.price > curPrice).sort((a, b) => a.price - b.price);
        const sellBelow = result.sellSideLiquidity.filter(l => l.price < curPrice).sort((a, b) => b.price - a.price);
        result.liquidityMap.nearestBuySide = buyAbove.length > 0 ? buyAbove[0].price : null;
        result.liquidityMap.nearestSellSide = sellBelow.length > 0 ? sellBelow[0].price : null;

        // 4. Stop Hunts
        result.stopHunts = detectStopHunts(candles, swings);
        result.metadata.sweepCount = result.stopHunts.length;

        // 5. Liquidity Grabs
        result.liquidityGrabs = detectLiquidityGrabs(candles, swings);
        result.metadata.grabCount = result.liquidityGrabs.length;

        // 6. Liquidity Voids
        result.liquidityVoids = detectLiquidityVoids(candles);
        result.metadata.voidCount = result.liquidityVoids.length;

        // Дополняем sweep-сигналами из smartMoney (если переданы)
        if (smartMoney && smartMoney.liquiditySweeps) {
            for (const sw of smartMoney.liquiditySweeps) {
                result.stopHunts.push({
                    index: sw.index,
                    price: sw.price,
                    type: 'stop_hunt',
                    level: sw.sweptLevel,
                    strength: 0.7,
                    description: `Sweep from SmartMoney: ${sw.side} @ ${sw.sweptLevel.toFixed(2)}`
                });
            }
            result.metadata.sweepCount = result.stopHunts.length;
        }

        // 7. Bias — на основе net swept levels и voids
        let bullScore = 0, bearScore = 0;
        // Свеп buy-side (сверху) → медвежий bias (продавцы забирают стопы)
        // Свеп sell-side (снизу) → бычий bias (покупатели забирают стопы)
        const recentHunts = result.stopHunts.slice(-10);
        for (const h of recentHunts) {
            if (h.description?.includes('Buy-side') || h.description?.includes('above')) bearScore++;
            else if (h.description?.includes('Sell-side') || h.description?.includes('below')) bullScore++;
        }
        for (const v of result.liquidityVoids.slice(-5)) {
            if (v.direction === 'bullish') bullScore++; else bearScore++;
        }
        if (bullScore > bearScore + 1) result.bias = 'bullish';
        else if (bearScore > bullScore + 1) result.bias = 'bearish';
        else result.bias = 'neutral';

        return result;
    }

    // ============================================================
    // ПУБЛИЧНЫЙ API
    // ============================================================
    const liquidityAnalyzer = {
        analyze: analyzeLiquidity,
        analyzeLiquidity: analyzeLiquidity,
        VERSION: '2.0.0',
        CONFIG: {
            SWING_LOOKBACK,
            STOP_HUNT_REVERSAL_WINDOW,
            GRAB_WICK_RATIO,
            VOID_MIN_SIZE_PCT,
            LEVEL_TOLERANCE_PCT
        },
        _internal: {
            findSwings, clusterSwings, detectStopHunts, detectLiquidityGrabs, detectLiquidityVoids
        }
    };

    if (typeof global !== 'undefined') global.liquidityAnalyzer = liquidityAnalyzer;
    if (typeof window !== 'undefined') (window as any).liquidityAnalyzer = liquidityAnalyzer;
    if (typeof module !== 'undefined' && module.exports) module.exports = liquidityAnalyzer;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : globalThis));
