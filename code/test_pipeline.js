#!/usr/bin/env node
/**
 * PAYD Intelligence — Pipeline Test
 *
 * End-to-end smoke test для AUTOMATED INTELLIGENCE UPDATE ENGINE.
 * Загружает все модули в Node.js окружении (с заглушкой window)
 * и прогоняет полный pipeline от STEP 1 до STEP 6.
 *
 * Использование:
 *   node code/test_pipeline.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Создаём минимальный window-объект (используется как global в IIFE-модулях)
const window = {};
window.localStorage = (() => {
    let store = {};
    return {
        getItem: (k) => store[k] || null,
        setItem: (k, v) => { store[k] = v; },
        removeItem: (k) => { delete store[k]; },
        clear: () => { store = {}; },
    };
})();
window.document = { addEventListener: () => {} };
window.dispatchEvent = () => {};
window.addEventListener = () => {};
window.CustomEvent = class CustomEvent { constructor(t, init) { this.type = t; Object.assign(this, init || {}); } };
window.fetch = async () => ({ ok: false, status: 503 });
window.console = console;
window.setTimeout = setTimeout;
window.setInterval = setInterval;
window.clearTimeout = clearTimeout;
window.clearInterval = clearInterval;
window.Promise = Promise;
window.Date = Date;
window.Math = Math;
window.JSON = JSON;
window.Array = Array;
window.Object = Object;
window.Map = Map;
window.Set = Set;
window.Error = Error;
window.Number = Number;
window.String = String;
window.isNaN = isNaN;
window.parseInt = parseInt;
window.parseFloat = parseFloat;
window.isFinite = isFinite;

// Создаём sandbox, где global и window указывают на один и тот же объект
const sandbox = {
    console,
    Date,
    Math,
    JSON,
    setTimeout,
    setInterval,
    clearTimeout,
    clearInterval,
    Promise,
    Array,
    Object,
    Map,
    Set,
    fetch: async () => ({ ok: false, status: 503 }),
    Error,
    isNaN,
    parseInt,
    parseFloat,
    isFinite,
    CustomEvent: window.CustomEvent,
    Number,
    String,
    localStorage: window.localStorage,
    document: window.document,
    dispatchEvent: window.dispatchEvent,
    addEventListener: window.addEventListener,
};
// ВАЖНО: в браузерных скриптах используется global.PAYD_INTEL —
// в Node.js vm контексте `global` доступен только если он явно передан
sandbox.global = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);

const INTEL_DIR = path.join(__dirname, '..', 'public', 'js', 'intelligence');

function loadScript(file) {
    const full = path.join(INTEL_DIR, file);
    if (!fs.existsSync(full)) {
        console.warn(`[skip] not found: ${file}`);
        return false;
    }
    const code = fs.readFileSync(full, 'utf-8');
    try {
        vm.runInContext(code, sandbox, { filename: file });
        console.log(`[ok] ${file}`);
        return true;
    } catch (e) {
        console.error(`[err] ${file}:`, e.message);
        return false;
    }
}

async function runTest() {
    console.log('=== Loading Intelligence modules ===\n');

    const modules = [
        'scheduler/IScheduler.js',
        'scheduler/LocalBrowserScheduler.js',
        'scheduler/SchedulerAdapters.js',
        'providers/IDataSource.js',
        'providers/MockDataSource.js',
        'providers/DataAggregator.js',
        'validation/EnhancedMarketDataValidator.js',
        'lifecycle/LifecycleLogger.js',
        'validation/EnhancedProjectReplacementService.js',
        'history/HistoryStore.js',
        'analysis/BaseAnalysisEngine.js',
        'analysis/RiskAssessmentEngine.js',
        'analysis/FundamentalAnalysisEngine.js',
        'analysis/GrowthAnalysisEngine.js',
        'analysis/OpportunityAnalysisEngine.js',
        'analysis/InvestmentSummaryEngine.js',
        'ranking/RankingEngine.js',
        'intelligence/IntelligenceGenerators.js',
        'scheduler/UpdateOrchestrator.js',
        'pipeline/PipelineBootstrap.js',
    ];

    let loaded = 0;
    for (const m of modules) {
        if (loadScript(m)) loaded++;
    }
    console.log(`\nLoaded ${loaded}/${modules.length} modules\n`);

    const PAYD_INTEL = sandbox.PAYD_INTEL;
    if (!PAYD_INTEL) {
        console.error('PAYD_INTEL namespace not created');
        process.exit(1);
    }

    // Проверяем, что все ключевые классы зарегистрированы
    const expected = [
        'IScheduler', 'LocalBrowserScheduler', 'SchedulerAdapters',
        'IDataSource', 'MockDataSource', 'DataAggregator',
        'EnhancedMarketDataValidator', 'LifecycleLogger',
        'EnhancedProjectReplacementService', 'HistoryStore',
        'BaseAnalysisEngine', 'RiskAssessmentEngine', 'FundamentalAnalysisEngine',
        'GrowthAnalysisEngine', 'OpportunityAnalysisEngine', 'InvestmentSummaryEngine',
        'RankingEngine',
        'IntelligenceGenerators',
        'UpdateOrchestrator', 'PipelineBootstrap',
    ];
    let missing = [];
    for (const key of expected) {
        if (!PAYD_INTEL[key]) missing.push(key);
    }
    if (missing.length > 0) {
        console.error('Missing classes:', missing.join(', '));
        process.exit(1);
    }
    console.log('✓ All key classes registered\n');

    // Разрешаем проекты: data/projects.json (source of truth),
    // либо fallback на моковый набор если файл недоступен.
    let projects = [];
    try {
        const projectsPath = path.join(__dirname, '..', 'data', 'projects.json');
        if (fs.existsSync(projectsPath)) {
            projects = JSON.parse(fs.readFileSync(projectsPath, 'utf-8'));
            console.log(`Loaded ${projects.length} real projects from data/projects.json\n`);
        }
    } catch (e) {
        console.warn('Failed to load data/projects.json:', e.message);
    }
    if (projects.length === 0) {
        // Fallback — синтетические проекты (только если JSON отсутствует)
        const sectors = ['layer1', 'layer2', 'depin', 'ai'];
        for (let i = 0; i < 30; i++) {
            for (const sector of sectors) {
                projects.push({
                    id: `${sector}_${i}`,
                    name: `${sector.toUpperCase()} Project ${i}`,
                    symbol: `${sector[0]}${i}`,
                    sector,
                    coingecko_id: `${sector}-${i}`,
                    verified_status: 'verified',
                });
            }
        }
        console.log(`Fallback: created ${projects.length} synthetic projects\n`);
    }

    // Кандидаты для замены (синтетические, для теста discovery flow)
    const candidates = [];
    const sectors = ['layer1', 'layer2', 'depin', 'ai'];
    for (let i = 0; i < 10; i++) {
        candidates.push({
            id: `candidate_${i}`,
            name: `Candidate ${i}`,
            symbol: `C${i}`,
            sector: sectors[i % sectors.length],
            coingecko_id: `candidate-${i}`,
            verified_status: 'verified',
        });
    }

    // Инициализируем PipelineBootstrap
    const bootstrap = new PAYD_INTEL.PipelineBootstrap({
        projects,
        discoveryCandidates: candidates,
        minSectorSize: 30,
        maxRetries: 1,
    });

    console.log('=== Initializing pipeline ===\n');
    const status = await bootstrap.init();
    console.log('Status after init:');
    console.log('  initialised:', status.initialised);
    console.log('  scheduler jobs:', status.scheduler.length);
    console.log('  history stats:', JSON.stringify(status.history));
    console.log('  lifecycle stats:', JSON.stringify(status.lifecycle));

    // Проверяем scheduler job
    if (status.scheduler.length !== 1) {
        console.error('Expected 1 scheduler job, got', status.scheduler.length);
        process.exit(1);
    }
    const job = status.scheduler[0];
    console.log(`\n✓ Job registered: ${job.name}`);
    console.log(`  Cron: ${job.cron}`);
    console.log(`  Next run: ${job.nextRunAtISO}`);

    // Запускаем manual cycle
    console.log('\n=== Running manual cycle ===\n');
    const result = await bootstrap.runManualCycle();

    console.log('Cycle result:');
    console.log('  success:', result.success);
    console.log('  cycleId:', result.cycleId);
    console.log('  duration:', result.duration, 'ms');
    if (result.steps) {
        for (const [name, step] of Object.entries(result.steps)) {
            const status = step.success ? '✓' : '✗';
            console.log(`  ${status} ${name}: ${JSON.stringify(step.result || step.error || {})}`);
        }
    }

    if (!result.success) {
        console.error('\n✗ Cycle failed:', result.error);
        process.exit(1);
    }

    // Проверяем history
    console.log('\n=== History check ===\n');
    const finalStatus = bootstrap.getStatus();
    const hist = finalStatus.history;
    console.log('  Score history:', hist.scoreHistory);
    console.log('  Market history:', hist.marketHistory);
    console.log('  Label events:', hist.labelEvents);
    console.log('  Reports:', hist.reports);
    console.log('  Cycle history:', hist.cycleHistory);

    if (hist.reports < 1) {
        console.error('Expected at least 1 report');
        process.exit(1);
    }
    if (hist.cycleHistory < 1) {
        console.error('Expected at least 1 cycle record');
        process.exit(1);
    }

    // Проверяем rankings
    console.log('\n=== Rankings check ===\n');
    const rankings = finalStatus.rankingEngine.rankings;
    for (const r of ['core', 'watchlist', 'emerging', 'archive']) {
        console.log(`  ${r}: ${rankings[r].length} projects`);
    }

    // Проверяем экспорт
    console.log('\n=== Export check ===\n');
    const exported = bootstrap.exportAll();
    const exportSize = JSON.stringify(exported).length;
    console.log(`  Exported JSON size: ${(exportSize / 1024).toFixed(1)} KB`);
    console.log(`  Score history records: ${exported.history.scoreHistory.length}`);
    console.log(`  Cycle records: ${exported.history.cycleHistory.length}`);

    console.log('\n=== ALL TESTS PASSED ===\n');
    process.exit(0);
}

runTest().catch(e => {
    console.error('Test failed:', e);
    process.exit(1);
});
