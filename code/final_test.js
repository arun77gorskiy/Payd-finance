// final_test.js — комплексная проверка всей системы
const fs = require('fs');
const vm = require('vm');

const sandbox = { console, Math, Date, JSON, Object, Array, Number, String, Boolean, RegExp };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);

console.log('=== ЗАГРУЗКА МОДУЛЕЙ ===\n');

// 1) RealHistoricalData
try {
    const code = fs.readFileSync('/workspace/public/js/RealHistoricalData.js', 'utf8');
    vm.runInContext(code, sandbox);
    console.log('✅ RealHistoricalData загружен');
} catch (e) {
    console.log('❌ RealHistoricalData:', e.message);
    process.exit(1);
}

// 2) ScenarioLibrary
try {
    const code = fs.readFileSync('/workspace/public/js/ScenarioLibrary.js', 'utf8');
    vm.runInContext(code, sandbox);
    console.log('✅ ScenarioLibrary загружен');
} catch (e) {
    console.log('❌ ScenarioLibrary:', e.message);
    process.exit(1);
}

console.log('\n=== ПРОВЕРКИ ДОСТУПНОСТИ ===\n');
console.log('global.RealHistoricalData:', !!sandbox.RealHistoricalData);
console.log('global.SCENARIO_LIBRARY:', !!sandbox.SCENARIO_LIBRARY);
console.log('global.TrainerScenarios:', !!sandbox.TrainerScenarios);

// Проверяем отсутствие RealisticCandleBuilder в сценариях
const slCode = fs.readFileSync('/workspace/public/js/ScenarioLibrary.js', 'utf8');
const hasRealisticCandle = /\bRealisticCandleBuilder\.(build|buildFuture|skeleton)\b/.test(slCode);
const hasGenerateCandles = /\bgenerateCandles\s*\(/.test(slCode);
console.log('Используется RealisticCandleBuilder в коде:', hasRealisticCandle ? '❌ ДА' : '✅ НЕТ');
console.log('Используется generateCandles в коде:', hasGenerateCandles ? '❌ ДА' : '✅ НЕТ');

console.log('\n=== СТАТИСТИКА СЦЕНАРИЕВ ===\n');
const scenarios = sandbox.SCENARIO_LIBRARY.scenarios;
console.log('Всего сценариев:', scenarios.length);

// Проверка, что у каждого сценария есть реальные свечи
let allOk = true;
let segStats = {};
for (const s of scenarios) {
    if (!s.candles || s.candles.length < 10) {
        console.log('❌ Сценарий', s.id, 'имеет недостаточно свечей:', s.candles ? s.candles.length : 0);
        allOk = false;
    }
    if (s.dataSource !== 'real_historical') {
        console.log('❌ Сценарий', s.id, 'имеет неправильный dataSource:', s.dataSource);
        allOk = false;
    }
    if (s.realSegmentId) {
        segStats[s.realSegmentId] = (segStats[s.realSegmentId] || 0) + 1;
    }
    // Проверка структуры свечей
    if (s.candles && s.candles.length > 0) {
        const c = s.candles[0];
        if (typeof c.time !== 'number' || typeof c.open !== 'number' ||
            typeof c.high !== 'number' || typeof c.low !== 'number' ||
            typeof c.close !== 'number' || typeof c.volume !== 'number') {
            console.log('❌ Свечи в сценарии', s.id, 'имеют неверный формат');
            allOk = false;
        }
    }
}

console.log('\n=== ДЕТАЛЬНАЯ СТАТИСТИКА ===\n');
console.log('Уникальных сегментов использовано:', Object.keys(segStats).length);

// Проверяем уникальность
const totalCandles = scenarios.reduce((sum, s) => sum + (s.candles ? s.candles.length : 0), 0);
const totalFuture = scenarios.reduce((sum, s) => sum + (s.futureCandles ? s.futureCandles.length : 0), 0);
console.log('Всего видимых свечей:', totalCandles);
console.log('Всего будущих свечей:', totalFuture);
console.log('Общий объём:', totalCandles + totalFuture, 'свечей');

// Группировка по символам/интервалам
const symStats = {};
for (const s of scenarios) {
    const k = s.symbol + ' / ' + s.interval;
    symStats[k] = (symStats[k] || 0) + 1;
}
console.log('\nРаспределение по символу/интервалу:');
Object.keys(symStats).sort().forEach(k => console.log('  ' + k + ': ' + symStats[k]));

if (allOk) {
    console.log('\n✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ УСПЕШНО!');
} else {
    console.log('\n❌ ЕСТЬ ОШИБКИ');
    process.exit(1);
}
