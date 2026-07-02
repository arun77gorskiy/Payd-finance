// find_imbalance_strict.js
const fs = require('fs');
const code = fs.readFileSync('/workspace/public/js/RealHistoricalData.js', 'utf8');

let bal = 0;
let inString = false;
let stringChar = null;
let inComment = false;
let inLineComment = false;
let prevChar = null;
let lineNum = 1;
let colNum = 0;

for (let i = 0; i < code.length; i++) {
    const c = code[i];
    colNum++;
    if (c === '\n') {
        lineNum++;
        colNum = 0;
        inLineComment = false;
        prevChar = null;
        continue;
    }

    if (inLineComment) {
        prevChar = c;
        continue;
    }
    if (inComment) {
        if (c === '/' && prevChar === '*') {
            inComment = false;
        }
        prevChar = c;
        continue;
    }
    if (inString) {
        if (c === stringChar && prevChar !== '\\') {
            inString = false;
        }
        prevChar = c;
        continue;
    }

    if (c === '/' && prevChar === '/') {
        inLineComment = true;
        prevChar = null;
        continue;
    }
    if (c === '*' && prevChar === '/') {
        inComment = true;
        prevChar = null;
        continue;
    }
    if (c === '"' || c === "'" || c === '`') {
        inString = true;
        stringChar = c;
        prevChar = c;
        continue;
    }

    if (c === '(') bal++;
    if (c === ')') bal--;

    if (bal < 0) {
        console.log('Negative balance at line', lineNum, 'col', colNum, ':', c);
    }
    prevChar = c;
}
console.log('Final balance:', bal);
