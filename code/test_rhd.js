// Test loading RealHistoricalData.js
const fs = require('fs');
const code = fs.readFileSync('/workspace/public/js/RealHistoricalData.js', 'utf8');
console.log('File length:', code.length);
console.log('Last 100 chars:', JSON.stringify(code.slice(-100)));
try {
    eval(code);
    console.log('Eval succeeded');
    console.log('typeof globalThis.RealHistoricalData:', typeof globalThis.RealHistoricalData);
} catch (e) {
    console.log('Eval failed:', e.message);
    console.log('Stack:', e.stack);
}
