/* =================================================================
   PAYD Finance — Intelligence Module Main Entry
   Загружает данные, управляет табами, обрабатывает роутинг.
   Полностью изолирован от основной кодовой базы.
   ================================================================= */

(function() {
    'use strict';

    const TABS = [
        { id: 'dashboard',    label: 'Dashboard',          render: 'renderDashboard',    group: 'core' },
        { id: 'depin',        label: 'DePIN Intelligence', render: 'renderDePIN',        group: 'core' },
        { id: 'ai-infra',     label: 'AI Infrastructure',  render: 'renderAIInfra',     group: 'core' },
        { id: 'watchlist',    label: 'Watchlist',          render: 'renderWatchlist',    group: 'core' },
        { id: 'opportunities',label: 'Opportunity Scanner',render: 'renderOpportunities',group: 'core' },
        { id: 'weekly',       label: 'Weekly Intelligence',render: 'renderWeeklyReports',group: 'core' },
        { id: 'research',     label: 'Research Library',   render: 'renderResearch',     group: 'core' },
    ];

    const SIDEBAR_GROUPS = [
        {
            label: 'Overview',
            items: [
                { id: 'dashboard', label: 'Dashboard', icon: '◆' },
            ],
        },
        {
            label: 'Sectors',
            items: [
                { id: 'depin',     label: 'DePIN Intelligence', icon: '◈' },
                { id: 'ai-infra',  label: 'AI Infrastructure',  icon: '◇' },
            ],
        },
        {
            label: 'AI Categories',
            items: [
                { id: 'l1',     label: 'Layer 1',  icon: '·' },
                { id: 'l2',     label: 'Layer 2',  icon: '·' },
                { id: 'defi',   label: 'DeFi',     icon: '·' },
                { id: 'rwa',    label: 'RWA',      icon: '·' },
                { id: 'gaming', label: 'Gaming',   icon: '·' },
                { id: 'desci',  label: 'DeSci',    icon: '·' },
            ],
        },
        {
            label: 'Tools',
            items: [
                { id: 'opportunities', label: 'Opportunity Scanner', icon: '◎' },
                { id: 'watchlist',     label: 'Watchlist',          icon: '○' },
                { id: 'weekly',        label: 'Weekly Intelligence',icon: '◐' },
                { id: 'research',      label: 'Research Library',   icon: '▤' },
            ],
        },
    ];

    const STATE = {
        activeTab: 'dashboard',
        activeProject: null,
        booted: false,
    };

    /* === Hash-based router === */
    function parseHash() {
        const hash = (location.hash || '').replace(/^#\/?/, '');
        if (!hash) return { tab: 'dashboard' };

        const parts = hash.split('/').map(decodeURIComponent);
        const first = parts[0];

        if (first === 'project' && parts[1]) {
            return { tab: 'project', ticker: parts[1] };
        }
        const validTabs = ['depin', 'ai-infra', 'watchlist', 'opportunities',
                           'weekly', 'dashboard', 'research',
                           'l1', 'l2', 'defi', 'rwa', 'gaming', 'desci'];
        if (validTabs.includes(first)) {
            return { tab: first };
        }
        return { tab: 'dashboard' };
    }

    function buildHash(tab, params) {
        if (tab === 'project' && params && params.ticker) {
            return '#/project/' + encodeURIComponent(params.ticker);
        }
        return '#/' + tab;
    }

    function navigate() {
        const route = parseHash();
        if (route.tab === 'project' && route.ticker) {
            STATE.activeTab = 'project';
            STATE.activeProject = route.ticker;
        } else {
            STATE.activeTab = route.tab;
            STATE.activeProject = null;
        }
        render();
        // Scroll to top of section
        const section = document.getElementById('intelligence');
        if (section) {
            const offset = 80; // nav height
            const top = section.getBoundingClientRect().top + window.pageYOffset - offset;
            window.scrollTo({ top, behavior: 'smooth' });
        }
    }

    window.PAYD_INTEL_ROUTER = {
        go(tab, params) {
            location.hash = buildHash(tab, params);
        },
    };

    /* === Render the section === */
    function render() {
        const root = document.getElementById('intel-tab-content');
        const nav = document.getElementById('intel-sidebar-nav');
        if (!root) return;

        // Render sidebar nav
        if (nav) {
            nav.innerHTML = SIDEBAR_GROUPS.map(group => `
                <div class="intel-sidebar-group">
                    <div class="intel-sidebar-group-label">${group.label}</div>
                    ${group.items.map(item => `
                        <button class="intel-sidebar-link ${STATE.activeTab === item.id ? 'is-active' : ''}" data-tab="${item.id}" type="button">
                            <span class="intel-sidebar-link-icon">${item.icon}</span>
                            <span class="intel-sidebar-link-text">${item.label}</span>
                        </button>
                    `).join('')}
                </div>
            `).join('');

            nav.querySelectorAll('.intel-sidebar-link').forEach(btn => {
                btn.addEventListener('click', () => {
                    window.PAYD_INTEL_ROUTER.go(btn.dataset.tab);
                });
            });
        }

        const R = window.PAYD_INTEL_RENDER;
        try {
            // Categories that share the AI Infrastructure renderer
            const aiCats = ['l1', 'l2', 'defi', 'rwa', 'gaming', 'desci'];
            const isCategory = aiCats.includes(STATE.activeTab);

            if (STATE.activeTab === 'project') {
                R.renderProjectDetail(root, STATE.activeProject);
            } else if (isCategory) {
                R.renderAICategoryView(root, STATE.activeTab);
            } else {
                const tab = TABS.find(t => t.id === STATE.activeTab) || TABS[0];
                R[tab.render](root);
            }
            // После рендера: подключаем вновь добавленные reveal-элементы
            // к локальному observer, чтобы они анимировались при появлении в viewport.
            if (typeof window.PAYD_INTEL_OBSERVE_REVEAL === 'function') {
                // Двойной rAF: гарантируем, что DOM полностью отрендерен
                requestAnimationFrame(() => requestAnimationFrame(window.PAYD_INTEL_OBSERVE_REVEAL));
            }
        } catch (err) {
            console.error('[Intelligence] Render failed:', err);
            R.renderError(root, err);
        }
    }

    /* === Initialize section HTML in the page === */
    function injectSection() {
        // Skip if already injected
        if (document.getElementById('intelligence')) return;

        const section = document.createElement('section');
        section.id = 'intelligence';
        section.className = 'intel-section';
        section.innerHTML = `
            <div class="intel-container">
                <div class="intel-header reveal-on-scroll">
                    <span class="intel-eyebrow">PAYD Intelligence Layer · AI Agent v3.2.1</span>
                    <h1>PAYD Intelligence</h1>
                    <p class="intel-subtitle">Institutional Crypto Research Platform</p>
                    <p class="intel-header-desc">
                        Bloomberg-grade market intelligence updated automatically twice a week.
                        Every metric, score, and insight below is pre-computed by our server-side AI agent
                        — never generated on page load. The same data serves all users.
                    </p>
                </div>

                <div class="intel-layout">
                    <aside class="intel-sidebar reveal-on-scroll" id="intel-sidebar" aria-label="Intelligence navigation">
                        <div class="intel-sidebar-brand">
                            <div class="intel-sidebar-brand-row">
                                <span class="intel-sidebar-brand-dot"></span>
                                <span class="intel-sidebar-brand-text">PAYD Intel</span>
                            </div>
                            <div class="intel-sidebar-brand-meta">Real-time · Agent v3.2.1</div>
                        </div>
                        <nav id="intel-sidebar-nav" class="intel-sidebar-nav" role="navigation"></nav>
                    </aside>

                    <main class="intel-main">
                        <div id="intel-data-source-bar" class="intel-data-source-bar" role="status" aria-label="Verified data sources">
                            <span class="intel-data-source-bar__label">Verified Sources</span>
                            <span class="intel-data-source-bar__provider" data-provider="coingecko" title="Primary market data">CoinGecko</span>
                            <span class="intel-data-source-bar__provider" data-provider="coinmarketcap" title="Fallback market data">CoinMarketCap</span>
                            <span class="intel-data-source-bar__provider" data-provider="defillama" title="DeFi protocol metrics">DefiLlama</span>
                            <span class="intel-data-source-bar__provider" data-provider="tokenunlocks" title="Token unlock calendar">Token Unlocks</span>
                            <span class="intel-data-source-bar__provider" data-provider="github" title="Development activity">GitHub</span>
                            <span class="intel-data-source-bar__provider" data-provider="news" title="Industry news">News</span>
                            <span class="intel-data-source-bar__sync" id="intel-sync-status">
                                <span class="intel-data-source-bar__sync-dot"></span>
                                <span>Live · 6 providers active</span>
                            </span>
                        </div>
                        <div id="intel-tab-content" class="reveal-on-scroll" role="tabpanel" aria-live="polite">
                            <div class="intel-loading">Initializing intelligence feed…</div>
                        </div>
                    </main>
                </div>
            </div>
        `;

        // Insert before the footer (or at the end of body)
        const footer = document.querySelector('footer');
        if (footer && footer.parentNode) {
            footer.parentNode.insertBefore(section, footer);
        } else {
            document.body.appendChild(section);
        }
    }

    /* === Update data-source-bar with provider status === */
    function updateDataSourceBar() {
        const arch = window.PAYD_INTEL && window.PAYD_INTEL.architecture;
        if (!arch) return;
        const providers = document.querySelectorAll('.intel-data-source-bar__provider');
        providers.forEach(el => {
            const name = el.getAttribute('data-provider');
            const svc = arch.services && arch.services[name];
            if (!svc) {
                el.classList.add('intel-data-source-bar__provider--err');
                el.title = name + ': not loaded';
                return;
            }
            el.classList.add('intel-data-source-bar__provider--ok');
            el.title = name + ': active';
            if (!svc.enabled) {
                el.classList.remove('intel-data-source-bar__provider--ok');
                el.classList.add('intel-data-source-bar__provider--warn');
                el.title = name + ': disabled (no API key)';
            }
        });
        const syncStatus = document.getElementById('intel-sync-status');
        if (syncStatus) {
            const activeCount = Array.from(providers).filter(el => el.classList.contains('intel-data-source-bar__provider--ok')).length;
            syncStatus.innerHTML = `<span class="intel-data-source-bar__sync-dot"></span><span>Live · ${activeCount} of 6 providers active</span>`;
        }
    }

    /* === Boot === */
    function boot() {
        if (STATE.booted) return;
        STATE.booted = true;

        injectSection();
        updateDataSourceBar();

        // Show loading state immediately
        const root = document.getElementById('intel-tab-content');
        if (root) root.innerHTML = `<div class="intel-loading">Loading intelligence data from cache…</div>`;

        // Update data-source-bar when architecture is ready (if it loads after)
        window.addEventListener('payd:architecture-ready', updateDataSourceBar);
        if (window.PAYD_INTEL && window.PAYD_INTEL.architecture) {
            updateDataSourceBar();
        }

        // === FIX RACE CONDITION (sector-bug-fix-v3) ===
        // Предыдущая версия использовала проверку `if (root.querySelector('.intel-loading'))`,
        // которая ломалась, если renderAICategoryView уже отрендерил "0 projects" до того,
        // как loaders.projects() заполнил D.projects.projects.
        //
        // Новая версия: event-driven подход.
        //   - payd:preloader-ready → данные готовы в PAYD_INTEL_CACHED_DATA
        //     (но ещё не скопированы в INTEL_DATA.projects)
        //   - payd:data-ready → данные полностью загружены в INTEL_DATA.projects
        //
        // В обоих случаях вызываем navigate() с проверкой, что данные действительно есть.

        let renderInProgress = false;
        let lastRenderKey = '';

        function hasProjects() {
            const d = window.PAYD_INTEL && window.PAYD_INTEL.data;
            if (!d) return 0;
            if (!d.projects) return 0;
            if (!d.projects.projects) return 0;
            return Object.keys(d.projects.projects).length;
        }

        function renderIfReady(source) {
            if (renderInProgress) return;
            const count = hasProjects();
            // Render key — для предотвращения двойного рендера с одинаковым количеством.
            // Но если данные изменились (например, preloader → loaders.projects),
            // render всё равно произойдёт.
            const renderKey = source + ':' + count;
            if (count === 0) {
                // Данных пока нет — ничего не делаем (показываем loading).
                return;
            }
            // Если рендерили с тем же source:count — скипаем.
            if (renderKey === lastRenderKey) return;
            renderInProgress = true;
            lastRenderKey = renderKey;
            console.log('[Intelligence] ✓ Rendering (' + source + '): ' + count + ' projects available');
            try {
                navigate();
            } catch (e) {
                console.error('[Intelligence] Render after data ready failed:', e);
            } finally {
                renderInProgress = false;
            }
        }

        // Когда preloader отдаёт данные — пробуем скопировать их в INTEL_DATA.projects
        // (если data.js уже отработал, но preloader ещё не успел тогда).
        function onPreloaderReady(e) {
            try {
                if (e && e.detail) {
                    console.log('[Intelligence] payd:preloader-ready event:', e.detail);
                }
                // Если в INTEL_DATA ещё нет проектов — пробуем инициализировать из preloader.
                if (hasProjects() === 0 &&
                    window.PAYD_INTEL &&
                    typeof window.PAYD_INTEL._initFromPreloader === 'function') {
                    const ok = window.PAYD_INTEL._initFromPreloader();
                    if (ok) {
                        console.log('[Intelligence] ✓ _initFromPreloader succeeded after preloader event');
                    }
                }
                renderIfReady('preloader');
            } catch (err) {
                console.warn('[Intelligence] onPreloaderReady error:', err);
            }
        }

        // Когда data-loader полностью загрузил данные — рендерим.
        function onDataReady(e) {
            try {
                if (e && e.detail) {
                    console.log('[Intelligence] payd:data-ready event:', e.detail);
                }
                renderIfReady('loader');
            } catch (err) {
                console.warn('[Intelligence] onDataReady error:', err);
            }
        }

        window.addEventListener('payd:preloader-ready', onPreloaderReady);
        window.addEventListener('payd:data-ready', onDataReady);

        // Watchdog: если ни одно событие не пришло за 8 секунд — принудительный рендер.
        // Это страховка от случая, когда preloader/data-loader не публикуют события
        // (например, из-за CustomEvent unsupported в очень старом браузере).
        const watchdog = setTimeout(() => {
            const count = hasProjects();
            if (count > 0) {
                console.log('[Intelligence] Watchdog: data available, rendering');
                renderIfReady('watchdog');
            } else {
                console.warn('[Intelligence] Watchdog: no data after 8s, rendering anyway with fallback');
                try { navigate(); }
                catch (e) {
                    console.error('[Intelligence] Watchdog render failed:', e);
                    if (root) root.innerHTML = `<div class="intel-error">⚠️ Intelligence data unavailable. Please refresh.</div>`;
                }
            }
        }, 8000);

        // === SYNCHRONOUS CHECKS (на случай если данные уже доступны) ===

        // 1) Если INTEL_DATA.projects уже заполнен (preloader отработал до boot)
        //    — рендерим немедленно.
        if (hasProjects() > 0) {
            console.log('[Intelligence] SYNCHRONOUS: data already available, rendering immediately');
            renderIfReady('sync');
            return;
        }

        // 2) Если preloader уже успел заполнить PAYD_INTEL_CACHED_DATA —
        //    копируем через _initFromPreloader() и рендерим.
        try {
            const cached = window.PAYD_INTEL_CACHED_DATA;
            if (cached && cached._preloaded && cached.projects &&
                cached.projects.projects && Object.keys(cached.projects.projects).length > 0) {
                console.log('[Intelligence] SYNCHRONOUS: preloader already loaded, initializing');
                if (window.PAYD_INTEL && typeof window.PAYD_INTEL._initFromPreloader === 'function') {
                    window.PAYD_INTEL._initFromPreloader();
                }
                renderIfReady('sync-preloader');
                // Не возвращаемся — продолжаем запускать load() для обновления данных.
            }
        } catch (e) {
            console.warn('[Intelligence] Sync preloader check failed:', e);
        }

        // 3) Запускаем основную загрузку данных.
        if (!window.PAYD_INTEL || typeof window.PAYD_INTEL.load !== 'function') {
            console.error('[Intelligence] PAYD_INTEL.load not available');
            if (root) {
                root.innerHTML = `<div class="intel-error">⚠️ Intelligence services not loaded. Please refresh the page.</div>`;
            }
            return;
        }

        window.PAYD_INTEL.load()
            .then(() => {
                console.log('[Intelligence] load() promise resolved');
                // onDataReady уже сработает через событие, но дублируем
                // на случай если событие не было отправлено (CustomEvent unsupported).
                renderIfReady('loader-promise');
            })
            .catch(err => {
                console.error('[Intelligence] Load failed:', err);
                const count = hasProjects();
                if (count === 0) {
                    const R = window.PAYD_INTEL_RENDER;
                    if (R) {
                        try { R.renderError(root, err); }
                        catch (e) {
                            if (root) root.innerHTML = `<div class="intel-error">⚠️ Failed to load intelligence: ${err.message}</div>`;
                        }
                    } else {
                        if (root) root.innerHTML = `<div class="intel-error">⚠️ Failed to load intelligence. Please refresh.</div>`;
                    }
                } else {
                    // Данные есть (от preloader), но load() упал — рендерим с тем, что есть.
                    renderIfReady('loader-error-but-cached');
                }
            });

        // Listen for hash changes
        window.addEventListener('hashchange', navigate);
    }

    /* === Auto-boot when DOM is ready === */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    /* === Reveal-on-scroll observer for dynamically rendered content ===
       Глобальный observer в index.html инициализируется ДО рендера Intelligence,
       поэтому он не видит KPI-карточки и прочие элементы, добавленные асинхронно
       после загрузки данных. Этот observer отслеживает их отдельно. */
    (function setupRevealObserver() {
        if (!('IntersectionObserver' in window)) {
            // Fallback: просто показываем все элементы сразу
            document.addEventListener('DOMContentLoaded', () => {
                document.querySelectorAll('#intelligence .reveal-on-scroll')
                    .forEach(el => el.classList.add('visible'));
            });
            return;
        }

        const observer = new IntersectionObserver((entries, obs) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    obs.unobserve(entry.target);
                }
            });
        }, {
            root: null,
            rootMargin: '0px 0px -10% 0px',
            threshold: 0.05,
        });

        // Наблюдаем за элементами при загрузке и после каждого рендера
        function observeAll() {
            document.querySelectorAll('#intelligence .reveal-on-scroll')
                .forEach(el => {
                    if (!el.classList.contains('visible')) {
                        observer.observe(el);
                    }
                });
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', observeAll);
        } else {
            observeAll();
        }

        // Наблюдаем за изменениями DOM внутри #intelligence и подключаем
        // новые reveal-элементы к observer автоматически (для SPA-переходов между табами).
        const section = document.getElementById('intelligence');
        if (section && 'MutationObserver' in window) {
            const mutationObs = new MutationObserver(() => {
                observeAll();
            });
            mutationObs.observe(section, { childList: true, subtree: true });
        }

        // Публикуем глобально, чтобы render-модули могли вызвать после рендера
        window.PAYD_INTEL_OBSERVE_REVEAL = observeAll;
    })();
})();
