/**
 * trendAnalyzer.ts — Module X / Analyzer #2 (полная реализация)
 *
 * Определяет:
 *   Strong Bull Trend, Weak Bull Trend
 *   Strong Bear Trend, Weak Bear Trend
 *   Sideways Market
 *   Trend Strength (0..100)
 *   Trend Direction
 *
 * Алгоритмы:
 *   1) EMA (Exponential Moving Average) для fast=9 и slow=21.
 *      EMA(t) = close·k + EMA(t-1)·(1-k), где k = 2/(period+1).
 *   2) ADX-подобная мера силы тренда:
 *      +DM = max(high[i]-high[i-1], 0), если directional move вверх больше чем вниз.
 *      -DM = max(low[i-1]-low[i], 0), если directional move вниз больше чем вверх.
 *      TR  = max(high-low, |high-prevClose|, |low-prevClose|).
 *      +DI = 100 · EMA(+DM) / EMA(TR)
 *      -DI = 100 · EMA(-DM) / EMA(TR)
 *      DX  = 100 · |+DI - -DI| / (+DI + -DI)
 *      ADX = EMA(DX) period=14
 *   3) Slope EMA21: (EMA21[last] - EMA21[last-N]) / N / close → %
 *      (нормализация по цене убирает зависимость от масштаба актива).
 *   4) Классификация:
 *        strong_bull: EMA9 > EMA21, slope > +0.05%/bar, ADX ≥ 25
 *        weak_bull:   EMA9 > EMA21, но ADX < 25 или slope слабый
 *        strong_bear: зеркально
 *        weak_bear:   зеркально
 *        sideways:    EMA9 ≈ EMA21 (|разница| < 0.3% от цены), ADX < 20
 *   5) Trend Exhaustion: ADX падает 3 бара подряд при высоком ADX → истощение.
 *
 * Зависимости: НЕТ.
 *   Опционально принимает marketStructure для подтверждения, но работает и без него.
 */

interface TACandle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface TAMarketStructureResult {
    type: string;
}

interface TrendResult {
    type: 'strong_bull' | 'weak_bull' | 'strong_bear' | 'weak_bear' | 'sideways';
    primaryTrend: 'strong_bull' | 'bull' | 'weak_bull' | 'strong_bear' | 'bear' | 'weak_bear' | 'sideways' | 'neutral';
    direction: 'bullish' | 'bearish' | 'neutral';
    strength: number;        // 0..100 (на основе ADX)
    slopePct: number;        // % наклон EMA21 за N бар
    confidence: number;      // 0..100 (уверенность в классификации)
    adx: number;
    plusDI: number;
    minusDI: number;
    ema9: number;
    ema21: number;
    ema50: number;
    strongBullTrend: boolean;
    weakBullTrend: boolean;
    strongBearTrend: boolean;
    weakBearTrend: boolean;
    sidewaysTrend: boolean;
    trendExhaustion: { detected: boolean; description: string };
    summary: string;
}

