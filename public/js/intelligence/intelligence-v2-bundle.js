/* =================================================================
   PAYD Intelligence V2 — Self-Loading Orchestrator (WAVE-BASED v4)
   Этот файл — ТОЧКА ВХОДА для V2.

   STEP 4 Architecture:
   1. DEPENDENCY WAVES — 12 критических скриптов разбиты на 6 волн
      по реальным зависимостям. Внутри волны — параллельная загрузка,
      между волнами — последовательно.
   2. Per-script timeout = 5 секунд (preserved).
   3. Wave timeout = bounded; failed independent scripts не блокируют страницу.
   4. POST_RENDER_IMMEDIATE (2 модуля) грузятся ПОСЛЕ первого рендера.
   5. INTERACTION_LAZY (32 модуля) грузятся по требованию через ensureFeatureLoaded().
   6. SCHEDULED_ONLY (4 scheduler модуля) грузятся после interactive.
   7. Performance instrumentation через performance.mark/measure.
   8. Runtime version identifier для cache safety.
   ================================================================= */

(function () {
    'use strict';

    // ============================================================
    // Versioning & instrumentation
    // ============================================================
    const BUNDLE_VERSION = '4.0.0-wave';
    const TAG = '[PAYD-V2-BUNDLE]';
    const startedAt = (window.performance && window.performance.now)
        ? Math.round(window.performance.now())
        : Date.now();
    const log = (msg, ...args) => console.log(`${TAG} [+${Date.now() - startedAt}ms] ${msg}`, ...args);
    const logErr = (msg, ...args) => console.error(`${TAG} [+${Date.now() - startedAt}ms] ${msg}`, ...args);

    // Performance marks
    const mark = (name) => {
        try {
            if (window.performance && window.performance.mark) {
                window.performance.mark(`payd_${name}`);
            }
        } catch (_) {}
    };
    const measure = (name, startMark, endMark) => {
        try {
            if (window.performance && window.performance.measure) {
                window.performance.measure(`payd_${name}`, `payd_${startMark}`, `payd_${endMark}`);
            }
        } catch (_) {}
    };

    mark('boot_start');
    log(`==== BUNDLE v${BUNDLE_VERSION} IIFE STARTED ====`);

    window.__PAYD_V2_DEBUG__ = window.__PAYD_V2_DEBUG__ || {
        bundleStartedAt: startedAt,
        bundleVersion: BUNDLE_VERSION,
        log, logErr,
        events: [],
        marks: {},
    };
    const debug = window.__PAYD_V2_DEBUG__;
    debug.events.push({ t: 0, type: 'bundle-iife-start', version: BUNDLE_VERSION });

    try {
        // Guard: only run on intelligence-v2.html
        const isV2Page = window.location.pathname.endsWith('/intelligence-v2.html')
                       || document.querySelector('#payd-v2-arch-grid') !== null;
        if (!isV2Page) {
            log('Not on V2 page, bundle inert.');
            return;
        }

        if (window.PAYD_INTEL_V2_ENABLED === false) {
            log('Disabled via PAYD_INTEL_V2_ENABLED=false');
            return;
        }

        const V2_BASE = '/js/intelligence';
        log('V2_BASE =', V2_BASE);

        // ===============================================================
        // STEP 4.3: DEPENDENCY WAVES
        // 12 критических скриптов распределены по 6 волнам по реальным
        // зависимостям. Внутри каждой волны — параллельная загрузка.
        // ===============================================================
        const DEPENDENCY_WAVES = [
            // Wave 1: foundational — нет зависимостей
            {
                label: 'wave-1-foundational',
                critical: true,
                scripts: [
                    `${V2_BASE}/config/data-provider.config.js`,
                    `${V2_BASE}/utils/field-utils.js`,
                ],
                onProgress: () => mark('critical_start'),
            },
            // Wave 2: интерфейсы — зависят от foundational (config, field-utils)
            {
                label: 'wave-2-interfaces',
                critical: true,
                scripts: [
                    `${V2_BASE}/data/IDataProvider.js`,
                    `${V2_BASE}/data/IMarketDataProvider.js`,
                ],
            },
            // Wave 3: implementations — зависят от интерфейсов
            {
                label: 'wave-3-implementations',
                critical: true,
                scripts: [
                    `${V2_BASE}/data/providers/LocalJsonDataProvider.js`,
                ],
            },
            // Wave 4: factory — зависит от config + LocalJsonDataProvider
            {
                label: 'wave-4-factory',
                critical: true,
                scripts: [
                    `${V2_BASE}/data/DataProviderFactory.js`,
                ],
            },
            // Wave 5: repositories — параллельно, все зависят от IDataProvider
            {
                label: 'wave-5-repositories',
                critical: true,
                scripts: [
                    `${V2_BASE}/data/repository/ProjectRepository.js`,
                    `${V2_BASE}/data/repository/ScoreRepository.js`,
                    `${V2_BASE}/data/repository/DiscoveryRepository.js`,
                ],
            },
            // Wave 6: render + service — ProjectService нужен для рендера.
            // ScoreService не критичен для первого рендера → перенесён в INTERACTION_LAZY.
            {
                label: 'wave-6-render',
                critical: true,
                scripts: [
                    `${V2_BASE}/application/ProjectService.js`,
                    `${V2_BASE}/intelligence-v2-render.js`,
                ],
                onComplete: () => mark('critical_complete'),
            },
        ];

        // ===============================================================
        // STEP 4.6: POST_RENDER_IMMEDIATE (2 модуля)
        // Грузятся ПОСЛЕ первого рендера, не блокируют UI.
        // Источник: tmp/payd_v2_optional_script_classification.json
        // ===============================================================
        const POST_RENDER_IMMEDIATE = [
            `${V2_BASE}/pipeline/PipelineBootstrap.js`,
            `${V2_BASE}/intelligence-v2-pipeline-ui.js`,
        ];

        // ===============================================================
        // STEP 4.7: INTERACTION_LAZY (32 модуля)
        // Загружаются по требованию через ensureFeatureLoaded().
        // ===============================================================
        const INTERACTION_LAZY = [
            // Data
            `${V2_BASE}/data/providers/ApiDataProvider.js`,
            `${V2_BASE}/providers/IDataSource.js`,
            `${V2_BASE}/providers/MockDataSource.js`,
            `${V2_BASE}/providers/DataAggregator.js`,
            // Application services
            `${V2_BASE}/application/DiscoveryService.js`,
            `${V2_BASE}/application/ReportService.js`,
            `${V2_BASE}/application/DashboardService.js`,
            `${V2_BASE}/application/MarketDataValidationService.js`,
            `${V2_BASE}/application/ProjectReplacementService.js`,
            `${V2_BASE}/application/ScoreService.js`,  // ScoreService не критичен для first render
            // Discovery
            `${V2_BASE}/discovery/QualityFilter.js`,
            `${V2_BASE}/discovery/SectorSizeManager.js`,
            `${V2_BASE}/discovery/ProjectLifecycleManager.js`,
            `${V2_BASE}/discovery/DiscoveryService.js`,
            // Scoring
            `${V2_BASE}/scoring/BaseEngine.js`,
            `${V2_BASE}/scoring/DiscoveryEngineV2.js`,
            // Validation
            `${V2_BASE}/validation/EnhancedMarketDataValidator.js`,
            `${V2_BASE}/validation/EnhancedProjectReplacementService.js`,
            // Lifecycle
            `${V2_BASE}/lifecycle/LifecycleLogger.js`,
            `${V2_BASE}/history/HistoryStore.js`,
            // Analysis
            `${V2_BASE}/analysis/BaseAnalysisEngine.js`,
            `${V2_BASE}/analysis/RiskAssessmentEngine.js`,
            `${V2_BASE}/analysis/FundamentalAnalysisEngine.js`,
            `${V2_BASE}/analysis/GrowthAnalysisEngine.js`,
            `${V2_BASE}/analysis/OpportunityAnalysisEngine.js`,
            `${V2_BASE}/analysis/InvestmentSummaryEngine.js`,
            // Ranking
            `${V2_BASE}/ranking/RankingEngine.js`,
            // Intelligence generators
            `${V2_BASE}/intelligence/IntelligenceGenerators.js`,
            // Healing
            `${V2_BASE}/healing/SectorIntegrityChecker.js`,
            `${V2_BASE}/healing/AutoDiscoveryService.js`,
            `${V2_BASE}/healing/SectorClassifier.js`,
            `${V2_BASE}/healing/AutoEnrichmentService.js`,
            `${V2_BASE}/healing/SelfHealingEngine.js`,
        ];

        // ===============================================================
        // STEP 4.8: SCHEDULED_ONLY (4 scheduler модуля)
        // Загружаются ПОСЛЕ interactive только когда scheduling требуется.
        // ===============================================================
        const SCHEDULED_ONLY = [
            `${V2_BASE}/scheduler/IScheduler.js`,
            `${V2_BASE}/scheduler/LocalBrowserScheduler.js`,
            `${V2_BASE}/scheduler/SchedulerAdapters.js`,
            `${V2_BASE}/scheduler/UpdateOrchestrator.js`,
        ];

        // ===============================================================
        // Feature → lazy modules mapping (STEP 4.7)
        // ===============================================================
        const FEATURE_LAZY_MAP = {
            'discovery': [
                `${V2_BASE}/application/DiscoveryService.js`,
                `${V2_BASE}/discovery/QualityFilter.js`,
                `${V2_BASE}/discovery/SectorSizeManager.js`,
                `${V2_BASE}/discovery/ProjectLifecycleManager.js`,
                `${V2_BASE}/discovery/DiscoveryService.js`,
                `${V2_BASE}/scoring/DiscoveryEngineV2.js`,
            ],
            'scoring': [
                `${V2_BASE}/application/ScoreService.js`,
                `${V2_BASE}/scoring/BaseEngine.js`,
                `${V2_BASE}/ranking/RankingEngine.js`,
            ],
            'analysis': [
                `${V2_BASE}/analysis/BaseAnalysisEngine.js`,
                `${V2_BASE}/analysis/RiskAssessmentEngine.js`,
                `${V2_BASE}/analysis/FundamentalAnalysisEngine.js`,
                `${V2_BASE}/analysis/GrowthAnalysisEngine.js`,
                `${V2_BASE}/analysis/OpportunityAnalysisEngine.js`,
                `${V2_BASE}/analysis/InvestmentSummaryEngine.js`,
            ],
            'reports': [
                `${V2_BASE}/application/ReportService.js`,
                `${V2_BASE}/application/DashboardService.js`,
            ],
            'history': [
                `${V2_BASE}/history/HistoryStore.js`,
            ],
            'market-data': [
                `${V2_BASE}/application/MarketDataValidationService.js`,
                `${V2_BASE}/validation/EnhancedMarketDataValidator.js`,
                `${V2_BASE}/providers/IDataSource.js`,
                `${V2_BASE}/providers/MockDataSource.js`,
                `${V2_BASE}/providers/DataAggregator.js`,
            ],
            'lifecycle': [
                `${V2_BASE}/application/ProjectReplacementService.js`,
                `${V2_BASE}/validation/EnhancedProjectReplacementService.js`,
                `${V2_BASE}/lifecycle/LifecycleLogger.js`,
            ],
            'healing': [
                `${V2_BASE}/healing/SectorIntegrityChecker.js`,
                `${V2_BASE}/healing/AutoDiscoveryService.js`,
                `${V2_BASE}/healing/SectorClassifier.js`,
                `${V2_BASE}/healing/AutoEnrichmentService.js`,
                `${V2_BASE}/healing/SelfHealingEngine.js`,
            ],
            'intelligence': [
                `${V2_BASE}/intelligence/IntelligenceGenerators.js`,
                `${V2_BASE}/data/providers/ApiDataProvider.js`,
            ],
            'scheduler': [
                ...SCHEDULED_ONLY,
            ],
        };

        // ===============================================================
        // Script loading primitives
        // ===============================================================

        // Cache for already-loaded script URLs (STEP 4.9 idempotency)
        const loadedSet = new Set();
        const inFlightMap = new Map();  // url -> Promise
        const failedSet = new Set();

        function loadOne(url, timeoutMs = 5000) {
            // Idempotency: if already loaded, return resolved
            if (loadedSet.has(url)) {
                return Promise.resolve({ url, status: 'Cached' });
            }
            // If in-flight, return same Promise
            if (inFlightMap.has(url)) {
                return inFlightMap.get(url);
            }
            // If previously failed, retry
            const filename = url.split('/').pop();
            const promise = new Promise((resolve) => {
                let resolved = false;
                const s = document.createElement('script');
                s.src = url;
                s.async = true;
                s.crossOrigin = 'anonymous';
                const started = Date.now();
                const onFinish = (status, err) => {
                    if (resolved) return;
                    resolved = true;
                    const elapsed = Date.now() - started;
                    if (status === 'Loaded') {
                        loadedSet.add(url);
                        log(`✓ ${filename} [+${elapsed}ms]`);
                    } else {
                        failedSet.add(url);
                        logErr(`✗ ${filename} [${status}] [+${elapsed}ms]`, err || '');
                    }
                    debug.events.push({ t: elapsed, type: 'script-' + status.toLowerCase(), file: filename });
                    inFlightMap.delete(url);
                    resolve({ url, status });
                };
                s.onload = () => onFinish('Loaded');
                s.onerror = (e) => onFinish('Failed', e);
                setTimeout(() => onFinish('Timeout'), timeoutMs);
                try {
                    document.head.appendChild(s);
                } catch (appendErr) {
                    logErr('appendChild failed for', filename, appendErr);
                    onFinish('Failed', appendErr);
                }
            });
            inFlightMap.set(url, promise);
            return promise;
        }

        async function loadGroup(scripts, groupLabel, opts = {}) {
            const { timeoutMs = 5000 } = opts;
            log(`==== loadGroup(${groupLabel}) START — ${scripts.length} scripts (parallel) ====`);
            const start = Date.now();
            const results = await Promise.allSettled(
                scripts.map(url => loadOne(url, timeoutMs))
            );
            let loaded = 0, failed = 0, timeout = 0;
            results.forEach((r, i) => {
                if (r.status === 'fulfilled') {
                    if (r.value.status === 'Loaded' || r.value.status === 'Cached') loaded++;
                    else if (r.value.status === 'Timeout') timeout++;
                    else failed++;
                } else {
                    failed++;
                }
            });
            const elapsed = Date.now() - start;
            log(`==== loadGroup(${groupLabel}) DONE [+${elapsed}ms] loaded=${loaded} failed=${failed} timeout=${timeout} ====`);
            return { group: groupLabel, total: scripts.length, loaded, failed, timeout };
        }

        // ===============================================================
        // STEP 4.4: Wave-based loading with bounded timeout per wave
        // ===============================================================
        async function loadWave(wave, isCritical = true) {
            mark(`${wave.label}_start`);
            const result = await loadGroup(wave.scripts, wave.label, {
                timeoutMs: isCritical ? 8000 : 5000,
            });
            mark(`${wave.label}_end`);
            debug.events.push({
                t: Date.now() - startedAt,
                type: 'wave-done',
                wave: wave.label,
                ...result,
            });
            if (wave.onComplete) wave.onComplete();
            return result;
        }

        // ===============================================================
        // STEP 4.7: ensureFeatureLoaded() generic loader
        // Idempotent + Promise cached.
        // ===============================================================
        const featureInFlight = new Map();  // featureName -> Promise

        async function ensureFeatureLoaded(featureName) {
            // Idempotent: if already loaded, return resolved
            if (loadedFeatures.has(featureName)) {
                return { feature: featureName, status: 'Cached' };
            }
            // If in-flight, return same Promise
            if (featureInFlight.has(featureName)) {
                return featureInFlight.get(featureName);
            }

            const modules = FEATURE_LAZY_MAP[featureName];
            if (!modules) {
                const err = new Error(`Unknown feature: ${featureName}`);
                logErr('ensureFeatureLoaded:', err.message);
                throw err;
            }

            log(`ensureFeatureLoaded('${featureName}') — loading ${modules.length} modules…`);
            mark(`feature_${featureName}_start`);

            const promise = (async () => {
                const result = await loadGroup(modules, `feature-${featureName}`, { timeoutMs: 8000 });
                loadedFeatures.add(featureName);
                mark(`feature_${featureName}_end`);
                if (window.PAYD_INTEL && window.PAYD_INTEL.onFeatureLoaded) {
                    try { window.PAYD_INTEL.onFeatureLoaded(featureName, result); } catch (_) {}
                }
                return { feature: featureName, ...result };
            })();

            featureInFlight.set(featureName, promise);
            return promise;
        }

        const loadedFeatures = new Set();

        // Expose globally
        window.PAYD_V2_LOADER = window.PAYD_V2_LOADER || {};
        Object.assign(window.PAYD_V2_LOADER, {
            version: BUNDLE_VERSION,
            ensureFeatureLoaded,
            loadOne,
            loadGroup,
            isLoaded: (url) => loadedSet.has(url),
            isFeatureLoaded: (name) => loadedFeatures.has(name),
            getMetrics: () => ({
                bundleVersion: BUNDLE_VERSION,
                startedAt,
                now: Date.now(),
                elapsed: Date.now() - startedAt,
                events: debug.events,
            }),
        });

        // ===============================================================
        // dispatchReady: диспатчится после Wave 6 + наличия DataProviderFactory
        // ===============================================================
        let dispatchScheduled = false;
        function dispatchReady(reason) {
            if (dispatchScheduled) return;
            dispatchScheduled = true;
            const t = Date.now() - startedAt;
            log(`==== dispatchReady() reason="${reason}" at +${t}ms ====`);
            debug.events.push({ t, type: 'dispatch-ready', reason });
            mark('first_render');
            try {
                window.__PAYD_V2_READY__ = true;
                window.dispatchEvent(new CustomEvent('payd-v2-ready'));
                log('✅ payd-v2-ready event dispatched');
            } catch (e) {
                logErr('dispatchReady failed:', e);
            }
            // STEP 4.6: POST_RENDER_IMMEDIATE — загрузить сразу после ready
            schedulePostRender();
        }

        function schedulePostRender() {
            mark('post_render_start');
            log(`==== POST_RENDER: loading ${POST_RENDER_IMMEDIATE.length} modules in parallel ====`);
            loadGroup(POST_RENDER_IMMEDIATE, 'post-render', { timeoutMs: 10000 })
                .then(result => {
                    mark('post_render_complete');
                    mark('interactive');
                    debug.events.push({
                        t: Date.now() - startedAt,
                        type: 'post-render-done',
                        ...result,
                    });
                    log('POST_RENDER complete:', result);
                    if (window.PAYD_INTEL && window.PAYD_INTEL.onPostRenderComplete) {
                        try { window.PAYD_INTEL.onPostRenderComplete(result); } catch (_) {}
                    }
                    // After interactive, schedule SCHEDULED_ONLY check
                    scheduleSchedulerCheck();
                })
                .catch(err => {
                    logErr('POST_RENDER failed (non-critical):', err);
                    mark('post_render_complete');
                    mark('interactive');
                    scheduleSchedulerCheck();
                });
        }

        function scheduleSchedulerCheck() {
            // STEP 4.8: SCHEDULED_ONLY — загружаем только если включена настройка scheduler
            const schedulerEnabled = window.PAYD_INTEL && window.PAYD_INTEL.config &&
                                     window.PAYD_INTEL.config.schedulerEnabled !== false;
            if (!schedulerEnabled) {
                log('SCHEDULED_ONLY: scheduler disabled by config, skipping');
                return;
            }
            // Use requestIdleCallback if available
            const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 1000));
            idle(() => {
                log(`==== SCHEDULED_ONLY: loading ${SCHEDULED_ONLY.length} scheduler modules ====`);
                ensureFeatureLoaded('scheduler').catch(err => {
                    logErr('SCHEDULED_ONLY failed (non-critical):', err);
                });
            });
        }

        // ===============================================================
        // Main boot — DEPENDENCY WAVES
        // ===============================================================
        log('==== BOOT STARTED — WAVE-BASED ====');

        // Watchdog #1: жёсткий лимит 8 секунд на критическую фазу
        setTimeout(() => {
            if (!window.__PAYD_V2_READY__) {
                logErr('WATCHDOG #1: 8s elapsed without ready, forcing dispatch');
                dispatchReady('watchdog-8s');
            }
        }, 8000);

        // Watchdog #2: страховка 15 секунд
        setTimeout(() => {
            if (!window.__PAYD_V2_READY__) {
                logErr('WATCHDOG #2: 15s elapsed, last attempt to dispatch');
                dispatchReady('watchdog-15s');
            }
        }, 15000);

        (async function boot() {
            try {
                mark('data_start');
                // ШАГ ЗА ШАГОМ по волнам. Внутри каждой — параллельная загрузка.
                let waveResults = [];
                for (let i = 0; i < DEPENDENCY_WAVES.length; i++) {
                    const wave = DEPENDENCY_WAVES[i];
                    log(`==== Wave ${i + 1}/${DEPENDENCY_WAVES.length}: ${wave.label} (${wave.scripts.length} scripts in parallel) ====`);
                    const result = await loadWave(wave, wave.critical !== false);
                    waveResults.push(result);
                    debug.events.push({
                        t: Date.now() - startedAt,
                        type: `wave-${i + 1}-done`,
                        wave: wave.label,
                        ...result,
                    });
                }
                log('==== All waves COMPLETE ====');
                measure('critical_path', 'critical_start', 'critical_complete');
                mark('data_ready');

                // Проверяем, можем ли диспатчить ready
                const ready = window.PAYD_INTEL &&
                              window.PAYD_INTEL.ProjectRepository &&
                              window.PAYD_INTEL.ProjectService &&
                              window.PAYD_INTEL.DataProviderFactory;
                if (ready) {
                    log('Critical waves loaded — dispatching ready event');
                    setTimeout(() => dispatchReady('waves-done'), 50);
                } else {
                    logErr('Critical missing after waves:', {
                        ProjectRepository: !!(window.PAYD_INTEL && window.PAYD_INTEL.ProjectRepository),
                        ProjectService: !!(window.PAYD_INTEL && window.PAYD_INTEL.ProjectService),
                        DataProviderFactory: !!(window.PAYD_INTEL && window.PAYD_INTEL.DataProviderFactory),
                    });
                    // Fallback: dispatch anyway — render.js handles missing services
                    setTimeout(() => dispatchReady('waves-partial'), 100);
                }

            } catch (e) {
                logErr('Boot fatal:', e);
                debug.events.push({
                    t: Date.now() - startedAt,
                    type: 'boot-fatal',
                    error: String(e),
                });
                dispatchReady('boot-fatal');
            }
        })();

    } catch (outerErr) {
        logErr('Bundle outer error:', outerErr);
        // Гарантируем dispatch даже при catastrophic failure
        try {
            window.__PAYD_V2_READY__ = true;
            window.dispatchEvent(new CustomEvent('payd-v2-ready'));
        } catch (_) {}
    }
})();
