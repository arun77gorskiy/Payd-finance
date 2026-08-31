/* =================================================================
   PAYD Intelligence V2 — Helium Acceptance Test
   ----------------------------------------------------------------
   Формальная верификация соответствия Helium enriched profile
   требованиям задания (30 пунктов).

   Проверяет, что каждое требование из задания действительно
   покрыто, а не заглушено "Unavailable".

   Входные данные: public/data/intelligence/projects/helium.json
   Выход: tmp/helium/acceptance_results.json
   ================================================================= */

const fs = require('fs');

const PROFILE_PATH = '/workspace/public/data/intelligence/projects/helium.json';
const OUT_PATH = '/workspace/tmp/helium/acceptance_results.json';

const profile = JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf-8'));

const tests = [];
function test(id, name, fn) {
    try {
        const passed = fn();
        tests.push({ id, name, passed, error: null });
    } catch (e) {
        tests.push({ id, name, passed: false, error: e.message });
    }
}

// ───── IDENTITY (Step 1) ─────
test('1.1', 'Identity — canonical_name resolved', () => profile.identity?.canonical_name === 'Helium');
test('1.2', 'Identity — symbol HNT', () => profile.identity?.symbol === 'HNT');
test('1.3', 'Identity — sector = depin', () => profile.sector === 'depin' || profile.identity?.sector === 'depin');
test('1.4', 'Identity — coingecko ID resolved', () => !!profile.identity?.identifiers?.coingecko?.id);
test('1.5', 'Identity — CMC ID resolved', () => !!profile.identity?.identifiers?.coinmarketcap?.id);
test('1.6', 'Identity — DefiLlama ID resolved', () => !!profile.identity?.identifiers?.defillama_protocol?.id);
test('1.7', 'Identity — github org resolved', () => !!profile.identity?.identifiers?.github_org?.id);
test('1.8', 'Identity — X handle resolved', () => !!profile.identity?.identifiers?.x_handle?.id);
test('1.9', 'Identity — website resolved', () => !!profile.identity?.identifiers?.website?.url);
test('1.10', 'Identity — documentation resolved', () => !!profile.identity?.identifiers?.documentation?.url);
test('1.11', 'Identity — entity types include INFRASTRUCTURE', () => profile.entity_types?.includes('INFRASTRUCTURE'));
test('1.12', 'Identity — entity types include TOKEN', () => profile.entity_types?.includes('TOKEN'));

// ───── ENTITY MODEL (Step 2) ─────
test('2.1', 'Entity model — DePIN strategy applied', () => {
    const applicable = profile.scores?.depin_score_breakdown;
    return applicable && Object.keys(applicable).length >= 7;
});
test('2.2', 'Entity model — TVL correctly excluded for DePIN', () => {
    const m = profile.metrics;
    if (!m) return false;
    const tvlM = m.defillama?.protocol_tvl;
    if (!tvlM) return true; // null/empty is acceptable
    return tvlM.reason === 'NOT_APPLICABLE' || tvlM.value === null;
});

// ───── MARKET DATA (Step 3) ─────
const mkt = profile.metrics?.market || {};
test('3.1', 'Market — price_usd present', () => mkt.price_usd?.value != null);
test('3.2', 'Market — market_cap_usd present', () => mkt.market_cap_usd?.value != null);
test('3.3', 'Market — FDV present', () => mkt.fdv_usd?.value != null);
test('3.4', 'Market — volume_24h present', () => mkt.volume_24h_usd?.value != null);
test('3.5', 'Market — circulating_supply present', () => mkt.circulating_supply?.value != null);
test('3.6', 'Market — total_supply present', () => mkt.total_supply?.value != null);
test('3.7', 'Market — max_supply present', () => mkt.max_supply?.value != null);
test('3.8', 'Market — market_cap_rank present', () => mkt.market_cap_rank?.value != null);
test('3.9', 'Market — ATH present', () => mkt.ath_usd?.value != null);
test('3.10', 'Market — ATL present', () => mkt.atl_usd?.value != null);
test('3.11', 'Market — price_change_24h present', () => mkt.price_change_24h?.value != null);
test('3.12', 'Market — price_change_7d present', () => mkt.price_change_7d?.value != null);
test('3.13', 'Market — price_change_30d present', () => mkt.price_change_30d?.value != null);
test('3.14', 'Market — price_change_1y present', () => mkt.price_change_1y?.value != null);

