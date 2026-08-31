#!/usr/bin/env node
/**
 * VERIFY — Does the saved dataset actually contain the data we just wrote?
 * This is the WRITE-TEST: reopen the frontend dataset and prove the values
 * are physically present.
 */
const fs = require('fs');
const path = require('path');

const ROOT = '/workspace';
const enriched = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/data/projects_enriched.json'), 'utf8'));
const depin = enriched.projects.filter(p => p.sector === 'depin');

console.log('========================================');
console.log('FINAL VERIFICATION (reopen saved file)');
console.log('========================================\n');
console.log('Reopened', enriched.projects.length, 'projects,', depin.length, 'DePIN');
console.log('');
console.log('| #  | PROJECT                | MKT_CAP (USD)  | FDV (USD)      | VOL_24H    | GH STARS | GH REPOS |');
console.log('|----|------------------------|----------------|----------------|------------|----------|----------|');

depin
  .sort((a, b) => (b.market?.market_cap_usd || 0) - (a.market?.market_cap_usd || 0))
  .forEach((p, i) => {
    const mc = p.market?.market_cap_usd;
    const fdv = p.market?.fdv_usd;
    const vol = p.market?.volume_24h_usd;
    const stars = p.github?.stars;
    const repos = p.github?.repos?.length;
    const fmt = (v) => v == null ? 'null' : (typeof v === 'number' ? v.toLocaleString() : String(v).slice(0, 10));
    const num = (i + 1).toString().padStart(2, ' ');
    console.log(`| ${num} | ${p.id.padEnd(22)} | ${String(fmt(mc)).padEnd(14)} | ${String(fmt(fdv)).padEnd(14)} | ${String(fmt(vol)).padEnd(10)} | ${String(fmt(stars)).padEnd(8)} | ${String(fmt(repos)).padEnd(8)} |`);
  });

const withMC = depin.filter(p => p.market?.market_cap_usd != null).length;
const withFDV = depin.filter(p => p.market?.fdv_usd != null).length;
const withVol = depin.filter(p => p.market?.volume_24h_usd != null).length;
const withStars = depin.filter(p => p.github?.stars != null).length;
const withRepos = depin.filter(p => p.github?.repos?.length > 0).length;

console.log('');
console.log('========================================');
console.log('SUMMARY (of 34 DePIN projects):');
console.log(`  Market Cap:  ${withMC}/34 have real values (${((withMC/34)*100).toFixed(0)}%)`);
console.log(`  FDV:         ${withFDV}/34 have real values (${((withFDV/34)*100).toFixed(0)}%)`);
console.log(`  24h Volume:  ${withVol}/34 have real values (${((withVol/34)*100).toFixed(0)}%)`);
console.log(`  GH Stars:    ${withStars}/34 have real values (${((withStars/34)*100).toFixed(0)}%)`);
console.log(`  GH Repos:    ${withRepos}/34 have real values (${((withRepos/34)*100).toFixed(0)}%)`);
console.log('========================================');

// Top 5 by Market Cap
console.log('\nTOP 5 DePIN by Market Cap:');
depin
  .filter(p => p.market?.market_cap_usd)
  .sort((a, b) => b.market.market_cap_usd - a.market.market_cap_usd)
  .slice(0, 5)
  .forEach((p, i) => {
    console.log(`  ${i+1}. ${p.name} (${p.symbol})  $${(p.market.market_cap_usd/1e6).toFixed(1)}M`);
  });

// Save report
fs.writeFileSync(path.join(ROOT, 'docs/depin-enrichment-report.json'), JSON.stringify({
  generated_at: new Date().toISOString(),
  total_depin: depin.length,
  with_market_cap: withMC,
  with_fdv: withFDV,
  with_volume: withVol,
  with_github_stars: withStars,
  with_github_repos: withRepos,
  projects: depin.map(p => ({
    id: p.id,
    symbol: p.symbol,
    market_cap: p.market?.market_cap_usd,
    fdv: p.market?.fdv_usd,
    volume_24h: p.market?.volume_24h_usd,
    github_stars: p.github?.stars,
    github_repos: p.github?.repos?.length,
    last_enriched_cg: p.lastEnriched_coingecko_at,
    last_enriched_gh: p.lastEnriched_github_at,
  })),
}, null, 2));
console.log('\nReport written to docs/depin-enrichment-report.json');
