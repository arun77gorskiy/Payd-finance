/**
 * smartMoneyAnalyzer.ts — Module X / Analyzer #3
 *
 * Назначение: Smart Money Concepts (BOS, CHoCH, MSS, Order Blocks,
 *              Breaker Blocks, Mitigation Blocks, FVG, Liquidity Sweeps,
 *              Equal Highs/Lows).
 *
 * Зависимости: marketStructureAnalyzer (опционально для контекста тренда).
 * Используется: liquidityAnalyzer, scenarioGenerator, invalidationBuilder.
 *
 * Публичный API:
 *   - analyzeSmartMoney(candles: Candle[], marketStructure?: MarketStructureResult): SmartMoneyResult
 *
 * Алгоритмы:
 *   1. Swing Points (локальные экстремумы) — lookback окно.
 *   2. BOS / CHoCH / MSS — последовательный анализ свингов и реакций цены.
 *   3. Order Blocks — последняя противоположная свеча перед импульсом, вызвавшим BOS.
 *   4. Breaker Blocks — Order Blocks, пробитые противоположным импульсом.
 *   5. Mitigation Blocks — Order Blocks с частичным заполнением.
 *   6. Fair Value Gaps (FVG) — трёхсвечная модель с разрывом между high[0] и low[2].
 *   7. Liquidity Sweeps — пробой свинга и возврат в течение N свечей.
 *   8. Equal Highs / Lows — свинги в пределах tolerance-коридора.
 */

interface SMACandle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface SMASwing {
    index: number;
    price: number;
    type: 'high' | 'low';
    broken?: boolean;
}

interface SMAMarketStructureResult {
    type: string;
    swings: SMASwing[];
    structureShift: { type: string | null; index: number; price: number };
}

interface SmartMoneyBOS { index: number; type: 'bullish' | 'bearish'; level: number; candleIndex: number; }
interface SmartMoneyCHoCH { index: number; type: 'bullish' | 'bearish'; level: number; candleIndex: number; }
interface SmartMoneyMSS { index: number; type: 'bullish' | 'bearish'; level: number; candleIndex: number; }
interface SmartMoneyOB { index: number; candleIndex: number; type: 'bullish' | 'bearish'; high: number; low: number; mitigated: boolean; mitigatedAt?: number; isBreaker?: boolean; }
interface SmartMoneyFVG { index: number; type: 'bullish' | 'bearish'; high: number; low: number; filled: boolean; filledAt?: number; midpoint: number; size: number; }
interface SmartMoneySweep { index: number; side: 'buy_side' | 'sell_side'; price: number; sweptLevel: number; reversed: boolean; reversalCandle: number; }
interface SmartMoneyEqualHL { price: number; index1: number; index2: number; tolerance: number; }

interface SmartMoneyResult {
    bos: SmartMoneyBOS[];
    choch: SmartMoneyCHoCH[];
    mss: SmartMoneyMSS[];
    orderBlocks: SmartMoneyOB[];
    breakerBlocks: SmartMoneyOB[];
    mitigationBlocks: SmartMoneyOB[];
    fairValueGaps: SmartMoneyFVG[];
    liquiditySweeps: SmartMoneySweep[];
    equalHighs: SmartMoneyEqualHL[];
    equalLows: SmartMoneyEqualHL[];
    internalTrend: 'bullish' | 'bearish' | 'neutral';
    lastStructureEvent: { type: string; side: 'bullish' | 'bearish'; index: number } | null;
    metadata: {
        swingsFound: number;
        bosCount: number;
        chochCount: number;
        fvgCount: number;
        obCount: number;
        sweepCount: number;
        avgFVGSize: number;
    };
}

