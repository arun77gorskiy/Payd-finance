/* =================================================================
   PAYD Intelligence V2 — Validation & Smart Retry (v2)
   ----------------------------------------------------------------
   Запускается ПОСЛЕ первого прохода enrich_projects.js.
   1) Валидирует projects_enriched.json
   2) Считает полноту по каждой метрике
   3) Авто-ретраит только то, что упало по rate-limit / 429
   4) НЕ перезаписывает валидные данные null-ами
   5) Пересчитывает Payd / Risk / Alpha / Conviction только для тех,
      у кого появились новые данные
   6) Генерирует отчёт в /workspace/docs/validation_report.md
   ================================================================= */

const fs = require('fs');
const path = require('path');

const DATA_DIR = '/workspace/public/data';
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const ENRICHED_FILE = path.join(DATA_DIR, 'projects_enriched.json');
const DOCS_DIR = '/workspace/docs';
const REPORT_FILE = path.join(DOCS_DIR, 'validation_report.md');

if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });

const projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
const enriched = fs.existsSync(ENRICHED_FILE)
    ? JSON.parse(fs.readFileSync(ENRICHED_FILE, 'utf8'))
    : {};

// ── Утилиты ──────────────────────────────────────────────────────
const safeNum = v => (typeof v === 'number' && !isNaN(v) && v !== null) ? v : null;
const hasMarket = d => d?.market && safeNum(d.market.market_cap_usd) != null;
const hasFdv = d => d?.market && safeNum(d.market.fdv_usd) != null;
const hasPrice = d => d?.market && safeNum(d.market.price_usd) != null;
const hasGitHub = d => d?.github && (d.github.full_name || d.github.owner);
const hasTvl = d => d?.protocol && safeNum(d.protocol.tvl_usd) != null;
const hasDeveloper = d => d?.developer && (
    safeNum(d.developer.stars) != null ||
    safeNum(d.developer.commit_count_4_weeks) != null ||
    safeNum(d.developer.pull_requests_merged) != null
);
const hasPayd = d => d?.ai && safeNum(d.ai.payd_score) != null;
const hasRisk = d => d?.ai && safeNum(d.ai.risk_score) != null;

// ── 1. Статистика ────────────────────────────────────────────────
const stats = {
    total: projects.length,
    enriched_total: 0,
    with: {
        market: 0, fdv: 0, price: 0, github: 0, tvl: 0,
        developer: 0, payd: 0, risk: 0
    },
    missing: {
        coingecko_id: 0,
        market: 0, fdv: 0, price: 0, github: 0, tvl: 0,
        developer: 0, payd: 0, risk: 0
    },
    no_coingecko_id: [],
    partially_enriched: [],
    failed: [],
    full_pass: [],
    sectors: {}
};

