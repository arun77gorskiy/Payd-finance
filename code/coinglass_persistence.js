/* =================================================================
   PAYD Intelligence V2 — CoinGlass Persistence Script
   ----------------------------------------------------------------
   Безопасно добавляет market_intelligence envelope в projects_enriched.json
   для 10 контрольных проектов.

   Правила:
   - НЕ перезаписывает существующие поля
   - НЕ удаляет существующие поля
   - НЕ ломает обратную совместимость
   - Добавляет ТОЛЬКО новый объект market_intelligence
   - Если market_intelligence уже есть — обновляет его
   - Старые snapshots без этого поля продолжают работать
   ================================================================= */

const fs = require('fs');
const path = require('path');
const { getProviderIds } = require('./data_mappings_v2.js');
const cgRouter = require('./router/metric_source_router.js');
const cgConfig = require('./coinglass_config.js');

const DATA_DIR = '/workspace/public/data';
const ENRICHED_FILE = path.join(DATA_DIR, 'projects_enriched.json');

const CONTROL_GROUP = [
    'bitcoin', 'ethereum', 'solana', 'chainlink',
    'arbitrum', 'optimism', 'helium', 'render-token',
    'akash-network', 'ondo-finance',
];

async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  PAYD Intelligence V2 — CoinGlass Persistence');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');

    // Load
    const data = JSON.parse(fs.readFileSync(ENRICHED_FILE, 'utf8'));
    console.log(`Loaded ${data.projects.length} projects from projects_enriched.json`);
    console.log('');

    const results = [];
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const proj of data.projects) {
        // Match by id OR by coingeckoId
        const inControlGroup = CONTROL_GROUP.some(cgId =>
            proj.id === cgId || proj.id === cgId.replace('-token', '') || proj.coingeckoId === cgId
        );
        if (!inControlGroup) {
            skipped++;
            continue;
        }
        try {
            const result = await cgRouter.resolveMarketIntelligence(proj);
            const before = proj.market_intelligence;
            const after = result.market_intelligence !== null
                ? result.market_intelligence
                : {
                    // Сохраняем envelope с явным статусом, даже если нет данных
                    _meta: {
                        status: result.symbol_status,
                        reason: result.reason,
                        provider: 'coinglass',
                        symbol: result.symbol || null,
                        fetched_at: result.fetched_at || new Date().toISOString(),
                        note: 'Awaiting COINGLASS_API_KEY configuration',
                    },
                };
            proj.market_intelligence = after;
            updated++;
            results.push({
                id: proj.id,
                status: result.symbol_status,
                before: before ? 'EXISTED' : 'NEW',
                after: after ? 'PERSISTED' : 'EMPTY',
            });
        } catch (e) {
            errors++;
            console.log(`  ✗ ${proj.id}: ${e.message}`);
        }
    }

    console.log(`Updated:   ${updated}`);
    console.log(`Skipped:   ${skipped} (not in control group)`);
    console.log(`Errors:    ${errors}`);
    console.log('');

    // Write
    fs.writeFileSync(ENRICHED_FILE, JSON.stringify(data, null, 2));
    console.log(`✓ Persisted to ${ENRICHED_FILE}`);
    console.log('');

    // Verify
    console.log('─[Verification]────────────────────────────────────────────────');
    const verify = JSON.parse(fs.readFileSync(ENRICHED_FILE, 'utf8'));
    for (const r of results) {
        const v = verify.projects.find(p => p.id === r.id);
        const hasField = v && 'market_intelligence' in v;
        const hasMarket = v && v.market && v.market.market_cap_usd;
        const hasGitHub = v && v.github && (v.github.stars || v.github.forks);
        console.log(`  ${r.id.padEnd(16)} market_intelligence=${hasField ? 'YES' : 'NO'} | market=${hasMarket ? 'YES' : 'NO'} | github=${hasGitHub ? 'YES' : 'NO'}`);
    }

    // Verify other projects are NOT affected
    console.log('');
    console.log('─[Other Projects Not Affected]─────────────────────────────────');
    const otherProjects = verify.projects.filter(p => !CONTROL_GROUP.includes(p.id)).slice(0, 5);
    for (const p of otherProjects) {
        const hasMI = 'market_intelligence' in p;
        console.log(`  ${p.id.padEnd(16)} has market_intelligence: ${hasMI ? 'YES (unexpected!)' : 'NO (correct)'}`);
    }

    return { updated, skipped, errors, results };
}

main().then(r => {
    if (r.errors === 0) {
        console.log('');
        console.log('✓ Persistence complete — safe and backward-compatible');
        process.exit(0);
    } else {
        console.log(`✗ ${r.errors} errors during persistence`);
        process.exit(1);
    }
}).catch(e => {
    console.error('FATAL:', e);
    process.exit(2);
});
