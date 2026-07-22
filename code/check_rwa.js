const p = require('/workspace/public/data/projects.json');
const rwa = p.filter(x => x.sector === 'rwa');
const incomplete = rwa.filter(x => !x.coingeckoId || !x.githubOrg || !x.website);
console.log('Incomplete RWA projects:', incomplete.length);
incomplete.forEach(x => console.log(' -', x.id, 'cg=' + x.coingeckoId, 'gh=' + x.githubOrg, 'web=' + x.website));