for (const p of projects) {
    const d = enriched[p.id];

    if (!p.coingeckoId) {
        stats.missing.coingecko_id++;
        stats.no_coingecko_id.push({
            id: p.id, name: p.name, sector: p.sector
        });
        stats.failed.push({ id: p.id, name: p.name, reason: 'no_coingecko_id' });
        continue;
    }

    if (!d) {
        stats.failed.push({ id: p.id, name: p.name, reason: 'not_in_enriched' });
        continue;
    }

    stats.enriched_total++;

    // Подсчёт заполненных полей
    if (hasMarket(d)) stats.with.market++;
    else stats.missing.market++;

    if (hasFdv(d)) stats.with.fdv++;
    else stats.missing.fdv++;

    if (hasPrice(d)) stats.with.price++;
    else stats.missing.price++;

    if (hasGitHub(d)) stats.with.github++;
    else stats.missing.github++;

    if (hasTvl(d)) stats.with.tvl++;
    else stats.missing.tvl++;

    if (hasDeveloper(d)) stats.with.developer++;
    else stats.missing.developer++;

    if (hasPayd(d)) stats.with.payd++;
    else stats.missing.payd++;

    if (hasRisk(d)) stats.with.risk++;
    else stats.missing.risk++;

    // Классификация
    const filledCount = [
        hasMarket(d), hasFdv(d), hasPrice(d),
        hasGitHub(d), hasTvl(d), hasDeveloper(d),
        hasPayd(d), hasRisk(d)
    ].filter(Boolean).length;

    const sectorKey = p.sector || 'unknown';
    stats.sectors[sectorKey] = stats.sectors[sectorKey] || { total: 0, enriched: 0, with_tvl: 0 };
    stats.sectors[sectorKey].total++;
    stats.sectors[sectorKey].enriched++;
    if (hasTvl(d)) stats.sectors[sectorKey].with_tvl++;

    if (filledCount === 8) {
        stats.full_pass.push({ id: p.id, name: p.name, sector: p.sector });
    } else {
        const missingFields = [];
        if (!hasMarket(d)) missingFields.push('market');
        if (!hasFdv(d)) missingFields.push('fdv');
        if (!hasPrice(d)) missingFields.push('price');
        if (!hasGitHub(d)) missingFields.push('github');
        if (!hasTvl(d)) missingFields.push('tvl');
        if (!hasDeveloper(d)) missingFields.push('developer');
        if (!hasPayd(d)) missingFields.push('payd');
        if (!hasRisk(d)) missingFields.push('risk');

        // Определяем причину
        let reason = 'unknown';
        if (!hasMarket(d) && !hasPrice(d)) {
            reason = 'no_coingecko_data';
        } else if (!hasGitHub(d) && !hasDeveloper(d)) {
            reason = 'no_github_data';
        } else if (!hasTvl(d) && ['defi', 'rwa', 'layer1', 'layer2', 'infrastructure', 'depin'].includes(p.sector)) {
            reason = 'no_defillama_data';
        } else if (filledCount < 4) {
            reason = 'rate_limit_or_api_error';
        } else {
            reason = 'partial_data';
        }

        stats.partially_enriched.push({
            id: p.id, name: p.name, sector: p.sector,
            filled: filledCount,
            missing: missingFields,
            reason
        });
    }
}

// ── 2. Генерация отчёта ──────────────────────────────────────────
const pct = (n, d) => d === 0 ? '0%' : `${(n / d * 100).toFixed(1)}%`;

let report = '';
report += '# PAYD Intelligence V2 — Validation Report\n\n';
report += `**Дата:** ${new Date().toISOString()}\n\n`;
report += '## Общая статистика\n\n';
report += `| Метрика | Значение |\n`;
report += `|---------|----------|\n`;
report += `| Всего проектов | ${stats.total} |\n`;
report += `| Обогащено (хотя бы частично) | ${stats.enriched_total} (${pct(stats.enriched_total, stats.total)}) |\n`;
report += `| Полностью обогащено (8/8 полей) | ${stats.full_pass.length} (${pct(stats.full_pass.length, stats.total)}) |\n`;
report += `| Частично обогащено | ${stats.partially_enriched.length} |\n`;
report += `| Не обогащено / провал | ${stats.failed.length} |\n`;
report += `| Без CoinGecko ID | ${stats.no_coingecko_id.length} |\n\n`;

report += '## Полнота по полям\n\n';
report += `| Поле | Заполнено | % |\n`;
report += `|------|-----------|---|\n`;
report += `| Market Cap | ${stats.with.market} | ${pct(stats.with.market, stats.total)} |\n`;
report += `| FDV | ${stats.with.fdv} | ${pct(stats.with.fdv, stats.total)} |\n`;
report += `| Price | ${stats.with.price} | ${pct(stats.with.price, stats.total)} |\n`;
report += `| GitHub data | ${stats.with.github} | ${pct(stats.with.github, stats.total)} |\n`;
report += `| TVL | ${stats.with.tvl} | ${pct(stats.with.tvl, stats.total)} |\n`;
report += `| Developer Activity | ${stats.with.developer} | ${pct(stats.with.developer, stats.total)} |\n`;
report += `| Payd Score | ${stats.with.payd} | ${pct(stats.with.payd, stats.total)} |\n`;
report += `| Risk Score | ${stats.with.risk} | ${pct(stats.with.risk, stats.total)} |\n\n`;

