/* =================================================================
   PAYD Intelligence V2 — Render Layer
   -----------------------------------------------------------------
   • Слой представления (View). НЕ знает о БД, провайдере, JSON.
   • Получает данные ТОЛЬКО через сервисы Application Layer:
       - ProjectService
       - DiscoveryService
   • Все DOM-id и CSS-классы имеют префикс .payd-v2- для изоляции
     от основной структуры сайта (zero regression).
   • Активируется по событию 'payd-v2-ready', которое диспатчит
     intelligence-v2-bundle.js после загрузки всех V2-скриптов.
   ================================================================= */

(function (global) {
    'use strict';

    // -------------------------------------------------------------
    // Внутреннее состояние слоя рендеринга
    // -------------------------------------------------------------
    const State = {
        initialized: false,
        projectService: null,     // ProjectService (Application Layer)
        discoveryService: null,   // DiscoveryService (Application Layer)
        dataProvider: null,       // IDataProvider (нужен только для отображения имени)
        currentFilter: 'all',
        currentProjects: [],
    };

    // -------------------------------------------------------------
    // Утилиты
    // -------------------------------------------------------------
    const StatusLabels = {
        emerging:  { emoji: '🌱', label: 'Emerging' },
        watchlist: { emoji: '👁',  label: 'Watchlist' },
        core:      { emoji: '⭐', label: 'Core' },
        archive:   { emoji: '📦', label: 'Archive' },
    };

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatDate(ts) {
        if (!ts) return '—';
        const d = new Date(ts);
        if (isNaN(d.getTime())) return '—';
        return d.toISOString().split('T')[0];
    }

    function formatScore(value) {
        if (value === null || value === undefined) return '—';
        return Number(value).toFixed(1);
    }

    // -------------------------------------------------------------
    // Verification policy: Invalid Project Handling v1.0
    // -------------------------------------------------------------
    // Проект считается валидным для публичного отображения ТОЛЬКО если:
    //  - verifiedStatus === 'verified' (или verified_status для обратной совместимости)
    //  - есть coingeckoId (или cmcId)
    //  - lastVerifiedAt в пределах 30 дней
    // Никаких плейсхолдеров ошибок в UI — просто фильтруем.
    // -------------------------------------------------------------
    const VERIFICATION_MAX_AGE_MS = 60 * 24 * 60 * 60 * 1000; // 60 дней (FIX 2026-09-01)

    // FieldUtils: нормализация доступа к полям (camelCase ↔ snake_case)
    const FieldUtils = (global.PAYD_INTEL && global.PAYD_INTEL.FieldUtils) || null;

    function _readField(project, name) {
        if (FieldUtils && typeof FieldUtils.getField === 'function') {
            return FieldUtils.getField(project, name, project && project.metadata);
        }
        // Fallback: ручная проверка обоих вариантов
        if (!project) return undefined;
        const meta = project.metadata;
        if (project[name] !== undefined && project[name] !== null) return project[name];
        // Попытка альтернативного варианта
        const snake = name.replace(/([A-Z])/g, '_$1').toLowerCase();
        if (project[snake] !== undefined && project[snake] !== null) return project[snake];
        if (meta) {
            if (meta[name] !== undefined && meta[name] !== null) return meta[name];
            if (meta[snake] !== undefined && meta[snake] !== null) return meta[snake];
        }
        return undefined;
    }

    function isProjectVerified(project, nowMs = Date.now()) {
        if (!project) return false;

        // Preloader fallback: проекты, пришедшие из /data/projects.json через preloader,
        // уже отфильтрованы на сервере (это "источник правды") — НЕ дропаем их по verification
        if (project._v2_source || project._isPreloaderFallback) {
            return true;
        }

        // 1. Проверка статуса (поддерживает оба формата: verifiedStatus / verified_status)
        const status = _readField(project, 'verifiedStatus');
        if (status !== 'verified') return false;

        // 2. Должен быть хотя бы один из coin-id (coingeckoId / coingecko_id)
        const cgId  = _readField(project, 'coingeckoId');
        const cmcId = _readField(project, 'cmcId');
        if (!cgId && !cmcId) return false;

        // 3. Stale-data guard (lastVerifiedAt / last_verified_at)
        const lastVerified = _readField(project, 'lastVerifiedAt');
        if (lastVerified) {
            const lv = new Date(lastVerified).getTime();
            if (!isNaN(lv) && (nowMs - lv) > VERIFICATION_MAX_AGE_MS) return false;
        }
        return true;
    }

    function filterVerified(projects) {
        if (!Array.isArray(projects)) return [];
        return projects.filter(p => isProjectVerified(p));
    }

    function setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    function showResult(content) {
        const el = document.getElementById('payd-v2-actions-result');
        if (!el) return;
        el.textContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
        el.classList.add('payd-v2-show');
    }

    // -------------------------------------------------------------
    // Boot: подписка на 'payd-v2-ready' + первичная отрисовка
    // -------------------------------------------------------------
    async function boot() {
        // [TRACE-1] Лог вызова initialize/boot
        console.log('%c[PAYD-V2-Render][TRACE-1] initialize() called', 'color: #00ff00; font-weight: bold');
        if (State.initialized) {
            console.warn('[PAYD-V2-Render] Already initialized, skipping boot');
            return;
        }
        const PAID = global.PAYD_INTEL || {};
        const preloaderData = global.PAYD_INTEL_CACHED_DATA;

        // [TRACE-2] Лог полученных зависимостей
        console.log('%c[PAYD-V2-Render][TRACE-2] Deps received:', 'color: #00ff00; font-weight: bold', {
            ProjectService:                !!PAID.ProjectService,
            DiscoveryService:             !!PAID.DiscoveryService,
            DataProviderFactory:          !!PAID.DataProviderFactory,
            DiscoveryEngineV2:            !!PAID.DiscoveryEngineV2,
            DiscoveryServiceApplication:  !!PAID.DiscoveryServiceApplication,
            ProjectRepository:            !!PAID.ProjectRepository,
            ScoreRepository:              !!PAID.ScoreRepository,
            DiscoveryRepository:          !!PAID.DiscoveryRepository,
            FieldUtils:                    !!global.PAYD_INTEL && !!global.PAYD_INTEL.FieldUtils,
            CachedData_present:           !!preloaderData,
            CachedData_preloaded:         !!(preloaderData && preloaderData._preloaded),
            CachedData_projects_count:     (preloaderData && preloaderData.projects && preloaderData.projects.projects)
                ? Object.keys(preloaderData.projects.projects).length
                : 0,
        });

        console.log('[PAYD-V2-Render] boot() started. Available:', {
            ProjectService: !!PAID.ProjectService,
            DiscoveryService: !!PAID.DiscoveryService,
            DataProviderFactory: !!PAID.DataProviderFactory,
            DiscoveryEngineV2: !!PAID.DiscoveryEngineV2,
            DiscoveryServiceApplication: !!PAID.DiscoveryServiceApplication,
            CachedData: !!(global.PAYD_INTEL_CACHED_DATA && global.PAYD_INTEL_CACHED_DATA._preloaded),
        });

        // FALLBACK #1: используем preloader data если сервисы не загрузились.
        // Это даёт пользователю увидеть проекты сразу, даже если V2 bundle
        // не смог полноценно инициализироваться.
        if ((!PAID.ProjectService || !PAID.DataProviderFactory) &&
            preloaderData && preloaderData._preloaded &&
            preloaderData.projects && preloaderData.projects.projects) {
            const projectCount = Object.keys(preloaderData.projects.projects).length;
            console.warn(`[PAYD-V2-Render] Services not available, using preloader fallback (${projectCount} projects)`);
            State.dataProvider = { name: 'PreloaderFallback', type: 'cache' };
            State.projectService = createPreloaderService(preloaderData);
            State.initialized = true;
            try {
                await renderAll();
                attachEventHandlers();
            } catch (e) {
                console.error('[PAYD-V2-Render] Preloader render failed:', e);
            }
            // Пытаемся дождаться сервисов в фоне — если загрузятся, обновим UI
            waitForServicesAndRerender();
            return;
        }

        if (!PAID.ProjectService || !PAID.DataProviderFactory) {
            console.error('[PAYD-V2-Render] Critical services not available');
            return;
        }

        try {
            // 1. Получаем активный провайдер (нужен ТОЛЬКО для отображения его имени в шапке)
            console.log('[PAYD-V2-Render] Step 1: creating data provider...');
            State.dataProvider = await PAID.DataProviderFactory.create();
            console.log('[PAYD-V2-Render] Step 1 OK. Provider:', State.dataProvider.name);

            // 2. Получаем репозитории
            console.log('[PAYD-V2-Render] Step 2: creating repositories...');
            const projectRepo = new PAID.ProjectRepository(State.dataProvider);
            const scoreRepo   = new PAID.ScoreRepository(State.dataProvider);
            const discoveryRepo = new PAID.DiscoveryRepository(State.dataProvider);
            console.log('[PAYD-V2-Render] Step 2 OK.');

            // 3. Создаём сервисы Application Layer (вся работа идёт через них)
            console.log('[PAYD-V2-Render] Step 3: creating application services...');
            State.projectService = new PAID.ProjectService({
                projectRepository: projectRepo,
                scoreRepository: scoreRepo,
                discoveryRepository: discoveryRepo,
            });

            // [TRACE-3] Лог созданных сервисов
            console.log('%c[PAYD-V2-Render][TRACE-3] Services wired:', 'color: #00ff00; font-weight: bold', {
                projectService_methods:   State.projectService ? Object.keys(State.projectService) : null,
                dataProvider_name:        State.dataProvider ? State.dataProvider.name : null,
                dataProvider_type:        State.dataProvider ? State.dataProvider.type : null,
            });

            // DiscoveryEngineV2 — модуль скоринга/discovery
            const DiscoveryEngineV2 = PAID.DiscoveryEngineV2;
            const engineInstance = DiscoveryEngineV2
                ? new DiscoveryEngineV2({
                      projectRepository: projectRepo,
                      scoreRepository: scoreRepo,
                      discoveryRepository: discoveryRepo,
                  })
                : null;

            // DiscoveryServiceApplication опционален — если не загружен, продолжаем
            if (PAID.DiscoveryServiceApplication) {
                State.discoveryService = new PAID.DiscoveryServiceApplication({
                    discoveryRepository: discoveryRepo,
                    projectRepository: projectRepo,
                    scoreRepository: scoreRepo,
                    engine: engineInstance,
                });
            } else {
                console.warn('[PAYD-V2-Render] DiscoveryServiceApplication not available, skipping');
            }
            console.log('[PAYD-V2-Render] Step 3 OK.');

            State.initialized = true;
            console.log('[PAYD-V2-Render] Services wired. Starting render...');

            // 4. Первичный рендеринг
            await renderAll();
            attachEventHandlers();
            console.log('[PAYD-V2-Render] boot() complete.');
        } catch (e) {
            // INVALID PROJECT HANDLING v1.0: ошибки НЕ показываем пользователю.
            console.error('[PAYD-V2-Render] Boot error:', e);
        }
    }

    /**
     * Создаёт минимальный stub-сервис, который читает данные из preloader'а.
     * Это даёт UI доступ к проектам даже если V2 bundle не загрузился.
     */
    function createPreloaderService(preloaderData) {
        const allProjects = preloaderData && preloaderData.projects && preloaderData.projects.projects
            ? Object.values(preloaderData.projects.projects)
            : [];
        // [TRACE-4] Лог создания fallback-сервиса
        console.log('%c[PAYD-V2-Render][TRACE-4] createPreloaderService()', 'color: #ffaa00; font-weight: bold', {
            preloaderData_present:           !!preloaderData,
            preloaderData_projects_present:  !!(preloaderData && preloaderData.projects),
            preloaderData_projects_array:    !!(preloaderData && preloaderData.projects && preloaderData.projects.projects),
            totalProjectsLoaded:              allProjects.length,
            firstProjectSample:               allProjects[0] || null,
        });
        return {
            getAllProjects: async () => allProjects,
            getProject: async (id) => allProjects.find(p => p.id === id || p.ticker === id) || null,
            getProjectsByStatus: async (status) => allProjects.filter(p => p.status === status),
            searchProjects: async (criteria) => {
                let out = allProjects;
                if (criteria.status) out = out.filter(p => p.status === criteria.status);
                if (criteria.sector) out = out.filter(p => p.sector === criteria.sector);
                return out;
            },
            _isPreloaderFallback: true,
        };
    }

    /**
     * Ждёт появления ProjectService в window.PAYD_INTEL (до 5 секунд)
     * и перерисовывает UI с реальными данными.
     */
    function waitForServicesAndRerender() {
        // [TRACE-5] Лог старта ожидания сервисов
        console.log('%c[PAYD-V2-Render][TRACE-5] waitForServicesAndRerender() started', 'color: #00aaff; font-weight: bold');
        let attempts = 0;
        const maxAttempts = 50; // 50 * 100ms = 5 секунд
        const check = () => {
            attempts++;
            const PAID = global.PAYD_INTEL || {};
            // [TRACE-6] Лог статуса сервисов перед каждым re-render
            console.log(`%c[PAYD-V2-Render][TRACE-6] services check (attempt ${attempts}/${maxAttempts})`, 'color: #00aaff', {
                ProjectService:        !!PAID.ProjectService,
                DataProviderFactory:   !!PAID.DataProviderFactory,
                ProjectRepository:     !!PAID.ProjectRepository,
                ScoreRepository:       !!PAID.ScoreRepository,
                DiscoveryRepository:   !!PAID.DiscoveryRepository,
                ready:                  !!(PAID.ProjectService && PAID.DataProviderFactory && PAID.ProjectRepository),
            });
            if (PAID.ProjectService && PAID.DataProviderFactory && PAID.ProjectRepository) {
                console.log('%c[PAYD-V2-Render] ✅ Services now available — re-initializing with real data', 'color: #00ff00; font-weight: bold');
                State.initialized = false;
                State.projectService = null;
                State.dataProvider = null;
                State.discoveryService = null;
                boot();
                return;
            }
            if (attempts < maxAttempts) {
                setTimeout(check, 100);
            } else {
                console.warn('[PAYD-V2-Render] waitForServicesAndRerender: timeout, services never appeared');
            }
        };
        setTimeout(check, 100);
    }

    // -------------------------------------------------------------
    // renderAll — последовательно отрисовывает все секции
    // -------------------------------------------------------------
    async function renderAll() {
        // [TRACE-7] Лог вызова renderAll
        console.log('%c[PAYD-V2-Render][TRACE-7] renderAll() called', 'color: #aa00ff; font-weight: bold', {
            hasProjectService:    !!State.projectService,
            hasDiscoveryService:  !!State.discoveryService,
            hasDataProvider:      !!State.dataProvider,
            isPreloaderFallback:  !!(State.projectService && State.projectService._isPreloaderFallback),
        });

        // [TRACE-8] Получаем и логируем массив проектов из service
        let projectsFromService = [];
        try {
            if (State.projectService && typeof State.projectService.getAllProjects === 'function') {
                projectsFromService = await State.projectService.getAllProjects();
                console.log('%c[PAYD-V2-Render][TRACE-8] projects from projectService.getAllProjects():', 'color: #aa00ff; font-weight: bold', {
                    isArray:  Array.isArray(projectsFromService),
                    length:    projectsFromService.length,
                    sample:    projectsFromService[0] || null,
                });
            } else {
                console.warn('[PAYD-V2-Render][TRACE-8] projectService.getAllProjects is not a function or projectService is null');
            }
        } catch (e) {
            console.error('[PAYD-V2-Render][TRACE-8] getAllProjects() threw:', e);
        }

        await Promise.all([
            renderArchitectureStatus(),
            renderStats(),
            renderSectors(),
            renderProjects(State.currentFilter),
            renderTimeline(),
        ]);
        console.log('[PAYD-V2-Render] renderAll() complete');
    }

    // -------------------------------------------------------------
    // Architecture status
    // -------------------------------------------------------------
    async function renderArchitectureStatus() {
        const grid = document.getElementById('payd-v2-arch-grid');
        if (!grid) return;

        const providerName = State.dataProvider ? State.dataProvider.name : 'unknown';
        const providerType = State.dataProvider ? State.dataProvider.type : 'unknown';

        // Имя активного провайдера в шапке
        setText('payd-v2-provider-badge', `Provider: ${providerName}`);

        const cards = [
            { title: 'Data Provider',  value: providerName,  status: 'Active' },
            { title: 'Provider Type',  value: providerType,  status: 'OK' },
            { title: 'Frontend',       value: 'payd-v2-render.js', status: 'Isolated' },
            { title: 'Application',    value: 'ProjectService + DiscoveryService', status: 'OK' },
            { title: 'Repository',     value: '7 repositories', status: 'OK' },
            { title: 'IDataProvider',  value: 'interface',   status: 'Stable' },
        ];

        grid.innerHTML = cards.map(c => `
            <div class="payd-v2-arch-card">
                <p class="payd-v2-arch-card-title">${escapeHtml(c.title)}</p>
                <p class="payd-v2-arch-card-value">${escapeHtml(c.value)}</p>
                <span class="payd-v2-arch-card-status">${escapeHtml(c.status)}</span>
            </div>
        `).join('');
    }

    // -------------------------------------------------------------
    // Stats — счётчики проектов по lifecycle-статусам
    // -------------------------------------------------------------
    async function renderStats() {
        console.log('[PAYD-V2-Render][TRACE-12] renderStats() called', {
            hasProjectService: !!State.projectService,
        });
        if (!State.projectService) return;
        try {
            // Stats: считаем только верифицированные проекты
            const all = filterVerified(await State.projectService.getAllProjects());
            console.log('[PAYD-V2-Render][TRACE-12] renderStats projects:', {
                verifiedCount: all.length,
            });
            const counts = { emerging: 0, watchlist: 0, core: 0, archive: 0 };
            for (const p of all) {
                const s = p.status || 'core';
                counts[s] = (counts[s] || 0) + 1;
            }
            setText('payd-v2-stat-total',     String((counts.emerging || 0) + (counts.watchlist || 0) + (counts.core || 0) + (counts.archive || 0)));
            setText('payd-v2-stat-emerging',  String(counts.emerging  || 0));
            setText('payd-v2-stat-watchlist', String(counts.watchlist || 0));
            setText('payd-v2-stat-core',      String(counts.core      || 0));
            setText('payd-v2-stat-archive',   String(counts.archive   || 0));
        } catch (e) {
            console.error('[PAYD-V2-Render] renderStats failed:', e);
        }
    }

    // -------------------------------------------------------------
    // Sectors — coverage по секторам (без max-limit)
    // -------------------------------------------------------------
    async function renderSectors() {
        console.log('[PAYD-V2-Render][TRACE-13] renderSectors() called', {
            hasProjectService: !!State.projectService,
            hasGrid: !!(document.getElementById('payd-v2-sector-grid')),
        });
        const grid = document.getElementById('payd-v2-sector-grid');
        if (!grid || !State.projectService) return;

        try {
            const all = filterVerified(await State.projectService.getAllProjects());
            console.log('[PAYD-V2-Render][TRACE-13] renderSectors projects:', {
                verifiedCount: all.length,
            });
            const groups = {};
            for (const p of all) {
                const s = p.sector || 'Uncategorized';
                if (!groups[s]) groups[s] = { total: 0, byStatus: { emerging: 0, watchlist: 0, core: 0, archive: 0 } };
                groups[s].total += 1;
                const st = p.status || 'core';
                groups[s].byStatus[st] = (groups[s].byStatus[st] || 0) + 1;
            }

            const max = Math.max(1, ...Object.values(groups).map(g => g.total));
            // INVALID PROJECT HANDLING: пустой результат — просто ничего не рендерим.
            grid.innerHTML = Object.entries(groups).map(([sector, g]) => {
                const widthPct = Math.min(100, Math.round((g.total / max) * 100));
                return `
                    <div class="payd-v2-sector-card">
                        <p class="payd-v2-sector-name">${escapeHtml(sector)}</p>
                        <div class="payd-v2-sector-counts">${g.total} projects · ⭐ ${g.byStatus.core} · 👁 ${g.byStatus.watchlist} · 🌱 ${g.byStatus.emerging} · 📦 ${g.byStatus.archive}</div>
                        <div class="payd-v2-sector-bar"><div class="payd-v2-sector-bar-fill" style="width:${widthPct}%;"></div></div>
                        <span class="payd-v2-sector-status payd-v2-status-good">tracked</span>
                    </div>
                `;
            }).join('');
        } catch (e) {
            console.error('[PAYD-V2-Render] renderSectors failed:', e);
        }
    }

    // =============================================================
    // PRIMARY TASK: Рендеринг списка проектов с lifecycle-статусами
    // =============================================================
    async function renderProjects(filter = 'all') {
        // [TRACE-9] Лог вызова renderProjects
        console.log('%c[PAYD-V2-Render][TRACE-9] renderProjects() called with filter:', 'color: #ff00aa; font-weight: bold', {
            filter:               filter,
            hasProjectService:    !!State.projectService,
            hasGetAll:             !!(State.projectService && typeof State.projectService.getAllProjects === 'function'),
            hasGetByStatus:        !!(State.projectService && typeof State.projectService.getProjectsByStatus === 'function'),
            isPreloaderFallback:  !!(State.projectService && State.projectService._isPreloaderFallback),
        });

        const container = document.getElementById('payd-v2-projects');
        if (!container || !State.projectService) {
            console.warn('[PAYD-V2-Render][TRACE-9] renderProjects aborted: missing container or projectService', {
                containerExists: !!container,
                projectServiceExists: !!State.projectService,
            });
            return;
        }

        State.currentFilter = filter;
        container.innerHTML = '<div class="payd-v2-loading">Loading projects…</div>';

        try {
            // Получаем проекты через ProjectService (НЕ напрямую к репозиторию или провайдеру)
            const rawProjects = (filter === 'all')
                ? await State.projectService.getAllProjects()
                : await State.projectService.getProjectsByStatus(filter);

            // [TRACE-10] Лог количества проектов ПЕРЕД фильтрацией verification
            console.log('%c[PAYD-V2-Render][TRACE-10] about to render projects (raw):', 'color: #ff00aa; font-weight: bold', {
                filter:         filter,
                rawCount:       Array.isArray(rawProjects) ? rawProjects.length : 0,
                rawSample:      Array.isArray(rawProjects) && rawProjects.length > 0 ? rawProjects[0] : null,
            });

            // INVALID PROJECT HANDLING policy: рендерим только верифицированные.
            // Проекты со статусом data_unavailable / pending / stale молча отбрасываются.
            const projects = filterVerified(rawProjects);

            // [TRACE-11] Лог после фильтрации verification
            console.log('%c[PAYD-V2-Render][TRACE-11] projects after filterVerified:', 'color: #ff00aa; font-weight: bold', {
                filter:           filter,
                rawCount:          Array.isArray(rawProjects) ? rawProjects.length : 0,
                verifiedCount:    projects.length,
                droppedCount:     (Array.isArray(rawProjects) ? rawProjects.length : 0) - projects.length,
            });

            // Кэшируем для последующих операций (например, при lifecycle-оценке)
            State.currentProjects = projects;

            if (!projects || projects.length === 0) {
                // Никаких "Project not found" / "Missing dataset" — сектор просто пуст.
                console.warn('[PAYD-V2-Render][TRACE-11] No verified projects to render for filter:', filter);
                container.innerHTML = '';
                return;
            }

            // Каждый проект рендерим через createProjectCard().
            // Это держит разметку изолированной и легко тестируемой.
            const html = projects.map(p => createProjectCard(p)).join('');
            console.log('[PAYD-V2-Render][TRACE-11] HTML length generated:', html.length, 'characters');
            container.innerHTML = html;
        } catch (e) {
            // INVALID PROJECT HANDLING: ошибки НЕ показываем пользователю.
            // Логируем в консоль для разработчика и оставляем контейнер пустым.
            console.error('[PAYD-V2-Render] renderProjects failed:', e);
            container.innerHTML = '';
        }
    }

    /**
     * Создаёт HTML-карточку проекта с lifecycle-статусом.
     * @param {Object} project — модель проекта из ProjectService
     * @returns {string} HTML-разметка карточки
     */
    function createProjectCard(project) {
        const status = project.status || 'core';
        const meta = StatusLabels[status] || StatusLabels.core;
        const sector = project.sector || 'Unknown';
        const sub    = project.subsector ? ` · ${project.subsector}` : '';
        const tags = (project.metadata && project.metadata.tags) ? project.metadata.tags : [];

        return `
        <article class="payd-v2-project-card" data-project-id="${escapeHtml(project.id)}">
            <div class="payd-v2-project-header">
                <div>
                    <div class="payd-v2-project-ticker">$${escapeHtml(project.ticker || project.id.toUpperCase())}</div>
                    <p class="payd-v2-project-name">${escapeHtml(project.name || project.id)}</p>
                </div>
                <span class="payd-v2-status-badge payd-v2-status-${escapeHtml(status)}" title="Lifecycle status: ${escapeHtml(meta.label)}">
                    ${meta.emoji} ${escapeHtml(meta.label)}
                </span>
            </div>

            <span class="payd-v2-project-sector">${escapeHtml(sector)}${escapeHtml(sub)}</span>
            <p class="payd-v2-project-description">${escapeHtml(project.description || '')}</p>

            <div class="payd-v2-project-scores">
                <span class="payd-v2-score-chip">Quality <strong>${formatScore(project.quality_score)}</strong></span>
                <span class="payd-v2-score-chip">Discovered <strong>${formatDate(project.discovered_at)}</strong></span>
                ${project.promoted_at ? `<span class="payd-v2-score-chip">Promoted <strong>${formatDate(project.promoted_at)}</strong></span>` : ''}
                ${project.archived_at  ? `<span class="payd-v2-score-chip">Archived <strong>${formatDate(project.archived_at)}</strong></span>`  : ''}
            </div>

            ${tags.length > 0 ? `<div class="payd-v2-project-scores">${tags.slice(0, 4).map(t => `<span class="payd-v2-score-chip">#${escapeHtml(t)}</span>`).join('')}</div>` : ''}
        </article>
        `;
    }

    // -------------------------------------------------------------
    // Timeline — последние lifecycle-события
    // -------------------------------------------------------------
    async function renderTimeline() {
        console.log('[PAYD-V2-Render][TRACE-14] renderTimeline() called', {
            hasDiscoveryService: !!State.discoveryService,
            hasContainer: !!(document.getElementById('payd-v2-timeline')),
        });
        const container = document.getElementById('payd-v2-timeline');
        if (!container || !State.discoveryService) return;

        try {
            const events = await State.discoveryService.getRecentTransitions(60);
            console.log('[PAYD-V2-Render][TRACE-14] renderTimeline events:', {
                eventCount: Array.isArray(events) ? events.length : 0,
            });
            if (!events || events.length === 0) {
                container.innerHTML = '<div class="payd-v2-timeline-empty">No lifecycle events yet. Run "Evaluate lifecycle" to generate transitions.</div>';
                return;
            }

            container.innerHTML = events.slice(0, 30).map(ev => {
                const toClass = ev.to_status === 'archive' ? 'payd-v2-to-archive'
                              : ev.to_status === 'emerging' ? 'payd-v2-to-emerging' : '';
                return `
                <div class="payd-v2-timeline-item">
                    <p class="payd-v2-timeline-from">
                        ${escapeHtml(ev.project_id || 'unknown')}
                        · ${escapeHtml(ev.from_status || '—')}
                        <span class="payd-v2-timeline-arrow">→</span>
                        <span class="payd-v2-timeline-to ${toClass}">${escapeHtml(ev.to_status || '—')}</span>
                    </p>
                    <p class="payd-v2-timeline-reason">${escapeHtml(ev.reason || '—')}</p>
                    <p class="payd-v2-timeline-time">${formatDate(ev.timestamp)}</p>
                </div>
                `;
            }).join('');
        } catch (e) {
            console.error('[PAYD-V2-Render] renderTimeline failed:', e);
        }
    }

    // -------------------------------------------------------------
    // Event handlers — фильтры и кнопки discovery engine
    // -------------------------------------------------------------
    function attachEventHandlers() {
        // Фильтры по lifecycle-статусу
        const filterContainer = document.getElementById('payd-v2-filters');
        if (filterContainer) {
            filterContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('.payd-v2-filter');
                if (!btn) return;
                filterContainer.querySelectorAll('.payd-v2-filter')
                    .forEach(b => b.classList.remove('payd-v2-filter-active'));
                btn.classList.add('payd-v2-filter-active');
                renderProjects(btn.dataset.status || 'all');
            });
        }

        // Кнопка "Запустить discovery cycle"
        const runBtn = document.getElementById('payd-v2-btn-run-discovery');
        if (runBtn && State.discoveryService) {
            runBtn.addEventListener('click', async () => {
                runBtn.disabled = true;
                showResult('Running discovery cycle…');
                try {
                    const result = await State.discoveryService.runDiscoveryCycle();
                    showResult({ ok: true, action: 'discovery_cycle', result });
                    await renderAll();
                } catch (e) {
                    showResult({ ok: false, action: 'discovery_cycle', error: e.message });
                } finally {
                    runBtn.disabled = false;
                }
            });
        }

        // Кнопка "Оценить lifecycle"
        const evalBtn = document.getElementById('payd-v2-btn-evaluate-lifecycle');
        if (evalBtn && State.discoveryService) {
            evalBtn.addEventListener('click', async () => {
                evalBtn.disabled = true;
                showResult('Evaluating lifecycle transitions…');
                try {
                    const result = await State.discoveryService.runLifecycleEvaluation();
                    showResult({ ok: true, action: 'lifecycle_evaluation', ...result });
                    await renderAll();
                } catch (e) {
                    showResult({ ok: false, action: 'lifecycle_evaluation', error: e.message });
                } finally {
                    evalBtn.disabled = false;
                }
            });
        }

        // Кнопка "Обновить"
        const refreshBtn = document.getElementById('payd-v2-btn-refresh');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                refreshBtn.disabled = true;
                try {
                    await renderAll();
                } finally {
                    refreshBtn.disabled = false;
                }
            });
        }
    }

    // -------------------------------------------------------------
    // Публичный API модуля
    // -------------------------------------------------------------
    const Render = {
        boot,
        renderAll,
        renderProjects,
        renderStats,
        renderSectors,
        renderTimeline,
        renderArchitectureStatus,
        getState: () => ({ ...State }),
    };

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.V2Render = Render;

    // -------------------------------------------------------------
    // Автостарт: ждём события 'payd-v2-ready' от orchestrator
    // -------------------------------------------------------------
    if (typeof window !== 'undefined') {
        // Если событие уже произошло (race condition)
        if (window.__PAYD_V2_READY__) {
            boot();
        } else {
            window.addEventListener('payd-v2-ready', boot, { once: true });
        }
    }

})(window);
