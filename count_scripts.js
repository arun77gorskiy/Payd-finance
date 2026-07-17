const fs = require('fs');
const content = fs.readFileSync('/workspace/public/js/intelligence/intelligence-v2-bundle.js', 'utf-8');
const lines = content.split('\n').filter(l => l.includes('V2_BASE}/'));
console.log('Scripts in V2_SCRIPTS:', lines.length);
lines.forEach((l, i) => {
    const m = l.match(/V2_BASE\}\/(.+?)`/);
    if (m) console.log('  ' + (i+1) + '. ' + m[1]);
    else console.log('  ?? ' + l.trim());
});
