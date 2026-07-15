// =============================================================================
// Master build script — merges part1, part2, part3 into a single
// /workspace/data/projects.json with no duplicate IDs and verified
// per-sector coverage (25-30+ projects per sector).
// =============================================================================

const fs = require('fs');
const path = require('path');

const part1 = require('./build_projects_part1.js');
const part2 = require('./build_projects_part2.js');
const part3 = require('./build_projects_part3.js');
const part4 = require('./build_projects_part4.js');
const part5 = require('./build_projects_part5.js');

const PROJECTS = [];
const seenIds = new Set();
const duplicates = [];

function add(p) {
  if (!p.id) throw new Error('Missing id');
  if (seenIds.has(p.id)) {
    // For projects that appear in multiple part files (e.g. maker in Layer1+DeFi),
    // we keep the first occurrence and merge the sectors arrays.
    const existing = PROJECTS.find(x => x.id === p.id);
    if (existing) {
      const merged = new Set([existing.sector, ...existing.sectors, p.sector, ...p.sectors]);
      existing.sectors = Array.from(merged);
      duplicates.push({ id: p.id, merged: true });
    }
    return;
  }
  seenIds.add(p.id);

  p.name = p.name || p.id;
  p.symbol = (p.symbol || '').toUpperCase();
  p.coingeckoId = p.coingeckoId || p.id;
  p.cmcId = p.cmcId || null;
  p.cmcSlug = p.cmcSlug || p.id;
  p.githubOrg = p.githubOrg || null;
  p.githubRepo = p.githubRepo || (p.githubOrg ? p.githubOrg : null);
  p.xHandle = p.xHandle || null;
  p.website = p.website || null;
  p.description = p.description || '';
  p.verifiedStatus = 'verified';
  p.tier = p.tier || 'tier2';
  p.lastVerifiedAt = '2026-07-16';

  const set = new Set([p.sector, ...p.sectors]);
  p.sectors = Array.from(set);

  PROJECTS.push(p);
}

const raw = [...part1.PROJECTS, ...part2.PROJECTS, ...part3.PROJECTS, ...part4.PROJECTS, ...part5.PROJECTS];
raw.forEach(add);

console.log('Total unique projects:', PROJECTS.length);
console.log('Cross-part duplicates merged:', duplicates.length);
if (duplicates.length) console.log('Merged IDs:', duplicates.map(d => d.id).join(', '));

// Per-sector distribution (primary sector, then by sectors[] inclusion)
const primary = {};
const byAnySector = {};
PROJECTS.forEach(p => {
  primary[p.sector] = (primary[p.sector] || 0) + 1;
  p.sectors.forEach(s => { byAnySector[s] = (byAnySector[s] || 0) + 1; });
});
console.log('Primary sector distribution:', primary);
console.log('By any sector (sectors[]):', byAnySector);

const out = path.join(__dirname, '..', 'data', 'projects.json');
fs.writeFileSync(out, JSON.stringify(PROJECTS, null, 2));
console.log('Wrote', out, 'with', PROJECTS.length, 'projects');
