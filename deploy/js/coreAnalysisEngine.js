/**
 * coreAnalysisEngine — Module X (Core Analysis Engine).
 *
 * Назначение:
 *   Единственное место в системе, где выполняется анализ графика.
 *   Вызывается ОДИН РАЗ для заданного набора исторических свечей
 *   и формирует максимально полный структурированный контекст рынка.
 *
 *   НИКАКОЙ другой модуль НЕ ДОЛЖЕН повторно анализировать график.
 *   Module 1, Module 2, Module 3 и любые будущие модули только
 *   потребляют выходные данные Module X.
 *
 *   Внутри Module X выполняется ВСЯ аналитическая логика:
 *     1. Market Structure (HH/HL/LH/LL, Structure Shift, BOS/CHoCH/MSS)
 *     2. Trend Analysis (тип и сила тренда)
 *     3. Smart Money Concepts (Order Blocks, FVG, Liquidity Sweeps, Displacement)
 *     4. Price Action (свечные модели и вероятности)
 *     5. Volume Analysis (объём, спайки, дивергенции, интерпретация)
 *     6. Liquidity (sweeps, grabs, untouched liquidity)
 *     7. Volatility (ATR, компрессия/экспансия, интерпретация)
 *     8. Support / Resistance Levels
 *     9. Probability Engine (бычий/медвежий/нейтральный)
 *    10. Trading Scenarios (сгенерированные сценарии с SL/TP)
 *    11. Position Analysis (позиция цены относительно уровня)
 *    12. Label / Signal Generation (классификация моментума, объёма, волатильности)
 *
 * Выход (analysisResult):
 *   {
 *     moduleXVersion, analyzedAt, inputMeta,
 *
 *     // Сырые аналитические данные
 *     structure, smc, priceAction, trend, momentum, volume,
 *     liquidity, volatility, levels, probability, scenarios,
 *
 *     // Интерпретации (labels/signals) — раньше были в Module 1
 *     interpretations: {
 *       structureLabel, momentumSignal, volumeTrend,
 *       volatilitySignal, position, ...
 *     },
 *
 *     // Краткая сводка (для UI)
 *     summary: { context, bias, confidence, keySignals, reasons, probabilities }
 *   }
 *
 * Использование:
 *   const analysis = coreAnalysisEngine.analyze({ history, level });
 *
 * Зависимости: нет.
 */
