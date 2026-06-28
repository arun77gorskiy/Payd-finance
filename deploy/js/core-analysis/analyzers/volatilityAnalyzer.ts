/**
 * volatilityAnalyzer.ts — Module X / Analyzer #7
 *
 * Назначение: глубокий анализ волатильности — ATR, Bollinger Bands, Keltner Channel,
 *              Squeeze Detection, Volatility Regime, Historical Volatility.
 *
 * Зависимости: НЕТ.
 * Используется: riskAssessor, marketPhaseAnalyzer, confluenceAnalyzer.
 *
 * Публичный API:
 *   - analyzeVolatility(candles: Candle[]): VolatilityResult
 *
 * Алгоритмы:
 *   1. ATR (Average True Range) — стандартный индикатор волатильности.
 *   2. Bollinger Bands — SMA ± N*StdDev.
 *   3. Keltner Channel — EMA ± N*ATR.
 *   4. Squeeze Detection — Bollinger внутри Keltner (консолидация).
 *   5. Volatility Regime — low/normal/high/extreme через перцентили.
 *   6. Historical Volatility — std deviation лог-доходностей.
 *   7. ATR Expansion/Compression — динамика ATR vs его SMA.
 */

interface VLCandle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface VolatilityResult {
    // ATR
    atr: number;
    atrPercent: number;            // ATR / close * 100
    atrMA: number;                 // SMA от ATR
    atrExpansion: boolean;
    atrCompression: boolean;
    atrTrend: 'expanding' | 'contracting' | 'stable';

    // Bollinger Bands
    bbUpper: number;
    bbMiddle: number;
    bbLower: number;
    bbWidth: number;
    bbPercentB: number;            // (close - lower) / (upper - lower)
    bbSqueeze: boolean;

    // Keltner Channel
    kcUpper: number;
    kcMiddle: number;
    kcLower: number;
    kcWidth: number;

    // Squeeze
    inSqueeze: boolean;
    squeezeStrength: number;       // 0..1, чем больше — тем плотнее сжатие
    squeezeDuration: number;       // Кол-во свечей текущего сжатия

    // Historical Volatility
    historicalVolatility: number;  // Годовая волатильность (%)

    // Volatility Regime
    regime: 'extreme_low' | 'low' | 'normal' | 'high' | 'extreme_high';
    regimePercentile: number;      // 0..100 — где текущий ATR относительно истории

    // Breakout
    volatilityBreakout: boolean;
    breakoutDirection: 'bullish' | 'bearish' | 'neutral';

    // Итог
    bias: 'favor_breakout' | 'favor_mean_reversion' | 'neutral';

    metadata: {
        atrPeriod: number;
        bbPeriod: number;
        kcPeriod: number;
        squeezeCount: number;
    };
}

