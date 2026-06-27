// Тест smartMoneyAnalyzer.ts через ts-node с ручной загрузкой модуля
const fs = require('fs');
const path = require('path');

// Загружаем скомпилированный JS (скомпилирован заранее через tsc)
const compiledPath = '/tmp/tsc_out/public/js/core-analysis/analyzers/smartMoneyAnalyzer.js';
const smartMoneyAnalyzer = require(compiledPath);

interface Candle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

function generateTestCandles(count: number, mode: 'up' | 'down' | 'reverse'): Candle[] {
    const candles: Candle[] = [];
    let price = 100;
    for (let i = 0; i < count; i++) {
        let drift = 0.3;
        if (mode === 'down') drift = -0.4;
        if (mode === 'reverse' && i > count / 2) drift = -0.5;
        const noise = (Math.random() - 0.5) * 1.5;
        const open = price;
        const close = price + drift + noise;
        const high = Math.max(open, close) + Math.random() * 1.5;
        const low = Math.min(open, close) - Math.random() * 1.5;
        candles.push({
            time: 1700000000 + i * 3600,
            open, high, low, close,
            volume: 1000 + Math.random() * 500
        });
        price = close;
    }
    return candles;
}

console.log('========================================');
console.log('ТЕСТ 1: Восходящий → разворот (150 свечей)');
console.log('========================================');
const r1 = smartMoneyAnalyzer.analyze(generateTestCandles(150, 'reverse'));
console.log(`BOS: ${r1.bos.length}, CHoCH: ${r1.choch.length}, MSS: ${r1.mss.length}`);
console.log(`Order Blocks: ${r1.orderBlocks.length}`);
console.log(`  └─ Mitigation: ${r1.mitigationBlocks.length}, Breakers: ${r1.breakerBlocks.length}`);
console.log(`Fair Value Gaps: ${r1.fairValueGaps.length}`);
console.log(`  └─ Bullish: ${r1.fairValueGaps.filter((f: any) => f.type === 'bullish').length}, Bearish: ${r1.fairValueGaps.filter((f: any) => f.type === 'bearish').length}`);
console.log(`Liquidity Sweeps: ${r1.liquiditySweeps.length}`);
console.log(`Equal Highs: ${r1.equalHighs.length}, Equal Lows: ${r1.equalLows.length}`);
console.log(`Внутренний тренд: ${r1.internalTrend}`);
console.log(`Последнее событие:`, r1.lastStructureEvent);
console.log(`Metadata:`, r1.metadata);

console.log('\n========================================');
console.log('ТЕСТ 2: Чистый восходящий тренд');
console.log('========================================');
const r2 = smartMoneyAnalyzer.analyze(generateTestCandles(100, 'up'));
console.log(`BOS bullish: ${r2.bos.filter((b: any) => b.type === 'bullish').length}`);
console.log(`Тренд: ${r2.internalTrend}`);
console.log(`CHoCH: ${r2.choch.length} (ожидаем 0 при чистом тренде)`);

console.log('\n========================================');
console.log('ТЕСТ 3: Чистый нисходящий тренд');
console.log('========================================');
const r3 = smartMoneyAnalyzer.analyze(generateTestCandles(100, 'down'));
console.log(`BOS bearish: ${r3.bos.filter((b: any) => b.type === 'bearish').length}`);
console.log(`Тренд: ${r3.internalTrend}`);

console.log('\n========================================');
console.log('ТЕСТ 4: Передача внешнего marketStructure');
console.log('========================================');
const mockStructure = {
    type: 'uptrend',
    swings: [
        { index: 10, price: 102, type: 'high' },
        { index: 15, price: 98, type: 'low' },
        { index: 25, price: 110, type: 'high' },
        { index: 30, price: 105, type: 'low' }
    ],
    structureShift: { type: null, index: 0, price: 0 }
};
const r4 = smartMoneyAnalyzer.analyze(generateTestCandles(100, 'up'), mockStructure);
console.log(`Использован внешний marketStructure (4 свинга)`);
console.log(`BOS: ${r4.bos.length}, Тренд: ${r4.internalTrend}`);

console.log('\n========================================');
console.log('ТЕСТ 5: Защита (пустые / короткие данные)');
console.log('========================================');
const r5a = smartMoneyAnalyzer.analyze([]);
console.log(`Пустой: BOS=${r5a.bos.length}, FVG=${r5a.fairValueGaps.length}`);
const r5b = smartMoneyAnalyzer.analyze([{time:1,open:1,high:1,low:1,close:1,volume:1}]);
console.log(`1 свеча: BOS=${r5b.bos.length}, FVG=${r5b.fairValueGaps.length}`);

console.log('\n========================================');
console.log('ТЕСТ 6: Реалистичные данные с явным BOS/CHoCH');
console.log('========================================');
const realistic: Candle[] = [];
let px = 100;
for (let i = 0; i < 60; i++) {
    if (i % 5 === 0 && i > 0) px += 1.5;
    const open = px;
    const close = px + (i % 2 === 0 ? 0.3 : -0.2);
    realistic.push({
        time: 1700000000 + i * 3600,
        open, close,
        high: Math.max(open, close) + 0.5,
        low: Math.min(open, close) - 0.3,
        volume: 1000
    });
    px = close;
}
realistic[30].high = realistic[29].high + 5;
realistic[30].close = realistic[29].high + 4;
for (let i = 31; i < 45; i++) {
    realistic[i].close = realistic[i-1].close - 1;
    realistic[i].low = realistic[i].close - 0.5;
    realistic[i].high = realistic[i].open + 0.3;
}
const r6 = smartMoneyAnalyzer.analyze(realistic);
console.log(`BOS: ${r6.bos.length}, CHoCH: ${r6.choch.length}`);
console.log(`Тренд после разворота: ${r6.internalTrend}`);

console.log('\n========================================');
console.log('ТЕСТ 7: Детальный осмотр FVG');
console.log('========================================');
const r7 = smartMoneyAnalyzer.analyze(generateTestCandles(80, 'reverse'));
if (r7.fairValueGaps.length > 0) {
    console.log(`Первые 3 FVG:`);
    r7.fairValueGaps.slice(0, 3).forEach((f: any) => {
        console.log(`  ${f.type}: high=${f.high.toFixed(2)}, low=${f.low.toFixed(2)}, midpoint=${f.midpoint.toFixed(2)}, size=${f.size.toFixed(4)}, filled=${f.filled}`);
    });
}

console.log('\n========================================');
console.log('ТЕСТ 8: Детальный осмотр Order Blocks');
console.log('========================================');
if (r7.orderBlocks.length > 0) {
    console.log(`Первые 3 OB:`);
    r7.orderBlocks.slice(0, 3).forEach((ob: any) => {
        console.log(`  ${ob.type}: high=${ob.high.toFixed(2)}, low=${ob.low.toFixed(2)}, mitigated=${ob.mitigated}`);
    });
}

console.log('\n========================================');
console.log('ТЕСТ 9: Доступ к внутренним функциям');
console.log('========================================');
console.log(`Внутренние функции:`, Object.keys(smartMoneyAnalyzer._internal));
console.log(`Тест findSwings: ${smartMoneyAnalyzer._internal.findSwings(generateTestCandles(50, 'up')).length} свингов`);

console.log('\n========================================');
console.log('✅ ВСЕ ТЕСТЫ ЗАВЕРШЕНЫ');
console.log('========================================');
console.log(`Версия модуля: ${smartMoneyAnalyzer.VERSION}`);
console.log(`Конфигурация:`, smartMoneyAnalyzer.CONFIG);