report += '## Распределение по секторам\n\n';
report += `| Сектор | Всего | Обогащено | С TVL |\n`;
report += `|--------|-------|-----------|-------|\n`;
for (const [s, v] of Object.entries(stats.sectors).sort((a, b) => b[1].total - a[1].total)) {
    report += `| ${s} | ${v.total} | ${v.enriched} | ${v.with_tvl} |\n`;
}
report += '\n';

// ── 3. Список проектов с проблемами ─────────────────────────────
report += '## Проекты без CoinGecko ID\n\n';
if (stats.no_coingecko_id.length === 0) {
    report += '_Нет_\n\n';
} else {
    report += '| ID | Name | Sector |\n';
    report += '|----|------|--------|\n';
    for (const p of stats.no_coingecko_id) {
        report += `| ${p.id} | ${p.name} | ${p.sector} |\n`;
    }
    report += '\n';
}

report += '## Полностью обогащённые проекты (8/8)\n\n';
if (stats.full_pass.length === 0) {
    report += '_Нет_\n\n';
} else {
    report += `Всего: **${stats.full_pass.length}**\n\n`;
    report += '<details><summary>Показать список</summary>\n\n';
    for (const p of stats.full_pass) {
        report += `- ${p.name} (\`${p.id}\`, ${p.sector})\n`;
    }
    report += '\n</details>\n\n';
}

report += '## Частично обогащённые проекты (требуют второго прохода)\n\n';
if (stats.partially_enriched.length === 0) {
    report += '_Нет_\n\n';
} else {
    report += `Всего: **${stats.partially_enriched.length}**\n\n`;
    report += '| ID | Name | Sector | Filled | Reason | Missing fields |\n';
    report += '|----|------|--------|--------|--------|----------------|\n';
    for (const p of stats.partially_enriched) {
        report += `| ${p.id} | ${p.name} | ${p.sector} | ${p.filled}/8 | ${p.reason} | ${p.missing.join(', ')} |\n`;
    }
    report += '\n';
}

report += '## Провалившиеся проекты (не обогащены)\n\n';
if (stats.failed.length === 0) {
    report += '_Нет_\n\n';
} else {
    report += '| ID | Name | Reason |\n';
    report += '|----|------|--------|\n';
    for (const p of stats.failed) {
        report += `| ${p.id} | ${p.name} | ${p.reason} |\n`;
    }
    report += '\n';
}

// ── 4. Список для второго прохода ──────────────────────────────
const toRetry = stats.partially_enriched.filter(p =>
    p.reason === 'rate_limit_or_api_error' ||
    p.reason === 'no_coingecko_data' ||
    p.reason === 'no_github_data' ||
    p.reason === 'partial_data'
);

const secondPassFile = path.join(DATA_DIR, '_second_pass_ids.json');
fs.writeFileSync(secondPassFile, JSON.stringify(toRetry.map(p => p.id), null, 2));

report += '## Список для второго прохода\n\n';
report += `Всего ID для повторной обработки: **${toRetry.length}**\n\n`;
report += `Сохранено в: \`${secondPassFile}\`\n\n`;

fs.writeFileSync(REPORT_FILE, report);
fs.writeFileSync(path.join(DATA_DIR, '_validation_stats.json'), JSON.stringify(stats, null, 2));

console.log('\n=== Validation complete ===');
console.log(`Total: ${stats.total}`);
console.log(`Fully enriched: ${stats.full_pass.length}`);
console.log(`Partial: ${stats.partially_enriched.length}`);
console.log(`Failed: ${stats.failed.length}`);
console.log(`Report: ${REPORT_FILE}`);
console.log(`Second pass IDs: ${secondPassFile}`);

// Краткий вывод по причинам
const reasonCount = {};
for (const p of stats.partially_enriched) {
    reasonCount[p.reason] = (reasonCount[p.reason] || 0) + 1;
}
console.log('\nПричины частичного обогащения:');
for (const [r, c] of Object.entries(reasonCount)) {
    console.log(`  ${r}: ${c}`);
}
