/**
 * volumeAnalyzer.ts — Module X / Analyzer #5
 *
 * Назначение: глубокий анализ объёма — Volume Spike, OBV, VWAP, Volume Profile,
 *              Buying/Selling Pressure, Absorption, Exhaustion, Volume Divergence.
 *
 * Зависимости: НЕТ.
 * Используется: confluenceEngine, scenarioGenerator, marketPhaseAnalyzer.
 *
 * Публичный API:
 *   - analyzeVolume(candles: Candle[]): VolumeResult
 *
 * Алгоритмы:
 *   1. Simple Moving Average (SMA) объёма — базовая линия.
 *   2. Volume Spike — превышение SMA × N стандартных отклонений.
 *   3. OBV (On-Balance Volume) — кумулятивный индикатор давления.
 *   4. VWAP (Volume-Weighted Average Price) — справедливая цена с весом объёма.
 *   5. Volume Profile (POC, VAH, VAL) — распределение объёма по ценам.
 *   6. Buying/Selling Pressure — на основе расположения close внутри свечи.
 *   7. Absorption — высокий объём + малый body (крупный игрок поглощает).
 *   8. Exhaustion — аномальный объём + разворотный bar → вероятен разворот.
 *   9. Volume Divergence — цена растёт, OBV падает (или наоборот).
 */

interface VACandle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface VolumeSpike { index: number; volume: number; ratio: number; type: 'bullish' | 'bearish' | 'neutral'; }
interface VolumeProfileBin { priceLow: number; priceHigh: number; volume: number; }
interface VolumeDivergence { type: 'bullish' | 'bearish'; index: number; description: string; }
interface AbsorptionEvent { index: number; price: number; volume: number; direction: 'bullish' | 'bearish'; }
interface ExhaustionEvent { index: number; price: number; volume: number; direction: 'bullish' | 'bearish'; }

interface VolumeResult {
    // Базовая статистика
    current: number;
    average: number;          // SMA объёма за N свечей
    ratio: number;            // current / average
    stdDev: number;           // стандартное отклонение объёма

    // Спайки и аномалии
    volumeSpike: boolean;
    spikeStrength: number;    // (current - avg) / stdDev (z-score)
    spikes: VolumeSpike[];

    // Давление
    buyingPressure: number;   // 0..1
    sellingPressure: number;  // 0..1
    pressureTrend: 'increasing' | 'decreasing' | 'neutral';

    // OBV
    obv: number;
    obvTrend: 'bullish' | 'bearish' | 'neutral';
    obvSlope: number;

    // VWAP
    vwap: number;
    vwapDistance: number;     // (close - vwap) / vwap
    aboveVWAP: boolean;

    // Volume Profile
    poc: number;              // Point of Control — цена максимального объёма
    vah: number;              // Value Area High
    val: number;              // Value Area Low
    profile: VolumeProfileBin[];

    // События
    absorption: boolean;
    absorptionEvents: AbsorptionEvent[];
    exhaustion: boolean;
    exhaustionEvents: ExhaustionEvent[];
    divergences: VolumeDivergence[];

    // Итог
    regime: 'high_volume' | 'low_volume' | 'normal_volume' | 'climax';
    bias: 'bullish' | 'bearish' | 'neutral';

    metadata: {
        lookback: number;
        spikeCount: number;
        absorptionCount: number;
        exhaustionCount: number;
        divergenceCount: number;
    };
}

