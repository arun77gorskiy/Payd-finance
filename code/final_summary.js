/* =================================================================
   PAYD Intelligence V2 — Final Summary Report
   ----------------------------------------------------------------
   Запускается ПОСЛЕ второго прохода.
   Генерирует финальный отчёт по всем 349 проектам.
   ================================================================= */

const fs = require('fs');
const path = require('path');

const DATA_DIR = '/workspace/public/data';
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const ENRICHED_FILE = path.join(DATA_DIR, 'projects_enriched.json');
const DOCS_DIR = '/workspace/docs';
const REPORT_FILE = path.join(DOCS_DIR, 'final_summary.md');

if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });

const projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
const enriched = JSON.parse(fs.readFileSync(ENRICHED_FILE, 'utf8'));

const safeNum = v => (typeof v === 'number' && !isNaN(v) && v !== null) ? v : null;
const hasMarket = d => d?.market && safeNum(d.market.market_cap_usd) != null;
const hasFdv = d => d?.market && safeNum(d.market.fdv_usd) != null;
const hasPrice = d => d?.market && safeNum(d.market.price_usd) != null;
const hasGitHub = d => d?.github && (d.github.full_name || d.github.owner);
const hasTvl = d => d?.protocol && safeNum(d.protocol.tvl_usd) != null;
const hasDeveloper = d => d?.developer && (
    safeNum(d.developer.stars) != null ||
    safeNum(d.developer.commit_count_4_weeks) != null
);
const hasPayd = d => d?.ai && safeNum(d.ai.payd_score) != null;
const hasRisk = d => d?.ai && safeNum(d.ai.risk_score) != null;

const stats = {
    total: projects.length,
    fully: [],
    partial: [],
    failed: [],
    no_cg_id: [],
    missing_github: [],
    sectors: {}
};

for (const p of projects) {
    if (!p.coingeckoId) {
        stats.no_cg_id.push({ id: p.id, name: p.name, sector: p.sector });
        stats.failed.push({ id: p.id, name: p.name, reason: 'no_coingecko_id' });
        continue;
    }

    const d = enriched[p.id];
    if (!d) {
        stats.failed.push({ id: p.id, name: p.name, reason: 'not_processed' });
        continue;
    }

    const filled = [
        hasMarket(d), hasFdv(d), hasPrice(d),
        hasGitHub(d), hasTvl(d), hasDeveloper(d),
        hasPayd(d), hasRisk(d)
    ].filter(Boolean).length;

    const sectorKey = p.sector || 'unknown';
    stats.sectors[sectorKey] = stats.sectors[sectorKey] || { total: 0, with: { market: 0, github: 0, tvl: 0, payd: 0 } };
    stats.sectors[sectorKey].total++;
    if (hasMarket(d)) stats.sectors[sectorKey].with.market++;
    if (hasGitHub(d)) stats.sectors[sectorKey].with.github++;
    if (hasTvl(d)) stats.sectors[sectorKey].with.tvl++;
    if (hasPayd(d)) stats.sectors[sectorKey].with.payd++;

    if (filled === 8) {
        stats.fully.push({ id: p.id, name: p.name, sector: p.sector, payd: d.ai?.payd_score });
    } else {
        const missing = [];
        if (!hasMarket(d)) missing.push('market');
        if (!hasFdv(d)) missing.push('fdv');
        if (!hasPrice(d)) missing.push('price');
        if (!hasGitHub(d)) {
            missing.push('github');
            stats.missing_github.push({ id: p.id, name: p.name, sector: p.sector, repo: p.githubRepo });
        }
        if (!hasTvl(d)) missing.push('tvl');
        if (!hasDeveloper(d)) missing.push('developer');
        if (!hasPayd(d)) missing.push('payd');
        if (!hasRisk(d)) missing.push('risk');

        stats.partial.push({ id: p.id, name: p.name, sector: p.sector, filled, missing });
    }
}

const pct = (n, d) => d === 0 ? '0%' : `${(n / d * 100).toFixed(1)}%`;

