/**
 * momentumAnalyzer.ts — Module X / Analyzer #8 (полная реализация)
 *
 * Определяет:
 *   Strong Momentum, Weak Momentum
 *   Increasing Momentum, Decreasing Momentum
 *   Impulse, Correction
 *   Momentum Exhaustion
 *
 * Алгоритмы:
 *   1) RSI (Relative Strength Index, period=14):
 *      gain = max(close[i]-close[i-1], 0)
 *      loss = max(close[i-1]-close[i], 0)
 *      avgGain = EMA(gains, 14)
 *      avgLoss = EMA(losses, 14)
 *      RS = avgGain / avgLoss
 *      RSI = 100 - 100/(1+RS)
 *   2) ROC (Rate of Change, period=10): (close - close[N]) / close[N] * 100
 *   3) Momentum Slope: разница RSI между последними точками,
 *      нормализованная по количеству бар → показывает Increasing/Decreasing.
 *   4) Impulse: сильный ROC (>1% за 10 бар) + объём-подтверждение
 *      (через диапазон свечи: body/ATR > 1.0) → импульс.
 *   5) Correction: ROC меняет знак против предыдущего импульса.
 *   6) Momentum Exhaustion: дивергенция между ценой и RSI
 *      (цена делает новый high, RSI — нет, и наоборот).
 *
 * Зависимости: НЕТ.
 */

interface MMCandle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface MMDivergence {
    type: 'bullish' | 'bearish';
    priceIndex: number;
    momentumIndex: number;
    priceExtreme: number;
    momentumExtreme: number;
    description: string;
}

interface MomentumResult {
    rsi: number;                  // 0..100 (последний)
    rsiSeries: number[];          // вся серия
    roc: number;                  // % за period=10
    rocSeries: number[];
    momentumSlope: number;        // наклон RSI, RSI-единиц на бар
    macd: number;                 // MACD-линия (EMA12 - EMA26)
    macdSignal: number;           // Signal-линия (EMA9 от MACD)
    macdHistogram: number;        // MACD - Signal (гистограмма)
    macdSeries: number[];         // вся серия MACD
    macdHistogramSeries: number[];// вся серия гистограммы
    strongMomentum: boolean;
    weakMomentum: boolean;
    increasingMomentum: boolean;
    decreasingMomentum: boolean;
    impulse: boolean;
    correction: boolean;
    momentumExhaustion: boolean;
    divergences: MMDivergence[];
    impulseBars: number[];         // индексы импульсных бар
    summary: string;
}

