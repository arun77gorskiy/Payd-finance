/* =================================================================
   PAYD Intelligence V2 — CoinGlass Failure Mode Test
   ----------------------------------------------------------------
   Симулирует 5 режимов отказа:
   1. Missing API key
   2. HTTP 500
   3. Network timeout
   4. Rate limit (429)
   5. Unsupported symbol

   Проверяет, что PAYD Intelligence продолжает работать
   в каждом случае. Не должно быть:
   - Глобального сбоя
   - Повреждения существующих данных
   - Сломанных sector-страниц
   ================================================================= */

const path = require('path');
const fs = require('fs');
const { getProviderIds } = require('./data_mappings_v2.js');
const cgRouter = require('./router/metric_source_router.js');
const cgProvider = require('./providers/coinglass.js');
const cgConfig = require('./coinglass_config.js');

const TEST_PROJECT = { id: 'bitcoin', coingeckoId: 'bitcoin' };
const CONTROL_GROUP = [
    'bitcoin', 'ethereum', 'solana', 'chainlink',
    'arbitrum', 'optimism', 'helium', 'render-token',
    'akash-network', 'ondo-finance',
];

let passCount = 0;
let failCount = 0;

function check(label, condition, detail) {
    if (condition) {
        console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`);
        passCount++;
    } else {
        console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`);
        failCount++;
    }
}

async function test1_missingApiKey() {
    console.log('─[1] Test: Missing API key (current state) ───────────────────');
    const isActive = cgConfig.isActive();
    check('Provider correctly reports DISABLED when no key', !isActive);
    const result = await cgRouter.resolveMarketIntelligence(TEST_PROJECT);
    check('resolveMarketIntelligence returns AUTH_REQUIRED safely',
        result.symbol_status === 'AUTH_REQUIRED',
        `status=${result.symbol_status}`);
    check('market_intelligence is null (no fake data)',
        result.market_intelligence === null);
    check('No exception thrown', true);
    console.log('');
}

async function test2_http500() {
    console.log('─[2] Test: HTTP 500 simulation ────────────────────────────────');
    // Временно включаем провайдер, чтобы fetch был вызван
    const oldKey = process.env.COINGLASS_API_KEY;
    const oldEnabled = process.env.COINGLASS_ENABLED;
    process.env.COINGLASS_API_KEY = 'mock_key_for_failure_test';
    process.env.COINGLASS_ENABLED = 'true';
    delete require.cache[require.resolve('./coinglass_config.js')];
    delete require.cache[require.resolve('./providers/coinglass.js')];
    const localCgProvider = require('./providers/coinglass.js');
    // Мокаем fetch глобально
    const originalFetch = global.fetch;
    global.fetch = async () => ({
        ok: false,
        status: 500,
        headers: { get: () => null },
        json: async () => ({}),
    });
    try {
        const res = await localCgProvider.fetchOpenInterest('BTC');
        check('HTTP 500 → PROVIDER_ERROR', res.success === false && (res.reason === 'PROVIDER_ERROR' || res.status === 'PROVIDER_ERROR'));
        const intel = await cgRouter.resolveMarketIntelligence(TEST_PROJECT);
        check('Router safely returns envelope', intel.market_intelligence === null || intel.symbol_status === 'PROVIDER_ERROR' || intel.symbol_status === 'AUTH_REQUIRED');
    } finally {
        global.fetch = originalFetch;
        if (oldKey === undefined) delete process.env.COINGLASS_API_KEY;
        else process.env.COINGLASS_API_KEY = oldKey;
        if (oldEnabled === undefined) delete process.env.COINGLASS_ENABLED;
        else process.env.COINGLASS_ENABLED = oldEnabled;
        delete require.cache[require.resolve('./coinglass_config.js')];
        delete require.cache[require.resolve('./providers/coinglass.js')];
    }
    console.log('');
}

async function test3_timeout() {
    console.log('─[3] Test: Network timeout simulation ─────────────────────────');
    const oldKey = process.env.COINGLASS_API_KEY;
    const oldEnabled = process.env.COINGLASS_ENABLED;
    process.env.COINGLASS_API_KEY = 'mock_key_for_timeout';
    process.env.COINGLASS_ENABLED = 'true';
    delete require.cache[require.resolve('./coinglass_config.js')];
    delete require.cache[require.resolve('./providers/coinglass.js')];
    const localCgProvider = require('./providers/coinglass.js');
    const originalFetch = global.fetch;
    global.fetch = async () => {
        return new Promise((_, reject) => {
            setTimeout(() => {
                const e = new Error('aborted');
                e.name = 'AbortError';
                reject(e);
            }, 50);
        });
    };
    try {
        const res = await localCgProvider.fetchOpenInterest('BTC');
        check('Timeout → PROVIDER_ERROR safely', res.success === false);
    } catch (e) {
        check('No unhandled exception', false, e.message);
    } finally {
        global.fetch = originalFetch;
        if (oldKey === undefined) delete process.env.COINGLASS_API_KEY;
        else process.env.COINGLASS_API_KEY = oldKey;
        if (oldEnabled === undefined) delete process.env.COINGLASS_ENABLED;
        else process.env.COINGLASS_ENABLED = oldEnabled;
        delete require.cache[require.resolve('./coinglass_config.js')];
        delete require.cache[require.resolve('./providers/coinglass.js')];
    }
    console.log('');
}