let r = '';
r += '# PAYD Intelligence V2 — Final Summary Report\n\n';
r += `**Дата:** ${new Date().toISOString()}\n\n`;

r += '## Итоги\n\n';
r += `| Метрика | Кол-во | % |\n`;
r += `|---------|--------|---|\n`;
r += `| Всего проектов | ${stats.total} | 100% |\n`;
r += `| Полностью обогащено (8/8 полей) | ${stats.fully.length} | ${pct(stats.fully.length, stats.total)} |\n`;
r += `| Частично обогащено | ${stats.partial.length} | ${pct(stats.partial.length, stats.total)} |\n`;
r += `| Провалилось | ${stats.failed.length} | ${pct(stats.failed.length, stats.total)} |\n`;
r += `| Без CoinGecko ID | ${stats.no_cg_id.length} | ${pct(stats.no_cg_id.length, stats.total)} |\n`;
r += `| Без GitHub репозитория | ${stats.missing_github.length} | ${pct(stats.missing_github.length, stats.total)} |\n`;
r += `| Требуют ручного ревью | ${stats.partial.length + stats.failed.length} | ${pct(stats.partial.length + stats.failed.length, stats.total)} |\n\n`;

r += '## Полнота по секторам\n\n';
r += `| Сектор | Всего | Market | GitHub | TVL | Payd |\n`;
r += `|--------|-------|--------|--------|-----|------|\n`;
for (const [s, v] of Object.entries(stats.sectors).sort((a, b) => b[1].total - a[1].total)) {
    r += `| ${s} | ${v.total} | ${v.with.market} | ${v.with.github} | ${v.with.tvl} | ${v.with.payd} |\n`;
}
r += '\n';

r += '## Топ-20 по Payd Score\n\n';
r += `| Rank | Name | Symbol | Payd | Risk | Sector |\n`;
r += `|------|------|--------|------|------|--------|\n`;
stats.fully
    .sort((a, b) => (b.payd || 0) - (a.payd || 0))
    .slice(0, 20)
    .forEach((p, i) => {
        const d = enriched[p.id];
        r += `| ${i + 1} | ${p.name} | ${d.symbol || '-'} | ${d.ai?.payd_score} | ${d.ai?.risk_score} | ${p.sector} |\n`;
    });
r += '\n';

r += '## Провалившиеся / требующие ручного ревью\n\n';
if (stats.failed.length === 0) {
    r += '_Нет_\n\n';
} else {
    r += '| ID | Name | Reason |\n';
    r += '|----|------|--------|\n';
    for (const p of stats.failed) {
        r += `| ${p.id} | ${p.name} | ${p.reason} |\n`;
    }
    r += '\n';
}

r += '## Проекты без GitHub\n\n';
if (stats.missing_github.length === 0) {
    r += '_Нет_\n\n';
} else {
    r += `Всего: **${stats.missing_github.length}**\n\n`;
    r += '<details><summary>Показать</summary>\n\n';
    r += '| ID | Name | Sector | Specified repo |\n';
    r += '|----|------|--------|----------------|\n';
    for (const p of stats.missing_github) {
        r += `| ${p.id} | ${p.name} | ${p.sector} | ${p.repo || 'нет'} |\n`;
    }
    r += '\n</details>\n\n';
}

fs.writeFileSync(REPORT_FILE, r);
fs.writeFileSync(path.join(DATA_DIR, '_final_stats.json'), JSON.stringify(stats, null, 2));

console.log('\n=== Final Summary ===');
console.log(`Total: ${stats.total}`);
console.log(`Fully enriched: ${stats.fully.length} (${pct(stats.fully.length, stats.total)})`);
console.log(`Partial: ${stats.partial.length}`);
console.log(`Failed: ${stats.failed.length}`);
console.log(`Missing GitHub: ${stats.missing_github.length}`);
console.log(`Manual review needed: ${stats.partial.length + stats.failed.length}`);
console.log(`\nReport: ${REPORT_FILE}`);
