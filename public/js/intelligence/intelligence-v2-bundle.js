/* =================================================================
   PAYD Intelligence V2 — Self-Loading Orchestrator (NON-BLOCKING v3)
   Этот файл — ТОЧКА ВХОДА для V2.
   Архитектурные гарантии (после deadlock-фикса):
   1. Скрипты загружаются ПАРАЛЛЕЛЬНО (Promise.allSettled), не последовательно.
   2. Per-script таймаут = 5 секунд (а не 15). Медленные/битые скрипты не блокируют UI.
   3. Общий таймаут всего бандла = 8 секунд. После этого dispatch принудительно.
   4. dispatchReady вызывается ВСЕГДА, даже если 0 скриптов загрузилось.
   5. КРИТИЧЕСКИЕ скрипты (render.js) загружаются отдельно и форсируют ready.
   ================================================================= */

(function () {
    'use strict';

    const TAG = '[PAYD-V2-BUNDLE]';
    const startedAt = Date.now();
    const log = (msg, ...args) => console.log(`${TAG} [+${Date.now() - startedAt}ms] ${msg}`, ...args);
    const logErr = (msg, ...args) => console.error(`${TAG} [+${Date.now() - startedAt}ms] ${msg}`, ...args);

    log('==== BUNDLE IIFE STARTED ====');
    log('location.pathname:', window.location.pathname);
    log('document.readyState:', document.readyState);

    window.__PAYD_V2_DEBUG__ = window.__PAYD_V2_DEBUG__ || {
        bundleStartedAt: startedAt,
        log, logErr,
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

        if (window.PAYD_INTEL_V2_ENABLED === false) {
            log('Disabled via PAYD_INTEL_V2_ENABLED=false');
            return;
        }

        const V2_BASE = '/js/intelligence';
        log('V2_BASE =', V2_BASE);

        // ===============================================================
        // КРИТИЧЕСКИЕ скрипты — загружаются первыми (приоритет).
        // Без них UI не сможет отрендерить ничего полезного.
        // ===============================================================
        const CRITICAL_SCRIPTS = [
            `${V2_BASE}/config/data-provider.config.js`,
            `${V2_BASE}/utils/field-utils.js`,
            // CRITICAL: Canonical normalizer must load BEFORE preloader,
            // чтобы preloader мог сразу построить unified runtime map.
            `${V2_BASE}/canonical-normalizer.js`,
            `${V2_BASE}/data/IDataProvider.js`,
            `${V2_BASE}/data/IMarketDataProvider.js`,
            `${V2_BASE}/data/providers/LocalJsonDataProvider.js`,
            `${V2_BASE}/data/DataProviderFactory.js`,

            // Repositories (нужны для V2 render)
            `${V2_BASE}/data/repository/ProjectRepository.js`,
            `${V2_BASE}/data/repository/ScoreRepository.js`,
            `${V2_BASE}/data/repository/DiscoveryRepository.js`,

            // Application services (нужны для V2 render)
            `${V2_BASE}/application/ProjectService.js`,
            `${V2_BASE}/application/ScoreService.js`,

            // V2 UI (рендерер)
            `${V2_BASE}/intelligence-v2-render.js`,
        ];

        // ===============================================================
        // Остальные скрипты — загружаются параллельно, не критичны для UI.
        // Если какой-то упадёт — мы продолжаем без него.
        // ===============================================================
        const OPTIONAL_SCRIPTS = [
            // Data providers
            `${V2_BASE}/data/providers/ApiDataProvider.js`,

            // Repositories (НЕ в optional — они уже в critical!)
            // ProjectRepository, ScoreRepository, DiscoveryRepository уже загружены в critical.

            // Application services
            `${V2_BASE}/application/DiscoveryService.js`,
            `${V2_BASE}/application/ReportService.js`,
            `${V2_BASE}/application/DashboardService.js`,
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

            // Lifecycle
            `${V2_BASE}/lifecycle/LifecycleLogger.js`,
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

            // Pipeline bootstrap
            `${V2_BASE}/pipeline/PipelineBootstrap.js`,

            // Pipeline UI
            `${V2_BASE}/intelligence-v2-pipeline-ui.js`,

            // Self-Healing Engine (V2.3) — опциональные модули
            `${V2_BASE}/healing/SectorIntegrityChecker.js`,
            `${V2_BASE}/healing/AutoDiscoveryService.js`,
            `${V2_BASE}/healing/SectorClassifier.js`,
            `${V2_BASE}/healing/AutoEnrichmentService.js`,
            `${V2_BASE}/healing/SelfHealingEngine.js`,
        ];

        const ALL_SCRIPTS = [...CRITICAL_SCRIPTS, ...OPTIONAL_SCRIPTS];
        log('V2_SCRIPTS count:', ALL_SCRIPTS.length, '(critical:', CRITICAL_SCRIPTS.length, '/ optional:', OPTIONAL_SCRIPTS.length, ')');
        debug.events.push({ t: Date.now() - startedAt, type: 'scripts-defined', total: ALL_SCRIPTS.length, critical: CRITICAL_SCRIPTS.length });

        /**
         * Загрузить один скрипт с таймаутом. Promise ВСЕГДА резолвится.
         * @param {string} url
         * @param {number} [timeoutMs=5000]
         * @returns {Promise<{url: string, status: 'Loaded'|'Failed'|'Timeout'}>}
         */
        function loadOne(url, timeoutMs = 5000) {
            return new Promise((resolve) => {
                const filename = url.split('/').pop();
                const s = document.createElement('script');
                s.src = url;
                s.async = false; // сохраняем порядок в пределах critical/optional групп
                s.crossOrigin = 'anonymous';
                let resolved = false;
                const onFinish = (status, err) => {
                    if (resolved) return;
                    resolved = true;
                    const elapsed = Date.now() - startedAt;
                    if (status === 'Loaded') {
                        log(`✓ ${filename} [+${elapsed}ms]`);
                    } else {
                        logErr(`✗ ${filename} [${status}] [+${elapsed}ms]`, err || '');
                    }
                    debug.events.push({ t: elapsed, type: 'script-' + status.toLowerCase(), file: filename });
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
        }

        /**
         * Параллельная загрузка группы скриптов.
         * Используем Promise.allSettled — если один падает, остальные продолжают.
         */
        async function loadGroup(scripts, groupLabel) {
            log(`==== loadGroup(${groupLabel}) START — ${scripts.length} scripts ====`);
            const start = Date.now();
            const results = await Promise.allSettled(
                scripts.map(url => loadOne(url, 5000))
            );
            let loaded = 0, failed = 0, timeout = 0;
            results.forEach((r, i) => {
                if (r.status === 'fulfilled') {
                    if (r.value.status === 'Loaded') loaded++;
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

        let dispatchScheduled = false;
        function dispatchReady(reason) {
            if (dispatchScheduled) return;
            dispatchScheduled = true;
            const t = Date.now() - startedAt;
            log(`==== dispatchReady() reason="${reason}" at +${t}ms ====`);
            debug.events.push({ t, type: 'dispatch-ready', reason });
            try {
                window.__PAYD_V2_READY__ = true;
                window.dispatchEvent(new CustomEvent('payd-v2-ready'));
                log('✅ payd-v2-ready event dispatched');
            } catch (e) {
                logErr('dispatchReady failed:', e);
            }
        }

        // ============================================================
        // Main boot
        // ============================================================
        log('==== BOOT STARTED ====');
        debug.events.push({ t: Date.now() - startedAt, type: 'boot-start' });

        // Watchdog #1: жёсткий лимит 8 секунд на ВСЁ.
        // Если за 8 секунд critical скрипты не загрузились — диспатчим всё равно.
        setTimeout(() => {
            if (!window.__PAYD_V2_READY__) {
                logErr('WATCHDOG #1: 8s elapsed without ready, forcing dispatch');
                dispatchReady('watchdog-8s');
            }
        }, 8000);

        // Watchdog #2: страховка 15 секунд — даже если что-то совсем плохо.
        setTimeout(() => {
            if (!window.__PAYD_V2_READY__) {
                logErr('WATCHDOG #2: 15s elapsed, last attempt to dispatch');
                dispatchReady('watchdog-15s');
            }
        }, 15000);

        (async function boot() {
            try {
                // Phase 1: загружаем КРИТИЧЕСКИЕ скрипты (последовательно,
                // потому что они зависят друг от друга — config → field-utils → IDataProvider → ...).
                log(`Phase 1: loading ${CRITICAL_SCRIPTS.length} critical scripts sequentially…`);
                for (let i = 0; i < CRITICAL_SCRIPTS.length; i++) {
                    const r = await loadOne(CRITICAL_SCRIPTS[i], 5000);
                    if (r.status === 'Loaded') {
                        log(`Critical [${i + 1}/${CRITICAL_SCRIPTS.length}] OK: ${CRITICAL_SCRIPTS[i].split('/').pop()}`);
                    } else {
                        logErr(`Critical [${i + 1}/${CRITICAL_SCRIPTS.length}] FAILED: ${CRITICAL_SCRIPTS[i].split('/').pop()} (${r.status})`);
                        // НЕ прерываемся — продолжаем загружать остальные
                    }
                }
                log('==== Phase 1 (critical) COMPLETE ====');
                debug.events.push({ t: Date.now() - startedAt, type: 'phase-1-done' });

                // Если render.js загружен, можем диспатчить ready СЕЙЧАС —
                // даже если optional скрипты ещё грузятся.
                const criticalLoaded = !!window.PAYD_INTEL && !!window.PAYD_INTEL.ProjectRepository;
                if (window.PAYD_INTEL && window.PAYD_INTEL.DataProviderFactory) {
                    log('Critical scripts loaded — dispatching ready event immediately');
                    // Даём 100ms на дорегистрацию классов после IIFE
                    setTimeout(() => dispatchReady('critical-done'), 100);
                }

                // Phase 2: загружаем OPTIONAL скрипты ПАРАЛЛЕЛЬНО.
                // Не блокируем UI. Если какой-то упадёт — ОК.
                log(`Phase 2: loading ${OPTIONAL_SCRIPTS.length} optional scripts in parallel…`);
                // НЕ ждём — fire-and-forget
                loadGroup(OPTIONAL_SCRIPTS, 'optional').then(result => {
                    debug.events.push({ t: Date.now() - startedAt, type: 'phase-2-done', ...result });
                    log('Phase 2 (optional) complete:', result);
                    // Если по какой-то причине ready ещё не диспатчен — диспатчим сейчас
                    if (!window.__PAYD_V2_READY__) {
                        setTimeout(() => dispatchReady('phase-2-done'), 50);
                    }
                }).catch(err => {
                    logErr('Phase 2 unexpected error:', err);
                    if (!window.__PAYD_V2_READY__) {
                        setTimeout(() => dispatchReady('phase-2-error'), 50);
                    }
                });

                log('==== BOOT ASYNC SEQUENCE STARTED ====');
                debug.events.push({ t: Date.now() - startedAt, type: 'boot-async-started' });
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
                setTimeout(() => dispatchReady('boot-exception'), 100);
            }
        })();

    } catch (outerErr) {
        logErr('OUTER EXCEPTION in bundle IIFE:', outerErr);
        logErr('Stack:', outerErr && outerErr.stack);
        if (window.__PAYD_V2_DEBUG__) {
            window.__PAYD_V2_DEBUG__.outerError = {
                message: String(outerErr),
                stack: outerErr && outerErr.stack,
                t: Date.now() - startedAt
            };
        }
        // Крайний случай — попробуем диспатчить ready
        try {
            setTimeout(() => {
                if (!window.__PAYD_V2_READY__) {
                    window.__PAYD_V2_READY__ = true;
                    window.dispatchEvent(new CustomEvent('payd-v2-ready'));
                }
            }, 50);
        } catch (_) {}
    }
})();
