// Wraps the real historical dataset in a proper IIFE module with API.
const fs = require('fs');

const data = fs.readFileSync('/workspace/code/real_historical_compact.json', 'utf8');
const compact = JSON.parse(data);

const header = `/**
 * RealHistoricalData — реальные исторические OHLCV-данные для PAYD Trading Lab.
 * ════════════════════════════════════════════════════════════════════════════
 *  НАЗНАЧЕНИЕ:
 *    Хранилище реальных исторических рыночных данных, используемых в Training Mode.
 *    Каждый сегмент — это последовательность из 200 настоящих свечей OHLCV,
 *    полученных с биржи Binance через публичный data-api.binance.vision.
 *
 *  ПРИНЦИПЫ:
 *    1. Свечи НЕ сгенерированы: это РЕАЛЬНЫЕ исторические данные рынка.
 *    2. Хранятся локально — Training Mode полностью офлайн.
 *    3. Используются для обучения Price Action, Smart Money, Market Structure.
 *
 *  ФОРМАТ СВЕЧЕЙ (внутри segments[].candles):
 *    [time, open, high, low, close, volume]
 *    time = Unix-секунды
 *
 *  ИСПОЛЬЗОВАНИЕ:
 *    const segment = RealHistoricalData.getSegment('BTCUSDT_1d_d60');
 *    // segment.candles = [[time, o, h, l, c, v], ...]
 *
 *    const window = RealHistoricalData.getWindow({
 *        symbol: 'BTCUSDT',
 *        interval: '1d',
 *        startIdx: 50,        // начало окна в сегменте
 *        visibleCount: 50,    // видимые свечи
 *        hiddenCount: 6       // скрытые "будущие" свечи
 *    });
 *    // window = { visible: [...], hidden: [...], meta: {...} }
 *
 *  Сгенерировано: ${compact.meta.generated}
 *  Источник: ${compact.meta.source}
 *  Сегментов: ${compact.meta.totalSegments}, свечей: ${compact.meta.totalCandles}
 * ════════════════════════════════════════════════════════════════════════════
 */

(function (global) {
    'use strict';

    if (!global) throw new Error('[RealHistoricalData] global is required');

    // ════════════════════════════════════════════════════════════════════════════
    // ДАННЫЕ: реальные исторические сегменты
    // ════════════════════════════════════════════════════════════════════════════
    const _SEGMENTS_RAW = ${JSON.stringify(compact)};

    // Восстанавливаем свечи из компактного формата [t,o,h,l,c,v] в объекты { time, open, high, low, close, volume }
    const _SEGMENTS = _SEGMENTS_RAW.segments.map(function (seg) {
        return {
            id: seg.id,
            symbol: seg.symbol,
            interval: seg.interval,
            offsetDays: seg.offsetDays,
            endTime: seg.endTime,
            candles: seg.candles.map(function (arr) {
                return {
                    time: arr[0],
                    open: arr[1],
                    high: arr[2],
                    low: arr[3],
                    close: arr[4],
                    volume: arr[5]
                };
            })
        };
    });

    // Индексы для быстрого поиска
    const _BY_ID = {};
    const _BY_SYMBOL = {};
    _SEGMENTS.forEach(function (s) {
        _BY_ID[s.id] = s;
        if (!_BY_SYMBOL[s.symbol]) _BY_SYMBOL[s.symbol] = [];
        _BY_SYMBOL[s.symbol].push(s);
    });

    // ════════════════════════════════════════════════════════════════════════════
    // API
    // ════════════════════════════════════════════════════════════════════════════

    /**
     * Получить сегмент по точному ID.
     * @param {string} id — например 'BTCUSDT_1d_d60'
     * @returns {object|null} сегмент с candles или null
     */
    function getSegment(id) {
        return _BY_ID[id] || null;
    }

    /**
     * Получить все сегменты для указанного символа.
     * @param {string} symbol
     * @returns {Array} массив сегментов
     */
    function getSegmentsBySymbol(symbol) {
        return _BY_SYMBOL[symbol] || [];
    }

    /**
     * Получить все доступные сегменты.
     * @returns {Array}
     */
    function getAllSegments() {
        return _SEGMENTS.slice();
    }

    /**
     * Получить окно (видимые + скрытые свечи) из реального сегмента.
     * @param {object} opts
     * @param {string} opts.symbol        — 'BTCUSDT', 'ETHUSDT', ...
     * @param {string} [opts.interval]    — '1h' | '4h' | '1d' (если не задан, берётся первый подходящий)
     * @param {number} [opts.startIdx]    — начальный индекс в сегменте (default 0)
     * @param {number} [opts.visibleCount] — сколько видимых свечей (default 50)
     * @param {number} [opts.hiddenCount]  — сколько скрытых "будущих" свечей (default 6)
     * @param {number} [opts.segmentIdx]   — индекс сегмента в списке для символа (default 0)
     * @returns {{visible: Array, hidden: Array, meta: object}|null}
     */
    function getWindow(opts) {
        opts = opts || {};
        const symbol = opts.symbol || 'BTCUSDT';
        const segments = _BY_SYMBOL[symbol];
        if (!segments || segments.length === 0) return null;
        let seg = null;
        if (opts.interval) {
            seg = segments.find(function (s) { return s.interval === opts.interval; }) || segments[0];
        } else {
            const idx = Math.min(opts.segmentIdx || 0, segments.length - 1);
            seg = segments[idx];
        }
        if (!seg) return null;
        const startIdx = Math.max(0, Math.min(opts.startIdx || 0, seg.candles.length - 1));
        const visibleCount = Math.max(5, Math.min(200, opts.visibleCount || 50));
        const hiddenCount = Math.max(0, Math.min(50, opts.hiddenCount || 6));
        const visible = seg.candles.slice(startIdx, startIdx + visibleCount);
        const hidden = seg.candles.slice(startIdx + visibleCount, startIdx + visibleCount + hiddenCount);
        return {
            visible: visible,
            hidden: hidden,
            meta: {
                segmentId: seg.id,
                symbol: seg.symbol,
                interval: seg.interval,
                offsetDays: seg.offsetDays,
                startIdx: startIdx,
                visibleEndTime: visible.length > 0 ? visible[visible.length - 1].time : null
            }
        };
    }

    /**
     * Получить случайное окно для указанного символа.
     * Используется как fallback, если конкретное окно не задано.
     * @param {object} opts — те же параметры, что у getWindow, плюс seed
     * @returns {object|null}
     */
    function getRandomWindow(opts) {
        opts = opts || {};
        const symbol = opts.symbol || 'BTCUSDT';
        const segments = _BY_SYMBOL[symbol];
        if (!segments || segments.length === 0) return null;
        // Детерминированный выбор на основе seed
        const seed = (opts.seed || 0) + (symbol.charCodeAt(0) || 0);
        const segIdx = Math.abs(seed) % segments.length;
        const seg = segments[segIdx];
        const visibleCount = opts.visibleCount || 50;
        const maxStart = Math.max(0, seg.candles.length - visibleCount - 10);
        const startIdx = Math.abs(seed * 7) % (maxStart + 1);
        return getWindow(Object.assign({}, opts, {
            interval: seg.interval,
            startIdx: startIdx
        }));
    }

    /**
     * Список всех доступных символов.
     * @returns {Array<string>}
     */
    function getAvailableSymbols() {
        return Object.keys(_BY_SYMBOL);
    }

    /**
     * Статистика датасета.
     * @returns {object}
     */
    function getStats() {
        return {
            totalSegments: _SEGMENTS.length,
            totalCandles: _SEGMENTS.reduce(function (s, seg) { return s + seg.candles.length; }, 0),
            symbols: _BY_SYMBOL,
            generated: _SEGMENTS_RAW.meta.generated,
            source: _SEGMENTS_RAW.meta.source
        };
    }

    // Экспорт
    global.RealHistoricalData = {
        getSegment: getSegment,
        getSegmentsBySymbol: getSegmentsBySymbol,
        getAllSegments: getAllSegments,
        getWindow: getWindow,
        getRandomWindow: getRandomWindow,
        getAvailableSymbols: getAvailableSymbols,
        getStats: getStats,
        // Прямой доступ к массиву (для продвинутых сценариев)
        segments: _SEGMENTS
    };

    if (typeof console !== 'undefined' && console.log) {
        const totalCandles = _SEGMENTS.reduce(function (s, seg) { return s + seg.candles.length; }, 0);
        console.log('[RealHistoricalData] Загружено ' + _SEGMENTS.length + ' реальных исторических сегментов (' + totalCandles + ' свечей) с ' + Object.keys(_BY_SYMBOL).length + ' символов');
    }

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
`;

const outPath = '/workspace/public/js/RealHistoricalData.js';
fs.writeFileSync(outPath, header);
const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
console.log('RealHistoricalData.js:', outPath, '(' + sizeKb + ' KB)');
console.log('Lines:', header.split('\n').length);