(function (global: any) {
    'use strict';

    function ema(values: number[], period: number): number[] {
        const r: number[] = [];
        if (values.length === 0) return r;
        const k = 2 / (period + 1);
        let prev = values[0];
        r.push(prev);
        for (let i = 1; i < values.length; i++) {
            prev = values[i] * k + prev * (1 - k);
            r.push(prev);
        }
        return r;
    }

    function trueRange(c: MMCandle, prev: MMCandle | null): number {
        if (!prev) return c.high - c.low;
        return Math.max(
            c.high - c.low,
            Math.abs(c.high - prev.close),
            Math.abs(c.low - prev.close)
        );
    }

    function atr(candles: MMCandle[], period: number): number {
        if (candles.length < period + 1) return 0;
        let s = 0;
        const start = Math.max(1, candles.length - period);
        for (let i = start; i < candles.length; i++) {
            s += trueRange(candles[i], candles[i - 1]);
        }
        return s / Math.min(period, candles.length - 1);
    }

    // RSI period=14
    function rsiSeries(closes: number[], period: number): number[] {
        const result: number[] = [];
        if (closes.length < period + 1) return result;

        const gains: number[] = [];
        const losses: number[] = [];
        for (let i = 1; i < closes.length; i++) {
            const diff = closes[i] - closes[i - 1];
            gains.push(Math.max(diff, 0));
            losses.push(Math.max(-diff, 0));
        }

        // Первая средняя — SMA
        let avgGain = 0;
        let avgLoss = 0;
        for (let i = 0; i < period; i++) {
            avgGain += gains[i];
            avgLoss += losses[i];
        }
        avgGain /= period;
        avgLoss /= period;

        const firstRS = avgLoss > 0 ? avgGain / avgLoss : 100;
        result.push(100 - 100 / (1 + firstRS));

        for (let i = period; i < gains.length; i++) {
            avgGain = (avgGain * (period - 1) + gains[i]) / period;
            avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
            const rs = avgLoss > 0 ? avgGain / avgLoss : 100;
            result.push(100 - 100 / (1 + rs));
        }
        return result;
    }

    // ROC period=10
    function rocSeries(closes: number[], period: number): number[] {
        const result: number[] = [];
        for (let i = period; i < closes.length; i++) {
            const base = closes[i - period];
            result.push(base > 0 ? ((closes[i] - base) / base) * 100 : 0);
        }
        return result;
    }

    // MACD (12, 26, 9): EMA12 - EMA26 = MACD line, EMA9(MACD) = Signal, Histogram = MACD - Signal
    function macdHistogram(closes: number[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9): {
        macd: number; signal: number; histogram: number;
        macdSeries: number[]; histogramSeries: number[]
    } {
        const empty = {
            macd: 0, signal: 0, histogram: 0,
            macdSeries: [] as number[], histogramSeries: [] as number[]
        };
        if (!closes || closes.length < slowPeriod + signalPeriod) return empty;

        const emaFast = ema(closes, fastPeriod);
        const emaSlow = ema(closes, slowPeriod);

        // MACD-линия = EMA12[i] - EMA26[i] для всех i (обе EMA выровнены по индексу)
        const macdLine: number[] = [];
        for (let i = 0; i < emaFast.length; i++) {
            macdLine.push(emaFast[i] - emaSlow[i]);
        }

        // Signal-линия = EMA(MACD_line, 9). EMA имеет ту же длину, что и вход.
        const signalLine = ema(macdLine, signalPeriod);

        // Гистограмма = MACD[i] - Signal[i]
        const histogramSeries: number[] = [];
        for (let i = 0; i < macdLine.length; i++) {
            histogramSeries.push(macdLine[i] - signalLine[i]);
        }

        const lastIdx = macdLine.length - 1;
        return {
            macd: macdLine[lastIdx],
            signal: signalLine[lastIdx],
            histogram: histogramSeries[lastIdx],
            macdSeries: macdLine,
            histogramSeries
        };
    }

    // Дивергенция: сравниваем последние 2 экстремума цены и RSI
    function findDivergences(candles: MMCandle[], rsiS: number[]): MMDivergence[] {
        const out: MMDivergence[] = [];
        if (candles.length < 30 || rsiS.length < 20) return out;

        // Берём окно последних 30 бар
        const windowSize = 30;
        const startIdx = Math.max(0, candles.length - windowSize);

        let priceMaxIdx = startIdx;
        let priceMinIdx = startIdx;
        for (let i = startIdx + 1; i < candles.length; i++) {
            if (candles[i].high > candles[priceMaxIdx].high) priceMaxIdx = i;
            if (candles[i].low < candles[priceMinIdx].low) priceMinIdx = i;
        }

        // RSI серия выровнена по candles (длина candles.length - period)
        const rsiOffset = candles.length - rsiS.length;
        const rsiMaxIdx = rsiS.length >= 5 ? argMaxInRange(rsiS, rsiS.length - 30, rsiS.length) : 0;
        const rsiMinIdx = rsiS.length >= 5 ? argMinInRange(rsiS, rsiS.length - 30, rsiS.length) : 0;

        // Bearish divergence: цена HH, RSI LH
        if (priceMaxIdx !== startIdx) {
            const prevMaxIdx = findPrevExtremum(candles, priceMaxIdx, 'high');
            if (prevMaxIdx !== -1) {
                const prevRsiMax = rsiS[prevMaxIdx - rsiOffset];
                const currRsiMax = rsiS[priceMaxIdx - rsiOffset];
                if (
                    candles[priceMaxIdx].high > candles[prevMaxIdx].high &&
                    currRsiMax < prevRsiMax &&
                    currRsiMax > 50
                ) {
                    out.push({
                        type: 'bearish',
                        priceIndex: priceMaxIdx,
                        momentumIndex: priceMaxIdx - rsiOffset,
                        priceExtreme: candles[priceMaxIdx].high,
                        momentumExtreme: currRsiMax,
                        description: `Медвежья дивергенция: цена HH (${candles[prevMaxIdx].high.toFixed(2)} → ${candles[priceMaxIdx].high.toFixed(2)}), RSI LH (${prevRsiMax.toFixed(1)} → ${currRsiMax.toFixed(1)})`
                    });
                }
            }
        }

        // Bullish divergence: цена LL, RSI HL
        if (priceMinIdx !== startIdx) {
            const prevMinIdx = findPrevExtremum(candles, priceMinIdx, 'low');
            if (prevMinIdx !== -1) {
                const prevRsiMin = rsiS[prevMinIdx - rsiOffset];
                const currRsiMin = rsiS[priceMinIdx - rsiOffset];
                if (
                    candles[priceMinIdx].low < candles[prevMinIdx].low &&
                    currRsiMin > prevRsiMin &&
                    currRsiMin < 50
                ) {
                    out.push({
                        type: 'bullish',
                        priceIndex: priceMinIdx,
                        momentumIndex: priceMinIdx - rsiOffset,
                        priceExtreme: candles[priceMinIdx].low,
                        momentumExtreme: currRsiMin,
                        description: `Бычья дивергенция: цена LL (${candles[prevMinIdx].low.toFixed(2)} → ${candles[priceMinIdx].low.toFixed(2)}), RSI HL (${prevRsiMin.toFixed(1)} → ${currRsiMin.toFixed(1)})`
                    });
                }
            }
        }

        return out;
    }

    function argMaxInRange(arr: number[], from: number, to: number): number {
        let bestIdx = from;
        let bestVal = arr[from];
        for (let i = from + 1; i < to && i < arr.length; i++) {
            if (arr[i] > bestVal) { bestVal = arr[i]; bestIdx = i; }
        }
        return bestIdx;
    }

    function argMinInRange(arr: number[], from: number, to: number): number {
        let bestIdx = from;
        let bestVal = arr[from];
        for (let i = from + 1; i < to && i < arr.length; i++) {
            if (arr[i] < bestVal) { bestVal = arr[i]; bestIdx = i; }
        }
        return bestIdx;
    }

    function findPrevExtremum(candles: MMCandle[], currentIdx: number, type: 'high' | 'low'): number {
        const lookback = 20;
        const start = Math.max(0, currentIdx - lookback);
        let bestIdx = -1;
        let bestVal = type === 'high' ? -Infinity : Infinity;
        for (let i = start; i < currentIdx - 2; i++) {
            const v = type === 'high' ? candles[i].high : candles[i].low;
            if (type === 'high' && v > bestVal) { bestVal = v; bestIdx = i; }
            if (type === 'low' && v < bestVal) { bestVal = v; bestIdx = i; }
        }
        return bestIdx;
    }

    // ---------- main ----------
    function analyzeMomentum(candles: MMCandle[]): MomentumResult {
        const empty: MomentumResult = {
            rsi: 50, rsiSeries: [], roc: 0, rocSeries: [],
            momentumSlope: 0,
            macd: 0, macdSignal: 0, macdHistogram: 0,
            macdSeries: [], macdHistogramSeries: [],
            strongMomentum: false, weakMomentum: false,
            increasingMomentum: false, decreasingMomentum: false,
            impulse: false, correction: false,
            momentumExhaustion: false,
            divergences: [], impulseBars: [], summary: ''
        };

        if (!candles || candles.length < 20) return empty;

        const closes = candles.map(c => c.close);
        const rsiS = rsiSeries(closes, 14);
        const rocS = rocSeries(closes, 10);
        const macdRes = macdHistogram(closes, 12, 26, 9);

        const lastRsi = rsiS.length > 0 ? rsiS[rsiS.length - 1] : 50;
        const lastRoc = rocS.length > 0 ? rocS[rocS.length - 1] : 0;

        // Momentum slope: средняя разница RSI за последние 5 бар
        let momentumSlope = 0;
        if (rsiS.length >= 6) {
            const past = rsiS[rsiS.length - 6];
            momentumSlope = (lastRsi - past) / 5;
        }

        const strongMomentum = lastRsi >= 65 || lastRsi <= 35;
        const weakMomentum = lastRsi >= 45 && lastRsi <= 55;
        const increasingMomentum = momentumSlope > 0.5;
        const decreasingMomentum = momentumSlope < -0.5;

        // Impulse: ROC по модулю > 1.0 И body/ATR последней свечи > 1.0
        const lastCandle = candles[candles.length - 1];
        const atrVal = atr(candles.slice(-15), 14);
        const bodySize = Math.abs(lastCandle.close - lastCandle.open);
        const impulse = Math.abs(lastRoc) > 1.0 && atrVal > 0 && bodySize / atrVal > 1.0;

        // Correction: знак ROC сменился относительно 5 бар назад
        let correction = false;
        if (rocS.length >= 6) {
            const prevRoc = rocS[rocS.length - 6];
            correction = (prevRoc > 0.5 && lastRoc < -0.5) || (prevRoc < -0.5 && lastRoc > 0.5);
        }

        // Поиск импульсных бар (ROC > 1% и body > 1.5*ATR)
        const impulseBars: number[] = [];
        const atrForAll = atr(candles, 14);
        for (let i = 0; i < candles.length; i++) {
            const c = candles[i];
            const b = Math.abs(c.close - c.open);
            if (b > 0 && atrForAll > 0 && b / atrForAll > 1.5) {
                impulseBars.push(i);
            }
        }

        // Дивергенции
        const divergences = findDivergences(candles, rsiS);
        const momentumExhaustion = divergences.length > 0;

        const summary = `RSI=${lastRsi.toFixed(1)}, ROC=${lastRoc.toFixed(2)}%, slope=${momentumSlope.toFixed(2)}/бар, MACD hist=${macdRes.histogram.toFixed(3)}. ${
            strongMomentum ? 'Сильный моментум. ' :
            weakMomentum ? 'Слабый моментум. ' :
            'Умеренный моментум. '
        }${impulse ? 'Импульс. ' : ''}${correction ? 'Коррекция. ' : ''}${
            momentumExhaustion ? `Истощение: ${divergences.length} дивергенц.` : ''
        }`;

        return {
            rsi: lastRsi,
            rsiSeries: rsiS,
            roc: lastRoc,
            rocSeries: rocS,
            momentumSlope,
            macd: macdRes.macd,
            macdSignal: macdRes.signal,
            macdHistogram: macdRes.histogram,
            macdSeries: macdRes.macdSeries,
            macdHistogramSeries: macdRes.histogramSeries,
            strongMomentum,
            weakMomentum,
            increasingMomentum,
            decreasingMomentum,
            impulse,
            correction,
            momentumExhaustion,
            divergences,
            impulseBars,
            summary
        };
    }

    const momentumAnalyzer = {
        analyze: analyzeMomentum,
        analyzeMomentum: analyzeMomentum,
        VERSION: '3.0.0'
    };

    if (typeof global !== 'undefined') (global as any).momentumAnalyzer = momentumAnalyzer;
    if (typeof window !== 'undefined') (window as any).momentumAnalyzer = momentumAnalyzer;
    if (typeof module !== 'undefined' && module.exports) module.exports = momentumAnalyzer;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : globalThis));