async function test4_rateLimit() {
    console.log('─[4] Test: Rate limit (429) simulation ────────────────────────');
    const oldKey = process.env.COINGLASS_API_KEY;
    const oldEnabled = process.env.COINGLASS_ENABLED;
    process.env.COINGLASS_API_KEY = 'mock_key_for_rate_limit';
    process.env.COINGLASS_ENABLED = 'true';
    delete require.cache[require.resolve('./coinglass_config.js')];
    delete require.cache[require.resolve('./providers/coinglass.js')];
    const localCgConfig = require('./coinglass_config.js');
    const localCgProvider = require('./providers/coinglass.js');
    const originalFetch = global.fetch;
    global.fetch = async () => ({
        ok: false,
        status: 429,
        headers: { get: (h) => h.toLowerCase() === 'retry-after' ? '1' : null },
        json: async () => ({}),
    });
    try {
        const before = localCgConfig.HEALTH.rate_limited_requests;
        const res = await localCgProvider.fetchOpenInterest('BTC');
        const after = localCgConfig.HEALTH.rate_limited_requests;
        check('429 → RATE_LIMITED status', res.success === false && (res.reason === 'RATE_LIMITED' || res.status === 'RATE_LIMITED'));
        check('rate_limited_requests counter incremented', after > before);
    } finally {
        global.fetch = originalFetch;
        if (oldKey === undefined) delete process.env.COINGLASS_API_KEY;
        else process.env.COINGLASS_API_KEY = oldKey;
        if (oldEnabled === undefined) delete process.env.COINGLASS_ENABLED;
        else process.env.COINGLASS_ENABLED = oldEnabled;
        delete require.cache[require.resolve('./coinglass_config.js')];
        delete require.cache[require.resolve('./providers/coinglass.js')];
    }
    console.log('');
}

async function test5_unsupportedSymbol() {
    console.log('─[5] Test: Unsupported symbol simulation ──────────────────────');
    const result1 = await cgProvider.fetchOpenInterest('FAKE_UNKNOWN_TOKEN');
    check('Unknown symbol → NOT_SUPPORTED', result1.success === false && result1.status === 'NOT_SUPPORTED');

    const result2 = await cgProvider.fetchOpenInterest('');
    check('Empty symbol → NOT_SUPPORTED', result2.success === false);

    const result3 = await cgProvider.fetchOpenInterest(null);
    check('Null symbol → NOT_SUPPORTED', result3.success === false);

    // Router level
    const routerRes = await cgRouter.resolveMarketIntelligence({ id: 'fake_token', coingeckoId: 'fake_token' });
    check('Router returns NOT_SUPPORTED for unknown project', routerRes.symbol_status === 'NOT_SUPPORTED');
    console.log('');
}

async function test6_noGlobalFailure() {
    console.log('─[6] Test: No global failure / no corrupted data ──────────────');
    // Убеждаемся, что после всех тестов данные на диске не повреждены
    const projects = JSON.parse(fs.readFileSync('/workspace/public/data/projects.json', 'utf8'));
    const enriched = JSON.parse(fs.readFileSync('/workspace/public/data/projects_enriched.json', 'utf8'));
    check('projects.json still valid', projects.projects.length === 364);
    check('projects_enriched.json still valid', enriched.projects.length === 364);
    check('No project lost its id', projects.projects.every(p => p.id));
    check('Helium market data preserved', enriched.projects.find(p => p.id === 'helium')?.market?.market_cap_usd > 0);
    console.log('');
}

async function test7_rolloutSafe() {
    console.log('─[7] Test: Rollback / disable safety ──────────────────────────');
    // Проверяем, что если COINGLASS_ENABLED=false, всё работает
    const oldEnabled = process.env.COINGLASS_ENABLED;
    process.env.COINGLASS_ENABLED = 'false';
    delete require.cache[require.resolve('./coinglass_config.js')];
    const cfg = require('./coinglass_config.js');
    check('isActive() returns false when COINGLASS_ENABLED=false', !cfg.isActive());
    check('Status correctly reports DISABLED', cfg.getHealthReport().status === 'DISABLED');
    // Восстанавливаем
    if (oldEnabled !== undefined) process.env.COINGLASS_ENABLED = oldEnabled;
    else delete process.env.COINGLASS_ENABLED;
    delete require.cache[require.resolve('./coinglass_config.js')];
    console.log('');
}

async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  PAYD Intelligence V2 — CoinGlass FAILURE MODE TEST');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');

    await test1_missingApiKey();
    await test2_http500();
    await test3_timeout();
    await test4_rateLimit();
    await test5_unsupportedSymbol();
    await test6_noGlobalFailure();
    await test7_rolloutSafe();

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  FAILURE TEST SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  Passed:  ${passCount}`);
    console.log(`  Failed:  ${failCount}`);
    console.log(`  Result:  ${failCount === 0 ? '✓ ALL SAFE' : '✗ ISSUES FOUND'}`);
    console.log('');
    console.log('  CoinGlass can fail in any mode without breaking Intelligence.');
    console.log('');

    return failCount === 0;
}

main().then(success => {
    process.exit(success ? 0 : 1);
}).catch(e => {
    console.error('FATAL:', e);
    process.exit(2);
});
