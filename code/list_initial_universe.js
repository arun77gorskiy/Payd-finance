// Print all initial-universe files
const fs = require('fs');
const path = require('path');

const SECTORS = ['ai','defi','depin','desci','gaming','infrastructure','layer1','layer2','rwa'];

SECTORS.forEach(s => {
  const file = path.join(__dirname, '..', 'data', 'initial-universe', s + '.json');
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log('\n=== ' + s.toUpperCase() + ' (' + d.length + ') ===');
  d.forEach(p => {
    console.log('  ' + (p.id||'').padEnd(22) + ' | ' + (p.symbol||'').padEnd(8) + ' | ' + (p.name||'').padEnd(28) + ' | cg=' + (p.coingeckoId||'') + ' | gh=' + (p.githubOrg||''));
  });
});