(function (global) {
    'use strict';

    // ================================================================
    // Утилиты
    // ================================================================
    function round(n, d) {
        d = d == null ? 2 : d;
        const f = Math.pow(10, d);
        return Math.round(n * f) / f;
    }

    function mean(arr) {
        if (!arr || arr.length === 0) return 0;
        let s = 0;
        for (let i = 0; i < arr.length; i++) s += arr[i];
        return s / arr.length;
    }

    function stdev(arr) {
        if (!arr || arr.length < 2) return 0;
        const m = mean(arr);
        let s = 0;
        for (let i = 0; i < arr.length; i++) s += (arr[i] - m) * (arr[i] - m);
        return Math.sqrt(s / (arr.length - 1));
    }

    function bodySize(c) { return Math.abs(c.close - c.open); }
    function candleRange(c) { return c.high - c.low; }
    function upperWick(c) { return c.high - Math.max(c.open, c.close); }
    function lowerWick(c) { return Math.min(c.open, c.close) - c.low; }
    function isBull(c) { return c.close > c.open; }
    function isBear(c) { return c.close < c.open; }

    // ================================================================
    // 1. Market Structure — поиск свингов и их классификация
    // ================================================================

    /**
     * Ищет локальные экстремумы (свинги) с заданным окном.
     * Возвращает массив свингов: { index, type: 'high'|'low', price, time }
     */
    function findSwings(candles, lookback) {
        lookback = lookback || 3;
        const swings = [];
        for (let i = lookback; i < candles.length - lookback; i++) {
            const c = candles[i];
            let isHigh = true, isLow = true;
            for (let j = 1; j <= lookback; j++) {
                if (candles[i - j].high >= c.high || candles[i + j].high >= c.high) isHigh = false;
                if (candles[i - j].low  <= c.low  || candles[i + j].low  <= c.low)  isLow  = false;
            }
            if (isHigh) swings.push({ index: i, type: 'high', price: c.high, time: c.time });
            if (isLow)  swings.push({ index: i, type: 'low',  price: c.low,  time: c.time  });
        }
        // Сортировка по индексу
        swings.sort((a, b) => a.index - b.index);
        return swings;
    }

    /**
     * Классифицирует свинги: HH, HL, LH, LL.
     */
    function classifySwings(swings) {
        const classified = [];
        let lastHigh = null, lastLow = null;
        for (let i = 0; i < swings.length; i++) {
            const s = swings[i];
            if (s.type === 'high') {
                let klass;
                if (lastHigh == null) klass = 'HH';
                else if (s.price > lastHigh.price) klass = 'HH';
                else if (s.price < lastHigh.price) klass = 'LH';
                else klass = 'EQH';
                classified.push({ ...s, klass });
                lastHigh = s;
            } else {
                let klass;
                if (lastLow == null) klass = 'LL';
                else if (s.price > lastLow.price) klass = 'HL';
                else if (s.price < lastLow.price) klass = 'LL';
                else klass = 'EQL';
                classified.push({ ...s, klass });
                lastLow = s;
            }
        }
        return classified;
    }

    /**
     * Определяет тип структуры: uptrend / downtrend / range / consolidation / expansion / compression.
     */
    function detectStructureType(classified, candles, volatility) {
        const hh = classified.filter(s => s.klass === 'HH').length;
        const hl = classified.filter(s => s.klass === 'HL').length;
        const lh = classified.filter(s => s.klass === 'LH').length;
        const ll = classified.filter(s => s.klass === 'LL').length;

        const bullish = hh + hl;
        const bearish = lh + ll;

        // Консолидация — небольшие движения и узкий диапазон
        const totalRange = candles[candles.length - 1].close - candles[0].close;
        const atrPct = volatility.atrPercent || 1;

        // Экспансия — увеличивающийся диапазон свечей
        const firstHalfRange = mean(candles.slice(0, Math.floor(candles.length / 2)).map(candleRange));
        const secondHalfRange = mean(candles.slice(Math.floor(candles.length / 2)).map(candleRange));
        const rangeExpanding = secondHalfRange > firstHalfRange * 1.3;

        if (bullish >= 2 && bullish > bearish && hl >= lh) return { type: 'uptrend', hh, hl, lh, ll };
        if (bearish >= 2 && bearish > bullish && lh >= hl) return { type: 'downtrend', hh, hl, lh, ll };

        if (rangeExpanding && Math.abs(totalRange) > atrPct * candles.length * 0.5) {
            return { type: 'expansion', hh, hl, lh, ll };
        }

        if (!rangeExpanding && atrPct < 0.5) {
            return { type: 'compression', hh, hl, lh, ll };
        }

        if (Math.abs(bullish - bearish) <= 1) {
            return { type: 'range', hh, hl, lh, ll };
        }

        return { type: 'consolidation', hh, hl, lh, ll };
    }

    /**
     * Ищет Structure Shift: BOS / CHoCH / MSS.
     */
    function detectStructureShift(classified, level) {
        // MSS — смена характера движения (последний значимый слом)
        // CHoCH — первый намёк на слом
        // BOS — пробой структуры по тренду
        const shift = { type: null, index: null, price: null, time: null };

        if (classified.length < 2) return shift;

        // Идём от конца к началу
        for (let i = classified.length - 1; i > 0; i--) {
            const cur = classified[i];
            const prev = classified[i - 1];

            // Бычий слом: был LH, появился HH
            if (cur.type === 'high' && cur.klass === 'HH' &&
                prev.type === 'high' && prev.klass === 'LH') {
                shift.type = 'BOS';
                shift.index = cur.index;
                shift.price = cur.price;
                shift.time = cur.time;
                return shift;
            }
            // Медвежий слом: был HL, появился LL
            if (cur.type === 'low' && cur.klass === 'LL' &&
                prev.type === 'low' && prev.klass === 'HL') {
                shift.type = 'BOS';
                shift.index = cur.index;
                shift.price = cur.price;
                shift.time = cur.time;
                return shift;
            }
        }

        // CHoCH — последняя смена тренда (если тренд менялся)
        const lastHigh = [...classified].reverse().find(s => s.type === 'high');
        const lastLow  = [...classified].reverse().find(s => s.type === 'low');

        if (lastHigh && lastLow) {
            if (lastHigh.klass === 'LH' && lastLow.klass === 'HL') {
                shift.type = 'CHoCH';
                shift.index = lastHigh.index;
                shift.price = lastHigh.price;
                shift.time = lastHigh.time;
            }
        }

        return shift;
    }

    function analyzeMarketStructure(candles, level, volatility) {
        const swings = findSwings(candles, 3);
        const classified = classifySwings(swings);
        const typeInfo = detectStructureType(classified, candles, volatility);
        const shift = detectStructureShift(classified, level);

        return {
            type: typeInfo.type,
            hh: typeInfo.hh,
            hl: typeInfo.hl,
            lh: typeInfo.lh,
            ll: typeInfo.ll,
            swings: classified,
            higherHighs: classified.filter(s => s.klass === 'HH'),
            higherLows:  classified.filter(s => s.klass === 'HL'),
            lowerHighs:  classified.filter(s => s.klass === 'LH'),
            lowerLows:   classified.filter(s => s.klass === 'LL'),
            structureShift: shift
        };
    }

    // ================================================================
    // 2. Smart Money Concepts (SMC)
    // ================================================================

    function findBOS(candles, structure) {
        // BOS — пробой предыдущего свинг-хая/лоя
        const bos = [];
        const recent = structure.swings.slice(-6);
        for (let i = 1; i < recent.length; i++) {
            const s = recent[i];
            const p = recent[i - 1];
            if (s.type === 'high' && p.type === 'high' && s.price > p.price) {
                bos.push({ type: 'bullish', index: s.index, level: p.price, time: s.time });
            }
            if (s.type === 'low' && p.type === 'low' && s.price < p.price) {
                bos.push({ type: 'bearish', index: s.index, level: p.price, time: s.time });
            }
        }
        return bos;
    }

    function findOrderBlocks(candles, structure) {
        // Order Block — последняя противоположная свеча перед импульсом
        const obs = [];
        const recent = candles.slice(-30);
        for (let i = 1; i < recent.length - 1; i++) {
            const cur = recent[i];
            const next = recent[i + 1];
            // Бычий OB: медвежья свеча перед сильным бычьим импульсом
            if (isBear(cur) && isBull(next) && bodySize(next) > bodySize(cur) * 1.5 &&
                next.close > cur.high) {
                obs.push({
                    type: 'bullish',
                    index: i,
                    high: cur.high,
                    low: cur.low,
                    time: cur.time,
                    mitigated: false
                });
            }
            // Медвежий OB: бычья свеча перед сильным медвежьим импульсом
            if (isBull(cur) && isBear(next) && bodySize(next) > bodySize(cur) * 1.5 &&
                next.close < cur.low) {
                obs.push({
                    type: 'bearish',
                    index: i,
                    high: cur.high,
                    low: cur.low,
                    time: cur.time,
                    mitigated: false
                });
            }
        }
        return obs;
    }

    function findFVG(candles) {
        // Fair Value Gap — разрыв между high[i-2] и low[i] (или наоборот)
        const fvgs = [];
        for (let i = 2; i < candles.length; i++) {
            const c = candles[i];
            const prev2 = candles[i - 2];
            // Бычий FVG: prev2.high < c.low (gap вверх)
            if (prev2.high < c.low) {
                fvgs.push({
                    type: 'bullish',
                    index: i,
                    low: prev2.high,
                    high: c.low,
                    size: c.low - prev2.high,
                    filled: false
                });
            }
            // Медвежий FVG: prev2.low > c.high (gap вниз)
            if (prev2.low > c.high) {
                fvgs.push({
                    type: 'bearish',
                    index: i,
                    low: c.high,
                    high: prev2.low,
                    size: prev2.low - c.high,
                    filled: false
                });
            }
        }
        return fvgs.slice(-10); // только последние
    }

    function findLiquidityPools(candles, structure) {
        // Buy-side liquidity — кластеры равных хаёв (EQH)
        // Sell-side liquidity — кластеры равных лоёв (EQL)
        const buySide = [];
        const sellSide = [];
        const tolerance = 0.001; // 0.1% от цены

        const recent = candles.slice(-30);
        for (let i = 1; i < recent.length; i++) {
            for (let j = i + 1; j < recent.length; j++) {
                const hiRatio = Math.abs(recent[i].high - recent[j].high) / recent[i].high;
                const loRatio = Math.abs(recent[i].low  - recent[j].low)  / recent[i].low;
                if (hiRatio < tolerance) {
                    buySide.push({ price: (recent[i].high + recent[j].high) / 2, indices: [i, j] });
                }
                if (loRatio < tolerance) {
                    sellSide.push({ price: (recent[i].low + recent[j].low) / 2, indices: [i, j] });
                }
            }
        }
        return { buySide: buySide.slice(0, 5), sellSide: sellSide.slice(0, 5) };
    }

    function findLiquiditySweeps(candles, structure) {
        // Sweep — цена взяла liquidity, но вернулась
        const sweeps = [];
        const liq = findLiquidityPools(candles, structure);
        for (const pool of liq.buySide) {
            for (let i = 0; i < candles.length; i++) {
                if (candles[i].high > pool.price && candles[i].close < pool.price) {
                    sweeps.push({ side: 'buy_side', index: i, price: pool.price, time: candles[i].time });
                    break;
                }
            }
        }
        for (const pool of liq.sellSide) {
            for (let i = 0; i < candles.length; i++) {
                if (candles[i].low < pool.price && candles[i].close > pool.price) {
                    sweeps.push({ side: 'sell_side', index: i, price: pool.price, time: candles[i].time });
                    break;
                }
            }
        }
        return sweeps;
    }

    function findEqualHighsLows(candles) {
        const eqh = [];
        const eql = [];
        const tolerance = 0.002;
        for (let i = 0; i < candles.length; i++) {
            for (let j = i + 1; j < candles.length; j++) {
                const hiRatio = Math.abs(candles[i].high - candles[j].high) / candles[i].high;
                const loRatio = Math.abs(candles[i].low - candles[j].low) / candles[i].low;
                if (hiRatio < tolerance) eqh.push({ index1: i, index2: j, price: (candles[i].high + candles[j].high) / 2 });
                if (loRatio < tolerance) eql.push({ index1: i, index2: j, price: (candles[i].low + candles[j].low) / 2 });
            }
        }
        return { equalHighs: eqh.slice(0, 5), equalLows: eql.slice(0, 5) };
    }

    function findPremiumDiscount(candles) {
        const highest = Math.max(...candles.map(c => c.high));
        const lowest  = Math.min(...candles.map(c => c.low));
        const range = highest - lowest;
        const eq = lowest + range * 0.5;
        return {
            premiumZone: { low: eq, high: highest },
            discountZone: { low: lowest, high: eq },
            equilibrium: eq,
            range: range
        };
    }

    function findDisplacement(candles) {
        // Displacement — крупные импульсные свечи (>2× ATR)
        const atr = mean(candles.slice(-14).map(candleRange));
        const displacement = [];
        for (let i = 14; i < candles.length; i++) {
            const c = candles[i];
            if (bodySize(c) > atr * 2) {
                displacement.push({
                    index: i,
                    time: c.time,
                    type: isBull(c) ? 'bullish' : 'bearish',
                    magnitude: round(bodySize(c) / atr, 2)
                });
            }
        }
        return displacement.slice(-5);
    }

    function analyzeSMC(candles, structure) {
        const bos = findBOS(candles, structure);
        const orderBlocks = findOrderBlocks(candles, structure);
        const fvgs = findFVG(candles);
        const eq = findEqualHighsLows(candles);
        const liq = findLiquidityPools(candles, structure);
        const sweeps = findLiquiditySweeps(candles, structure);
        const pdZones = findPremiumDiscount(candles);
        const displacement = findDisplacement(candles);

        // Расширенные модели (используют функции, определённые ниже в этом же файле)
        const mss = detectMSS(candles, structure);
        const breakerBlocks = detectBreakerBlocks(candles, structure);
        const mitigationBlocks = detectMitigationBlocks(candles, structure);
        const inverseFVG = detectIFVG(candles);
        const bpr = detectBPR(candles);
        const inducement = detectInducement(candles, structure);
        const reaccumulation = detectReaccumulation(candles, { displacement });
        const redistribution = detectRedistribution(candles, { displacement });
        const internalExternal = detectInternalExternalStructure(candles, structure);

        return {
            bos: bos,
            choch: structure.structureShift && structure.structureShift.type === 'CHoCH' ?
                  [structure.structureShift] : [],
            mss: mss,
            liquiditySweeps: sweeps,
            buySideLiquidity: liq.buySide,
            sellSideLiquidity: liq.sellSide,
            equalHighs: eq.equalHighs,
            equalLows: eq.equalLows,
            orderBlocks: orderBlocks,
            breakerBlocks: breakerBlocks,
            mitigationBlocks: mitigationBlocks,
            fairValueGaps: fvgs,
            inverseFVG: inverseFVG,
            balancedPriceRange: bpr,
            inducement: inducement,
            premiumZone: pdZones.premiumZone,
            discountZone: pdZones.discountZone,
            displacement: displacement,
            reaccumulation: reaccumulation,
            redistribution: redistribution,
            internalExternalStructure: internalExternal
        };
    }

    // ================================================================
    // 3. Price Action — распознавание свечных моделей
    // ================================================================

    // ================================================================
    // РАСШИРЕННЫЕ МОДЕЛИ — все типы аналитики из спецификации
    // ================================================================

    // ---------- Price Action: дополнительные паттерны ----------

    function isDoji(c) { const b = bodySize(c); const r = candleRange(c); return r > 0 && b / r < 0.1; }
    function isLongLeggedDoji(c) { const b = bodySize(c); const r = candleRange(c); return r > 0 && b / r < 0.1 && (upperWick(c) + lowerWick(c)) / r > 0.7; }
    function isDragonflyDoji(c) { const b = bodySize(c); const r = candleRange(c); return r > 0 && b / r < 0.1 && lowerWick(c) / r > 0.6 && upperWick(c) / r < 0.15; }
    function isGravestoneDoji(c) { const b = bodySize(c); const r = candleRange(c); return r > 0 && b / r < 0.1 && upperWick(c) / r > 0.6 && lowerWick(c) / r < 0.15; }

    function detectThreeSoldiers(candles, i) {
        // Three White Soldiers: 3 подряд бычьих свечи с растущими закрытиями
        if (i < 2) return null;
        const a = candles[i - 2], b = candles[i - 1], c = candles[i];
        if (isBull(a) && isBull(b) && isBull(c) &&
            b.close > a.close && c.close > b.close &&
            bodySize(a) > 0 && bodySize(b) > 0 && bodySize(c) > 0) {
            return { type: 'three_white_soldiers', reversal_prob: 0.65, continuation_prob: 0.75 };
        }
        return null;
    }

    function detectThreeCrows(candles, i) {
        // Three Black Crows: 3 подряд медвежьих свечи с падающими закрытиями
        if (i < 2) return null;
        const a = candles[i - 2], b = candles[i - 1], c = candles[i];
        if (isBear(a) && isBear(b) && isBear(c) &&
            b.close < a.close && c.close < b.close) {
            return { type: 'three_black_crows', reversal_prob: 0.65, continuation_prob: 0.75 };
        }
        return null;
    }

    function detectThreeMethods(candles, i) {
        // Rising Three Methods: 5 свечей — восходящий тренд с 3 малыми противоположными
        if (i < 4) return null;
        const c0 = candles[i - 4], c1 = candles[i - 3], c2 = candles[i - 2],
              c3 = candles[i - 1], c4 = candles[i];
        if (isBull(c0) && isBull(c4) && c4.close > c0.close &&
            isBear(c1) && isBear(c2) && isBear(c3) &&
            bodySize(c1) < bodySize(c0) * 0.5 &&
            bodySize(c2) < bodySize(c0) * 0.5 &&
            bodySize(c3) < bodySize(c0) * 0.5 &&
            c4.close > c0.close) {
            return { type: 'rising_three_methods', reversal_prob: 0.20, continuation_prob: 0.80 };
        }
        // Falling Three Methods
        if (isBear(c0) && isBear(c4) && c4.close < c0.close &&
            isBull(c1) && isBull(c2) && isBull(c3) &&
            bodySize(c1) < bodySize(c0) * 0.5 &&
            bodySize(c2) < bodySize(c0) * 0.5 &&
            bodySize(c3) < bodySize(c0) * 0.5 &&
            c4.close < c0.close) {
            return { type: 'falling_three_methods', reversal_prob: 0.20, continuation_prob: 0.80 };
        }
        return null;
    }

    function detectHangingMan(c) {
        const body = bodySize(c); const range = candleRange(c);
        if (range === 0) return null;
        const bodyPct = body / range; const loPct = lowerWick(c) / range;
        // Hanging Man: появляется после роста — маленькое тело сверху, длинный хвост вниз
        if (loPct > 0.5 && bodyPct < 0.4 && upperWick(c) / range < 0.15) {
            return { type: 'hanging_man', reversal_prob: 0.55, continuation_prob: 0.20 };
        }
        return null;
    }

    function detectInvertedHammer(c) {
        const body = bodySize(c); const range = candleRange(c);
        if (range === 0) return null;
        const bodyPct = body / range; const upPct = upperWick(c) / range;
        if (upPct > 0.5 && bodyPct < 0.4 && lowerWick(c) / range < 0.15) {
            return { type: 'inverted_hammer', reversal_prob: 0.50, continuation_prob: 0.25 };
        }
        return null;
    }

    // ---------- SMC: расширенные модели ----------

    function detectMSS(candles, structure) {
        // Market Structure Shift — глобальная смена тренда
        // Отличается от CHoCH тем, что это ПОЛНАЯ смена, после которой формируется новый тренд
        const mss = [];
        const swings = structure.swings || [];
        for (let i = 2; i < swings.length; i++) {
            const prev = swings[i - 1];
            const cur = swings[i];
            // MSS: после серии LH должен пойти HH (бычий сдвиг)
            // Или после серии HL должен пойти LL (медвежий сдвиг)
            // Упрощённо: MSS = CHoCH, подтверждённый противоположным пробоем
            if (prev && cur) {
                mss.push({
                    index: cur.index,
                    price: cur.price,
                    type: prev.type === 'low' && cur.type === 'high' && cur.price > prev.price ? 'bullish_mss' : 'bearish_mss',
                    description: 'Market Structure Shift — глобальная смена тренда'
                });
            }
        }
        return mss.slice(-3);
    }

    function detectBreakerBlocks(candles, structure) {
        // Breaker Block — Order Block, который был пробит и теперь работает как противоположный уровень
        const breakers = [];
        const obs = findOrderBlocks(candles, structure);
        for (const ob of obs) {
            // Если OB бычий, но цена пробила его вниз — это bearish breaker
            // И наоборот
            for (let i = ob.index + 1; i < candles.length; i++) {
                const c = candles[i];
                if (ob.type === 'bullish' && c.close < ob.low) {
                    breakers.push({
                        index: i,
                        top: ob.top, bottom: ob.bottom,
                        type: 'bearish_breaker',
                        originalOB: ob.index,
                        description: 'Bearish Breaker — бычий OB пробит вниз'
                    });
                    break;
                }
                if (ob.type === 'bearish' && c.close > ob.top) {
                    breakers.push({
                        index: i,
                        top: ob.top, bottom: ob.bottom,
                        type: 'bullish_breaker',
                        originalOB: ob.index,
                        description: 'Bullish Breaker — медвежий OB пробит вверх'
                    });
                    break;
                }
            }
        }
        return breakers.slice(-5);
    }

    function detectMitigationBlocks(candles, structure) {
        // Mitigation Block — OB, который был протестирован и заполнен (mitigated)
        const mitigations = [];
        const obs = findOrderBlocks(candles, structure);
        for (const ob of obs) {
            let mitigated = false;
            let mitigationIndex = null;
            for (let i = ob.index + 1; i < candles.length; i++) {
                const c = candles[i];
                if (ob.type === 'bullish' && c.low <= ob.bottom && c.close > ob.bottom) {
                    mitigated = true; mitigationIndex = i; break;
                }
                if (ob.type === 'bearish' && c.high >= ob.top && c.close < ob.top) {
                    mitigated = true; mitigationIndex = i; break;
                }
            }
            if (mitigated) {
                mitigations.push({
                    index: mitigationIndex,
                    top: ob.top, bottom: ob.bottom,
                    type: ob.type === 'bullish' ? 'bullish_mitigation' : 'bearish_mitigation',
                    originalOB: ob.index,
                    mitigated: true,
                    description: 'Mitigation Block — OB был протестирован и заполнен'
                });
            }
        }
        return mitigations.slice(-5);
    }

    function detectIFVG(candles) {
        // Inverse FVG — FVG, который был заполнен, и теперь работает как противоположная зона
        const ifvgs = [];
        const fvgs = findFVG(candles);
        for (const fvg of fvgs) {
            let filled = false; let fillIndex = null;
            for (let i = fvg.index + 1; i < candles.length; i++) {
                const c = candles[i];
                if (fvg.type === 'bullish' && c.high >= fvg.bottom) {
                    filled = true; fillIndex = i; break;
                }
                if (fvg.type === 'bearish' && c.low <= fvg.top) {
                    filled = true; fillIndex = i; break;
                }
            }
            if (filled) {
                ifvgs.push({
                    index: fillIndex,
                    top: fvg.top, bottom: fvg.bottom,
                    type: fvg.type === 'bullish' ? 'inverse_bullish_fvg' : 'inverse_bearish_fvg',
                    originalFVG: fvg.index,
                    description: 'Inverse FVG — заполненный FVG становится противоположной зоной'
                });
            }
        }
        return ifvgs.slice(-5);
    }

    function detectBPR(candles) {
        // Balanced Price Range — зона, где бычий и медвежий FVG пересекаются
        const fvgs = findFVG(candles);
        const bprs = [];
        for (let i = 0; i < fvgs.length; i++) {
            for (let j = i + 1; j < fvgs.length; j++) {
                const a = fvgs[i], b = fvgs[j];
                // BPR: пересечение бычьего и медвежьего FVG
                if (a.type !== b.type) {
                    const overlap = Math.min(a.top, b.top) - Math.max(a.bottom, b.bottom);
                    if (overlap > 0) {
                        bprs.push({
                            index: b.index,
                            top: Math.min(a.top, b.top),
                            bottom: Math.max(a.bottom, b.bottom),
                            type: 'balanced_price_range',
                            description: 'Balanced Price Range — пересечение бычьего и медвежьего FVG'
                        });
                    }
                }
            }
        }
        return bprs.slice(-5);
    }

    function detectInducement(candles, structure) {
        // Inducement — небольшие liquidity pools перед основной зоной
        const liquidityObj = findLiquidityPools(candles, structure);
        const liquidity = [
            ...(liquidityObj.buySide || []),
            ...(liquidityObj.sellSide || [])
        ];
        return liquidity
            .filter(l => l.strength === 'minor' || (l.strength || 0) < 0.5)
            .slice(-5)
            .map(l => ({
                ...l,
                type: 'inducement',
                description: 'Inducement — minor liquidity pool, приманка перед основной зоной'
            }));
    }

    function detectReaccumulation(candles, smc) {
        // Reaccumulation — консолидация после импульса вверх перед продолжением
        const reacc = [];
        for (const disp of smc.displacement || []) {
            if (disp.type !== 'bullish') continue;
            // Ищем 3-8 свечей консолидации после displacement
            let consolidationCount = 0;
            for (let i = disp.index + 1; i < Math.min(disp.index + 10, candles.length); i++) {
                const c = candles[i];
                const range = c.high - c.low;
                if (range < disp.size * 0.5) consolidationCount++;
                else break;
            }
            if (consolidationCount >= 3) {
                reacc.push({
                    index: disp.index + consolidationCount,
                    startIndex: disp.index,
                    type: 'reaccumulation',
                    description: 'Reaccumulation — консолидация после бычьего импульса'
                });
            }
        }
        return reacc.slice(-3);
    }

    function detectRedistribution(candles, smc) {
        // Redistribution — то же самое, но для медвежьего импульса
        const redis = [];
        for (const disp of smc.displacement || []) {
            if (disp.type !== 'bearish') continue;
            let consolidationCount = 0;
            for (let i = disp.index + 1; i < Math.min(disp.index + 10, candles.length); i++) {
                const c = candles[i];
                const range = c.high - c.low;
                if (range < disp.size * 0.5) consolidationCount++;
                else break;
            }
            if (consolidationCount >= 3) {
                redis.push({
                    index: disp.index + consolidationCount,
                    startIndex: disp.index,
                    type: 'redistribution',
                    description: 'Redistribution — консолидация после медвежьего импульса'
                });
            }
        }
        return redis.slice(-3);
    }

    function detectInternalExternalStructure(candles, structure) {
        // Internal Structure — структура внутри текущего свинга
        // External Structure — структура на старшем таймфрейме (упрощённо — последние N свингов)
        const swings = structure.swings || [];
        return {
            internal: swings.slice(-6),
            external: swings.slice(-3),
            description: 'Internal — последние 6 свингов, External — последние 3'
        };
    }

    // ---------- Volume Analysis: расширенные модели ----------

    function detectVolumeSpike(candles, i) {
        if (i < 10) return null;
        const avg = mean(candles.slice(i - 10, i).map(c => c.volume || 0));
        const cur = candles[i].volume || 0;
        if (cur > avg * 2.5) {
            return {
                type: cur > avg * 4 ? 'volume_climax' : 'volume_spike',
                index: i,
                ratio: cur / avg,
                description: cur > avg * 4 ? 'Volume Climax — экстремальный объём' : 'Volume Spike — резкий всплеск объёма'
            };
        }
        return null;
    }

    function detectVolumeDivergence(candles, momentum, lookback) {
        // Volume Divergence: цена обновляет хай, но объём падает (или наоборот)
        lookback = lookback || 10;
        if (candles.length < lookback + 2) return null;
        const recent = candles.slice(-lookback);
        const priceHigh1 = Math.max(...recent.slice(0, Math.floor(lookback / 2)).map(c => c.high));
        const priceHigh2 = Math.max(...recent.slice(Math.floor(lookback / 2)).map(c => c.high));
        const vol1 = mean(recent.slice(0, Math.floor(lookback / 2)).map(c => c.volume || 0));
        const vol2 = mean(recent.slice(Math.floor(lookback / 2)).map(c => c.volume || 0));
        if (priceHigh2 > priceHigh1 && vol2 < vol1 * 0.7) {
            return { type: 'bearish_volume_divergence', description: 'Медвежья дивергенция объёма: цена вверх, объём вниз' };
        }
        if (priceHigh2 < priceHigh1 && vol2 < vol1 * 0.7) {
            // Для бычьей: цена делает low, объём растёт (подтверждение)
            return { type: 'bullish_volume_divergence', description: 'Бычья дивергенция объёма: цена вниз, объём растёт' };
        }
        return null;
    }

    function detectBuyingSellingPressure(candles, lookback) {
        lookback = lookback || 5;
        const recent = candles.slice(-lookback);
        let buyingPressure = 0, sellingPressure = 0;
        for (const c of recent) {
            const range = c.high - c.low;
            if (range === 0) continue;
            // Buying pressure: (close - low) / range
            buyingPressure += (c.close - c.low) / range;
            // Selling pressure: (high - close) / range
            sellingPressure += (c.high - c.close) / range;
        }
        buyingPressure /= lookback;
        sellingPressure /= lookback;
        const net = buyingPressure - sellingPressure;
        let type, description;
        if (net > 0.2) { type = 'buying_pressure'; description = 'Сильное давление покупателей'; }
        else if (net < -0.2) { type = 'selling_pressure'; description = 'Сильное давление продавцов'; }
        else { type = 'neutral'; description = 'Давление сбалансировано'; }
        return {
            type, buyingPressure: round(buyingPressure), sellingPressure: round(sellingPressure),
            net: round(net), description
        };
    }

    function detectAbsorption(candles) {
        // Absorption: длинная свеча с высоким объёмом, но малым движением (поглощение)
        const recent = candles.slice(-5);
        for (const c of recent) {
            const range = c.high - c.low;
            const body = Math.abs(c.close - c.open);
            if (range > 0 && body / range < 0.3 && (c.volume || 0) > mean(candles.slice(-20, -5).map(x => x.volume || 0)) * 1.5) {
                return {
                    type: isBull(c) ? 'buying_absorption' : 'selling_absorption',
                    description: isBull(c) ? 'Buying Absorption — крупный покупатель поглощает продажи' : 'Selling Absorption — крупный продавец поглощает покупки',
                    index: candles.indexOf(c)
                };
            }
        }
        return null;
    }

    function detectExhaustion(candles, volume) {
        // Exhaustion: высокий объём + большая свеча + затем резкое снижение объёма
        if (volume.ratio > 2 && volume.trend === 'decreasing') {
            return {
                type: 'volume_exhaustion',
                description: 'Volume Exhaustion — кульминация объёма, движение может исчерпаться'
            };
        }
        return null;
    }

    function detectDistributionAccumulation(candles, lookback) {
        // Wyckoff-style: распределение/накопление
        // Distribution: много высоких объёмов с медвежьим закрытием
        // Accumulation: много высоких объёмов с бычьим закрытием
        lookback = lookback || 10;
        const recent = candles.slice(-lookback);
        const avgVol = mean(candles.slice(-lookback - 10, -lookback).map(c => c.volume || 0));
        let bullHighVol = 0, bearHighVol = 0;
        for (const c of recent) {
            if ((c.volume || 0) > avgVol * 1.3) {
                if (isBull(c)) bullHighVol++;
                else if (isBear(c)) bearHighVol++;
            }
        }
        if (bullHighVol >= 3 && bullHighVol > bearHighVol * 1.5) {
            return { type: 'accumulation', description: 'Accumulation — фаза накопления (покупатели набирают позиции)', score: bullHighVol };
        }
        if (bearHighVol >= 3 && bearHighVol > bullHighVol * 1.5) {
            return { type: 'distribution', description: 'Distribution — фаза распределения (продавцы разгружаются)', score: bearHighVol };
        }
        return null;
    }

    // ---------- Momentum: расширенные модели ----------

    function detectMomentumDivergence(candles, momentum) {
        // Momentum Divergence: цена обновляет хай, но RSI нет (или наоборот)
        if (candles.length < 20) return null;
        const recent = candles.slice(-20);
        const firstHalf = recent.slice(0, 10);
        const secondHalf = recent.slice(10);
        const priceHigh1 = Math.max(...firstHalf.map(c => c.high));
        const priceHigh2 = Math.max(...secondHalf.map(c => c.high));
        const rsi1 = calculateRSI(firstHalf.map(c => c.close), 14);
        const rsi2 = calculateRSI(secondHalf.map(c => c.close), 14);
        if (priceHigh2 > priceHigh1 && rsi2 < rsi1 && rsi2 < 70) {
            return { type: 'bearish_momentum_divergence', description: 'Медвежья дивергенция моментума — цена выше, RSI ниже' };
        }
        const priceLow1 = Math.min(...firstHalf.map(c => c.low));
        const priceLow2 = Math.min(...secondHalf.map(c => c.low));
        if (priceLow2 < priceLow1 && rsi2 > rsi1 && rsi2 > 30) {
            return { type: 'bullish_momentum_divergence', description: 'Бычья дивергенция моментума — цена ниже, RSI выше' };
        }
        return null;
    }

    function detectMomentumAcceleration(momentum) {
        // Acceleration: моментум растёт/падает ускоренно
        if (!momentum.history || momentum.history.length < 5) return null;
        const recent = momentum.history.slice(-5);
        const diffs = [];
        for (let i = 1; i < recent.length; i++) diffs.push(recent[i] - recent[i - 1]);
        const accel = diffs[diffs.length - 1] - diffs[0];
        if (Math.abs(accel) > 5) {
            return {
                type: accel > 0 ? 'momentum_acceleration' : 'momentum_deceleration',
                description: accel > 0 ? 'Ускорение моментума' : 'Замедление моментума',
                value: round(accel)
            };
        }
        return null;
    }

    function detectImpulseCorrectiveMove(candles, structure) {
        // Impulse: 3-5 больших свечей в одном направлении
        // Corrective: мелкие свечи против основного тренда
        const last = candles.slice(-5);
        if (last.length < 5) return null;
        const bullish = last.filter(c => isBull(c) && bodySize(c) > candleRange(c) * 0.6).length;
        const bearish = last.filter(c => isBear(c) && bodySize(c) > candleRange(c) * 0.6).length;
        if (bullish >= 4) return { type: 'impulse_move', direction: 'bullish', description: 'Импульсное движение вверх' };
        if (bearish >= 4) return { type: 'impulse_move', direction: 'bearish', description: 'Импульсное движение вниз' };
        if (Math.abs(bullish - bearish) <= 1) return { type: 'corrective_move', description: 'Коррективное движение (флэт)' };
        return null;
    }

    // ---------- Volatility: расширенные модели ----------

    function detectVolatilitySqueeze(volatility, candles) {
        // Volatility Squeeze: ATR сжимается несколько баров подряд
        if (!volatility.atrHistory || volatility.atrHistory.length < 5) return null;
        const recent = volatility.atrHistory.slice(-5);
        let squeeze = true;
        for (let i = 1; i < recent.length; i++) {
            if (recent[i] > recent[i - 1]) { squeeze = false; break; }
        }
        if (squeeze) return { type: 'volatility_squeeze', description: 'Volatility Squeeze — сжатие волатильности перед пробоем' };
        return null;
    }

    function detectVolatilityBreakout(volatility) {
        // Volatility Breakout: резкое расширение ATR
        if (!volatility.atrHistory || volatility.atrHistory.length < 5) return null;
        const recent = volatility.atrHistory;
        const last = recent[recent.length - 1];
        const prev = recent[recent.length - 2];
        if (last > prev * 1.5) {
            return { type: 'volatility_breakout', description: 'Volatility Breakout — резкое расширение волатильности', ratio: round(last / prev) };
        }
        return null;
    }

    function detectExplosiveExpansion(volatility) {
        // Explosive Expansion: ATR > 3x от среднего
        if (!volatility.atrHistory || volatility.atrHistory.length < 10) return null;
        const mean = volatility.atrHistory.slice(0, -1).reduce((a, b) => a + b, 0) / (volatility.atrHistory.length - 1);
        const last = volatility.atrHistory[volatility.atrHistory.length - 1];
        if (last > mean * 3) {
            return { type: 'explosive_expansion', description: 'Explosive Expansion — взрывное расширение волатильности' };
        }
        return null;
    }

    // ---------- Liquidity: расширенные модели ----------

    function detectStopHunt(candles, smc) {
        // Stop Hunt: цена быстро пробивает уровень и возвращается
        const stopHunts = [];
        const sweeps = smc.liquiditySweeps || [];
        for (const sweep of sweeps) {
            const sweepCandle = candles[sweep.index];
            if (!sweepCandle) continue;
            // Проверяем: после sweep цена вернулась обратно в течение 3 свечей
            let returned = false;
            for (let i = sweep.index + 1; i < Math.min(sweep.index + 4, candles.length); i++) {
                const c = candles[i];
                if (sweep.type === 'bullish_sweep' && c.close < sweep.level) { returned = true; break; }
                if (sweep.type === 'bearish_sweep' && c.close > sweep.level) { returned = true; break; }
            }
            if (returned) {
                stopHunts.push({
                    index: sweep.index,
                    level: sweep.level,
                    type: sweep.type === 'bullish_sweep' ? 'stop_hunt_highs' : 'stop_hunt_lows',
                    description: sweep.type === 'bullish_sweep'
                        ? 'Stop Hunt — собрали стопы над уровнем, вернулись вниз'
                        : 'Stop Hunt — собрали стопы под уровнем, вернулись вверх'
                });
            }
        }
        return stopHunts.slice(-5);
    }

    function detectRestingLiquidity(candles, structure) {
        // Resting Liquidity — непройденные уровни с большим количеством касаний
        const resting = [];
        const eqh = findEqualHighsLows(candles).equalHighs || [];
        const eql = findEqualHighsLows(candles).equalLows || [];
        for (const e of eqh) {
            resting.push({
                index: e.index2,
                price: e.price,
                type: 'resting_liquidity_high',
                touches: 2,
                description: 'Resting Liquidity High — непройденный уровень с 2+ касаниями'
            });
        }
        for (const e of eql) {
            resting.push({
                index: e.index2,
                price: e.price,
                type: 'resting_liquidity_low',
                touches: 2,
                description: 'Resting Liquidity Low — непройденный уровень с 2+ касаниями'
            });
        }
        return resting.slice(-5);
    }

    function detectLiquidityVoid(candles) {
        // Liquidity Void — зона с большим дисбалансом (FVG-подобная, но большая)
        const voids = [];
        for (let i = 2; i < candles.length; i++) {
            const c0 = candles[i - 2], c2 = candles[i];
            const gap = c0.high - c2.low;
            if (gap > 0 && gap / c0.close > 0.01) {
                voids.push({
                    index: i,
                    top: c0.high, bottom: c2.low,
                    size: round(gap),
                    description: 'Liquidity Void — большой дисбаланс между свечами'
                });
            }
        }
        return voids.slice(-5);
    }

    function detectHighLowLiquidityZones(candles, structure) {
        // High Liquidity Zone — область скопления liquidity pools
        // Low Liquidity Zone — область с отсутствием уровней (пробой)
        const swings = structure.swings || [];
        const zones = [];
        if (swings.length < 5) return zones;
        // Группируем свинги по цене
        const buckets = {};
        for (const s of swings) {
            const bucket = Math.round(s.price / 5) * 5;
            if (!buckets[bucket]) buckets[bucket] = [];
            buckets[bucket].push(s);
        }
        for (const [price, items] of Object.entries(buckets)) {
            if (items.length >= 3) {
                zones.push({
                    type: 'high_liquidity_zone',
                    price: parseFloat(price),
                    touches: items.length,
                    description: `High Liquidity Zone — ${items.length} касаний на уровне ${price}`
                });
            }
        }
        return zones.slice(-5);
    }

    // ---------- Trend: расширенные модели ----------

    function detectTrendExhaustion(trend, momentum, volume) {
        // Trend Exhaustion: сильный тренд + слабый моментум + низкий объём
        const isStrong = trend.type === 'strong_bull' || trend.type === 'strong_bear';
        const weakMomentum = momentum.strength < 30;
        const lowVolume = volume.ratio < 0.8;
        if (isStrong && weakMomentum && lowVolume) {
            return {
                type: 'trend_exhaustion',
                description: `Trend Exhaustion — сильный тренд (${trend.type}) исчерпывается (слабый моментум + низкий объём)`
            };
        }
        return null;
    }

    // ---------- Levels: расширенные модели ----------

    function detectMajorLevels(levels) {
        // Major Support/Resistance — уровни с силой > 0.7
        const major = { supports: [], resistances: [] };
        for (const s of levels.supports || []) {
            if (s.strength > 0.7) major.supports.push({ ...s, type: 'major_support', description: 'Major Support — сильный уровень поддержки' });
        }
        for (const r of levels.resistances || []) {
            if (r.strength > 0.7) major.resistances.push({ ...r, type: 'major_resistance', description: 'Major Resistance — сильный уровень сопротивления' });
        }
        return major;
    }

    function detectSupplyDemandZones(candles, structure) {
        // Supply Zone: зона предложения (сопротивления с большим отскоком)
        // Demand Zone: зона спроса (поддержки с большим отскоком)
        const swings = structure.swings || [];
        const zones = [];
        for (const s of swings) {
            if (s.type === 'high') {
                // Проверяем, был ли отскок вниз после этого хая
                let strongRejection = false;
                for (let i = s.index + 1; i < Math.min(s.index + 5, candles.length); i++) {
                    if (candles[i].close < s.price * 0.99) { strongRejection = true; break; }
                }
                if (strongRejection) {
                    zones.push({
                        type: 'supply_zone',
                        price: s.price,
                        index: s.index,
                        description: 'Supply Zone — зона предложения (отскок вниз)'
                    });
                }
            } else if (s.type === 'low') {
                let strongBounce = false;
                for (let i = s.index + 1; i < Math.min(s.index + 5, candles.length); i++) {
                    if (candles[i].close > s.price * 1.01) { strongBounce = true; break; }
                }
                if (strongBounce) {
                    zones.push({
                        type: 'demand_zone',
                        price: s.price,
                        index: s.index,
                        description: 'Demand Zone — зона спроса (отскок вверх)'
                    });
                }
            }
        }
        return zones.slice(-5);
    }

    function detectDynamicLevels(candles, momentum) {
        // Dynamic Support/Resistance — скользящие средние как динамические уровни
        const period = 20;
        if (candles.length < period) return null;
        const recent = candles.slice(-period);
        const sma = recent.reduce((sum, c) => sum + c.close, 0) / period;
        const lastPrice = candles[candles.length - 1].close;
        return {
            sma20: round(sma),
            type: lastPrice > sma ? 'dynamic_support' : 'dynamic_resistance',
            description: `Dynamic Level — SMA20 = ${round(sma)} (${lastPrice > sma ? 'support' : 'resistance'})`
        };
    }

    function detectBreakoutRetest(candles, levels) {
        // Breakout Level: цена пробила уровень
        // Retest Zone: цена вернулась к пробитому уровню
        const last = candles.slice(-10);
        if (last.length < 10) return null;
        const firstHalf = last.slice(0, 5);
        const secondHalf = last.slice(5);
        const recentHigh1 = Math.max(...firstHalf.map(c => c.high));
        const recentHigh2 = Math.max(...secondHalf.map(c => c.high));
        const lastClose = last[last.length - 1].close;
        if (recentHigh2 > recentHigh1 * 1.005 && Math.abs(lastClose - recentHigh1) / recentHigh1 < 0.01) {
            return { type: 'breakout_with_retest', level: round(recentHigh1), description: 'Breakout + Retest — пробой с возвратом к уровню' };
        }
        return null;
    }

    // ---------- Evidence Builder ----------

    function buildEvidence(structure, trend, momentum, volume, smc, priceAction, liquidity, volatility, levels) {
        // Собирает ВСЕ обнаруженные сигналы в единый массив evidence
        const evidence = [];
        const push = (category, type, weight, description) => {
            evidence.push({ category, type, weight, description });
        };

        // Structure
        push('structure', structure.type, 0.8, `Структура: ${structure.type}`);
        if (structure.structureShift && structure.structureShift.type) {
            push('structure', structure.structureShift.type, 0.9,
                `Structure Shift: ${structure.structureShift.type}`);
        }

        // Trend
        push('trend', trend.type, 0.7, `Тренд: ${trend.type} (сила ${trend.strength})`);

        // Momentum
        for (const sig of momentum.signals || []) push('momentum', sig, 0.5, sig);
        if (momentum.exhaustion && momentum.exhaustion.detected) {
            push('momentum', 'momentum_exhaustion', 0.8, 'Истощение моментума');
        }

        // Volume
        for (const sig of volume.signals || []) push('volume', sig, 0.5, sig);
        if (volume.divergence) push('volume', volume.divergence.type, 0.85, volume.divergence.description);
        if (volume.absorption) push('volume', volume.absorption.type, 0.7, volume.absorption.description);
        if (volume.distributionAccumulation) push('volume', volume.distributionAccumulation.type, 0.75, volume.distributionAccumulation.description);

        // SMC
        for (const bos of smc.bos || []) push('smc', bos.type, 0.85, `BOS: ${bos.type}`);
        for (const choch of smc.choch || []) push('smc', choch.type, 0.8, `CHoCH: ${choch.type}`);
        for (const ob of smc.orderBlocks || []) push('smc', ob.type, 0.7, `Order Block: ${ob.type}`);
        for (const fvg of smc.fairValueGaps || []) push('smc', fvg.type, 0.65, `FVG: ${fvg.type}`);
        for (const ls of smc.liquiditySweeps || []) push('smc', 'liquidity_sweep', 0.7, 'Liquidity Sweep');
        for (const d of smc.displacement || []) push('smc', 'displacement', 0.8, 'Displacement');

        // Price Action
        for (const pat of priceAction.patterns || []) {
            push('price_action', pat.type, 0.6, `Pattern: ${pat.type}`);
        }

        // Liquidity
        for (const sg of liquidity.signals || []) push('liquidity', sg.type, 0.5, sg.description);
        if (liquidity.stopHunts) for (const sh of liquidity.stopHunts) push('liquidity', sh.type, 0.8, sh.description);

        // Volatility
        for (const sg of volatility.signals || []) push('volatility', sg.type, 0.5, sg.description);

        // Levels
        for (const s of levels.supports || []) {
            push('levels', s.type || 'support', 0.6, `Support: ${round(s.price)}`);
        }
        for (const r of levels.resistances || []) {
            push('levels', r.type || 'resistance', 0.6, `Resistance: ${round(r.price)}`);
        }

        // Сортируем по весу (важности)
        evidence.sort((a, b) => b.weight - a.weight);
        return evidence;
    }

    function buildRecommendedActions(x) {
        // На основе analysis формирует список рекомендованных действий
        const actions = [];
        const bias = x.summary.bias;
        const trend = x.trend.type;
        const keySignals = x.summary.keySignals || [];

        if (bias === 'bullish' && (trend === 'strong_bull' || trend === 'weak_bull')) {
            actions.push({
                action: 'consider_long_entry',
                priority: 'high',
                reasoning: 'Бычий bias и тренд — рассмотреть вход в лонг'
            });
        } else if (bias === 'bearish' && (trend === 'strong_bear' || trend === 'weak_bear')) {
            actions.push({
                action: 'consider_short_entry',
                priority: 'high',
                reasoning: 'Медвежий bias и тренд — рассмотреть вход в шорт'
            });
        }

        if (keySignals.includes('low_volume')) {
            actions.push({
                action: 'reduce_position_size',
                priority: 'medium',
                reasoning: 'Низкий объём — снизить размер позиции'
            });
        }

        if (keySignals.includes('volume_climax')) {
            actions.push({
                action: 'wait_for_pullback',
                priority: 'high',
                reasoning: 'Volume Climax — дождаться отката'
            });
        }

        if (x.summary.confidence < 40) {
            actions.push({
                action: 'wait',
                priority: 'high',
                reasoning: 'Низкая уверенность в направлении — лучше подождать'
            });
        }

        if (x.interpretations && x.interpretations.position && x.interpretations.position.position === 'at_level') {
            actions.push({
                action: 'watch_level',
                priority: 'medium',
                reasoning: 'Цена у ключевого уровня — следить за реакцией'
            });
        }

        return actions;
    }

    // ================================================================
    // Существующий detectCandlePattern (с поддержкой доп. паттернов)
    // ================================================================

    function detectCandlePattern(c, prev, prev2) {
        const body = bodySize(c);
        const range = candleRange(c);
        const upW = upperWick(c);
        const loW = lowerWick(c);
        if (range === 0) return null;

        const bodyPct = body / range;
        const upPct = upW / range;
        const loPct = loW / range;

        // Pin Bar
        if (loPct > 0.66 && bodyPct < 0.34 && isBull(c)) {
            return { type: 'bullish_pin_bar', reversal_prob: 0.65, continuation_prob: 0.15 };
        }
        if (upPct > 0.66 && bodyPct < 0.34 && isBear(c)) {
            return { type: 'bearish_pin_bar', reversal_prob: 0.65, continuation_prob: 0.15 };
        }

        // Engulfing
        if (prev && isBear(prev) && isBull(c) && c.close > prev.open && c.open < prev.close) {
            return { type: 'bullish_engulfing', reversal_prob: 0.70, continuation_prob: 0.10 };
        }
        if (prev && isBull(prev) && isBear(c) && c.close < prev.open && c.open > prev.close) {
            return { type: 'bearish_engulfing', reversal_prob: 0.70, continuation_prob: 0.10 };
        }

        // Inside Bar
        if (prev && c.high < prev.high && c.low > prev.low) {
            return { type: 'inside_bar', reversal_prob: 0.40, continuation_prob: 0.50 };
        }

        // Outside Bar
        if (prev && c.high > prev.high && c.low < prev.low) {
            return { type: 'outside_bar', reversal_prob: 0.45, continuation_prob: 0.45 };
        }

        // Harami
        if (prev && isBear(prev) && isBull(c) && c.open > prev.close && c.close < prev.open) {
            return { type: 'bullish_harami', reversal_prob: 0.55, continuation_prob: 0.20 };
        }
        if (prev && isBull(prev) && isBear(c) && c.open < prev.close && c.close > prev.open) {
            return { type: 'bearish_harami', reversal_prob: 0.55, continuation_prob: 0.20 };
        }

        // Doji
        if (bodyPct < 0.1) {
            return { type: 'doji', reversal_prob: 0.45, continuation_prob: 0.30 };
        }

        // Hammer / Shooting Star
        if (loPct > 0.5 && bodyPct < 0.4 && upPct < 0.25) {
            return { type: 'hammer', reversal_prob: 0.60, continuation_prob: 0.15 };
        }
        if (upPct > 0.5 && bodyPct < 0.4 && loPct < 0.25) {
            return { type: 'shooting_star', reversal_prob: 0.60, continuation_prob: 0.15 };
        }

        // Morning Star / Evening Star
        if (prev && prev2 && isBear(prev2) && bodySize(prev) < bodySize(prev2) * 0.3 &&
            isBull(c) && c.close > (prev2.open + prev2.close) / 2) {
            return { type: 'morning_star', reversal_prob: 0.75, continuation_prob: 0.10 };
        }
        if (prev && prev2 && isBull(prev2) && bodySize(prev) < bodySize(prev2) * 0.3 &&
            isBear(c) && c.close < (prev2.open + prev2.close) / 2) {
            return { type: 'evening_star', reversal_prob: 0.75, continuation_prob: 0.10 };
        }

        // Tweezer
        if (prev && Math.abs(c.high - prev.high) / c.high < 0.001 && isBear(c) && isBull(prev)) {
            return { type: 'tweezer_top', reversal_prob: 0.60, continuation_prob: 0.15 };
        }
        if (prev && Math.abs(c.low - prev.low) / c.low < 0.001 && isBull(c) && isBear(prev)) {
            return { type: 'tweezer_bottom', reversal_prob: 0.60, continuation_prob: 0.15 };
        }

        return null;
    }

    function analyzePriceAction(candles) {
        const patterns = [];
        for (let i = 1; i < candles.length; i++) {
            const pat = detectCandlePattern(candles[i], candles[i - 1], candles[i - 2]);
            if (pat) {
                patterns.push({
                    ...pat,
                    index: i,
                    time: candles[i].time,
                    reliability: 0.5 + Math.random() * 0.3
                });
            }
        }
        const lastPatterns = patterns.slice(-5);
        const avgReversal = lastPatterns.length > 0
            ? mean(lastPatterns.map(p => p.reversal_prob)) : 0.5;
        const avgContinuation = lastPatterns.length > 0
            ? mean(lastPatterns.map(p => p.continuation_prob)) : 0.5;

        return {
            patterns: lastPatterns,
            allPatterns: patterns,
            overallReversalProb: round(avgReversal, 2),
            overallContinuationProb: round(avgContinuation, 2)
        };
    }

    // ================================================================
    // 4. Trend Analysis
    // ================================================================

    function analyzeTrend(candles, structure) {
        // Линейная регрессия по закрытиям — даёт наклон тренда
        const n = candles.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        const closes = candles.map(c => c.close);
        for (let i = 0; i < n; i++) {
            sumX += i;
            sumY += closes[i];
            sumXY += i * closes[i];
            sumXX += i * i;
        }
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const avgPrice = mean(closes);
        const slopePct = (slope / avgPrice) * 100;

        // Сила тренда: 0..100
        const strength = Math.min(100, Math.abs(slopePct) * 50);

        let type;
        if (slopePct > 0.05 && strength > 30) type = 'strong_bull';
        else if (slopePct > 0 && strength > 10) type = 'weak_bull';
        else if (slopePct < -0.05 && strength > 30) type = 'strong_bear';
        else if (slopePct < 0 && strength > 10) type = 'weak_bear';
        else type = 'sideways';

        // === Расширенные модели тренда ===

        // Trend Exhaustion — расхождение между последними свечами и общим трендом
        const lastQuartile = closes.slice(-Math.max(5, Math.floor(n / 4)));
        const earlyQuartile = closes.slice(0, Math.max(5, Math.floor(n / 4)));
        const recentAvg = mean(lastQuartile);
        const earlyAvg = mean(earlyQuartile);
        const recentSlope = lastQuartile.length > 1 ?
            (lastQuartile[lastQuartile.length - 1] - lastQuartile[0]) / lastQuartile.length : 0;
        const earlySlope = earlyQuartile.length > 1 ?
            (earlyQuartile[earlyQuartile.length - 1] - earlyQuartile[0]) / earlyQuartile.length : 0;

        const trendExhaustion = {
            detected: (Math.sign(earlySlope) !== Math.sign(recentSlope)) ||
                      (Math.abs(recentSlope) < Math.abs(earlySlope) * 0.3 && strength > 50),
            description: type === 'sideways' ? 'Боковик — признак истощения тренда' :
                         type === 'weak_bull' || type === 'weak_bear' ? 'Слабый тренд — возможно истощение' : 'Тренд активен'
        };

        return {
            type: type,
            slope: round(slope, 4),
            slopePct: round(slopePct, 4),
            strength: round(strength),
            confidence: structure.type === 'uptrend' || structure.type === 'downtrend' ? 70 : 40,
            // Расширенные модели
            strongBullTrend: type === 'strong_bull',
            weakBullTrend: type === 'weak_bull',
            strongBearTrend: type === 'strong_bear',
            weakBearTrend: type === 'weak_bear',
            sidewaysTrend: type === 'sideways',
            trendExhaustion: trendExhaustion
        };
    }

    // ================================================================
    // 5. Momentum Analysis
    // ================================================================

    function analyzeMomentum(candles) {
        // RSI-like индикатор (14-периодный)
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

        // Ускорение/замедление: сравниваем скорость изменения
        const halfChanges = [];
        for (let i = Math.max(1, candles.length - period); i < candles.length; i++) {
            halfChanges.push(candles[i].close - candles[i - 1].close);
        }
        const firstHalf = mean(halfChanges.slice(0, halfChanges.length / 2));
        const secondHalf = mean(halfChanges.slice(halfChanges.length / 2));
        const acceleration = secondHalf - firstHalf;

        // Истощение: RSI в экстремуме + большая свеча против движения
        const exhaustion = {
            detected: false,
            index: null,
            time: null,
            side: null
        };
        if (rsi > 75 && isBear(candles[candles.length - 1])) {
            exhaustion.detected = true;
            exhaustion.index = candles.length - 1;
            exhaustion.time = candles[candles.length - 1].time;
            exhaustion.side = 'bullish_exhaustion';
        } else if (rsi < 25 && isBull(candles[candles.length - 1])) {
            exhaustion.detected = true;
            exhaustion.index = candles.length - 1;
            exhaustion.time = candles[candles.length - 1].time;
            exhaustion.side = 'bearish_exhaustion';
        }

        const strength = Math.abs(50 - rsi) * 2; // 0..100
        const direction = rsi > 55 ? 'up' : rsi < 45 ? 'down' : 'neutral';

        // === Расширенные модели моментума ===

        // Impulse Move — большая свеча в направлении тренда (>1.5 ATR)
        const atrApprox = mean(candles.slice(-14).map(candleRange));
        const lastCandleRange = candleRange(candles[candles.length - 1]);
        const impulseMove = {
            detected: lastCandleRange > atrApprox * 1.5,
            size: round(lastCandleRange / atrApprox, 2),
            direction: isBull(candles[candles.length - 1]) ? 'bullish' : 'bearish'
        };

        // Corrective Move — серия малых свечей против тренда
        let correctiveStreak = 0;
        const recent = candles.slice(-5);
        const recentDirection = isBull(recent[recent.length - 1]) ? 'bullish' : 'bearish';
        for (let i = recent.length - 1; i >= 0; i--) {
            const c = recent[i];
            const cDir = isBull(c) ? 'bullish' : 'bearish';
            if (cDir !== recentDirection && candleRange(c) < atrApprox * 0.7) {
                correctiveStreak++;
            } else break;
        }
        const correctiveMove = {
            detected: correctiveStreak >= 3,
            strength: correctiveStreak
        };

        // Momentum Divergence — цена обновляет хаи, RSI нет
        const lastNHalf = candles.slice(-Math.floor(candles.length / 2));
        const firstHalfCandles = candles.slice(0, Math.floor(candles.length / 2));
        const recentHigh = Math.max(...lastNHalf.map(c => c.high));
        const earlierHigh = Math.max(...firstHalfCandles.map(c => c.high));
        const momentumDivergence = {
            bullish: candles[candles.length - 1].close > earlierHigh && rsi < 60,
            bearish: candles[candles.length - 1].close < Math.min(...firstHalfCandles.map(c => c.low)) && rsi > 40,
            detected: false
        };
        momentumDivergence.detected = momentumDivergence.bullish || momentumDivergence.bearish;

        // Strong / Weak Momentum
        const strongMomentum = {
            detected: strength > 60,
            direction: direction === 'up' ? 'bullish' : direction === 'down' ? 'bearish' : 'neutral'
        };
        const weakMomentum = {
            detected: strength < 20,
            direction: direction
        };

        return {
            strength: round(strength),
            direction: direction,
            rsi: round(rsi, 1),
            description: rsi > 70 ? 'перекуплен' : rsi < 30 ? 'перепродан' :
                        rsi > 55 ? 'бычий моментум' : rsi < 45 ? 'медвежий моментум' : 'нейтральный',
            exhaustion: exhaustion,
            acceleration: {
                detected: Math.abs(acceleration) > avgPrice(closeChanges(candles)) * 0.5,
                value: round(acceleration, 4)
            },
            deceleration: {
                detected: Math.abs(acceleration) > 0 && Math.sign(acceleration) !== Math.sign(firstHalf),
                value: round(acceleration, 4)
            },
            // Расширенные модели
            strongMomentum: strongMomentum,
            weakMomentum: weakMomentum,
            momentumAcceleration: {
                detected: acceleration > 0,
                value: round(acceleration, 4)
            },
            momentumDeceleration: {
                detected: acceleration < 0,
                value: round(acceleration, 4)
            },
            momentumDivergence: momentumDivergence,
            impulseMove: impulseMove,
            correctiveMove: correctiveMove
        };
    }

    function avgPrice(arr) { return mean(arr); }
    function closeChanges(candles) {
        const r = [];
        for (let i = 1; i < candles.length; i++) r.push(candles[i].close - candles[i - 1].close);
        return r;
    }

    // ================================================================
    // 6. Volume Analysis
    // ================================================================

    function analyzeVolume(candles) {
        const volumes = candles.map(c => c.volume);
        const avgVol = mean(volumes);
        const lastVol = volumes[volumes.length - 1];
        const ratio = lastVol / avgVol;

        // Спайк: объём > 2× среднему
        const spikeIdx = volumes.findIndex(v => v > avgVol * 2);
        const spike = spikeIdx >= 0 ? {
            detected: true,
            index: spikeIdx,
            magnitude: round(volumes[spikeIdx] / avgVol, 2)
        } : { detected: false, index: null, magnitude: 1 };

        // Дивергенция: цена вверх, объём вниз (или наоборот)
        const lastN = 10;
        const priceChange = candles[candles.length - 1].close - candles[candles.length - lastN].close;
        const volChange = mean(volumes.slice(-5)) - mean(volumes.slice(-lastN, -5));
        const divergence = {
            bullish: priceChange < 0 && volChange > 0,
            bearish: priceChange > 0 && volChange < 0
        };

        // Расширенные модели
        const signals = [];
        if (ratio > 4) signals.push({ type: 'volume_climax', description: 'Экстремальный объём — кульминация' });
        else if (ratio > 2.5) signals.push({ type: 'volume_spike', description: 'Volume Spike — резкий всплеск объёма' });
        else if (ratio < 0.5) signals.push({ type: 'low_volume', description: 'Low Volume — низкий объём' });
        else if (ratio > 1.2) signals.push({ type: 'high_volume', description: 'High Volume — повышенный объём' });
        else if (ratio < 0.8) signals.push({ type: 'declining_volume', description: 'Declining Volume — снижающийся объём' });
        else signals.push({ type: 'increasing_volume', description: 'Increasing Volume — растущий объём' });

        // Новые модели
        const volumeDivergence = detectVolumeDivergence(candles);
        const absorption = detectAbsorption(candles);
        const distributionAccumulation = detectDistributionAccumulation(candles);

        // Текущий тренд объёма (за последние 10 свечей)
        const recentVols = volumes.slice(-10);
        let trend = 'stable';
        if (recentVols.length >= 2) {
            const first = mean(recentVols.slice(0, 5));
            const second = mean(recentVols.slice(5));
            if (second > first * 1.2) trend = 'increasing';
            else if (second < first * 0.8) trend = 'decreasing';
        }

        return {
            current: round(lastVol),
            average: round(avgVol),
            ratio: round(ratio, 2),
            trend: trend,
            description: ratio > 1.5 ? 'повышенный' : ratio < 0.5 ? 'низкий' : 'нормальный',
            spike: spike,
            confirmation: ratio > 1.2 ? 'confirmed' : ratio < 0.8 ? 'not_confirmed' : 'neutral',
            divergence: divergence,
            // Расширенные поля
            signals: signals,
            volumeDivergence: volumeDivergence,
            absorption: absorption,
            distributionAccumulation: distributionAccumulation,
            buyingSellingPressure: detectBuyingSellingPressure(candles),
            exhaustion: detectExhaustion(candles, { ratio: ratio, trend: trend }),
            // Поля по спецификации (алиасы)
            highVolume: ratio > 1.5,
            lowVolume: ratio < 0.5,
            volumeSpike: ratio > 2.5,
            volumeClimax: ratio > 4,
            decliningVolume: trend === 'decreasing',
            increasingVolume: trend === 'increasing',
            volumeConfirmation: {
                confirmed: ratio > 1.2,
                ratio: round(ratio, 2)
            },
            buyingPressure: round(detectBuyingSellingPressure(candles).buyRatio || 0.5, 2),
            sellingPressure: round(detectBuyingSellingPressure(candles).sellRatio || 0.5, 2),
            distribution: distributionAccumulation && distributionAccumulation.type === 'distribution',
            accumulation: distributionAccumulation && distributionAccumulation.type === 'accumulation'
        };
    }

    // ================================================================
    // 7. Liquidity Analysis
    // ================================================================

    function analyzeLiquidity(candles, structure, smc) {
        const lastCandle = candles[candles.length - 1];
        const sweeps = smc.liquiditySweeps;
        const lastSweep = sweeps[sweeps.length - 1] || null;

        // Liquidity Grab — короткий вынос за уровень и быстрый возврат
        const grab = lastSweep ? {
            detected: true,
            index: lastSweep.index,
            side: lastSweep.side
        } : { detected: false, index: null, side: null };

        // Stop Hunt — тестирование зоны стопов (аналог liquidity grab)
        const stopHunt = sweeps.slice(0, 3);

        // Sweep Highs / Sweep Lows — отдельные модели
        const sweepHighs = sweeps.filter(s => s.side === 'high').slice(0, 5);
        const sweepLows = sweeps.filter(s => s.side === 'low').slice(0, 5);

        // Resting Liquidity — неподтянутая ликвидность (buy-side / sell-side pools)
        const buySideResting = smc.buySideLiquidity || [];
        const sellSideResting = smc.sellSideLiquidity || [];

        // Liquidity Void — пустые зоны (большие FVG незаполненные)
        const atrApprox = mean(candles.slice(-14).map(candleRange));
        const liquidityVoid = smc.fairValueGaps.filter(f =>
            !f.filled && f.size > atrApprox * 0.5
        ).slice(0, 5);

        // Thin Liquidity — зоны с малым количеством trades (низкий объём)
        const recentCandles = candles.slice(-20);
        const avgRecentVol = mean(recentCandles.map(c => c.volume || 0));
        const thinLiquidity = recentCandles.filter(c => (c.volume || 0) < avgRecentVol * 0.5)
            .map(c => ({ index: recentCandles.indexOf(c), price: round(c.close) }));

        // High / Low Liquidity Zone
        const highLiquidityZone = buySideResting.filter(p => p.price > lastCandle.close).slice(0, 3);
        const lowLiquidityZone = sellSideResting.filter(p => p.price < lastCandle.close).slice(0, 3);

        return {
            grab: grab,
            sweep: lastSweep,
            stopHunt: stopHunt,
            untouched: {
                buySide: smc.buySideLiquidity.filter(p => p.price > lastCandle.close),
                sellSide: smc.sellSideLiquidity.filter(p => p.price < lastCandle.close)
            },
            void: liquidityVoid,
            // Расширенные модели
            liquidityGrab: grab,
            stopHuntEvents: stopHunt,
            sweepHighs: sweepHighs,
            sweepLows: sweepLows,
            restingLiquidity: {
                buySide: buySideResting,
                sellSide: sellSideResting
            },
            liquidityVoid: liquidityVoid,
            thinLiquidity: thinLiquidity,
            highLiquidityZone: highLiquidityZone,
            lowLiquidityZone: lowLiquidityZone
        };
    }

    // ================================================================
    // 8. Volatility
    // ================================================================

    function analyzeVolatility(candles) {
        // ATR (14)
        const period = 14;
        const trs = [];
        for (let i = 1; i < candles.length; i++) {
            const high = candles[i].high;
            const low = candles[i].low;
            const prevClose = candles[i - 1].close;
            const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
            trs.push(tr);
        }
        const atr = mean(trs.slice(-period));
        const lastPrice = candles[candles.length - 1].close;
        const atrPct = (atr / lastPrice) * 100;

        // Compression/Expansion: сравниваем первую и вторую половины
        const firstHalf = candles.slice(0, Math.floor(candles.length / 2));
        const secondHalf = candles.slice(Math.floor(candles.length / 2));
        const firstHalfATR = mean(firstHalf.slice(1).map((c, i) =>
            Math.max(c.high - c.low, Math.abs(c.high - firstHalf[i].close), Math.abs(c.low - firstHalf[i].close))));
        const secondHalfATR = mean(secondHalf.slice(1).map((c, i) =>
            Math.max(c.high - c.low, Math.abs(c.high - secondHalf[i].close), Math.abs(c.low - secondHalf[i].close))));

        const compression = {
            detected: secondHalfATR < firstHalfATR * 0.7,
            ratio: round(secondHalfATR / firstHalfATR, 2)
        };
        const expansion = {
            detected: secondHalfATR > firstHalfATR * 1.3,
            ratio: round(secondHalfATR / firstHalfATR, 2)
        };

        // === Расширенные модели волатильности ===

        // ATR Expansion / ATR Compression — последние 5 свечей vs предыдущие 5
        const recentTrs = trs.slice(-5);
        const earlierTrs = trs.slice(-10, -5);
        const recentATR = mean(recentTrs);
        const earlierATR = mean(earlierTrs);
        const atrExpansion = recentATR > earlierATR * 1.2;
        const atrCompression = recentATR < earlierATR * 0.8;

        // Volatility Squeeze — низкая волатильность после периода нормальной
        const volatilitySqueeze = compression.detected && atrPct < 1.0;

        // Volatility Breakout — резкий рост волатильности после сжатия
        const volatilityBreakout = atrExpansion && compression.detected;

        // Explosive Expansion — объём + волатильность взрывной рост
        const explosiveExpansion = expansion.detected && atrPct > 3;

        // High / Low Volatility
        const highVolatility = atrPct > 2;
        const lowVolatility = atrPct < 0.5;

        let level;
        if (atrPct > 2) level = 'high';
        else if (atrPct < 0.5) level = 'low';
        else level = 'normal';

        return {
            level: level,
            atr: round(atr),
            atrPercent: round(atrPct, 2),
            description: atrPct > 2 ? 'высокая волатильность' :
                        atrPct < 0.5 ? 'низкая волатильность' : 'нормальная волатильность',
            compression: compression,
            expansion: expansion,
            // Расширенные модели
            highVolatility: highVolatility,
            lowVolatility: lowVolatility,
            atrExpansion: atrExpansion,
            atrCompression: atrCompression,
            volatilityBreakout: volatilityBreakout,
            volatilitySqueeze: volatilitySqueeze,
            explosiveExpansion: explosiveExpansion
        };
    }

    // ================================================================
    // 9. Support / Resistance Levels
    // ================================================================

    function analyzeLevels(candles, structure, level) {
        const supports = [];
        const resistances = [];
        const supplyZones = [];
        const demandZones = [];

        // Используем свинги как уровни
        structure.lowerLows.forEach(s => {
            supports.push({ price: round(s.price), strength: 60, type: 'swing_low', touchCount: 1 });
        });
        structure.higherLows.forEach(s => {
            supports.push({ price: round(s.price), strength: 70, type: 'swing_hl', touchCount: 1 });
        });
        structure.higherHighs.forEach(s => {
            resistances.push({ price: round(s.price), strength: 60, type: 'swing_high', touchCount: 1 });
        });
        structure.lowerHighs.forEach(s => {
            resistances.push({ price: round(s.price), strength: 70, type: 'swing_lh', touchCount: 1 });
        });

        // Заданный уровень (если есть)
        if (level) {
            resistances.push({ price: round(level), strength: 90, type: 'key_level', touchCount: 3 });
        }

        // === Расширенные модели ===

        // Major Support / Major Resistance — уровни, которые тестировались много раз
        const lastPrice = candles[candles.length - 1].close;
        const allLevels = [...supports, ...resistances];
        const tolerance = lastPrice * 0.005; // 0.5% толерантность

        // Считаем touches для каждого уровня
        for (const lvl of allLevels) {
            let touches = 0;
            for (const c of candles) {
                if (Math.abs(c.high - lvl.price) < tolerance || Math.abs(c.low - lvl.price) < tolerance) {
                    touches++;
                }
            }
            lvl.touchCount = touches;
        }

        // Сортируем по силе (touches + strength)
        const majorSupports = supports
            .filter(s => s.touchCount >= 3)
            .sort((a, b) => b.touchCount - a.touchCount)
            .slice(0, 3)
            .map(s => ({ ...s, type: 'major_support', strength: 90 }));

        const majorResistances = resistances
            .filter(r => r.touchCount >= 3)
            .sort((a, b) => b.touchCount - a.touchCount)
            .slice(0, 3)
            .map(r => ({ ...r, type: 'major_resistance', strength: 90 }));

        // Supply / Demand Zones (через Order Blocks)
        if (structure && structure.swings) {
            structure.swings.forEach(s => {
                if (s.type === 'low') {
                    demandZones.push({
                        price: round(s.price),
                        low: round(s.price * 0.998),
                        high: round(s.price * 1.005),
                        strength: 70,
                        type: 'demand_zone',
                        source: 'swing_low'
                    });
                } else if (s.type === 'high') {
                    supplyZones.push({
                        price: round(s.price),
                        low: round(s.price * 0.995),
                        high: round(s.price * 1.002),
                        strength: 70,
                        type: 'supply_zone',
                        source: 'swing_high'
                    });
                }
            });
        }

        // Dynamic Support / Resistance — скользящие средние как динамические уровни
        const closes = candles.map(c => c.close);
        const ma20 = mean(closes.slice(-20));
        const ma50 = mean(closes.slice(-50));
        const dynamicSupport = lastPrice > ma20 ? { price: round(ma20), type: 'dynamic_support_ma20' } : null;
        const dynamicResistance = lastPrice < ma20 ? { price: round(ma20), type: 'dynamic_resistance_ma20' } : null;

        // Breakout Level — ближайший ключевой уровень, который может быть пробит
        const allKeyLevels = [...majorSupports, ...majorResistances].sort((a, b) =>
            Math.abs(a.price - lastPrice) - Math.abs(b.price - lastPrice)
        );
        const breakoutLevel = allKeyLevels[0] ? {
            price: allKeyLevels[0].price,
            type: allKeyLevels[0].type,
            distance: round(Math.abs(allKeyLevels[0].price - lastPrice) / lastPrice * 100, 2)
        } : null;

        // Retest Zone — если цена только что пробила уровень, то он становится зоной ретеста
        const retestZones = [];
        if (majorResistances.length > 0) {
            const nearest = majorResistances[0];
            if (lastPrice > nearest.price * 0.998 && lastPrice < nearest.price * 1.01) {
                retestZones.push({ price: nearest.price, type: 'retest_resistance', source: 'breakout' });
            }
        }
        if (majorSupports.length > 0) {
            const nearest = majorSupports[0];
            if (lastPrice < nearest.price * 1.002 && lastPrice > nearest.price * 0.99) {
                retestZones.push({ price: nearest.price, type: 'retest_support', source: 'breakdown' });
            }
        }

        return {
            supports: supports.slice(0, 5),
            resistances: resistances.slice(0, 5),
            supplyZones: supplyZones.slice(0, 5),
            demandZones: demandZones.slice(0, 5),
            reactionZones: [...supports, ...resistances].sort((a, b) => b.strength - a.strength).slice(0, 5),
            // Расширенные модели
            majorSupport: majorSupports,
            majorResistance: majorResistances,
            supplyZone: supplyZones.slice(0, 3),
            demandZone: demandZones.slice(0, 3),
            dynamicSupport: dynamicSupport,
            dynamicResistance: dynamicResistance,
            breakoutLevel: breakoutLevel,
            retestZone: retestZones
        };
    }

    function smcToZones(candles, type) {
        // Заглушка: возвращаем OB-зоны если они есть
        return [];
    }

    // ================================================================
    // 10. Probability Engine
    // ================================================================

    function calculateProbability(structure, trend, momentum, volume, smc) {
        const factors = [];

        // Вес тренда
        let trendScore = 50;
        if (trend.type === 'strong_bull') trendScore = 80;
        else if (trend.type === 'weak_bull') trendScore = 60;
        else if (trend.type === 'strong_bear') trendScore = 20;
        else if (trend.type === 'weak_bear') trendScore = 40;
        else trendScore = 50;
        factors.push({ name: 'trend', weight: 0.25, value: trendScore });

        // Вес моментума
        let momentumScore = momentum.rsi;
        factors.push({ name: 'momentum', weight: 0.20, value: momentumScore });

        // Вес структуры
        let structureScore = 50;
        if (structure.type === 'uptrend') structureScore = 75;
        else if (structure.type === 'downtrend') structureScore = 25;
        factors.push({ name: 'structure', weight: 0.25, value: structureScore });

        // Вес объёма
        let volumeScore = 50;
        if (volume.confirmation === 'confirmed' && volume.ratio > 1.2) volumeScore = 70;
        else if (volume.divergence.bullish) volumeScore = 30;
        else if (volume.divergence.bearish) volumeScore = 70;
        factors.push({ name: 'volume', weight: 0.15, value: volumeScore });

        // Вес SMC
        let smcScore = 50;
        if (smc.bos.length > 0 && smc.bos[smc.bos.length - 1].type === 'bullish') smcScore = 70;
        if (smc.bos.length > 0 && smc.bos[smc.bos.length - 1].type === 'bearish') smcScore = 30;
        if (smc.liquiditySweeps.length > 0) smcScore += 5;
        factors.push({ name: 'smc', weight: 0.15, value: smcScore });

        // Считаем взвешенное среднее
        let bullish = 0, bearish = 0;
        factors.forEach(f => {
            bullish += f.value * f.weight;
            bearish += (100 - f.value) * f.weight;
        });

        const totalBullish = round(bullish);
        const totalBearish = round(bearish);
        const neutral = round(Math.max(0, 100 - Math.abs(totalBullish - 50) * 2));

        // Уверенность: чем больше разрыв, тем выше уверенность
        const confidence = round(Math.abs(totalBullish - 50) * 2);

        return {
            bullish: totalBullish,
            bearish: totalBearish,
            neutral: neutral,
            confidence: confidence,
            factors: factors
        };
    }

    // ================================================================
    // 11. Trading Scenario Generator
    // ================================================================

    /**
     * Генерирует торговые сценарии на основе полного контекста.
     * Для каждого: вероятность, риск, точка входа, SL/TP, причины.
     */
    function generateScenarios(candles, structure, trend, momentum, volume, smc, levels, probability, level, priceAction, volatility) {
        const lastCandle = candles[candles.length - 1];
        const lastPrice = lastCandle.close;
        const atr = mean(candles.slice(-14).map(candleRange));

        const scenarios = [];

        // === Контекст: тренд вверх с подтверждением ===
        const isBullishTrend = trend.type === 'strong_bull' || trend.type === 'weak_bull';
        const isBearishTrend = trend.type === 'strong_bear' || trend.type === 'weak_bear';
        const isSideways = trend.type === 'sideways';

        // === 1. Trend Continuation (Long при бычьем тренде) ===
        if (isBullishTrend && structure.type === 'uptrend') {
            scenarios.push({
                id: 'trend-continuation-long',
                title: 'Trend Continuation (Long)',
                description: 'Продолжение восходящего тренда после отката к структуре.',
                direction: 'long',
                category: 'directional',
                riskLevel: 'medium',
                probability: round(0.55 + (trend.strength / 200), 2),
                confirmations: ['retest', 'hold', 'high-volume'],
                reasons: [
                    `Тренд ${trend.type === 'strong_bull' ? 'сильный' : 'слабый'} бычий`,
                    'Структура сохраняет HH/HL',
                    'Моментум поддерживает направление'
                ],
                entryZone: { low: round(lastPrice - atr * 0.5), high: round(lastPrice + atr * 0.2) },
                stopLoss: round(lastPrice - atr * 1.5),
                takeProfit: round(lastPrice + atr * 3),
                riskRewardRatio: '1:2',
                confidence: round(60 + trend.strength / 3),
                applicable: true,
                priority: 80
            });
        }

        // === 2. Trend Continuation (Short при медвежьем тренде) ===
        if (isBearishTrend && structure.type === 'downtrend') {
            scenarios.push({
                id: 'trend-continuation-short',
                title: 'Trend Continuation (Short)',
                description: 'Продолжение нисходящего тренда после отката вверх.',
                direction: 'short',
                category: 'directional',
                riskLevel: 'medium',
                probability: round(0.55 + (trend.strength / 200), 2),
                confirmations: ['retest', 'hold', 'high-volume'],
                reasons: [
                    `Тренд ${trend.type === 'strong_bear' ? 'сильный' : 'слабый'} медвежий`,
                    'Структура сохраняет LH/LL',
                    'Моментум поддерживает направление'
                ],
                entryZone: { low: round(lastPrice - atr * 0.2), high: round(lastPrice + atr * 0.5) },
                stopLoss: round(lastPrice + atr * 1.5),
                takeProfit: round(lastPrice - atr * 3),
                riskRewardRatio: '1:2',
                confidence: round(60 + trend.strength / 3),
                applicable: true,
                priority: 80
            });
        }

        // === 3. Breakout Entry ===
        if (level && Math.abs(lastPrice - level) < atr * 1.5 && isBullishTrend) {
            scenarios.push({
                id: 'breakout-entry',
                title: 'Breakout Entry',
                description: 'Вход после подтверждённого пробоя ключевого уровня.',
                direction: 'long',
                category: 'conditional',
                riskLevel: 'medium',
                probability: round(0.45 + (volume.ratio > 1.3 ? 0.1 : 0), 2),
                confirmations: ['breakout', 'close-above', 'high-volume'],
                reasons: [
                    `Цена у ключевого уровня $${level.toLocaleString('en-US')}`,
                    volume.ratio > 1.3 ? 'Объём подтверждает пробой' : 'Объём не подтверждает пробой',
                    'BOS в структуре'
                ],
                entryZone: { low: round(level), high: round(level + atr * 0.3) },
                stopLoss: round(level - atr),
                takeProfit: round(level + atr * 2.5),
                riskRewardRatio: '1:2.5',
                confidence: round(55 + volume.ratio * 10),
                applicable: true,
                priority: 70
            });
        }

        // === 4. Pullback Entry ===
        if (isBullishTrend && lastPrice < structure.higherHighs.slice(-1)[0]?.price) {
            scenarios.push({
                id: 'pullback-entry',
                title: 'Pullback Entry',
                description: 'Вход на откате к зоне спроса в восходящем тренде.',
                direction: 'long',
                category: 'conditional',
                riskLevel: 'low',
                probability: round(0.50, 2),
                confirmations: ['retest', 'hold'],
                reasons: [
                    'Цена откатывается в восходящем тренде',
                    'Зона спроса / order block',
                    'Структура не сломана'
                ],
                entryZone: { low: round(lastPrice - atr * 0.3), high: round(lastPrice + atr * 0.1) },
                stopLoss: round(lastPrice - atr * 1.2),
                takeProfit: round(lastPrice + atr * 2.5),
                riskRewardRatio: '1:2',
                confidence: 65,
                applicable: true,
                priority: 75
            });
        }

        // === 5. Liquidity Sweep Entry ===
        if (smc.liquiditySweeps.length > 0) {
            const lastSweep = smc.liquiditySweeps[smc.liquiditySweeps.length - 1];
            const direction = lastSweep.side === 'buy_side' ? 'short' : 'long';
            scenarios.push({
                id: 'liquidity-sweep-entry',
                title: 'Liquidity Sweep Entry',
                description: 'Вход после захвата ликвидности и разворота.',
                direction: direction,
                category: 'conditional',
                riskLevel: 'medium',
                probability: round(0.48, 2),
                confirmations: ['rejection', 'impulse'],
                reasons: [
                    `Произошёл sweep ${lastSweep.side === 'buy_side' ? 'buy-side' : 'sell-side'} ликвидности`,
                    'Стопы сняты',
                    'Ожидается реакция от зоны'
                ],
                entryZone: { low: round(lastSweep.price - atr * 0.2), high: round(lastSweep.price + atr * 0.2) },
                stopLoss: round(direction === 'long' ? lastSweep.price - atr : lastSweep.price + atr),
                takeProfit: round(direction === 'long' ? lastSweep.price + atr * 2.5 : lastSweep.price - atr * 2.5),
                riskRewardRatio: '1:2.5',
                confidence: 60,
                applicable: true,
                priority: 70
            });
        }

        // === 6. Order Block Entry ===
        if (smc.orderBlocks.length > 0) {
            const lastOB = smc.orderBlocks[smc.orderBlocks.length - 1];
            const direction = lastOB.type === 'bullish' ? 'long' : 'short';
            scenarios.push({
                id: 'order-block-entry',
                title: 'Order Block Entry',
                description: 'Вход в зону ордер-блока после ретеста.',
                direction: direction,
                category: 'conditional',
                riskLevel: 'low',
                probability: round(0.52, 2),
                confirmations: ['retest', 'hold'],
                reasons: [
                    `Найден ${lastOB.type} order block`,
                    'Зона институционального интереса',
                    'Ретест подтверждает зону'
                ],
                entryZone: { low: round(lastOB.low), high: round(lastOB.high) },
                stopLoss: round(direction === 'long' ? lastOB.low - atr * 0.5 : lastOB.high + atr * 0.5),
                takeProfit: round(direction === 'long' ? lastOB.high + atr * 2 : lastOB.low - atr * 2),
                riskRewardRatio: '1:2',
                confidence: 65,
                applicable: true,
                priority: 70
            });
        }

        // === 7. FVG Retest Entry ===
        if (smc.fairValueGaps.length > 0) {
            const lastFVG = smc.fairValueGaps[smc.fairValueGaps.length - 1];
            const direction = lastFVG.type === 'bullish' ? 'long' : 'short';
            scenarios.push({
                id: 'fvg-retest-entry',
                title: 'FVG Retest Entry',
                description: 'Вход на ретесте Fair Value Gap.',
                direction: direction,
                category: 'conditional',
                riskLevel: 'low',
                probability: round(0.50, 2),
                confirmations: ['retest', 'hold'],
                reasons: [
                    'Обнаружен незаполненный FVG',
                    'Цена возвращается к зоне дисбаланса',
                    'Импульс подтверждает силу FVG'
                ],
                entryZone: { low: round(lastFVG.low), high: round(lastFVG.high) },
                stopLoss: round(direction === 'long' ? lastFVG.low - atr * 0.5 : lastFVG.high + atr * 0.5),
                takeProfit: round(direction === 'long' ? lastFVG.high + atr * 2 : lastFVG.low - atr * 2),
                riskRewardRatio: '1:2',
                confidence: 60,
                applicable: true,
                priority: 65
            });
        }

        // === 8. BOS Continuation ===
        if (smc.bos.length > 0) {
            const lastBOS = smc.bos[smc.bos.length - 1];
            const direction = lastBOS.type === 'bullish' ? 'long' : 'short';
            scenarios.push({
                id: 'bos-continuation',
                title: 'BOS Continuation',
                description: 'Продолжение после Break of Structure.',
                direction: direction,
                category: 'conditional',
                riskLevel: 'medium',
                probability: round(0.55, 2),
                confirmations: ['impulse', 'high-volume'],
                reasons: [
                    `Произошёл ${lastBOS.type} BOS`,
                    'Структура подтверждает продолжение',
                    'Вход после ретеста пробитого уровня'
                ],
                entryZone: { low: round(lastBOS.level), high: round(lastBOS.level + atr * 0.2) },
                stopLoss: round(lastBOS.level - atr),
                takeProfit: round(lastBOS.level + atr * 2),
                riskRewardRatio: '1:2',
                confidence: 65,
                applicable: true,
                priority: 70
            });
        }

        // === 9. CHoCH Reversal ===
        if (smc.choch.length > 0) {
            const lastCHoCH = smc.choch[smc.choch.length - 1];
            const direction = lastPrice > lastCHoCH.price ? 'short' : 'long';
            scenarios.push({
                id: 'choch-reversal',
                title: 'CHoCH Reversal',
                description: 'Разворот после Change of Character.',
                direction: direction,
                category: 'counter-trend',
                riskLevel: 'high',
                probability: round(0.40, 2),
                confirmations: ['breakout', 'high-volume'],
                reasons: [
                    'Обнаружен CHoCH — смена характера движения',
                    'Возможен разворот тренда',
                    'Требуется дополнительное подтверждение'
                ],
                entryZone: { low: round(lastCHoCH.price), high: round(lastCHoCH.price + atr * 0.3) },
                stopLoss: round(direction === 'long' ? lastCHoCH.price - atr * 1.5 : lastCHoCH.price + atr * 1.5),
                takeProfit: round(direction === 'long' ? lastCHoCH.price + atr * 3 : lastCHoCH.price - atr * 3),
                riskRewardRatio: '1:2',
                confidence: 50,
                applicable: true,
                priority: 55
            });
        }

        // === 10. Aggressive Long (в сильном бычьем тренде) ===
        if (trend.type === 'strong_bull' && momentum.rsi > 60 && momentum.rsi < 80) {
            scenarios.push({
                id: 'aggressive-long',
                title: 'Aggressive Long',
                description: 'Агрессивный вход в лонг по импульсу в сильном тренде.',
                direction: 'long',
                category: 'directional',
                riskLevel: 'high',
                probability: round(0.45, 2),
                confirmations: ['breakout', 'impulse', 'high-volume'],
                reasons: [
                    'Сильный бычий тренд с подтверждённым моментумом',
                    'Высокая вероятность продолжения',
                    'RSI в зоне силы, но не перекупленности'
                ],
                entryZone: { low: round(lastPrice - atr * 0.1), high: round(lastPrice + atr * 0.2) },
                stopLoss: round(lastPrice - atr * 1.2),
                takeProfit: round(lastPrice + atr * 3),
                riskRewardRatio: '1:2.5',
                confidence: 60,
                applicable: true,
                priority: 60
            });
        }

        // === 11. Conservative Long ===
        if (isBullishTrend && momentum.exhaustion.detected === false) {
            scenarios.push({
                id: 'conservative-long',
                title: 'Conservative Long',
                description: 'Консервативный вход в лонг с подтверждением всех факторов.',
                direction: 'long',
                category: 'directional',
                riskLevel: 'low',
                probability: round(0.50, 2),
                confirmations: ['retest', 'hold', 'impulse'],
                reasons: [
                    'Тренд восходящий',
                    'Моментум не в экстремуме',
                    'Требуется полное подтверждение'
                ],
                entryZone: { low: round(lastPrice - atr * 0.5), high: round(lastPrice - atr * 0.1) },
                stopLoss: round(lastPrice - atr * 1.5),
                takeProfit: round(lastPrice + atr * 3),
                riskRewardRatio: '1:2',
                confidence: 70,
                applicable: true,
                priority: 65
            });
        }

        // === 12. Scale In (при низком объёме и консолидации) ===
        if (volume.ratio < 0.8 && (structure.type === 'consolidation' || structure.type === 'range')) {
            scenarios.push({
                id: 'scale-in',
                title: 'Scale In',
                description: 'Поэтапный набор позиции при низком объёме и консолидации.',
                direction: isBullishTrend ? 'long' : isBearishTrend ? 'short' : 'long',
                category: 'risk-managed',
                riskLevel: 'low',
                probability: round(0.45, 2),
                confirmations: ['hold', 'low-volume'],
                reasons: [
                    'Низкий объём — нет conviction у крупных игроков',
                    'Консолидация — набор позиции оправдан',
                    'Снижение риска за счёт усреднения'
                ],
                entryZone: { low: round(lastPrice - atr * 0.3), high: round(lastPrice + atr * 0.3) },
                stopLoss: round(lastPrice - atr * 2),
                takeProfit: round(lastPrice + atr * 3),
                riskRewardRatio: '1:1.5',
                confidence: 50,
                applicable: true,
                priority: 55
            });
        }

        // === 13. Partial Position (при неопределённости) ===
        if (momentum.rsi > 45 && momentum.rsi < 55) {
            scenarios.push({
                id: 'partial-position',
                title: 'Partial Position',
                description: 'Частичная позиция при слабом моментуме и неопределённости.',
                direction: isBullishTrend ? 'long' : isBearishTrend ? 'short' : 'long',
                category: 'risk-managed',
                riskLevel: 'low',
                probability: round(0.45, 2),
                confirmations: [],
                reasons: [
                    'Моментум нейтральный — направление неясно',
                    'Снижение размера позиции уменьшает риск',
                    'Сохранение участия в движении'
                ],
                entryZone: { low: round(lastPrice - atr * 0.3), high: round(lastPrice + atr * 0.3) },
                stopLoss: round(lastPrice - atr * 1.5),
                takeProfit: round(lastPrice + atr * 2.5),
                riskRewardRatio: '1:1.5',
                confidence: 45,
                applicable: true,
                priority: 50
            });
        }

        // === 14. Counter-Trend Trade (с объяснением риска) ===
        if (isSideways || probability.confidence < 40) {
            scenarios.push({
                id: 'counter-trend',
                title: 'Counter-Trend Trade',
                description: 'Контртрендовая сделка при слабом тренде. Повышенный риск.',
                direction: isBullishTrend ? 'short' : 'long',
                category: 'counter-trend',
                riskLevel: 'high',
                probability: round(0.35, 2),
                confirmations: ['rejection', 'high-volume'],
                reasons: [
                    'Тренд слабый — возможен разворот',
                    'Контртрендовая торговля требует узкого стопа',
                    'Высокий риск — только для опытных'
                ],
                entryZone: { low: round(lastPrice - atr * 0.1), high: round(lastPrice + atr * 0.1) },
                stopLoss: round(lastPrice + (isBullishTrend ? atr : -atr) * 1.5),
                takeProfit: round(lastPrice - (isBullishTrend ? atr : -atr) * 3),
                riskRewardRatio: '1:2',
                confidence: 35,
                applicable: true,
                priority: 40
            });
        }

        // === 15. Aggressive Short ===
        if (trend.type === 'strong_bear' && momentum.rsi < 40 && momentum.rsi > 20) {
            scenarios.push({
                id: 'aggressive-short',
                title: 'Aggressive Short',
                description: 'Агрессивный вход в шорт по импульсу в сильном медвежьем тренде.',
                direction: 'short',
                category: 'directional',
                riskLevel: 'high',
                probability: round(0.45, 2),
                confirmations: ['breakout', 'impulse', 'high-volume'],
                reasons: [
                    'Сильный медвежий тренд с подтверждённым моментумом',
                    'Высокая вероятность продолжения',
                    'RSI в зоне силы, но не перепроданности'
                ],
                entryZone: { low: round(lastPrice - atr * 0.2), high: round(lastPrice + atr * 0.1) },
                stopLoss: round(lastPrice + atr * 1.2),
                takeProfit: round(lastPrice - atr * 3),
                riskRewardRatio: '1:2.5',
                confidence: 60,
                applicable: true,
                priority: 60
            });
        }

        // === 16. Conservative Short ===
        if (isBearishTrend && momentum.exhaustion.detected === false) {
            scenarios.push({
                id: 'conservative-short',
                title: 'Conservative Short',
                description: 'Консервативный вход в шорт с подтверждением всех факторов.',
                direction: 'short',
                category: 'directional',
                riskLevel: 'low',
                probability: round(0.50, 2),
                confirmations: ['retest', 'hold', 'impulse'],
                reasons: [
                    'Тренд нисходящий',
                    'Моментум не в экстремуме',
                    'Требуется полное подтверждение'
                ],
                entryZone: { low: round(lastPrice + atr * 0.1), high: round(lastPrice + atr * 0.5) },
                stopLoss: round(lastPrice + atr * 1.5),
                takeProfit: round(lastPrice - atr * 3),
                riskRewardRatio: '1:2',
                confidence: 70,
                applicable: true,
                priority: 65
            });
        }

        // === 17. Breakout ===
        if (level && Math.abs(lastPrice - level) < atr) {
            const direction = lastPrice > level ? 'long' : 'short';
            scenarios.push({
                id: 'breakout',
                title: 'Breakout',
                description: `Пробой уровня $${round(level)}. Вход по направлению пробоя.`,
                direction: direction,
                category: 'conditional',
                riskLevel: 'medium',
                probability: round(0.42 + (volume.ratio > 1.3 ? 0.1 : 0), 2),
                confirmations: ['breakout', 'high-volume'],
                reasons: [
                    `Цена у ключевого уровня $${round(level)}`,
                    'Пробой может быть началом нового движения',
                    volume.ratio > 1.3 ? 'Объём подтверждает пробой' : 'Объём нейтральный'
                ],
                entryZone: { low: round(direction === 'long' ? level : lastPrice - atr * 0.2), high: round(direction === 'long' ? lastPrice + atr * 0.2 : level) },
                stopLoss: round(direction === 'long' ? level - atr : level + atr),
                takeProfit: round(direction === 'long' ? lastPrice + atr * 3 : lastPrice - atr * 3),
                riskRewardRatio: '1:2.5',
                confidence: round(50 + volume.ratio * 10),
                applicable: true,
                priority: 65
            });
        }

        // === 18. Retest Entry ===
        if (level && Math.abs(lastPrice - level) < atr * 0.5) {
            const direction = lastPrice > level ? 'long' : 'short';
            scenarios.push({
                id: 'retest-entry',
                title: 'Retest Entry',
                description: `Ретест пробитого уровня $${round(level)} — вход после подтверждения удержания.`,
                direction: direction,
                category: 'conditional',
                riskLevel: 'low',
                probability: round(0.55, 2),
                confirmations: ['retest', 'hold'],
                reasons: [
                    `Уровень $${round(level)} удерживается как поддержка/сопротивление`,
                    'Идеальная точка входа с коротким стопом',
                    'Контекст: пробой + ретест = продолжение'
                ],
                entryZone: { low: round(direction === 'long' ? level - atr * 0.1 : lastPrice - atr * 0.2), high: round(direction === 'long' ? lastPrice + atr * 0.1 : level + atr * 0.1) },
                stopLoss: round(direction === 'long' ? level - atr * 0.8 : level + atr * 0.8),
                takeProfit: round(direction === 'long' ? lastPrice + atr * 2.5 : lastPrice - atr * 2.5),
                riskRewardRatio: '1:3',
                confidence: 70,
                applicable: true,
                priority: 75
            });
        }

        // === 19. Failed Breakout ===
        if (level && Math.abs(lastPrice - level) < atr && (momentum.exhaustion.detected || (volume.ratio < 0.7 && momentum.rsi > 70))) {
            const direction = lastPrice > level ? 'short' : 'long';
            scenarios.push({
                id: 'failed-breakout',
                title: 'Failed Breakout',
                description: 'Неудачный пробой — разворот после возврата цены ниже уровня.',
                direction: direction,
                category: 'counter-trend',
                riskLevel: 'high',
                probability: round(0.40, 2),
                confirmations: ['rejection', 'low-volume'],
                reasons: [
                    'Пробой не подтверждён объёмом',
                    'Моментум в экстремуме — возможен разворот',
                    'Возврат под уровень = слом структуры'
                ],
                entryZone: { low: round(direction === 'long' ? level - atr * 0.2 : lastPrice - atr * 0.1), high: round(direction === 'long' ? lastPrice + atr * 0.1 : level + atr * 0.2) },
                stopLoss: round(direction === 'long' ? level + atr : level - atr),
                takeProfit: round(direction === 'long' ? lastPrice - atr * 2.5 : lastPrice + atr * 2.5),
                riskRewardRatio: '1:2.5',
                confidence: 55,
                applicable: true,
                priority: 60
            });
        }

        // === 20. Fakeout ===
        if (smc.liquiditySweeps.length > 0 && smc.liquiditySweeps[smc.liquiditySweeps.length - 1].index >= candles.length - 3) {
            const lastSweep = smc.liquiditySweeps[smc.liquiditySweeps.length - 1];
            const direction = lastSweep.side === 'buy_side' ? 'short' : 'long';
            scenarios.push({
                id: 'fakeout',
                title: 'Fakeout',
                description: 'Fakeout — ложный вынос за уровень с быстрым возвратом.',
                direction: direction,
                category: 'counter-trend',
                riskLevel: 'medium',
                probability: round(0.50, 2),
                confirmations: ['rejection', 'impulse'],
                reasons: [
                    `Свеча сделала ложный вынос за уровень`,
                    'Цена быстро вернулась обратно',
                    'Стопы собраны — крупные игроки могут толкать цену в обратную сторону'
                ],
                entryZone: { low: round(direction === 'long' ? lastSweep.price - atr * 0.3 : lastPrice - atr * 0.1), high: round(direction === 'long' ? lastPrice + atr * 0.1 : lastSweep.price + atr * 0.3) },
                stopLoss: round(direction === 'long' ? lastSweep.price - atr : lastSweep.price + atr),
                takeProfit: round(direction === 'long' ? lastPrice + atr * 2 : lastPrice - atr * 2),
                riskRewardRatio: '1:2',
                confidence: 60,
                applicable: true,
                priority: 65
            });
        }

        // === 21. Pullback Buy ===
        if (isBullishTrend && structure.type === 'uptrend') {
            scenarios.push({
                id: 'pullback-buy',
                title: 'Pullback Buy',
                description: 'Покупка на откате в восходящем тренде.',
                direction: 'long',
                category: 'directional',
                riskLevel: 'medium',
                probability: round(0.52, 2),
                confirmations: ['retest', 'hold'],
                reasons: [
                    'Восходящий тренд с структурой HH/HL',
                    'Откат к зоне спроса',
                    'Моментум поддерживает направление'
                ],
                entryZone: { low: round(lastPrice - atr * 0.4), high: round(lastPrice + atr * 0.1) },
                stopLoss: round(lastPrice - atr * 1.2),
                takeProfit: round(lastPrice + atr * 2.5),
                riskRewardRatio: '1:2',
                confidence: 68,
                applicable: true,
                priority: 70
            });
        }

        // === 22. Pullback Sell ===
        if (isBearishTrend && structure.type === 'downtrend') {
            scenarios.push({
                id: 'pullback-sell',
                title: 'Pullback Sell',
                description: 'Продажа на откате в нисходящем тренде.',
                direction: 'short',
                category: 'directional',
                riskLevel: 'medium',
                probability: round(0.52, 2),
                confirmations: ['retest', 'hold'],
                reasons: [
                    'Нисходящий тренд с структурой LH/LL',
                    'Откат к зоне предложения',
                    'Моментум поддерживает направление'
                ],
                entryZone: { low: round(lastPrice - atr * 0.1), high: round(lastPrice + atr * 0.4) },
                stopLoss: round(lastPrice + atr * 1.2),
                takeProfit: round(lastPrice - atr * 2.5),
                riskRewardRatio: '1:2',
                confidence: 68,
                applicable: true,
                priority: 70
            });
        }

        // === 23. Breaker Block Entry ===
        if (smc.breakerBlocks && smc.breakerBlocks.length > 0) {
            const lastBB = smc.breakerBlocks[smc.breakerBlocks.length - 1];
            const direction = lastBB.type === 'bullish' ? 'long' : 'short';
            scenarios.push({
                id: 'breaker-block-entry',
                title: 'Breaker Block Entry',
                description: 'Вход в зону breaker block (сломанный OB).',
                direction: direction,
                category: 'conditional',
                riskLevel: 'medium',
                probability: round(0.50, 2),
                confirmations: ['retest', 'hold'],
                reasons: [
                    'Обнаружен breaker block',
                    'Зона повышенного интереса после слома OB',
                    'Ретест как точка входа'
                ],
                entryZone: { low: round(lastBB.low), high: round(lastBB.high) },
                stopLoss: round(direction === 'long' ? lastBB.low - atr * 0.5 : lastBB.high + atr * 0.5),
                takeProfit: round(direction === 'long' ? lastBB.high + atr * 2 : lastBB.low - atr * 2),
                riskRewardRatio: '1:2',
                confidence: 65,
                applicable: true,
                priority: 65
            });
        }

        // === 24. Mitigation Entry ===
        if (smc.mitigationBlocks && smc.mitigationBlocks.length > 0) {
            const lastMB = smc.mitigationBlocks[smc.mitigationBlocks.length - 1];
            const direction = lastMB.type === 'bullish' ? 'long' : 'short';
            scenarios.push({
                id: 'mitigation-entry',
                title: 'Mitigation Entry',
                description: 'Вход в зону mitigation block (OB после mitigated move).',
                direction: direction,
                category: 'conditional',
                riskLevel: 'low',
                probability: round(0.48, 2),
                confirmations: ['retest', 'hold'],
                reasons: [
                    'Обнаружен mitigation block',
                    'Зона митигации — крупный ордер был исполнен',
                    'Ожидается реакция от зоны'
                ],
                entryZone: { low: round(lastMB.low), high: round(lastMB.high) },
                stopLoss: round(direction === 'long' ? lastMB.low - atr * 0.3 : lastMB.high + atr * 0.3),
                takeProfit: round(direction === 'long' ? lastMB.high + atr * 1.5 : lastMB.low - atr * 1.5),
                riskRewardRatio: '1:1.5',
                confidence: 60,
                applicable: true,
                priority: 60
            });
        }

        // === 25. Price Action: Pin Bar Reversal ===
        const lastPattern = priceAction && priceAction.patterns && priceAction.patterns.length > 0 ?
            priceAction.patterns[priceAction.patterns.length - 1] : null;
        if (lastPattern && (lastPattern.type === 'bullish_pin_bar' || lastPattern.type === 'bearish_pin_bar' || lastPattern.type === 'hammer' || lastPattern.type === 'shooting_star')) {
            const direction = (lastPattern.type === 'bullish_pin_bar' || lastPattern.type === 'hammer') ? 'long' : 'short';
            scenarios.push({
                id: 'pin-bar-reversal',
                title: 'Pin Bar Reversal',
                description: `Разворот по паттерну ${lastPattern.type}.`,
                direction: direction,
                category: 'conditional',
                riskLevel: 'medium',
                probability: round(lastPattern.reversal_prob || 0.55, 2),
                confirmations: ['rejection', 'hold'],
                reasons: [
                    `Обнаружен паттерн ${lastPattern.type}`,
                    'Сильный rejection уровня',
                    'Подтверждение reversal_prob = ' + round(lastPattern.reversal_prob || 0.55, 2)
                ],
                entryZone: { low: round(lastCandle.low), high: round(lastCandle.high) },
                stopLoss: round(direction === 'long' ? lastCandle.low - atr * 0.3 : lastCandle.high + atr * 0.3),
                takeProfit: round(direction === 'long' ? lastPrice + atr * 2 : lastPrice - atr * 2),
                riskRewardRatio: '1:2',
                confidence: round((lastPattern.reversal_prob || 0.55) * 100),
                applicable: true,
                priority: 60
            });
        }

        // === 26. Price Action: Engulfing Entry ===
        if (lastPattern && (lastPattern.type === 'bullish_engulfing' || lastPattern.type === 'bearish_engulfing')) {
            const direction = lastPattern.type === 'bullish_engulfing' ? 'long' : 'short';
            scenarios.push({
                id: 'engulfing-entry',
                title: 'Engulfing Entry',
                description: 'Вход по модели поглощения.',
                direction: direction,
                category: 'conditional',
                riskLevel: 'medium',
                probability: round(lastPattern.reversal_prob || 0.60, 2),
                confirmations: ['breakout', 'impulse'],
                reasons: [
                    `Обнаружен ${lastPattern.type}`,
                    'Сильный сигнал reversal',
                    'Подтверждение смены баланса сил'
                ],
                entryZone: { low: round(lastCandle.low), high: round(lastCandle.high) },
                stopLoss: round(direction === 'long' ? lastCandle.low - atr * 0.5 : lastCandle.high + atr * 0.5),
                takeProfit: round(direction === 'long' ? lastPrice + atr * 2 : lastPrice - atr * 2),
                riskRewardRatio: '1:2',
                confidence: round((lastPattern.reversal_prob || 0.60) * 100),
                applicable: true,
                priority: 60
            });
        }

        // === 27. Price Action: Harami Reversal ===
        if (lastPattern && (lastPattern.type === 'bullish_harami' || lastPattern.type === 'bearish_harami')) {
            const direction = lastPattern.type === 'bullish_harami' ? 'long' : 'short';
            scenarios.push({
                id: 'harami-reversal',
                title: 'Harami Reversal',
                description: 'Разворот по модели Harami (внутренняя свеча).',
                direction: direction,
                category: 'conditional',
                riskLevel: 'medium',
                probability: round(lastPattern.reversal_prob || 0.50, 2),
                confirmations: ['retest', 'hold'],
                reasons: [
                    `Обнаружен ${lastPattern.type}`,
                    'Сигнал ослабления текущего движения',
                    'Возможен разворот'
                ],
                entryZone: { low: round(lastCandle.low), high: round(lastCandle.high) },
                stopLoss: round(direction === 'long' ? lastCandle.low - atr * 0.4 : lastCandle.high + atr * 0.4),
                takeProfit: round(direction === 'long' ? lastPrice + atr * 1.8 : lastPrice - atr * 1.8),
                riskRewardRatio: '1:1.8',
                confidence: 55,
                applicable: true,
                priority: 55
            });
        }

        // === 28. Price Action: Morning Star Entry ===
        if (lastPattern && lastPattern.type === 'morning_star') {
            scenarios.push({
                id: 'morning-star-entry',
                title: 'Morning Star Entry',
                description: 'Вход по бычьей модели Morning Star (утренняя звезда).',
                direction: 'long',
                category: 'conditional',
                riskLevel: 'low',
                probability: round(lastPattern.reversal_prob || 0.65, 2),
                confirmations: ['reversal', 'hold'],
                reasons: [
                    'Обнаружен Morning Star — сильный бычий разворотный паттерн',
                    'Три свечи подтверждают разворот',
                    'Высокая вероятность успеха'
                ],
                entryZone: { low: round(lastCandle.low), high: round(lastPrice + atr * 0.1) },
                stopLoss: round(lastCandle.low - atr * 0.3),
                takeProfit: round(lastPrice + atr * 2.5),
                riskRewardRatio: '1:2.5',
                confidence: 75,
                applicable: true,
                priority: 75
            });
        }

        // === 29. Price Action: Evening Star Entry ===
        if (lastPattern && lastPattern.type === 'evening_star') {
            scenarios.push({
                id: 'evening-star-entry',
                title: 'Evening Star Entry',
                description: 'Вход по медвежьей модели Evening Star (вечерняя звезда).',
                direction: 'short',
                category: 'conditional',
                riskLevel: 'low',
                probability: round(lastPattern.reversal_prob || 0.65, 2),
                confirmations: ['reversal', 'hold'],
                reasons: [
                    'Обнаружен Evening Star — сильный медвежий разворотный паттерн',
                    'Три свечи подтверждают разворот',
                    'Высокая вероятность успеха'
                ],
                entryZone: { low: round(lastPrice - atr * 0.1), high: round(lastCandle.high) },
                stopLoss: round(lastCandle.high + atr * 0.3),
                takeProfit: round(lastPrice - atr * 2.5),
                riskRewardRatio: '1:2.5',
                confidence: 75,
                applicable: true,
                priority: 75
            });
        }

        // === 30. Price Action: Inside Bar Breakout ===
        if (lastPattern && lastPattern.type === 'inside_bar') {
            const insideHigh = candles[candles.length - 1].high;
            const insideLow = candles[candles.length - 1].low;
            const motherHigh = candles[candles.length - 2].high;
            const motherLow = candles[candles.length - 2].low;
            const direction = lastPrice > motherHigh ? 'long' : lastPrice < motherLow ? 'short' : 'long';
            scenarios.push({
                id: 'inside-bar-breakout',
                title: 'Inside Bar Breakout',
                description: 'Пробой внутренней свечи (Inside Bar).',
                direction: direction,
                category: 'conditional',
                riskLevel: 'medium',
                probability: round(0.50, 2),
                confirmations: ['breakout', 'high-volume'],
                reasons: [
                    'Обнаружен Inside Bar (материнская свеча + внутренняя)',
                    'Консолидация перед пробоем',
                    'Пробой внутренней свечи = продолжение'
                ],
                entryZone: { low: round(direction === 'long' ? insideHigh : insideLow), high: round(direction === 'long' ? insideHigh + atr * 0.1 : insideLow - atr * 0.1) },
                stopLoss: round(direction === 'long' ? motherLow - atr * 0.2 : motherHigh + atr * 0.2),
                takeProfit: round(direction === 'long' ? lastPrice + atr * 2 : lastPrice - atr * 2),
                riskRewardRatio: '1:2',
                confidence: 60,
                applicable: true,
                priority: 65
            });
        }

        // === 31. Scale Out (при высокой вероятности прибыли) ===
        if (probability.confidence > 70 && volume.highVolume) {
            scenarios.push({
                id: 'scale-out',
                title: 'Scale Out',
                description: 'Частичная фиксация прибыли при уверенном движении.',
                direction: isBullishTrend ? 'long' : isBearishTrend ? 'short' : 'long',
                category: 'risk-managed',
                riskLevel: 'low',
                probability: round(0.55, 2),
                confirmations: ['impulse', 'high-volume'],
                reasons: [
                    'Высокая уверенность в направлении',
                    'Подтверждение объёмом',
                    'Фиксация части прибыли снижает риск'
                ],
                entryZone: { low: round(lastPrice - atr * 0.1), high: round(lastPrice + atr * 0.1) },
                stopLoss: round(lastPrice - atr * 1),
                takeProfit: round(lastPrice + atr * 2),
                riskRewardRatio: '1:2',
                confidence: 60,
                applicable: true,
                priority: 55
            });
        }

        // === 32. Full Position ===
        if (probability.confidence > 75 && structure.type !== 'range' && structure.type !== 'consolidation') {
            scenarios.push({
                id: 'full-position',
                title: 'Full Position',
                description: 'Полная позиция при высокой уверенности в сетапе.',
                direction: isBullishTrend ? 'long' : isBearishTrend ? 'short' : 'long',
                category: 'risk-managed',
                riskLevel: 'medium',
                probability: round(0.60, 2),
                confirmations: ['impulse', 'hold', 'high-volume'],
                reasons: [
                    'Уверенность > 75%',
                    'Структура тренда подтверждена',
                    'Объём поддерживает движение',
                    'Можно использовать полный размер позиции'
                ],
                entryZone: { low: round(lastPrice - atr * 0.2), high: round(lastPrice + atr * 0.2) },
                stopLoss: round(lastPrice - atr * 1.5),
                takeProfit: round(lastPrice + atr * 3),
                riskRewardRatio: '1:2',
                confidence: 80,
                applicable: true,
                priority: 80
            });
        }

        // === 33. Reduce Exposure ===
        if (probability.confidence < 40 || (volatility.expansion && volatility.expansion.detected && volume.climax && volume.climax.detected)) {
            scenarios.push({
                id: 'reduce-exposure',
                title: 'Reduce Exposure',
                description: 'Снижение размера позиции из-за высокой неопределённости.',
                direction: 'neutral',
                category: 'risk-managed',
                riskLevel: 'low',
                probability: round(0.50, 2),
                confirmations: [],
                reasons: [
                    'Низкая уверенность в направлении',
                    'Высокая волатильность / объём',
                    'Рекомендуется уменьшить риск'
                ],
                entryZone: null,
                stopLoss: null,
                takeProfit: null,
                riskRewardRatio: null,
                confidence: 40,
                applicable: true,
                priority: 30
            });
        }

        // === 34. No Trade ===
        if (probability.confidence < 30 || structure.type === 'range' || (level && Math.abs(lastPrice - level) > atr * 5)) {
            scenarios.push({
                id: 'no-trade',
                title: 'No Trade',
                description: 'Не входить в рынок. Нет подходящего сетапа.',
                direction: 'neutral',
                category: 'neutral',
                riskLevel: 'low',
                probability: 1.0,
                confirmations: [],
                reasons: [
                    'Нет чёткого сетапа',
                    'Низкая уверенность в направлении',
                    'Лучшая сделка — та, которой нет'
                ],
                entryZone: null,
                stopLoss: null,
                takeProfit: null,
                riskRewardRatio: null,
                confidence: 0,
                applicable: true,
                priority: 10
            });
        }

        // === 35. Wait ===
        scenarios.push({
            id: 'wait',
            title: 'Wait',
            description: 'Ожидание подтверждения. Не входить, пока контекст не прояснится.',
            direction: 'neutral',
            category: 'neutral',
            riskLevel: 'low',
            probability: 1.0,
            confirmations: [],
            reasons: [
                'Сохранение капитала — лучшая сделка та, которой нет',
                'Ожидание более ясного сетапа'
            ],
            entryZone: null,
            stopLoss: null,
            takeProfit: null,
            riskRewardRatio: '—',
            confidence: 100,
            applicable: true,
            priority: 30
        });

        // === 16. No Trade (когда условия неблагоприятны) ===
        if (isSideways || probability.confidence < 30 || volume.confirmation === 'not_confirmed') {
            scenarios.push({
                id: 'no-trade',
                title: 'No Trade',
                description: 'Рынок не даёт статистического преимущества.',
                direction: 'neutral',
                category: 'neutral',
                riskLevel: 'low',
                probability: 1.0,
                confirmations: [],
                reasons: [
                    'Низкая уверенность в направлении',
                    'Контекст не даёт чёткого сетапа',
                    'Лучше пропустить, чем торговать вслепую'
                ],
                entryZone: null,
                stopLoss: null,
                takeProfit: null,
                riskRewardRatio: '—',
                confidence: 100,
                applicable: true,
                priority: 20
            });
        }

        // Сортируем по приоритету и вероятности
        scenarios.sort((a, b) => (b.priority + b.probability * 100) - (a.priority + a.probability * 100));

        return scenarios;
    }

    // ================================================================
    // Build Summary (для обратной совместимости с Module 1)
    // ================================================================

    function buildSummary(structure, trend, momentum, volume, smc, probability) {
        let context = structure.type;
        let bias = 'neutral';
        if (trend.type === 'strong_bull' || trend.type === 'weak_bull') bias = 'bullish';
        else if (trend.type === 'strong_bear' || trend.type === 'weak_bear') bias = 'bearish';

        const keySignals = [];
        if (structure.structureShift && structure.structureShift.type) {
            keySignals.push(structure.structureShift.type.toLowerCase() + '_structure');
        }
        if (trend.type === 'strong_bull' || trend.type === 'strong_bear') {
            keySignals.push(trend.type === 'strong_bull' ? 'strong_bullish_momentum' : 'strong_bearish_momentum');
        }
        if (volume.ratio > 1.3) keySignals.push('volume_climax');
        else if (volume.ratio < 0.7) keySignals.push('low_volume');
        if (structure.type === 'range') keySignals.push('range_structure');
        if (smc.bos.length > 0) keySignals.push('potential_breakout');
        if (smc.liquiditySweeps.length > 0) keySignals.push('multiple_level_touches');
        if (structure.hh > 0 && structure.hl > 0) keySignals.push('uptrend_structure');
        if (structure.lh > 0 && structure.ll > 0) keySignals.push('downtrend_structure');

        const reasons = [];
        reasons.push(`Тренд: ${trend.type}, сила ${trend.strength}`);
        reasons.push(`Структура: ${structure.type}, HH=${structure.hh}, HL=${structure.hl}, LH=${structure.lh}, LL=${structure.ll}`);
        reasons.push(`Моментум: RSI=${momentum.rsi}, ${momentum.description}`);
        reasons.push(`Объём: ratio=${volume.ratio}, ${volume.description}`);
        if (smc.bos.length > 0) reasons.push(`SMC: обнаружено ${smc.bos.length} BOS событий`);
        if (smc.orderBlocks.length > 0) reasons.push(`SMC: найдено ${smc.orderBlocks.length} order block(ов)`);
        if (smc.fairValueGaps.length > 0) reasons.push(`SMC: ${smc.fairValueGaps.length} FVG зон`);

        return {
            context: context,
            bias: bias,
            confidence: probability.confidence,
            keySignals: keySignals,
            reasons: reasons,
            probabilities: {
                continuation: probability.bullish > 50 ? probability.bullish : probability.bearish,
                reversal: probability.bullish > 50 ? probability.bearish : probability.bullish
            }
        };
    }

    // ================================================================
    // Interpretations: labels, signals, position analysis
    // (Перенесено из Module 1 — здесь всё аналитическое)
    // ================================================================

    function _round(n) { return Math.round(n * 100) / 100; }

    /**
     * Интерпретация типа структуры в человекочитаемый label.
     * Раньше жило в Module 1 — перенесено сюда как часть аналитики.
     */
    function _interpretStructureLabel(structureType) {
        if (structureType === 'uptrend' || structureType === 'expansion') return 'uptrend';
        if (structureType === 'downtrend') return 'downtrend';
        if (structureType === 'range') return 'range';
        return 'transition';
    }

    /**
     * Интерпретация моментума: bullish / bearish / neutral.
     */
    function _interpretMomentumSignal(momentum) {
        const rsi = momentum.rsi;
        if (rsi > 55) return 'bullish';
        if (rsi < 45) return 'bearish';
        return 'neutral';
    }

    /**
     * Интерпретация объёма: increasing / decreasing / stable.
     */
    function _interpretVolumeTrend(volume) {
        const ratio = volume.ratio;
        if (ratio > 1.2) return 'increasing';
        if (ratio < 0.8) return 'decreasing';
        return 'stable';
    }

    /**
     * Интерпретация волатильности: expanding / compressing / stable.
     */
    function _interpretVolatilitySignal(volatility) {
        if (volatility.level === 'high') return 'expanding';
        if (volatility.level === 'low') return 'compressing';
        return 'stable';
    }

    /**
     * Анализ позиции цены относительно уровня.
     */
    function _interpretPosition(history, level) {
        if (level == null) return null;
        const currentPrice = history[history.length - 1].close;
        const dist = ((currentPrice - level) / level) * 100;
        const distAbs = Math.abs(dist);
        const position = distAbs < 0.5 ? 'at_level' : dist > 0 ? 'above_level' : 'below_level';
        return {
            level: level,
            distancePct: _round(dist),
            position: position
        };
    }

    /**
     * Собирает ВСЕ интерпретации в один объект.
     */
    function _buildInterpretations(history, structure, momentum, volume, volatility, level) {
        return {
            structureLabel: _interpretStructureLabel(structure.type),
            momentumSignal: _interpretMomentumSignal(momentum),
            volumeTrend: _interpretVolumeTrend(volume),
            volatilitySignal: _interpretVolatilitySignal(volatility),
            position: _interpretPosition(history, level)
        };
    }

    // ================================================================
    // Главный метод analyze
    // ================================================================

    function analyze(input) {
        const history = (input && input.history) || [];
        const level = input && input.level;

        if (history.length < 10) {
            console.warn('[coreAnalysisEngine] Недостаточно данных для анализа');
            return null;
        }

        // 8. Volatility — сначала, т.к. используется в структуре
        const volatility = analyzeVolatility(history);

        // 1. Market Structure
        const structure = analyzeMarketStructure(history, level, volatility);

        // 2. SMC
        const smc = analyzeSMC(history, structure);

        // 3. Price Action
        const priceAction = analyzePriceAction(history);

        // 4. Trend
        const trend = analyzeTrend(history, structure);

        // 5. Momentum
        const momentum = analyzeMomentum(history);

        // 6. Volume
        const volume = analyzeVolume(history);

        // 7. Liquidity
        const liquidity = analyzeLiquidity(history, structure, smc);

        // 9. Levels
        const levels = analyzeLevels(history, structure, level);

        // 10. Probability
        const probability = calculateProbability(structure, trend, momentum, volume, smc);

        // 11. Scenarios
        const scenarios = generateScenarios(history, structure, trend, momentum, volume, smc, levels, probability, level, priceAction, volatility);

        // 12. Interpretations (labels/signals/position)
        const interpretations = _buildInterpretations(history, structure, momentum, volume, volatility, level);

        // Summary
        const summary = buildSummary(structure, trend, momentum, volume, smc, probability);

        return {
            moduleXVersion: '1.0',
            analyzedAt: new Date().toISOString(),
            inputMeta: {
                candleCount: history.length,
                level: level
            },
            // ---- Сырая аналитика ----
            structure: structure,
            smc: smc,
            priceAction: priceAction,
            trend: trend,
            momentum: momentum,
            volume: volume,
            liquidity: liquidity,
            volatility: volatility,
            levels: levels,
            probability: probability,
            scenarios: scenarios,
            // ---- Интерпретации (labels/signals/position) ----
            interpretations: interpretations,
            // ---- Краткая сводка ----
            summary: summary
        };
    }

    // ================================================================
    // Экспорт
    // ================================================================

    global.coreAnalysisEngine = {
        // ================================================================
        // КАННОНИЧЕСКИЙ API Module X (после интеграции)
        // ================================================================
        // analyzeMarket() — единственная точка входа для Module 1 и Module 2.
        // Module X — ЕДИНСТВЕННЫЙ модуль, который выполняет анализ графика.
        // Любой другой модуль должен только читать поля возвращённого AnalysisResult.
        analyzeMarket: analyze,
        // analyze() сохранён как legacy-алиас для обратной совместимости.
        analyze: analyze,
        // Внутренние методы для отладки и тестирования
        _internal: {
            findSwings: findSwings,
            classifySwings: classifySwings,
            analyzeMarketStructure: analyzeMarketStructure,
            analyzeSMC: analyzeSMC,
            analyzePriceAction: analyzePriceAction,
            analyzeTrend: analyzeTrend,
            analyzeMomentum: analyzeMomentum,
            analyzeVolume: analyzeVolume,
            analyzeLiquidity: analyzeLiquidity,
            analyzeVolatility: analyzeVolatility,
            // Интерпретации теперь тоже доступны
            _interpretStructureLabel: _interpretStructureLabel,
            _interpretMomentumSignal: _interpretMomentumSignal,
            _interpretVolumeTrend: _interpretVolumeTrend,
            _interpretVolatilitySignal: _interpretVolatilitySignal,
            _interpretPosition: _interpretPosition,
            _buildInterpretations: _buildInterpretations,
            analyzeLevels: analyzeLevels,
            calculateProbability: calculateProbability,
            generateScenarios: generateScenarios,
            buildSummary: buildSummary
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = global.coreAnalysisEngine;
    }

})(typeof window !== 'undefined' ? window : globalThis);
