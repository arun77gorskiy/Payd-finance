/**
 * RealMarketData — загрузчик реальных OHLCV-данных с публичного API Binance.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  Назначение:
 *    Используется ТОЛЬКО в режиме "Live Market" для отображения реальных
 *    рыночных котировок в реальном времени. НЕ используется в Training Mode —
 *    сценарии обучения работают на пред-генерированных исторических свечах
 *    из ScenarioLibrary, не зависящих от внешних API.
 *
 *  Принципы:
 *    1. Используется ТОЛЬКО для Live Market (торговый терминал).
 *    2. Никаких искусственных данных: только то, что есть на Binance.
 *    3. Если API недоступен — ошибка пробрасывается наверх. НЕТ fallback'а
 *       на синтетические свечи (это противоречит цели Live Market).
 *    4. Модуль кэширует данные в памяти, чтобы избежать повторных запросов.
 *    5. Поддержка "точки остановки" (anchorTime) — режим "future hidden".
 *
 *  API Binance:
 *    GET https://api.binance.com/api/v3/klines
 *    ?symbol=BTCUSDT
 *    &interval=1h
 *    &endTime=1735689600000  (опционально)
 *    &limit=200
 *
 *  Формат ответа Binance:
 *    [openTime, open, high, low, close, volume, closeTime, ...]
 *
 *  Использование:
 *    const data = await RealMarketData.loadCandles({
 *      symbol: 'BTCUSDT',
 *      interval: '1h',
 *      endTime: 1735689600,    // unix seconds
 *      limit: 100
 *    });
 *    // → [{ time, open, high, low, close, volume }, ...]
 * ════════════════════════════════════════════════════════════════════════════
 */

