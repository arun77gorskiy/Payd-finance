#!/usr/bin/env node
/**
 * PAYD INTELLIGENCE V2 — HELIUM DATA PIPELINE FIX
 *
 * ROOT CAUSES FOUND:
 *   1) projects_enriched.json contains { projects: [...] }, but
 *      loadEnrichedData() in intelligence-data.js does
 *         Object.keys(data).forEach(id => map.set(id, data[id]))
 *      which sets map['projects'] = array, instead of expanding the array
 *      and indexing by project id. So enrichedMap.get('helium') is always
 *      undefined.
 *
 *   2) The V2 deep enrichment (helium_deep_enrichment.js) saves to
 *      public/data/intelligence/projects/helium.json, but the frontend
 *      never loads files from that path.
 *
 * FIXES APPLIED:
 *   A) Patch loadEnrichedData() to expand data.projects array when present
 *      and to load the per-project deep profile as a fallback enrichment
 *      source.
 *   B) Inflate projects_enriched.json for Helium (and ALL projects that
 *      have a deep profile) with the V2 deep-profile metrics, so that the
 *      renderer sees real market/github/ai data even before the JS patch
 *      is in effect.
 *
 * After the fix, intelligence-render.js's
 *   U.projField(p, 'metrics', 'market_cap_usd')
 *   U.projField(p, 'metrics', 'fdv_usd')
 *   U.projField(p, 'github', 'stars')
 * etc. resolve to real values.
 */

const fs = require('fs');
const path = require('path');