(function (global: any) {
    'use strict';

    // ============================================================
    // КОНФИГУРАЦИЯ
    // ============================================================
    const ATR_PERIOD = 14;
    const BB_PERIOD = 20;
    const BB_STDDEV = 2;
    const KC_PERIOD = 20;
    const KC_ATR_MULT = 1.5;
    const SQUEEZE_LOOKBACK = 5;
    const EXPANSION_THRESHOLD = 1.3;
    const COMPRESSION_THRESHOLD = 0.7;

    // ============================================================
    // УТИЛИТЫ
    // ============================================================
    function sma(arr: number[], period: number): number[] {
        const out: number[] = [];
        for (let i = 0; i < arr.length; i++) {
            if (i < period - 1) { out.push(NaN); continue; }
            let s = 0;
            for (let j = i - period + 1; j <= i; j++) s += arr[j];
            out.push(s / period);
        }
        return out;
    }
    function ema(arr: number[], period: number): number[] {
        const out: number[] = [];
        const k = 2 / (period + 1);
        for (let i = 0; i < arr.length; i++) {
            if (i === 0) out.push(arr[0]);
            else out.push(arr[i] * k + out[i - 1] * (1 - k));
        }
        return out;
    }
    function stdDev(arr: number[], period: number): number[] {
        const out: number[] = [];
        const mean = sma(arr, period);
        for (let i = 0; i < arr.length; i++) {
            if (i < period - 1) { out.push(NaN); continue; }
            const m = mean[i];
            let s = 0;
            for (let j = i - period + 1; j <= i; j++) s += (arr[j] - m) ** 2;
            out.push(Math.sqrt(s / period));
        }
        return out;
    }

    // ============================================================
    // 1. ATR
    // ============================================================
    function computeATR(candles: VLCandle[], period: number = ATR_PERIOD): number[] {
        if (candles.length < 2) return [];
        const tr: number[] = [candles[0].high - candles[0].low];
        for (let i = 1; i < candles.length; i++) {
            const c = candles[i];
            const prevClose = candles[i - 1].close;
            const trueRange = Math.max(
                c.high - c.low,
                Math.abs(c.high - prevClose),
                Math.abs(c.low - prevClose)
            );
            tr.push(trueRange);
        }
        // Wilder's smoothing (RMA)
        const atr: number[] = [];
        let prev = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
        atr[period - 1] = prev;
        for (let i = period; i < tr.length; i++) {
            prev = (prev * (period - 1) + tr[i]) / period;
            atr.push(prev);
        }
        // Дополняем NaN в начале
        const padded: number[] = [];
        for (let i = 0; i < period - 1; i++) padded.push(NaN);
        return padded.concat(atr);
    }

    // ============================================================
    // 2. BOLLINGER BANDS
    // ============================================================
    function computeBB(candles: VLCandle[], period: number = BB_PERIOD, mult: number = BB_STDDEV): { upper: number[]; middle: number[]; lower: number[] } {
        const closes = candles.map(c => c.close);
        const middle = sma(closes, period);
        const sd = stdDev(closes, period);
        const upper: number[] = [];
        const lower: number[] = [];
        for (let i = 0; i < closes.length; i++) {
            if (isNaN(middle[i]) || isNaN(sd[i])) {
                upper.push(NaN); lower.push(NaN);
            } else {
                upper.push(middle[i] + mult * sd[i]);
                lower.push(middle[i] - mult * sd[i]);
            }
        }
        return { upper, middle, lower };
    }

    // ============================================================
    // 3. KELTNER CHANNEL
    // ============================================================
    function computeKC(candles: VLCandle[], period: number = KC_PERIOD, atrMult: number = KC_ATR_MULT, atrSeries?: number[]): { upper: number[]; middle: number[]; lower: number[] } {
        const closes = candles.map(c => c.close);
        const middle = ema(closes, period);
        const atr = atrSeries || computeATR(candles, ATR_PERIOD);
        const upper: number[] = [];
        const lower: number[] = [];
        for (let i = 0; i < closes.length; i++) {
            if (isNaN(middle[i]) || isNaN(atr[i])) {
                upper.push(NaN); lower.push(NaN);
            } else {
                upper.push(middle[i] + atrMult * atr[i]);
                lower.push(middle[i] - atrMult * atr[i]);
            }
        }
        return { upper, middle, lower };
    }

    // ============================================================
    // 4. SQUEEZE DURATION
    // ============================================================
    function countSqueezeDuration(bbUpper: number[], bbLower: number[], kcUpper: number[], kcLower: number[]): number {
        let count = 0;
        for (let i = bbUpper.length - 1; i >= 0; i--) {
            if (isNaN(bbUpper[i]) || isNaN(kcUpper[i])) break;
            if (bbUpper[i] <= kcUpper[i] && bbLower[i] >= kcLower[i]) {
                count++;
            } else break;
        }
        return count;
    }

    // ============================================================
    // 5. HISTORICAL VOLATILITY (годовая)
    // ============================================================
    function computeHV(candles: VLCandle[], period: number = 20): number {
        if (candles.length < period + 1) return 0;
        const slice = candles.slice(-(period + 1));
        const logReturns: number[] = [];
        for (let i = 1; i < slice.length; i++) {
            logReturns.push(Math.log(slice[i].close / slice[i - 1].close));
        }
        const mean = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
        const variance = logReturns.reduce((s, r) => s + (r - mean) ** 2, 0) / logReturns.length;
        const stdD = Math.sqrt(variance);
        // Годовая: std * sqrt(252) для дневных, * sqrt(52) для недельных, * sqrt(365*24) для часовых
        return stdD * Math.sqrt(252) * 100;
    }

    // ============================================================
    // 6. VOLATILITY REGIME (через перцентили)
    // ============================================================
    function percentileRank(value: number, series: number[]): number {
        if (series.length === 0) return 50;
        const sorted = [...series].sort((a, b) => a - b);
        let count = 0;
        for (const v of sorted) {
            if (v <= value) count++;
            else break;
        }
        return (count / sorted.length) * 100;
    }

    // ============================================================
    // ГЛАВНАЯ ФУНКЦИЯ
    // ============================================================
    function analyzeVolatility(candles: VLCandle[]): VolatilityResult {
        const result: VolatilityResult = {
            atr: 0, atrPercent: 0, atrMA: 0,
            atrExpansion: false, atrCompression: false, atrTrend: 'stable',
            bbUpper: 0, bbMiddle: 0, bbLower: 0, bbWidth: 0, bbPercentB: 0.5, bbSqueeze: false,
            kcUpper: 0, kcMiddle: 0, kcLower: 0, kcWidth: 0,
            inSqueeze: false, squeezeStrength: 0, squeezeDuration: 0,
            historicalVolatility: 0,
            regime: 'normal', regimePercentile: 50,
            volatilityBreakout: false, breakoutDirection: 'neutral',
            bias: 'neutral',
            metadata: { atrPeriod: ATR_PERIOD, bbPeriod: BB_PERIOD, kcPeriod: KC_PERIOD, squeezeCount: 0 }
        };

        if (!candles || candles.length < 20) return result;

        // ATR
        const atrSeries = computeATR(candles);
        const atrMA_series = sma(atrSeries, 20).map(v => isNaN(v) ? 0 : v);
        const lastATR = atrSeries[atrSeries.length - 1];
        const lastATRMA = atrMA_series[atrMA_series.length - 1];
        result.atr = isNaN(lastATR) ? 0 : lastATR;
        result.atrMA = isNaN(lastATRMA) ? 0 : lastATRMA;
        const lastClose = candles[candles.length - 1].close;
        result.atrPercent = lastClose > 0 ? (result.atr / lastClose) * 100 : 0;
        result.atrExpansion = result.atrMA > 0 && result.atr > result.atrMA * EXPANSION_THRESHOLD;
        result.atrCompression = result.atrMA > 0 && result.atr < result.atrMA * COMPRESSION_THRESHOLD;
        if (result.atrExpansion) result.atrTrend = 'expanding';
        else if (result.atrCompression) result.atrTrend = 'contracting';
        else result.atrTrend = 'stable';

        // Bollinger Bands
        const bb = computeBB(candles);
        const last = candles.length - 1;
        result.bbUpper = isNaN(bb.upper[last]) ? 0 : bb.upper[last];
        result.bbMiddle = isNaN(bb.middle[last]) ? 0 : bb.middle[last];
        result.bbLower = isNaN(bb.lower[last]) ? 0 : bb.lower[last];
        result.bbWidth = result.bbMiddle > 0 ? ((result.bbUpper - result.bbLower) / result.bbMiddle) * 100 : 0;
        if (result.bbUpper > result.bbLower) {
            result.bbPercentB = (lastClose - result.bbLower) / (result.bbUpper - result.bbLower);
        }

        // Keltner Channel
        const kc = computeKC(candles, KC_PERIOD, KC_ATR_MULT, atrSeries);
        result.kcUpper = isNaN(kc.upper[last]) ? 0 : kc.upper[last];
        result.kcMiddle = isNaN(kc.middle[last]) ? 0 : kc.middle[last];
        result.kcLower = isNaN(kc.lower[last]) ? 0 : kc.lower[last];
        result.kcWidth = result.kcMiddle > 0 ? ((result.kcUpper - result.kcLower) / result.kcMiddle) * 100 : 0;

        // Squeeze
        result.bbSqueeze = result.bbUpper <= result.kcUpper && result.bbLower >= result.kcLower && result.bbUpper > 0;
        result.inSqueeze = result.bbSqueeze;
        result.squeezeDuration = countSqueezeDuration(bb.upper, bb.lower, kc.upper, kc.lower);
        // Strength: отношение ширины BB к KC (меньше = сильнее сжатие)
        if (result.kcWidth > 0) {
            result.squeezeStrength = Math.max(0, Math.min(1, 1 - result.bbWidth / result.kcWidth));
        }

        // Historical Volatility
        result.historicalVolatility = computeHV(candles);

        // Regime через перцентили ATR за последние 100 свечей
        const atrHistory = atrSeries.slice(-100).filter(v => !isNaN(v) && v > 0);
        result.regimePercentile = percentileRank(result.atr, atrHistory);
        if (result.regimePercentile < 10) result.regime = 'extreme_low';
        else if (result.regimePercentile < 30) result.regime = 'low';
        else if (result.regimePercentile < 70) result.regime = 'normal';
        else if (result.regimePercentile < 90) result.regime = 'high';
        else result.regime = 'extreme_high';

        // Breakout: выход из сжатия
        const wasInSqueeze = atrSeries.length > 5 ? (
            bb.upper[last - 1] <= kc.upper[last - 1] && bb.lower[last - 1] >= kc.lower[last - 1] &&
            !isNaN(bb.upper[last - 1]) && !isNaN(kc.upper[last - 1])
        ) : false;
        if (wasInSqueeze && !result.bbSqueeze) {
            result.volatilityBreakout = true;
            result.breakoutDirection = lastClose > result.bbMiddle ? 'bullish' : 'bearish';
        }

        // Bias
        if (result.bbSqueeze && result.squeezeDuration >= 3) {
            result.bias = 'favor_breakout';
        } else if (result.bbPercentB > 0.95 || result.bbPercentB < 0.05) {
            result.bias = 'favor_mean_reversion';
        } else {
            result.bias = 'neutral';
        }

        return result;
    }

    // ============================================================
    // ПУБЛИЧНЫЙ API
    // ============================================================
    const volatilityAnalyzer = {
        analyze: analyzeVolatility,
        analyzeVolatility: analyzeVolatility,
        VERSION: '2.0.0',
        CONFIG: {
            ATR_PERIOD, BB_PERIOD, BB_STDDEV,
            KC_PERIOD, KC_ATR_MULT, SQUEEZE_LOOKBACK,
            EXPANSION_THRESHOLD, COMPRESSION_THRESHOLD
        },
        _internal: {
            sma, ema, stdDev, computeATR, computeBB, computeKC,
            countSqueezeDuration, computeHV, percentileRank
        }
    };

    if (typeof global !== 'undefined') global.volatilityAnalyzer = volatilityAnalyzer;
    if (typeof window !== 'undefined') (window as any).volatilityAnalyzer = volatilityAnalyzer;
    if (typeof module !== 'undefined' && module.exports) module.exports = volatilityAnalyzer;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : globalThis));