(function (global) {
    'use strict';

    if (!global) throw new Error('[RealMarketData] global is required');

    // Список зеркал Binance API для автоматического переключения при сбое.
    // Используем несколько доменов, чтобы обойти гео-блокировки и rate limits.
    const BINANCE_ENDPOINTS = [
        'https://api.binance.com/api/v3/klines',
        'https://api1.binance.com/api/v3/klines',
        'https://api2.binance.com/api/v3/klines',
        'https://api3.binance.com/api/v3/klines',
        'https://data-api.binance.vision/api/v3/klines'
    ];
    const BINANCE_API = BINANCE_ENDPOINTS[0]; // обратная совместимость

    // Маппинг интервалов Trainer → Binance
    const INTERVAL_MAP = {
        '1m':  '1m',
        '5m':  '5m',
        '15m': '15m',
        '30m': '30m',
        '1h':  '1h',
        '2h':  '2h',
        '4h':  '4h',
        '1d':  '1d',
        '1w':  '1w',
        // Совместимость с TradingView-форматом
        '1':   '1m',
        '5':   '5m',
        '15':  '15m',
        '60':  '1h',
        '240': '4h',
        'D':   '1d',
        'W':   '1w'
    };

    // Кэш: ключ = `${symbol}_${interval}_${endTime}_${limit}`
    const cache = new Map();

    /**
     * Нормализация символа — Binance принимает только формат типа BTCUSDT (без разделителей).
     * Поддерживает входные форматы:
     *   - 'BTCUSDT'           → 'BTCUSDT'
     *   - 'BINANCE:BTCUSDT'   → 'BTCUSDT'
     *   - 'BTC/USDT'          → 'BTCUSDT'
     *   - 'binance:btcusdt'   → 'BTCUSDT'
     */
    function normalizeSymbol(symbol) {
        if (!symbol) return 'BTCUSDT';
        let s = String(symbol).trim();
        // TradingView-формат: BINANCE:BTCUSDT → берём только часть после двоеточия
        if (s.includes(':')) {
            s = s.split(':').pop();
        }
        // Убираем разделители /, -, _
        s = s.replace(/[\/\-_]/g, '');
        return s.toUpperCase();
    }

    /**
     * Нормализация интервала
     */
    function normalizeInterval(interval) {
        if (!interval) return '1h';
        return INTERVAL_MAP[interval] || '1h';
    }

    /**
     * Загрузить свечи с Binance (для Live Market).
     * @param {object} opts
     * @param {string} opts.symbol    — 'BTCUSDT', 'ETHUSDT', ...
     * @param {string} opts.interval  — '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | ...
     * @param {number} [opts.endTime] — Unix-секунды. Если задано, загрузит свечи ДО этого момента.
     * @param {number} [opts.limit]   — Количество свечей (по умолчанию 100, макс 1000).
     * @returns {Promise<{candles: Array, source: string}>}  — source: 'cache' | 'binance'
     * @throws {Error} Если все эндпоинты Binance недоступны. БЕЗ FALLBACK на синтетику.
     */
    async function loadCandles(opts) {
        opts = opts || {};
        const symbol = normalizeSymbol(opts.symbol);
        const interval = normalizeInterval(opts.interval);
        const limit = Math.max(10, Math.min(1000, opts.limit || 100));
        const endTime = opts.endTime ? Math.floor(opts.endTime) : null;

        const cacheKey = symbol + '_' + interval + '_' + (endTime || 'now') + '_' + limit;
        if (cache.has(cacheKey)) {
            return { candles: cache.get(cacheKey), source: 'cache' };
        }

        // Перебираем все зеркала Binance по очереди
        for (let i = 0; i < BINANCE_ENDPOINTS.length; i++) {
            const baseUrl = BINANCE_ENDPOINTS[i];
            let url = baseUrl + '?symbol=' + symbol + '&interval=' + interval + '&limit=' + limit;
            if (endTime) {
                url += '&endTime=' + (endTime * 1000);
            }
            try {
                const resp = await fetch(url, { method: 'GET', mode: 'cors' });
                if (!resp.ok) continue;
                const rows = await resp.json();
                if (!Array.isArray(rows) || rows.length === 0) continue;

                // Binance: [openTime, open, high, low, close, volume, closeTime, ...]
                const candles = rows.map(function (r) {
                    return {
                        time: Math.floor(r[0] / 1000),
                        open: parseFloat(r[1]),
                        high: parseFloat(r[2]),
                        low: parseFloat(r[3]),
                        close: parseFloat(r[4]),
                        volume: parseFloat(r[5])
                    };
                });
                candles.sort(function (a, b) { return a.time - b.time; });

                cache.set(cacheKey, candles);
                return { candles: candles, source: 'binance' };
            } catch (err) {
                // Не выводим в консоль: CORS-ошибки при file:// — норма для оффлайн-режима.
                // Логируем только в режиме отладки (window.__DEBUG_MARKET__).
                if (typeof window !== 'undefined' && window.__DEBUG_MARKET__) {
                    console.warn('[RealMarketData] Endpoint', i, '(' + symbol + ') failed:', err.message);
                }
                continue;
            }
        }

        // Все эндпоинты недоступны — пробрасываем ошибку.
        // НИКАКОЙ синтетики / random walk — для Live Market это недопустимо.
        const err = new Error('Binance недоступен для ' + symbol + '. Live Market требует подключения к внешнему API.');
        err.code = 'BINANCE_UNAVAILABLE';
        throw err;
    }

    /**
     * Загрузить видимые + скрытые свечи одной пачкой (для Live Market).
     * @param {object} opts
     * @param {string} opts.symbol
     * @param {string} opts.interval
     * @param {number} opts.anchorTime     — точка остановки (Unix-секунды)
     * @param {number} [opts.visibleCount] — сколько свечей показывать (default 80)
     * @param {number} [opts.hiddenCount]  — сколько свечей "будущего" загрузить, но не показывать (default 8)
     * @returns {Promise<{visible: Array, hidden: Array, anchorTime: number, source: string}>}
     * @throws {Error} Если данные Binance недоступны.
     */
    async function loadScenarioCandles(opts) {
        opts = opts || {};
        const visibleCount = opts.visibleCount || 80;
        const hiddenCount = opts.hiddenCount || 0;
        const totalLimit = visibleCount + hiddenCount;
        const symbol = normalizeSymbol(opts.symbol);
        const interval = normalizeInterval(opts.interval);

        // 1) Загружаем видимые свечи (заканчиваются в anchorTime)
        // Если ошибка — она пробрасывается наверх. БЕЗ FALLBACK.
        const result = await loadCandles({
            symbol: symbol,
            interval: interval,
            endTime: opts.anchorTime,
            limit: totalLimit
        });
        const allCandles = result.candles;
        const primarySource = result.source;

        // Фильтруем строго ≤ anchorTime
        const filtered = allCandles.filter(function (c) { return c.time <= opts.anchorTime; });

        const visible = filtered.slice(-visibleCount);
        const visibleEndTime = visible.length > 0 ? visible[visible.length - 1].time : opts.anchorTime;

        // 2) Загружаем "будущее" — свечи ПОСЛЕ anchorTime
        let hidden = [];
        if (hiddenCount > 0) {
            for (let i = 0; i < BINANCE_ENDPOINTS.length; i++) {
                try {
                    const futureUrl = BINANCE_ENDPOINTS[i] +
                        '?symbol=' + symbol +
                        '&interval=' + interval +
                        '&startTime=' + ((opts.anchorTime + 1) * 1000) +
                        '&limit=' + hiddenCount;
                    const resp = await fetch(futureUrl, { method: 'GET', mode: 'cors' });
                    if (!resp.ok) continue;
                    const rows = await resp.json();
                    hidden = (rows || []).map(function (r) {
                        return {
                            time: Math.floor(r[0] / 1000),
                            open: parseFloat(r[1]),
                            high: parseFloat(r[2]),
                            low: parseFloat(r[3]),
                            close: parseFloat(r[4]),
                            volume: parseFloat(r[5])
                        };
                    });
                    break; // успех — выходим из цикла
                } catch (e) {
                    continue;
                }
            }
        }

        return {
            visible: visible,
            hidden: hidden,
            anchorTime: opts.anchorTime,
            visibleEndTime: visibleEndTime,
            symbol: opts.symbol,
            interval: opts.interval,
            source: primarySource
        };
    }

    /**
     * Получить текущее время как Unix-секунды, со сдвигом на N дней назад.
     * Используется для генерации "свежих" сценариев на реальных данных.
     */
    function getRecentAnchorTime(daysAgo, hourUtc) {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - (daysAgo || 0));
        if (hourUtc !== undefined && hourUtc !== null) {
            d.setUTCHours(hourUtc, 0, 0, 0);
        } else {
            d.setUTCHours(0, 0, 0, 0);
        }
        return Math.floor(d.getTime() / 1000);
    }

    /**
     * Очистить кэш (например, при смене пользователя или даты)
     */
    function clearCache() {
        cache.clear();
    }

    // Экспорт
    global.RealMarketData = {
        loadCandles: loadCandles,
        loadScenarioCandles: loadScenarioCandles,
        getRecentAnchorTime: getRecentAnchorTime,
        clearCache: clearCache,
        normalizeSymbol: normalizeSymbol,
        normalizeInterval: normalizeInterval,
        INTERVAL_MAP: INTERVAL_MAP
    };

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this)));
