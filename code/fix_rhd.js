// fix_rhd.js
const fs = require('fs');
const path = '/workspace/public/js/RealHistoricalData.js';
let code = fs.readFileSync(path, 'utf8');
// Add the missing closing paren
const oldEnd = "global : this));";
const newEnd = "global : this))));";
if (code.endsWith(oldEnd + '\n')) {
    code = code.slice(0, -1 * (oldEnd.length + 1)) + newEnd + '\n';
    fs.writeFileSync(path, code);
    console.log('Fixed!');
} else {
    console.log('No match. Last 80 chars:', JSON.stringify(code.slice(-80)));
}