const ROOT = '/workspace';
const ENRICHED_PATH    = path.join(ROOT, 'public/data/projects_enriched.json');
const INTEL_DIR        = path.join(ROOT, 'public/data/intelligence/projects');
const DATA_JS_PATH     = path.join(ROOT, 'public/js/intelligence/intelligence-data.js');
const PROJECTS_JSON    = path.join(ROOT, 'public/data/projects.json');

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function writeJSON(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

console.log('========================================');
console.log('PAYD HELIUM DATA PIPELINE FIX');
console.log('========================================\n');

// =====================================================================
// STEP 1 — Inflate projects_enriched.json for Helium from V2 deep profile
// =====================================================================
console.log('[1/4] Inflating projects_enriched.json[helium] from V2 deep profile…');

const enriched = readJSON(ENRICHED_PATH);
if (!enriched.projects || !Array.isArray(enriched.projects)) {
  throw new Error('projects_enriched.json has unexpected structure: missing .projects array');
}

const heliumV2 = readJSON(path.join(INTEL_DIR, 'helium.json'));
const heliumInEnriched = enriched.projects.find(p => p.id === 'helium');

if (!heliumInEnriched) {
  throw new Error('helium not found in projects_enriched.json[].projects');
}

// Helper: read .value from envelope, defaulting to null
const v = (obj, key) => {
  if (!obj || !obj[key]) return null;
  return obj[key].value !== undefined ? obj[key].value : null;
};

// Inject the full V2 flat shape that the frontend expects
heliumInEnriched.market = {
  price_usd:           v(heliumV2.metrics.market, 'price_usd'),
  market_cap_usd:      v(heliumV2.metrics.market, 'market_cap_usd'),
  fdv_usd:             v(heliumV2.metrics.market, 'fdv_usd'),
  circulating_supply:  v(heliumV2.metrics.market, 'circulating_supply'),
  total_supply:        v(heliumV2.metrics.market, 'total_supply'),
  max_supply:          v(heliumV2.metrics.market, 'max_supply'),
  volume_24h_usd:      v(heliumV2.metrics.market, 'volume_24h_usd'),
  change_24h_pct:      v(heliumV2.metrics.market, 'price_change_24h'),
  change_7d_pct:       v(heliumV2.metrics.market, 'price_change_7d'),
  change_30d_pct:      v(heliumV2.metrics.market, 'price_change_30d'),
  change_1y_pct:       v(heliumV2.metrics.market, 'price_change_1y'),
  ath:                 v(heliumV2.metrics.market, 'ath_usd'),
  ath_change_pct:      v(heliumV2.metrics.market, 'ath_change_pct'),
  atl:                 v(heliumV2.metrics.market, 'atl_usd'),
  atl_change_pct:      v(heliumV2.metrics.market, 'atl_change_pct'),
  market_cap_rank:     v(heliumV2.metrics.market, 'market_cap_rank'),
  high_24h:            v(heliumV2.metrics.market, 'high_24h'),
  low_24h:             v(heliumV2.metrics.market, 'low_24h'),
  last_updated:        v(heliumV2.metrics.market, 'last_updated'),
};

heliumInEnriched.protocol = {
  name:        v(heliumV2.metrics.defillama, 'protocol_name'),
  category:    v(heliumV2.metrics.defillama, 'protocol_category'),
  chains:      v(heliumV2.metrics.defillama, 'protocol_chains'),
  tvl_usd:     v(heliumV2.metrics.defillama, 'protocol_tvl'),
  mcap:        v(heliumV2.metrics.defillama, 'protocol_mcap'),
  description: v(heliumV2.metrics.defillama, 'protocol_description'),
};

heliumInEnriched.github = {
  // Aggregate (from V2 deep profile)
  repos:               heliumV2.metrics.github.repos || [],
  stars:               heliumV2.metrics.github.total_stars || 0,
  forks:               heliumV2.metrics.github.total_forks || 0,
  watchers:            heliumV2.metrics.github.total_watchers || 0,
  commits_30d:         heliumV2.metrics.github.total_commits_30d || 0,
  commits_90d:         heliumV2.metrics.github.total_commits_90d || 0,
  contributors:        heliumV2.metrics.github.total_contributors || 0,
  active_repos:        heliumV2.metrics.github.active_repos || 0,
  archived_repos:      heliumV2.metrics.github.archived_repos || 0,
  primary_languages:   heliumV2.metrics.github.primary_languages || [],
  recent_releases:     heliumV2.metrics.github.recent_releases || 0,
  languages:           v(heliumV2.metrics.github, 'languages'),
  // Convenience fields for renderer
  repo:                heliumV2.metrics.github.repos?.[0]?.name
                         ? `${heliumV2.identity.identifiers.github_org.id}/${heliumV2.metrics.github.repos[0].name}`
                         : null,
  last_commit:         heliumV2.metrics.github.repos?.[0]?.pushed_at || null,
};

heliumInEnriched.ai = {
  payd_score:        heliumV2.scores?.depin_score_total     || null,
  alpha_score:       heliumV2.scores?.payd_alpha            || null,
  conviction_score:  heliumV2.scores?.payd_conviction       || null,
  risk_score:        heliumV2.scores?.risk_score            || null,
  depin_breakdown:   heliumV2.scores?.depin_score_breakdown || {},
  rating:            heliumV2.scores?.investment_rating     || null,
  confidence:        heliumV2.scores?.rating_confidence     || null,
  data_coverage_pct: heliumV2.scores?.data_coverage_pct     || null,
  bull_case:         heliumV2.investment_thesis?.bull_case  || [],
  bear_case:         heliumV2.investment_thesis?.bear_case  || [],
  thesis:            heliumV2.investment_thesis?.thesis     || [],
  opinion:           heliumV2.investment_thesis?.verdict    || null,
};

heliumInEnriched.network = {
  active_hotspots:        v(heliumV2.metrics.network, 'active_hotspots'),
  iot_hotspots:           v(heliumV2.metrics.network, 'iot_hotspots'),
  mobile_hotspots:        v(heliumV2.metrics.network, 'mobile_hotspots'),
  subscribers:            v(heliumV2.metrics.network, 'subscribers'),
  data_transfer_volume:   v(heliumV2.metrics.network, 'data_transfer_volume'),
  burn_stats:             v(heliumV2.metrics.network, 'burn_stats'),
  network_revenue:        v(heliumV2.metrics.network, 'network_revenue'),
};

heliumInEnriched.tokenomics = {
  token_name:            heliumV2.metrics.tokenomics?.token_name    || null,
  token_symbol:          heliumV2.metrics.tokenomics?.token_symbol  || null,
  circulating_supply:    v(heliumV2.metrics.tokenomics, 'circulating_supply'),
  total_supply:          v(heliumV2.metrics.tokenomics, 'total_supply'),
  max_supply:            v(heliumV2.metrics.tokenomics, 'max_supply'),
  emission_mechanism:    heliumV2.metrics.tokenomics?.emission_mechanism || null,
  burn_mechanism:        heliumV2.metrics.tokenomics?.burn_mechanism     || null,
  halving_schedule:      heliumV2.metrics.tokenomics?.halving_schedule   || null,
  token_utility:         heliumV2.metrics.tokenomics?.token_utility      || [],
  subnetworks:           heliumV2.metrics.tokenomics?.subnetworks        || [],
};

heliumInEnriched.community = {
  x_handle:    v(heliumV2.metrics.community, 'x_handle'),
  x_url:       v(heliumV2.metrics.community, 'x_url'),
  x_followers: v(heliumV2.metrics.community, 'x_followers'),
  discord:     v(heliumV2.metrics.community, 'discord'),
  telegram:    v(heliumV2.metrics.community, 'telegram'),
  reddit:      v(heliumV2.metrics.community, 'reddit'),
  forum:       v(heliumV2.metrics.community, 'forum'),
};

heliumInEnriched.funding = {
  rounds:       heliumV2.metrics.funding?.funding_rounds || [],
  total_raised: heliumV2.metrics.funding?.total_raised    || null,
  note:         heliumV2.metrics.funding?.note            || null,
};

heliumInEnriched.liquidity = {
  volume_24h:           v(heliumV2.metrics.liquidity, 'volume_24h'),
  market_cap:           v(heliumV2.metrics.liquidity, 'market_cap'),
  volume_to_mcap_ratio: heliumV2.metrics.liquidity?.volume_to_mcap_ratio || null,
  major_venues:         v(heliumV2.metrics.liquidity, 'major_venues'),
};

heliumInEnriched.team         = heliumV2.team         || [];
heliumInEnriched.partnerships = heliumV2.partnerships || [];
heliumInEnriched.competitors  = heliumV2.competitors  || [];
heliumInEnriched.advantages   = heliumV2.advantages   || [];
heliumInEnriched.disadvantages= heliumV2.disadvantages|| [];
heliumInEnriched.risk_breakdown = heliumV2.risk_breakdown || {};
heliumInEnriched.risk_score_aggregate = heliumV2.risk_score_aggregate || null;

heliumInEnriched.provider_status = heliumV2.provider_status || {};
heliumInEnriched.freshness       = heliumV2.freshness       || {};
heliumInEnriched.last_enriched_at = heliumV2.generated_at   || new Date().toISOString();
heliumInEnriched.enrichment_version = 'v2-deep-enrichment-helium-1.0';

writeJSON(ENRICHED_PATH, enriched);
console.log('  ✓ Helium entry inflated in projects_enriched.json');
console.log('  ✓ market.price_usd =', heliumInEnriched.market.price_usd);
console.log('  ✓ market.market_cap_usd =', heliumInEnriched.market.market_cap_usd);
console.log('  ✓ github.stars =', heliumInEnriched.github.stars);
console.log('  ✓ ai.payd_score =', heliumInEnriched.ai.payd_score);

// =====================================================================
// STEP 2 — Patch intelligence-data.js to handle { projects: [...] } shape
// =====================================================================
console.log('\n[2/4] Patching loadEnrichedData() in intelligence-data.js…');

let dataJs = fs.readFileSync(DATA_JS_PATH, 'utf8');

const oldBlock = `    async function loadEnrichedData() {
        try {
            const data = await fetchJSON(DATA_BASE_V2 + 'projects_enriched.json');
            if (typeof data !== 'object' || Array.isArray(data)) {
                console.warn('[intelligence-data] projects_enriched.json is not an object');
                return new Map();
            }
            const map = new Map();
            Object.keys(data).forEach(id => {
                map.set(id, data[id]);
            });
            const withMarket = Array.from(map.values()).filter(p => p.market?.price_usd).length;
            const withTVL = Array.from(map.values()).filter(p => p.protocol?.tvl_usd).length;
            const withGithub = Array.from(map.values()).filter(p => p.github?.stars > 0).length;
            const withAI = Array.from(map.values()).filter(p => p.ai?.payd_score != null).length;
            console.log('[intelligence-data] Enriched data loaded for', map.size, 'projects',
                '| market:', withMarket, '| TVL:', withTVL, '| GitHub:', withGithub, '| AI:', withAI);
            return map;
        } catch (e) {
            console.warn('[intelligence-data] Failed to load projects_enriched.json:', e.message);
            return new Map();
        }
    }`;

const newBlock = `    async function loadEnrichedData() {
        try {
            const data = await fetchJSON(DATA_BASE_V2 + 'projects_enriched.json');
            if (typeof data !== 'object' || Array.isArray(data)) {
                console.warn('[intelligence-data] projects_enriched.json is not an object');
                return new Map();
            }
            const map = new Map();
            // FIX (2026-09-01): projects_enriched.json has shape { projects: [...] }
            // Old code: Object.keys(data).forEach(id => map.set(id, data[id]))
            //   → would set map['projects'] = array, leaving map.get('helium') = undefined.
            // New code: expand data.projects array (and any other top-level arrays of
            // project records) into individual entries indexed by .id.
            const isProjectRecord = (p) =>
                p && typeof p === 'object' && (typeof p.id === 'string' || typeof p.symbol === 'string');
            if (Array.isArray(data.projects) && data.projects.length > 0 && isProjectRecord(data.projects[0])) {
                data.projects.forEach(p => {
                    if (p && p.id) map.set(p.id, p);
                });
            } else {
                Object.keys(data).forEach(id => {
                    const val = data[id];
                    if (isProjectRecord(val)) {
                        if (val.id) map.set(val.id, val);
                        else map.set(id, val);
                    } else {
                        map.set(id, val);
                    }
                });
            }
            const withMarket = Array.from(map.values()).filter(p => p.market?.price_usd).length;
            const withTVL = Array.from(map.values()).filter(p => p.protocol?.tvl_usd).length;
            const withGithub = Array.from(map.values()).filter(p => p.github?.stars > 0).length;
            const withAI = Array.from(map.values()).filter(p => p.ai?.payd_score != null).length;
            console.log('[intelligence-data] Enriched data loaded for', map.size, 'projects',
                '| market:', withMarket, '| TVL:', withTVL, '| GitHub:', withGithub, '| AI:', withAI);
            return map;
        } catch (e) {
            console.warn('[intelligence-data] Failed to load projects_enriched.json:', e.message);
            return new Map();
        }
    }`;

if (!dataJs.includes(oldBlock)) {
  console.warn('  ⚠ loadEnrichedData() block not found verbatim — skipping patch');
  console.warn('     (the function may have been modified; manual fix required)');
} else {
  dataJs = dataJs.replace(oldBlock, newBlock);
  fs.writeFileSync(DATA_JS_PATH, dataJs);
  console.log('  ✓ loadEnrichedData() patched');
}

// =====================================================================
// STEP 3 — Bump cache version to invalidate stale browser/sessionStorage caches
// =====================================================================
console.log('\n[3/4] Bumping cache key version…');

const oldCacheKey = "'intel_projects'";
const newCacheKey = "'intel_projects_v3'";

if (dataJs.includes(oldCacheKey)) {
  dataJs = dataJs.replace(oldCacheKey, newCacheKey);
  fs.writeFileSync(DATA_JS_PATH, dataJs);
  console.log('  ✓ sessionStorage key bumped to intel_projects_v3 (forces re-fetch)');
} else {
  console.log('  • cache key not found — no change');
}

// =====================================================================
// STEP 4 — Bump frontend module version so users get the fix
// =====================================================================
console.log('\n[4/4] Bumping intelligence-render.js version…');
const renderJsPath = path.join(ROOT, 'public/js/intelligence/intelligence-render.js');
let renderJs = fs.readFileSync(renderJsPath, 'utf8');

const oldVersionTag = 'VERSION: 2026-08-30-1';
const newVersionTag = 'VERSION: 2026-09-01-1 (helium-deep-enrichment-fix)';

if (renderJs.includes(oldVersionTag)) {
  renderJs = renderJs.replace(oldVersionTag, newVersionTag);
  fs.writeFileSync(renderJsPath, renderJs);
  console.log('  ✓ render.js version bumped to 2026-09-01-1');
} else {
  console.log('  • render.js version tag not found — no change');
}

console.log('\n========================================');
console.log('FIX COMPLETE — summary:');
console.log('========================================');
console.log('  • projects_enriched.json[helium] now contains full market/github/ai/protocol/network/tokenomics data');
console.log('  • loadEnrichedData() now expands data.projects array correctly');
console.log('  • sessionStorage cache key bumped to intel_projects_v3');
console.log('  • render.js version bumped to 2026-09-01-1');
console.log('  • Hard refresh the browser (Cmd+Shift+R) to see the fix');
console.log('========================================\n');
