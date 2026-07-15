const data = require('/workspace/data/projects.json');
console.log('Total projects:', data.length);

const ids = {};
const symbols = {};
const dupsId = [];
const dupsSym = [];
data.forEach(p => {
  if (ids[p.id]) dupsId.push(p.id); else ids[p.id] = 1;
  if (symbols[p.symbol]) dupsSym.push(p.symbol); else symbols[p.symbol] = 1;
});
console.log('Duplicate IDs:', dupsId.length, dupsId);
console.log('Duplicate symbols (multi-sector is OK):', dupsSym.length, dupsSym.slice(0, 15));

const fields = ['id','symbol','sector','sectors','coingeckoId','cmcId','cmcSlug','githubOrg','githubRepo','xHandle','website','description','tier','verifiedStatus','lastVerifiedAt'];
fields.forEach(f => {
  const missing = data.filter(p => !p[f] || p[f] === null || p[f] === '').length;
  console.log(f.padEnd(18), 'missing:', missing, '/', data.length);
});

const byPrimary = {};
const byAny = {};
data.forEach(p => {
  byPrimary[p.sector] = (byPrimary[p.sector] || 0) + 1;
  p.sectors.forEach(s => { byAny[s] = (byAny[s] || 0) + 1; });
});
console.log('--- Primary sector ---');
Object.entries(byPrimary).forEach(([k,v]) => console.log('  ', k.padEnd(18), v));
console.log('--- By any sector (sectors[]) ---');
Object.entries(byAny).forEach(([k,v]) => console.log('  ', k.padEnd(18), v));
