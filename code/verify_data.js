const data = require('/workspace/code/real_historical_dataset.json');
console.log('Всего сегментов:', data.segments.length);
console.log('=== Первый сегмент BTCUSDT 1d ===');
const btc = data.segments.find(s => s.id === 'BTCUSDT_1d_d60');
if (btc) {
    console.log('ID:', btc.id);
    console.log('Свечей:', btc.candleCount);
    console.log('Первая свеча:', btc.candles[0]);
    console.log('Последняя свеча:', btc.candles[btc.candles.length-1]);
    console.log('Минимум low:', Math.min(...btc.candles.map(c => c.low)).toFixed(2));
    console.log('Максимум high:', Math.max(...btc.candles.map(c => c.high)).toFixed(2));
    const ups = btc.candles.filter(c => c.close > c.open).length;
    const downs = btc.candles.filter(c => c.close < c.open).length;
    console.log('Рост/падение:', ups, '/', downs);
}
console.log('');
console.log('=== Распределение по символам ===');
const bySymbol = {};
data.segments.forEach(s => bySymbol[s.symbol] = (bySymbol[s.symbol] || 0) + 1);
console.log(bySymbol);
console.log('=== Распределение по таймфреймам ===');
const byTf = {};
data.segments.forEach(s => byTf[s.interval] = (byTf[s.interval] || 0) + 1);
console.log(byTf);
