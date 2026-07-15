// Audit script for /workspace/data/projects.json
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'projects.json');
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));

console.log('========================================');
console.log('  AUDIT REPORT: data/projects.json');
console.log('========================================');
console.log('Total projects:', data.length);

// 1. By sector
console.log('\n--- 1. DISTRIBUTION BY SECTOR ---');
const bySector = {};
data.forEach(p => {
  const s = p.sector || 'unknown';
  bySector[s] = (bySector[s] || 0) + 1;
});
Object.entries(bySector).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
  console.log('  ' + k.padEnd(20) + v);
});

// 2. Duplicate symbol detection (same ticker across multiple projects)
console.log('\n--- 2. DUPLICATE SYMBOLS (same ticker, multiple projects) ---');
const symMap = {};
data.forEach((p, idx) => {
  if (!p.symbol) return;
  const k = p.symbol.toUpperCase();
  if (!symMap[k]) symMap[k] = [];
  symMap[k].push({ id: p.id, name: p.name, sector: p.sector, idx });
});
const dupes = Object.entries(symMap).filter(([k, v]) => v.length > 1);
console.log('  Duplicate symbol groups:', dupes.length);
dupes.forEach(([sym, list]) => {
  console.log('\n  Ticker: ' + sym);
  list.forEach(x => console.log('    - [' + x.sector + '] ' + x.id + ' (' + x.name + ')'));
});

// 3. Duplicate id detection
console.log('\n--- 3. DUPLICATE IDS ---');
const idMap = {};
data.forEach(p => { if (p.id) idMap[p.id] = (idMap[p.id] || 0) + 1; });
const dupIds = Object.entries(idMap).filter(([k, v]) => v > 1);
console.log('  Duplicate ID groups:', dupIds.length);
dupIds.forEach(([k, v]) => console.log('    - ' + k + ' x' + v));

// 4. Field completeness
console.log('\n--- 4. FIELD COMPLETENESS ---');
const fields = ['id', 'name', 'symbol', 'sector', 'coingeckoId', 'githubOrg', 'description', 'website', 'verified_status'];
fields.forEach(f => {
  const filled = data.filter(p => p[f] && String(p[f]).trim().length > 0).length;
  const pct = ((filled / data.length) * 100).toFixed(1);
  console.log('  ' + f.padEnd(20) + filled + '/' + data.length + ' (' + pct + '%)');
});

// 5. Website quality (valid URL, official domain)
console.log('\n--- 5. WEBSITE QUALITY ---');
const badWeb = data.filter(p => {
  if (!p.website) return true;
  return !p.website.startsWith('http');
});
console.log('  Bad/missing website:', badWeb.length);
badWeb.slice(0, 10).forEach(p => console.log('    - [' + p.sector + '] ' + p.id + ' => ' + p.website));

// 6. CoinGecko ID quality
console.log('\n--- 6. COINGECKO ID QUALITY ---');
const badCG = data.filter(p => !p.coingeckoId || p.coingeckoId.length < 3);
console.log('  Suspicious CoinGecko ID:', badCG.length);
badCG.forEach(p => console.log('    - [' + p.sector + '] ' + p.id + ' => "' + p.coingeckoId + '"'));

// 7. GitHub org quality
console.log('\n--- 7. GITHUB ORG QUALITY ---');
const badGH = data.filter(p => !p.githubOrg || p.githubOrg.length < 2 || /\s/.test(p.githubOrg));
console.log('  Suspicious GitHub org:', badGH.length);
badGH.forEach(p => console.log('    - [' + p.sector + '] ' + p.id + ' => "' + p.githubOrg + '"'));

// 8. Description quality
console.log('\n--- 8. DESCRIPTION QUALITY ---');
const badDesc = data.filter(p => !p.description || p.description.length < 30);
console.log('  Short/missing description:', badDesc.length);

// 9. Verified status
console.log('\n--- 9. VERIFICATION STATUS ---');
const vStatus = {};
data.forEach(p => {
  const s = p.verified_status || 'NONE';
  vStatus[s] = (vStatus[s] || 0) + 1;
});
Object.entries(vStatus).forEach(([k, v]) => console.log('  ' + k.padEnd(15) + v));

// 10. Multi-sector candidates (same name, multiple sectors)
console.log('\n--- 10. MULTI-SECTOR PROJECTS (justification check) ---');
const nameMap = {};
data.forEach(p => {
  if (!p.name) return;
  const k = p.name.toLowerCase();
  if (!nameMap[k]) nameMap[k] = [];
  nameMap[k].push({ id: p.id, sector: p.sector, idx: data.indexOf(p) });
});
const multi = Object.entries(nameMap).filter(([k, v]) => v.length > 1);
console.log('  Multi-sector name groups:', multi.length);
multi.forEach(([name, list]) => {
  console.log('  "' + name + '" appears in:');
  list.forEach(x => console.log('    - [' + x.sector + '] id=' + x.id));
});

console.log('\n========================================');
console.log('  END OF AUDIT');
console.log('========================================');
