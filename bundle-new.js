/* =================================================================
   PAYD Intelligence V2 — Self-Loading Orchestrator (DEBUG BUILD)
   Этот файл — ТОЧКА ВХОДА для V2.
   Он:
   1. Сам себя регистрирует через document.currentScript.
   2. Динамически загружает все V2-скрипты последовательно.
   3. НЕ модифицирует index.html или какие-либо существующие файлы.
   4. Активируется ТОЛЬКО на странице intelligence-v2.html.

   DEBUG VERSION: добавлены детальные логи + watchdog-таймеры.
   ================================================================= */

(function () {
    'use strict';

    // ============================================================
    // Глобальный логгер для отслеживания инициализации
    // ============================================================
    const TAG = '[PAYD-V2-BUNDLE]';
    const startedAt = Date.now();
    const log = (msg, ...args) => console.log(`${TAG} [+${Date.now() - startedAt}ms] ${msg}`, ...args);
    const logErr = (msg, ...args) => console.error(`${TAG} [+${Date.now() - startedAt}ms] ${msg}`, ...args);

    log('==== BUNDLE IIFE STARTED ====');
    log('location.pathname:', window.location.pathname);
    log('document.readyState:', document.readyState);

    // Сохраняем в window для последующей отладки из консоли
    window.__PAYD_V2_DEBUG__ = {
        bundleStartedAt: startedAt,
        log,
        logErr,
        events: [],
    };
    const debug = window.__PAYD_V2_DEBUG__;
    debug.events.push({ t: 0, type: 'bundle-iife-start' });

    try {
        // Guard: only run on intelligence-v2.html
        const isV2Page = window.location.pathname.endsWith('/intelligence-v2.html')
                       || document.querySelector('#payd-v2-arch-grid') !== null;
        log('isV2Page check:', isV2Page);
        if (!isV2Page) {
            log('Not on V2 page, bundle inert.');
            return;
        }

        // Feature flag
        if (window.PAYD_INTEL_V2_ENABLED === false) {
            log('Disabled via PAYD_INTEL_V2_ENABLED=false');
            return;
        }

        // Base path for V2 scripts
        const V2_BASE = '/js/intelligence';
        log('V2_BASE =', V2_BASE);

        // Все V2-скрипты, в любом порядке (каждый — самодостаточный IIFE).
        const V2_SCRIPTS = [
            // Config
            `${V2_BASE}/config/data-provider.config.js`,

            // Interfaces
            `${V2_BASE}/data/IDataProvider.js`,
            `${V2_BASE}/data/IMarketDataProvider.js`,

            // Providers
            `${V2_BASE}/data/providers/LocalJsonDataProvider.js`,
            `${V2_BASE}/data/providers/ApiDataProvider.js`,
            // DatabaseProvider удалён из loading chain (ARCHITECTURE STUB).
            // Активный провайдер = 'local-json' (см. data-provider.config.js:26).
            // Сам файл сохранён в /data/providers/ для будущих реализаций.

            // Factory
            `${V2_BASE}/data/DataProviderFactory.js`,

            // Repositories
            `${V2_BASE}/data/repository/ProjectRepository.js`,
            `${V2_BASE}/data/repository/ScoreRepository.js`,
            `${V2_BASE}/data/repository/DashboardRepository.js`,
            `${V2_BASE}/data/repository/ResearchRepository.js`,
            `${V2_BASE}/data/repository/MarketRepository.js`,
            `${V2_BASE}/data/repository/ReportRepository.js`,
            `${V2_BASE}/data/repository/DiscoveryRepository.js`,

            // Application services
            `${V2_BASE}/application/ProjectService.js`,
            `${V2_BASE}/application/ScoreService.js`,
            `${V2_BASE}/application/DiscoveryService.js`,
            `${V2_BASE}/application/ReportService.js`,
            `${V2_BASE}/application/DashboardService.js`,
            // INVALID PROJECT HANDLING v1.0
            `${V2_BASE}/application/MarketDataValidationService.js`,
            `${V2_BASE}/application/ProjectReplacementService.js`,

            // Discovery modules
            `${V2_BASE}/discovery/QualityFilter.js`,
            `${V2_BASE}/discovery/SectorSizeManager.js`,
            `${V2_BASE}/discovery/ProjectLifecycleManager.js`,
            `${V2_BASE}/discovery/DiscoveryService.js`,

            // Scoring engines
            `${V2_BASE}/scoring/BaseEngine.js`,
            `${V2_BASE}/scoring/DiscoveryEngineV2.js`,

            // AUTOMATED INTELLIGENCE UPDATE ENGINE
            // Scheduler layer
            `${V2_BASE}/scheduler/IScheduler.js`,
            `${V2_BASE}/scheduler/LocalBrowserScheduler.js`,
            `${V2_BASE}/scheduler/SchedulerAdapters.js`,
            `${V2_BASE}/scheduler/UpdateOrchestrator.js`,

            // Provider layer
            `${V2_BASE}/providers/IDataSource.js`,
            `${V2_BASE}/providers/MockDataSource.js`,
            `${V2_BASE}/providers/DataAggregator.js`,

            // Validation layer
            `${V2_BASE}/validation/EnhancedMarketDataValidator.js`,
            `${V2_BASE}/validation/EnhancedProjectReplacementService.js`,

            // Lifecycle layer
            `${V2_BASE}/lifecycle/LifecycleLogger.js`,

            // History layer
            `${V2_BASE}/history/HistoryStore.js`,

            // Analysis engines
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

            // Pipeline bootstrap (связывает всё)
            `${V2_BASE}/pipeline/PipelineBootstrap.js`,

            // V2 UI
            `${V2_BASE}/intelligence-v2-render.js`,
            `${V2_BASE}/intelligence-v2-pipeline-ui.js`,
        ];

        log('V2_SCRIPTS count:', V2_SCRIPTS.length);
        debug.events.push({ t: Date.now() - startedAt, type: 'scripts-defined', count: V2_SCRIPTS.length });

        /**
         * Загрузить один скрипт. Возвращает Promise, который ВСЕГДА резолвится.
         */
        function loadOne(url, timeoutMs = 15000) {
            return new Promise((resolve) => {
                const filename = url.split('/').pop();
                const s = document.createElement('script');
                s.src = url;
                s.async = false;
                s.crossOrigin = 'anonymous';
                let resolved = false;
                const onFinish = (status, err) => {
                    if (resolved) return;
                    resolved = true;
                    const elapsed = Date.now() - startedAt;
                    if (status === 'Loaded') {
                        log(`Script OK: ${filename} [+${elapsed}ms]`);
                    } else {
                        logErr(`Script ${status}: ${filename} [+${elapsed}ms]`, err || '');
                    }
                    debug.events.push({ t: elapsed, type: 'script-' + status.toLowerCase(), file: filename });
                    resolve({ url, status });
                };
                s.onload = () => onFinish('Loaded');
                s.onerror = (e) => onFinish('Failed', e);
                // Watchdog timeout
                setTimeout(() => onFinish('Timeout'), timeoutMs);
                try {
                    document.head.appendChild(s);
                } catch (appendErr) {
                    logErr('appendChild failed for', filename, appendErr);
                    onFinish('Failed', appendErr);
                }
            });
        }

        /**
         * Sequential загрузка с watchdog-таймаутом.
         */
        async function loadAll() {
            log('==== loadAll() STARTED ====');
            debug.events.push({ t: Date.now() - startedAt, type: 'loadAll-start' });
            let failed = 0;
            let timedOut = 0;
            for (let i = 0; i < V2_SCRIPTS.length; i++) {
                const url = V2_SCRIPTS[i];
                const filename = url.split('/').pop();
                log(`Loading [${i + 1}/${V2_SCRIPTS.length}] ${filename}`);
                try {
                    const result = await loadOne(url);
                    if (result.status === 'Failed') {
                        failed++;
                        logErr(`❌ FAILED: ${filename}`);
                    }
                    if (result.status === 'Timeout') {
                        timedOut++;
                        logErr(`⏱ TIMEOUT: ${filename}`);
                    }
                } catch (e) {
                    logErr(`EXCEPTION in loadOne for ${filename}:`, e);
                    failed++;
                }
            }
            log(`==== loadAll() DONE. total=${V2_SCRIPTS.length} failed=${failed} timedOut=${timedOut} ====`);
            debug.events.push({
                t: Date.now() - startedAt,
                type: 'loadAll-done',
                failed, timedOut
            });
            return { total: V2_SCRIPTS.length, failed, timedOut };
        }

        function dispatchReady() {
            const t = Date.now() - startedAt;
            log(`==== dispatchReady() at +${t}ms ====`);
            debug.events.push({ t, type: 'dispatch-ready' });
            try {
                window.__PAYD_V2_READY__ = true;
                window.dispatchEvent(new CustomEvent('payd-v2-ready'));
                log('✅ payd-v2-ready event dispatched');
                debug.events.push({ t: Date.now() - startedAt, type: 'event-dispatched' });
            } catch (e) {
                logErr('dispatchReady failed:', e);
                debug.events.push({ t: Date.now() - startedAt, type: 'dispatch-failed', error: String(e) });
            }
        }

        // ============================================================
        // Main boot
        // ============================================================
        log('==== BOOT STARTED ====');
        debug.events.push({ t: Date.now() - startedAt, type: 'boot-start' });

        (async function boot() {
            try {
                log(`Loading ${V2_SCRIPTS.length} scripts sequentially…`);
                const result = await loadAll();
                log('loadAll() returned:', result);
                debug.events.push({
                    t: Date.now() - startedAt,
                    type: 'after-loadAll',
                    result
                });

                // Маленькая задержка, чтобы последний IIFE успел дорегистрировать класс
                log('Scheduling dispatchReady in 100ms…');
                setTimeout(dispatchReady, 100);

                // Watchdog: если через 5 секунд после loadAll ready event не был
                // обработан render.js, всё равно диспатчим принудительно
                setTimeout(() => {
                    if (!window.__PAYD_V2_READY__) {
                        logErr('WATCHDOG: __PAYD_V2_READY__ not set after 5s, forcing dispatch');
                        dispatchReady();
                    } else {
                        log('WATCHDOG OK: __PAYD_V2_READY__ already set');
                    }
                }, 5000);

                log('==== BOOT ASYNC SEQUENCE COMPLETE ====');
                debug.events.push({ t: Date.now() - startedAt, type: 'boot-async-complete' });
            } catch (e) {
                logErr('Boot failed with exception:', e);
                logErr('Stack:', e && e.stack);
                debug.events.push({
                    t: Date.now() - startedAt,
                    type: 'boot-failed',
                    error: String(e),
                    stack: e && e.stack
                });
                // Попытка всё равно диспатчить, чтобы UI попытался отрисоваться
                setTimeout(dispatchReady, 500);
            }
        })();

    } catch (outerErr) {
        logErr('OUTER EXCEPTION in bundle IIFE:', outerErr);
        logErr('Stack:', outerErr && outerErr.stack);
        // Сохраняем ошибку в window для отладки
        if (window.__PAYD_V2_DEBUG__) {
            window.__PAYD_V2_DEBUG__.outerError = {
                message: String(outerErr),
                stack: outerErr && outerErr.stack,
                t: Date.now() - startedAt
            };
        }
    }

})();
