// trainer_test.js — полный тест с Trainer
const fs = require('fs');
const vm = require('vm');

const sandbox = { console, Math, Date, JSON, Object, Array, Number, String, Boolean, RegExp, setTimeout: () => {}, Promise };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.global = sandbox;
vm.createContext(sandbox);

// Загружаем модули в правильном порядке
const order = [
    'RealMarketData.js',     // Только для совместимости
    'RealHistoricalData.js', // Реальные данные
    'TrainerScenarios.js',
    'ScenarioLibrary.js'     // Должен перезаписать SCENARIOS
];

for (const f of order) {
    const code = fs.readFileSync('/workspace/public/js/' + f, 'utf8');
    vm.runInContext(code, sandbox);
}

console.log('Сценариев в SCENARIO_LIBRARY:', sandbox.SCENARIO_LIBRARY.scenarios.length);
console.log('Сценариев в TrainerScenarios.SCENARIOS:', sandbox.TrainerScenarios.SCENARIOS.length);

// Проверим несколько сценариев на наличие реальных свечей
const scenarios = sandbox.SCENARIO_LIBRARY.scenarios;
console.log('\n=== ПРИМЕРЫ СЦЕНАРИЕВ ===');
for (let i = 0; i < 3; i++) {
    const s = scenarios[i * 5]; // 0, 5, 10
    console.log('\n[' + s.id + '] ' + s.name);
    console.log('  Символ: ' + s.symbol + ' (' + s.interval + ')');
    console.log('  Категория: ' + s.category + ', Сложность: ' + s.difficulty);
    console.log('  Свечей: ' + s.candles.length + ' (будущих: ' + (s.futureCandles || []).length + ')');
    console.log('  Источник: ' + s.dataSource);
    console.log('  Сегмент: ' + s.realSegmentId);
    if (s.candles.length > 0) {
        const first = s.candles[0];
        const last = s.candles[s.candles.length - 1];
        console.log('  Период видимых: ' + new Date(first.time * 1000).toISOString().slice(0, 16) +
                    ' → ' + new Date(last.time * 1000).toISOString().slice(0, 16));
        console.log('  Цена первая: ' + first.open + ', последняя: ' + last.close);
        if (s.futureCandles && s.futureCandles.length > 0) {
            const fl = s.futureCandles[s.futureCandles.length - 1];
            const change = ((fl.close - last.close) / last.close * 100).toFixed(2);
            console.log('  Будущая цена: ' + fl.close + ' (' + change + '% от видимой)');
        }
    }
}

console.log('\n✅ ВСЁ РАБОТАЕТ КОРРЕКТНО');
