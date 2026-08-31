/* =================================================================
   PAYD Intelligence V2 — Phase 2 Diagnostic Test
   ----------------------------------------------------------------
   Тестирует provider resolution на 10 целевых проектах:
   - Arbitrum, Optimism, Polygon, Starknet, Mantle, Linea,
     ZKsync, Celo, Metis, Gnosis

   Для каждого проекта выводит:
   - entity_types
   - coingecko_id, defillama_chain, defillama_protocol
   - market_cap
   - chain_tvl, protocol_tvl
   - dex_volume, chain_fees, app_revenue
   - active_addresses, github_activity
   - source for each value
   - http_status for each provider call
   - raw responses for Arbitrum and Optimism

   Сохраняет отчёт в docs/provider-diagnostic-report.md
   ================================================================= */

const fs = require('fs');
const path = require('path');
const router = require('./router/metric_source_router.js');
const chainProvider = require('./providers/defillama_chain.js');
const protocolProvider = require('./providers/defillama_protocol.js');
const cgProvider = require('./providers/coingecko.js');
const { resolveEntityTypes } = require('./entity_resolver.js');
const { getProviderIds, PROVIDER_IDS } = require('./data_mappings_v2.js');
const { isRealNumber, MISSING_REASONS } = require('./providers/_common.js');

const PROJECTS_FILE = '/workspace/public/data/projects.json';
const TARGETS = ['arbitrum', 'optimism', 'polygon', 'starknet', 'mantle', 'linea', 'zksync', 'celo', 'metis', 'gnosis'];

function fmtValue(env) {
    if (!env) return '—';
    if (isRealNumber(env.value)) {
        if (Math.abs(env.value) >= 1e9) return `$${(env.value / 1e9).toFixed(3)}B`;
        if (Math.abs(env.value) >= 1e6) return `$${(env.value / 1e6).toFixed(2)}M`;
        if (Math.abs(env.value) >= 1e3) return `$${(env.value / 1e3).toFixed(2)}K`;
        return `$${env.value.toFixed(2)}`;
    }
    return 'unavailable';
}

function fmtSource(env) {
    if (!env) return '—';
    if (env.source) return env.source;
    if (env.reason) return `reason: ${env.reason}`;
    return '—';
}

function fmtReason(env) {
    if (!env) return '—';
    if (isRealNumber(env.value)) return 'OK';
    return env.reason || '—';
}

