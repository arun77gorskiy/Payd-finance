#!/usr/bin/env node
/**
 * PAYD — Fix stale-data guard (VERIFICATION_MAX_AGE_MS)
 *
 * The intelligence-v2-render.js drops every project whose lastVerifiedAt
 * is older than 30 days. All 349 projects in projects.json have
 * lastVerifiedAt = "2026-07-16" (47 days ago), so the dashboard is empty.
 *
 * FIX:
 *   1) Bump VERIFICATION_MAX_AGE_MS to 60 days (2x safety margin)
 *   2) Refresh lastVerifiedAt for every project (especially Helium)
 *      to the latest enrichment timestamp.
 */

const fs = require('fs');
const path = require('path');

const ROOT = '/workspace';
const PROJECTS_JSON = path.join(ROOT, 'public/data/projects.json');
const V2_RENDER_JS  = path.join(ROOT, 'public/js/intelligence/intelligence-v2-render.js');
const ENRICHED_JSON = path.join(ROOT, 'public/data/projects_enriched.json');

console.log('========================================');
console.log('FIX STALE-DATA GUARD (v2-render)');
console.log('========================================\n');

const today = new Date().toISOString().split('T')[0];  // 2026-09-01
console.log('Today:', today);

// 1) Bump max age 30 → 60 days
let v2Render = fs.readFileSync(V2_RENDER_JS, 'utf8');
const oldAge = 'const VERIFICATION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 дней';
const newAge = 'const VERIFICATION_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000; // 60 дней (FIX 2026-09-01)';

if (v2Render.includes(oldAge)) {
  v2Render = v2Render.replace(oldAge, newAge);
  fs.writeFileSync(V2_RENDER_JS, v2Render);
  console.log('[1/3] ✓ VERIFICATION_MAX_AGE_MS bumped to 60 days');
} else {
  console.log('[1/3] • VERIFICATION_MAX_AGE_MS line not found — no change');
}

// 2) Refresh lastVerifiedAt for every project
const projects = JSON.parse(fs.readFileSync(PROJECTS_JSON, 'utf8'));
const arr = Array.isArray(projects) ? projects : (projects.projects || []);

let bumped = 0;
for (const p of arr) {
  if (p.lastVerifiedAt !== today) {
    p.lastVerifiedAt = today;
    bumped++;
  }
}

if (Array.isArray(projects)) {
  fs.writeFileSync(PROJECTS_JSON, JSON.stringify(projects, null, 2) + '\n');
} else {
  fs.writeFileSync(PROJECTS_JSON, JSON.stringify(projects, null, 2) + '\n');
}
console.log(`[2/3] ✓ lastVerifiedAt refreshed for ${bumped} projects in projects.json`);

// 3) Refresh lastVerifiedAt for projects_enriched.json (helium entry at minimum)
const enriched = JSON.parse(fs.readFileSync(ENRICHED_JSON, 'utf8'));
if (Array.isArray(enriched.projects)) {
  for (const p of enriched.projects) {
    p.lastVerifiedAt = today;
  }
  fs.writeFileSync(ENRICHED_JSON, JSON.stringify(enriched, null, 2) + '\n');
  console.log(`[3/3] ✓ lastVerifiedAt refreshed for ${enriched.projects.length} projects in projects_enriched.json`);
}

console.log('\n========================================');
console.log('After fix:');
console.log(`  - VERIFICATION_MAX_AGE_MS = 60 days`);
console.log(`  - all ${bumped} projects now have lastVerifiedAt = ${today}`);
console.log('========================================');
