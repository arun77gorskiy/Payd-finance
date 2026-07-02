// test_scenario_library.js — эмуляция загрузки в браузере
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sandbox = { console, Math, Date, JSON, Object, Array, Number, String, Boolean, RegExp };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);

// 1) Загружаем RealHistoricalData
const rdhCode = fs.readFileSync('public/js/RealHistoricalData.js', 'utf8');
vm.runInContext(rdhCode, sandbox);

// 2) Загружаем ScenarioLibrary
const slCode = fs.readFileSync('public/js/ScenarioLibrary.js', 'utf8');
vm.runInContext(slCode, sandbox);

// 3) Проверки
console.log('====== ПРОВЕРКА РЕЗУЛЬТАТОВ ======\n');
console.log('global.RealHistoricalData:', typeof sandbox.RealHistoricalData);
console.log('global.SCENARIO_LIBRARY:', typeof sandbox.SCENARIO_LIBRARY);
console.log('global.TrainerScenarios:', typeof sandbox.TrainerScenarios);

if (sandbox.SCENARIO_LIBRARY) {
    console.log('Всего сценариев:', sandbox.SCENARIO_LIBRARY.scenarios.length);
    console.log('По категориям:', sandbox.SCENARIO_LIBRARY.countByCategory);

    const scenarios = sandbox.SCENARIO_LIBRARY.scenarios;

    // Проверить, что ВСЕ сценарии имеют candles
    let withCandles = 0;
    let withoutCandles = 0;
    let totalCandles = 0;
    let totalFuture = 0;
    let dataSources = {};
    let segmentsUsed = {};
    let symbolsUsed = {};
    let intervalsUsed = {};
    let emptySegs = [];

    for (const s of scenarios) {
        if (s.candles && s.candles.length > 0) {
            withCandles++;
            totalCandles += s.candles.length;
            totalFuture += (s.futureCandles || []).length;
        } else {
            withoutCandles++;
            emptySegs.push(s.id + ' (' + s.symbol + '/' + s.interval + ')');
        }
        if (s.dataSource) dataSources[s.dataSource] = (dataSources[s.dataSource] || 0) + 1;
        if (s.realSegmentId) segmentsUsed[s.realSegmentId] = (segmentsUsed[s.realSegmentId] || 0) + 1;
        symbolsUsed[s.symbol] = (symbolsUsed[s.symbol] || 0) + 1;
        intervalsUsed[s.interval] = (intervalsUsed[s.interval] || 0) + 1;
    }

    console.log('\n--- Статистика ---');
    console.log('С candles:', withCandles, '/ Без:', withoutCandles);
    console.log('Всего видимых свечей:', totalCandles);
    console.log('Всего будущих свечей:', totalFuture);
    console.log('Источники данных:', dataSources);
    console.log('Уникальных сегментов использовано:', Object.keys(segmentsUsed).length);
    console.log('Символы в сценариях:', Object.keys(symbolsUsed).length, '→', symbolsUsed);
    console.log('Интервалы в сценариях:', intervalsUsed);

    // Проверить примеры
    console.log('\n--- Примеры сценариев ---');
    for (let i = 0; i < 3; i++) {
        const s = scenarios[i];
        console.log('[' + s.id + ']', s.name);
        console.log('  Категория:', s.category, '| Символ:', s.symbol, '| Интервал:', s.interval);
        console.log('  Свечей:', s.candles.length, '| Будущих:', (s.futureCandles || []).length);
        console.log('  Источник:', s.dataSource, '| Сегмент:', s.realSegmentId);
        if (s.candles.length > 0) {
            const c = s.candles[s.candles.length - 1];
            console.log('  Последняя видимая свеча: time=' + new Date(c.time * 1000).toISOString() + ', close=' + c.close);
        }
    }

    if (withoutCandles > 0) {
        console.log('\n!!! СЦЕНАРИИ БЕЗ СВЕЧЕЙ:', emptySegs.slice(0, 10));
    } else {
        console.log('\n✅ ВСЕ СЦЕНАРИИ ИМЕЮТ РЕАЛЬНЫЕ СВЕЧИ!');
    }
}
