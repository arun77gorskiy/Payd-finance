// find_imbalance_lines.js
const fs = require('fs');
const code = fs.readFileSync('/workspace/public/js/RealHistoricalData.js', 'utf8');
const lines = code.split('\n');

// Check each line for paren imbalance (excluding string contents)
let bal = 0;
let firstImbalanceLine = -1;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let inString = false;
    let stringChar = null;
    let lineOpen = 0, lineClose = 0;
    for (let j = 0; j < line.length; j++) {
        const c = line[j];
        const prev = j > 0 ? line[j - 1] : null;
        if (!inString && (c === '"' || c === "'")) {
            inString = true;
            stringChar = c;
        } else if (inString && c === stringChar && prev !== '\\') {
            inString = false;
            stringChar = null;
        } else if (!inString) {
            if (c === '(') { lineOpen++; bal++; }
            if (c === ')') { lineClose++; bal--; }
        }
    }
    if (lineOpen !== lineClose) {
        console.log('Line', i + 1, '— open:', lineOpen, 'close:', lineClose, 'diff:', lineOpen - lineClose);
        console.log('  Text:', line.substring(0, 100) + (line.length > 100 ? '...' : ''));
        if (firstImbalanceLine === -1) firstImbalanceLine = i + 1;
    }
}
console.log('First imbalance at line:', firstImbalanceLine);
console.log('Final balance:', bal);