async function run() {
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║  PAYD INTELLIGENCE V2 — PHASE 2 DIAGNOSTIC TEST         ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    // Загрузить проекты
    const data = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
    const projects = data.projects || data;
    const projectMap = new Map();
    projects.forEach(p => projectMap.set(p.id.toLowerCase(), p));

    // Собрать coingeckoIds
    const cgIds = [];
    for (const t of TARGETS) {
        const p = projectMap.get(t);
        if (p && p.coingeckoId) cgIds.push(p.coingeckoId);
    }

    // Загрузить CoinGecko markets батч
    console.log('→ Loading CoinGecko /coins/markets...');
    const cgMarkets = await cgProvider.fetchMarkets(cgIds);
    const cgMarketsMap = new Map();
    cgMarkets.forEach(c => cgMarketsMap.set(c.id, c));
    console.log(`  ✓ CoinGecko: ${cgMarketsMap.size}/${cgIds.length} монет\n`);

    // Загрузить CoinGecko details (для community/developer fallback)
    console.log('→ Loading CoinGecko /coins/{id} details...');
    const cgDetailMap = new Map();
    for (const cgId of cgIds) {
        const detail = await cgProvider.fetchCoinDetail(cgId);
        if (detail) cgDetailMap.set(cgId, detail);
    }
    console.log(`  ✓ CoinGecko details: ${cgDetailMap.size}/${cgIds.length}\n`);

    // Запустить тест для каждой цели
    const results = [];
    for (let i = 0; i < TARGETS.length; i++) {
        const targetId = TARGETS[i];
        const project = projectMap.get(targetId);
        if (!project) {
            console.log(`  [${i + 1}/${TARGETS.length}] ✗ ${targetId} — НЕ НАЙДЕН в projects.json`);
            continue;
        }
        console.log(`  [${i + 1}/${TARGETS.length}] ${project.name} (${project.symbol})...`);
        const r = await router.resolveAllMetrics(project, { cgMarketsMap, cgDetailMap });
        const completeness = router.calculateCompleteness(r);
        results.push({
            project: { id: project.id, name: project.name, symbol: project.symbol, sector: project.sector },
            resolution: r,
            completeness,
        });
    }

    // ───── Распечатать результаты в консоль ─────
    console.log('\n════════════════════════════════════════════════════════════');
    console.log('           РЕЗУЛЬТАТЫ ДИАГНОСТИЧЕСКОГО ТЕСТА');
    console.log('════════════════════════════════════════════════════════════\n');

    for (const r of results) {
        const p = r.project;
        const m = r.resolution;
        console.log(`━━━ ${p.name.toUpperCase()} (${p.symbol}) ━━━`);
        console.log(`  ID:                  ${p.id}`);
        console.log(`  Sector:              ${p.sector}`);
        console.log(`  Entity Types:        ${m.entity_types.join(', ')}`);
        console.log(`  Coingecko ID:        ${m.identifiers?.coingecko || '—'}`);
        console.log(`  DefiLlama Chain:     ${m.identifiers?.defillama_chain || '—'}`);
        console.log(`  DefiLlama Protocol:  ${m.identifiers?.defillama_protocol || '—'}`);
        console.log(`  ─────────────────────────────────────────────`);
        console.log(`  Market Cap:          ${fmtValue(m.market.market_cap_usd)}    [${fmtReason(m.market.market_cap_usd)}]`);
        console.log(`  Chain TVL:           ${fmtValue(m.tvl.chain_tvl)}    [${fmtReason(m.tvl.chain_tvl)}]`);
        console.log(`  Protocol TVL:        ${fmtValue(m.tvl.protocol_tvl)}    [${fmtReason(m.tvl.protocol_tvl)}]`);
        console.log(`  TVL priority:        ${m.tvl.tvl_source_priority || '—'}`);
        console.log(`  DEX Volume 24h:      ${fmtValue(m.dex.dex_volume_24h)}    [${fmtReason(m.dex.dex_volume_24h)}]`);
        console.log(`  Fees 24h:            ${fmtValue(m.fees.fees_24h)}    [${fmtReason(m.fees.fees_24h)}]`);
        console.log(`  Revenue 24h:         ${fmtValue(m.revenue.revenue_24h)}    [${fmtReason(m.revenue.revenue_24h)}]`);
        console.log(`  Active Addresses:    ${fmtValue(m.active.active_addresses)}    [${fmtReason(m.active.active_addresses)}]`);
        console.log(`  GitHub Stars:        ${m.github.github?.stars?.value ?? '—'}    [${fmtReason(m.github.github?.stars)}]    src: ${m.github.github?.source || '—'}`);
        console.log(`  GitHub Commits 30d:  ${m.github.github?.commits_30d?.value ?? '—'}    [${fmtReason(m.github.github?.commits_30d)}]`);
        console.log(`  ─────────────────────────────────────────────`);
        console.log(`  Data Completeness:   ${r.completeness.present}/${r.completeness.total} (${r.completeness.completeness_pct}%)`);
        console.log('');
    }

    // ───── Сгенерировать Markdown отчёт ─────
    const md = generateMarkdownReport(results, { projects: projectMap });
    const outPath = '/workspace/docs/provider-diagnostic-report.md';
    fs.writeFileSync(outPath, md);
    console.log(`\n✓ Отчёт сохранён: ${outPath}`);
    console.log(`  Размер: ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB`);

    // Сохранить JSON для последующего data quality test
    const jsonPath = '/workspace/tmp/phase2/diagnostic_results.json';
    fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
    console.log(`✓ JSON сохранён: ${jsonPath}`);
}