(function (global: any) {
    'use strict';

    // ---------- helpers ----------
    function ema(values: number[], period: number): number[] {
        const result: number[] = [];
        if (values.length === 0) return result;
        const k = 2 / (period + 1);
        let prev = values[0];
        result.push(prev);
        for (let i = 1; i < values.length; i++) {
            prev = values[i] * k + prev * (1 - k);
            result.push(prev);
        }
        return result;
    }

    function mean(values: number[]): number {
        if (values.length === 0) return 0;
        let s = 0;
        for (let i = 0; i < values.length; i++) s += values[i];
        return s / values.length;
    }

    function trueRange(c: TACandle, prev: TACandle | null): number {
        if (!prev) return c.high - c.low;
        return Math.max(
            c.high - c.low,
            Math.abs(c.high - prev.close),
            Math.abs(c.low - prev.close)
        );
    }

    function directionalMoves(c: TACandle, prev: TACandle): { plus: number; minus: number } {
        const upMove = c.high - prev.high;
        const downMove = prev.low - c.low;
        let plus = 0;
        let minus = 0;
        if (upMove > downMove && upMove > 0) plus = upMove;
        if (downMove > upMove && downMove > 0) minus = downMove;
        return { plus, minus };
    }

    // ADX-подобный расчёт
    function adxSystem(candles: TACandle[], period: number): { adx: number; plusDI: number; minusDI: number; adxSeries: number[] } {
        if (candles.length < period * 2) {
            return { adx: 0, plusDI: 0, minusDI: 0, adxSeries: [] };
        }

        const trs: number[] = [];
        const plusDMs: number[] = [];
        const minusDMs: number[] = [];
        for (let i = 1; i < candles.length; i++) {
            trs.push(trueRange(candles[i], candles[i - 1]));
            const dm = directionalMoves(candles[i], candles[i - 1]);
            plusDMs.push(dm.plus);
            minusDMs.push(dm.minus);
        }

        const atrEma = ema(trs, period);
        const plusDMEma = ema(plusDMs, period);
        const minusDMEma = ema(minusDMs, period);

        const dxSeries: number[] = [];
        const startIdx = period - 1;
        for (let i = startIdx; i < atrEma.length; i++) {
            const plusDI = atrEma[i] > 0 ? 100 * plusDMEma[i] / atrEma[i] : 0;
            const minusDI = atrEma[i] > 0 ? 100 * minusDMEma[i] / atrEma[i] : 0;
            const sumDI = plusDI + minusDI;
            const dx = sumDI > 0 ? 100 * Math.abs(plusDI - minusDI) / sumDI : 0;
            dxSeries.push(dx);
        }

        const adxSeries = ema(dxSeries, period);
        const lastIdx = adxSeries.length - 1;
        return {
            adx: lastIdx >= 0 ? adxSeries[lastIdx] : 0,
            plusDI: atrEma.length > 0 ? (atrEma[atrEma.length - 1] > 0 ? 100 * plusDMEma[plusDMEma.length - 1] / atrEma[atrEma.length - 1] : 0) : 0,
            minusDI: atrEma.length > 0 ? (atrEma[atrEma.length - 1] > 0 ? 100 * minusDMEma[minusDMEma.length - 1] / atrEma[atrEma.length - 1] : 0) : 0,
            adxSeries
        };
    }

    // ---------- main ----------
    function analyzeTrend(candles: TACandle[], marketStructure?: TAMarketStructureResult): TrendResult {
        const empty: TrendResult = {
            type: 'sideways',
            primaryTrend: 'sideways',
            direction: 'neutral',
            strength: 0,
            slopePct: 0,
            confidence: 0,
            adx: 0,
            plusDI: 0,
            minusDI: 0,
            ema9: 0,
            ema21: 0,
            ema50: 0,
            strongBullTrend: false,
            weakBullTrend: false,
            strongBearTrend: false,
            weakBearTrend: false,
            sidewaysTrend: true,
            trendExhaustion: { detected: false, description: '' },
            summary: ''
        };

        if (!candles || candles.length < 30) return empty;

        const closes = candles.map(c => c.close);
        const ema9Series = ema(closes, 9);
        const ema21Series = ema(closes, 21);
        const ema50Series = ema(closes, Math.min(50, candles.length - 1));

        const ema9 = ema9Series[ema9Series.length - 1];
        const ema21 = ema21Series[ema21Series.length - 1];
        const ema50 = ema50Series[ema50Series.length - 1];

        // Slope EMA21 (% на бар) за последние 14 бар
        const slopeWindow = 14;
        const ema21Past = ema21Series[Math.max(0, ema21Series.length - 1 - slopeWindow)];
        const lastClose = closes[closes.length - 1];
        const slopePct = lastClose > 0
            ? ((ema21 - ema21Past) / slopeWindow / lastClose) * 100
            : 0;

        // ADX
        const adxInfo = adxSystem(candles, 14);
        const { adx, plusDI, minusDI } = adxInfo;

        // Классификация
        const emaDiffPct = lastClose > 0 ? ((ema9 - ema21) / lastClose) * 100 : 0;
        const isBullOrder = ema9 > ema21 && ema21 > ema50;
        const isBearOrder = ema9 < ema21 && ema21 < ema50;

        let trendType: TrendResult['type'] = 'sideways';
        let direction: TrendResult['direction'] = 'neutral';

        if (isBullOrder && adx >= 25 && slopePct > 0.05) {
            trendType = 'strong_bull';
            direction = 'bullish';
        } else if (isBullOrder && (adx < 25 || slopePct <= 0.05)) {
            trendType = 'weak_bull';
            direction = 'bullish';
        } else if (isBearOrder && adx >= 25 && slopePct < -0.05) {
            trendType = 'strong_bear';
            direction = 'bearish';
        } else if (isBearOrder && (adx < 25 || slopePct >= -0.05)) {
            trendType = 'weak_bear';
            direction = 'bearish';
        } else if (Math.abs(emaDiffPct) < 0.3 && adx < 20) {
            trendType = 'sideways';
            direction = 'neutral';
        } else if (isBullOrder) {
            trendType = 'weak_bull';
            direction = 'bullish';
        } else if (isBearOrder) {
            trendType = 'weak_bear';
            direction = 'bearish';
        }

        // Trend Exhaustion: ADX падает 3 бара подряд при adx > 20
        let exhaustionDetected = false;
        let exhaustionDesc = '';
        const adxS = adxInfo.adxSeries;
        if (adxS.length >= 4 && adxS[adxS.length - 1] > 20) {
            const a = adxS[adxS.length - 1];
            const b = adxS[adxS.length - 2];
            const c = adxS[adxS.length - 3];
            const d = adxS[adxS.length - 4];
            if (a < b && b < c && c < d) {
                exhaustionDetected = true;
                exhaustionDesc = `ADX падает ${d.toFixed(1)}→${c.toFixed(1)}→${b.toFixed(1)}→${a.toFixed(1)} при высоком уровне → истощение тренда`;
            }
        }

        const strength = Math.min(100, Math.round(adx));
        const confidence = Math.round(
            Math.min(100, Math.max(0,
                Math.abs(emaDiffPct) * 30 +
                Math.abs(slopePct) * 200 +
                (exhaustionDetected ? -20 : 0)
            ))
        );

        const summary = `${trendType}: ADX=${adx.toFixed(1)}, +DI=${plusDI.toFixed(1)}, -DI=${minusDI.toFixed(1)}, slope=${slopePct.toFixed(3)}%/бар, EMA9-EMA21=${emaDiffPct.toFixed(2)}%${
            exhaustionDetected ? '. Истощение тренда!' : ''
        }.`;

        return {
            type: trendType,
            primaryTrend: trendType,
            direction,
            strength,
            slopePct,
            confidence,
            adx,
            plusDI,
            minusDI,
            ema9,
            ema21,
            ema50,
            strongBullTrend: trendType === 'strong_bull',
            weakBullTrend: trendType === 'weak_bull',
            strongBearTrend: trendType === 'strong_bear',
            weakBearTrend: trendType === 'weak_bear',
            sidewaysTrend: trendType === 'sideways',
            trendExhaustion: { detected: exhaustionDetected, description: exhaustionDesc },
            summary
        };
    }

    const trendAnalyzer = {
        analyze: analyzeTrend,
        analyzeTrend: analyzeTrend,
        VERSION: '3.0.0'
    };

    if (typeof global !== 'undefined') (global as any).trendAnalyzer = trendAnalyzer;
    if (typeof window !== 'undefined') (window as any).trendAnalyzer = trendAnalyzer;
    if (typeof module !== 'undefined' && module.exports) module.exports = trendAnalyzer;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : globalThis));
