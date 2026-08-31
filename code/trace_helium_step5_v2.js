#!/usr/bin/env node
/**
 * PAYD INTELLIGENCE V2 — HELIUM END-TO-END TRACE (v2 — corrected paths)
 *
 * Uses the ACTUAL paths the frontend uses:
 *   /data/projects.json
 *   /data/projects_enriched.json
 *   /data/score_history.json
 *   /data/intelligence/projects/helium.json  (V2 deep profile, currently NOT loaded)
 *
 * For each tracked Helium metric, this script traces:
 *   RAW CG/GH -> enriched field (envelope.value) -> mapped flat value -> what renderer sees
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = '/workspace';

function logHeader(t) {
  console.log('\n' + '='.repeat(80));
  console.log('  ' + t);
  console.log('='.repeat(80));
}

function readJSON(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return { __error: e.message };
  }
}

// ============================================================
// STEP 5 v2 — TRACE FIELDS WITH CORRECT PATHS
// ============================================================
function step5v2_traceFields() {
  logHeader('STEP 5 v2 — TRACE FIELDS WITH CORRECT FRONTEND PATHS');

  // What the frontend actually consumes
  const projects = readJSON(path.join(ROOT, 'public/data/projects.json'));
  const enriched = readJSON(path.join(ROOT, 'public/data/projects_enriched.json'));
  const heliumV2 = readJSON(path.join(ROOT, 'public/data/intelligence/projects/helium.json'));

  // Helium record in projects.json (list)
  const heliumProjects = Array.isArray(projects) ? projects : (projects.projects || []);
  const heliumInProjects = heliumProjects.find(p => p.id === 'helium' || (p.symbol || '').toUpperCase() === 'HNT');

  // Helium record in projects_enriched.json (dict keyed by id)
  const heliumEnriched = (enriched && !enriched.__error) ? enriched.helium : null;

  console.log('--- Source records ---');
  console.log('heliumInProjects.id    :', heliumInProjects?.id);
  console.log('heliumInProjects.fields:', heliumInProjects ? Object.keys(heliumInProjects).length : 0);
  console.log('heliumEnriched.id      :', heliumEnriched?.id);
  console.log('heliumEnriched.fields  :', heliumEnriched ? Object.keys(heliumEnriched).length : 0);
  console.log('heliumV2.project_id    :', heliumV2?.project_id);
  console.log('heliumV2.fields        :', heliumV2 ? Object.keys(heliumV2).length : 0);

  // Simulate applyFieldMapping for Helium
  // 1) Base V2 object = heliumInProjects
  // 2) Enriched object = heliumEnriched  (per V2.1, this is enrichedData)
  // 3) Score history = (not relevant for market data, will skip)

  // Apply mapping
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
    github_activity:   { v2Path: 'enriched.github.commits_30d' },
  };

  function getNested(obj, dotted) {
    if (!obj) return undefined;
    return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }

  // Simulate: what V2.1 code does for Helium
  console.log('\n--- Simulated V2.1 applyFieldMapping(Helium) ---');
  console.log('NOTE: enriched = heliumEnriched (from projects_enriched.json)');
  console.log('NOTE: This is what the renderer actually sees.');
  console.log('');
  console.log('| MAPPED FIELD          | V2 base value                | enriched.X (current)        | enriched.X (V2 profile)     |');
  console.log('|-----------------------|------------------------------|-----------------------------|-----------------------------|');

  const rows = [];
  for (const [key, meta] of Object.entries(FIELD_MAPPING)) {
    let baseVal = '-';
    if (heliumInProjects) baseVal = heliumInProjects[meta.v2Path] ?? '-';
    let enrichedVal = '-';
    if (meta.v2Path.startsWith('enriched.')) {
      const nested = getNested(heliumEnriched, meta.v2Path.replace('enriched.', ''));
      enrichedVal = nested ?? '<absent>';
    }
    let v2ProfileVal = '-';
    if (meta.v2Path.startsWith('enriched.')) {
      const nested = getNested(heliumV2, meta.v2Path.replace('enriched.', ''));
      v2ProfileVal = nested ?? '<absent>';
    }
    const fmt = v => {
      if (v === undefined) return '<absent>';
      if (v === null) return '<null>';
      if (typeof v === 'object' && v.value !== undefined) return JSON.stringify(v.value).slice(0, 22);
      return JSON.stringify(v).slice(0, 28);
    };
    console.log(`| ${key.padEnd(21)} | ${String(fmt(baseVal)).padEnd(28)} | ${String(fmt(enrichedVal)).padEnd(27)} | ${String(fmt(v2ProfileVal)).padEnd(27)} |`);

    rows.push({
      field: key,
      v2_path: meta.v2Path,
      v2_base_value: baseVal,
      enriched_current: enrichedVal,
      v2_profile_value: v2ProfileVal,
    });
  }

  return rows;
}

function step6_schemaMismatches(rows) {
  logHeader('STEP 6 — SCHEMA MISMATCH DIAGNOSIS');

  console.log('\nDiagnosis:');
  console.log('-----------');
  console.log('The frontend reads market_cap via path: enriched.market.market_cap_usd');
  console.log('The current projects_enriched.json has NO "market" key for Helium.');
  console.log('Our V2 deep profile stores it at: metrics.market.market_cap_usd.value');
  console.log('');
  console.log('Root cause:');
  console.log('  1. projects_enriched.json contains only identity/identifier metadata');
  console.log('     for Helium — no market, github, ai, or protocol data.');
  console.log('  2. The V2 deep enrichment script saves to');
  console.log('     public/data/intelligence/projects/helium.json (single-project file).');
  console.log('  3. intelligence-data.js NEVER loads');
  console.log('     public/data/intelligence/projects/*.json — it only loads');
  console.log('     projects.json, projects_enriched.json, score_history.json.');
  console.log('  4. Therefore every renderer call to');
  console.log('     U.projField(p, "metrics", "market_cap_usd") returns null');
  console.log('     because V1 object has no metrics.market_cap_usd flat key —');
  console.log('     it only has metrics.market.market_cap_usd inside the V2 envelope.');
  console.log('');
  console.log('Two-line fix:');
  console.log('  • Update projects_enriched.json[helium] with real values:');
  console.log('      { market: { market_cap_usd: 127743319, ... },');
  console.log('        github: { total_stars: 215, ... },');
  console.log('        ai: { payd_score: 72, ... } }');
  console.log('  • OR: change V2.1 to ALSO load intelligence/projects/{id}.json');
  console.log('    and use it as enrichedData when present.');
  console.log('');
}

// ============================================================
// MAIN
// ============================================================
const rows = step5v2_traceFields();
step6_schemaMismatches(rows);

// Persist
const outFile = path.join(ROOT, 'docs/helium-trace-step5-v2.json');
fs.writeFileSync(outFile, JSON.stringify({ generated_at: new Date().toISOString(), rows }, null, 2));
console.log(`\nResults written to: ${outFile}`);