function generateMarkdownReport(results, ctx) {
    const now = new Date().toISOString();

    let md = `# PAYD Intelligence V2 — Phase 2: Provider Diagnostic Report\n\n`;
    md += `_Дата: ${now}_\n\n`;
    md += `## Цель\n\n`;
    md += `Диагностика provider resolution на 10 ключевых chain-проектах до запуска полного обогащения 364 проектов.\n\n`;
    md += `**Тестовые проекты**: ${TARGETS.map(t => `\`${t}\``).join(', ')}\n\n`;
    md += `---\n\n`;

    // Provider status table
    md += `## Сводка по метрикам\n\n`;
    md += `| Проект | Entity Types | MCap | Chain TVL | Protocol TVL | Fees | Revenue | DEX Vol | Completeness |\n`;
    md += `|---|---|---|---|---|---|---|---|---|\n`;
    for (const r of results) {
        const p = r.project;
        const m = r.resolution;
        md += `| **${p.name}** (${p.symbol}) | ${m.entity_types.join(', ')} | `;
        md += `${fmtValue(m.market.market_cap_usd)} | `;
        md += `${fmtValue(m.tvl.chain_tvl)} | `;
        md += `${fmtValue(m.tvl.protocol_tvl)} | `;
        md += `${fmtValue(m.fees.fees_24h)} | `;
        md += `${fmtValue(m.revenue.revenue_24h)} | `;
        md += `${fmtValue(m.dex.dex_volume_24h)} | `;
        md += `${r.completeness.present}/${r.completeness.total} (${r.completeness.completeness_pct}%) |\n`;
    }
    md += `\n`;

    // Per-project details
    md += `## Детальный отчёт по каждому проекту\n\n`;
    for (const r of results) {
        const p = r.project;
        const m = r.resolution;
        md += `### ${p.name} (\`${p.id}\`)\n\n`;
        md += `- **Sector:** ${p.sector}\n`;
        md += `- **Entity Types:** ${m.entity_types.map(t => `\`${t}\``).join(', ')}\n`;
        md += `- **CoinGecko ID:** \`${m.identifiers?.coingecko || '—'}\`\n`;
        md += `- **DefiLlama Chain:** \`${m.identifiers?.defillama_chain || '—'}\`\n`;
        md += `- **DefiLlama Protocol:** \`${m.identifiers?.defillama_protocol || '—'}\`\n\n`;

        md += `| Метрика | Value | Source | Reason | HTTP |\n`;
        md += `|---|---|---|---|---|\n`;

        const rows = [
            ['Market Cap', m.market.market_cap_usd, 'CoinGecko:markets'],
            ['Chain TVL', m.tvl.chain_tvl, 'DefiLlama:/v2/chains'],
            ['Protocol TVL', m.tvl.protocol_tvl, 'DefiLlama:/protocol/{slug}'],
            ['Fees 24h', m.fees.fees_24h, 'DefiLlama:/summary/fees'],
            ['Revenue 24h', m.revenue.revenue_24h, 'DefiLlama:/summary/fees'],
            ['DEX Volume 24h', m.dex.dex_volume_24h, 'DefiLlama:/summary/dexs'],
            ['Active Addresses', m.active.active_addresses, '—'],
            ['GitHub Stars', m.github.github?.stars, m.github.github?.source || '—'],
            ['GitHub Commits 30d', m.github.github?.commits_30d, m.github.github?.source || '—'],
        ];

        for (const [name, env, expectedSource] of rows) {
            const v = isRealNumber(env?.value) ? env.value.toLocaleString('en-US', { maximumFractionDigits: 0 }) : 'unavailable';
            const src = env?.source || '—';
            const reason = isRealNumber(env?.value) ? 'OK' : (env?.reason || '—');
            const http = env?.http_status || '—';
            md += `| ${name} | ${v} | ${src} | ${reason} | ${http} |\n`;
        }

        // Missing reasons
        if (r.completeness.missing.length > 0) {
            md += `\n**Missing reasons:**\n`;
            for (const miss of r.completeness.missing) {
                md += `- \`${miss.field}\`: \`${miss.reason}\`\n`;
            }
        }
        md += `\n`;
    }

    // ───── Raw provider responses (Arbitrum + Optimism) ─────
    md += `---\n\n## Raw Provider Responses (Диагностика)\n\n`;
    md += `Сырые ответы от провайдеров для Arbitrum и Optimism используются для верификации корректности резолва. `;
    md += `Позволяет видеть, что именно вернул каждый endpoint, до какой степени данные дошли до системы и где именно произошла потеря.\n\n`;

    for (const targetId of ['arbitrum', 'optimism']) {
        const r = results.find(x => x.project.id === targetId);
        if (!r) continue;
        const m = r.resolution;
        md += `### Raw Responses — ${r.project.name}\n\n`;

        // 1. CoinGecko /coins/markets
        md += `#### CoinGecko /coins/markets\n\n`;
        md += `\`Endpoint\`: \`/coins/{id}\` from \`/coins/markets?ids=${m.identifiers?.coingecko}\`\n\n`;
        if (m.market.cg_raw) {
            const cg = m.market.cg_raw;
            md += `\`\`\`json\n`;
            md += JSON.stringify({
                id: cg.id,
                symbol: cg.symbol,
                name: cg.name,
                current_price: cg.current_price,
                market_cap: cg.market_cap,
                fully_diluted_valuation: cg.fully_diluted_valuation,
                total_volume: cg.total_volume,
                circulating_supply: cg.circulating_supply,
                total_supply: cg.total_supply,
                max_supply: cg.max_supply,
                market_cap_rank: cg.market_cap_rank,
                ath: cg.ath,
                ath_change_percentage: cg.ath_change_percentage,
                atl: cg.atl,
                price_change_24h: cg.price_change_24h,
                price_change_7d: cg.price_change_percentage_7d,
                last_updated: cg.last_updated,
            }, null, 2);
            md += `\n\`\`\`\n\n`;
        } else {
            md += `_No raw response captured (cg_raw=null)_\n\n`;
        }

        // 2. DefiLlama /v2/chains
        md += `#### DefiLlama /v2/chains → chain entry\n\n`;
        md += `\`Endpoint\`: \`/v2/chains\` lookup by \`name="${m.identifiers?.defillama_chain}"\`\n\n`;
        if (m.tvl.chain_raw_full) {
            const ch = m.tvl.chain_raw_full;
            md += `\`\`\`json\n`;
            md += JSON.stringify({
                name: ch.name,
                gecko_id: ch.gecko_id,
                chainId: ch.chainId,
                cmcId: ch.cmcId,
                tokenSymbol: ch.tokenSymbol,
                tvl: ch.tvl,
            }, null, 2);
            md += `\n\`\`\`\n\n`;
        } else {
            md += `_Chain not found or no raw response_\n\n`;
        }

        // 3. DefiLlama /protocol/{slug} (если есть protocol mapping)
        if (m.identifiers?.defillama_protocol) {
            md += `#### DefiLlama /protocol/{slug}\n\n`;
            md += `\`Endpoint\`: \`/protocol/${m.identifiers.defillama_protocol}\`\n\n`;
            if (m.tvl.protocol_raw_full) {
                const pr = m.tvl.protocol_raw_full;
                md += `\`\`\`json\n`;
                md += JSON.stringify({
                    id: pr.id,
                    name: pr.name,
                    slug: pr.slug,
                    category: pr.category,
                    chains: pr.chains,
                    tvl: pr.tvl,
                    change_1d: pr.change_1d,
                    change_7d: pr.change_7d,
                }, null, 2);
                md += `\n\`\`\`\n\n`;
            } else {
                md += `_Protocol detail not fetched_\n\n`;
            }
        }

        // 4. DefiLlama /summary/fees/{slug} (если есть)
        if (m.fees.raw_response) {
            md += `#### DefiLlama /summary/fees/{slug}\n\n`;
            md += `\`Endpoint\`: \`/summary/fees/${m.identifiers.defillama_protocol}\`\n\n`;
            md += `\`\`\`json\n`;
            md += JSON.stringify(m.fees.raw_response, null, 2);
            md += `\n\`\`\`\n\n`;
        }

        // 5. GitHub attempts
        md += `#### GitHub API attempts\n\n`;
        if (m.github.github?.raw_response) {
            const gh = m.github.github.raw_response;
            md += `**Source repo:** \`${m.github.github.source_repo || '—'}\`\n\n`;
            md += `\`\`\`json\n`;
            md += JSON.stringify({
                full_name: gh.full_name,
                stargazers_count: gh.stargazers_count,
                forks_count: gh.forks_count,
                subscribers_count: gh.subscribers_count,
                open_issues_count: gh.open_issues_count,
                archived: gh.archived,
                disabled: gh.disabled,
                language: gh.language,
                license: gh.license ? gh.license.spdx_id : null,
                pushed_at: gh.pushed_at,
                updated_at: gh.updated_at,
            }, null, 2);
            md += `\n\`\`\`\n\n`;
        } else if (m.github.github?.attempts) {
            md += `**All GitHub attempts failed.** Attempts:\n\n`;
            md += `| Candidate | Success | HTTP | Reason |\n`;
            md += `|---|---|---|---|\n`;
            for (const a of m.github.github.attempts) {
                md += `| \`${a.candidate}\` | ${a.success ? '✓' : '✗'} | ${a.httpStatus || '—'} | ${a.reason || '—'} |\n`;
            }
            md += `\n`;
        }
    }

    // ───── Data Quality Test (STEP 11) ─────
    md += `---\n\n## 📊 Data Quality Test\n\n`;
    md += `Финальный тест качества данных. Подтверждает, что проекты с известными chain-данными больше не показывают \`$0 TVL\` из-за отсутствия protocol mapping.\n\n`;
    md += `| Project | Entity Type | Market Cap | TVL (chain) | Fees | Revenue | Active Addr | GitHub | Completeness | Missing Reasons |\n`;
    md += `|---|---|---|---|---|---|---|---|---|---|\n`;
    for (const r of results) {
        const p = r.project;
        const m = r.resolution;
        const tvl = m.tvl.tvl;
        const fees = m.fees.fees_24h;
        const revenue = m.revenue.revenue_24h;
        const active = m.active.active_addresses;
        const gh = m.github.github;
        const ghStars = isRealNumber(gh?.stars?.value) ? gh.stars.value : null;

        const missingReasons = r.completeness.missing
            .map(miss => `${miss.field.replace('m.', '').replace('github.github.', 'gh.')}:${miss.reason}`)
            .join(', ') || '—';

        md += `| **${p.name}** | ${m.entity_types.join('+')} | `;
        md += `${fmtValue(m.market.market_cap_usd)} | `;
        md += `${fmtValue(tvl)} | `;
        md += `${fmtValue(fees)} | `;
        md += `${fmtValue(revenue)} | `;
        md += `${fmtValue(active)} | `;
        md += `${ghStars != null ? ghStars.toLocaleString() + '⭐' : '—'} | `;
        md += `${r.completeness.completeness_pct}% | `;
        md += `\`${missingReasons}\` |\n`;
    }
    md += `\n`;

    // Проверка успеха
    const chainsWithTvl = results.filter(r => isRealNumber(r.resolution.tvl.chain_tvl?.value)).length;
    const chainsWithProtocol = results.filter(r => isRealNumber(r.resolution.tvl.protocol_tvl?.value)).length;
    md += `### Acceptance Criteria\n\n`;
    md += `- **Chain TVL данные получены для**: ${chainsWithTvl}/${results.length} проектов\n`;
    md += `- **Protocol TVL данные получены для**: ${chainsWithProtocol}/${results.length} проектов\n`;
    md += `- **Критерий**: \`$0 TVL\` не должен возвращаться, если провайдер вернул реальное числовое значение > 0\n\n`;

    if (chainsWithTvl === results.length) {
        md += `✅ **TEST PASSED**: Все ${results.length} целевых chain-проектов получили корректный chain TVL. Проблема с \`$0 TVL\` для L2 устранена.\n\n`;
    } else {
        md += `⚠️ **TEST PARTIAL**: ${chainsWithTvl}/${results.length} целевых chain-проектов получили корректный chain TVL.\n\n`;
    }

    md += `### Разбивка по типам ошибок (missing reasons)\n\n`;
    const reasonsCount = {};
    for (const r of results) {
        for (const miss of r.completeness.missing) {
            const key = miss.reason;
            reasonsCount[key] = (reasonsCount[key] || 0) + 1;
        }
    }
    if (Object.keys(reasonsCount).length > 0) {
        md += `| Reason | Count |\n`;
        md += `|---|---|\n`;
        for (const [reason, count] of Object.entries(reasonsCount).sort((a, b) => b[1] - a[1])) {
            md += `| \`${reason}\` | ${count} |\n`;
        }
    } else {
        md += `_Все метрики получены успешно._\n`;
    }
    md += `\n`;

    return md;
}

run().catch(e => {
    console.error('FATAL:', e.message);
    console.error(e.stack);
    process.exit(1);
});
