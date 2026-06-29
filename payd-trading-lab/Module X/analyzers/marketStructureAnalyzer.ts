/**
 * marketStructureAnalyzer.ts — Module X / Analyzer #1 (полная реализация)
 *
 * Определяет:
 *   HH (Higher High), HL (Higher Low), LH (Lower High), LL (Lower Low)
 *   Uptrend, Downtrend, Range, Consolidation, Expansion, Compression
 *   Structure Break (BOS, CHoCH)
 *   Trend Continuation, Trend Reversal
 *
 * Алгоритмы:
 *   1) Swing detection: для каждой свечи проверяем, является ли её high
 *      строгим локальным максимумом и low — строгим локальным минимумом
 *      в окне window=3. Последние window свечей не считаются свингами.
 *   2) Классификация свингов: каждый swing сравнивается с предыдущим
 *      swing того же типа → HH/HL/LH/LL.
 *   3) Определение тренда по последним 4 свингам:
 *        uptrend: ≥2 HH и ≥2 HL
 *        downtrend: ≥2 LH и ≥2 LL
 *        иначе: range/consolidation/compression по ATR.
 *   4) Structure Break: пробой последнего HL/LH → CHoCH.
 *      Пробой предыдущего свинга в направлении тренда → BOS.
 *
 * Зависимости: НЕТ.
 */

interface MSACandle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface MSASwing {
    index: number;
    type: 'high' | 'low';
    price: number;
    time: number;
    klass?: 'HH' | 'HL' | 'LH' | 'LL';
}

interface MSAstructureShift {
    type: 'BOS' | 'CHoCH' | 'MSS' | null;
    index: number;
    price: number;
    direction: 'bullish' | 'bearish' | null;
}

interface MarketStructureResult {
    type: 'uptrend' | 'downtrend' | 'range' | 'consolidation' | 'expansion' | 'compression';
    swings: MSASwing[];
    higherHighs: MSASwing[];
    higherLows: MSASwing[];
    lowerHighs: MSASwing[];
    lowerLows: MSASwing[];
    structureShift: MSAstructureShift;
    trendContinuation: boolean;
    trendReversal: boolean;
    lastSwingHigh: MSASwing | null;
    lastSwingLow: MSASwing | null;
    summary: string;
}