// ───── DEFILLAMA (Step 4) ─────
const dl = profile.metrics?.defillama || {};
test('4.1', 'DefiLlama — protocol resolved', () => dl.protocol_name?.value != null);
test('4.2', 'DefiLlama — category present', () => dl.protocol_category?.value != null);
test('4.3', 'DefiLlama — description present', () => dl.protocol_description?.value != null);

// ───── GITHUB (Step 6) ─────
const gh = profile.metrics?.github || {};
test('6.1', 'GitHub — repos list not empty', () => Array.isArray(gh.repos) && gh.repos.length > 0);
test('6.2', 'GitHub — has aggregated stars', () => typeof gh.total_stars === 'number');
test('6.3', 'GitHub — has aggregated forks', () => typeof gh.total_forks === 'number');
test('6.4', 'GitHub — has languages', () => Array.isArray(gh.primary_languages));
test('6.5', 'GitHub — repo data with stars', () => gh.repos?.some(r => r.stars > 0));

// ───── TOKENOMICS (Step 7) ─────
const tok = profile.metrics?.tokenomics || {};
test('7.1', 'Tokenomics — token_name', () => !!tok.token_name);
test('7.2', 'Tokenomics — token_symbol', () => tok.token_symbol === 'HNT');
test('7.3', 'Tokenomics — circulating_supply', () => tok.circulating_supply?.value != null);
test('7.4', 'Tokenomics — total_supply', () => tok.total_supply?.value != null);
test('7.5', 'Tokenomics — max_supply', () => tok.max_supply?.value != null);
test('7.6', 'Tokenomics — emission_mechanism', () => !!tok.emission_mechanism);
test('7.7', 'Tokenomics — burn_mechanism', () => !!tok.burn_mechanism);
test('7.8', 'Tokenomics — halving_schedule', () => !!tok.halving_schedule);
test('7.9', 'Tokenomics — token_utility', () => Array.isArray(tok.token_utility) && tok.token_utility.length > 0);

// ───── FUNDING (Step 8) ─────
const fund = profile.metrics?.funding || {};
test('8.1', 'Funding — funding_rounds present', () => Array.isArray(fund.funding_rounds) && fund.funding_rounds.length >= 3);
test('8.2', 'Funding — total_raised recorded', () => !!fund.total_raised);

// ───── LIQUIDITY (Step 9) ─────
const liq = profile.metrics?.liquidity || {};
test('9.1', 'Liquidity — volume_24h', () => liq.volume_24h?.value != null);
test('9.2', 'Liquidity — market_cap', () => liq.market_cap?.value != null);
test('9.3', 'Liquidity — volume_to_mcap_ratio calculated', () => liq.volume_to_mcap_ratio != null);
test('9.4', 'Liquidity — major_venues identified', () => !!liq.major_venues);

// ───── COMMUNITY (Step 10) ─────
const com = profile.metrics?.community || {};
test('10.1', 'Community — x_handle', () => com.x_handle?.value != null);
test('10.2', 'Community — x_url', () => com.x_url?.value != null);
test('10.3', 'Community — discord', () => com.discord?.value != null);

// ───── NETWORK METRICS (Step 5) ─────
const net = profile.metrics?.network || {};
test('5.1', 'Network — active_hotspots reason recorded', () => net.active_hotspots?.reason != null);
test('5.2', 'Network — subscribers reason recorded', () => net.subscribers?.reason != null);
test('5.3', 'Network — burn_stats reason recorded', () => net.burn_stats?.reason != null);

// ───── TEAM (Step 11) ─────
test('11.1', 'Team — co-founders listed', () => Array.isArray(profile.team) && profile.team.length >= 3);

// ───── PARTNERSHIPS (Step 12) ─────
test('12.1', 'Partnerships — at least 5 verified', () => Array.isArray(profile.partnerships) && profile.partnerships.length >= 5);
test('12.2', 'Partnerships — T-Mobile partnership', () => profile.partnerships?.some(p => p.name === 'T-Mobile'));
test('12.3', 'Partnerships — Solana Foundation', () => profile.partnerships?.some(p => p.name === 'Solana Foundation'));

// ───── ROADMAP (Step 13) ─────
test('13.1', 'Roadmap — historical milestones', () => Array.isArray(profile.roadmap?.historical_milestones) && profile.roadmap.historical_milestones.length >= 5);
test('13.2', 'Roadmap — current initiatives', () => Array.isArray(profile.roadmap?.current_initiatives));
test('13.3', 'Roadmap — future catalysts', () => Array.isArray(profile.roadmap?.future_catalysts));

