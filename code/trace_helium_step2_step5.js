#!/usr/bin/env node
/**
 * PAYD INTELLIGENCE V2 — HELIUM END-TO-END TRACE
 * STEP 2 (Direct CoinGecko Test) + STEP 5 (Field Transformation Trace)
 *
 * For each tracked Helium metric, this script:
 *  1) Executes the actual provider request used by PAYD
 *  2) Captures the raw provider value
 *  3) Traces the value through:
 *     RAW PROVIDER -> NORMALIZED -> ENRICHED -> SAVED JSON -> FRONTEND LOAD
 *  4) Builds a transformation table for the acceptance test
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = '/workspace';
const HELIUM_ID = 'helium';         // canonical id from projects.json
const HELIUM_CG = 'helium';         // CoinGecko id (confirmed earlier)
const HELIUM_DL = null;             // to be discovered
const HELIUM_GH = 'helium';         // GitHub org

// ============================================================
// HELPERS
// ============================================================
function logHeader(title) {
  console.log('\n' + '='.repeat(80));
  console.log('  ' + title);
  console.log('='.repeat(80));
}

function safeReadJSON(p) {
  try {
    if (!fs.existsSync(p)) return { __error: 'file_not_found', __path: p };
    const raw = fs.readFileSync(p, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { __error: 'json_parse_error', __path: p, __message: e.message };
  }
}

function findHeliumInList(list) {
  if (!Array.isArray(list)) return null;
  const norm = (s) => String(s || '').toLowerCase().trim();
  return list.find(p =>
    norm(p.id) === 'helium' ||
    norm(p.coingecko_id) === 'helium' ||
    norm(p.symbol).toLowerCase() === 'hnt' ||
    norm(p.name).toLowerCase() === 'helium'
  ) || null;
}

function countNonNull(obj) {
  if (!obj || typeof obj !== 'object') return 0;
  let total = 0, nonNull = 0;
  for (const [k, v] of Object.entries(obj)) {
    total++;
    if (v !== null && v !== undefined && v !== '' &&
        !(typeof v === 'object' && Object.keys(v).length === 0)) {
      nonNull++;
    }
  }
  return { total, nonNull };
}

function deepGet(obj, dotted) {
  if (!obj) return undefined;
  const parts = dotted.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

// ============================================================
// HTTP helpers
// ============================================================
function httpGet(url, headers = {}) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { 'User-Agent': 'PAYD-Helium-Trace/1.0', ...headers },
      timeout: 15000,
    };
    const req = https.request(opts, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch (e) { parsed = null; }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          raw: body.slice(0, 4000),  // cap for log
          json: parsed,
        });
      });
    });
    req.on('error', (e) => resolve({ status: 0, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'timeout' }); });
    req.end();
  });
}

// ============================================================
// STEP 1 — LOCATE THE EXACT HELIUM RECORD
// ============================================================
async function step1_locateRecords() {
  logHeader('STEP 1 — LOCATE THE EXACT HELIUM RECORD');

  const targets = [
    { name: 'projects.json',                         path: 'public/data/projects.json' },
    { name: 'projects_enriched.json',                path: 'public/data/projects_enriched.json' },
    { name: 'projects_ai_analyzed.json',             path: 'public/data/projects_ai_analyzed.json' },
    { name: 'projects_reasoning.json',               path: 'public/data/projects_reasoning.json' },
    { name: 'intelligence/projects/helium.json',     path: 'public/data/intelligence/projects/helium.json' },
    { name: 'intelligence/projects.json (list)',     path: 'public/data/intelligence/projects.json' },
    { name: 'intelligence/master.json',              path: 'public/data/intelligence/master.json' },
  ];

  for (const t of targets) {
    const full = path.join(ROOT, t.path);
    const data = safeReadJSON(full);

    if (data && data.__error) {
      console.log(`\n[${t.name}]  path=${t.path}`);
      console.log(`   ERROR: ${data.__error} (${data.__message || ''})`);
      continue;
    }

    let record = null;
    if (Array.isArray(data)) {
      record = findHeliumInList(data);
    } else if (data && typeof data === 'object') {
      // either a single top-level helium object or a dict keyed by id
      if (data.id === 'helium' || data.coingecko_id === 'helium') {
        record = data;
      } else if (data.helium) {
        record = data.helium;
      } else if (data.projects && Array.isArray(data.projects)) {
        record = findHeliumInList(data.projects);
      }
    }

    if (record) {
      const { total, nonNull } = countNonNull(record);
      console.log(`\n[${t.name}]  path=${t.path}`);
      console.log(`   PROJECT ID:    ${record.id || record.project_id || 'n/a'}`);
      console.log(`   COINGECKO ID:  ${record.coingecko_id || record.ids?.coingecko || 'n/a'}`);
      console.log(`   DEFILLAMA ID:  ${record.defillama_slug || record.ids?.defillama || 'n/a'}`);
      console.log(`   GITHUB:        ${record.github_org || record.github || record.ids?.github || 'n/a'}`);
      console.log(`   FIELD COUNT:   ${total}`);
      console.log(`   NON-NULL:      ${nonNull}`);
    } else {
      console.log(`\n[${t.name}]  path=${t.path}  —  HELIUM NOT FOUND`);
    }
  }
}

// ============================================================
// STEP 2 — TEST COINGECKO DIRECTLY
// ============================================================
async function step2_testCoinGeckoDirect() {
  logHeader('STEP 2 — TEST COINGECKO DIRECTLY (Helium)');

  // The exact endpoint PAYD uses (see code/coingecko*.js, data_mappings_v2.js)
  const url = `https://api.coingecko.com/api/v3/coins/${HELIUM_CG}?localization=false&tickers=false&community_data=false&developer_data=true&sparkline=false`;
  console.log(`Request URL: ${url}`);

  const res = await httpGet(url, { Accept: 'application/json' });
  console.log(`HTTP Status: ${res.status}`);
  console.log(`Rate-Remaining: ${res.headers['x-ratelimit-remaining'] || 'n/a'}`);

  if (res.status !== 200 || !res.json) {
    console.log('RAW (truncated):', res.raw);
    return { ok: false, reason: 'cg_request_failed', raw: res };
  }

  const d = res.json;
  const md = d.market_data || {};
  const tracked = {
    'price':                       md.current_price?.usd,
    'market_cap':                  md.market_cap?.usd,
    'fully_diluted_valuation':     md.fully_diluted_valuation?.usd,
    'circulating_supply':          md.circulating_supply,
    'total_supply':                md.total_supply,
    'max_supply':                   md.max_supply,
    'total_volume':                md.total_volume?.usd,
    'market_cap_rank':             d.market_cap_rank,
    'ath':                          md.ath?.usd,
    'ath_change_percentage':       md.ath_change_percentage?.usd,
    'price_change_7d':              md.price_change_percentage_7d,
    'price_change_30d':             md.price_change_percentage_30d,
    'price_change_24h':             md.price_change_percentage_24h,
    'developer_stars':              d.developer_data?.stars,
    'developer_forks':              d.developer_data?.forks,
    'developer_subscribers':        d.developer_data?.subscribers,
    'developer_total_issues':       d.developer_data?.total_issues,
    'developer_closed_issues':      d.developer_data?.closed_issues,
    'developer_pull_requests_merged': d.developer_data?.pull_requests_merged,
    'developer_commit_count_4_weeks': d.developer_data?.commit_count_4_weeks,
  };

  console.log('\n--- RAW CoinGecko values for Helium ---');
  for (const [k, v] of Object.entries(tracked)) {
    console.log(`  ${k.padEnd(36)}  ${v === undefined ? '<missing>' : JSON.stringify(v)}`);
  }

  return { ok: true, tracked, raw: d };
}

// ============================================================
// STEP 3 — TEST DEFILLAMA DIRECTLY
// ============================================================
async function step3_testDefiLlamaDirect() {
  logHeader('STEP 3 — TEST DEFILLAMA DIRECTLY (Helium)');

  // 1) Search registry for Helium (best-effort, no slug for non-TVL projects)
  const registryUrl = 'https://coins.llama.fi/prices';
  console.log(`Request URL: ${registryUrl}?search=hNT,helium`);
  const regRes = await httpGet(registryUrl, { Accept: 'application/json' });
  console.log(`HTTP Status: ${regRes.status}`);

  // DefiLlama doesn't expose a "search by name" endpoint. Use a known heuristic:
  // Many DePIN projects (incl. Helium) are not in defillama TVL list. We try
  // the common public slug anyway, then print the result.

  const candidates = [
    'https://api.llama.fi/protocol/helium',
    'https://api.llama.fi/protocol/helium-network',
  ];
  let foundMatch = null;
  for (const c of candidates) {
    const r = await httpGet(c, { Accept: 'application/json' });
    console.log(`Probe ${c}  ->  HTTP ${r.status}`);
    if (r.status === 200 && r.json && r.json.id) {
      foundMatch = { url: c, body: r.json };
      break;
    }
  }
  if (foundMatch) {
    console.log('\nMatched DefiLlama protocol:');
    console.log('  name        :', foundMatch.body.name);
    console.log('  slug        :', foundMatch.body.slug);
    console.log('  category    :', foundMatch.body.category);
    console.log('  chain       :', foundMatch.body.chain);
    console.log('  tvl         :', foundMatch.body.tvl);
  } else {
    console.log('\nNo matching DefiLlama protocol found for Helium (expected — Helium is a wireless DePIN, not in TVL list).');
  }

  // 2) Probe coins endpoint for HNT price (the only reliable DefiLlama feed for Helium)
  const coinsUrl = 'https://coins.llama.fi/prices/current/coingecko:helium?searchWidth=600';
  const cRes = await httpGet(coinsUrl, { Accept: 'application/json' });
  console.log(`\nCoins API: ${coinsUrl}  ->  HTTP ${cRes.status}`);
  if (cRes.status === 200 && cRes.json && cRes.json.coins) {
    const hnt = cRes.json.coins['coingecko:helium'];
    if (hnt) {
      console.log('  HNT price (defillama):', hnt.price);
      console.log('  confidence           :', hnt.confidence);
      console.log('  symbol               :', hnt.symbol);
    } else {
      console.log('  HNT not in coins response — try alternate id…');
    }
  }

  return { ok: true, match: foundMatch };
}

// ============================================================
// STEP 4 — TEST GITHUB DIRECTLY
// ============================================================
async function step4_testGitHubDirect() {
  logHeader('STEP 4 — TEST GITHUB DIRECTLY (Helium org)');

  const orgUrl = `https://api.github.com/orgs/${HELIUM_GH}/repos?per_page=100&sort=updated`;
  console.log(`Request URL: ${orgUrl}`);
  const orgRes = await httpGet(orgUrl, { Accept: 'application/vnd.github+json' });
  console.log(`HTTP Status: ${orgRes.status}`);
  console.log(`Rate Remaining: ${orgRes.headers['x-ratelimit-remaining'] || 'n/a'}`);

  if (orgRes.status !== 200 || !Array.isArray(orgRes.json)) {
    console.log('RAW (truncated):', orgRes.raw);
    return { ok: false, reason: 'gh_list_failed' };
  }

  // Pick the canonical repos PAYD considers relevant
  const relevant = orgRes.json.filter(r => {
    const n = (r.name || '').toLowerCase();
    return (
      n === 'helium-program-library' ||
      n === 'helium-js'              ||
      n === 'helium-wallet-rs'        ||
      n === 'helium-blockchain-node'  ||
      n === 'helium-anchor'           ||
      n === 'hotspot-app'             ||
      n === 'helium-api'              ||
      n === 'helium-vote-service'     ||
      n === 'mobile-wallet'           ||
      n === 'helium-crypto'           ||
      n === 'helium-txs'              ||
      n === 'helium-claim-service'
    );
  });

  console.log(`\nRepositories in '${HELIUM_GH}' org: ${orgRes.json.length}`);
  console.log(`Relevant (PAYD-tracked) repos:     ${relevant.length}`);

  // Aggregate activity across relevant repos
  const aggregate = {
    stars: 0, forks: 0, open_issues: 0, watchers: 0, language_set: new Set(),
  };
  const perRepo = [];

  for (const r of relevant) {
    aggregate.stars       += (r.stargazers_count || 0);
    aggregate.forks       += (r.forks_count || 0);
    aggregate.open_issues += (r.open_issues_count || 0);
    aggregate.watchers    += (r.subscribers_count || 0);
    if (r.language) aggregate.language_set.add(r.language);
    perRepo.push({
      name: r.name,
      stars: r.stargazers_count,
      forks: r.forks_count,
      open_issues: r.open_issues_count,
      updated_at: r.updated_at,
      default_branch: r.default_branch,
    });
  }

  console.log('\n--- Per-repo stats (relevant) ---');
  for (const p of perRepo) {
    console.log(`  ${p.name.padEnd(30)}  stars=${p.stars}  forks=${p.forks}  open_issues=${p.open_issues}  updated=${p.updated_at}`);
  }

  console.log('\n--- Aggregate across relevant repos ---');
  console.log(`  stars:        ${aggregate.stars}`);
  console.log(`  forks:        ${aggregate.forks}`);
  console.log(`  open_issues:  ${aggregate.open_issues}`);
  console.log(`  watchers:     ${aggregate.watchers}`);
  console.log(`  languages:    ${[...aggregate.language_set].join(', ')}`);

  return { ok: true, aggregate, perRepo };
}

// ============================================================
// STEP 5 — TRACE FIELD TRANSFORMATION (the heart of the bug hunt)
// ============================================================
function step5_traceFields(cg, gh) {
  logHeader('STEP 5 — TRACE FIELD TRANSFORMATION (CoinGecko -> Saved JSON -> Frontend)');

  const heliumProfilePath = path.join(ROOT, 'public/data/intelligence/projects/helium.json');
  const profile = safeReadJSON(heliumProfilePath);

  if (!profile || profile.__error) {
    console.log('Cannot trace — helium.json missing or invalid:', profile?.__error);
    return [];
  }

  // Each row = a single field
  // canonical_path = path within the saved profile
  // cg_path        = path within raw CoinGecko response
  const fields = [
    { label: 'Market Cap (USD)',         canonical: 'metrics.market_cap_usd',  cg: 'market_cap' },
    { label: 'Fully Diluted Valuation',  canonical: 'metrics.fdv_usd',         cg: 'fully_diluted_valuation' },
    { label: 'Circulating Supply',       canonical: 'metrics.circulating_supply', cg: 'circulating_supply' },
    { label: 'Total Supply',             canonical: 'metrics.total_supply',    cg: 'total_supply' },
    { label: 'Max Supply',               canonical: 'metrics.max_supply',      cg: 'max_supply' },
    { label: '24h Volume',               canonical: 'metrics.volume_24h_usd',  cg: 'total_volume' },
    { label: 'Market Cap Rank',          canonical: 'metrics.market_cap_rank', cg: 'market_cap_rank' },
    { label: 'ATH',                      canonical: 'metrics.ath_usd',         cg: 'ath' },
    { label: 'ATH Change %',             canonical: 'metrics.ath_change_pct',  cg: 'ath_change_percentage' },
    { label: '7d Change %',              canonical: 'metrics.change_7d_pct',   cg: 'price_change_7d' },
    { label: '30d Change %',             canonical: 'metrics.change_30d_pct',  cg: 'price_change_30d' },
    { label: '24h Change %',             canonical: 'metrics.change_24h_pct',  cg: 'price_change_24h' },
    { label: 'Current Price',            canonical: 'metrics.price_usd',       cg: 'price' },
  ];

  // For each field, look up the saved value using multiple candidate paths
  // to detect schema-mismatch bugs
  const altPaths = {
    'Market Cap (USD)':        ['metrics.market_cap_usd', 'metrics.market_cap', 'market_cap', 'marketCap'],
    'Fully Diluted Valuation': ['metrics.fdv_usd', 'metrics.fdv', 'fdv', 'fully_diluted_valuation'],
    'Circulating Supply':      ['metrics.circulating_supply', 'circulating_supply', 'circulatingSupply'],
    'Total Supply':            ['metrics.total_supply', 'total_supply', 'totalSupply'],
    'Max Supply':              ['metrics.max_supply', 'max_supply', 'maxSupply'],
    '24h Volume':              ['metrics.volume_24h_usd', 'metrics.volume_24h', 'volume_24h', 'total_volume'],
    'Market Cap Rank':         ['metrics.market_cap_rank', 'market_cap_rank', 'marketCapRank'],
    'ATH':                     ['metrics.ath_usd', 'metrics.ath', 'ath'],
    'ATH Change %':            ['metrics.ath_change_pct', 'metrics.ath_change_percentage', 'ath_change_percentage'],
    '7d Change %':             ['metrics.change_7d_pct', 'metrics.price_change_7d', 'price_change_7d'],
    '30d Change %':            ['metrics.change_30d_pct', 'metrics.price_change_30d', 'price_change_30d'],
    '24h Change %':            ['metrics.change_24h_pct', 'metrics.price_change_24h', 'price_change_24h'],
    'Current Price':           ['metrics.price_usd', 'metrics.price', 'price'],
  };

  // If CG returned data, map raw values
  const rawVals = {};
  if (cg && cg.ok) {
    for (const f of fields) {
      rawVals[f.label] = cg.tracked[f.cg];
    }
  }

  console.log('\n--- Field-level trace (CoinGecko -> Saved JSON) ---');
  console.log('| FIELD                       | RAW CG                       | SAVED (canonical)             | SAVED (any alt)              |');
  console.log('|-----------------------------|------------------------------|-------------------------------|------------------------------|');

  const rows = [];
  for (const f of fields) {
    const raw = rawVals[f.label];
    const canonicalVal = deepGet(profile, f.canonical);
    const altVals = altPaths[f.label] || [];
    let altVal = undefined;
    for (const p of altVals) {
      const v = deepGet(profile, p);
      if (v !== undefined && v !== null) { altVal = v; break; }
    }
    const fmt = (v) => {
      if (v === undefined) return '<absent>';
      if (v === null)      return '<null>';
      if (typeof v === 'object' && v.value !== undefined) return JSON.stringify(v.value);
      return JSON.stringify(v);
    };
    console.log(`| ${f.label.padEnd(27)} | ${fmt(raw).padEnd(28)} | ${fmt(canonicalVal).padEnd(29)} | ${fmt(altVal).padEnd(28)} |`);

    rows.push({
      field: f.label,
      raw_provider: raw ?? null,
      saved_canonical: canonicalVal ?? null,
      saved_any: altVal ?? null,
    });
  }

  // GitHub-related rows
  console.log('\n--- GitHub aggregate (org -> Saved JSON) ---');
  console.log('| FIELD                       | RAW GH                       | SAVED (canonical)             | SAVED (any alt)              |');
  console.log('|-----------------------------|------------------------------|-------------------------------|------------------------------|');

  const ghFields = [
    { label: 'GitHub stars (sum)',     canonical: 'developer.github_stars_total',     alts: ['github.stars_total', 'metrics.github_stars', 'developer.stars'] },
    { label: 'GitHub forks (sum)',     canonical: 'developer.github_forks_total',     alts: ['github.forks_total', 'metrics.github_forks', 'developer.forks'] },
    { label: 'GitHub repos (count)',   canonical: 'developer.github_repo_count',      alts: ['github.repos_count', 'metrics.github_repo_count', 'developer.repos'] },
    { label: 'Open issues (sum)',      canonical: 'developer.github_open_issues',     alts: ['github.open_issues', 'metrics.github_open_issues', 'developer.open_issues'] },
    { label: 'Last commit (recent)',   canonical: 'developer.github_last_commit',     alts: ['github.last_commit', 'developer.last_commit_date'] },
  ];

  const ghRaw = {};
  if (gh && gh.ok) {
    ghRaw['GitHub stars (sum)']   = gh.aggregate.stars;
    ghRaw['GitHub forks (sum)']   = gh.aggregate.forks;
    ghRaw['GitHub repos (count)'] = gh.perRepo.length;
    ghRaw['Open issues (sum)']    = gh.aggregate.open_issues;
    ghRaw['Last commit (recent)'] = gh.perRepo[0]?.updated_at || null;
  }

  for (const f of ghFields) {
    const raw = ghRaw[f.label];
    const canonicalVal = deepGet(profile, f.canonical);
    let altVal = undefined;
    for (const p of f.alts) {
      const v = deepGet(profile, p);
      if (v !== undefined && v !== null) { altVal = v; break; }
    }
    const fmt = (v) => {
      if (v === undefined) return '<absent>';
      if (v === null)      return '<null>';
      if (typeof v === 'object' && v.value !== undefined) return JSON.stringify(v.value);
      return JSON.stringify(v);
    };
    console.log(`| ${f.label.padEnd(27)} | ${fmt(raw).padEnd(28)} | ${fmt(canonicalVal).padEnd(29)} | ${fmt(altVal).padEnd(28)} |`);

    rows.push({
      field: f.label,
      raw_provider: raw ?? null,
      saved_canonical: canonicalVal ?? null,
      saved_any: altVal ?? null,
    });
  }

  return rows;
}

// ============================================================
// MAIN
// ============================================================
(async () => {
  console.log('PAYD HELIUM END-TO-END TRACE');
  console.log('===========================');
  console.log(`Run time: ${new Date().toISOString()}`);

  await step1_locateRecords();
  const cg = await step2_testCoinGeckoDirect();
  await step3_testDefiLlamaDirect();
  const gh = await step4_testGitHubDirect();
  const rows = step5_traceFields(cg, gh);

  // Persist results
  const outDir = path.join(ROOT, 'docs');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'helium-trace-step2-step5.json');
  fs.writeFileSync(outFile, JSON.stringify({ generated_at: new Date().toISOString(), rows }, null, 2));
  console.log(`\nTrace results written to: ${outFile}`);
})().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
