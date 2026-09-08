/* =================================================================
   PAYD Intelligence — Pre-Bundle Data Preloader (NON-BLOCKING v1)
   -----------------------------------------------------------------
   Цель: загрузить projects.json + score_history.json + projects_enriched.json
   ДО того, как загрузится основной бандл скриптов. Сохранить в sessionStorage.

   Когда бандл загрузится — он найдёт готовые данные и использует их немедленно.
   Если бандл не загрузится (или загрузится с битым скриптом) — данные
   всё равно будут доступны через window.PAYD_INTEL_CACHED_DATA.

   Все запросы имеют таймаут 4 секунды, чтобы не блокировать страницу.
   ================================================================= */

(function () {
    'use strict';

    const TAG = '[PAYD-DataPreloader]';
    const start = Date.now();
    const log = (m) => console.log(`${TAG} [+${Date.now() - start}ms] ${m}`);

    log('Preloader started');

    // Утилита fetch с таймаутом
    function fetchWithTimeout(url, ms = 4000) {
        const c = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        const t = setTimeout(() => { if (c) c.abort(); }, ms);
        return fetch(url, c ? { cache: 'no-store', signal: c.signal } : { cache: 'no-store' })
            .finally(() => clearTimeout(t))
            .then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json();
            });
    }

    // Кэш в sessionStorage — мгновенный доступ при следующей загрузке
    function cacheGet(key) {
        try {
            const raw = sessionStorage.getItem('payd_pre_' + key);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            // Проверяем что кэш не старше 10 минут
            if (Date.now() - (parsed._cachedAt || 0) > 10 * 60 * 1000) return null;
            return parsed.data;
        } catch (_) { return null; }
    }
    function cacheSet(key, data) {
        try {
            sessionStorage.setItem('payd_pre_' + key, JSON.stringify({
                _cachedAt: Date.now(),
                data: data,
            }));
        } catch (_) {}
    }

    // Создаём CACHED_DATA до загрузки — чтобы render мог использовать его немедленно
    const EMPTY_PROJECTS = { last_updated: new Date().toISOString(), projects: {}, _fallback: true, _preloader: true, _canonical: true };
    const EMPTY_OVERVIEW = {
        last_updated: new Date().toISOString(),
        next_run_at: new Date().toISOString(),
        market_overview: { total_market_cap_usd: null, total_tvl_usd: null, market_cap_change_24h: null, fear_greed_index: 50, fear_greed_label: 'Neutral' },
        totals: { projects_tracked: 0, tracked_change_7d: 0 },
        ai_score_average: { global: null, change_7d: 0, based_on: 0 },
        weekly_reports_count: 0,
        weekly_opportunities: { count: 0, top_sector: '—', highlighted: [] },
        biggest_risks_7d: [],
        upcoming_unlocks_7d: [],
        latest_research: [],
        weekly_updates: [],
        _fallback: true,
        _preloader: true,
    };

    window.PAYD_INTEL_CACHED_DATA = {
        projects: cacheGet('projects') || EMPTY_PROJECTS,
        overview: cacheGet('overview') || EMPTY_OVERVIEW,
        canonical: { projects: new Map(), list: [], sectorIndex: {}, stats: null, _preloader: true, _ready: false },
        depin: { last_updated: new Date().toISOString(), sector: 'DePIN', total_projects: 0, projects: [] },
        aiInfra: { last_updated: new Date().toISOString(), categories: {} },
        _preloaded: false,
    };

    log('Empty cached data structure created (canonical-ready)');

    // Нормализация секторов: V1/V2 renderer ожидают формат "Layer 1", "DePIN"
    // а projects.json хранит в lowercase ('layer1', 'depin').
    const SECTOR_NORMALIZE = {
        'layer1':         'Layer 1',
        'layer2':         'Layer 2',
        'l1':             'Layer 1',
        'l2':             'Layer 2',
        'depin':          'DePIN',
        'defi':           'DeFi',
        'rwa':            'RWA',
        'ai':             'AI Infrastructure',
        'gaming':         'Gaming',
        'infrastructure': 'Infrastructure',
        'desci':          'DeSci',
        'zk':             'ZK',
    };
    function normalizeSector(s) {
        if (!s) return '';
        const key = String(s).toLowerCase().trim();
        return SECTOR_NORMALIZE[key] || (key.charAt(0).toUpperCase() + key.slice(1));
    }

    // Параллельная загрузка всех 3 источников данных
    Promise.allSettled([
        fetchWithTimeout('/data/projects.json', 4000).then(d => {
            // projects.json имеет структуру { projects: [...] } — разворачиваем в массив
            const arr = Array.isArray(d) ? d : (d && Array.isArray(d.projects) ? d.projects : null);
            if (arr && arr.length > 0) {
                cacheSet('projects', arr);
                return arr;
            }
            log('projects.json: unexpected structure (no array found)');
            return null;
        }).catch(e => { log('projects.json failed:', e.message); return null; }),
        fetchWithTimeout('/data/score_history.json', 3000).then(d => { cacheSet('scores', d); return d; }).catch(e => { log('score_history.json failed:', e.message); return null; }),
        fetchWithTimeout('/data/projects_enriched.json', 3000).then(d => { cacheSet('enriched', d); return d; }).catch(e => { log('projects_enriched.json failed:', e.message); return null; }),
    ]).then(([projectsRes, scoresRes, enrichedRes]) => {
        const projects = projectsRes.status === 'fulfilled' ? projectsRes.value : null;
        const enriched = enrichedRes.status === 'fulfilled' ? enrichedRes.value : null;

        // ===============================================================
        // CANONICAL RUNTIME: ОДИН источник правды для всех секторов
        // Используем projects_enriched.json (canonical, 354 records)
        // ===============================================================
        let canonicalRuntime = null;
        if (enriched && Array.isArray(enriched.projects) && enriched.projects.length > 0) {
            if (window.PAYD_INTEL && window.PAYD_INTEL.Canonical && typeof window.PAYD_INTEL.Canonical.build === 'function') {
                canonicalRuntime = window.PAYD_INTEL.Canonical.build(enriched.projects);
                log(`✓ Canonical runtime built from projects_enriched.json: ${canonicalRuntime.stats.total} assets`);
            } else {
                log('⚠ Canonical normalizer not loaded yet, will build on demand');
            }
        }

        if (projects && Array.isArray(projects) && projects.length > 0) {
            log(`✓ projects.json: ${projects.length} projects (used for V1 fallback only)`);

            // Строим минимальный projects dict с тикерами — для V1 fallback
            // ВАЖНО: это НЕ источник правды. Canonical runtime — выше.
            const projectsDict = {};
            const enrichedMap = new Map();
            if (enriched && Array.isArray(enriched.projects)) {
                enriched.projects.forEach(rec => {
                    if (rec && rec.id) enrichedMap.set(rec.id, rec);
                });
            } else if (enriched && typeof enriched === 'object') {
                Object.entries(enriched).forEach(([id, rec]) => {
                    if (rec && typeof rec === 'object' && !Array.isArray(rec)) {
                        enrichedMap.set(rec.id || id, rec);
                    }
                });
            }
            projects.forEach(p => {
                if (!p || !p.symbol) return;
                const tk = p.symbol.toUpperCase();
                if (projectsDict[tk]) return; // первый попавшийся
                const enr = enrichedMap.get(p.id) || {};
                projectsDict[tk] = {
                    id: p.id,
                    ticker: tk,
                    name: p.name || tk,
                    logo: '◆',
                    sector: normalizeSector(p.sector),
                    description: p.description || enr.description || '',
                    ai_score: enr.ai?.payd_score || null,
                    risk_score: enr.ai?.risk_score || null,
                    investment_rating: null,
                    metrics: {
                        market_cap_usd: enr.market?.market_cap_usd || null,
                        tvl_usd: enr.protocol?.tvl_usd || null,
                        price_usd: enr.market?.price_usd || null,
                    },
                    github: { stars: enr.github?.stars ?? null },
                    _v2_source: p,
                };
            });

            // Считаем базовую статистику для overview
            const sectorsCount = {};
            const depinProjects = [];
            let totalMarketCap = 0, withMarket = 0, totalTVL = 0, withTVL = 0;
            let totalScore = 0, scoredCount = 0;
            projects.forEach(p => {
                const secNorm = normalizeSector(p.sector);
                sectorsCount[secNorm] = (sectorsCount[secNorm] || 0) + 1;
                const enr = enrichedMap.get(p.id);
                if (enr?.market?.market_cap_usd) { totalMarketCap += enr.market.market_cap_usd; withMarket++; }
                if (enr?.protocol?.tvl_usd) { totalTVL += enr.protocol.tvl_usd; withTVL++; }
                if (enr?.ai?.payd_score != null) { totalScore += enr.ai.payd_score; scoredCount++; }
                // Собираем DePIN-проекты для секции DePIN Intelligence
                if (secNorm === 'DePIN') {
                    depinProjects.push(projectsDict[p.symbol.toUpperCase()]);
                }
            });

            const topSectors = Object.entries(sectorsCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s]) => s);
            const overviewData = {
                last_updated: new Date().toISOString(),
                next_run_at: new Date().toISOString(),
                market_overview: {
                    total_market_cap_usd: withMarket > 0 ? totalMarketCap : null,
                    total_tvl_usd: withTVL > 0 ? totalTVL : null,
                    market_cap_change_24h: null,
                    projects_with_market: withMarket,
                    projects_with_tvl: withTVL,
                    fear_greed_index: 50,
                    fear_greed_label: 'Neutral',
                },
                totals: {
                    projects_tracked: projects.length,
                    tracked_change_7d: 0,
                },
                ai_score_average: {
                    global: scoredCount > 0 ? Math.round((totalScore / scoredCount) * 10) / 10 : null,
                    change_7d: 0,
                    based_on: scoredCount,
                },
                weekly_reports_count: 0,
                weekly_opportunities: {
                    count: 0,
                    top_sector: topSectors[0] ? (topSectors[0].charAt(0).toUpperCase() + topSectors[0].slice(1)) : '—',
                    highlighted: [],
                },
                biggest_risks_7d: [],
                upcoming_unlocks_7d: [],
                latest_research: [],
                weekly_updates: [],
                _sector_breakdown: sectorsCount,
            };
            cacheSet('overview', overviewData);

            window.PAYD_INTEL_CACHED_DATA = {
                projects: { last_updated: new Date().toISOString(), projects: projectsDict, _preloader: true, _from_preloader: true },
                overview: overviewData,
                // CANONICAL RUNTIME — единственный источник правды для всех секторов
                canonical: canonicalRuntime
                    ? { ...canonicalRuntime, _preloader: true, _ready: true }
                    : { projects: new Map(), list: [], sectorIndex: {}, stats: null, _preloader: true, _ready: false, _deferred: true },
                depin: {
                    last_updated: new Date().toISOString(),
                    sector: 'DePIN',
                    total_projects: depinProjects.length,
                    projects: depinProjects,
                    _from_preloader: true,
                },
                aiInfra: { last_updated: new Date().toISOString(), categories: {} },
                _preloaded: true,
            };
            log(`✓ Cached data ready: ${Object.keys(projectsDict).length} projects, ${depinProjects.length} DePIN, ${withMarket} with market, ${scoredCount} scored`);
            log(`✓ Sectors: ${Object.entries(sectorsCount).map(([k,v]) => `${k}=${v}`).join(', ')}`);
            // FIX race-condition: уведомляем UI о том, что preloader отдал данные.
            // main.js подписан на это событие и сможет запустить _initFromPreloader()
            // даже если раньше пытался и данных не было.
            try {
                window.dispatchEvent(new CustomEvent('payd:preloader-ready', {
                    detail: {
                        projects: Object.keys(projectsDict).length,
                        canonical_total: canonicalRuntime ? canonicalRuntime.stats.total : 0,
                        depin: depinProjects.length,
                        sectors: sectorsCount,
                        ts: Date.now(),
                    }
                }));
            } catch (e) { /* CustomEvent unsupported */ }
        } else {
            log('No projects loaded from network — keeping empty fallback');
            // FIX race-condition: даже при ошибке отправляем событие,
            // чтобы main.js знал, что preloader отработал (с пустым результатом)
            try {
                window.dispatchEvent(new CustomEvent('payd:preloader-ready', {
                    detail: { projects: 0, canonical_total: 0, depin: 0, error: 'no_projects', ts: Date.now() }
                }));
            } catch (e) { /* CustomEvent unsupported */ }
        }
    }).catch(err => {
        log('Preload error:', err.message);
        // FIX race-condition: при ошибке сети тоже уведомляем, чтобы main.js
        // не висел в ожидании бесконечно.
        try {
            window.dispatchEvent(new CustomEvent('payd:preloader-ready', {
                detail: { projects: 0, depin: 0, error: err.message, ts: Date.now() }
            }));
        } catch (e) { /* CustomEvent unsupported */ }
    });
})();
