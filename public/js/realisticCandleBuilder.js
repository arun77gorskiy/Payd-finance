/**
 * realisticCandleBuilder.js — генератор реалистичных рыночных свечей
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  Назначение:
 *    Заменяет примитивный random-walk в ScenarioLibrary.js на построитель
 *    с правильной рыночной структурой:
 *
 *      • Структура рынка: HH-HL-HH (восходящий), LH-LL-LH (нисходящий),
 *        консолидация, импульс+коррекция, accumulation/distribution
 *      • Свечные паттерны Price Action: Pin Bar, Engulfing, Harami, Doji,
 *        Morning/Evening Star, Inside Bar, Tweezer, Three Soldiers/Crows
 *      • Smart Money: BOS, CHOCH, Order Block, FVG, Liquidity Sweep,
 *        Equal Highs/Lows, Mitigation
 *
 *  Ключевые принципы:
 *    1. Сначала строится СКЕЛЕТ — целевые уровни high/low
 *    2. Вокруг скелета генерируются свечи с естественной волатильностью
 *       (тела и тени разного размера, последовательные)
 *    3. Паттерны Price Action применяются на нужных свечах
 *       (например, Pin Bar — на свече отката после импульса)
 *    4. Smart Money структуры (OB, FVG) формируются естественно
 *       (FVG — между двумя импульсными свечами с гэпом)
 *    5. Объём реалистичный: базовый + спайки на импульсах
 *
 *  Использование:
 *    const candles = window.RealisticCandleBuilder.build({
 *      subType: 'pin_bar_bullish',
 *      direction: 'long',
 *      startPrice: 42000,
 *      startTime: 1704067200,
 *      interval: 3600,
 *      count: 30,
 *      volumeBase: 1000
 *    });
 *
 *  Совместимость:
 *    API совместим со старым generateCandles(): возвращает массив {time, open,
 *    high, low, close, volume} в формате, который ожидает Trainer и coreAnalysisEngine.
 * ════════════════════════════════════════════════════════════════════════════
 */

