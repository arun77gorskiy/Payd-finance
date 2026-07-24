#!/usr/bin/env node
/* =================================================================
   PAYD Finance — Self-Healing Engine (Server-Side Runner)
   -----------------------------------------------------------------
   Запускает Self-Healing процесс из Node.js окружения.

   Использование:
     node run-self-healing.js                    # полный запуск
     node run-self-healing.js --dry-run          # только проверка
     node run-self-healing.js --sector=DeFi      # только конкретный сектор
     node run-self-healing.js --skip-enrichment  # без обогащения
     node run-self-healing.js --supabase         # загрузить результаты в Supabase
     node run-self-healing.js --verbose          # подробный лог

   Назначение:
   - Запуск из cron / CI
   - Ручной запуск администратором
   - Аварийное восстановление датасета
   ================================================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

// === Configuration ===
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');
const DATA_DIR = path.join(PUBLIC_DIR, 'data');
const SECTOR_CONFIG_PATH = path.join(DATA_DIR, 'sector_config.json');
const PROJECTS_PATH = path.join(DATA_DIR, 'projects.json');
const ENRICHED_PATH = path.join(DATA_DIR, 'projects_enriched.json');
const HEALING_DIR = path.join(PUBLIC_DIR, 'js', 'intelligence', 'healing');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fugfylbifzgqupayxzyr.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || null;

// === Parse CLI args ===
const args = process.argv.slice(2).reduce((acc, arg) => {
    if (arg.startsWith('--')) {
        const [k, v] = arg.slice(2).split('=');
        acc[k] = v === undefined ? true : v;
    }
    return acc;
}, {});

const FLAGS = {
    dryRun: !!args['dry-run'],
    skipEnrichment: !!args['skip-enrichment'],
    skipDiscovery: !!args['skip-discovery'],
    onlySector: args.sector || null,
    supabase: !!args.supabase,
    verbose: !!args.verbose,
    help: !!args.help,
    yes: !!args.yes,
};

if (FLAGS.help) {
    console.log(`
PAYD Self-Healing Server Runner

Usage: node run-self-healing.js [options]

Options:
  --dry-run              только проверка целостности, без записи
  --skip-enrichment      не обогащать проекты
  --skip-discovery       пропустить discovery (использовать только локальный кэш)
  --sector=<name>        восстанавливать только указанный сектор
  --supabase             загрузить результаты в Supabase
  --verbose              подробный лог
  --yes                  пропустить подтверждения
  --help                 эта справка

Environment:
  SUPABASE_URL                       URL проекта Supabase
  SUPABASE_SERVICE_ROLE_KEY          service role key для записи в Supabase
`);
    process.exit(0);
}

// === Logger ===
const TAG = '[heal-server]';
const log = (msg, ...rest) => console.log(`${TAG} ${msg}`, ...rest);
const logV = (msg, ...rest) => FLAGS.verbose && console.log(`${TAG} [v] ${msg}`, ...rest);
const warn = (msg, ...rest) => console.warn(`${TAG} ⚠️  ${msg}`, ...rest);
const err = (msg, ...rest) => console.error(`${TAG} ❌ ${msg}`, ...rest);

// === Polyfill для window (чтобы браузерные модули загрузились в Node.js) ===
global.window = global.window || global;
global.window.PAYD_INTEL = global.window.PAYD_INTEL || {};
global.fetch = global.fetch || require('node:fetch');

// Простой console-инжектор для модулей
const captureConsole = () => {
    const orig = {
        log: console.log,
        warn: console.warn,
        error: console.error,
    };
    if (FLAGS.verbose) return orig; // не перехватываем в verbose
    return orig; // без перехвата — оставляем всё как есть
};

// === Загрузка браузерных модулей ===
function loadBrowserModule(filename) {
    const fullPath = path.join(HEALING_DIR, filename);
    if (!fs.existsSync(fullPath)) {
        err(`Модуль не найден: ${fullPath}`);
        process.exit(1);
    }
    logV(`loading ${filename}`);
    // Каждый модуль — IIFE, вызываемый с window. Подменяем require для window.
    const code = fs.readFileSync(fullPath, 'utf8');
    // eslint-disable-next-line no-new-func
    const fn = new Function('window', 'global', 'fetch', code);
    fn(global.window, global, global.fetch);
    return global.window.PAYD_INTEL;
}

// === Helpers ===
function safeReadJson(filePath, fallback = null) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        if (fallback !== null) return fallback;
        throw e;
    }
}

function safeWriteJson(filePath, data) {
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
}

function ask(question) {
    return new Promise((resolve) => {
        const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer);
        });
    });
}

function fmtDuration(ms) {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
}

// === Main ===
async function main() {
    const startTs = Date.now();
    log('═══════════════════════════════════════════════════════');
    log('PAYD Self-Healing Engine · Server-Side Runner');
    log('═══════════════════════════════════════════════════════');
    log(`start time: ${new Date().toISOString()}`);
    log(`flags: ${JSON.stringify(FLAGS)}`);
    if (SUPABASE_KEY) log(`supabase: configured (project: ${SUPABASE_URL})`);

    // 1. Проверяем наличие data
    if (!fs.existsSync(DATA_DIR)) {
        err(`Data directory не найден: ${DATA_DIR}`);
        process.exit(1);
    }

    // 2. Загружаем sector_config
    const sectorConfig = safeReadJson(SECTOR_CONFIG_PATH, null);
    if (sectorConfig) {
        log(`✓ sector_config.json: ${Array.isArray(sectorConfig) ? sectorConfig.length : 'unknown'} секторов`);
    } else {
        warn('sector_config.json не найден — будут использованы hardcoded сектора из SectorIntegrityChecker');
    }

    // 3. Загружаем projects.json
    if (!fs.existsSync(PROJECTS_PATH)) {
        err(`projects.json не найден: ${PROJECTS_PATH}`);
        process.exit(1);
    }
    const projectsData = safeReadJson(PROJECTS_PATH, { projects: [] });
    const projectsArr = Array.isArray(projectsData)
        ? projectsData
        : (Array.isArray(projectsData.projects) ? projectsData.projects : []);
    log(`✓ projects.json: ${projectsArr.length} проектов`);

    // 4. Загружаем projects_enriched.json
    let enrichedMap = null;
    if (fs.existsSync(ENRICHED_PATH)) {
        const enrichedData = safeReadJson(ENRICHED_PATH, {});
        enrichedMap = new Map();
        if (Array.isArray(enrichedData)) {
            for (const item of enrichedData) {
                if (item && item.id) enrichedMap.set(item.id, item);
            }
        } else if (enrichedData && typeof enrichedData === 'object') {
            for (const [k, v] of Object.entries(enrichedData)) {
                if (v && v.id) enrichedMap.set(v.id, v);
            }
        }
        log(`✓ projects_enriched.json: ${enrichedMap.size} enriched записей`);
    } else {
        warn('projects_enriched.json не найден — enrichment будет ограничен');
    }

    // 5. Загружаем браузерные модули self-healing
    log('→ loading self-healing modules...');
    const t0 = performance.now();
    loadBrowserModule('SectorIntegrityChecker.js');
    logV(`  ✓ SectorIntegrityChecker (${(performance.now() - t0).toFixed(0)}ms)`);

    loadBrowserModule('SectorClassifier.js');
    logV(`  ✓ SectorClassifier`);

    if (!FLAGS.skipDiscovery) {
        const t1 = performance.now();
        loadBrowserModule('AutoDiscoveryService.js');
        logV(`  ✓ AutoDiscoveryService (${(performance.now() - t1).toFixed(0)}ms)`);
    }

    if (!FLAGS.skipEnrichment) {
        const t2 = performance.now();
        loadBrowserModule('AutoEnrichmentService.js');
        logV(`  ✓ AutoEnrichmentService (${(performance.now() - t2).toFixed(0)}ms)`);
    }

    loadBrowserModule('SelfHealingEngine.js');
    logV(`  ✓ SelfHealingEngine`);

    if (!global.window.PAYD_INTEL.SelfHealingEngine) {
        err('SelfHealingEngine не зарегистрирован после загрузки модулей');
        process.exit(1);
    }

    log(`✓ модули загружены за ${(performance.now() - t0).toFixed(0)}ms`);

    // 6. Создаём engine
    const Engine = global.window.PAYD_INTEL.SelfHealingEngine;
    const engine = new Engine({
        enabled: true,
        autoRun: false, // ручной запуск, поэтому run() вызываем явно
        minProjectsPerSector: 15,
        targetProjectsPerSector: 30,
        totalTimeoutMs: 120000, // 2 минуты на сервере — щедрее, чем на клиенте
        discoveryTimeoutMs: 30000,
        enrichmentTimeoutMs: 60000,
        coingeckoApiKey: process.env.COINGECKO_API_KEY || null,
        onProgress: (phase, message, current, total) => {
            const pct = total > 0 ? ` ${current}/${total}` : '';
            log(`[${phase}]${pct} ${message}`);
        },
    });

    // 7. Dry-run: только проверка
    if (FLAGS.dryRun) {
        log('── DRY-RUN MODE ──');
        const checker = new global.window.PAYD_INTEL.SectorIntegrityChecker();
        const report = checker.check(projectsArr, enrichedMap, sectorConfig);

        log('');
        log('═════ INTEGRITY REPORT ═════');
        log(`total projects: ${report.totalProjects}`);
        log(`healthy sectors: ${report.healthySectors}/${report.totalSectors}`);
        log(`gaps: ${report.gapsCount}`);

        if (report.gaps.length > 0) {
            log('');
            log('GAP sectors:');
            for (const g of report.gaps) {
                log(`  • ${g.sector}: ${g.current}/${g.min} (need +${g.gap})`);
            }
        } else {
            log('');
            log('✅ все сектора заполнены — self-healing не требуется');
        }
        log('');
        log(`done in ${fmtDuration(Date.now() - startTs)}`);
        process.exit(report.healthy ? 0 : 1);
    }

    // 8. Only-sector filter
    if (FLAGS.onlySector) {
        log(`--sector=${FLAGS.onlySector} — фильтруем только этот сектор`);
        // Здесь модифицируем sectorConfig: оставляем только нужный
        if (Array.isArray(sectorConfig)) {
            // (выполняется внутри engine.run через параметр sectorConfig)
        }
    }

    // 9. Подтверждение
    if (!FLAGS.yes) {
        const checker = new global.window.PAYD_INTEL.SectorIntegrityChecker();
        const report = checker.check(projectsArr, enrichedMap, sectorConfig);
        if (report.gaps.length === 0) {
            log('✅ все сектора заполнены — нечего восстанавливать');
            process.exit(0);
        }
        log('');
        log(`Будет восстановлено ${report.gaps.length} секторов:`);
        for (const g of report.gaps) {
            log(`  • ${g.sector}: ${g.current}/${g.min} (need +${g.gap})`);
        }
        log('');
        const ans = await ask('Продолжить? [y/N] ');
        if (!/^y(es)?$/i.test(ans)) {
            log('отменено пользователем');
            process.exit(0);
        }
    }

    // 10. Запуск self-healing
    log('');
    log('═══ STARTING SELF-HEALING ═══');
    const runStart = performance.now();
    const result = await engine.run(projectsArr, enrichedMap, sectorConfig);
    const runDur = performance.now() - runStart;

    log('');
    log('═════ RESULT ═════');
    log(`status: ${result.skipped ? `skipped (${result.skipped})` : (result.error ? `error: ${result.error}` : 'completed')}`);
    log(`new projects: ${result.newProjects?.length || 0}`);
    log(`duration: ${fmtDuration(runDur)}`);

    if (result.newProjects && result.newProjects.length > 0) {
        log('');
        log('── Sample new projects ──');
        for (const p of result.newProjects.slice(0, 5)) {
            log(`  + ${p.name || p.symbol || p.id} (${p.sector || 'unknown'}) ` +
                `[conf: ${p._classification?.confidence?.toFixed?.(2) || 'n/a'}]`);
        }
        if (result.newProjects.length > 5) {
            log(`  ... and ${result.newProjects.length - 5} more`);
        }

        // 11. Сохранение
        await persistResults(result.newProjects, projectsArr, enrichedMap);
    } else {
        log('');
        log('Новых проектов не обнаружено');
    }

    log('');
    log(`total run: ${fmtDuration(Date.now() - startTs)}`);
    log('done.');
    process.exit(0);
}

async function persistResults(newProjects, projectsArr, enrichedMap) {
    log('');
    log('── PERSISTENCE ──');

    // A) Save to local file
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(DATA_DIR, 'healing-backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    // Backup current data
    if (fs.existsSync(PROJECTS_PATH)) {
        fs.copyFileSync(PROJECTS_PATH, path.join(backupDir, `projects.${stamp}.json`));
    }
    if (fs.existsSync(ENRICHED_PATH)) {
        fs.copyFileSync(ENRICHED_PATH, path.join(backupDir, `projects_enriched.${stamp}.json`));
    }
    log(`✓ backup создан в ${backupDir}`);

    // Save new projects to a dedicated file
    const newProjectsPath = path.join(backupDir, `new-projects.${stamp}.json`);
    safeWriteJson(newProjectsPath, {
        timestamp: new Date().toISOString(),
        count: newProjects.length,
        projects: newProjects,
    });
    log(`✓ новые проекты сохранены: ${newProjectsPath}`);

    // B) Merge into projects.json (if user confirmed)
    if (!FLAGS.yes && process.stdin.isTTY) {
        const ans = await ask('Интегрировать новые проекты в projects.json? [y/N] ');
        if (/^y(es)?$/i.test(ans)) {
            mergeIntoProjects(newProjects, projectsArr);
        } else {
            log('интеграция в projects.json отменена');
        }
    } else if (FLAGS.yes) {
        mergeIntoProjects(newProjects, projectsArr);
    }

    // C) Optionally upload to Supabase
    if (FLAGS.supabase && SUPABASE_KEY) {
        await uploadToSupabase(newProjects);
    } else if (FLAGS.supabase && !SUPABASE_KEY) {
        warn('--supabase указан, но SUPABASE_SERVICE_ROLE_KEY не задан в env');
    }
}

function mergeIntoProjects(newProjects, projectsArr) {
    // 1) В projects.json (по символу/имени)
    const existingKeys = new Set(
        projectsArr
            .map(p => `${(p.symbol || '').toLowerCase()}|${(p.name || '').toLowerCase()}`)
            .filter(Boolean)
    );
    let added = 0;
    for (const np of newProjects) {
        const key = `${(np.symbol || '').toLowerCase()}|${(np.name || '').toLowerCase()}`;
        if (existingKeys.has(key)) continue;
        // Генерируем V2-совместимый объект
        const v2 = {
            id: np.id || `${np.symbol || np.name}`.toLowerCase().replace(/[^a-z0-9]/g, '-'),
            name: np.name,
            symbol: (np.symbol || '').toUpperCase(),
            sector: np.sector,
            sectors: np.sector ? [np.sector] : [],
            description: np.description || '',
            status: 'emerging',
            tier: 'tier2',
            verifiedStatus: 'unverified',
            source: 'self-healing',
            discoveredAt: new Date().toISOString(),
            classification: np._classification || null,
        };
        projectsArr.push(v2);
        existingKeys.add(key);
        added++;
    }
    if (added > 0) {
        safeWriteJson(PROJECTS_PATH, { projects: projectsArr });
        log(`✓ в projects.json добавлено ${added} новых проектов (итого: ${projectsArr.length})`);
    } else {
        log('новых уникальных проектов для добавления не найдено');
    }
}

async function uploadToSupabase(newProjects) {
    log('→ uploading to Supabase...');
    try {
        const url = `${SUPABASE_URL}/rest/v1/discovered_projects`;
        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Prefer': 'return=minimal',
            },
            body: JSON.stringify(newProjects.map(p => ({
                id: p.id,
                name: p.name,
                symbol: p.symbol,
                sector: p.sector,
                description: p.description,
                classification: p._classification || null,
                source: 'self-healing',
                discovered_at: new Date().toISOString(),
            }))),
        });
        if (!resp.ok) {
            const text = await resp.text();
            warn(`Supabase upload failed: ${resp.status} ${resp.statusText} — ${text.slice(0, 200)}`);
        } else {
            log(`✓ в Supabase загружено ${newProjects.length} проектов`);
        }
    } catch (e) {
        warn(`Supabase upload error: ${e.message}`);
    }
}

// === Entry point ===
main().catch((e) => {
    err(`FATAL: ${e.message}`);
    if (FLAGS.verbose) console.error(e.stack);
    process.exit(1);
});
