// fix_rhd2.js
const fs = require('fs');
const path = '/workspace/public/js/RealHistoricalData.js';
let code = fs.readFileSync(path, 'utf8');
// Now there's an extra ')' — fix it
const oldEnd = "global : this))));";
const newEnd = "global : this)));";
if (code.indexOf(oldEnd) !== -1) {
    code = code.replace(oldEnd, newEnd);
    fs.writeFileSync(path, code);
    console.log('Fixed extra paren');
} else {
    console.log('Old end not found');
}
console.log('Last 100 chars:', JSON.stringify(code.slice(-100)));
