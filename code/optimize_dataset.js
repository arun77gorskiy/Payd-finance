// optimize_dataset.js — уменьшает размер датасета для встраивания в приложение
const fs = require('fs');

const rawData = JSON.parse(fs.readFileSync('/workspace/code/real_historical_dataset.json', 'utf8'));

// Выбираем лучшие сегменты: 1h и 1d (самые показательные для обучения)
// Для каждого символа берём несколько сегментов разного возраста
const selectedSegments = [];
const wantedIntervals = ['1h', '4h', '1d'];

// Берём по 1-2 сегмента каждого типа для каждого символа
const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'MATICUSDT'];
for (const symbol of symbols) {
    for (const interval of wantedIntervals) {
        // Берём сегменты с разным offsetDays для разнообразия рыночных условий
        const matching = rawData.segments.filter(s => s.symbol === symbol && s.interval === interval);
        // Сортируем по offsetDays: меньший = свежее, больший = старше
        matching.sort((a, b) => a.offsetDays - b.offsetDays);
        // Берём 2 сегмента: один свежий, один более старый (для разных рыночных циклов)
        if (matching.length > 0) selectedSegments.push(matching[0]); // самый свежий
        if (matching.length > 3) selectedSegments.push(matching[Math.floor(matching.length / 2)]); // средний
    }
}

console.log('Выбрано сегментов:', selectedSegments.length);

// Сжимаем: каждое число округляем до 4 знаков, убираем лишние поля
const compressed = selectedSegments.map(seg => {
    return {
        id: seg.id,
        symbol: seg.symbol,
        interval: seg.interval,
        offsetDays: seg.offsetDays,
        endTime: seg.endTime,
        // Округляем для экономии места
        candles: seg.candles.map(c => [
            c.time,
            Math.round(c.open * 100) / 100,
            Math.round(c.high * 100) / 100,
            Math.round(c.low * 100) / 100,
            Math.round(c.close * 100) / 100,
            Math.round(c.volume)
        ])
    };
});

// Сохраняем в компактном виде (массивы вместо объектов)
const compact = {
    meta: {
        generated: new Date().toISOString(),
        source: 'Binance Vision (data-api.binance.vision)',
        description: 'Real historical OHLCV data — embedded into PAYD Trading Lab',
        format: 'candles as [time, open, high, low, close, volume]',
        totalSegments: compressed.length,
        totalCandles: compressed.reduce((sum, s) => sum + s.candles.length, 0)
    },
    segments: compressed
};

const outPath = '/workspace/code/real_historical_compact.json';
fs.writeFileSync(outPath, JSON.stringify(compact));
const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
console.log('Сохранено:', outPath, '(' + sizeKb + ' KB)');
console.log('Всего свечей:', compact.meta.totalCandles);

// Также сохраним как JS-модуль для прямого подключения в браузере
const jsContent = '/**\n' +
    ' * RealHistoricalData — реальные исторические OHLCV-данные для PAYD Trading Lab.\n' +
    ' * Сгенерировано: ' + compact.meta.generated + '\n' +
    ' * Источник: ' + compact.meta.source + '\n' +
    ' * Сегментов: ' + compact.meta.totalSegments + ', свечей: ' + compact.meta.totalCandles + '\n' +
    ' *\n' +
    ' * Каждый сегмент — это 200 последовательных реальных свечей OHLCV с биржи Binance.\n' +
    ' * Свечи НЕ сгенерированы: они представляют реальные рыночные движения.\n' +
    ' *\n' +
    ' * Используется для обучения в Training Mode. Полностью офлайн.\n' +
    ' */\n' +
    'window.REAL_HISTORICAL_DATASET = ' + JSON.stringify(compact) + ';\n';

const jsPath = '/workspace/public/js/RealHistoricalData.js';
fs.writeFileSync(jsPath, jsContent);
const sizeKbJs = (fs.statSync(jsPath).size / 1024).toFixed(1);
console.log('JS-модуль:', jsPath, '(' + sizeKbJs + ' KB)');