(function (global: any) {
    'use strict';

    // ---------- helpers ----------
    function mean(values: number[]): number {
        if (values.length === 0) return 0;
        let s = 0;
        for (let i = 0; i < values.length; i++) s += values[i];
        return s / values.length;
    }

    function trueRange(c: MSACandle, prev: MSACandle | null): number {
        if (!prev) return c.high - c.low;
        return Math.max(
            c.high - c.low,
            Math.abs(c.high - prev.close),
            Math.abs(c.low - prev.close)
        );
    }

    function atr(candles: MSACandle[], period: number): number {
        if (candles.length < period + 1) return 0;
        const trs: number[] = [];
        for (let i = candles.length - period; i < candles.length; i++) {
            trs.push(trueRange(candles[i], candles[i - 1]));
        }
        return mean(trs);
    }

    // ---------- 1) swing detection ----------
    function findSwings(candles: MSACandle[], window: number): MSASwing[] {
        const swings: MSASwing[] = [];
        const n = candles.length;
        if (n < window * 2 + 1) return swings;

        for (let i = window; i < n - window; i++) {
            let isHigh = true;
            let isLow = true;

            for (let j = 1; j <= window; j++) {
                if (candles[i].high <= candles[i - j].high) isHigh = false;
                if (candles[i].high <= candles[i + j].high) isHigh = false;
                if (candles[i].low >= candles[i - j].low) isLow = false;
                if (candles[i].low >= candles[i + j].low) isLow = false;
                if (!isHigh && !isLow) break;
            }

            if (isHigh) {
                swings.push({
                    index: i,
                    type: 'high',
                    price: candles[i].high,
                    time: candles[i].time
                });
            }
            if (isLow) {
                swings.push({
                    index: i,
                    type: 'low',
                    price: candles[i].low,
                    time: candles[i].time
                });
            }
        }

        swings.sort((a, b) => a.index - b.index);
        return swings;
    }

    // ---------- 2) classify swings ----------
    function classifySwings(swings: MSASwing[]): void {
        let lastHigh: MSASwing | null = null;
        let lastLow: MSASwing | null = null;

        for (const sw of swings) {
            if (sw.type === 'high') {
                if (lastHigh) {
                    sw.klass = sw.price > lastHigh.price ? 'HH' : 'LH';
                }
                lastHigh = sw;
            } else {
                if (lastLow) {
                    sw.klass = sw.price > lastLow.price ? 'HL' : 'LL';
                }
                lastLow = sw;
            }
        }
    }

    // ---------- 3) trend type ----------
    // Комбинированная логика: HH/HL/LH/LL + прямой анализ цен + ATR-нормализация
    // + линейная регрессия (наклон)
    function detectTrendType(
        swings: MSASwing[],
        currentAtr: number,
        avgAtr: number,
        candles: MSACandle[]
    ): MarketStructureResult['type'] {

        // 1) Пробуем определить по свингам (классический ICT/SMC подход)
        const lastFour: MSASwing[] = swings.slice(-4);
        if (lastFour.length >= 4) {
            const klassList = lastFour.map(s => s.klass).filter(Boolean) as string[];

            const hhCount = klassList.filter(k => k === 'HH').length;
            const hlCount = klassList.filter(k => k === 'HL').length;
            const lhCount = klassList.filter(k => k === 'LH').length;
            const llCount = klassList.filter(k => k === 'LL').length;

            if (hhCount >= 2 && hlCount >= 2) return 'uptrend';
            if (lhCount >= 2 && llCount >= 2) return 'downtrend';
        }

        // 2) Прямой анализ цен closes с ATR-нормализацией.
        //    Если общий диапазон колебаний цен >> дрейф средней цены,
        //    значит движение случайное, а не направленное → это range.
        if (candles && candles.length >= 10 && avgAtr > 0) {
            const half = Math.floor(candles.length / 2);
            const firstHalf = candles.slice(0, half);
            const secondHalf = candles.slice(half);
            const avgFirst = firstHalf.reduce((s, c) => s + c.close, 0) / firstHalf.length;
            const avgSecond = secondHalf.reduce((s, c) => s + c.close, 0) / secondHalf.length;
            const drift = avgSecond - avgFirst;
            const avgPrice = (avgFirst + avgSecond) / 2;
            const changePct = avgPrice > 0 ? (drift / avgPrice) * 100 : 0;

            // Полный размах цен в % от средней цены
            const highs = candles.map(c => c.high);
            const lows = candles.map(c => c.low);
            const maxH = Math.max(...highs);
            const minL = Math.min(...lows);
            const rangePct = avgPrice > 0 ? ((maxH - minL) / avgPrice) * 100 : 0;

            // Дрейф, нормализованный к ATR: показывает, на сколько ATR
            // среднее смещение превышает «шум».
            // Если |drift| < 1.5 * avgAtr → дрейф соизмерим с шумом → range.
            const driftInAtr = Math.abs(drift) / avgAtr;

            // Решающее правило:
            //   - Чёткий направленный тренд: дрейф значительно больше размаха колебаний
            //     (>35% от размаха) И дрейф > 1.5 ATR И > 4% по средней.
            //   - Во всех остальных случаях — range/consolidation.
            const driftToRangeRatio = rangePct > 0 ? Math.abs(drift) / ((maxH - minL) || 1) : 0;
            const trendThreshold = 4.0;

            if (changePct > trendThreshold && driftInAtr > 1.5 && driftToRangeRatio > 0.35) return 'uptrend';
            if (changePct < -trendThreshold && driftInAtr > 1.5 && driftToRangeRatio > 0.35) return 'downtrend';
        }

        // 3) Консолидация по ATR
        if (currentAtr > 0 && avgAtr > 0 && currentAtr < avgAtr * 0.7) {
            return 'consolidation';
        }

        return 'range';
    }

    // ---------- 4) structure break detection ----------
    function detectStructureBreak(
        candles: MSACandle[],
        swings: MSASwing[],
        trendType: MarketStructureResult['type']
    ): MSAstructureShift {
        const empty: MSAstructureShift = {
            type: null,
            index: -1,
            price: 0,
            direction: null
        };
        if (candles.length < 2 || swings.length < 2) return empty;

        const lastHigh = [...swings].reverse().find(s => s.type === 'high') || null;
        const lastLow = [...swings].reverse().find(s => s.type === 'low') || null;
        if (!lastHigh || !lastLow) return empty;

        const lastIdx = candles.length - 1;
        const lastClose = candles[lastIdx].close;

        if (trendType === 'uptrend' && lastClose < lastLow.price) {
            return { type: 'CHoCH', index: lastIdx, price: lastClose, direction: 'bearish' };
        }

        if (trendType === 'downtrend' && lastClose > lastHigh.price) {
            return { type: 'CHoCH', index: lastIdx, price: lastClose, direction: 'bullish' };
        }

        const prevHighs = swings.filter(s => s.type === 'high' && s.index < lastHigh.index);
        const prevLows = swings.filter(s => s.type === 'low' && s.index < lastLow.index);

        if (trendType === 'uptrend' && prevHighs.length > 0 && lastClose > prevHighs[prevHighs.length - 1].price) {
            return { type: 'BOS', index: lastIdx, price: lastClose, direction: 'bullish' };
        }

        if (trendType === 'downtrend' && prevLows.length > 0 && lastClose < prevLows[prevLows.length - 1].price) {
            return { type: 'BOS', index: lastIdx, price: lastClose, direction: 'bearish' };
        }

        return empty;
    }

    // ---------- main ----------
    function analyzeMarketStructure(candles: MSACandle[]): MarketStructureResult {
        const empty: MarketStructureResult = {
            type: 'range',
            swings: [],
            higherHighs: [],
            higherLows: [],
            lowerHighs: [],
            lowerLows: [],
            structureShift: { type: null, index: -1, price: 0, direction: null },
            trendContinuation: false,
            trendReversal: false,
            lastSwingHigh: null,
            lastSwingLow: null,
            summary: ''
        };

        if (!candles || candles.length < 10) return empty;

        const window = 3;
        const swings = findSwings(candles, window);
        classifySwings(swings);

        const higherHighs = swings.filter(s => s.klass === 'HH');
        const higherLows = swings.filter(s => s.klass === 'HL');
        const lowerHighs = swings.filter(s => s.klass === 'LH');
        const lowerLows = swings.filter(s => s.klass === 'LL');

        const currentAtr = atr(candles.slice(-20), 14);
        const avgAtr = atr(candles, Math.min(50, candles.length - 1));

        const trendType = detectTrendType(swings, currentAtr, avgAtr, candles);

        let finalType: MarketStructureResult['type'] = trendType;
        if (currentAtr > 0 && avgAtr > 0) {
            if (currentAtr > avgAtr * 1.5) finalType = 'expansion';
            else if (currentAtr < avgAtr * 0.7 && trendType === 'range') {
                finalType = 'compression';
            }
        }

        const structureShift = detectStructureBreak(candles, swings, trendType);
        const trendContinuation = structureShift.type === 'BOS';
        const trendReversal = structureShift.type === 'CHoCH';

        const lastSwingHigh = [...swings].reverse().find(s => s.type === 'high') || null;
        const lastSwingLow = [...swings].reverse().find(s => s.type === 'low') || null;

        const summary = `Тип: ${finalType}. Свингов: ${swings.length} (HH:${higherHighs.length} HL:${higherLows.length} LH:${lowerHighs.length} LL:${lowerLows.length}). ${
            structureShift.type ? `${structureShift.type} (${structureShift.direction}) на баре ${structureShift.index}` : 'Без структурного сдвига'
        }.`;

        return {
            type: finalType,
            swings,
            higherHighs,
            higherLows,
            lowerHighs,
            lowerLows,
            structureShift,
            trendContinuation,
            trendReversal,
            lastSwingHigh,
            lastSwingLow,
            summary
        };
    }

    const marketStructureAnalyzer = {
        analyze: analyzeMarketStructure,
        analyzeMarketStructure: analyzeMarketStructure,
        VERSION: '3.0.1'
    };

    if (typeof global !== 'undefined') (global as any).marketStructureAnalyzer = marketStructureAnalyzer;
    if (typeof window !== 'undefined') (window as any).marketStructureAnalyzer = marketStructureAnalyzer;
    if (typeof module !== 'undefined' && module.exports) module.exports = marketStructureAnalyzer;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : globalThis));