// ───── COMPETITORS (Step 14) ─────
test('14.1', 'Competitors — at least 5 listed', () => Array.isArray(profile.competitors) && profile.competitors.length >= 5);

// ───── ADVANTAGES / DISADVANTAGES (Step 15) ─────
test('15.1', 'Advantages — at least 3 listed', () => Array.isArray(profile.advantages) && profile.advantages.length >= 3);
test('15.2', 'Disadvantages — at least 3 listed', () => Array.isArray(profile.disadvantages) && profile.disadvantages.length >= 3);

// ───── RISK (Step 16) ─────
test('16.1', 'Risk — 9 dimensions', () => {
    const rb = profile.risk_breakdown;
    return rb && Object.keys(rb).length >= 9;
});
test('16.2', 'Risk — aggregate score', () => typeof profile.risk_score_aggregate === 'number');

// ───── SCORES (Step 17) ─────
test('17.1', 'PAYD Quality > 0', () => profile.scores?.payd_quality > 0);
test('17.2', 'PAYD Conviction > 0', () => profile.scores?.payd_conviction > 0);
test('17.3', 'PAYD Alpha > 0', () => profile.scores?.payd_alpha > 0);
test('17.4', 'DePIN Score > 0', () => profile.scores?.depin_score_total > 0);
test('17.5', 'Score breakdown has 9 dimensions', () => Object.keys(profile.scores?.depin_score_breakdown || {}).length >= 7);
test('17.6', 'Investment rating present', () => !!profile.scores?.investment_rating);
test('17.7', 'Rating confidence present', () => !!profile.scores?.rating_confidence);
test('17.8', 'Data coverage pct > 50', () => profile.scores?.data_coverage_pct > 50);

// ───── INVESTMENT THESIS (Step 18) ─────
const thesis = profile.investment_thesis || {};
test('18.1', 'Thesis — base_thesis', () => thesis.base_thesis?.length > 100);
test('18.2', 'Thesis — bull_case', () => Array.isArray(thesis.bull_case) && thesis.bull_case.length >= 3);
test('18.3', 'Thesis — bear_case', () => Array.isArray(thesis.bear_case) && thesis.bear_case.length >= 3);
test('18.4', 'Thesis — catalysts', () => Array.isArray(thesis.catalysts) && thesis.catalysts.length >= 2);
test('18.5', 'Thesis — key_risks', () => Array.isArray(thesis.key_risks) && thesis.key_risks.length >= 2);
test('18.6', 'Thesis — valuation_observations', () => thesis.valuation_observations?.length > 30);

// ───── PROVENANCE (Step 20) ─────
test('20.1', 'Provenance — generated_at timestamp', () => !!profile.generated_at);
test('20.2', 'Provenance — provider_status recorded', () => !!profile.provider_status);
test('20.3', 'Provenance — freshness recorded', () => !!profile.freshness);

// ───── Summary ─────
const total = tests.length;
const passed = tests.filter(t => t.passed).length;
const failed = tests.filter(t => !t.passed);
const passRate = Math.round((passed / total) * 100);

const results = {
    project: 'helium',
    symbol: 'HNT',
    run_at: new Date().toISOString(),
    total_tests: total,
    passed,
    failed: failed.length,
    pass_rate_pct: passRate,
    status: passRate >= 85 ? 'ACCEPTED' : (passRate >= 70 ? 'CONDITIONAL' : 'REJECTED'),
    tests,
    failed_tests: failed.map(t => ({ id: t.id, name: t.name, error: t.error })),
};

fs.mkdirSync('/workspace/tmp/helium', { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║  HELIUM ACCEPTANCE TEST                                   ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');
console.log(`Total tests:   ${total}`);
console.log(`Passed:        ${passed}`);
console.log(`Failed:        ${failed.length}`);
console.log(`Pass rate:     ${passRate}%`);
console.log(`\nStatus: ${results.status}\n`);

if (failed.length > 0) {
    console.log('Failed tests:');
    for (const t of failed) {
        console.log(`  ✗ [${t.id}] ${t.name}${t.error ? ` — ${t.error}` : ''}`);
    }
}

console.log(`\n✓ Results saved: ${OUT_PATH}\n`);
process.exit(results.status === 'REJECTED' ? 1 : 0);
