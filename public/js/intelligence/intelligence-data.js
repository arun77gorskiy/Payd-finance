/* =================================================================
   PAYD Finance — Intelligence Data Loader (V2.1 — Enriched Data)
   Загружает данные из V2 источника /data/projects.json + score_history.json
   + projects_enriched.json (live data from CoinGecko, DefiLlama, GitHub)
   и адаптирует их в V1-формат, который ожидает V1 renderer.

   FIX (июль 2026):
   — V1.0: Загрузка 339 проектов через LocalJsonDataProvider.
   — V1.1: Баг-фикс названий секторов ('Layer1' → 'Layer 1').
   — V1.2: Слияние реальных оценок из score_history.json.
   — V2.0: Централизованный FIELD_MAPPING для всех 22 метрик.
   — V2.1: Интеграция live data из projects_enriched.json
           (market data, TVL, GitHub metrics, AI scores, social).
   ================================================================= */

(function () {
    'use strict';

    const DATA_BASE_V2 = '/data/';

    const INTEL_DATA = {
        overview:       null,
        depin:          null,
        aiInfra:        null,
        watchlist:      null,
        opportunities:  null,
        weeklyReports:  null,
        projects:       null,
    };

    const INTEL_LOAD_STATE = {
        loaded: false,
        error:  null,
    };

    /* =================================================================
       ЦЕНТРАЛИЗОВАННЫЙ MAPPING-СЛОЙ
       -----------------------------------------------------------------
       Это ЕДИНСТВЕННОЕ место, где описывается соответствие между
       полями V2 (источник) и V1 (ожидания рендерера).

       Каждая запись содержит:
         - v2Path: путь к полю в V2 объекте (или массив путей для fallback)
         - default: значение по умолчанию, если поле отсутствует в V2
         - format: имя форматтера (для будущего расширения)
         - group: логическая группа (для документации)
       ================================================================= */
    const FIELD_MAPPING = {
        // === Identity (всегда есть в V2) ===
        name:              { v2Path: 'name',                default: '',     group: 'identity' },
        ticker:            { v2Path: 'symbol',              default: '',     group: 'identity' },
        description:       { v2Path: 'description',         default: '',     group: 'identity' },
        sector:            { v2Path: 'sector',              default: '',     group: 'identity' },
        category:          { v2Path: 'sectors',             default: [],    group: 'identity' },
        coingecko_id:      { v2Path: 'coingeckoId',         default: null,  group: 'identity' },
        cmc_id:            { v2Path: 'cmcId',               default: null,  group: 'identity' },
        cmc_slug:          { v2Path: 'cmcSlug',             default: null,  group: 'identity' },
        website:           { v2Path: 'website',             default: null,  group: 'identity' },
        x_handle:          { v2Path: 'xHandle',             default: null,  group: 'identity' },
        github_org:        { v2Path: 'githubOrg',           default: null,  group: 'identity' },
        github_repo:       { v2Path: 'githubRepo',          default: null,  group: 'identity' },
        verified_status:   { v2Path: 'verifiedStatus',      default: 'unverified', group: 'identity' },
        last_verified_at:  { v2Path: 'lastVerifiedAt',      default: null,  group: 'identity' },
        tier:              { v2Path: 'tier',                default: 'tier2', group: 'identity' },

        // === Market data (V2.1: читаем из enriched данных) ===
        price_usd:           { v2Path: 'enriched.market.price_usd',          default: null, group: 'market' },
        market_cap_usd:      { v2Path: 'enriched.market.market_cap_usd',    default: null, group: 'market' },
        fdv_usd:             { v2Path: 'enriched.market.fdv_usd',           default: null, group: 'market' },
        circulating_supply:  { v2Path: 'enriched.market.circulating_supply',default: null, group: 'market' },
        total_supply:        { v2Path: 'enriched.market.total_supply',      default: null, group: 'market' },
        max_supply:          { v2Path: 'enriched.market.max_supply',        default: null, group: 'market' },
        volume_24h_usd:      { v2Path: 'enriched.market.volume_24h_usd',    default: null, group: 'market' },
        change_24h_pct:      { v2Path: 'enriched.market.change_24h_pct',    default: null, group: 'market' },
        change_7d_pct:       { v2Path: 'enriched.market.change_7d_pct',     default: null, group: 'market' },
        change_30d_pct:      { v2Path: 'enriched.market.change_30d_pct',    default: null, group: 'market' },
        ath:                 { v2Path: 'enriched.market.ath',               default: null, group: 'market' },
        ath_change_pct:      { v2Path: 'enriched.market.ath_change_pct',    default: null, group: 'market' },
        atl:                 { v2Path: 'enriched.market.atl',               default: null, group: 'market' },
        market_cap_rank:     { v2Path: 'enriched.market.market_cap_rank',   default: null, group: 'market' },
        tvl_usd:             { v2Path: 'enriched.protocol.tvl_usd',         default: null, group: 'market' },
        liquidity_usd:       { v2Path: null, default: null,  group: 'market' },

        // === Activity (V2.1: из enriched.github) ===
        developer_activity:  { v2Path: 'enriched.github.commits_30d',       default: 0,    group: 'activity' },
        github_activity:     { v2Path: 'enriched.github.commits_30d',       default: 0,    group: 'activity' },

        // === Scores (V2.1: приоритет у enriched.ai) ===
        payd_score:          { v2Path: 'enriched.ai.payd_score',           default: null, group: 'scores' },
        conviction_score:    { v2Path: 'enriched.ai.conviction_score',     default: null, group: 'scores' },
        alpha_score:         { v2Path: 'enriched.ai.alpha_score',          default: null, group: 'scores' },
        risk_score:          { v2Path: 'enriched.ai.risk_score',           default: null, group: 'scores' },
    };

    /**
     * Применяет FIELD_MAPPING к V2 объекту + scoresByProjectId.
     * Возвращает плоский объект с normalized полями.
     *
     * V2.1: enriched данные теперь имеют приоритет над V2 базовыми полями
     * для market data, AI scores, и GitHub метрик.
     */
    function applyFieldMapping(v2Project, scoresByProjectId, enrichedData) {
        const out = {};
        const projectScores = (scoresByProjectId && scoresByProjectId.get(v2Project.id)) || {};
        enrichedData = enrichedData || {};

        Object.keys(FIELD_MAPPING).forEach(key => {
            const meta = FIELD_MAPPING[key];
            let value = meta.default;

            // Обрабатываем особые пути (score_history имеет приоритет)
            if (meta.v2Path === 'enriched.ai.payd_score') {
                const enrichedPayd = enrichedData.ai?.payd_score;
                if (typeof enrichedPayd === 'number') {
                    value = Math.round(enrichedPayd);
                } else {
                    // Fallback на score_history
                    const payd = projectScores.payd;
                    if (payd && typeof payd.value === 'number') value = Math.round(payd.value);
                }
            } else if (meta.v2Path === 'enriched.ai.alpha_score') {
                const enrichedAlpha = enrichedData.ai?.alpha_score;
                if (typeof enrichedAlpha === 'number') {
                    value = Math.round(enrichedAlpha);
                } else {
                    const alpha = projectScores.alpha;
                    if (alpha && typeof alpha.value === 'number') value = Math.round(alpha.value);
                }
            } else if (meta.v2Path === 'enriched.ai.conviction_score') {
                const enrichedConv = enrichedData.ai?.conviction_score;
                if (typeof enrichedConv === 'number') {
                    value = Math.round(enrichedConv);
                } else {
                    const conv = projectScores.conviction;
                    if (conv && typeof conv.value === 'number') value = Math.round(conv.value);
                }
            } else if (meta.v2Path && meta.v2Path.startsWith('enriched.')) {
                // Dot-notation в enriched объекте
                value = getNested(enrichedData, meta.v2Path.replace('enriched.', ''));
                if (value === undefined || value === null) value = meta.default;
            } else if (meta.v2Path) {
                // Простой путь в V2 объекте
                value = v2Project[meta.v2Path];
                if (value === undefined || value === null) value = meta.default;
            }

            // V2.2 FIX: нормализуем сектора (lowercase → Title Case) для совместимости
            // с V1 renderer, который ищет 'Layer 1', 'DePIN' и т.д.
            if (key === 'sector' && typeof value === 'string' && value) {
                value = normalizeSector(value);
            }

            out[key] = value;
        });

        return out;
    }

    // Безопасное извлечение nested поля
    function getNested(obj, path) {
        if (!obj) return undefined;
        const parts = path.split('.');
        let current = obj;
        for (const part of parts) {
            if (current == null) return undefined;
            current = current[part];
        }
        return current;
    }

    /* === Cache layer (in-memory + sessionStorage) === */
    function withCache(key, fetcher) {
        return new Promise((resolve, reject) => {
            try {
                const cached = sessionStorage.getItem('intel_' + key);
                if (cached) {
                    resolve(JSON.parse(cached));
                    return;
                }
            } catch (e) { /* sessionStorage unavailable */ }

            fetcher()
                .then(data => {
                    try { sessionStorage.setItem('intel_' + key, JSON.stringify(data)); } catch (e) {}
                    resolve(data);
                })
                .catch(reject);
        });
    }

    /**
     * fetch с таймаутом — гарантирует, что зависший запрос не заблокирует UI.
     * @param {string} url
     * @param {number} [timeoutMs=8000] — таймаут в миллисекундах
     * @returns {Promise<Response>}
     */
    function _fetchWithTimeout(url, timeoutMs = 8000) {
        const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        const timer = setTimeout(() => {
            if (controller) controller.abort();
        }, timeoutMs);
        const opts = controller ? { cache: 'no-store', signal: controller.signal } : { cache: 'no-store' };
        return fetch(url, opts).finally(() => clearTimeout(timer));
    }

    function fetchJSON(path, timeoutMs = 8000) {
        return _fetchWithTimeout(path, timeoutMs)
            .then(r => {
                if (!r.ok) throw new Error('Failed to load ' + path + ' (status ' + r.status + ')');
                return r.json();
            });
    }

    /**
     * Попытка получить данные через V2 LocalJsonDataProvider, если он уже
     * инициализирован (window.PAYD_INTEL.architecture.database).
     * Fallback — прямой fetch.
     */
    async function loadProjectsFromV2() {
        try {
            const arch = window.PAYD_INTEL && window.PAYD_INTEL.architecture;
            if (arch && arch.database && typeof arch.database.query === 'function') {
                const result = arch.database.query('projects', {});
                if (result && typeof result.then === 'function') {
                    const arr = await result;
                    if (Array.isArray(arr) && arr.length > 0) {
                        console.log('[intelligence-data] Loaded', arr.length, 'projects via LocalJsonDataProvider');
                        return arr;
                    }
                } else if (Array.isArray(result) && result.length > 0) {
                    console.log('[intelligence-data] Loaded', result.length, 'projects via LocalJsonDataProvider (sync)');
                    return result;
                }
            }
        } catch (e) {
            console.warn('[intelligence-data] LocalJsonDataProvider query failed, falling back to direct fetch:', e);
        }

        // Direct fetch fallback. projects.json имеет структуру { projects: [...] }
        // (НЕ просто массив). Разворачиваем в массив здесь, чтобы остальной код
        // работал единообразно.
        const direct = await fetchJSON(DATA_BASE_V2 + 'projects.json');
        const arr = Array.isArray(direct) ? direct : (direct && Array.isArray(direct.projects) ? direct.projects : []);
        console.log('[intelligence-data] Loaded', arr.length, 'projects via direct fetch (raw:', typeof direct, ')');
        return arr;
    }

    /**
     * Загружает score_history.json и индексирует его по project_id + engine.
     */
    async function loadScoreHistory() {
        try {
            const arr = await fetchJSON(DATA_BASE_V2 + 'score_history.json');
            if (!Array.isArray(arr)) {
                console.warn('[intelligence-data] score_history.json is not an array');
                return new Map();
            }
            const byProject = new Map();
            arr.forEach(record => {
                if (!record || !record.project_id || !record.engine) return;
                if (!byProject.has(record.project_id)) byProject.set(record.project_id, {});
                byProject.get(record.project_id)[record.engine] = {
                    value:         record.value,
                    classification: record.classification,
                    confidence:    record.confidence,
                    breakdown:     record.breakdown || {},
                    date:          record.date,
                };
            });
            console.log('[intelligence-data] Indexed scores for', byProject.size, 'projects');
            return byProject;
        } catch (e) {
            console.warn('[intelligence-data] Failed to load score_history.json:', e.message);
            return new Map();
        }
    }

    /**
     * V2.1: Загружает projects_enriched.json (live данные из CoinGecko, DefiLlama, GitHub).
     * Возвращает Map по project id.
     */
    async function loadEnrichedData() {
        try {
            const data = await fetchJSON(DATA_BASE_V2 + 'projects_enriched.json');
            if (typeof data !== 'object' || Array.isArray(data)) {
                console.warn('[intelligence-data] projects_enriched.json is not an object');
                return new Map();
            }
            const map = new Map();
            // FIX (2026-09-01): projects_enriched.json has shape { projects: [...] }
            // Old code: Object.keys(data).forEach(id => map.set(id, data[id]))
            //   → would set map['projects'] = array, leaving map.get('helium') = undefined.
            // New code: expand data.projects array (and any other top-level arrays of
            // project records) into individual entries indexed by .id.
            const isProjectRecord = (p) =>
                p && typeof p === 'object' && (typeof p.id === 'string' || typeof p.symbol === 'string');
            if (Array.isArray(data.projects) && data.projects.length > 0 && isProjectRecord(data.projects[0])) {
                data.projects.forEach(p => {
                    if (p && p.id) map.set(p.id, p);
                });
            } else {
                Object.keys(data).forEach(id => {
                    const val = data[id];
                    if (isProjectRecord(val)) {
                        if (val.id) map.set(val.id, val);
                        else map.set(id, val);
                    } else {
                        map.set(id, val);
                    }
                });
            }
            const withMarket = Array.from(map.values()).filter(p => p.market?.price_usd).length;
            const withTVL = Array.from(map.values()).filter(p => p.protocol?.tvl_usd).length;
            const withGithub = Array.from(map.values()).filter(p => p.github?.stars > 0).length;
            const withAI = Array.from(map.values()).filter(p => p.ai?.payd_score != null).length;
            console.log('[intelligence-data] Enriched data loaded for', map.size, 'projects',
                '| market:', withMarket, '| TVL:', withTVL, '| GitHub:', withGithub, '| AI:', withAI);
            return map;
        } catch (e) {
            console.warn('[intelligence-data] Failed to load projects_enriched.json:', e.message);
            return new Map();
        }
    }

    /**
     * V1 → V2 сектор mapping
     */
    const SECTOR_DISPLAY_MAP = {
        'layer1':         'Layer 1',
        'layer2':         'Layer 2',
        'ai':             'AI Infrastructure',
        'depin':          'DePIN',
        'defi':           'DeFi',
        'rwa':            'RWA',
        'gaming':         'Gaming',
        'desci':          'DeSci',
        'infrastructure': 'Infrastructure',
    };
    function normalizeSector(s) {
        if (!s) return '';
        return SECTOR_DISPLAY_MAP[s] || (s.charAt(0).toUpperCase() + s.slice(1));
    }

    /**
     * Преобразует V2 проект в V1 формат.
     * Использует FIELD_MAPPING для базового маппинга, затем добавляет
     * derived поля (ai_score, risk_score, и т.д.) на основе V2 метаданных.
     *
     * V2.1: enriched данные приоритетнее V2 score_history для market/AI/GitHub.
     */
    function adaptV2ProjectToV1(p, scoresByProjectId, enrichedData) {
        const enriched = enrichedData || {};
        const mapped = applyFieldMapping(p, scoresByProjectId, enriched);
        const projectScores = (scoresByProjectId && scoresByProjectId.get(p.id)) || {};
        const paydScore = projectScores.payd || null;
        const alphaScore = projectScores.alpha || null;
        const convictionScore = projectScores.conviction || null;

        // V2.1: enriched scores (приоритет над score_history)
        const enrichedPayd = enriched.ai?.payd_score;
        const enrichedRisk = enriched.ai?.risk_score;
        const enrichedConv = enriched.ai?.conviction_score;
        const enrichedAlpha = enriched.ai?.alpha_score;
        const enrichedBullCase = enriched.ai?.bull_case || [];
        const enrichedBearCase = enriched.ai?.bear_case || [];
        const enrichedThesis = enriched.ai?.thesis || [];
        const enrichedOpinion = enriched.ai?.opinion || null;

        const ticker = mapped.ticker || '';
        const name = mapped.name || ticker || '';
        const sectorRaw = mapped.sector || '';
        const sectorsArr = mapped.category || (enriched.categories || []);

        // === V1 derived scores (для V1 renderer) ===
        const aiScore = (mapped.payd_score != null) ? mapped.payd_score : null;
        const aiScoreChange7d = (mapped.change_7d_pct != null)
            ? Math.round(mapped.change_7d_pct * 10) / 10
            : null;

        // V2.1: risk_score из enriched.ai.risk_score (приоритет) или derived
        let riskScore = null;
        if (typeof enrichedRisk === 'number') {
            riskScore = Math.round(enrichedRisk);
        } else if (aiScore != null) {
            riskScore = Math.max(20, Math.min(80, Math.round(100 - aiScore)));
        }
        const riskLabel = riskScore == null ? null
            : (riskScore < 40 ? 'Low' : (riskScore < 60 ? 'Medium' : 'High'));
        const ratingScore = aiScore == null ? null : Math.round((aiScore / 20) * 10) / 10;
        const investmentRating = ratingScore == null ? null :
            (ratingScore >= 4.0 ? 'Strong Buy' :
             ratingScore >= 3.5 ? 'Buy' :
             ratingScore >= 2.5 ? 'Hold' : 'Speculative');

        // V2.1: developer activity из enriched.github
        const developerActivity = enriched.github?.commits_30d ||
            (paydScore && paydScore.breakdown && typeof paydScore.breakdown.dev_activity === 'number')
                ? paydScore.breakdown.dev_activity
                : 0;

        // === V1 sector display names ===
        const sectorV1 = normalizeSector(sectorRaw);
        const subsectorV1 = sectorsArr[0]
            ? normalizeSector(sectorsArr[0])
            : sectorV1;

        // === Logo placeholder ===
        const logo = (name && name.length > 0) ? '◆' : '◇';

        return {
            // === IDENTITY (mapped) ===
            id:              p.id,
            ticker:          ticker.toUpperCase(),
            name:            (name && name.length > 0) ? (name.charAt(0).toUpperCase() + name.slice(1)) : '',
            logo:            logo,
            description:     mapped.description || enriched.description || '',
            summary:         (mapped.description || enriched.description || '').slice(0, 200),
            thesis:          enrichedThesis.length > 0
                ? enrichedThesis.join('. ')
                : (mapped.description || enriched.description || '').slice(0, 200),

            // === CATEGORIZATION (mapped) ===
            sector:          sectorV1,
            subsector:       subsectorV1,
            category:        sectorsArr,
            coingecko_id:    mapped.coingecko_id,
            cmc_id:          mapped.cmc_id,
            cmc_slug:        mapped.cmc_slug,
            website:         mapped.website,
            x_handle:        mapped.x_handle,
            github_org:      mapped.github_org,
            github_repo:     mapped.github_repo,
            tier:            mapped.tier,
            verified_status: mapped.verified_status,
            last_verified_at: mapped.last_verified_at,

            // === MARKET DATA (V2.1: из enriched) ===
            price_usd:          mapped.price_usd,
            market_cap_usd:     mapped.market_cap_usd,
            fdv_usd:            mapped.fdv_usd,
            circulating_supply: mapped.circulating_supply,
            total_supply:       mapped.total_supply,
            max_supply:         mapped.max_supply,
            volume_24h_usd:     mapped.volume_24h_usd,
            change_24h_pct:     mapped.change_24h_pct,
            change_7d_pct:      mapped.change_7d_pct,
            change_30d_pct:     mapped.change_30d_pct,
            ath:                mapped.ath,
            ath_change_pct:     mapped.ath_change_pct,
            atl:                mapped.atl,
            market_cap_rank:    mapped.market_cap_rank,
            tvl_usd:            mapped.tvl_usd,
            liquidity_usd:      mapped.liquidity_usd,

            // === ACTIVITY (V2.1: из enriched.github) ===
            developer_activity: developerActivity,
            github_activity:    enriched.github?.commits_30d || 0,

            // === SCORES (4 main engines, V2.1: enriched приоритет) ===
            payd_score:          mapped.payd_score,
            conviction_score:    mapped.conviction_score,
            alpha_score:         mapped.alpha_score,
            payd_classification: paydScore ? paydScore.classification : null,
            alpha_classification: alphaScore ? alphaScore.classification : null,
            conviction_classification: convictionScore ? convictionScore.classification : null,

            // === V1-compatible derived scores ===
            ai_score:            aiScore,
            ai_score_change_7d:  aiScoreChange7d,
            risk_score:          riskScore,
            risk_label:          riskLabel,
            investment_rating:   investmentRating,
            rating_score:        ratingScore,

            // === AI Investment Analysis (V2.1: новые поля из enriched) ===
            ai_opinion:          enrichedOpinion,
            bull_case:           enrichedBullCase,
            bear_case:           enrichedBearCase,
            investment_thesis:   enrichedThesis,

            // === V1 specific fields ===
            founded:             new Date().getFullYear() - 3,
            headquarters:        'Unavailable',
            team:                [],
            investors:           [],
            partnerships:        [],
            roadmap:             [],

            // === V1 metrics subobject (V2.1: из enriched) ===
            metrics: {
                monthly_active_users: null,
                monthly_revenue_usd:  null,
                tvl_usd:              mapped.tvl_usd,
                nodes_count:          0,
                market_cap_usd:       mapped.market_cap_usd,
                fdv_usd:              mapped.fdv_usd,
                price_usd:            mapped.price_usd,
                volume_24h_usd:       mapped.volume_24h_usd,
                change_24h_pct:       mapped.change_24h_pct,
                change_7d_pct:        mapped.change_7d_pct,
                change_30d_pct:       mapped.change_30d_pct,
                circulating_supply:   mapped.circulating_supply,
                total_supply:         mapped.total_supply,
                max_supply:           mapped.max_supply,
                liquidity_usd:        mapped.liquidity_usd,
                next_unlock:          null,
                next_unlock_pct:      0,
                next_unlock_date:     null,
                next_unlock_usd_value: null,
            },

            // === V1 github subobject (V2.1: из enriched) ===
            github: {
                stars: enriched.github?.stars || 0,
                forks: enriched.github?.forks || 0,
                commits_30d: enriched.github?.commits_30d || 0,
                active_devs_30d: enriched.developer?.commit_count_4_weeks || 0,
                contributors_total: 0,
                last_commit: enriched.github?.last_commit || enriched.github?.pushed_at || null,
                repo: p.githubRepo || p.githubOrg || null,
                primary_languages: (enriched.github?.languages || []).map(l => l.name),
                language: enriched.github?.language || null,
                open_issues: enriched.github?.open_issues || 0,
                watchers: enriched.github?.watchers || 0,
                license: enriched.github?.license || null,
                topics: enriched.github?.topics || [],
                archived: enriched.github?.archived || false,
            },

            // === V1 tokenomics subobject ===
            tokenomics: {
                initial_supply:  null,
                circulating_pct: 0,
                vesting:         null,
                utility:         null,
                buyback_burn:    null,
            },

            // === V1 social subobject (V2.1: из enriched.social) ===
            social: {
                twitter_handle:   enriched.social?.twitter_handle || p.xHandle || null,
                twitter_url:      enriched.social?.twitter_url || (p.xHandle ? `https://x.com/${p.xHandle}` : null),
                telegram:         enriched.social?.telegram_channel || null,
                discord:          enriched.social?.discord || null,
                medium:           null,
                blog:             null,
                forum:            null,
                reddit:           null,
            },

            // === V1 community subobject (V2.1: из enriched.social) ===
            community: {
                twitter_followers:  enriched.social?.twitter_followers || 0,
                telegram_members:  0,
                discord_members:   0,
                reddit_subscribers: enriched.social?.reddit_subscribers || 0,
                github_stars:      enriched.github?.stars || 0,
            },

            // === V1 links subobject ===
            links: {
                website:        p.website || enriched.social?.website || null,
                whitepaper:     null,
                explorer:       null,
                blog:           null,
                documentation:  null,
                github:         p.githubRepo ? ('https://github.com/' + p.githubRepo) : (p.githubOrg ? ('https://github.com/' + p.githubOrg) : null),
            },

            // === V1 market_data subobject (V2.1: из enriched.market) ===
            market_data: {
                price_usd:          mapped.price_usd,
                market_cap_usd:     mapped.market_cap_usd,
                fdv_usd:            mapped.fdv_usd,
                volume_24h_usd:     mapped.volume_24h_usd,
                change_24h_pct:     mapped.change_24h_pct,
                change_7d_pct:      mapped.change_7d_pct,
                change_30d_pct:     mapped.change_30d_pct,
                circulating_supply: mapped.circulating_supply,
                total_supply:       mapped.total_supply,
                max_supply:         mapped.max_supply,
                liquidity_usd:      mapped.liquidity_usd,
                ath:                mapped.ath,
                ath_change_pct:     mapped.ath_change_pct,
                market_cap_rank:    mapped.market_cap_rank,
            },

            // === Protocol data (V2.1: из enriched.protocol) ===
            protocol_data: enriched.protocol || null,

            // === V1 score breakdown ===
            ai_score_components: {
                fundamentals: (paydScore && paydScore.breakdown && paydScore.breakdown.fundamentals) || 0,
                tokenomics:   (paydScore && paydScore.breakdown && paydScore.breakdown.tokenomics)   || 0,
                team:         (paydScore && paydScore.breakdown && paydScore.breakdown.team)         || 0,
                traction:     (paydScore && paydScore.breakdown && paydScore.breakdown.traction)     || 0,
            },

            ai_score_history: enriched.ai
                ? [{ date: enriched.ai.calculated_at || new Date().toISOString(), score: enriched.ai.payd_score || 0 }]
                : (paydScore
                    ? [{ date: paydScore.date, score: paydScore.value }]
                    : []),

            // === DEBUG INFO ===
            _v2_source: {
                id:               p.id,
                coingecko_id:     p.coingeckoId,
                cmc_id:           p.cmcId,
                cmc_slug:         p.cmcSlug,
                github_org:       p.githubOrg,
                github_repo:      p.githubRepo,
                website:          p.website,
                x_handle:         p.xHandle,
                tier:             mapped.tier,
                verified_status:  mapped.verified_status,
                last_verified_at: mapped.last_verified_at,
                sectors:          sectorsArr,
                has_real_scores:  !!paydScore || !!enriched.ai,
                has_enriched_data: !!enriched.market || !!enriched.protocol || !!enriched.github,
                field_mapping_version: '2.1',
            },
        };
    }

    /**
     * Генерирует V1 overview объект на лету из V2 проектов.
     * V2.1: использует enriched данные для market cap totals.
     */
    function buildOverviewFromProjects(projectsArr, scoresByProjectId, enrichedMap) {
        const now = new Date().toISOString();
        const sectorsCount = {};
        const tiersCount = { tier1: 0, tier2: 0 };
        let verifiedCount = 0;
        let totalAiScore = 0;
        let scoredCount = 0;
        let totalMarketCap = 0;
        let totalTVL = 0;
        let withMarket = 0;
        let withTVL = 0;
        let total24hChange = 0;
        let change24Count = 0;

        projectsArr.forEach(p => {
            const sec = p.sector || 'unknown';
            sectorsCount[sec] = (sectorsCount[sec] || 0) + 1;
            if (p.tier === 'tier1') tiersCount.tier1++;
            else tiersCount.tier2++;
            if (p.verifiedStatus === 'verified') verifiedCount++;

            const enriched = enrichedMap && enrichedMap.get(p.id);
            if (enriched) {
                if (enriched.market?.market_cap_usd) {
                    totalMarketCap += enriched.market.market_cap_usd;
                    withMarket++;
                }
                if (enriched.protocol?.tvl_usd) {
                    totalTVL += enriched.protocol.tvl_usd;
                    withTVL++;
                }
                if (enriched.market?.change_24h_pct != null) {
                    total24hChange += enriched.market.change_24h_pct;
                    change24Count++;
                }
                if (enriched.ai?.payd_score != null) {
                    totalAiScore += enriched.ai.payd_score;
                    scoredCount++;
                    return;
                }
            }

            // Fallback: score_history
            const projectScores = (scoresByProjectId && scoresByProjectId.get(p.id)) || {};
            const paydScore = projectScores.payd;
            if (paydScore && typeof paydScore.value === 'number') {
                totalAiScore += paydScore.value;
                scoredCount++;
            } else {
                totalAiScore += p.tier === 'tier1' ? 82 : 68;
            }
        });

        const avgScore = projectsArr.length > 0 ? totalAiScore / projectsArr.length : 0;
        const topSectors = Object.entries(sectorsCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([s]) => s);

        return {
            last_updated: now,
            next_run_at:  now,
            market_overview: {
                total_market_cap_usd:    withMarket > 0 ? totalMarketCap : null,
                total_tvl_usd:           withTVL > 0 ? totalTVL : null,
                market_cap_change_24h:   change24Count > 0 ? Math.round((total24hChange / change24Count) * 100) / 100 : null,
                projects_with_market:    withMarket,
                projects_with_tvl:       withTVL,
                fear_greed_index:        50,
                fear_greed_label:        'Neutral',
            },
            totals: {
                projects_tracked:   projectsArr.length,
                tracked_change_7d:  0,
            },
            ai_score_average: {
                global:    Math.round(avgScore * 10) / 10,
                change_7d: 0,
                based_on:  scoredCount,
            },
            weekly_reports_count: 0,
            weekly_opportunities: {
                count:      0,
                top_sector: topSectors[0] ? topSectors[0].charAt(0).toUpperCase() + topSectors[0].slice(1) : 'Layer 1',
                highlighted: [],
            },
            biggest_risks_7d:   [],
            upcoming_unlocks_7d: [],
            latest_research:    [],
            weekly_updates:     [],
            _sector_breakdown:  sectorsCount,
            _tier_breakdown:    tiersCount,
            _verified_count:    verifiedCount,
            _projects_with_real_scores: scoresByProjectId ? scoresByProjectId.size : 0,
            _enriched_projects: enrichedMap ? enrichedMap.size : 0,
        };
    }

    /**
     * Генерирует V1 depin секцию на лету из V2 проектов.
     * V2.1: использует enriched данные.
     */
    function buildDePINFromProjects(projectsArr, scoresByProjectId, enrichedMap) {
        const depinProjects = projectsArr
            .filter(p => p.sector === 'depin')
            .map(p => adaptV2ProjectToV1(p, scoresByProjectId, enrichedMap?.get(p.id)))
            .sort((a, b) => (b.ai_score || 0) - (a.ai_score || 0));

        return {
            last_updated: new Date().toISOString(),
            sector: 'DePIN',
            total_projects: depinProjects.length,
            ai_score_weights: {},
            projects: depinProjects,
        };
    }

    /**
     * Генерирует V1 aiInfra секцию на лету из V2 проектов.
     * V2.1: использует enriched данные.
     */
    function buildAIInfraFromProjects(projectsArr, scoresByProjectId, enrichedMap) {
        const categories = {};
        const sectorToCategory = {
            'layer1':      { key: 'layer1', label: 'Layer 1', description: 'Base-layer blockchain protocols' },
            'layer2':      { key: 'layer2', label: 'Layer 2', description: 'Layer 2 scaling solutions' },
            'defi':        { key: 'defi',   label: 'DeFi',    description: 'Decentralized finance protocols' },
            'rwa':         { key: 'rwa',    label: 'RWA',     description: 'Real World Assets tokenization' },
            'gaming':      { key: 'gaming', label: 'Gaming',  description: 'Blockchain gaming and metaverse' },
            'desci':       { key: 'desci',  label: 'DeSci',   description: 'Decentralized science' },
            'ai':          { key: 'ai',     label: 'AI',      description: 'AI infrastructure and applications' },
            'infrastructure': { key: 'infra', label: 'Infrastructure', description: 'Cross-chain and core infrastructure' },
        };

        Object.entries(sectorToCategory).forEach(([sector, meta]) => {
            categories[meta.key] = {
                label: meta.label,
                description: meta.description,
                projects: [],
            };
        });

        projectsArr.forEach(p => {
            const sector = p.sector;
            if (sectorToCategory[sector]) {
                const meta = sectorToCategory[sector];
                categories[meta.key].projects.push(adaptV2ProjectToV1(p, scoresByProjectId, enrichedMap?.get(p.id)));
            }
        });

        Object.values(categories).forEach(cat => {
            cat.projects.sort((a, b) => (b.ai_score || 0) - (a.ai_score || 0));
        });

        return {
            last_updated: new Date().toISOString(),
            categories: categories,
        };
    }

    /**
     * Генерирует V1 projects объект в формате { last_updated, projects: { [ticker]: ... } }
     *
     * Безопасная обработка дубликатов тикеров:
     * — Если в V2 два проекта с одинаковым symbol (например, 'tao' и 'bittensor'
     *   оба имеют ticker 'TAO'), приоритет получает тот, у кого есть реальные
     *   оценки в score_history.json. Это предотвращает потерю данных проектов,
     *   имеющих активный скоринг.
     */
    function buildProjectsDict(projectsArr, scoresByProjectId, enrichedMap) {
        const projects = {};

        // Множество id проектов, для которых есть реальные оценки
        const scoredIds = scoresByProjectId ? new Set(Array.from(scoresByProjectId.keys())) : new Set();

        // Группируем V1-проекты по тикеру для обнаружения конфликтов
        const byTicker = new Map();
        projectsArr.forEach(p => {
            const v1 = adaptV2ProjectToV1(p, scoresByProjectId, enrichedMap?.get(p.id));
            if (!v1 || !v1.ticker) return;
            if (!byTicker.has(v1.ticker)) byTicker.set(v1.ticker, []);
            byTicker.get(v1.ticker).push(v1);
        });

        // Выбираем, какой проект попадёт в финальный словарь при конфликте
        byTicker.forEach((group, ticker) => {
            if (group.length === 1) {
                projects[ticker] = group[0];
                return;
            }
            // Конфликт: ищем проект, у которого есть реальная оценка
            const scored = group.find(p => p._v2_source && scoredIds.has(p._v2_source.id));
            if (scored) {
                const skipped = group
                    .filter(p => p !== scored)
                    .map(p => (p._v2_source && p._v2_source.id) || '?');
                console.warn(
                    '[intelligence-data] Ticker conflict for "' + ticker + '": '
                    + 'keeping "' + scored._v2_source.id + '" (has real scores); '
                    + 'skipping ' + JSON.stringify(skipped)
                );
                projects[ticker] = scored;
            } else {
                // Ни у одного из дубликатов нет реальных оценок — берём первый по порядку
                projects[ticker] = group[0];
                const otherIds = group.slice(1).map(p => (p._v2_source && p._v2_source.id) || '?');
                if (otherIds.length > 0) {
                    console.warn(
                        '[intelligence-data] Ticker conflict for "' + ticker + '": '
                        + 'no scored versions found; keeping first ("' + group[0]._v2_source.id
                        + '"), skipping ' + JSON.stringify(otherIds)
                    );
                }
            }
        });

        return {
            last_updated: new Date().toISOString(),
            projects: projects,
        };
    }

    /* === Load functions === */

    /**
     * Интеграция Self-Healing: добавляет кэшированные new projects
     * (обнаруженные в предыдущих сессиях) к текущему датасету.
     * Это позволяет мгновенно отобразить восстановленные сектора
     * без ожидания нового discovery-цикла.
     */
    function applySelfHealingCache(projectsArr, enrichedMap) {
        try {
            if (!window.PAYD_INTEL || !window.PAYD_INTEL.SelfHealingEngine) return;
            const engine = window.PAYD_INTEL._selfHealingEngine
                || (window.PAYD_INTEL._selfHealingEngine = new window.PAYD_INTEL.SelfHealingEngine());
            const cached = engine.getCachedNewProjects();
            if (!Array.isArray(cached) || cached.length === 0) return;

            // Добавляем только те, которых ещё нет
            const existingIds = new Set(projectsArr.map(p => p.id));
            let added = 0;
            cached.forEach(p => {
                if (!p || !p.id || existingIds.has(p.id)) return;
                projectsArr.push(p);
                if (enrichedMap && p.id) {
                    enrichedMap.set(p.id, p);
                }
                added++;
            });
            if (added > 0) {
                console.log(`[intelligence-data] Applied ${added} self-healed projects from cache`);
            }
        } catch (e) {
            console.warn('[intelligence-data] applySelfHealingCache failed:', e.message);
        }
    }

    /**
     * Запускает фоновый self-healing процесс (не блокирует UI).
     * Если какие-то сектора пустые — engine найдёт и обогатит проекты.
     */
    function triggerBackgroundSelfHealing(projectsArr, enrichedMap) {
        try {
            if (!window.PAYD_INTEL || !window.PAYD_INTEL.SelfHealingEngine) {
                console.log('[intelligence-data] SelfHealingEngine not loaded — skipping background healing');
                return;
            }
            const engine = window.PAYD_INTEL._selfHealingEngine
                || (window.PAYD_INTEL._selfHealingEngine = new window.PAYD_INTEL.SelfHealingEngine({
                    autoRun: true,
                    onProgress: (phase, message, current, total) => {
                        // Не спамим — только ключевые фазы
                        if (phase === 'start' || phase === 'complete') {
                            console.log(`[SelfHealing][${phase}] ${message}`);
                        }
                    },
                }));

            // Запускаем в фоне, не блокируем загрузку страницы
            Promise.resolve().then(() => {
                engine.run(projectsArr, enrichedMap).then(result => {
                    if (result.needsReload && result.newProjects && result.newProjects.length > 0) {
                        console.log(
                            `[intelligence-data] Self-healing recovered ${result.newProjects.length} ` +
                            `new projects. Reload page to see them.`
                        );
                    }
                }).catch(err => {
                    console.warn('[intelligence-data] Background self-healing failed:', err.message);
                });
            });
        } catch (e) {
            console.warn('[intelligence-data] triggerBackgroundSelfHealing failed:', e.message);
        }
    }

    const loaders = {
        projects: async () => {
            // Делаем каждую загрузку независимой: если один источник падает,
            // мы продолжаем с тем, что есть, и никогда не зависаем.
            const safeFetch = (promiseFactory, defaultValue, label) => {
                return Promise.race([
                    promiseFactory(),
                    new Promise(resolve => setTimeout(() => {
                        console.warn(`[intelligence-data] ${label} timeout, using default`);
                        resolve(defaultValue);
                    }, 10000))
                ]).catch(err => {
                    console.warn(`[intelligence-data] ${label} failed:`, err.message);
                    return defaultValue;
                });
            };

            const projectsArr = await safeFetch(
                () => loadProjectsFromV2(),
                [],
                'loadProjectsFromV2'
            );
            const scoresByProjectId = await safeFetch(
                () => loadScoreHistory(),
                new Map(),
                'loadScoreHistory'
            );
            const enrichedMap = await safeFetch(
                () => loadEnrichedData(),
                new Map(),
                'loadEnrichedData'
            );

            // === SELF-HEALING: применяем кэшированные новые проекты ===
            // Делаем это ДО проверки на пустой датасет, чтобы восстановленные
            // сектора сразу были видны на UI.
            if (Array.isArray(projectsArr) && projectsArr.length > 0) {
                applySelfHealingCache(projectsArr, enrichedMap);
            }

            if (!Array.isArray(projectsArr) || projectsArr.length === 0) {
                // Не throw — устанавливаем fallback, чтобы watchdog завершил инициализацию
                console.warn('[intelligence-data] No projects loaded from V2 source — using empty fallback');
                // ВАЖНО: если preloader уже дал данные — НЕ затираем их (иначе DePIN/Layer 1/Layer 2 обнулятся)
                if (!INTEL_DATA.depin || !INTEL_DATA.depin._from_preloader) {
                    INTEL_DATA.depin = { last_updated: new Date().toISOString(), sector: 'DePIN', total_projects: 0, projects: [], _fallback: true };
                } else {
                    console.log('[intelligence-data] Preserving preloader depin data (', INTEL_DATA.depin.total_projects, 'projects)');
                }
                if (!INTEL_DATA.projects || !INTEL_DATA.projects._from_preloader) {
                    INTEL_DATA.projects = {
                        last_updated: new Date().toISOString(),
                        projects: {},
                        _fallback: true,
                        _reason: 'no_projects_loaded'
                    };
                }
                if (!INTEL_DATA.overview) {
                    INTEL_DATA.overview = _emptyOverviewFallback('no_projects_loaded');
                }
                if (!INTEL_DATA.aiInfra) {
                    INTEL_DATA.aiInfra = { last_updated: new Date().toISOString(), categories: {}, _fallback: true };
                }
                INTEL_LOAD_STATE.loaded = true;
                return INTEL_DATA.projects;
            }

            const v1Projects = buildProjectsDict(projectsArr, scoresByProjectId, enrichedMap);
            const v1Overview = buildOverviewFromProjects(projectsArr, scoresByProjectId, enrichedMap);
            const v1DePIN    = buildDePINFromProjects(projectsArr, scoresByProjectId, enrichedMap);
            const v1AIInfra  = buildAIInfraFromProjects(projectsArr, scoresByProjectId, enrichedMap);

            // Если preloader уже дал данные — мерджим, а не затираем.
            // V2 buildDePINFromProjects может вернуть 0, если сектора не совпадают.
            if (INTEL_DATA.depin && INTEL_DATA.depin._from_preloader &&
                INTEL_DATA.depin.total_projects > 0 &&
                (!v1DePIN || !v1DePIN.total_projects)) {
                console.log('[intelligence-data] Merging: V2 buildDePIN returned 0, keeping preloader data (',
                    INTEL_DATA.depin.total_projects, 'projects)');
                INTEL_DATA.depin = INTEL_DATA.depin;
            } else {
                INTEL_DATA.depin = v1DePIN;
            }
            INTEL_DATA.projects  = v1Projects;
            INTEL_DATA.overview  = v1Overview;
            INTEL_DATA.aiInfra   = v1AIInfra;

            INTEL_DATA.watchlist      = null;
            INTEL_DATA.opportunities  = null;
            INTEL_DATA.weeklyReports  = null;

            // === SELF-HEALING: запуск фонового восстановления ===
            // Не блокирует основной поток, не показывается пользователю,
            // но гарантирует, что пустые сектора будут заполнены
            // в течение следующих 60 секунд.
            triggerBackgroundSelfHealing(projectsArr, enrichedMap);

            return v1Projects;
        },

        overview:       () => Promise.resolve(INTEL_DATA.overview),
        depin:          () => Promise.resolve(INTEL_DATA.depin),
        aiInfra:        () => Promise.resolve(INTEL_DATA.aiInfra),
        watchlist:      () => Promise.resolve(INTEL_DATA.watchlist),
        opportunities:  () => Promise.resolve(INTEL_DATA.opportunities),
        weeklyReports:  () => Promise.resolve(INTEL_DATA.weeklyReports),
    };

    /**
     * Создаёт пустой fallback-объект overview с полной структурой,
     * чтобы V1 renderer не падал на undefined-полях.
     */
    function _emptyOverviewFallback(reason) {
        const now = new Date().toISOString();
        return {
            last_updated: now,
            next_run_at: now,
            market_overview: {
                total_market_cap_usd: null,
                total_tvl_usd: null,
                market_cap_change_24h: null,
                projects_with_market: 0,
                projects_with_tvl: 0,
                fear_greed_index: 50,
                fear_greed_label: 'Neutral',
            },
            totals: {
                projects_tracked: 0,
                tracked_change_7d: 0,
            },
            ai_score_average: {
                global: null,
                change_7d: 0,
                based_on: 0,
            },
            weekly_reports_count: 0,
            weekly_opportunities: {
                count: 0,
                top_sector: '—',
                highlighted: [],
            },
            biggest_risks_7d: [],
            upcoming_unlocks_7d: [],
            latest_research: [],
            weekly_updates: [],
            _fallback: true,
            _reason: reason || 'empty_fallback',
        };
    }

    /**
     * Инициализирует INTEL_DATA из preloaded данных (PAYD_INTEL_CACHED_DATA),
     * если они доступны. Это позволяет UI начать рендериться НЕМЕДЛЕННО,
     * пока идёт фоновая загрузка полных данных.
     */
    function _initFromPreloader() {
        try {
            const cached = window.PAYD_INTEL_CACHED_DATA;
            if (!cached || !cached._preloaded) return false;
            if (cached.projects && cached.projects.projects && Object.keys(cached.projects.projects).length > 0) {
                // FIX race-condition: не затираем уже загруженные полные данные
                // (от loaders.projects()), если в них больше проектов чем в preloader.
                const existingCount = (INTEL_DATA.projects && INTEL_DATA.projects.projects)
                    ? Object.keys(INTEL_DATA.projects.projects).length : 0;
                const preloaderCount = Object.keys(cached.projects.projects).length;
                if (existingCount > 0 && existingCount >= preloaderCount) {
                    console.log('[intelligence-data] _initFromPreloader: skipping, existing data has',
                        existingCount, '>= preloader', preloaderCount);
                    return false;
                }
                INTEL_DATA.projects = cached.projects;
                INTEL_DATA.overview = cached.overview || _emptyOverviewFallback('preloader');
                INTEL_DATA.depin = cached.depin || null;
                INTEL_DATA.aiInfra = cached.aiInfra || null;
                // Помечаем preloader-источник, чтобы loaders.projects() не затирал
                if (INTEL_DATA.depin) INTEL_DATA.depin._from_preloader = true;
                if (INTEL_DATA.projects) INTEL_DATA.projects._from_preloader = true;
                INTEL_LOAD_STATE.loaded = true;
                INTEL_LOAD_STATE._from_preloader = true;
                console.log('[intelligence-data] ✓ Initialized from preloader:', Object.keys(cached.projects.projects).length, 'projects,',
                    (INTEL_DATA.depin && INTEL_DATA.depin.total_projects) || 0, 'DePIN');
                // FIX race-condition: уведомляем UI о готовности данных ДО возврата,
                // чтобы main.js мог сразу отрендерить без ожидания load().
                try {
                    window.dispatchEvent(new CustomEvent('payd:data-ready', {
                        detail: {
                            source: 'preloader',
                            projects: Object.keys(cached.projects.projects).length,
                            ts: Date.now(),
                        }
                    }));
                } catch (e) { /* CustomEvent unsupported */ }
                return true;
            }
        } catch (e) {
            console.warn('[intelligence-data] _initFromPreloader failed:', e.message);
        }
        return false;
    }

    function loadAllIntelligenceData() {
        try {
            const cacheKeys = ['intel_overview', 'intel_depin', 'intel_ai-infra',
                              'intel_watchlist', 'intel_opportunities',
                              'intel_weekly-reports', 'intel_projects_v4'];
            cacheKeys.forEach(k => sessionStorage.removeItem(k));
        } catch (e) { /* sessionStorage unavailable */ }

        // Watchdog: даже если основная загрузка зависла — гарантируем,
        // что Promise резолвится в течение 12 секунд с минимальным fallback.
        // Без этого "Loading intelligence data..." может висеть вечно.
        const watchdog = new Promise(resolve => {
            setTimeout(() => {
                if (INTEL_LOAD_STATE.loaded) return;
                console.warn('[intelligence-data] Watchdog: forcing load to complete with fallback data');
                // Минимальный fallback — пустые секции, чтобы UI отрисовался
                if (!INTEL_DATA.projects) {
                    INTEL_DATA.projects = {
                        last_updated: new Date().toISOString(),
                        projects: {},
                        _fallback: true,
                        _reason: 'watchdog_timeout'
                    };
                }
                if (!INTEL_DATA.overview) {
                    INTEL_DATA.overview = _emptyOverviewFallback('watchdog_timeout');
                }
                if (!INTEL_DATA.depin) {
                    INTEL_DATA.depin = { last_updated: new Date().toISOString(), sector: 'DePIN', total_projects: 0, projects: [], _fallback: true };
                }
                if (!INTEL_DATA.aiInfra) {
                    INTEL_DATA.aiInfra = { last_updated: new Date().toISOString(), categories: {}, _fallback: true };
                }
                INTEL_LOAD_STATE.loaded = true;
                INTEL_LOAD_STATE.error = new Error('Watchdog timeout — partial data');
                resolve(INTEL_DATA);
            }, 12000);
        });

        const actualLoad = loaders.projects()
            .then(() => {
                INTEL_LOAD_STATE.loaded = true;
                const projectsCount = INTEL_DATA.projects.projects
                    ? Object.keys(INTEL_DATA.projects.projects).length : 0;
                console.log('[intelligence-data] V2 data loaded. Projects:',
                    projectsCount, '| FIELD_MAPPING v2.0 active');
                // FIX race-condition: уведомляем UI о том, что данные полностью готовы.
                try {
                    window.dispatchEvent(new CustomEvent('payd:data-ready', {
                        detail: {
                            source: 'loaders.projects',
                            projects: projectsCount,
                            ts: Date.now(),
                        }
                    }));
                } catch (e) { /* CustomEvent unsupported */ }
                return INTEL_DATA;
            })
            .catch(err => {
                INTEL_LOAD_STATE.error = err;
                console.error('[intelligence-data] Data load failed:', err);
                // Вместо throw — резолвим с тем, что есть, чтобы UI мог отрисоваться
                if (!INTEL_DATA.projects) {
                    INTEL_DATA.projects = {
                        last_updated: new Date().toISOString(),
                        projects: {},
                        _fallback: true,
                        _reason: 'load_error',
                        _error: err.message
                    };
                }
                if (!INTEL_DATA.overview) {
                    INTEL_DATA.overview = _emptyOverviewFallback('load_error');
                }
                if (!INTEL_DATA.depin) {
                    INTEL_DATA.depin = { last_updated: new Date().toISOString(), sector: 'DePIN', total_projects: 0, projects: [], _fallback: true };
                }
                if (!INTEL_DATA.aiInfra) {
                    INTEL_DATA.aiInfra = { last_updated: new Date().toISOString(), categories: {}, _fallback: true };
                }
                INTEL_LOAD_STATE.loaded = true;
                return INTEL_DATA;
            });

        return Promise.race([actualLoad, watchdog]);
    }

    // Пытаемся инициализировать из preloader'а СРАЗУ при загрузке скрипта.
    // Если данные есть — INTEL_DATA будет готова ещё до вызова load().
    _initFromPreloader();

    // Публикуем FIELD_MAPPING глобально для отладки и расширения
    window.PAYD_INTEL = window.PAYD_INTEL || {};
    window.PAYD_INTEL.data = INTEL_DATA;
    window.PAYD_INTEL.state = INTEL_LOAD_STATE;
    window.PAYD_INTEL.load = loadAllIntelligenceData;
    window.PAYD_INTEL.FIELD_MAPPING = FIELD_MAPPING;
    // FIX race-condition: экспортируем _initFromPreloader, чтобы main.js
    // мог вручную перезапустить её, если preloader отдал данные позже.
    window.PAYD_INTEL._initFromPreloader = _initFromPreloader;
})();
