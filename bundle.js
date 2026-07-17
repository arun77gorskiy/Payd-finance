/* =================================================================
   PAYD Intelligence V2 — Self-Loading Orchestrator
   Этот файл — ТОЧКА ВХОДА для V2.
   Он:
   1. Сам себя регистрирует через document.currentScript.
   2. Динамически загружает все V2-скрипты параллельно.
   3. НЕ модифицирует index.html или какие-либо существующие файлы.
   4. Активируется ТОЛЬКО на странице intelligence-v2.html.

   Если window.PAYD_INTEL_V2_ENABLED === false — orchestrator отключается.

   Загрузка параллельная: каждый скрипт представляет собой IIFE,
   который только регистрирует свой класс в window.PAYD_INTEL.*.
   Использование классов происходит ПОЗЖЕ, в intelligence-v2-render.js
   (по событию 'payd-v2-ready'), когда все скрипты уже загружены.
   Поэтому порядок выполнения IIFE не важен.
   ================================================================= */

(function () {
    'use strict';

    // Guard: only run on intelligence-v2.html
    const isV2Page = window.location.pathname.endsWith('/intelligence-v2.html')
                   || document.querySelector('#payd-v2-arch-grid') !== null;
    if (!isV2Page) {
        console.log('[PAYD-V2] Not on V2 page, bundle inert.');
        return;
    }

    // Feature flag
    if (window.PAYD_INTEL_V2_ENABLED === false) {
        console.log('[PAYD-V2] Disabled via PAYD_INTEL_V2_ENABLED=false');
        return;
    }

    // Base path for V2 scripts
    const V2_BASE = '/js/intelligence';

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
        `${V2_BASE}/data/providers/DatabaseProvider.js`,

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

        // AUTOMATED INTELLIGENCE UPDATE ENGINE (загружаются ПЕРЕД render для правильных зависимостей)
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

    /**
     * Загрузить один скрипт. Возвращает Promise, который резолвится при onload.
     * Если onload не срабатывает за timeoutMs — резолвим принудительно,
     * чтобы не блокировать последующие скрипты.
     */
    function loadOne(url, timeoutMs = 30000) {
        return new Promise((resolve) => {
            const s = document.createElement('script');
            s.src = url;
            s.async = false;
            s.crossOrigin = 'anonymous';
            let resolved = false;
            const onFinish = (status) => {
                if (resolved) return;
                resolved = true;
                console.log(`[PAYD-V2] ${status}: ${url.split('/').pop()}`);
                resolve({ url, status });
            };
            s.onload = () => onFinish('Loaded');
            s.onerror = () => onFinish('Failed');
            // Watchdog timeout (увеличен с 8s до 30s — иначе длинные скрипты не успевают)
            setTimeout(() => onFinish('Timeout'), timeoutMs);
            document.head.appendChild(s);
        });
    }

    /**
     * Sequential загрузка с watchdog-таймаутом.
     * Скрипты загружаются по одному, чтобы ES6 class extends работал корректно.
     * При таймауте — продолжаем загрузку остальных.
     */
    async function loadAll() {
        let failed = 0;
        let timedOut = 0;
        const startTime = Date.now();
        for (let i = 0; i < V2_SCRIPTS.length; i++) {
            const url = V2_SCRIPTS[i];
            console.log(`[PAYD-V2] Loading [${i + 1}/${V2_SCRIPTS.length}] ${url.split('/').pop()}`);
            const result = await loadOne(url);
            if (result.status === 'Failed') failed++;
            if (result.status === 'Timeout') timedOut++;
        }
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`[PAYD-V2] All ${V2_SCRIPTS.length} scripts processed in ${elapsed}s (failed: ${failed}, timedOut: ${timedOut}).`);
        return { total: V2_SCRIPTS.length, failed, timedOut };
    }

    function dispatchReady() {
        window.__PAYD_V2_READY__ = true;
        window.dispatchEvent(new CustomEvent('payd-v2-ready'));
        console.log('[PAYD-V2] Ready event dispatched.');
    }

    // Main boot
    (async function boot() {
        try {
            console.log(`[PAYD-V2] Loading ${V2_SCRIPTS.length} scripts in parallel…`);
            await loadAll();
            // Маленькая задержка, чтобы последний IIFE успел дорегистрировать класс
            setTimeout(dispatchReady, 100);
        } catch (e) {
            // INVALID PROJECT HANDLING v1.0: ошибки НЕ показываем пользователю.
            // Логируем для разработчика и оставляем UI пустым.
            console.error('[PAYD-V2] Boot failed:', e);
        }
    })();

})();
