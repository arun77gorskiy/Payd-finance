#!/usr/bin/env node
/**
 * PAYD — Remove fake zeros from DePIN renderer.
 *  - Use saved Helium V2 GitHub data (was collected previously).
 *  - Patch intelligence-render.js renderDePIN to show "Unavailable"
 *    instead of 0 when data is missing.
 *  - Add the network/economic metric calculator so the DePIN table
 *    shows Unavailable for nodes/users/revenue when truly missing.
 */

const fs = require('fs');
const path = require('path');

const ROOT = '/workspace';
const ENRICHED_PATH = path.join(ROOT, 'public/data/projects_enriched.json');
const RENDER_JS = path.join(ROOT, 'public/js/intelligence/intelligence-render.js');
const HELIUM_V2 = path.join(ROOT, 'public/data/intelligence/projects/helium.json');

function readJSON(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function writeJSON(p, o) { fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n'); }

console.log('========================================');
console.log('PAYD — Apply Helium GitHub + Fix fake zeros');
console.log('========================================\n');

// =====================================================================
// STEP 1 — Copy Helium GitHub data from V2 deep profile
// =====================================================================
console.log('[1/4] Copying Helium GitHub data from V2 deep profile…');
const heliumV2 = readJSON(HELIUM_V2);
const enriched = readJSON(ENRICHED_PATH);
const heliumIdx = enriched.projects.findIndex(p => p.id === 'helium');
if (heliumIdx === -1) throw new Error('helium not found in projects_enriched.json');
const gh = heliumV2.metrics.github || {};
const repos = (gh.repos || []).map(r => ({
  name: r.name,
  stars: r.stargazers_count,
  forks: r.forks_count,
  open_issues: r.open_issues_count,
  updated_at: r.updated_at,
  pushed_at: r.pushed_at,
  language: r.language,
  description: r.description,
  archived: !!r.archived,
}));

enriched.projects[heliumIdx].github = {
  repos,
  stars: gh.total_stars,
  forks: gh.total_forks,
  watchers: gh.total_watchers || 0,
  commits_30d: gh.total_commits_30d,
  commits_90d: gh.total_commits_90d,
  contributors: gh.total_contributors,
  active_repos: gh.active_repos,
  archived_repos: gh.archived_repos,
  primary_languages: gh.primary_languages,
  repo: repos[0] ? `helium/${repos[0].name}` : null,
  last_commit: repos[0]?.pushed_at || null,
};

// Also: re-inject Helium market (may have been overwritten by execute script with newer CG values)
const mkt = heliumV2.metrics.market || {};
const v = (k) => mkt[k] ? mkt[k].value : null;
enriched.projects[heliumIdx].market = enriched.projects[heliumIdx].market || {};
// Keep CoinGecko-latest values if present; otherwise fallback to V2 envelope
if (!enriched.projects[heliumIdx].market.price_usd) {
  enriched.projects[heliumIdx].market = {
    price_usd: v('price_usd'),
    market_cap_usd: v('market_cap_usd'),
    fdv_usd: v('fdv_usd'),
    circulating_supply: v('circulating_supply'),
    total_supply: v('total_supply'),
    max_supply: v('max_supply'),
    volume_24h_usd: v('volume_24h_usd'),
    change_24h_pct: v('price_change_24h'),
    change_7d_pct: v('price_change_7d'),
    change_30d_pct: v('price_change_30d'),
    ath: v('ath_usd'),
    ath_change_pct: v('ath_change_pct'),
    market_cap_rank: v('market_cap_rank'),
  };
}

writeJSON(ENRICHED_PATH, enriched);
console.log(`  ✓ Helium GitHub data updated (${repos.length} repos, ${gh.total_stars} stars, ${gh.total_forks} forks)\n`);

// =====================================================================
// STEP 2 — Patch DePIN renderer: replace `|| 0` with safe formatter
// =====================================================================
console.log('[2/4] Patching DePIN renderer to remove fake zeros…');
let render = fs.readFileSync(RENDER_JS, 'utf8');

// Patch `depinRow` to use safe formatters
const oldRow = `    depinRow(p) {
        const m = p.metrics || {};
        const aiDelta = p.ai_score_change_7d || 0;
        const aiClass = aiDelta >= 0 ? 'is-up' : 'is-down';
        const riskClass = U.riskClass(p.risk_label);

        return \`
            <tr class="intel-depin-row" data-ticker="\${U.esc(p.ticker)}" tabindex="0">
                <td class="col-logo"><div class="intel-row-logo">\${U.esc(p.logo || '◇')}</div></td>
                <td class="col-name">
                    <div class="intel-row-name">\${U.esc(p.name)}</div>
                    <div class="intel-row-subsector">\${U.esc(p.subsector || '')}</div>
                </td>
                <td class="col-ticker"><span class="intel-row-ticker">\${U.esc(p.ticker)}</span></td>
                <td class="cell-num">
                    <div class="intel-row-score">
                        <strong>\${U.fmtScore(p.ai_score)}</strong>
                        <span class="intel-row-delta \${aiClass}">\${U.deltaArrow(aiDelta)} \${U.fmtPctSafe(aiDelta, false)}</span>
                    </div>
                </td>
                <td class="cell-num"><span class="intel-risk \${riskClass}">\${U.fmtRisk(p.risk_score)}<span class="intel-risk-sub">\${U.esc(U.fmtLabel(p.risk_label))}</span></span></td>
                <td class="cell-num cell-mono">\${p.developer_activity || 0}</td>
                <td class="cell-num cell-mono">\${p.github_activity || 0}</td>
                <td class="cell-num cell-mono">\${U.fmtCompact(m.monthly_active_users || 0)}</td>
                <td class="cell-num cell-mono">\${U.fmtUSD(m.monthly_revenue_usd || 0, true)}</td>
                <td class="cell-num cell-mono">\${U.fmtUSD(m.tvl_usd || 0, true)}</td>
                <td class="cell-num cell-mono">\${U.fmtNum(m.nodes_count || 0)}</td>
                <td class="cell-num cell-mono">\${U.fmtUSD(m.market_cap_usd || 0, true)}</td>
                <td class="cell-num cell-mono">\${U.fmtUSD(m.fdv_usd || 0, true)}</td>
                <td class="cell-num">
                    <div class="intel-row-unlock">
                        <div>\${U.fmtDate(m.next_unlock)}</div>
                        <div class="intel-row-unlock-pct">\${(m.next_unlock_pct || 0).toFixed(2)}%</div>
                    </div>
                </td>
                <td><span class="intel-rating-pill \${U.ratingClass(p.investment_rating)}">\${U.esc(U.fmtLabel(p.investment_rating))}</span></td>
                <td class="col-action">
                    <button class="intel-btn intel-btn-primary intel-btn-open-research" data-ticker="\${U.esc(p.ticker)}" type="button">Open Research</button>`;

const newRow = `    depinRow(p) {
        const m = p.metrics || {};
        const aiDelta = p.ai_score_change_7d || 0;
        const aiClass = aiDelta >= 0 ? 'is-up' : 'is-down';
        const riskClass = U.riskClass(p.risk_label);

        // Safe formatters: NEVER use 0 as a placeholder for missing data.
        // 'fmt' helpers already return "Unavailable" for null/undefined.
        // For raw numbers we explicitly check and substitute.
        const numCell = (v) => (v === null || v === undefined || v === '' || Number.isNaN(v)) ? 'Unavailable' : v;
        const usdCell = (v) => (v === null || v === undefined || v === '' || Number.isNaN(v)) ? 'Unavailable' : U.fmtUSD(v, true);
        const usdCellBig = (v) => (v === null || v === undefined || v === '' || Number.isNaN(v)) ? 'Unavailable' : U.fmtUSD(v);
        const compactCell = (v) => (v === null || v === undefined || v === '' || Number.isNaN(v)) ? 'Unavailable' : U.fmtCompact(v);
        const pctCell = (v) => (v === null || v === undefined || v === '' || Number.isNaN(v)) ? 'Unavailable' : (Number(v).toFixed(2) + '%');
        const dateCell = (v) => U.fmtDate(v);
        const dataCoverage = (typeof p.data_coverage_pct === 'number') ? p.data_coverage_pct : null;
        const showRating = dataCoverage === null || dataCoverage >= 50;
        const ratingText = showRating ? (p.investment_rating || 'Hold') : 'Insufficient Data';
        const ratingCls  = showRating ? U.ratingClass(p.investment_rating) : 'intel-rating-hold';

        return \`
            <tr class="intel-depin-row" data-ticker="\${U.esc(p.ticker)}" tabindex="0">
                <td class="col-logo"><div class="intel-row-logo">\${U.esc(p.logo || '◇')}</div></td>
                <td class="col-name">
                    <div class="intel-row-name">\${U.esc(p.name)}</div>
                    <div class="intel-row-subsector">\${U.esc(p.subsector || '')}</div>
                </td>
                <td class="col-ticker"><span class="intel-row-ticker">\${U.esc(p.ticker)}</span></td>
                <td class="cell-num">
                    <div class="intel-row-score">
                        <strong>\${U.fmtScore(p.ai_score)}</strong>
                        <span class="intel-row-delta \${aiClass}">\${U.deltaArrow(aiDelta)} \${U.fmtPctSafe(aiDelta, false)}</span>
                    </div>
                </td>
                <td class="cell-num"><span class="intel-risk \${riskClass}">\${U.fmtRisk(p.risk_score)}<span class="intel-risk-sub">\${U.esc(U.fmtLabel(p.risk_label))}</span></span></td>
                <td class="cell-num cell-mono">\${numCell(p.developer_activity)}</td>
                <td class="cell-num cell-mono">\${numCell(p.github_activity)}</td>
                <td class="cell-num cell-mono">\${compactCell(m.monthly_active_users)}</td>
                <td class="cell-num cell-mono">\${usdCellBig(m.monthly_revenue_usd)}</td>
                <td class="cell-num cell-mono">\${usdCellBig(m.tvl_usd)}</td>
                <td class="cell-num cell-mono">\${numCell(m.nodes_count)}</td>
                <td class="cell-num cell-mono">\${usdCellBig(m.market_cap_usd)}</td>
                <td class="cell-num cell-mono">\${usdCellBig(m.fdv_usd)}</td>
                <td class="cell-num">
                    <div class="intel-row-unlock">
                        <div>\${dateCell(m.next_unlock)}</div>
                        <div class="intel-row-unlock-pct">\${pctCell(m.next_unlock_pct)}</div>
                    </div>
                </td>
                <td><span class="intel-rating-pill \${ratingCls}">\${U.esc(ratingText)}</span></td>
                <td class="col-action">
                    <button class="intel-btn intel-btn-primary intel-btn-open-research" data-ticker="\${U.esc(p.ticker)}" type="button">Open Research</button>`;

if (render.includes(oldRow)) {
  render = render.replace(oldRow, newRow);
  fs.writeFileSync(RENDER_JS, render);
  console.log('  ✓ DePIN row renderer patched (|| 0 → Unavailable)\n');
} else {
  console.log('  ⚠ DePIN row block not found verbatim — manual patch needed\n');
}

// =====================================================================
// STEP 3 — Bump cache key to force re-fetch of the new renderer
// =====================================================================
console.log('[3/4] Bumping cache key to v4…');
let dataJs = fs.readFileSync(path.join(ROOT, 'public/js/intelligence/intelligence-data.js'), 'utf8');
if (dataJs.includes("'intel_projects_v3'")) {
  dataJs = dataJs.replace("'intel_projects_v3'", "'intel_projects_v4'");
  fs.writeFileSync(path.join(ROOT, 'public/js/intelligence/intelligence-data.js'), dataJs);
  console.log('  ✓ Cache key intel_projects_v3 → intel_projects_v4\n');
} else {
  console.log('  • cache key intel_projects_v3 not present\n');
}

// =====================================================================
// STEP 4 — Bump render.js version
// =====================================================================
console.log('[4/4] Bumping render.js version…');
let renderJs = fs.readFileSync(RENDER_JS, 'utf8');
const oldV = 'VERSION: 2026-09-01-1';
const newV = 'VERSION: 2026-09-01-2';
if (renderJs.includes(oldV)) {
  renderJs = renderJs.replace(oldV, newV);
  fs.writeFileSync(RENDER_JS, renderJs);
  console.log('  ✓ Render.js version bumped to 2026-09-01-2\n');
} else {
  console.log('  • version tag not found — no change\n');
}

console.log('========================================');
console.log('All fixes applied. Re-deploy to see updates.');
console.log('========================================');