(function (global: any) {
    'use strict';

    // ============================================================
    // КОНФИГУРАЦИЯ (тюнинг чувствительности алгоритмов)
    // ============================================================
    const SWING_LOOKBACK = 3;                  // Кол-во свечей в каждую сторону для свинга
    const BOS_MIN_BREAK_PCT = 0.0003;          // 0.03% минимальный пробой для BOS
    const FVG_MIN_SIZE_PCT = 0.0003;           // 0.03% минимальный размер FVG
    const EQUAL_HL_TOLERANCE_PCT = 0.0012;     // 0.12% допуск для equal highs/lows
    const SWEEP_REVERSAL_WINDOW = 5;           // Окно (свечей) для разворота после свипа
    const OB_MAX_AGE = 80;                     // Макс. возраст валидного OB
    const SWEEP_MIN_BREAK_PCT = 0.0002;        // 0.02% минимальный пробой для свипа

    // ============================================================
    // УТИЛИТЫ
    // ============================================================
    function isBullish(c: SMACandle): boolean { return c.close > c.open; }
    function isBearish(c: SMACandle): boolean { return c.close < c.open; }
    function bodySize(c: SMACandle): number { return Math.abs(c.close - c.open); }
    function candleRange(c: SMACandle): number { return c.high - c.low; }
    function upperWick(c: SMACandle): number { return c.high - Math.max(c.open, c.close); }
    function lowerWick(c: SMACandle): number { return Math.min(c.open, c.close) - c.low; }
    function pct(a: number, b: number): number { return b === 0 ? 0 : Math.abs(a - b) / b; }

    // ============================================================
    // 1. SWING DETECTION (локальные экстремумы)
    // ============================================================
    function findSwings(candles: SMACandle[], lookback: number = SWING_LOOKBACK): SMASwing[] {
        const swings: SMASwing[] = [];
        if (candles.length < lookback * 2 + 1) return swings;

        for (let i = lookback; i < candles.length - lookback; i++) {
            let isSwingHigh = true;
            let isSwingLow = true;

            for (let j = 1; j <= lookback; j++) {
                if (candles[i].high <= candles[i - j].high || candles[i].high <= candles[i + j].high) {
                    isSwingHigh = false;
                }
                if (candles[i].low >= candles[i - j].low || candles[i].low >= candles[i + j].low) {
                    isSwingLow = false;
                }
            }

            if (isSwingHigh) {
                swings.push({ index: i, price: candles[i].high, type: 'high' });
            }
            if (isSwingLow) {
                swings.push({ index: i, price: candles[i].low, type: 'low' });
            }
        }
        return swings;
    }

    /**
     * Fallback: если findSwings не нашёл свингов (монотонный тренд),
     * генерируем синтетические свинги на основе скользящих экстремумов.
     * Это позволяет BOS/CHoCH-детекции работать на направленных трендах.
     */
    function generateFallbackSwings(candles: SMACandle[], interval: number = 10): SMASwing[] {
        const swings: SMASwing[] = [];
        if (candles.length < interval * 2 + 1) return swings;

        for (let i = interval; i < candles.length - interval; i += interval) {
            let maxHigh = candles[i].high;
            let maxIdx = i;
            let minLow = candles[i].low;
            let minIdx = i;

            for (let j = i - interval; j <= i + interval; j++) {
                if (j < 0 || j >= candles.length) continue;
                if (candles[j].high > maxHigh) {
                    maxHigh = candles[j].high;
                    maxIdx = j;
                }
                if (candles[j].low < minLow) {
                    minLow = candles[j].low;
                    minIdx = j;
                }
            }

            if (maxIdx !== minIdx) {
                swings.push({ index: maxIdx, price: maxHigh, type: 'high' });
                swings.push({ index: minIdx, price: minLow, type: 'low' });
            }
        }

        swings.sort((a, b) => a.index - b.index);
        return swings;
    }

    // ============================================================
    // 2. BOS / CHoCH / MSS DETECTION
    // ============================================================
    function detectStructureEvents(
        candles: SMACandle[],
        swings: SMASwing[]
    ): { bos: SmartMoneyBOS[]; choch: SmartMoneyCHoCH[]; mss: SmartMoneyMSS[]; internalTrend: 'bullish' | 'bearish' | 'neutral'; lastEvent: { type: string; side: 'bullish' | 'bearish'; index: number } | null } {
        const bos: SmartMoneyBOS[] = [];
        const choch: SmartMoneyCHoCH[] = [];
        const mss: SmartMoneyMSS[] = [];

        let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
        let lastHigh: SMASwing | null = null;
        let lastLow: SMASwing | null = null;
        let lastEvent: { type: string; side: 'bullish' | 'bearish'; index: number } | null = null;

        for (const swing of swings) {
            if (swing.type === 'high') {
                // Проверка пробоя предыдущего swing high
                if (lastHigh !== null && swing.price > lastHigh.price) {
                    const breakPct = (swing.price - lastHigh.price) / lastHigh.price;
                    if (breakPct >= BOS_MIN_BREAK_PCT) {
                        if (trend === 'bearish' || trend === 'neutral') {
                            // CHoCH (Change of Character)
                            choch.push({
                                index: swings.indexOf(swing),
                                type: 'bullish',
                                level: swing.price,
                                candleIndex: swing.index
                            });
                            // MSS — смена тренда с медвежьего на бычий
                            if (trend === 'bearish') {
                                mss.push({
                                    index: swings.indexOf(swing),
                                    type: 'bullish',
                                    level: swing.price,
                                    candleIndex: swing.index
                                });
                            }
                            trend = 'bullish';
                            lastEvent = { type: 'CHoCH', side: 'bullish', index: swing.index };
                        } else if (trend === 'bullish') {
                            // BOS в направлении тренда
                            bos.push({
                                index: swings.indexOf(swing),
                                type: 'bullish',
                                level: swing.price,
                                candleIndex: swing.index
                            });
                            lastEvent = { type: 'BOS', side: 'bullish', index: swing.index };
                        }
                    }
                }
                lastHigh = swing;
            } else if (swing.type === 'low') {
                // Проверка пробоя предыдущего swing low
                if (lastLow !== null && swing.price < lastLow.price) {
                    const breakPct = (lastLow.price - swing.price) / lastLow.price;
                    if (breakPct >= BOS_MIN_BREAK_PCT) {
                        if (trend === 'bullish' || trend === 'neutral') {
                            choch.push({
                                index: swings.indexOf(swing),
                                type: 'bearish',
                                level: swing.price,
                                candleIndex: swing.index
                            });
                            if (trend === 'bullish') {
                                mss.push({
                                    index: swings.indexOf(swing),
                                    type: 'bearish',
                                    level: swing.price,
                                    candleIndex: swing.index
                                });
                            }
                            trend = 'bearish';
                            lastEvent = { type: 'CHoCH', side: 'bearish', index: swing.index };
                        } else if (trend === 'bearish') {
                            bos.push({
                                index: swings.indexOf(swing),
                                type: 'bearish',
                                level: swing.price,
                                candleIndex: swing.index
                            });
                            lastEvent = { type: 'BOS', side: 'bearish', index: swing.index };
                        }
                    }
                }
                lastLow = swing;
            }
        }

        return { bos, choch, mss, internalTrend: trend, lastEvent };
    }

    // ============================================================
    // 3. ORDER BLOCKS (последняя противоположная свеча перед импульсом BOS)
    // ============================================================
    function detectOrderBlocks(
        candles: SMACandle[],
        bos: SmartMoneyBOS[]
    ): SmartMoneyOB[] {
        const orderBlocks: SmartMoneyOB[] = [];

        for (const b of bos) {
            // Ищем последнюю противоположную свечу перед пробоем
            const bosCandleIdx = b.candleIndex;
            const targetType = b.type === 'bullish' ? 'bearish' : 'bullish';

            // Идём назад до 5 свечей, ищем противоположную
            for (let i = bosCandleIdx - 1; i >= Math.max(0, bosCandleIdx - 5); i--) {
                const candle = candles[i];
                const isTarget = (targetType === 'bullish' && isBullish(candle)) ||
                                 (targetType === 'bearish' && isBearish(candle));

                if (isTarget) {
                    orderBlocks.push({
                        index: orderBlocks.length,
                        candleIndex: i,
                        type: b.type,
                        high: candle.high,
                        low: candle.low,
                        mitigated: false
                    });
                    break;
                }
            }
        }
        return orderBlocks;
    }

    // ============================================================
    // 4. MITIGATION & BREAKER BLOCKS
    // ============================================================
    function checkMitigationAndBreakers(
        candles: SMACandle[],
        orderBlocks: SmartMoneyOB[]
    ): { mitigationBlocks: SmartMoneyOB[]; breakerBlocks: SmartMoneyOB[] } {
        const mitigationBlocks: SmartMoneyOB[] = [];
        const breakerBlocks: SmartMoneyOB[] = [];

        for (const ob of orderBlocks) {
            let touched = false;
            let broken = false;
            let touchIndex = -1;
            let breakIndex = -1;

            for (let i = ob.candleIndex + 1; i < candles.length; i++) {
                const c = candles[i];

                if (ob.type === 'bullish') {
                    // Бычий OB: ждём возврата к зоне (между low и high OB)
                    if (c.low <= ob.high && c.low >= ob.low) {
                        touched = true;
                        if (touchIndex === -1) touchIndex = i;
                    }
                    // Пробой OB вниз (становится breaker)
                    if (c.close < ob.low) {
                        broken = true;
                        breakIndex = i;
                        break;
                    }
                } else {
                    // Медвежий OB: ждём возврата к зоне
                    if (c.high >= ob.low && c.high <= ob.high) {
                        touched = true;
                        if (touchIndex === -1) touchIndex = i;
                    }
                    // Пробой OB вверх
                    if (c.close > ob.high) {
                        broken = true;
                        breakIndex = i;
                        break;
                    }
                }
            }

            if (broken && breakIndex !== -1) {
                // Breaker Block — пробитый OB становится противоположной зоной
                breakerBlocks.push({
                    ...ob,
                    index: breakerBlocks.length,
                    isBreaker: true,
                    mitigated: true,
                    mitigatedAt: breakIndex
                });
            } else if (touched && touchIndex !== -1) {
                // Mitigation Block — частично или полностью заполненный OB
                mitigationBlocks.push({
                    ...ob,
                    index: mitigationBlocks.length,
                    mitigated: true,
                    mitigatedAt: touchIndex
                });
            }
        }

        return { mitigationBlocks, breakerBlocks };
    }

    // ============================================================
    // 5. FAIR VALUE GAPS (FVG) — трёхсвечная модель
    // ============================================================
    function detectFairValueGaps(candles: SMACandle[]): SmartMoneyFVG[] {
        const fvgs: SmartMoneyFVG[] = [];

        for (let i = 2; i < candles.length; i++) {
            const c1 = candles[i - 2];
            const c2 = candles[i - 1]; // impulse candle
            const c3 = candles[i];

            const refPrice = c1.close;
            const minSize = refPrice * FVG_MIN_SIZE_PCT;

            // Bullish FVG: high of c1 < low of c3 (gap up)
            if (isBullish(c2) && c3.low > c1.high) {
                const gapSize = c3.low - c1.high;
                if (gapSize >= minSize) {
                    fvgs.push({
                        index: fvgs.length,
                        type: 'bullish',
                        high: c3.low,
                        low: c1.high,
                        filled: false,
                        midpoint: (c3.low + c1.high) / 2,
                        size: gapSize
                    });
                }
            }

            // Bearish FVG: low of c1 > high of c3 (gap down)
            if (isBearish(c2) && c3.high < c1.low) {
                const gapSize = c1.low - c3.high;
                if (gapSize >= minSize) {
                    fvgs.push({
                        index: fvgs.length,
                        type: 'bearish',
                        high: c1.low,
                        low: c3.high,
                        filled: false,
                        midpoint: (c1.low + c3.high) / 2,
                        size: gapSize
                    });
                }
            }
        }

        // Проверяем заполнение (mitigation) FVG-ов
        for (const fvg of fvgs) {
            for (let i = fvgs.indexOf(fvg) + 1; i < fvgs.length; i++) {
                // Простая эвристика: FVG считается filled если последующие свечи пересекли зону
                const idx = i;
                if (idx < candles.length) {
                    if (fvg.type === 'bullish' && candles[idx].low <= fvg.midpoint) {
                        fvg.filled = true;
                        fvg.filledAt = idx;
                        break;
                    } else if (fvg.type === 'bearish' && candles[idx].high >= fvg.midpoint) {
                        fvg.filled = true;
                        fvg.filledAt = idx;
                        break;
                    }
                }
            }
        }

        return fvgs;
    }

    // ============================================================
    // 6. LIQUIDITY SWEEPS (пробой свинга с быстрым возвратом)
    // ============================================================
    function detectLiquiditySweeps(
        candles: SMACandle[],
        swings: SMASwing[]
    ): SmartMoneySweep[] {
        const sweeps: SmartMoneySweep[] = [];
        const highSwings = swings.filter(s => s.type === 'high');
        const lowSwings = swings.filter(s => s.type === 'low');

        for (let i = 2; i < candles.length - 1; i++) {
            const c = candles[i];
            const refPrice = c.close;

            // Sweep buy-side (пробой swing high с возвратом)
            for (const swing of highSwings) {
                if (swing.index >= i) continue;
                const dist = Math.abs(swing.index - i);
                if (dist > SWEEP_REVERSAL_WINDOW * 3) continue;

                if (c.high > swing.price && pct(c.high, swing.price) <= SWEEP_MIN_BREAK_PCT * 5) {
                    // Проверяем возврат в следующих N свечей
                    for (let j = i + 1; j < Math.min(candles.length, i + SWEEP_REVERSAL_WINDOW); j++) {
                        if (candles[j].close < swing.price) {
                            sweeps.push({
                                index: sweeps.length,
                                side: 'buy_side',
                                price: c.high,
                                sweptLevel: swing.price,
                                reversed: true,
                                reversalCandle: j
                            });
                            break;
                        }
                    }
                }
            }

            // Sweep sell-side (пробой swing low с возвратом)
            for (const swing of lowSwings) {
                if (swing.index >= i) continue;
                const dist = Math.abs(swing.index - i);
                if (dist > SWEEP_REVERSAL_WINDOW * 3) continue;

                if (c.low < swing.price && pct(c.low, swing.price) <= SWEEP_MIN_BREAK_PCT * 5) {
                    for (let j = i + 1; j < Math.min(candles.length, i + SWEEP_REVERSAL_WINDOW); j++) {
                        if (candles[j].close > swing.price) {
                            sweeps.push({
                                index: sweeps.length,
                                side: 'sell_side',
                                price: c.low,
                                sweptLevel: swing.price,
                                reversed: true,
                                reversalCandle: j
                            });
                            break;
                        }
                    }
                }
            }
        }

        return sweeps;
    }

    // ============================================================
    // 7. EQUAL HIGHS / LOWS (зоны ликвидности)
    // ============================================================
    function detectEqualHighsLows(swings: SMASwing[]): { equalHighs: SmartMoneyEqualHL[]; equalLows: SmartMoneyEqualHL[] } {
        const equalHighs: SmartMoneyEqualHL[] = [];
        const equalLows: SmartMoneyEqualHL[] = [];
        const highs = swings.filter(s => s.type === 'high');
        const lows = swings.filter(s => s.type === 'low');

        for (let i = 0; i < highs.length; i++) {
            for (let j = i + 1; j < highs.length; j++) {
                const tolerance = (highs[i].price + highs[j].price) / 2 * EQUAL_HL_TOLERANCE_PCT;
                if (Math.abs(highs[i].price - highs[j].price) <= tolerance) {
                    equalHighs.push({
                        price: (highs[i].price + highs[j].price) / 2,
                        index1: highs[i].index,
                        index2: highs[j].index,
                        tolerance
                    });
                }
            }
        }

        for (let i = 0; i < lows.length; i++) {
            for (let j = i + 1; j < lows.length; j++) {
                const tolerance = (lows[i].price + lows[j].price) / 2 * EQUAL_HL_TOLERANCE_PCT;
                if (Math.abs(lows[i].price - lows[j].price) <= tolerance) {
                    equalLows.push({
                        price: (lows[i].price + lows[j].price) / 2,
                        index1: lows[i].index,
                        index2: lows[j].index,
                        tolerance
                    });
                }
            }
        }

        return { equalHighs, equalLows };
    }

    // ============================================================
    // ГЛАВНАЯ ФУНКЦИЯ АНАЛИЗА
    // ============================================================
    function analyzeSmartMoney(candles: SMACandle[], marketStructure?: SMAMarketStructureResult): SmartMoneyResult {
        const result: SmartMoneyResult = {
            bos: [],
            choch: [],
            mss: [],
            orderBlocks: [],
            breakerBlocks: [],
            mitigationBlocks: [],
            fairValueGaps: [],
            liquiditySweeps: [],
            equalHighs: [],
            equalLows: [],
            internalTrend: 'neutral',
            lastStructureEvent: null,
            metadata: {
                swingsFound: 0,
                bosCount: 0,
                chochCount: 0,
                fvgCount: 0,
                obCount: 0,
                sweepCount: 0,
                avgFVGSize: 0
            }
        };

        if (!candles || candles.length < 10) return result;

        // 1. Определяем свинги (используем свои или из marketStructure)
        let swings: SMASwing[] = (marketStructure && marketStructure.swings && marketStructure.swings.length > 0)
            ? marketStructure.swings
            : findSwings(candles);

        // Fallback для монотонных трендов: если findSwings не нашёл ничего,
        // генерируем синтетические свинги, чтобы BOS/CHoCH/Sweeps работали.
        if (swings.length === 0 && candles.length >= 20) {
            swings = generateFallbackSwings(candles);
        }

        result.metadata.swingsFound = swings.length;

        // 2. BOS / CHoCH / MSS
        const structure = detectStructureEvents(candles, swings);
        result.bos = structure.bos;
        result.choch = structure.choch;
        result.mss = structure.mss;
        result.internalTrend = structure.internalTrend;
        result.lastStructureEvent = structure.lastEvent;
        result.metadata.bosCount = structure.bos.length;
        result.metadata.chochCount = structure.choch.length;

        // 3. Order Blocks на основе BOS
        const obs = detectOrderBlocks(candles, result.bos);
        result.orderBlocks = obs;
        result.metadata.obCount = obs.length;

        // 4. Mitigation & Breaker Blocks
        const { mitigationBlocks, breakerBlocks } = checkMitigationAndBreakers(candles, obs);
        result.mitigationBlocks = mitigationBlocks;
        result.breakerBlocks = breakerBlocks;

        // 5. Fair Value Gaps
        result.fairValueGaps = detectFairValueGaps(candles);
        result.metadata.fvgCount = result.fairValueGaps.length;
        if (result.fairValueGaps.length > 0) {
            const totalSize = result.fairValueGaps.reduce((sum, f) => sum + f.size, 0);
            result.metadata.avgFVGSize = totalSize / result.fairValueGaps.length;
        }

        // 6. Liquidity Sweeps
        result.liquiditySweeps = detectLiquiditySweeps(candles, swings);
        result.metadata.sweepCount = result.liquiditySweeps.length;

        // 7. Equal Highs / Lows
        const eq = detectEqualHighsLows(swings);
        result.equalHighs = eq.equalHighs;
        result.equalLows = eq.equalLows;

        return result;
    }

    // ============================================================
    // ПУБЛИЧНЫЙ API
    // ============================================================
    const smartMoneyAnalyzer = {
        analyze: analyzeSmartMoney,
        analyzeSmartMoney: analyzeSmartMoney,
        VERSION: '2.0.0',
        CONFIG: {
            SWING_LOOKBACK,
            BOS_MIN_BREAK_PCT,
            FVG_MIN_SIZE_PCT,
            EQUAL_HL_TOLERANCE_PCT,
            SWEEP_REVERSAL_WINDOW,
            OB_MAX_AGE,
            SWEEP_MIN_BREAK_PCT
        },
        // Экспорт внутренних функций для тестирования
        _internal: {
            findSwings,
            detectStructureEvents,
            detectOrderBlocks,
            checkMitigationAndBreakers,
            detectFairValueGaps,
            detectLiquiditySweeps,
            detectEqualHighsLows
        }
    };

    if (typeof global !== 'undefined') global.smartMoneyAnalyzer = smartMoneyAnalyzer;
    if (typeof window !== 'undefined') (window as any).smartMoneyAnalyzer = smartMoneyAnalyzer;
    if (typeof module !== 'undefined' && module.exports) module.exports = smartMoneyAnalyzer;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : globalThis));
