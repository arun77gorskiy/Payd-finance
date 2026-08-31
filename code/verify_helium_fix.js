#!/usr/bin/env node
/**
 * VERIFY HELIUM FIX — simulate the actual frontend pipeline after the fix
 */

const fs = require('fs');
const path = require('path');

const ROOT = '/workspace';

function readJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

console.log('========================================');
console.log('VERIFY HELIUM FIX (simulated frontend)');
console.log('========================================\n');

// Simulate the V2.1 pipeline
const projectsArr    = (() => {
  const d = readJSON(path.join(ROOT, 'public/data/projects.json'));
  return Array.isArray(d) ? d : (d.projects || []);
})();
const enrichedData   = readJSON(path.join(ROOT, 'public/data/projects_enriched.json'));
const heliumV2       = readJSON(path.join(ROOT, 'public/data/intelligence/projects/helium.json'));

// 1) Expand enrichedData (the FIX)
const map = new Map();
const isProjectRecord = p => p && typeof p === 'object' && (typeof p.id === 'string');
if (Array.isArray(enrichedData.projects) && enrichedData.projects.length > 0 && isProjectRecord(enrichedData.projects[0])) {
  enrichedData.projects.forEach(p => { if (p && p.id) map.set(p.id, p); });
}

const heliumInEnriched = map.get('helium');
const heliumInProjects = projectsArr.find(p => p.id === 'helium');

console.log('--- After fix ---');
console.log('heliumInProjects.id          :', heliumInProjects?.id);
console.log('heliumInEnriched.id          :', heliumInEnriched?.id);
console.log('heliumInEnriched.market      :', heliumInEnriched?.market ? Object.keys(heliumInEnriched.market).length + ' fields' : 'MISSING');
console.log('heliumInEnriched.github      :', heliumInEnriched?.github ? Object.keys(heliumInEnriched.github).length + ' fields' : 'MISSING');
console.log('heliumInEnriched.ai          :', heliumInEnriched?.ai ? Object.keys(heliumInEnriched.ai).length + ' fields' : 'MISSING');
console.log('');

// 2) Simulate applyFieldMapping
const FIELD_MAPPING = {
  name:              { v2Path: 'name' },
  ticker:            { v2Path: 'symbol' },
  sector:            { v2Path: 'sector' },
  coingecko_id:      { v2Path: 'coingeckoId' },
  github_org:        { v2Path: 'githubOrg' },
  price_usd:         { v2Path: 'enriched.market.price_usd' },
  market_cap_usd:    { v2Path: 'enriched.market.market_cap_usd' },
  fdv_usd:           { v2Path: 'enriched.market.fdv_usd' },
  circulating_supply:{ v2Path: 'enriched.market.circulating_supply' },
  total_supply:      { v2Path: 'enriched.market.total_supply' },
  max_supply:        { v2Path: 'enriched.market.max_supply' },
  volume_24h_usd:    { v2Path: 'enriched.market.volume_24h_usd' },
  change_24h_pct:    { v2Path: 'enriched.market.change_24h_pct' },
  change_7d_pct:     { v2Path: 'enriched.market.change_7d_pct' },
  change_30d_pct:    { v2Path: 'enriched.market.change_30d_pct' },
  ath:               { v2Path: 'enriched.market.ath' },
  ath_change_pct:    { v2Path: 'enriched.market.ath_change_pct' },
  market_cap_rank:   { v2Path: 'enriched.market.market_cap_rank' },
  tvl_usd:           { v2Path: 'enriched.protocol.tvl_usd' },
  developer_activity:{ v2Path: 'enriched.github.commits_30d' },
  github_stars:      { v2Path: 'enriched.github.stars' },
  github_forks:      { v2Path: 'enriched.github.forks' },
  payd_score:        { v2Path: 'enriched.ai.payd_score' },
  alpha_score:       { v2Path: 'enriched.ai.alpha_score' },
  risk_score:        { v2Path: 'enriched.ai.risk_score' },
};

function getNested(obj, dotted) {
  if (!obj) return undefined;
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

const out = {};
for (const [key, meta] of Object.entries(FIELD_MAPPING)) {
  let value = null;
  if (meta.v2Path.startsWith('enriched.')) {
    value = getNested(heliumInEnriched, meta.v2Path.replace('enriched.', ''));
  } else if (heliumInProjects) {
    value = heliumInProjects[meta.v2Path];
  }
  out[key] = value;
}

// Also apply known V1 structure that the renderer reads directly
const v1Project = {
  ...heliumInProjects,
  ...out,
  // Add V1-style aggregate
  metrics: {
    market_cap_usd: out.market_cap_usd,
    fdv_usd: out.fdv_usd,
    tvl_usd: out.tvl_usd,
    monthly_revenue_usd: null,
  },
  github: {
    stars: out.github_stars,
    forks: out.github_forks,
    commits_30d: out.developer_activity,
    active_devs_30d: 0,
    contributors_total: 0,
    last_commit: heliumInEnriched?.github?.last_commit,
    repo: heliumInEnriched?.github?.repo,
    primary_languages: heliumInEnriched?.github?.primary_languages,
  },
  tokenomics: heliumInEnriched?.tokenomics || {},
  scores: {
    payd_score: out.payd_score,
    alpha_score: out.alpha_score,
    risk_score: out.risk_score,
    investment_rating: heliumInEnriched?.ai?.rating,
  },
  ai_score_components: heliumInEnriched?.ai?.depin_breakdown || {},
};

console.log('--- Simulated V1 object (what renderer sees) ---');
console.log(JSON.stringify(v1Project, null, 2).slice(0, 3500));
console.log('');

// 3) Test what U.projField() will return
function projField(p, ...path) {
  if (p == null) return null;
  let cur = p;
  for (let i = 0; i < path.length; i++) {
    if (cur == null) return null;
    cur = cur[path[i]];
  }
  return (cur == null) ? null : cur;
}

const testFields = [
  ['metrics', 'market_cap_usd'],
  ['metrics', 'fdv_usd'],
  ['metrics', 'tvl_usd'],
  ['github', 'stars'],
  ['github', 'forks'],
  ['github', 'commits_30d'],
  ['github', 'primary_languages'],
  ['tokenomics', 'max_supply'],
  ['tokenomics', 'circulating_supply'],
  ['ai_score_components', 'network_adoption'],
  ['scores', 'payd_score'],
];

console.log('--- U.projField() results (what the renderer gets) ---');
console.log('| PATH                                | VALUE                              |');
console.log('|-------------------------------------|------------------------------------|');
for (const p of testFields) {
  const v = projField(v1Project, ...p);
  const display = v === null ? 'null ❌' :
    (typeof v === 'object' ? JSON.stringify(v).slice(0, 35) : String(v).slice(0, 35));
  const status = v === null ? '❌' : '✓';
  console.log(`| ${p.join('.').padEnd(35)} | ${display.padEnd(35)} |`);
}

console.log('\n========================================');
console.log('COVERAGE CHECK:');
const totalFields = testFields.length;
const nonNull = testFields.filter(([_, __]) => {
  const v = projField(v1Project, ..._);
  return v !== null && v !== undefined && v !== 0;
}).length;
console.log(`  ${nonNull}/${totalFields} fields have real values (non-zero, non-null)`);
console.log('========================================');