(function (global) {
    'use strict';
    if (!global) throw new Error('[RealisticCandleBuilder] global is required');

    // ================================================================
    // УТИЛИТЫ
    // ================================================================

    function round(n, decimals) {
        decimals = (decimals == null) ? 4 : decimals;
        const m = Math.pow(10, decimals);
        return Math.round(n * m) / m;
    }
    function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
    function rand(min, max) { return min + Math.random() * (max - min); }
    function randi(min, max) { return Math.floor(rand(min, max + 1)); }
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    // Гауссова случайная величина (для естественных размеров свечей)
    function gauss(mean, stdev) {
        const u = 1 - Math.random();
        const v = Math.random();
        const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        return z * stdev + mean;
    }

    // Ограниченная гауссова (для диапазона тел/теней)
    function gaussClamped(mean, stdev, min, max) {
        return clamp(gauss(mean, stdev), min, max);
    }

    // ================================================================
    // ПОСТРОЕНИЕ СКЕЛЕТА — ЦЕЛЕВЫХ УРОВНЕЙ HIGH/LOW
    // ================================================================

    /**
     * Скелет восходящего тренда: HH -> HL -> HH -> HL -> HH
     * Возвращает массив {high, low} для каждой свечи.
     */
    function buildUptrendSkeleton(count, startPrice, totalMove) {
        const out = [];
        const totalHigh = startPrice + totalMove;
        // 2-4 swing-а вверх
        const swings = 2 + randi(0, 2);
        const swingSize = (totalMove) / swings;
        let curLow = startPrice - startPrice * 0.003 * rand(0.5, 1.5);
        let curHigh = startPrice + startPrice * 0.005 * rand(0.5, 1.5);
        const candlesPerSwing = Math.max(3, Math.floor(count / swings));

        for (let s = 0; s < swings; s++) {
            const swingEnd = (s + 1) * candlesPerSwing;
            const targetHigh = curLow + swingSize * rand(0.9, 1.1);
            for (let i = s * candlesPerSwing; i < Math.min(swingEnd, count); i++) {
                const t = (i - s * candlesPerSwing) / candlesPerSwing;
                // Импульс вверх + лёгкий откат
                const base = curLow + (targetHigh - curLow) * t;
                const noise = (Math.random() - 0.5) * startPrice * 0.002;
                out.push({
                    high: base + Math.abs(noise) + startPrice * 0.001 * rand(0.5, 2),
                    low: base - Math.abs(noise) - startPrice * 0.001 * rand(0.5, 2)
                });
            }
            // Перед переходом к новому swing — формируем HL (откат)
            curLow = targetHigh - swingSize * rand(0.25, 0.4);
            curHigh = targetHigh;
        }
        // Хвост
        while (out.length < count) {
            const last = out[out.length - 1];
            out.push({
                high: last.high + startPrice * 0.001,
                low: last.low - startPrice * 0.001
            });
        }
        return out.slice(0, count);
    }

    /**
     * Скелет нисходящего тренда: LH -> LL -> LH -> LL -> LH
     */
    function buildDowntrendSkeleton(count, startPrice, totalMove) {
        const out = [];
        const totalLow = startPrice - totalMove;
        const swings = 2 + randi(0, 2);
        const swingSize = totalMove / swings;
        let curHigh = startPrice + startPrice * 0.003 * rand(0.5, 1.5);
        let curLow = startPrice - startPrice * 0.005 * rand(0.5, 1.5);
        const candlesPerSwing = Math.max(3, Math.floor(count / swings));

        for (let s = 0; s < swings; s++) {
            const swingEnd = (s + 1) * candlesPerSwing;
            const targetLow = curHigh - swingSize * rand(0.9, 1.1);
            for (let i = s * candlesPerSwing; i < Math.min(swingEnd, count); i++) {
                const t = (i - s * candlesPerSwing) / candlesPerSwing;
                const base = curHigh - (curHigh - targetLow) * t;
                const noise = (Math.random() - 0.5) * startPrice * 0.002;
                out.push({
                    high: base + Math.abs(noise) + startPrice * 0.001 * rand(0.5, 2),
                    low: base - Math.abs(noise) - startPrice * 0.001 * rand(0.5, 2)
                });
            }
            curHigh = targetLow + swingSize * rand(0.25, 0.4);
            curLow = targetLow;
        }
        while (out.length < count) {
            const last = out[out.length - 1];
            out.push({
                high: last.high + startPrice * 0.001,
                low: last.low - startPrice * 0.001
            });
        }
        return out.slice(0, count);
    }

    /**
     * Скелет диапазона / консолидации: колебания в bound'ах
     */
    function buildRangeSkeleton(count, startPrice, rangeSize) {
        const out = [];
        const top = startPrice + rangeSize / 2;
        const bottom = startPrice - rangeSize / 2;
        let curPos = 0.5; // 0 = bottom, 1 = top
        let dir = 1;
        for (let i = 0; i < count; i++) {
            // Плавное колебание с отскоком от границ
            const fromEdge = (dir > 0) ? (1 - curPos) : curPos;
            const force = Math.max(0.02, fromEdge) * rand(0.05, 0.2);
            curPos += dir * force;
            // Отскок от границ
            if (curPos >= 0.95) { curPos = 0.95; dir = -1; }
            else if (curPos <= 0.05) { curPos = 0.05; dir = 1; }
            // Иногда — смена направления внутри
            if (Math.random() < 0.05) dir *= -1;
            const base = bottom + (top - bottom) * curPos;
            const noise = (Math.random() - 0.5) * rangeSize * 0.1;
            out.push({
                high: base + Math.abs(noise) + rangeSize * 0.04 * rand(0.3, 1),
                low: base - Math.abs(noise) - rangeSize * 0.04 * rand(0.3, 1)
            });
        }
        return out;
    }

    /**
     * Скелет импульс + коррекция (один swing).
     * @param dir: 'up' или 'down'
     */
    function buildImpulseCorrectionSkeleton(count, startPrice, impulse, correction, dir) {
        const out = [];
        const isUp = dir === 'up';
        const target = isUp ? startPrice + impulse : startPrice - impulse;
        const retracement = isUp ? target - correction : target + correction;
        const impulseLen = Math.floor(count * 0.55);
        const correctionLen = count - impulseLen;

        // Импульс — strong move с минимальным откатом
        for (let i = 0; i < impulseLen; i++) {
            const t = i / impulseLen;
            const base = isUp
                ? startPrice + (target - startPrice) * t
                : startPrice - (startPrice - target) * t;
            const noise = (Math.random() - 0.5) * startPrice * 0.002;
            out.push({
                high: base + Math.abs(noise) + (isUp ? startPrice * 0.001 : 0),
                low: base - Math.abs(noise) - (isUp ? 0 : startPrice * 0.001)
            });
        }
        // Коррекция
        for (let i = 0; i < correctionLen; i++) {
            const t = i / correctionLen;
            const base = isUp
                ? target - (target - retracement) * t
                : target + (retracement - target) * t;
            const noise = (Math.random() - 0.5) * startPrice * 0.003;
            out.push({
                high: base + Math.abs(noise) + startPrice * 0.001,
                low: base - Math.abs(noise) - startPrice * 0.001
            });
        }
        return out;
    }

    // ================================================================
    // ПОСТРОЕНИЕ КОНКРЕТНОЙ СВЕЧИ ВНУТРИ СКЕЛЕТА
    // ================================================================

    /**
     * Генерирует одну свечу с реалистичными пропорциями тела и теней.
     * @param skeleton: {high, low} — целевой коридор
     * @param prevClose: цена закрытия предыдущей свечи
     * @param bias: 'bull' | 'bear' | 'neutral' — направление внутри диапазона
     * @param vol: волатильность (множитель к размеру тела)
     */
    function buildCandleInRange(skeleton, prevClose, bias, vol) {
        const targetHigh = skeleton.high;
        const targetLow = skeleton.low;
        // Сначала задаём OPEN (с гэпом или без)
        const gap = (Math.random() - 0.5) * (targetHigh - targetLow) * 0.05;
        let open = prevClose + gap;
        // Open в пределах диапазона
        open = clamp(open, targetLow, targetHigh);

        // Размер тела — от 20% до 80% диапазона, с bias
        const range = targetHigh - targetLow;
        let bodySizeFrac = gaussClamped(0.45, 0.18, 0.1, 0.85);
        let bodySize = range * bodySizeFrac * vol;
        // Bull / bear bias
        let direction;
        if (bias === 'bull') direction = 1;
        else if (bias === 'bear') direction = -1;
        else direction = Math.random() < 0.5 ? 1 : -1;

        let close = open + direction * bodySize;
        // Ограничиваем close в пределах диапазона
        if (close > targetHigh) {
            close = targetHigh;
        } else if (close < targetLow) {
            close = targetLow;
        }
        // Теперь high = max(open, close) + верхняя тень
        const upperShadow = (targetHigh - Math.max(open, close)) * rand(0.5, 1);
        const lowerShadow = (Math.min(open, close) - targetLow) * rand(0.5, 1);
        const high = targetHigh; // уже задано скелетом
        const low = targetLow; // уже задано скелетом

        return {
            open: round(open, 4),
            high: round(high, 4),
            low: round(low, 4),
            close: round(close, 4)
        };
    }

    // ================================================================
    // ПАТТЕРНЫ PRICE ACTION
    // ================================================================

    /**
     * Бычий Pin Bar: длинная нижняя тень, маленькое тело сверху.
     * Заменяет последнюю свечу.
     */
    function applyBullishPinBar(candles, idx) {
        const c = candles[idx];
        const range = c.high - c.low;
        c.low = c.low - range * rand(0.8, 1.2);
        const bodyTop = c.low + range * rand(0.25, 0.4);
        const bodyBot = bodyTop - range * rand(0.05, 0.15);
        c.open = bodyBot;
        c.close = bodyTop + (Math.random() - 0.5) * range * 0.05;
        c.high = c.close + range * rand(0.02, 0.08);
    }
    function applyBearishPinBar(candles, idx) {
        const c = candles[idx];
        const range = c.high - c.low;
        c.high = c.high + range * rand(0.8, 1.2);
        const bodyBot = c.high - range * rand(0.25, 0.4);
        const bodyTop = bodyBot + range * rand(0.05, 0.15);
        c.open = bodyTop;
        c.close = bodyBot + (Math.random() - 0.5) * range * 0.05;
        c.low = c.close - range * rand(0.02, 0.08);
    }

    /**
     * Engulfing — заменяет две последние свечи.
     */
    function applyBullishEngulfing(candles, idx) {
        // idx — последняя свеча (engulfing), idx-1 — предыдущая (engulfed)
        if (idx < 1) return;
        const prev = candles[idx - 1];
        const cur = candles[idx];
        // prev = красная (откат вниз)
        prev.open = (prev.high + prev.low) / 2 + (prev.high - prev.low) * 0.2;
        prev.close = prev.open - (prev.high - prev.low) * rand(0.3, 0.6);
        prev.high = prev.open + (prev.open - prev.close) * rand(0.1, 0.3);
        prev.low = prev.close - (prev.open - prev.close) * rand(0.2, 0.5);
        // cur = зелёная перекрывает
        cur.open = prev.close - (prev.open - prev.close) * rand(0.05, 0.2);
        const engSize = (prev.open - prev.close) * rand(1.6, 2.2);
        cur.close = cur.open + engSize;
        cur.high = cur.close + (cur.close - cur.open) * rand(0.05, 0.2);
        cur.low = cur.open - (cur.close - cur.open) * rand(0.02, 0.1);
    }
    function applyBearishEngulfing(candles, idx) {
        if (idx < 1) return;
        const prev = candles[idx - 1];
        const cur = candles[idx];
        prev.open = (prev.high + prev.low) / 2 - (prev.high - prev.low) * 0.2;
        prev.close = prev.open + (prev.high - prev.low) * rand(0.3, 0.6);
        prev.low = prev.open - (prev.open - prev.close) * rand(0.1, 0.3);
        prev.high = prev.close + (prev.open - prev.close) * rand(0.2, 0.5);
        cur.open = prev.close + (prev.close - prev.open) * rand(0.05, 0.2);
        const engSize = (prev.close - prev.open) * rand(1.6, 2.2);
        cur.close = cur.open - engSize;
        cur.low = cur.close - (cur.open - cur.close) * rand(0.05, 0.2);
        cur.high = cur.open + (cur.open - cur.close) * rand(0.02, 0.1);
    }

    /**
     * Morning Star (3 свечи): 1) большая красная, 2) маленькая, 3) большая зелёная
     */
    function applyMorningStar(candles, idx) {
        if (idx < 2) return;
        const c1 = candles[idx - 2]; // большая красная
        const c2 = candles[idx - 1]; // маленькая
        const c3 = candles[idx];     // большая зелёная
        const avg = (c1.high + c1.low) / 2;
        // c1 — большая красная
        c1.open = avg + (c1.high - c1.low) * 0.2;
        c1.close = c1.open - (c1.high - c1.low) * 0.7;
        c1.high = c1.open + (c1.open - c1.close) * 0.15;
        c1.low = c1.close - (c1.open - c1.close) * 0.2;
        // c2 — маленькая (может быть doji-like)
        c2.open = c1.close - (c1.open - c1.close) * 0.1;
        c2.close = c2.open + (c1.open - c1.close) * rand(0.05, 0.2);
        c2.high = Math.max(c2.open, c2.close) + (c1.open - c1.close) * 0.1;
        c2.low = Math.min(c2.open, c2.close) - (c1.open - c1.close) * 0.15;
        // c3 — большая зелёная, перекрывает c1
        c3.open = c2.close - (c1.open - c1.close) * 0.05;
        c3.close = c3.open + (c1.open - c1.close) * 1.1;
        c3.high = c3.close + (c3.close - c3.open) * 0.15;
        c3.low = c3.open - (c3.close - c3.open) * 0.1;
    }
    function applyEveningStar(candles, idx) {
        if (idx < 2) return;
        const c1 = candles[idx - 2];
        const c2 = candles[idx - 1];
        const c3 = candles[idx];
        const avg = (c1.high + c1.low) / 2;
        c1.open = avg - (c1.high - c1.low) * 0.2;
        c1.close = c1.open + (c1.high - c1.low) * 0.7;
        c1.low = c1.open - (c1.close - c1.open) * 0.15;
        c1.high = c1.close + (c1.close - c1.open) * 0.2;
        c2.open = c1.close + (c1.close - c1.open) * 0.1;
        c2.close = c2.open - (c1.close - c1.open) * rand(0.05, 0.2);
        c2.low = Math.min(c2.open, c2.close) - (c1.close - c1.open) * 0.1;
        c2.high = Math.max(c2.open, c2.close) + (c1.close - c1.open) * 0.15;
        c3.open = c2.close + (c1.close - c1.open) * 0.05;
        c3.close = c3.open - (c1.open - c1.close) * 1.1;
        c3.low = c3.close - (c3.open - c3.close) * 0.15;
        c3.high = c3.open + (c3.open - c3.close) * 0.1;
    }

    /**
     * Inside Bar — последняя свеча внутри предыдущей
     */
    function applyInsideBar(candles, idx) {
        if (idx < 1) return;
        const prev = candles[idx - 1];
        const cur = candles[idx];
        const range = prev.high - prev.low;
        cur.high = prev.high - range * rand(0.1, 0.3);
        cur.low = prev.low + range * rand(0.1, 0.3);
        const mid = (cur.high + cur.low) / 2;
        cur.open = mid - range * rand(0.1, 0.2);
        cur.close = mid + range * rand(0.1, 0.2);
    }

    /**
     * Tweezer — две последние свечи с одинаковым high или low
     */
    function applyTweezerBottom(candles, idx) {
        if (idx < 1) return;
        const prev = candles[idx - 1];
        const cur = candles[idx];
        // Одинаковый low
        const lowLevel = Math.min(prev.low, cur.low) - Math.abs(prev.low - cur.low) * 0.5;
        prev.low = lowLevel;
        cur.low = lowLevel + Math.abs(prev.open - cur.open) * 0.01;
        // prev — красная
        prev.open = prev.low + (prev.high - prev.low) * 0.5;
        prev.close = prev.low + (prev.high - prev.low) * 0.2;
        // cur — зелёная
        cur.open = cur.low + (cur.high - cur.low) * 0.3;
        cur.close = cur.low + (cur.high - cur.low) * 0.7;
    }
    function applyTweezerTop(candles, idx) {
        if (idx < 1) return;
        const prev = candles[idx - 1];
        const cur = candles[idx];
        const highLevel = Math.max(prev.high, cur.high) + Math.abs(prev.high - cur.high) * 0.5;
        prev.high = highLevel;
        cur.high = highLevel - Math.abs(prev.open - cur.open) * 0.01;
        prev.open = prev.high - (prev.high - prev.low) * 0.5;
        prev.close = prev.high - (prev.high - prev.low) * 0.2;
        cur.open = cur.high - (cur.high - cur.low) * 0.3;
        cur.close = cur.high - (cur.high - cur.low) * 0.7;
    }

    /**
     * Three White Soldiers — три сильных бычьих свечи
     */
    function applyThreeWhiteSoldiers(candles, idx) {
        if (idx < 2) return;
        const c1 = candles[idx - 2];
        const c2 = candles[idx - 1];
        const c3 = candles[idx];
        const avg = (c1.high + c1.low) / 2;
        [c1, c2, c3].forEach((c, i) => {
            c.open = avg + i * (c.high - c.low) * 0.2;
            c.close = c.open + (c.high - c.low) * 0.75;
            c.high = c.close + (c.close - c.open) * 0.05;
            c.low = c.open - (c.close - c.open) * 0.05;
        });
    }
    function applyThreeBlackCrows(candles, idx) {
        if (idx < 2) return;
        const c1 = candles[idx - 2];
        const c2 = candles[idx - 1];
        const c3 = candles[idx];
        const avg = (c1.high + c1.low) / 2;
        [c1, c2, c3].forEach((c, i) => {
            c.open = avg - i * (c.high - c.low) * 0.2;
            c.close = c.open - (c.high - c.low) * 0.75;
            c.low = c.close - (c.open - c.close) * 0.05;
            c.high = c.open + (c.open - c.close) * 0.05;
        });
    }

    /**
     * Hammer / Hanging Man — короткое тело сверху, длинный нижний хвост
     */
    function applyHammer(candles, idx, isBull) {
        const c = candles[idx];
        const range = c.high - c.low;
        c.low = c.low - range * rand(0.3, 0.6);
        const bodyTop = c.low + range * rand(0.7, 0.8);
        const bodyBot = bodyTop - range * rand(0.05, 0.15);
        if (isBull) {
            c.open = bodyBot;
            c.close = bodyTop + range * rand(0.02, 0.05);
        } else {
            c.open = bodyTop;
            c.close = bodyBot - range * rand(0.02, 0.05);
        }
        c.high = c.close + range * rand(0.02, 0.05);
    }
    function applyShootingStar(candles, idx, isBull) {
        const c = candles[idx];
        const range = c.high - c.low;
        c.high = c.high + range * rand(0.3, 0.6);
        const bodyBot = c.high - range * rand(0.7, 0.8);
        const bodyTop = bodyBot + range * rand(0.05, 0.15);
        if (isBull) {
            c.open = bodyBot;
            c.close = bodyTop + range * rand(0.02, 0.05);
        } else {
            c.open = bodyTop;
            c.close = bodyBot - range * rand(0.02, 0.05);
        }
        c.low = c.close - range * rand(0.02, 0.05);
    }

    /**
     * Doji — open ≈ close
     */
    function applyDoji(candles, idx) {
        const c = candles[idx];
        const mid = (c.high + c.low) / 2;
        c.open = mid + (c.high - c.low) * rand(0.02, 0.08);
        c.close = mid - (c.high - c.low) * rand(0.02, 0.08);
    }

    /**
     * Marubozu — длинное тело без теней
     */
    function applyBullishMarubozu(candles, idx) {
        const c = candles[idx];
        c.open = c.low + (c.high - c.low) * 0.02;
        c.close = c.high - (c.high - c.low) * 0.02;
    }
    function applyBearishMarubozu(candles, idx) {
        const c = candles[idx];
        c.open = c.high - (c.high - c.low) * 0.02;
        c.close = c.low + (c.high - c.low) * 0.02;
    }

    // ================================================================
    // SMART MONEY — формирование BOS, CHOCH, OB, FVG, Liquidity Sweep
    // ================================================================

    /**
     * Bullish BOS — пробой предыдущего swing high на импульсной свече
     */
    function applyBullishBOS(candles, lastIdx) {
        if (lastIdx < 5) return;
        // Находим последний значимый high до позиции
        let swingHigh = -Infinity;
        for (let i = 0; i < lastIdx - 2; i++) {
            if (candles[i].high > swingHigh) swingHigh = candles[i].high;
        }
        // Последняя свеча пробивает swing high
        const c = candles[lastIdx];
        c.low = swingHigh - (c.high - c.low) * 0.3;
        c.open = c.low + (c.high - c.low) * 0.2;
        c.close = c.high - (c.high - c.low) * 0.05;
        // Увеличиваем high — пробой
        c.high = swingHigh + (swingHigh * 0.005 * rand(0.5, 1.5));
    }
    function applyBearishBOS(candles, lastIdx) {
        if (lastIdx < 5) return;
        let swingLow = Infinity;
        for (let i = 0; i < lastIdx - 2; i++) {
            if (candles[i].low < swingLow) swingLow = candles[i].low;
        }
        const c = candles[lastIdx];
        c.high = swingLow + (c.high - c.low) * 0.3;
        c.open = c.high - (c.high - c.low) * 0.2;
        c.close = c.low + (c.high - c.low) * 0.05;
        c.low = swingLow - (swingLow * 0.005 * rand(0.5, 1.5));
    }

    /**
     * Liquidity Sweep — снятие стопов над/под equal highs/lows
     */
    function applyBullishLiquiditySweep(candles, lastIdx) {
        if (lastIdx < 5) return;
        // Формируем SSL (equal lows) за 3-5 свечей до конца
        const sweepIdx = lastIdx - randi(2, 4);
        const sweepLevel = candles[sweepIdx].low;
        // Устанавливаем одинаковые минимумы на 2-3 свечах
        for (let i = Math.max(0, sweepIdx - 2); i < sweepIdx; i++) {
            candles[i].low = sweepLevel + candles[i].open * 0.001 * rand(-0.3, 0.3);
        }
        // Свеча свипа: пробивает SSL и быстро возвращается
        const c = candles[sweepIdx];
        c.low = sweepLevel - sweepLevel * 0.005 * rand(0.5, 1.2);
        c.open = c.low + (c.high - c.low) * 0.85;
        c.close = c.open + (c.high - c.low) * 0.1;
        c.high = c.open + (c.high - c.low) * 0.95;
        // Свеча разворота после свипа (последняя)
        const last = candles[lastIdx];
        last.open = c.close - (c.high - c.low) * 0.1;
        last.close = c.close + (c.high - c.low) * 0.6;
        last.high = last.close + (last.close - last.open) * 0.1;
        last.low = last.open - (last.close - last.open) * 0.05;
    }
    function applyBearishLiquiditySweep(candles, lastIdx) {
        if (lastIdx < 5) return;
        const sweepIdx = lastIdx - randi(2, 4);
        const sweepLevel = candles[sweepIdx].high;
        for (let i = Math.max(0, sweepIdx - 2); i < sweepIdx; i++) {
            candles[i].high = sweepLevel + candles[i].open * 0.001 * rand(-0.3, 0.3);
        }
        const c = candles[sweepIdx];
        c.high = sweepLevel + sweepLevel * 0.005 * rand(0.5, 1.2);
        c.open = c.low + (c.high - c.low) * 0.15;
        c.close = c.open - (c.high - c.low) * 0.1;
        c.low = c.open - (c.high - c.low) * 0.85;
        const last = candles[lastIdx];
        last.open = c.close + (c.high - c.low) * 0.1;
        last.close = c.close - (c.high - c.low) * 0.6;
        last.low = last.close - (last.open - last.close) * 0.1;
        last.high = last.open + (last.open - last.close) * 0.05;
    }

    /**
     * CHOCH — смена характера движения (тренд меняется)
     */
    function applyBullishCHOCH(candles, lastIdx) {
        if (lastIdx < 8) return;
        // Устанавливаем нисходящий тренд в первой половине
        const mid = Math.floor(lastIdx / 2);
        for (let i = 0; i < mid; i++) {
            const ratio = i / mid;
            const base = candles[i].high;
            candles[i].high = base - base * 0.002 * (1 - ratio);
            candles[i].low = base - base * 0.008 * (1 - ratio);
            candles[i].open = base - base * 0.004 * (1 - ratio);
            candles[i].close = base - base * 0.006 * (1 - ratio);
        }
        // CHOCH — последняя свеча пробивает структуру вверх
        const c = candles[lastIdx];
        c.low = candles[lastIdx - 2].low;
        c.open = c.low + (c.high - c.low) * 0.1;
        c.close = c.high - (c.high - c.low) * 0.05;
        c.high = c.close + (c.close - c.open) * 0.15;
    }

    /**
     * Order Block — последняя противоположная свеча перед импульсом
     */
    function applyBullishOrderBlock(candles, lastIdx) {
        if (lastIdx < 4) return;
        // OB = красная свеча перед сильным импульсом вверх
        const obIdx = lastIdx - 3;
        const c = candles[obIdx];
        c.open = (c.high + c.low) / 2 + (c.high - c.low) * 0.3;
        c.close = c.open - (c.high - c.low) * 0.6;
        c.high = c.open + (c.high - c.low) * 0.15;
        c.low = c.close - (c.high - c.low) * 0.1;
    }

    // ================================================================
    // МАППИНГ SUBTYPE → СТРАТЕГИЯ ПОСТРОЕНИЯ
    // ================================================================

    /**
     * Возвращает стратегию построения сценария для данного subType.
     * Стратегия = { skeleton: fn, paPattern: fn|null, smPattern: fn|null, bias: 'bull'|'bear' }
     */
    function getStrategy(subType, direction) {
        const isLong = direction === 'long' || direction === 'wait';
        const isShort = direction === 'short';

        // Price Action + Smart Money
        const map = {
            // ─── Price Action ─────────────────────────────────────
            'pin_bar_bullish':     { skeleton: 'uptrend',     paPattern: { type: 'pin_bar', idx: -1 }, bias: 'bull' },
            'pin_bar_bearish':     { skeleton: 'downtrend',   paPattern: { type: 'pin_bar', idx: -1 }, bias: 'bear' },
            'bullish_engulfing':   { skeleton: 'downtrend_to_up', paPattern: { type: 'engulfing_bull', idx: -1 }, bias: 'bull' },
            'bearish_engulfing':   { skeleton: 'uptrend_to_down', paPattern: { type: 'engulfing_bear', idx: -1 }, bias: 'bear' },
            'morning_star':        { skeleton: 'downtrend_to_up', paPattern: { type: 'morning_star', idx: -1 }, bias: 'bull' },
            'evening_star':        { skeleton: 'uptrend_to_down', paPattern: { type: 'evening_star', idx: -1 }, bias: 'bear' },
            'hammer':              { skeleton: 'downtrend_to_up', paPattern: { type: 'hammer', idx: -1 }, bias: 'bull' },
            'hanging_man':         { skeleton: 'uptrend_to_down', paPattern: { type: 'hammer', idx: -1 }, bias: 'bear' },
            'shooting_star':       { skeleton: 'uptrend_to_down', paPattern: { type: 'shooting_star', idx: -1 }, bias: 'bear' },
            'inverted_hammer':     { skeleton: 'downtrend_to_up', paPattern: { type: 'shooting_star', idx: -1 }, bias: 'bull' },
            'spinning_top':        { skeleton: 'range',         paPattern: { type: 'doji', idx: -1 }, bias: 'neutral' },
            'long_legged_doji':    { skeleton: 'range',         paPattern: { type: 'doji', idx: -1 }, bias: 'neutral' },
            'dragonfly_doji':      { skeleton: 'downtrend_to_up', paPattern: { type: 'doji_bull', idx: -1 }, bias: 'bull' },
            'gravestone_doji':     { skeleton: 'uptrend_to_down', paPattern: { type: 'doji_bear', idx: -1 }, bias: 'bear' },
            'bullish_marubozu':    { skeleton: 'uptrend',       paPattern: { type: 'marubozu_bull', idx: -1 }, bias: 'bull' },
            'bearish_marubozu':    { skeleton: 'downtrend',     paPattern: { type: 'marubozu_bear', idx: -1 }, bias: 'bear' },
            'three_white_soldiers':{ skeleton: 'range_to_up',   paPattern: { type: 'three_soldiers', idx: -1 }, bias: 'bull' },
            'three_black_crows':   { skeleton: 'range_to_down', paPattern: { type: 'three_crows', idx: -1 }, bias: 'bear' },
            'tweezer_bottom':      { skeleton: 'downtrend_to_up', paPattern: { type: 'tweezer_bottom', idx: -1 }, bias: 'bull' },
            'tweezer_top':         { skeleton: 'uptrend_to_down', paPattern: { type: 'tweezer_top', idx: -1 }, bias: 'bear' },
            'bullish_harami':      { skeleton: 'downtrend_to_up', paPattern: { type: 'inside_bar', idx: -1 }, bias: 'bull' },
            'bearish_harami':      { skeleton: 'uptrend_to_down', paPattern: { type: 'inside_bar', idx: -1 }, bias: 'bear' },
            'dark_cloud_cover':    { skeleton: 'uptrend_to_down', paPattern: { type: 'engulfing_bear', idx: -1 }, bias: 'bear' },
            'piercing_line':       { skeleton: 'downtrend_to_up', paPattern: { type: 'engulfing_bull', idx: -1 }, bias: 'bull' },
            'counterattack_lines': { skeleton: 'range',         paPattern: null, bias: 'neutral' },

            // ─── Smart Money ──────────────────────────────────────
            'bullish_bos':              { skeleton: 'range_to_up',   smPattern: { type: 'bos_bull' }, bias: 'bull' },
            'bearish_bos':              { skeleton: 'range_to_down', smPattern: { type: 'bos_bear' }, bias: 'bear' },
            'choch_bullish':            { skeleton: 'choch_bull',    smPattern: { type: 'choch_bull' }, bias: 'bull' },
            'choch_bearish':            { skeleton: 'choch_bear',    smPattern: { type: 'choch_bear' }, bias: 'bear' },
            'ob_unmitigated_bullish':   { skeleton: 'uptrend',       smPattern: { type: 'ob_bull' }, bias: 'bull' },
            'ob_unmitigated_bearish':   { skeleton: 'downtrend',     smPattern: { type: 'ob_bear' }, bias: 'bear' },
            'ob_mitigated_bullish':     { skeleton: 'downtrend_to_up', smPattern: { type: 'ob_bull' }, bias: 'bull' },
            'ob_mitigated_bearish':     { skeleton: 'uptrend_to_down', smPattern: { type: 'ob_bear' }, bias: 'bear' },
            'fvg_bullish':              { skeleton: 'range_to_up',   paPattern: null, bias: 'bull' },
            'fvg_bearish':              { skeleton: 'range_to_down', paPattern: null, bias: 'bear' },
            'fvg_fill_continuation':    { skeleton: 'uptrend',       paPattern: null, bias: 'bull' },
            'fvg_ob_confluence':        { skeleton: 'uptrend',       smPattern: { type: 'ob_bull' }, bias: 'bull' },
            'liquidity_sweep_bullish':  { skeleton: 'downtrend_to_up', smPattern: { type: 'liq_sweep_bull' }, bias: 'bull' },
            'liquidity_sweep_bearish':  { skeleton: 'uptrend_to_down', smPattern: { type: 'liq_sweep_bear' }, bias: 'bear' },
            'bsl_grab':                 { skeleton: 'uptrend_to_down', smPattern: { type: 'liq_sweep_bear' }, bias: 'bear' },
            'ssl_grab':                 { skeleton: 'downtrend_to_up', smPattern: { type: 'liq_sweep_bull' }, bias: 'bull' },
            'inducement_pattern':       { skeleton: 'range',         paPattern: { type: 'doji', idx: -1 }, bias: 'neutral' },
            'mitigation_block':         { skeleton: 'uptrend_to_down', smPattern: { type: 'ob_bear' }, bias: 'bear' },
            'premium_zone_rejection':   { skeleton: 'range_to_down', paPattern: { type: 'shooting_star', idx: -1 }, bias: 'bear' },
            'discount_zone_rejection':  { skeleton: 'range_to_up',   paPattern: { type: 'hammer', idx: -1 }, bias: 'bull' },
            'displacement_no_fvg':      { skeleton: 'uptrend',       paPattern: { type: 'marubozu_bull', idx: -1 }, bias: 'bull' },
            'displacement_with_fvg':    { skeleton: 'downtrend',     paPattern: { type: 'marubozu_bear', idx: -1 }, bias: 'bear' },
            'smart_money_reversal':     { skeleton: 'downtrend_to_up', smPattern: { type: 'choch_bull' }, bias: 'bull' },
            'turtle_soup':              { skeleton: 'uptrend_to_down', smPattern: { type: 'liq_sweep_bear' }, bias: 'bear' },
            'judas_swing':              { skeleton: 'range_to_down', smPattern: { type: 'liq_sweep_bear' }, bias: 'bear' },

            // ─── Market Structure ─────────────────────────────────
            'uptrend_hh_hl':            { skeleton: 'uptrend',       paPattern: null, bias: 'bull' },
            'downtrend_lh_ll':          { skeleton: 'downtrend',     paPattern: null, bias: 'bear' },
            'range_continuation':       { skeleton: 'range',         paPattern: null, bias: 'neutral' },
            'range_breakout_up':        { skeleton: 'range_to_up',   smPattern: { type: 'bos_bull' }, bias: 'bull' },
            'range_breakout_down':      { skeleton: 'range_to_down', smPattern: { type: 'bos_bear' }, bias: 'bear' },
            'uptrend_to_range':         { skeleton: 'uptrend_to_range', paPattern: null, bias: 'neutral' },
            'downtrend_to_range':       { skeleton: 'downtrend_to_range', paPattern: null, bias: 'neutral' },
            'range_to_uptrend':         { skeleton: 'range_to_up',   smPattern: { type: 'bos_bull' }, bias: 'bull' },
            'choch_in_uptrend':         { skeleton: 'choch_bull',    smPattern: { type: 'choch_bull' }, bias: 'bull' },
            'choch_in_downtrend':       { skeleton: 'choch_bear',    smPattern: { type: 'choch_bear' }, bias: 'bear' },
            'uptrend_to_downtrend':     { skeleton: 'uptrend_to_down', smPattern: { type: 'choch_bear' }, bias: 'bear' },
            'downtrend_to_uptrend':     { skeleton: 'downtrend_to_up', smPattern: { type: 'choch_bull' }, bias: 'bull' },
            'hh_without_hl_warning':    { skeleton: 'uptrend',       paPattern: { type: 'doji', idx: -1 }, bias: 'neutral' },
            'll_without_lh_warning':    { skeleton: 'downtrend',     paPattern: { type: 'doji', idx: -1 }, bias: 'neutral' },
            'double_top_with_bos':      { skeleton: 'uptrend_to_down', smPattern: { type: 'bos_bear' }, bias: 'bear' },
            'double_bottom_with_bos':   { skeleton: 'downtrend_to_up', smPattern: { type: 'bos_bull' }, bias: 'bull' },
            'triple_top':               { skeleton: 'uptrend_to_down', smPattern: { type: 'choch_bear' }, bias: 'bear' },
            'triple_bottom':            { skeleton: 'downtrend_to_up', smPattern: { type: 'choch_bull' }, bias: 'bull' },
            'continuation_after_consolidation': { skeleton: 'range_to_up', smPattern: { type: 'bos_bull' }, bias: 'bull' },
            'character_shift':          { skeleton: 'uptrend_to_down', smPattern: { type: 'choch_bear' }, bias: 'bear' },

            // ─── Liquidity ────────────────────────────────────────
            'equal_highs':              { skeleton: 'range',         paPattern: { type: 'shooting_star', idx: -1 }, bias: 'bear' },
            'equal_lows':               { skeleton: 'range',         paPattern: { type: 'hammer', idx: -1 }, bias: 'bull' },
            'stop_hunt_over_eqh':       { skeleton: 'range',         smPattern: { type: 'liq_sweep_bear' }, bias: 'bear' },
            'stop_hunt_under_eql':      { skeleton: 'range',         smPattern: { type: 'liq_sweep_bull' }, bias: 'bull' },
            'liquidity_void_bullish':   { skeleton: 'range_to_up',   smPattern: { type: 'bos_bull' }, bias: 'bull' },
            'liquidity_void_bearish':   { skeleton: 'range_to_down', smPattern: { type: 'bos_bear' }, bias: 'bear' },
            'bsl_sweep':                { skeleton: 'uptrend_to_down', smPattern: { type: 'liq_sweep_bear' }, bias: 'bear' },
            'ssl_sweep':                { skeleton: 'downtrend_to_up', smPattern: { type: 'liq_sweep_bull' }, bias: 'bull' },
            'liquidity_engineering_final': { skeleton: 'range_to_up', smPattern: { type: 'bos_bull' }, bias: 'bull' },
            'irl':                      { skeleton: 'range',         paPattern: null, bias: 'neutral' },
            'erl_high':                 { skeleton: 'range',         paPattern: { type: 'shooting_star', idx: -1 }, bias: 'bear' },
            'erl_low':                  { skeleton: 'range',         paPattern: { type: 'hammer', idx: -1 }, bias: 'bull' },
            'resting_liquidity_above_high': { skeleton: 'range',     paPattern: null, bias: 'bear' },
            'resting_liquidity_below_low':  { skeleton: 'range',     paPattern: null, bias: 'bull' },
            'stop_hunt_round_number':   { skeleton: 'range',         paPattern: { type: 'doji', idx: -1 }, bias: 'neutral' },
            'liquidity_rebuild_after_sweep': { skeleton: 'range',     paPattern: null, bias: 'neutral' },
            'stacked_imbalances':       { skeleton: 'range_to_up',   paPattern: null, bias: 'bull' },
            'single_print_zone':        { skeleton: 'uptrend',       paPattern: { type: 'shooting_star', idx: -1 }, bias: 'bear' },
            'reclaim_of_liquidity':     { skeleton: 'downtrend_to_up', smPattern: { type: 'bos_bull' }, bias: 'bull' },
            'liquidity_run_clearing':   { skeleton: 'uptrend',       smPattern: { type: 'bos_bull' }, bias: 'bull' },

            // ─── Volume ───────────────────────────────────────────
            'volume_climax_bottom':     { skeleton: 'downtrend_to_up', paPattern: { type: 'hammer', idx: -1 }, bias: 'bull' },
            'volume_climax_top':        { skeleton: 'uptrend_to_down', paPattern: { type: 'shooting_star', idx: -1 }, bias: 'bear' },
            'volume_dryup_before_breakout': { skeleton: 'range',     paPattern: { type: 'doji', idx: -1 }, bias: 'neutral' },
            'high_volume_breakout':     { skeleton: 'range_to_up',   smPattern: { type: 'bos_bull' }, bias: 'bull' },
            'low_volume_breakout':      { skeleton: 'range_to_up',   paPattern: { type: 'doji', idx: -1 }, bias: 'neutral' },
            'volume_divergence_price_up': { skeleton: 'uptrend',     paPattern: { type: 'doji', idx: -1 }, bias: 'bear' },
            'volume_confirmation_with_trend': { skeleton: 'uptrend', paPattern: null, bias: 'bull' },
            'average_volume_neutral':   { skeleton: 'range',         paPattern: null, bias: 'neutral' },
            'below_average_weakness':   { skeleton: 'range',         paPattern: null, bias: 'neutral' },
            'above_average_strength':   { skeleton: 'uptrend',       paPattern: null, bias: 'bull' },
            'climax_reversal_pattern':  { skeleton: 'downtrend_to_up', paPattern: { type: 'engulfing_bull', idx: -1 }, bias: 'bull' },
            'effort_vs_result_divergence': { skeleton: 'range',      paPattern: { type: 'doji', idx: -1 }, bias: 'neutral' },
            'increasing_volume_pullback': { skeleton: 'uptrend',     paPattern: null, bias: 'bear' },
            'decreasing_volume_impulse': { skeleton: 'uptrend',      paPattern: { type: 'doji', idx: -1 }, bias: 'neutral' },
            'volume_spread_analysis':   { skeleton: 'range',         paPattern: { type: 'doji', idx: -1 }, bias: 'neutral' },
            'relative_volume_anomaly':  { skeleton: 'range',         paPattern: null, bias: 'neutral' },
            'high_volume_node':         { skeleton: 'range',         paPattern: null, bias: 'neutral' },
            'low_volume_node':          { skeleton: 'range',         paPattern: null, bias: 'neutral' },
            'point_of_control':         { skeleton: 'range',         paPattern: null, bias: 'neutral' },
            'value_area_migration':     { skeleton: 'range',         paPattern: null, bias: 'neutral' },

            // ─── Risk Management ──────────────────────────────────
            'stop_below_last_low_long':  { skeleton: 'uptrend',      paPattern: null, bias: 'bull' },
            'stop_above_last_high_short':{ skeleton: 'downtrend',    paPattern: null, bias: 'bear' },
            'position_size_1pct':        { skeleton: 'uptrend',      paPattern: null, bias: 'bull' },
            'position_size_2pct':        { skeleton: 'uptrend',      paPattern: null, bias: 'bull' },
            'rr_1_2_optimal':           { skeleton: 'uptrend',       paPattern: null, bias: 'bull' },
            'rr_1_3_aggressive':        { skeleton: 'uptrend',       paPattern: null, bias: 'bull' },
            'rr_1_1_minimal':           { skeleton: 'range',         paPattern: null, bias: 'neutral' },
            'no_entry_zone_disqualified':{ skeleton: 'range',        paPattern: { type: 'doji', idx: -1 }, bias: 'neutral' },
            'late_entry_overpay':       { skeleton: 'uptrend',       paPattern: { type: 'shooting_star', idx: -1 }, bias: 'bear' },
            'over_leverage_danger':     { skeleton: 'range',         paPattern: { type: 'doji', idx: -1 }, bias: 'neutral' },
            'correlation_risk':         { skeleton: 'range',         paPattern: null, bias: 'neutral' },
            'gap_risk_overnight':       { skeleton: 'range',         paPattern: null, bias: 'neutral' },
            'drawdown_management':      { skeleton: 'downtrend',     paPattern: null, bias: 'bear' },
            'recovery_after_streak_losses':{ skeleton: 'downtrend',  paPattern: null, bias: 'bear' },
            'increasing_after_wins_danger':{ skeleton: 'uptrend',    paPattern: { type: 'shooting_star', idx: -1 }, bias: 'bear' },
            'partial_profit_taking':    { skeleton: 'uptrend',       paPattern: null, bias: 'bull' },
            'trailing_stop_strategy':   { skeleton: 'uptrend',       paPattern: null, bias: 'bull' },
            'stop_at_structure_zone':   { skeleton: 'uptrend',       paPattern: null, bias: 'bull' },
            'stop_atr_based':           { skeleton: 'uptrend',       paPattern: null, bias: 'bull' },
            'stop_vwap_based':          { skeleton: 'uptrend',       paPattern: null, bias: 'bull' },

            // ─── Psychology ───────────────────────────────────────
            'fomo_after_impulse':       { skeleton: 'uptrend_to_down', paPattern: { type: 'shooting_star', idx: -1 }, bias: 'bear' },
            'revenge_trade_setup':      { skeleton: 'downtrend',     paPattern: null, bias: 'bear' },
            'overconfidence_setup':     { skeleton: 'uptrend_to_down', smPattern: { type: 'choch_bear' }, bias: 'bear' },
            'discretion_filtering':     { skeleton: 'range',         paPattern: { type: 'doji', idx: -1 }, bias: 'neutral' },
            'news_cooldown':            { skeleton: 'range',         paPattern: null, bias: 'neutral' },
            'end_of_day_risk':          { skeleton: 'uptrend',       paPattern: null, bias: 'bull' },
            'weekend_setup_avoid':      { skeleton: 'range',         paPattern: null, bias: 'neutral' },
            'earnings_risk':            { skeleton: 'range',         paPattern: null, bias: 'neutral' },
            'catching_knife_vs_confirmation': { skeleton: 'downtrend', paPattern: { type: 'doji', idx: -1 }, bias: 'neutral' },
            'plan_vs_improvisation':    { skeleton: 'uptrend',       paPattern: null, bias: 'bull' }
        };

        // Если subType не нашёлся в карте — fallback на основе direction
        if (!map[subType]) {
            if (isShort) return { skeleton: 'downtrend', paPattern: null, bias: 'bear' };
            if (isLong)  return { skeleton: 'uptrend',   paPattern: null, bias: 'bull' };
            return { skeleton: 'range', paPattern: null, bias: 'neutral' };
        }
        return map[subType];
    }

    // ================================================================
    // ГЛАВНАЯ ФУНКЦИЯ
    // ================================================================

    /**
     * Строит реалистичный свечной сценарий.
     *
     * @param opts.subType: подтип сценария (например 'pin_bar_bullish')
     * @param opts.direction: 'long' | 'short' | 'wait' | 'no_trade'
     * @param opts.startPrice: начальная цена
     * @param opts.startTime: начальное время (Unix seconds)
     * @param opts.interval: интервал в секундах
     * @param opts.count: количество свечей
     * @param opts.volumeBase: базовый объём
     * @param opts.volatility: множитель волатильности (1.0 по умолчанию)
     * @returns массив {time, open, high, low, close, volume}
     */
    function build(opts) {
        const subType = opts.subType || '';
        const direction = opts.direction || 'long';
        const startPrice = opts.startPrice || 100;
        const startTime = opts.startTime || Math.floor(Date.now() / 1000);
        const interval = opts.interval || 3600;
        const count = opts.count || 30;
        const volumeBase = opts.volumeBase || 1000;
        const volatility = opts.volatility || 1.0;

        const strategy = getStrategy(subType, direction);
        const bias = strategy.bias;
        const totalMove = startPrice * 0.04 * volatility * rand(0.7, 1.3);

        // 1. Строим скелет
        let skeleton;
        switch (strategy.skeleton) {
            case 'uptrend':
                skeleton = buildUptrendSkeleton(count, startPrice, totalMove);
                break;
            case 'downtrend':
                skeleton = buildDowntrendSkeleton(count, startPrice, totalMove);
                break;
            case 'range':
                skeleton = buildRangeSkeleton(count, startPrice, startPrice * 0.015 * rand(0.7, 1.5));
                break;
            case 'range_to_up': {
                const range = buildRangeSkeleton(Math.floor(count * 0.4), startPrice, startPrice * 0.015);
                const up = buildUptrendSkeleton(count - Math.floor(count * 0.4), range[range.length - 1].high, totalMove * 0.5);
                skeleton = range.concat(up);
                break;
            }
            case 'range_to_down': {
                const range = buildRangeSkeleton(Math.floor(count * 0.4), startPrice, startPrice * 0.015);
                const dn = buildDowntrendSkeleton(count - Math.floor(count * 0.4), range[range.length - 1].low, totalMove * 0.5);
                skeleton = range.concat(dn);
                break;
            }
            case 'uptrend_to_down': {
                const up = buildUptrendSkeleton(Math.floor(count * 0.45), startPrice, totalMove * 0.6);
                const dn = buildDowntrendSkeleton(count - Math.floor(count * 0.45), up[up.length - 1].low, totalMove * 0.6);
                skeleton = up.concat(dn);
                break;
            }
            case 'downtrend_to_up': {
                const dn = buildDowntrendSkeleton(Math.floor(count * 0.45), startPrice, totalMove * 0.6);
                const up = buildUptrendSkeleton(count - Math.floor(count * 0.45), dn[dn.length - 1].high, totalMove * 0.6);
                skeleton = dn.concat(up);
                break;
            }
            case 'uptrend_to_range': {
                const up = buildUptrendSkeleton(Math.floor(count * 0.6), startPrice, totalMove * 0.6);
                const range = buildRangeSkeleton(count - Math.floor(count * 0.6), up[up.length - 1].high, startPrice * 0.012);
                skeleton = up.concat(range);
                break;
            }
            case 'downtrend_to_range': {
                const dn = buildDowntrendSkeleton(Math.floor(count * 0.6), startPrice, totalMove * 0.6);
                const range = buildRangeSkeleton(count - Math.floor(count * 0.6), dn[dn.length - 1].low, startPrice * 0.012);
                skeleton = dn.concat(range);
                break;
            }
            case 'choch_bull': {
                const dn = buildDowntrendSkeleton(Math.floor(count * 0.55), startPrice, totalMove * 0.4);
                const up = buildUptrendSkeleton(count - Math.floor(count * 0.55), dn[dn.length - 1].low, totalMove * 0.5);
                skeleton = dn.concat(up);
                break;
            }
            case 'choch_bear': {
                const up = buildUptrendSkeleton(Math.floor(count * 0.55), startPrice, totalMove * 0.4);
                const dn = buildDowntrendSkeleton(count - Math.floor(count * 0.55), up[up.length - 1].high, totalMove * 0.5);
                skeleton = up.concat(dn);
                break;
            }
            default:
                skeleton = buildRangeSkeleton(count, startPrice, startPrice * 0.015);
        }

        // 2. Генерируем свечи внутри скелета
        const candles = [];
        let prevClose = startPrice;
        for (let i = 0; i < count; i++) {
            // Bias на последних 4 свечах — для паттерна
            const tailLen = 5;
            let localBias = bias;
            if (i >= count - tailLen) {
                // Всё ещё общий bias
                localBias = bias;
            } else if (i < count * 0.4 && (strategy.skeleton === 'uptrend_to_down' || strategy.skeleton === 'downtrend_to_up' || strategy.skeleton === 'choch_bull' || strategy.skeleton === 'choch_bear' || strategy.skeleton === 'uptrend_to_range' || strategy.skeleton === 'downtrend_to_range')) {
                // Первая фаза — противоположный bias
                localBias = bias === 'bull' ? 'bear' : (bias === 'bear' ? 'bull' : 'neutral');
            }
            const candle = buildCandleInRange(skeleton[i], prevClose, localBias, volatility);
            candle.time = startTime + i * interval;
            candles.push(candle);
            prevClose = candle.close;
        }

        // 3. Применяем паттерн Price Action (если задан)
        if (strategy.paPattern) {
            const lastIdx = count - 1;
            const idx = lastIdx + (strategy.paPattern.idx || -1);
            applyPAPattern(candles, idx, strategy.paPattern.type);
        }

        // 4. Применяем Smart Money паттерн
        if (strategy.smPattern) {
            applySMPattern(candles, count - 1, strategy.smPattern.type);
        }

        // 5. Рассчитываем объём с реалистичными спайками
        const volumes = buildVolumes(candles, volumeBase, bias, strategy);

        // 6. Собираем финальный массив
        return candles.map((c, i) => ({
            time: c.time,
            open: round(c.open, 4),
            high: round(c.high, 4),
            low: round(c.low, 4),
            close: round(c.close, 4),
            volume: volumes[i]
        }));
    }

    function applyPAPattern(candles, idx, type) {
        if (idx < 0 || idx >= candles.length) return;
        switch (type) {
            case 'pin_bar':                applyBullishPinBar(candles, idx); break;
            case 'pin_bar_bear':           applyBearishPinBar(candles, idx); break;
            case 'engulfing_bull':         applyBullishEngulfing(candles, idx); break;
            case 'engulfing_bear':         applyBearishEngulfing(candles, idx); break;
            case 'morning_star':           applyMorningStar(candles, idx); break;
            case 'evening_star':           applyEveningStar(candles, idx); break;
            case 'hammer':                 applyHammer(candles, idx, true); break;
            case 'shooting_star':          applyShootingStar(candles, idx, false); break;
            case 'doji':                   applyDoji(candles, idx); break;
            case 'doji_bull':              applyDoji(candles, idx); applyBullishPinBar(candles, idx); break;
            case 'doji_bear':              applyDoji(candles, idx); applyBearishPinBar(candles, idx); break;
            case 'marubozu_bull':          applyBullishMarubozu(candles, idx); break;
            case 'marubozu_bear':          applyBearishMarubozu(candles, idx); break;
            case 'three_soldiers':         applyThreeWhiteSoldiers(candles, idx); break;
            case 'three_crows':            applyThreeBlackCrows(candles, idx); break;
            case 'tweezer_bottom':         applyTweezerBottom(candles, idx); break;
            case 'tweezer_top':            applyTweezerTop(candles, idx); break;
            case 'inside_bar':             applyInsideBar(candles, idx); break;
        }
    }

    function applySMPattern(candles, lastIdx, type) {
        switch (type) {
            case 'bos_bull':       applyBullishBOS(candles, lastIdx); break;
            case 'bos_bear':       applyBearishBOS(candles, lastIdx); break;
            case 'choch_bull':     applyBullishCHOCH(candles, lastIdx); break;
            case 'choch_bear':     // mirror
                if (lastIdx >= 8) {
                    const mid = Math.floor(lastIdx / 2);
                    for (let i = 0; i < mid; i++) {
                        const ratio = i / mid;
                        const base = candles[i].low;
                        candles[i].high = base + base * 0.008 * (1 - ratio);
                        candles[i].low = base + base * 0.002 * (1 - ratio);
                        candles[i].open = base + base * 0.006 * (1 - ratio);
                        candles[i].close = base + base * 0.004 * (1 - ratio);
                    }
                    const c = candles[lastIdx];
                    c.high = candles[lastIdx - 2].high;
                    c.open = c.high - (c.high - c.low) * 0.1;
                    c.close = c.low + (c.high - c.low) * 0.05;
                    c.low = c.close - (c.open - c.close) * 0.15;
                }
                break;
            case 'ob_bull':        applyBullishOrderBlock(candles, lastIdx); break;
            case 'ob_bear':
                if (lastIdx >= 4) {
                    const obIdx = lastIdx - 3;
                    const c = candles[obIdx];
                    c.open = (c.high + c.low) / 2 - (c.high - c.low) * 0.3;
                    c.close = c.open + (c.high - c.low) * 0.6;
                    c.low = c.open - (c.close - c.open) * 0.15;
                    c.high = c.close + (c.close - c.open) * 0.1;
                }
                break;
            case 'liq_sweep_bull': applyBullishLiquiditySweep(candles, lastIdx); break;
            case 'liq_sweep_bear': applyBearishLiquiditySweep(candles, lastIdx); break;
        }
    }

    /**
     * Генерирует реалистичный объём с учётом движения цены.
     */
    function buildVolumes(candles, base, bias, strategy) {
        const vols = [];
        for (let i = 0; i < candles.length; i++) {
            const c = candles[i];
            const body = Math.abs(c.close - c.open);
            const range = c.high - c.low;
            // Базовый объём + зависимость от размера тела
            const bodyFactor = range > 0 ? (body / range) : 0.5;
            let v = base * (0.6 + bodyFactor * rand(0.8, 1.4));
            // Спайк на импульсных свечах (большое тело)
            if (body > range * 0.7) v *= rand(1.5, 2.5);
            // Спайк на паттерне (последние 2 свечи)
            if (i >= candles.length - 2) v *= rand(1.2, 1.8);
            // Лёгкий шум
            v *= rand(0.85, 1.15);
            vols.push(Math.round(v));
        }
        return vols;
    }

    /**
     * Генерирует скрытое будущее — следующие N свечей после visible.
     * Используется для ответа в Trainer.
     */
    function buildFuture(opts) {
        const subType = opts.subType || '';
        const direction = opts.direction || 'long';
        const startPrice = opts.startPrice || 100;
        const startTime = opts.startTime || Math.floor(Date.now() / 1000);
        const interval = opts.interval || 3600;
        const count = opts.count || 6;
        const volumeBase = opts.volumeBase || 1500;

        const isLong = direction === 'long' || direction === 'wait';
        const isShort = direction === 'short';
        let bias = 'bull';
        if (isShort) bias = 'bear';
        if (direction === 'no_trade') bias = 'neutral';

        const volatility = 1.1;
        const totalMove = startPrice * 0.02 * volatility * rand(0.7, 1.2);
        let skeleton;
        if (bias === 'bear') skeleton = buildDowntrendSkeleton(count, startPrice, totalMove);
        else if (bias === 'bull') skeleton = buildUptrendSkeleton(count, startPrice, totalMove);
        else skeleton = buildRangeSkeleton(count, startPrice, startPrice * 0.01);

        const candles = [];
        let prevClose = startPrice;
        for (let i = 0; i < count; i++) {
            const c = buildCandleInRange(skeleton[i], prevClose, bias, volatility);
            c.time = startTime + i * interval;
            candles.push(c);
            prevClose = c.close;
        }
        const volumes = buildVolumes(candles, volumeBase, bias, { skeleton: '' });
        return candles.map((c, i) => ({
            time: c.time,
            open: round(c.open, 4),
            high: round(c.high, 4),
            low: round(c.low, 4),
            close: round(c.close, 4),
            volume: volumes[i]
        }));
    }

    // ================================================================
    // ЭКСПОРТ
    // ================================================================

    global.RealisticCandleBuilder = {
        build: build,
        buildFuture: buildFuture,
        // Экспортируем также отдельные билдеры для прямого использования
        skeleton: {
            uptrend: buildUptrendSkeleton,
            downtrend: buildDowntrendSkeleton,
            range: buildRangeSkeleton,
            impulseCorrection: buildImpulseCorrectionSkeleton
        },
        patterns: {
            applyBullishPinBar, applyBearishPinBar,
            applyBullishEngulfing, applyBearishEngulfing,
            applyMorningStar, applyEveningStar,
            applyInsideBar, applyTweezerBottom, applyTweezerTop,
            applyThreeWhiteSoldiers, applyThreeBlackCrows,
            applyHammer, applyShootingStar, applyDoji,
            applyBullishMarubozu, applyBearishMarubozu,
            applyBullishBOS, applyBearishBOS,
            applyBullishCHOCH, applyBullishOrderBlock,
            applyBullishLiquiditySweep, applyBearishLiquiditySweep
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);
