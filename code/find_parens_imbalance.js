// find_parens_imbalance.js
const fs = require('fs');
const code = fs.readFileSync('/workspace/public/js/RealHistoricalData.js', 'utf8');
const lines = code.split('\n');
let open = 0, close = 0;
for (const line of lines) {
    for (const c of line) {
        if (c === '(') open++;
        if (c === ')') close++;
    }
}
console.log('Open (:', open);
console.log('Close ):', close);
console.log('Diff:', open - close);

let bal = 0;
let firstNegLine = -1;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const c of line) {
        if (c === '(') bal++;
        if (c === ')') bal--;
    }
    if (bal < 0 && firstNegLine === -1) {
        firstNegLine = i + 1;
    }
}
console.log('First negative balance at line:', firstNegLine);
console.log('Final balance:', bal);
console.log('Last 5 lines:');
for (let i = Math.max(0, lines.length - 5); i < lines.length; i++) {
    console.log('Line', i + 1, ':', lines[i]);
}
