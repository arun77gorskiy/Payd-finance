// Verify RealHistoricalData module works
const fs = require('fs');
const content = fs.readFileSync('/workspace/public/js/RealHistoricalData.js', 'utf8');
global.window = global;
eval(content);
const r = global.RealHistoricalData;
console.log('Segments:', r.getAllSegments().length);
console.log('Symbols:', r.getAvailableSymbols().join(', '));
console.log('Total candles:', r.getStats().totalCandles);
const win = r.getRandomWindow({ symbol: 'BTCUSDT', visibleCount: 50, hiddenCount: 6, seed: 42 });
console.log('Sample window BTCUSDT:');
console.log('  Visible:', win.visible.length, 'candles');
console.log('  Hidden:', win.hidden.length, 'candles');
console.log('  First visible:', JSON.stringify(win.visible[0]));
console.log('  Last visible:', JSON.stringify(win.visible[win.visible.length-1]));
console.log('  First hidden:', JSON.stringify(win.hidden[0]));
console.log('  Meta:', JSON.stringify(win.meta));