(function (global: any) {
    'use strict';

    // ============================================================
    // КОНФИГУРАЦИЯ
    // ============================================================
    const SMA_PERIOD = 20;
    const SPIKE_THRESHOLD = 1.5;        // x раз от среднего
    const SPIKE_ZSCORE_THRESHOLD = 1.5; // z-score
    const PROFILE_BINS = 24;            // Кол-во бинов для Volume Profile
    const VALUE_AREA_PCT = 0.7;         // 70% объёма — Value Area
    const ABSORPTION_BODY_RATIO = 0.3;  // body < 30% диапазона
    const ABSORPTION_VOL_RATIO = 1.5;   // объём > 1.5x среднего
    const EXHAUSTION_BODY_RATIO = 0.5;
    const EXHAUSTION_VOL_RATIO = 2.0;   // объём > 2x среднего
    const DIVERGENCE_LOOKBACK = 10;

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
    function stdDev(arr: number[], period: number): number[] {
        const out: number[] = [];
        const meanArr = sma(arr, period);
        for (let i = 0; i < arr.length; i++) {
            if (i < period - 1) { out.push(NaN); continue; }
            const m = meanArr[i];
            let s = 0;
            for (let j = i - period + 1; j <= i; j++) s += (arr[j] - m) ** 2;
            out.push(Math.sqrt(s / period));
        }
        return out;
    }
    function linRegSlope(arr: number[]): number {
        // Линейная регрессия по последним N точкам (без NaN)
        const valid: number[] = [];
        for (let i = 0; i < arr.length; i++) if (!isNaN(arr[i])) valid.push(arr[i]);
        if (valid.length < 2) return 0;
        const n = valid.length;
        const xs: number[] = [];
        for (let i = 0; i < n; i++) xs.push(i);
        const mx = xs.reduce((a, b) => a + b, 0) / n;
        const my = valid.reduce((a, b) => a + b, 0) / n;
        let num = 0, den = 0;
        for (let i = 0; i < n; i++) {
            num += (xs[i] - mx) * (valid[i] - my);
            den += (xs[i] - mx) ** 2;
        }
        return den === 0 ? 0 : num / den;
    }
    function clamp(v: number, lo: number, hi: number): number {
        return Math.max(lo, Math.min(hi, v));
    }

    // ============================================================
    // 1. SMA + STD DEV
    // ============================================================
    function computeSMAStats(volumes: number[]): { avg: number; std: number } {
        if (volumes.length < SMA_PERIOD) return { avg: 0, std: 0 };
        const slice = volumes.slice(-SMA_PERIOD);
        const avg = slice.reduce((a, b) => a + b, 0) / SMA_PERIOD;
        const variance = slice.reduce((s, v) => s + (v - avg) ** 2, 0) / SMA_PERIOD;
        return { avg, std: Math.sqrt(variance) };
    }

    // ============================================================
    // 2. VOLUME SPIKES
    // ============================================================
    function detectSpikes(candles: VACandle[], volMA: number[], volStd: number[]): VolumeSpike[] {
        const spikes: VolumeSpike[] = [];
        for (let i = 0; i < candles.length; i++) {
            const ma = volMA[i], sd = volStd[i];
            if (isNaN(ma) || isNaN(sd) || ma === 0) continue;
            const ratio = candles[i].volume / ma;
            if (ratio >= SPIKE_THRESHOLD && sd > 0) {
                const zscore = (candles[i].volume - ma) / sd;
                if (zscore >= SPIKE_ZSCORE_THRESHOLD) {
                    const c = candles[i];
                    const bullish = c.close > c.open;
                    const bearish = c.close < c.open;
                    spikes.push({
                        index: i,
                        volume: c.volume,
                        ratio,
                        type: bullish ? 'bullish' : (bearish ? 'bearish' : 'neutral')
                    });
                }
            }
        }
        return spikes;
    }

    // ============================================================
    // 3. OBV
    // ============================================================
    function computeOBV(candles: VACandle[]): number[] {
        const obv: number[] = [0];
        for (let i = 1; i < candles.length; i++) {
            const prev = candles[i - 1];
            const cur = candles[i];
            if (cur.close > prev.close) obv.push(obv[i - 1] + cur.volume);
            else if (cur.close < prev.close) obv.push(obv[i - 1] - cur.volume);
            else obv.push(obv[i - 1]);
        }
        return obv;
    }

    // ============================================================
    // 4. VWAP (кумулятивный за весь доступный период)
    // ============================================================
    function computeVWAP(candles: VACandle[]): number {
        if (candles.length === 0) return 0;
        let cumVol = 0;
        let cumPV = 0;
        for (const c of candles) {
            const typical = (c.high + c.low + c.close) / 3;
            cumPV += typical * c.volume;
            cumVol += c.volume;
        }
        return cumVol === 0 ? 0 : cumPV / cumVol;
    }

    // ============================================================
    // 5. VOLUME PROFILE
    // ============================================================
    function computeVolumeProfile(candles: VACandle[], bins: number = PROFILE_BINS): { profile: VolumeProfileBin[]; poc: number; vah: number; val: number } {
        if (candles.length === 0) return { profile: [], poc: 0, vah: 0, val: 0 };
        let minP = Infinity, maxP = -Infinity;
        for (const c of candles) {
            if (c.low < minP) minP = c.low;
            if (c.high > maxP) maxP = c.high;
        }
        if (minP === maxP) return { profile: [{ priceLow: minP, priceHigh: maxP, volume: candles.reduce((s, c) => s + c.volume, 0) }], poc: minP, vah: maxP, val: minP };
        const step = (maxP - minP) / bins;
        const profile: VolumeProfileBin[] = [];
        for (let i = 0; i < bins; i++) {
            profile.push({
                priceLow: minP + i * step,
                priceHigh: minP + (i + 1) * step,
                volume: 0
            });
        }
        for (const c of candles) {
            const idx = clamp(Math.floor((c.close - minP) / step), 0, bins - 1);
            profile[idx].volume += c.volume;
        }
        // POC = bin с максимальным объёмом
        let pocBin = profile[0];
        for (const b of profile) if (b.volume > pocBin.volume) pocBin = b;
        const poc = (pocBin.priceLow + pocBin.priceHigh) / 2;
        // Value Area: расширяем от POC пока не наберём VALUE_AREA_PCT объёма
        const totalVol = profile.reduce((s, b) => s + b.volume, 0);
        const targetVol = totalVol * VALUE_AREA_PCT;
        const sortedByDist = [...profile].sort((a, b) => {
            const ma = (a.priceLow + a.priceHigh) / 2;
            const mb = (b.priceLow + b.priceHigh) / 2;
            return Math.abs(ma - poc) - Math.abs(mb - poc);
        });
        let accVol = 0;
        const vaBins: Set<VolumeProfileBin> = new Set();
        for (const b of sortedByDist) {
            vaBins.add(b);
            accVol += b.volume;
            if (accVol >= targetVol) break;
        }
        let vah = -Infinity, val = Infinity;
        for (const b of vaBins) {
            if (b.priceHigh > vah) vah = b.priceHigh;
            if (b.priceLow < val) val = b.priceLow;
        }
        return { profile, poc, vah, val };
    }

    // ============================================================
    // 6. BUYING / SELLING PRESSURE
    // ============================================================
    function computePressure(candles: VACandle[]): { buy: number; sell: number } {
        if (candles.length === 0) return { buy: 0.5, sell: 0.5 };
        const window = Math.min(candles.length, 20);
        let totalBuy = 0, totalSell = 0;
        for (let i = candles.length - window; i < candles.length; i++) {
            const c = candles[i];
            const range = c.high - c.low;
            if (range === 0) continue;
            const closePos = (c.close - c.low) / range;
            const vol = c.volume;
            totalBuy += closePos * vol;
            totalSell += (1 - closePos) * vol;
        }
        const total = totalBuy + totalSell;
        if (total === 0) return { buy: 0.5, sell: 0.5 };
        return { buy: totalBuy / total, sell: totalSell / total };
    }

    // ============================================================
    // 7. ABSORPTION
    // ============================================================
    function detectAbsorption(candles: VACandle[], volMA: number[]): AbsorptionEvent[] {
        const events: AbsorptionEvent[] = [];
        for (let i = 1; i < candles.length; i++) {
            const c = candles[i];
            const range = c.high - c.low;
            const body = Math.abs(c.close - c.open);
            const ma = volMA[i];
            if (isNaN(ma) || ma === 0 || range === 0) continue;
            if (body / range < ABSORPTION_BODY_RATIO && c.volume / ma >= ABSORPTION_VOL_RATIO) {
                events.push({
                    index: i,
                    price: (c.high + c.low) / 2,
                    volume: c.volume,
                    direction: c.close >= c.open ? 'bullish' : 'bearish'
                });
            }
        }
        return events;
    }

    // ============================================================
    // 8. EXHAUSTION
    // ============================================================
    function detectExhaustion(candles: VACandle[], volMA: number[]): ExhaustionEvent[] {
        const events: ExhaustionEvent[] = [];
        for (let i = 2; i < candles.length; i++) {
            const c = candles[i];
            const prev = candles[i - 1];
            const ma = volMA[i];
            if (isNaN(ma) || ma === 0) continue;
            if (c.volume / ma >= EXHAUSTION_VOL_RATIO) {
                const range = c.high - c.low;
                const body = Math.abs(c.close - c.open);
                if (range === 0 || body / range > EXHAUSTION_BODY_RATIO) continue;
                // Разворот: предыдущая свеча в одну сторону, текущая в другую
                const prevDir = prev.close > prev.open ? 1 : -1;
                const curDir = c.close > c.open ? 1 : -1;
                if (prevDir !== curDir) {
                    events.push({
                        index: i,
                        price: c.close,
                        volume: c.volume,
                        direction: c.close > c.open ? 'bullish' : 'bearish'
                    });
                }
            }
        }
        return events;
    }

    // ============================================================
    // 9. VOLUME DIVERGENCE
    // ============================================================
    function detectDivergence(candles: VACandle[], obv: number[]): VolumeDivergence[] {
        const divs: VolumeDivergence[] = [];
        if (candles.length < DIVERGENCE_LOOKBACK * 2) return divs;
        // Берём последние два экстремума цены и OBV
        const look = Math.min(DIVERGENCE_LOOKBACK, Math.floor(candles.length / 2));
        for (let i = candles.length - look; i < candles.length - 2; i++) {
            const cur = candles[i];
            const prev = candles[i - look];
            if (!prev) continue;
            const priceHigherHigh = cur.high > prev.high;
            const priceHigherLow = cur.low > prev.low;
            const priceLowerLow = cur.low < prev.low;
            const priceLowerHigh = cur.high < prev.high;

            const obvHigher = obv[i] > obv[i - look];
            const obvLower = obv[i] < obv[i - look];

            // Bullish: цена делает lower low, OBV — higher low (накопление)
            if (priceLowerLow && obvHigher) {
                divs.push({ type: 'bullish', index: i, description: 'Price LL + OBV HL (accumulation)' });
            }
            // Bearish: цена делает higher high, OBV — lower high (distribution)
            if (priceHigherHigh && !obvHigher && priceHigherHigh) {
                divs.push({ type: 'bearish', index: i, description: 'Price HH + OBV LH (distribution)' });
            }
        }
        return divs;
    }

    // ============================================================
    // ГЛАВНАЯ ФУНКЦИЯ
    // ============================================================
    function analyzeVolume(candles: VACandle[]): VolumeResult {
        const result: VolumeResult = {
            current: 0, average: 0, ratio: 1, stdDev: 0,
            volumeSpike: false, spikeStrength: 0, spikes: [],
            buyingPressure: 0.5, sellingPressure: 0.5, pressureTrend: 'neutral',
            obv: 0, obvTrend: 'neutral', obvSlope: 0,
            vwap: 0, vwapDistance: 0, aboveVWAP: false,
            poc: 0, vah: 0, val: 0, profile: [],
            absorption: false, absorptionEvents: [],
            exhaustion: false, exhaustionEvents: [],
            divergences: [],
            regime: 'normal_volume', bias: 'neutral',
            metadata: { lookback: SMA_PERIOD, spikeCount: 0, absorptionCount: 0, exhaustionCount: 0, divergenceCount: 0 }
        };

        if (!candles || candles.length < 5) return result;

        const vols = candles.map(c => c.volume);

        // 1. SMA + STD
        const volMA = sma(vols, SMA_PERIOD);
        const volSD = stdDev(vols, SMA_PERIOD);
        const { avg, std } = computeSMAStats(vols);
        result.average = avg;
        result.stdDev = std;
        result.current = vols[vols.length - 1];
        result.ratio = avg > 0 ? result.current / avg : 1;
        const zscore = std > 0 ? (result.current - avg) / std : 0;
        result.spikeStrength = zscore;

        // 2. Spikes
        result.spikes = detectSpikes(candles, volMA, volSD);
        result.volumeSpike = result.spikes.some(s => s.index === candles.length - 1);
        result.metadata.spikeCount = result.spikes.length;

        // 3. OBV
        const obvSeries = computeOBV(candles);
        result.obv = obvSeries[obvSeries.length - 1];
        const obvSlope = linRegSlope(obvSeries.slice(-Math.min(20, obvSeries.length)));
        result.obvSlope = obvSlope;
        result.obvTrend = obvSlope > 0 ? 'bullish' : (obvSlope < 0 ? 'bearish' : 'neutral');

        // 4. VWAP
        result.vwap = computeVWAP(candles);
        const lastClose = candles[candles.length - 1].close;
        result.vwapDistance = result.vwap > 0 ? (lastClose - result.vwap) / result.vwap : 0;
        result.aboveVWAP = lastClose > result.vwap;

        // 5. Volume Profile
        const vp = computeVolumeProfile(candles);
        result.profile = vp.profile;
        result.poc = vp.poc;
        result.vah = vp.vah;
        result.val = vp.val;

        // 6. Pressure
        const pressure = computePressure(candles);
        result.buyingPressure = pressure.buy;
        result.sellingPressure = pressure.sell;
        // Тренд давления: сравниваем давление последних 5 свечей с предыдущими 5
        if (candles.length >= 10) {
            const recent = computePressure(candles.slice(-5));
            const older = computePressure(candles.slice(-10, -5));
            if (recent.buy > older.buy + 0.05) result.pressureTrend = 'increasing';
            else if (recent.buy < older.buy - 0.05) result.pressureTrend = 'decreasing';
        }

        // 7. Absorption
        result.absorptionEvents = detectAbsorption(candles, volMA);
        result.absorption = result.absorptionEvents.length > 0;
        result.metadata.absorptionCount = result.absorptionEvents.length;

        // 8. Exhaustion
        result.exhaustionEvents = detectExhaustion(candles, volMA);
        result.exhaustion = result.exhaustionEvents.length > 0;
        result.metadata.exhaustionCount = result.exhaustionEvents.length;

        // 9. Divergences
        result.divergences = detectDivergence(candles, obvSeries);
        result.metadata.divergenceCount = result.divergences.length;

        // Режим объёма
        if (zscore >= 3) result.regime = 'climax';
        else if (zscore >= 1.5) result.regime = 'high_volume';
        else if (zscore <= -1.5) result.regime = 'low_volume';
        else result.regime = 'normal_volume';

        // Bias: объединяем давление, OBV, VWAP
        let bullScore = 0, bearScore = 0;
        if (result.buyingPressure > 0.55) bullScore++; else if (result.sellingPressure > 0.55) bearScore++;
        if (result.obvTrend === 'bullish') bullScore++; else if (result.obvTrend === 'bearish') bearScore++;
        if (result.aboveVWAP) bullScore++; else bearScore++;
        if (result.pressureTrend === 'increasing') bullScore++; else if (result.pressureTrend === 'decreasing') bearScore++;
        if (bullScore > bearScore) result.bias = 'bullish';
        else if (bearScore > bullScore) result.bias = 'bearish';
        else result.bias = 'neutral';

        return result;
    }

    // ============================================================
    // ПУБЛИЧНЫЙ API
    // ============================================================
    const volumeAnalyzer = {
        analyze: analyzeVolume,
        analyzeVolume: analyzeVolume,
        VERSION: '2.0.0',
        CONFIG: {
            SMA_PERIOD,
            SPIKE_THRESHOLD,
            SPIKE_ZSCORE_THRESHOLD,
            PROFILE_BINS,
            VALUE_AREA_PCT,
            ABSORPTION_BODY_RATIO,
            ABSORPTION_VOL_RATIO,
            EXHAUSTION_BODY_RATIO,
            EXHAUSTION_VOL_RATIO
        },
        _internal: {
            sma, stdDev, computeSMAStats, detectSpikes, computeOBV,
            computeVWAP, computeVolumeProfile, computePressure,
            detectAbsorption, detectExhaustion, detectDivergence, linRegSlope
        }
    };

    if (typeof global !== 'undefined') global.volumeAnalyzer = volumeAnalyzer;
    if (typeof window !== 'undefined') (window as any).volumeAnalyzer = volumeAnalyzer;
    if (typeof module !== 'undefined' && module.exports) module.exports = volumeAnalyzer;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : globalThis));
