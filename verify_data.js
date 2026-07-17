const p = require('/tmp/verify_projects.json');

const fields = ['id', 'symbol', 'sector', 'sectors', 'coingeckoId', 'cmcId', 'githubOrg', 'xHandle', 'website', 'description', 'tier', 'verifiedStatus', 'lastVerifiedAt'];

console.log('=== Проверка заполненности полей ===');
fields.forEach(f => {
  const missing = p.filter(x => x[f] === undefined || x[f] === null || x[f] === '');
  console.log('  ' + f + ': пропущено ' + missing.length + ' / ' + p.length);
});

console.log('');
console.log('=== Проверка уникальности id ===');
const ids = p.map(x => x.id);
const dupes = ids.filter((v, i, arr) => arr.indexOf(v) !== i);
console.log('  Дубликаты: ' + (dupes.length === 0 ? 'НЕТ' : dupes.join(', ')));

console.log('');
console.log('=== Проверка API идентификаторов ===');
const noCG = p.filter(x => !x.coingeckoId);
const noCMC = p.filter(x => !x.cmcId);
console.log('  Без coingeckoId: ' + noCG.length);
if (noCG.length > 0) console.log('    ID: ' + noCG.map(x => x.id).slice(0, 10).join(', '));
console.log('  Без cmcId: ' + noCMC.length);
if (noCMC.length > 0) console.log('    ID: ' + noCMC.map(x => x.id).slice(0, 10).join(', '));

console.log('');
console.log('=== Проверка sectors:[] ===');
const multiSector = p.filter(x => x.sectors && x.sectors.length > 1);
console.log('  Мульти-секторных: ' + multiSector.length);
const sectorMismatch = p.filter(x => x.sectors && !x.sectors.includes(x.sector));
console.log('  Несоответствие sectors[] vs sector: ' + sectorMismatch.length);

console.log('');
console.log('=== verifiedStatus ===');
const vs = {};
p.forEach(x => { vs[x.verifiedStatus || 'undefined'] = (vs[x.verifiedStatus || 'undefined'] || 0) + 1; });
console.log('  ' + JSON.stringify(vs));

console.log('');
console.log('=== tier ===');
const ts = {};
p.forEach(x => { ts[x.tier || 'undefined'] = (ts[x.tier || 'undefined'] || 0) + 1; });
console.log('  ' + JSON.stringify(ts));

console.log('');
console.log('=== Примеры по секторам (первые 3) ===');
const sectors = [...new Set(p.map(x => x.sector))].sort();
sectors.forEach(s => {
  const list = p.filter(x => x.sector === s).slice(0, 3);
  console.log('  [' + s + '] ' + list.map(x => x.symbol).join(', ') + ' ...');
});
