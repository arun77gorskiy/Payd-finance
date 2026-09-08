/* =================================================================
   PAYD Finance — Intelligence Render Module
   Рендеринг всех секций модуля Intelligence.
   Использует только предрассчитанные данные (никакого AI на клиенте).
   =================================================================
   VERSION: 2026-09-01-2 (helium-deep-enrichment-fix) (sector-filter-fix-v2: canonical lowercase match)
   ================================================================= */

const U = window.PAYD_INTEL_UTILS;
const D = window.PAYD_INTEL.data;

// Версия билда — выводится в консоль при загрузке модуля
console.log("[PAYD Intelligence Render] VERSION: canonical-sso-fix-v3 (2026-09-08)");

/* === Canonical sector mapping (lowercase) ===
   Используется ТОЛЬКО для нормализации значений p.sector / p.sectors
   в массив lowercase-канонов. Фильтрация выполняется по канонам,
   а не по подстрокам. */
const SECTOR_CANONICAL = {
    'layer 1':   'layer 1',
    'layer1':    'layer 1',
    'l1':        'layer 1',
    'layer 2':   'layer 2',
    'layer2':    'layer 2',
    'l2':        'layer 2',
    'depin':     'depin',
    'defi':      'defi',
    'rwa':       'rwa',
    'real world assets': 'rwa',
    'gaming':    'gaming',
    'desci':     'desci',
    'ai infrastructure': 'ai',
    'ai':        'ai',
    'infrastructure': 'infrastructure',
    'zk':        'zk',
};

/**
 * Нормализует значение sector (которое может быть string | array | null | object)
 * в массив lowercase-канонов.
 * @param {Object} project
 * @returns {string[]} массив канонов сектора (lowercase)
 */
function normalizeSectorValue(project) {
    if (!project) return [];
    const out = [];
    const seen = new Set();

    const candidates = [];

    // 1. Основное поле sector
    if (project.sector !== undefined && project.sector !== null) {
        if (Array.isArray(project.sector)) {
            project.sector.forEach(v => candidates.push(v));
        } else if (typeof project.sector === 'object') {
            // { primary: 'DePIN' } или { primary: 'DePIN', secondary: ['AI'] }
            if (project.sector.primary) candidates.push(project.sector.primary);
            if (Array.isArray(project.sector.secondary)) {
                project.sector.secondary.forEach(v => candidates.push(v));
            }
            if (project.sector.value) candidates.push(project.sector.value);
        } else {
            candidates.push(project.sector);
        }
    }

    // 2. Дополнительное поле sectors (массив)
    if (Array.isArray(project.sectors)) {
        project.sectors.forEach(v => candidates.push(v));
    }

    // 3. Дополнительные поля-синонимы
    if (project.category !== undefined && project.category !== null) {
        if (Array.isArray(project.category)) {
            project.category.forEach(v => candidates.push(v));
        } else {
            candidates.push(project.category);
        }
    }
    if (typeof project.subsector === 'string' && project.subsector) {
        candidates.push(project.subsector);
    }

    // Нормализуем каждое значение через канонический маппинг
    candidates.forEach(v => {
        if (v === undefined || v === null) return;
        const s = String(v).toLowerCase().trim();
        if (!s) return;
        const canon = SECTOR_CANONICAL[s] || s;
        if (!seen.has(canon)) {
            seen.add(canon);
            out.push(canon);
        }
    });

    return out;
}

/* === CatMap: категория → массив канонов lowercase === */
const SECTOR_CATMAP = {
    l1:     { label: 'Layer 1', sectors: ['layer 1'] },
    l2:     { label: 'Layer 2', sectors: ['layer 2'] },
    defi:   { label: 'DeFi',    sectors: ['defi'] },
    rwa:    { label: 'RWA',     sectors: ['rwa'] },
    gaming: { label: 'Gaming',  sectors: ['gaming'] },
    desci:  { label: 'DeSci',   sectors: ['desci'] },
    depin:  { label: 'DePIN',   sectors: ['depin'] },
    ai:     { label: 'AI',      sectors: ['ai'] },
};

/* === CANONICAL SINGLE SOURCE OF TRUTH (v3) ===
   V1 renderer теперь читает ВСЕ проектные данные из канонического
   runtime map (window.PAYD_INTEL_CACHED_DATA.canonical), который
   построен один раз модулем canonical-normalizer.js.
   Это гарантирует, что один и тот же проект в разных секторах
   показывает ИДЕНТИЧНЫЕ поля (Market Cap, FDV, AI Score, Risk, etc.). */
function _getCanonicalRuntime() {
    const cached = (window.PAYD_INTEL_CACHED_DATA && window.PAYD_INTEL_CACHED_DATA.canonical) || null;
    if (cached && cached._ready && cached.projects instanceof Map && cached.projects.size > 0) {
        return cached;
    }
    return null;
}

/* Маппинг V1-формата секторов (lowercase) → canonical Title Case */
const V1_TO_CANONICAL_SECTOR = {
    'l1':     'Layer 1',
    'l2':     'Layer 2',
    'defi':   'DeFi',
    'rwa':    'RWA',
    'gaming': 'Gaming',
    'desci':  'DeSci',
    'depin':  'DePIN',
    'ai':     'AI',
    'infrastructure': 'Infrastructure',
    'zk':     'ZK',
};

/**
 * Преобразует canonical-объект в V1 view shape.
 * Все V1-функции ниже читают ИСКЛЮЧИТЕЛЬНО через эту функцию,
 * чтобы гарантировать идентичность данных во всех секторах.
 */
function canonicalToV1View(p) {
    if (!p) return null;
    if (p._v1_view) return p._v1_view; // memoize

    const m   = p.market || {};
    const ai  = p.ai     || {};
    const dev = p.developer || {};
    const pro = p.protocol   || {};
    const tok = p.tokenomics || {};

    // Score fields
    const aiScore     = (ai.payd_score != null) ? Math.round(ai.payd_score) : null;
    const aiScore7d   = (m.change_7d_pct != null) ? Math.round(m.change_7d_pct * 10) / 10 : null;
    const riskScore   = (ai.risk_score != null) ? Math.round(ai.risk_score) : null;
    const riskLabel   = riskScore == null ? null
        : (riskScore < 40 ? 'Low' : (riskScore < 60 ? 'Medium' : 'High'));

    // Coverage / rating (best-effort, по наличию данных)
    const availableCore = [
        m.market_cap_usd, m.fdv_usd, m.volume_24h_usd,
        dev.commits_30d, dev.stars, pro.tvl_usd, tok.circulating_pct
    ].filter(v => v !== null && v !== undefined).length;
    const dataCoveragePct = Math.round((availableCore / 7) * 100);
    const ratingScore = (aiScore == null || dataCoveragePct < 50) ? null : Math.round((aiScore / 20) * 10) / 10;
    const investmentRating = ratingScore == null ? null :
        (ratingScore >= 4.0 ? 'Strong Buy' :
         ratingScore >= 3.5 ? 'Buy' :
         ratingScore >= 2.5 ? 'Hold' : 'Speculative');

    // Sector display
    const sectorV1 = (p.sector_memberships && p.sector_memberships[0]) || 'Uncategorized';

    const v1 = {
        // Identity
        id:           p.id,
        ticker:       String(p.symbol || p.id).toUpperCase(),
        name:         p.name || p.id,
        logo:         (p.name && p.name.length > 0) ? '◆' : '◇',
        description:  p.description || '',
        summary:      (p.description || '').slice(0, 200),
        thesis:       (p.description || '').slice(0, 200),
        sector:       sectorV1,
        subsector:    sectorV1,
        category:     p.sector_memberships || [],
        sectors:      p.sector_memberships || [],

        // Provider IDs
        coingecko_id:  p.coingeckoId || null,
        cmc_id:        p.cmcId || null,
        cmc_slug:      p.cmcSlug || null,
        website:       p.website || null,
        x_handle:      p.xHandle || null,
        github_org:    dev.github_org || p.githubOrg || null,
        github_repo:   dev.github_repo || p.githubRepo || null,
        tier:          p.tier || 'tier2',
        verified_status: p.verifiedStatus || 'unverified',
        last_verified_at: p.lastVerifiedAt || null,

        // Market (canonical)
        price_usd:          m.price_usd ?? null,
        market_cap_usd:     m.market_cap_usd ?? null,
        fdv_usd:            m.fdv_usd ?? null,
        circulating_supply: m.circulating_supply ?? null,
        total_supply:       m.total_supply ?? null,
        max_supply:         m.max_supply ?? null,
        volume_24h_usd:     m.volume_24h_usd ?? null,
        change_24h_pct:     m.change_24h_pct ?? null,
        change_7d_pct:      m.change_7d_pct ?? null,
        change_30d_pct:     m.change_30d_pct ?? null,
        ath:                m.ath ?? null,
        ath_change_pct:     null,
        atl:                m.atl ?? null,
        market_cap_rank:    m.market_cap_rank ?? null,
        tvl_usd:            pro.tvl_usd ?? null,
        liquidity_usd:      null,

        // Activity
        developer_activity: dev.developer_activity ?? dev.commits_30d ?? null,
        github_activity:    dev.commits_30d ?? null,

        // Scores
        payd_score:         aiScore,
        conviction_score:   null,
        alpha_score:        null,
        risk_score:         riskScore,
        risk_label:         riskLabel,
        investment_rating:  investmentRating,
        rating_score:       ratingScore,
        data_coverage_pct:  dataCoveragePct,
        ai_score:           aiScore,
        ai_score_change_7d: aiScore7d,

        // AI investment analysis
        ai_opinion:        null,
        bull_case:         [],
        bear_case:         [],
        investment_thesis: [],

        // V1 misc
        founded:      new Date().getFullYear() - 3,
        headquarters: 'Unavailable',
        team:         [],
        investors:    [],
        partnerships: [],
        roadmap:      [],
        advantages:   [],
        disadvantages:[],
        competitors:  [],
        unlock_schedule: [],

        // Sub-objects для V1 render
        metrics: {
            monthly_active_users: pro.users ?? null,
            monthly_revenue_usd:  pro.revenue ?? null,
            tvl_usd:              pro.tvl_usd ?? null,
            nodes_count:          null,
            market_cap_usd:       m.market_cap_usd ?? null,
            fdv_usd:              m.fdv_usd ?? null,
            price_usd:            m.price_usd ?? null,
            volume_24h_usd:       m.volume_24h_usd ?? null,
            change_24h_pct:       m.change_24h_pct ?? null,
            change_7d_pct:        m.change_7d_pct ?? null,
            change_30d_pct:       m.change_30d_pct ?? null,
            circulating_supply:   m.circulating_supply ?? null,
            total_supply:         m.total_supply ?? null,
            max_supply:           m.max_supply ?? null,
            liquidity_usd:        null,
            next_unlock:          null,
            next_unlock_pct:      tok.next_unlock_pct ?? null,
            next_unlock_date:     tok.next_unlock_date ?? null,
            next_unlock_usd_value:null,
        },

        github: {
            stars:              dev.stars ?? null,
            forks:              null,
            commits_30d:        dev.commits_30d ?? null,
            active_devs_30d:    dev.contributors ?? null,
            contributors_total: dev.contributors ?? null,
            last_commit:        dev.last_commit ?? null,
            repo:               p.githubRepo || p.githubOrg || null,
            primary_languages:  [],
            language:           null,
            open_issues:        null,
            watchers:           null,
            license:            null,
            topics:             [],
            archived:           false,
        },

        tokenomics: {
            initial_supply:  null,
            circulating_pct: (m.circulating_supply != null && m.total_supply > 0) ? (m.circulating_supply / m.total_supply * 100) : null,
            vesting:         null,
            utility:         null,
            buyback_burn:    null,
        },

        social: {
            twitter_handle: p.xHandle || null,
            twitter_url:    p.xHandle ? `https://x.com/${p.xHandle}` : null,
            telegram:       null,
            discord:        null,
            medium:         null,
            blog:           null,
            forum:          null,
            reddit:         null,
        },

        community: {
            twitter_followers:  null,
            telegram_members:   null,
            discord_members:    null,
            reddit_subscribers: null,
            github_stars:       dev.stars ?? null,
        },

        links: {
            website:       p.website || null,
            whitepaper:    null,
            explorer:      null,
            blog:          null,
            documentation: null,
            github:        p.githubRepo ? ('https://github.com/' + p.githubRepo) : (p.githubOrg ? ('https://github.com/' + p.githubOrg) : null),
        },

        market_data: {
            price_usd:          m.price_usd ?? null,
            market_cap_usd:     m.market_cap_usd ?? null,
            fdv_usd:            m.fdv_usd ?? null,
            volume_24h_usd:     m.volume_24h_usd ?? null,
            change_24h_pct:     m.change_24h_pct ?? null,
            change_7d_pct:      m.change_7d_pct ?? null,
            change_30d_pct:     m.change_30d_pct ?? null,
            circulating_supply: m.circulating_supply ?? null,
            total_supply:       m.total_supply ?? null,
            max_supply:         m.max_supply ?? null,
            liquidity_usd:      null,
            ath:                m.ath ?? null,
            ath_change_pct:     null,
            market_cap_rank:    m.market_cap_rank ?? null,
        },

        protocol_data: p.protocol || null,

        ai_score_components: {
            fundamentals: null,
            tokenomics:   null,
            team:         null,
            traction:     null,
        },

        ai_score_history: ai.payd_score != null
            ? [{ date: new Date().toISOString().slice(0, 10), score: aiScore }]
            : [],

        // Multi-sector metadata
        sector_memberships: p.sector_memberships || [],
        canonical_asset_id: p.canonical_asset_id || p.id,
        is_canonical_view:  true,

        // Debug
        _v2_source: {
            id: p.id,
            symbol: p.symbol,
            sector_memberships: p.sector_memberships,
            has_real_scores: ai.payd_score != null,
            field_mapping_version: '3.0-canonical-sso',
        },
    };
    p._v1_view = v1; // memoize
    return v1;
}

/** Возвращает список V1-view объектов из канонического runtime. */
function getCanonicalV1List() {
    const runtime = _getCanonicalRuntime();
    if (!runtime) return null;
    return Array.from(runtime.projects.values()).map(canonicalToV1View).filter(Boolean);
}

/** Возвращает V1-view по ticker или id. */
function getCanonicalV1ByTicker(ticker) {
    if (!ticker) return null;
    const runtime = _getCanonicalRuntime();
    if (!runtime) return null;
    const tk = String(ticker).toUpperCase();
    // Try direct lookup
    let p = runtime.projects.get(tk) || runtime.projects.get(ticker) || runtime.projects.get(String(ticker).toLowerCase());
    if (p) return canonicalToV1View(p);
    // Search by symbol
    for (const obj of runtime.projects.values()) {
        if (obj && obj.symbol && obj.symbol.toUpperCase() === tk) return canonicalToV1View(obj);
    }
    return null;
}

const INTEL_RENDER = {
    /* === Generic helpers === */
    $: (sel, root = document) => root.querySelector(sel),

    /* === Render: Dashboard (Main "Intelligence" page) === */
    renderDashboard(container) {
        const o = D.overview;
        if (!o) return this.renderLoading(container);

        // Defensive: market_overview может быть undefined, если overview — fallback.
        const mo = o.market_overview || {};
        const lastUpdate = U.fmtDate(o.last_updated);
        const riskAlerts = (o.biggest_risks_7d || []).slice(0, 4);
        const unlocks = (o.upcoming_unlocks_7d || []);
        const research = (o.latest_research || []);
        const latestUpdates = (o.weekly_updates || []).slice(0, 4);

        container.innerHTML = `
            <div class="intel-dash-header reveal-on-scroll">
                <div>
                    <h2 class="intel-dash-title">Market Snapshot</h2>
                    <p class="intel-dash-meta">Last sync: ${lastUpdate} · Next agent run: ${U.fmtDate(o.next_run_at)}</p>
                </div>
                <div class="intel-dash-status">
                    <span class="intel-status-dot"></span>
                    <span>AI Agent Online</span>
                </div>
            </div>

            <div class="intel-kpi-grid">
                <div class="intel-kpi reveal-on-scroll">
                    <div class="intel-kpi-label">Market Overview</div>
                    <div class="intel-kpi-value">${U.fmtUSD(mo.total_market_cap_usd)}</div>
                    <div class="intel-kpi-delta ${U.deltaClass(mo.market_cap_change_24h)}">
                        ${U.deltaArrow(mo.market_cap_change_24h)} ${U.fmtPct(mo.market_cap_change_24h)} 24h
                    </div>
                </div>

                <div class="intel-kpi reveal-on-scroll">
                    <div class="intel-kpi-label">Projects Tracked</div>
                    <div class="intel-kpi-value">${U.fmtNum((o.totals || {}).projects_tracked)}</div>
                    <div class="intel-kpi-delta ${U.deltaClass((o.totals || {}).tracked_change_7d)}">
                        ${U.deltaArrow((o.totals || {}).tracked_change_7d)} +${(o.totals || {}).tracked_change_7d || 0} 7d
                    </div>
                </div>

                <div class="intel-kpi reveal-on-scroll">
                    <div class="intel-kpi-label">AI Score Average</div>
                    <div class="intel-kpi-value">${(o.ai_score_average && o.ai_score_average.global != null) ? o.ai_score_average.global.toFixed(1) : '—'}<span class="intel-unit">/100</span></div>
                    <div class="intel-kpi-delta ${U.deltaClass((o.ai_score_average || {}).change_7d)}">
                        ${U.deltaArrow((o.ai_score_average || {}).change_7d)} ${U.fmtPct((o.ai_score_average || {}).change_7d, false)} 7d
                    </div>
                </div>

                <div class="intel-kpi reveal-on-scroll">
                    <div class="intel-kpi-label">Weekly Reports</div>
                    <div class="intel-kpi-value">${o.weekly_reports_count || 24}</div>
                    <div class="intel-kpi-delta is-flat">Published Mon · Thu</div>
                </div>

                <div class="intel-kpi reveal-on-scroll">
                    <div class="intel-kpi-label">Top Opportunities</div>
                    <div class="intel-kpi-value">${(o.weekly_opportunities || {}).count || 0}</div>
                    <div class="intel-kpi-delta is-flat">Top: ${U.esc((o.weekly_opportunities || {}).top_sector || '—')}</div>
                </div>

                <div class="intel-kpi reveal-on-scroll">
                    <div class="intel-kpi-label">Risk Alerts</div>
                    <div class="intel-kpi-value">${riskAlerts.length}</div>
                    <div class="intel-kpi-delta is-flat">${mo.fear_greed_index != null ? mo.fear_greed_index : '—'} · ${U.esc(mo.fear_greed_label || '—')}</div>
                </div>

                <div class="intel-kpi reveal-on-scroll">
                    <div class="intel-kpi-label">Upcoming Unlocks</div>
                    <div class="intel-kpi-value">${unlocks.length}</div>
                    <div class="intel-kpi-delta is-flat">Next 30 days</div>
                </div>

                <div class="intel-kpi reveal-on-scroll">
                    <div class="intel-kpi-label">Latest Research</div>
                    <div class="intel-kpi-value">${research.length}</div>
                    <div class="intel-kpi-delta is-flat">New this week</div>
                </div>

                <div class="intel-kpi reveal-on-scroll">
                    <div class="intel-kpi-label">Latest Updates</div>
                    <div class="intel-kpi-value">${latestUpdates.length}</div>
                    <div class="intel-kpi-delta is-flat">Last: ${lastUpdate}</div>
                </div>
            </div>

            <div class="intel-cols-2">
                <div class="intel-list reveal-on-scroll">
                    <h4 class="intel-list-title">Top Opportunities · 7d</h4>
                    ${((o.weekly_opportunities || {}).highlighted || []).slice(0, 5).map(m => `
                        <div class="intel-list-item">
                            <div class="intel-list-rank">${U.esc(m.ticker.slice(0, 3))}</div>
                            <div class="intel-list-main">
                                <div class="intel-list-name">${U.esc(m.name)}</div>
                                <div class="intel-list-meta">AI Score: <strong style="color:var(--intel-gold);">${m.score}</strong> · Momentum +${U.fmtPct(m.delta, false)}</div>
                            </div>
                            <div class="intel-list-value ${U.deltaClass(m.delta)}">${U.fmtPct(m.delta)}</div>
                        </div>
                    `).join('')}
                </div>

                <div class="intel-list reveal-on-scroll">
                    <h4 class="intel-list-title">Risk Alerts</h4>
                    ${riskAlerts.map(r => `
                        <div class="intel-list-item">
                            <div class="intel-list-rank">!</div>
                            <div class="intel-list-main">
                                <div class="intel-list-name">${U.esc(r.name)}</div>
                                <div class="intel-list-meta">${U.esc(r.risk)}</div>
                            </div>
                            <span class="intel-risk ${U.severityClass(r.severity)}">${U.esc(r.severity)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="intel-cols-2">
                <div class="intel-list reveal-on-scroll">
                    <h4 class="intel-list-title">Upcoming Unlocks · 30d</h4>
                    ${unlocks.length === 0 ? '<div class="intel-empty">No major unlocks in the next 30 days.</div>' : unlocks.map(u => `
                        <div class="intel-list-item">
                            <div class="intel-list-rank">${U.esc(u.ticker.slice(0, 3))}</div>
                            <div class="intel-list-main">
                                <div class="intel-list-name">${U.esc(u.name)}</div>
                                <div class="intel-list-meta">${U.fmtDate(u.date)} · ${u.pct_supply.toFixed(2)}% supply</div>
                            </div>
                            <div class="intel-list-value" style="color:var(--intel-orange);">${U.esc(u.usd_value)}</div>
                        </div>
                    `).join('')}
                </div>

                <div class="intel-list reveal-on-scroll">
                    <h4 class="intel-list-title">Latest Research</h4>
                    ${research.length === 0 ? '<div class="intel-empty">No research published this week.</div>' : research.map(r => `
                        <div class="intel-list-item" style="cursor:pointer;" data-ticker="${U.esc(r.ticker || '')}">
                            <div class="intel-list-rank">${U.esc((r.ticker || 'DOC').slice(0, 3))}</div>
                            <div class="intel-list-main">
                                <div class="intel-list-name">${U.esc(r.title)}</div>
                                <div class="intel-list-meta">${U.esc(r.type)} · ${U.fmtDate(r.date)}</div>
                            </div>
                            <div class="intel-list-value" style="color:var(--intel-violet); font-size:11px;">Open ›</div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <h3 class="intel-section-title reveal-on-scroll">Latest Updates</h3>
            <div class="intel-card-grid">
                ${latestUpdates.map(upd => `
                    <div class="intel-project-card reveal-on-scroll" style="cursor:default;">
                        <div class="intel-card-top">
                            <div class="intel-list-main">
                                <div class="intel-list-name" style="font-size:15px;">${U.esc(upd.title)}</div>
                                <div class="intel-list-meta">${U.fmtDate(upd.date)} · ${U.esc(upd.category)}</div>
                            </div>
                            <span class="intel-risk ${upd.impact === 'positive' ? 'intel-risk-low' : (upd.impact === 'negative' ? 'intel-risk-high' : 'intel-risk-medium')}">${U.esc(upd.impact)}</span>
                        </div>
                        <div class="intel-card-summary" style="border-top:none; padding-top:0; margin-top:0;">
                            ${U.esc(upd.summary)}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        U.observeReveal(container);

        // Attach research click → project detail
        container.querySelectorAll('[data-ticker]').forEach(el => {
            const t = el.dataset.ticker;
            if (!t) return;
            // CANONICAL SSO: используем canonical runtime для проверки существования
            const inCanonical = !!getCanonicalV1ByTicker(t);
            const inLegacy    = !!(D.projects && D.projects.projects[t]);
            if (inCanonical || inLegacy) {
                el.addEventListener('click', () => window.PAYD_INTEL_ROUTER.go('project', { ticker: t }));
            }
        });
    },

    /* === Render: DePIN Intelligence — Professional Table === */
    renderDePIN(container) {
        const d = D.depin;
        if (!d) return this.renderLoading(container);

        const sorted = [...d.projects].sort(U.compareByScoreDesc(p => p.ai_score));

        container.innerHTML = `
            <div class="intel-subhead reveal-on-scroll">
                <div>
                    <h3>DePIN Intelligence · ${d.total_projects} tracked projects</h3>
                    <div class="intel-subhead-meta">Last sync: ${U.fmtDate(d.last_updated)} · Sorted by AI Score</div>
                </div>
                <div class="intel-subhead-actions">
                    <button class="intel-btn intel-btn-ghost" id="intel-depin-export" type="button">Export CSV</button>
                </div>
            </div>

            <div class="intel-table-wrap reveal-on-scroll">
                <table class="intel-table intel-table-depin">
                    <thead>
                        <tr>
                            <th class="col-logo">Logo</th>
                            <th class="col-name">Project</th>
                            <th class="col-ticker">Ticker</th>
                            <th class="cell-num">AI Score</th>
                            <th class="cell-num">Risk</th>
                            <th class="cell-num">Dev Activity</th>
                            <th class="cell-num">GitHub</th>
                            <th class="cell-num">Users</th>
                            <th class="cell-num">Revenue</th>
                            <th class="cell-num">TVL</th>
                            <th class="cell-num">Nodes</th>
                            <th class="cell-num">Market Cap</th>
                            <th class="cell-num">FDV</th>
                            <th class="cell-num">Unlock</th>
                            <th>Investment Rating</th>
                            <th class="col-action">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sorted.map(p => this.depinRow(p)).join('')}
                    </tbody>
                </table>
            </div>
        `;

        // Row click → project detail
        container.querySelectorAll('.intel-depin-row').forEach(row => {
            row.addEventListener('click', (e) => {
                // Don't navigate if clicking the action button (it has its own handler)
                if (e.target.closest('.intel-btn')) return;
                window.PAYD_INTEL_ROUTER.go('project', { ticker: row.dataset.ticker });
            });
        });
        container.querySelectorAll('.intel-btn-open-research').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.PAYD_INTEL_ROUTER.go('project', { ticker: btn.dataset.ticker });
            });
        });

        // Export CSV
        const exportBtn = container.querySelector('#intel-depin-export');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportDePINCSV(sorted));
        }

        U.observeReveal(container);
    },

    depinRow(p) {
        const m = p.metrics || {};
        const aiDelta = p.ai_score_change_7d || 0;
        const aiClass = aiDelta >= 0 ? 'is-up' : 'is-down';
        const riskClass = U.riskClass(p.risk_label);

        // Safe formatters: NEVER use 0 as a placeholder for missing data.
        // 'fmt' helpers already return "Unavailable" for null/undefined.
        // For raw numbers we explicitly check and substitute.
        const numCell = (v) => (v === null || v === undefined || v === '' || Number.isNaN(v)) ? 'Unavailable' : v;
        const usdCell = (v) => (v === null || v === undefined || v === '' || Number.isNaN(v)) ? 'Unavailable' : U.fmtUSD(v, true);
        const usdCellBig = (v) => (v === null || v === undefined || v === '' || Number.isNaN(v)) ? 'Unavailable' : U.fmtUSD(v);
        const compactCell = (v) => (v === null || v === undefined || v === '' || Number.isNaN(v)) ? 'Unavailable' : U.fmtCompact(v);
        const pctCell = (v) => (v === null || v === undefined || v === '' || Number.isNaN(v)) ? 'Unavailable' : (Number(v).toFixed(2) + '%');
        const dateCell = (v) => U.fmtDate(v);
        const dataCoverage = (typeof p.data_coverage_pct === 'number') ? p.data_coverage_pct : null;
        const showRating = dataCoverage !== null && dataCoverage >= 50 && !!p.investment_rating;
        const ratingText = showRating ? p.investment_rating : 'Insufficient Data';
        const ratingCls  = showRating ? U.ratingClass(p.investment_rating) : 'intel-rating-hold';

        return `
            <tr class="intel-depin-row" data-ticker="${U.esc(p.ticker)}" tabindex="0">
                <td class="col-logo"><div class="intel-row-logo">${U.esc(p.logo || '◇')}</div></td>
                <td class="col-name">
                    <div class="intel-row-name">${U.esc(p.name)}</div>
                    <div class="intel-row-subsector">${U.esc(p.subsector || '')}</div>
                </td>
                <td class="col-ticker"><span class="intel-row-ticker">${U.esc(p.ticker)}</span></td>
                <td class="cell-num">
                    <div class="intel-row-score">
                        <strong>${U.fmtScore(p.ai_score)}</strong>
                        <span class="intel-row-delta ${aiClass}">${U.deltaArrow(aiDelta)} ${U.fmtPctSafe(aiDelta, false)}</span>
                    </div>
                </td>
                <td class="cell-num"><span class="intel-risk ${riskClass}">${U.fmtRisk(p.risk_score)}<span class="intel-risk-sub">${U.esc(U.fmtLabel(p.risk_label))}</span></span></td>
                <td class="cell-num cell-mono">${numCell(p.developer_activity)}</td>
                <td class="cell-num cell-mono">${numCell(p.github_activity)}</td>
                <td class="cell-num cell-mono">${compactCell(m.monthly_active_users)}</td>
                <td class="cell-num cell-mono">${usdCellBig(m.monthly_revenue_usd)}</td>
                <td class="cell-num cell-mono">${usdCellBig(m.tvl_usd)}</td>
                <td class="cell-num cell-mono">${numCell(m.nodes_count)}</td>
                <td class="cell-num cell-mono">${usdCellBig(m.market_cap_usd)}</td>
                <td class="cell-num cell-mono">${usdCellBig(m.fdv_usd)}</td>
                <td class="cell-num">
                    <div class="intel-row-unlock">
                        <div>${dateCell(m.next_unlock)}</div>
                        <div class="intel-row-unlock-pct">${pctCell(m.next_unlock_pct)}</div>
                    </div>
                </td>
                <td><span class="intel-rating-pill ${ratingCls}">${U.esc(ratingText)}</span></td>
                <td class="col-action">
                    <button class="intel-btn intel-btn-primary intel-btn-open-research" data-ticker="${U.esc(p.ticker)}" type="button">Open Research</button>
                </td>
            </tr>
        `;
    },

    exportDePINCSV(projects) {
        const cols = ['Ticker', 'Name', 'Subsector', 'AI Score', 'Risk Score', 'Risk Label',
                      'Developer Activity', 'GitHub Activity', 'Users', 'Revenue (USD)',
                      'TVL (USD)', 'Nodes', 'Market Cap (USD)', 'FDV (USD)',
                      'Next Unlock', 'Unlock %', 'Investment Rating'];
        const rows = projects.map(p => [
            p.ticker, p.name, p.subsector || '', p.ai_score, p.risk_score, p.risk_label,
            p.developer_activity, p.github_activity,
            U.projField(p, 'metrics', 'monthly_active_users') ?? '',
            U.projField(p, 'metrics', 'monthly_revenue_usd') ?? '',
            U.projField(p, 'metrics', 'tvl_usd') ?? '',
            U.projField(p, 'metrics', 'nodes_count') ?? '',
            U.projField(p, 'metrics', 'market_cap_usd') ?? '',
            U.projField(p, 'metrics', 'fdv_usd') ?? '',
            (p.metrics && p.metrics.next_unlock) || '',
            U.projField(p, 'metrics', 'next_unlock_pct') ?? '',
            p.investment_rating,
        ]);
        const csv = [cols, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'payd-depin-' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    /* === Render: AI Infrastructure === */
    renderAIInfra(container) {
        const d = D.aiInfra;
        if (!d) return this.renderLoading(container);

        const cats = d.categories;
        const catKeys = Object.keys(cats);

        container.innerHTML = `
            <div class="intel-subtabs" id="intel-ai-subtabs">
                ${catKeys.map((k, i) => `
                    <button class="intel-subtab ${i === 0 ? 'is-active' : ''}" data-cat="${U.esc(k)}">
                        ${U.esc(cats[k].label)} <span style="color:var(--intel-text-faint);font-weight:400;">· ${cats[k].projects.length}</span>
                    </button>
                `).join('')}
            </div>
            <div id="intel-ai-subcontent">
                ${this.renderAICategory(cats[catKeys[0]], true)}
            </div>
        `;

        const subtabs = container.querySelectorAll('.intel-subtab');
        const subcontent = container.querySelector('#intel-ai-subcontent');
        subtabs.forEach(t => {
            t.addEventListener('click', () => {
                subtabs.forEach(s => s.classList.remove('is-active'));
                t.classList.add('is-active');
                subcontent.innerHTML = this.renderAICategory(cats[t.dataset.cat]);
                this.attachCardHandlers(subcontent);
                U.observeReveal(subcontent);
            });
        });

        this.attachCardHandlers(subcontent);
        U.observeReveal(container);
    },

    renderAICategory(cat, isFirst = false) {
        if (!cat) return '';
        return `
            <div class="intel-list" style="margin-bottom:20px;">
                <h4 class="intel-list-title">${U.esc(cat.label)}</h4>
                <div class="intel-list-meta" style="font-size:13px; line-height:1.5;">${U.esc(cat.description)}</div>
            </div>
            <div class="intel-card-grid">
                ${[...cat.projects].sort(U.compareByScoreDesc(p => p.ai_score)).map(p => this.projectCard(p)).join('')}
            </div>
        `;
    },

    /* === Render: Watchlist (admin-curated) === */
    renderWatchlist(container) {
        const d = D.watchlist;
        if (!d) return this.renderLoading(container);

        container.innerHTML = `
            <div class="intel-list" style="margin-bottom:24px;">
                <h4 class="intel-list-title">${U.esc(d.description)}</h4>
                <div class="intel-list-meta" style="font-size:13px; line-height:1.5;">
                    <strong>${d.count} projects</strong> · Curated by ${U.esc(d.curated_by)} · Updated ${d.update_frequency.toLowerCase()}
                </div>
            </div>
            <div class="intel-card-grid">
                ${d.watchlist.map(p => `
                    <div class="intel-project-card reveal-on-scroll" data-ticker="${U.esc(p.ticker)}" role="button" tabindex="0">
                        ${this.projectCardBody(p)}
                        <div class="intel-card-summary">
                            <strong style="color:var(--intel-text);">Thesis:</strong> ${U.esc(p.thesis)}
                        </div>
                        <div style="margin-top:12px; font-size:11px; color:var(--intel-text-faint);">
                            In watchlist since ${U.fmtDate(p.added_at)}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        this.attachCardHandlers(container);
        U.observeReveal(container);
    },

    /* === Render: Opportunity Scanner === */
    renderOpportunities(container) {
        const d = D.opportunities;
        if (!d) return this.renderLoading(container);

        container.innerHTML = `
            <div class="intel-list" style="margin-bottom:24px;">
                <h4 class="intel-list-title">Opportunity Scanner · ${d.total_flagged} flagged</h4>
                <div class="intel-list-meta" style="font-size:13px; line-height:1.5;">
                    <strong>Scan logic:</strong> ${U.esc(d.scan_logic)}<br>
                    <strong>Window:</strong> ${d.scan_window_days}d momentum vs ${d.baseline_window_days}d baseline
                </div>
            </div>
            ${d.opportunities.map(opp => `
                <div class="intel-block reveal-on-scroll">
                    <div class="intel-card-top" style="margin-bottom:16px;">
                        <div class="intel-project-logo">${U.esc(opp.logo)}</div>
                        <div class="intel-project-id">
                            <div class="intel-project-name">${U.esc(opp.name)}</div>
                            <div class="intel-project-ticker">${U.esc(opp.ticker)} · ${U.esc(opp.sector)} · ${U.esc(opp.subsector)}</div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:11px; color:var(--intel-text-faint); letter-spacing:0.08em; text-transform:uppercase;">Conviction</div>
                            <div style="font-size:14px; font-weight:700; color:var(--intel-gold);">${U.esc(opp.conviction)}</div>
                        </div>
                    </div>

                    <div class="intel-component-grid" style="grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); margin-bottom:18px;">
                        <div class="intel-component">
                            <div class="intel-component-head">
                                <span class="intel-component-name">AI Score</span>
                            </div>
                            <div class="intel-component-score">${U.fmtScore(opp.ai_score)}</div>
                            <div class="intel-component-bar"><div class="intel-component-bar-fill" style="width:${U.safeWidthPct(opp.ai_score)}%"></div></div>
                            <div style="font-size:11px; margin-top:6px; color:${U.deltaClass(opp.ai_score_change_7d) === 'is-up' ? 'var(--intel-green)' : (U.deltaClass(opp.ai_score_change_7d) === 'is-down' ? 'var(--intel-red)' : 'var(--intel-text-faint)')}">
                                ${U.deltaArrow(opp.ai_score_change_7d)} ${U.fmtPctSafe(opp.ai_score_change_7d, false)} 7d
                            </div>
                        </div>
                        <div class="intel-component">
                            <div class="intel-component-head">
                                <span class="intel-component-name">Momentum</span>
                            </div>
                            <div class="intel-component-score">${opp.momentum_score}</div>
                            <div class="intel-component-bar"><div class="intel-component-bar-fill" style="width:${opp.momentum_score}%; background:linear-gradient(90deg, #4ADE80, #F3C94A);"></div></div>
                            <div style="font-size:11px; margin-top:6px; color:${U.deltaClass(opp.momentum_change_7d) === 'is-up' ? 'var(--intel-green)' : (U.deltaClass(opp.momentum_change_7d) === 'is-down' ? 'var(--intel-red)' : 'var(--intel-text-faint)')}">
                                ${U.deltaArrow(opp.momentum_change_7d)} ${U.fmtPct(opp.momentum_change_7d, false)} 7d
                            </div>
                        </div>
                    </div>

                    <h4 style="font-size:13px; font-weight:600; color:var(--intel-text-dim); letter-spacing:0.08em; text-transform:uppercase; margin:18px 0 10px;">Fundamental Deltas</h4>
                    <table class="intel-table">
                        <thead>
                            <tr>
                                <th>Metric</th>
                                <th class="cell-num">Current</th>
                                <th class="cell-num">90d Avg</th>
                                <th class="cell-num">Δ</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.entries(opp.fundamental_delta).map(([k, v]) => `
                                <tr>
                                    <td>${U.esc(k.replace(/_/g, ' '))}</td>
                                    <td class="cell-num cell-mono">${typeof v.current === 'number' && v.current > 1000 ? U.fmtCompact(v.current) : U.fmtNum(v.current)}</td>
                                    <td class="cell-num cell-mono">${typeof v.previous_avg === 'number' && v.previous_avg > 1000 ? U.fmtCompact(v.previous_avg) : U.fmtNum(v.previous_avg)}</td>
                                    <td class="cell-num" style="color:${v.delta_pct >= 0 ? 'var(--intel-green)' : 'var(--intel-red)'};">${U.fmtPct(v.delta_pct, false)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>

                    <h4 style="font-size:13px; font-weight:600; color:var(--intel-text-dim); letter-spacing:0.08em; text-transform:uppercase; margin:20px 0 10px;">Signal Triggers</h4>
                    <ul style="margin:0; padding-left:20px; color:var(--intel-text-dim); font-size:14px; line-height:1.7;">
                        ${opp.signal_triggers.map(s => `<li>${U.esc(s)}</li>`).join('')}
                    </ul>

                    <h4 style="font-size:13px; font-weight:600; color:var(--intel-text-dim); letter-spacing:0.08em; text-transform:uppercase; margin:20px 0 10px;">AI Investment Opinion</h4>
                    <p style="font-size:14px; line-height:1.65; color:var(--intel-text);">${U.esc(opp.ai_investment_opinion)}</p>

                    ${opp.risk_factors && opp.risk_factors.length ? `
                        <h4 style="font-size:13px; font-weight:600; color:var(--intel-text-dim); letter-spacing:0.08em; text-transform:uppercase; margin:20px 0 10px;">Risk Factors</h4>
                        <ul style="margin:0; padding-left:20px; color:var(--intel-red); font-size:14px; line-height:1.7;">
                            ${opp.risk_factors.map(r => `<li>${U.esc(r)}</li>`).join('')}
                        </ul>
                    ` : ''}
                </div>
            `).join('')}
        `;
        U.observeReveal(container);
    },

    /* === Render: Weekly Intelligence === */
    renderWeeklyReports(container) {
        const d = D.weeklyReports;
        if (!d) return this.renderLoading(container);

        const reports = d.reports;
        const archived = d.total_reports_archived;

        container.innerHTML = `
            <div class="intel-list" style="margin-bottom:24px;">
                <h4 class="intel-list-title">Weekly Intelligence Schedule</h4>
                <div class="intel-list-meta" style="font-size:13px; line-height:1.5;">
                    <strong>Published:</strong> ${U.esc(d.schedule)}<br>
                    <strong>Archived reports:</strong> ${archived} · <strong>Last run:</strong> ${U.fmtDate(d.last_run_at)}
                </div>
            </div>
            ${reports.map((r, i) => `
                <div class="intel-block reveal-on-scroll">
                    <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:20px; margin-bottom:14px; flex-wrap:wrap;">
                        <div>
                            <div style="font-size:11px; color:var(--intel-text-faint); letter-spacing:0.08em; text-transform:uppercase; margin-bottom:4px;">
                                ${U.esc(r.type)} · ${U.fmtDate(r.date)} · ${U.esc(r.id)}
                            </div>
                            <h3 style="font-size:22px; font-weight:700; color:var(--intel-text); margin:0; letter-spacing:-0.01em;">${U.esc(r.title)}</h3>
                        </div>
                    </div>
                    <p style="font-size:14px; line-height:1.65; color:var(--intel-text-dim); margin-bottom:20px;">${U.esc(r.summary)}</p>

                    <h4 style="font-size:13px; font-weight:600; color:var(--intel-gold); letter-spacing:0.08em; text-transform:uppercase; margin:20px 0 10px;">Market Overview</h4>
                    <div class="intel-component-grid" style="grid-template-columns:repeat(auto-fill, minmax(150px, 1fr));">
                        <div class="intel-component"><div class="intel-component-name">Market Cap</div><div class="intel-component-score">${U.esc(r.market_overview.total_market_cap)}</div></div>
                        <div class="intel-component"><div class="intel-component-name">7d Change</div><div class="intel-component-score" style="color:${r.market_overview.market_cap_change_7d >= 0 ? 'var(--intel-green)' : 'var(--intel-red)'};">${U.fmtPct(r.market_overview.market_cap_change_7d)}</div></div>
                        <div class="intel-component"><div class="intel-component-name">BTC Dom</div><div class="intel-component-score">${r.market_overview.btc_dominance}%</div></div>
                        <div class="intel-component"><div class="intel-component-name">Fear &amp; Greed</div><div class="intel-component-score">${r.market_overview.fear_greed}</div></div>
                    </div>
                    <p style="font-size:14px; line-height:1.65; color:var(--intel-text-dim); margin-top:14px;"><strong>Macro:</strong> ${U.esc(r.market_overview.key_macro)}</p>

                    <h4 style="font-size:13px; font-weight:600; color:var(--intel-gold); letter-spacing:0.08em; text-transform:uppercase; margin:20px 0 10px;">Top Opportunities</h4>
                    ${r.top_opportunities.map(o => `
                        <div style="padding:10px 0; border-bottom:1px solid var(--intel-border);">
                            <strong style="color:var(--intel-text);">${U.esc(o.ticker)}:</strong>
                            <span style="color:var(--intel-text-dim); font-size:14px;"> ${U.esc(o.thesis)}</span>
                        </div>
                    `).join('')}

                    ${r.biggest_ecosystem_growth ? `
                    <h4 style="font-size:13px; font-weight:600; color:var(--intel-gold); letter-spacing:0.08em; text-transform:uppercase; margin:20px 0 10px;">Biggest Ecosystem Growth</h4>
                    ${r.biggest_ecosystem_growth.map(g => `
                        <div style="padding:10px 0; border-bottom:1px solid var(--intel-border); display:flex; justify-content:space-between; gap:14px; flex-wrap:wrap;">
                            <div>
                                <strong style="color:var(--intel-text);">${U.esc(g.ticker)}</strong>
                                <span style="color:var(--intel-text-faint); font-size:13px; margin-left:6px;">${U.esc(g.metric)}: ${U.esc(g.value)}</span>
                                <div style="color:var(--intel-text-dim); font-size:13px; margin-top:2px;">${U.esc(g.comment)}</div>
                            </div>
                            <div style="color:var(--intel-green); font-weight:600; font-size:14px; white-space:nowrap;">${U.fmtPct(g.delta_pct, false)}</div>
                        </div>
                    `).join('')}
                    ` : ''}

                    ${r.most_active_developers ? `
                    <h4 style="font-size:13px; font-weight:600; color:var(--intel-gold); letter-spacing:0.08em; text-transform:uppercase; margin:20px 0 10px;">Most Active Developers</h4>
                    <table class="intel-table">
                        <thead><tr><th>Project</th><th class="cell-num">Active Devs (30d)</th><th class="cell-num">Δ</th><th>Comment</th></tr></thead>
                        <tbody>
                            ${r.most_active_developers.map(d => `
                                <tr>
                                    <td><strong>${U.esc(d.ticker)}</strong></td>
                                    <td class="cell-num cell-mono">${d.active_devs_30d}</td>
                                    <td class="cell-num" style="color:${d.delta_pct >= 0 ? 'var(--intel-green)' : 'var(--intel-red)'};">${U.fmtPct(d.delta_pct, false)}</td>
                                    <td style="color:var(--intel-text-dim); font-size:13px;">${U.esc(d.comment)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    ` : ''}

                    ${r.github_leaders ? `
                    <h4 style="font-size:13px; font-weight:600; color:var(--intel-gold); letter-spacing:0.08em; text-transform:uppercase; margin:20px 0 10px;">GitHub Leaders</h4>
                    <table class="intel-table">
                        <thead><tr><th>Project</th><th class="cell-num">Commits (30d)</th><th>Comment</th></tr></thead>
                        <tbody>
                            ${r.github_leaders.map(g => `
                                <tr>
                                    <td><strong>${U.esc(g.ticker)}</strong></td>
                                    <td class="cell-num cell-mono">${g.commits_30d}</td>
                                    <td style="color:var(--intel-text-dim); font-size:13px;">${U.esc(g.comment)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    ` : ''}

                    ${r.new_partnerships ? `
                    <h4 style="font-size:13px; font-weight:600; color:var(--intel-gold); letter-spacing:0.08em; text-transform:uppercase; margin:20px 0 10px;">New Partnerships</h4>
                    ${r.new_partnerships.map(p => `
                        <div style="padding:10px 0; border-bottom:1px solid var(--intel-border);">
                            <strong style="color:var(--intel-text);">${U.esc(p.ticker)} × ${U.esc(p.partner)}</strong>
                            <div style="color:var(--intel-text-dim); font-size:13px; margin-top:2px;">${U.esc(p.summary)}</div>
                        </div>
                    `).join('')}
                    ` : ''}

                    ${r.investment_rounds ? `
                    <h4 style="font-size:13px; font-weight:600; color:var(--intel-gold); letter-spacing:0.08em; text-transform:uppercase; margin:20px 0 10px;">Investment Rounds</h4>
                    <table class="intel-table">
                        <thead><tr><th>Company</th><th>Round</th><th class="cell-num">Amount</th><th>Lead</th><th>Date</th></tr></thead>
                        <tbody>
                            ${r.investment_rounds.map(ir => `
                                <tr>
                                    <td><strong>${U.esc(ir.company)}</strong></td>
                                    <td>${U.esc(ir.round)}</td>
                                    <td class="cell-num cell-mono">${U.esc(ir.amount)}</td>
                                    <td>${U.esc(ir.lead)}</td>
                                    <td>${U.fmtDate(ir.date)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    ` : ''}

                    ${r.upcoming_unlocks ? `
                    <h4 style="font-size:13px; font-weight:600; color:var(--intel-orange); letter-spacing:0.08em; text-transform:uppercase; margin:20px 0 10px;">Upcoming Unlocks</h4>
                    <table class="intel-table">
                        <thead><tr><th>Project</th><th>Date</th><th class="cell-num">% Supply</th><th class="cell-num">USD Value</th><th>Note</th></tr></thead>
                        <tbody>
                            ${r.upcoming_unlocks.map(u => `
                                <tr>
                                    <td><strong>${U.esc(u.ticker)}</strong></td>
                                    <td>${U.fmtDate(u.date)}</td>
                                    <td class="cell-num cell-mono">${u.pct_supply.toFixed(2)}%</td>
                                    <td class="cell-num cell-mono">${U.esc(u.usd_value)}</td>
                                    <td style="color:var(--intel-text-dim); font-size:13px;">${U.esc(u.comment)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    ` : ''}

                    ${r.risk_alerts ? `
                    <h4 style="font-size:13px; font-weight:600; color:var(--intel-red); letter-spacing:0.08em; text-transform:uppercase; margin:20px 0 10px;">Risk Alerts</h4>
                    ${r.risk_alerts.map(ra => `
                        <div style="padding:10px 0; border-bottom:1px solid var(--intel-border); display:flex; align-items:flex-start; gap:10px;">
                            <span class="intel-risk ${U.severityClass(ra.severity)}" style="margin-left:0; margin-top:2px; flex-shrink:0;">${U.esc(ra.severity)}</span>
                            <div>
                                <strong style="color:var(--intel-text);">${U.esc(ra.ticker)}</strong>
                                <span style="color:var(--intel-text-dim); font-size:14px;"> — ${U.esc(ra.alert)}</span>
                            </div>
                        </div>
                    `).join('')}
                    ` : ''}

                    <h4 style="font-size:13px; font-weight:600; color:var(--intel-gold); letter-spacing:0.08em; text-transform:uppercase; margin:20px 0 10px;">AI Conclusions</h4>
                    <p style="font-size:14px; line-height:1.65; color:var(--intel-text); background:rgba(124,92,255,0.06); padding:16px; border-radius:8px; border-left:3px solid var(--intel-violet);">${U.esc(r.ai_conclusions)}</p>

                    ${r.metadata ? `
                    <div style="margin-top:20px; padding-top:14px; border-top:1px solid var(--intel-border); font-size:11px; color:var(--intel-text-faint);">
                        <strong>Agent metadata:</strong>
                        ${U.fmtNum(r.metadata.tokens_analyzed)} tokens analyzed ·
                        ${U.fmtCompact(r.metadata.data_points_processed)} data points ·
                        ${r.metadata.apis_called.join(', ')} ·
                        ${U.esc(r.metadata.agent_version)} ·
                        ${r.metadata.compute_time_seconds}s compute
                    </div>
                    ` : ''}
                </div>
            `).join('')}

            <div style="text-align:center; padding:24px; color:var(--intel-text-faint); font-size:13px;">
                <strong style="color:var(--intel-text);">${archived - reports.length} earlier reports</strong> archived in the system. Use navigation menu to access historical reports.
            </div>
        `;
        U.observeReveal(container);
    },

    /* === Render: Project Detail (Project Research) ===
       CANONICAL SSO: проект ищется в каноническом runtime по id/symbol.
       Тот же объект, что и в sector views — никаких расхождений. */
    renderProjectDetail(container, ticker) {
        // Приоритет 1: канонический runtime
        let p = getCanonicalV1ByTicker(ticker);
        // Приоритет 2: legacy fallback
        if (!p) {
            const d = D.projects;
            if (!d) return this.renderLoading(container);
            p = d.projects[ticker] || null;
        }
        if (!p) {
            container.innerHTML = `
                <button class="intel-detail-back" id="intel-back-btn">← Back to Intelligence</button>
                <div class="intel-empty">Project "${U.esc(ticker)}" not found in current dataset.</div>
            `;
            container.querySelector('#intel-back-btn').addEventListener('click', () => window.PAYD_INTEL_ROUTER.go('dashboard'));
            return;
        }

        const scoreChange = p.ai_score_change_7d;

        // ── PAYD ALPHA ENGINE ─────────────────────────────────────────────
        // Данные из IntelligenceDatabase подгружаются асинхронно внутри
        // _renderAlphaScores (см. ниже). Это нужно для совместимости с
        // IntelligenceDatabase, у которого read-методы возвращают Promise.
        // ─────────────────────────────────────────────────────────────────

        container.innerHTML = `
            <button class="intel-detail-back" id="intel-back-btn">← Back to Intelligence</button>

            <div class="intel-detail-hero reveal-on-scroll">
                <div class="intel-detail-logo">${U.esc(p.logo)}</div>
                <div class="intel-detail-id">
                    <h1>${U.esc(p.name)}</h1>
                    <div class="intel-detail-meta">
                        <span><strong>${U.esc(p.ticker)}</strong></span>
                        <span>·</span>
                        <span>${U.esc(p.sector)}</span>
                        <span>·</span>
                        <span>${U.esc(p.subsector)}</span>
                        <span>·</span>
                        <span>${U.esc(p.headquarters)}</span>
                        <span>·</span>
                        <span>Founded ${p.founded}</span>
                    </div>
                </div>
                <div class="intel-detail-score">
                    <div class="intel-detail-score-label">AI Score</div>
                    <div class="intel-detail-score-value">${U.fmtScore(p.ai_score)}</div>
                    <div class="intel-detail-score-delta ${U.deltaClass(scoreChange)}">${U.deltaArrow(scoreChange)} ${U.fmtPct(scoreChange, false)} 7d</div>
                </div>
            </div>

            <!-- === PAYD ALPHA ENGINE — 3 score cards + AI summary + history + labels + timeline === -->
            <div class="payd-alpha-section reveal-on-scroll" id="payd-alpha-scores-${U.esc(ticker)}" data-ticker="${U.esc(ticker)}">
                <div class="payd-alpha-section-head">
                    <div class="payd-alpha-section-title">PAYD Alpha Engine</div>
                    <div class="payd-alpha-section-subtitle">Quality · Confidence · Opportunity</div>
                </div>
                <div class="payd-alpha-loading">Loading 3-score analysis…</div>
            </div>

            <div class="intel-cols-2">
                <div class="intel-block reveal-on-scroll">
                    <h3>Rating &amp; Risk</h3>
                    <p>
                        <span class="intel-rating-pill ${U.ratingClass(p.investment_rating)}">${U.esc(U.fmtLabel(p.investment_rating))}</span>
                        <span style="margin-left:10px; color:var(--intel-text-dim);">Rating: ${U.fmtRating(p.rating_score)}</span>
                    </p>
                    <p>
                        <strong style="color:var(--intel-text);">Risk Score:</strong>
                        <span class="intel-risk ${U.riskClass(p.risk_label)}">${U.fmtRisk(p.risk_score)} · ${U.esc(U.fmtLabel(p.risk_label))}</span>
                    </p>
                </div>
                <div class="intel-block reveal-on-scroll">
                    <h3>Quick Stats</h3>
                    <p>
                        <strong style="color:var(--intel-text);">Market Cap:</strong>
                        <span style="font-variant-numeric:tabular-nums;">${U.fmtUSD(U.projField(p, 'metrics', 'market_cap_usd'))}</span>
                        &nbsp;·&nbsp;
                        <strong style="color:var(--intel-text);">FDV:</strong>
                        <span style="font-variant-numeric:tabular-nums;">${U.fmtUSD(U.projField(p, 'metrics', 'fdv_usd'))}</span>
                    </p>
                    <p>
                        <strong style="color:var(--intel-text);">TVL:</strong> ${U.fmtUSD(U.projField(p, 'metrics', 'tvl_usd'))}
                        &nbsp;·&nbsp;
                        <strong style="color:var(--intel-text);">Monthly Revenue:</strong> ${U.fmtUSD(U.projField(p, 'metrics', 'monthly_revenue_usd'))}
                    </p>
                    <p>
                        <strong style="color:var(--intel-text);">Next unlock:</strong>
                        ${U.fmtDate(U.projField(p, 'metrics', 'next_unlock_date'))} · ${U.fmtFixed(U.projField(p, 'metrics', 'next_unlock_pct'), 2)}% · ${U.esc(U.projField(p, 'metrics', 'next_unlock_usd_value'))}
                    </p>
                </div>
            </div>

            <div class="intel-block reveal-on-scroll">
                <h3>Description</h3>
                <p>${U.esc(p.description)}</p>
            </div>

            <div class="intel-block reveal-on-scroll">
                <h3>Investment Thesis</h3>
                <p>${U.esc(p.thesis)}</p>
            </div>

            <div class="intel-block reveal-on-scroll">
                <h3>AI Investment Opinion</h3>
                <p style="background:rgba(124,92,255,0.06); padding:16px; border-radius:8px; border-left:3px solid var(--intel-violet);">${U.esc(p.ai_investment_opinion)}</p>
            </div>

            <div class="intel-block reveal-on-scroll">
                <h3>AI Score · Components</h3>
                <p style="font-size:12px; color:var(--intel-text-faint); margin-bottom:14px;">
                    Weighted composite of 11 fundamental factors. Total weights sum to 100%.
                </p>
                <div class="intel-component-grid">
                    ${Object.entries({
                        'GitHub Activity':  ['github_activity', 20],
                        'Developer Activity':['developer_activity', 15],
                        'Revenue':           ['revenue', 15],
                        'Users':             ['users', 10],
                        'TVL':               ['tvl', 10],
                        'Community':         ['community', 10],
                        'Partnerships':      ['partnerships', 10],
                        'Liquidity':         ['liquidity', 5],
                        'Tokenomics':        ['tokenomics', 5],
                        'Unlock Risk':       ['unlock_risk', 5],
                        'Market Momentum':   ['market_momentum', 5],
                    }).map(([label, [key, weight]]) => {
                        const compVal = U.projField(p, 'ai_score_components', key);
                        return `
                        <div class="intel-component">
                            <div class="intel-component-head">
                                <span class="intel-component-name">${U.esc(label)}</span>
                                <span class="intel-component-weight">${weight}%</span>
                            </div>
                            <div class="intel-component-score">${U.fmtScore(compVal)}</div>
                            <div class="intel-component-bar"><div class="intel-component-bar-fill" style="width:${U.safeWidthPct(compVal)}%"></div></div>
                        </div>
                    `;
                    }).join('')}
                </div>
            </div>

            <div class="intel-block reveal-on-scroll">
                <h3>AI Score History (6 months)</h3>
                ${(() => {
                    const hist = U.safeArray(p.ai_score_history, []);
                    if (hist.length === 0) {
                        return '<div class="intel-empty">No score history available for this project.</div>';
                    }
                    const first = hist[0];
                    const last = hist[hist.length - 1];
                    return `
                        <div class="intel-history-chart">${U.sparkline(hist.map(h => h.score))}</div>
                        <p style="font-size:12px; color:var(--intel-text-faint); margin-top:8px;">
                            ${U.fmtDate(first.date)}: <strong>${U.fmtScore(first.score)}</strong>
                            → ${U.fmtDate(last.date)}: <strong>${U.fmtScore(last.score)}</strong>
                        </p>
                    `;
                })()}
            </div>

            <div class="intel-cols-2">
                <div class="intel-block reveal-on-scroll">
                    <h3>Team</h3>
                    ${U.safeArray(p.team, []).length === 0 ? '<div class="intel-empty">' + U.fmtLabel(null) + '</div>' : U.safeArray(p.team, []).map(m => `
                        <div style="padding:10px 0; border-bottom:1px solid var(--intel-border);">
                            <strong style="color:var(--intel-text);">${U.esc(m.name)}</strong>
                            <span style="color:var(--intel-gold); font-size:12px; margin-left:6px;">${U.esc(m.role)}</span>
                            <div style="color:var(--intel-text-dim); font-size:13px; margin-top:2px;">${U.esc(m.background)}</div>
                        </div>
                    `).join('')}
                </div>
                <div class="intel-block reveal-on-scroll">
                    <h3>Investors</h3>
                    ${U.safeArray(p.investors, []).length === 0 ? '<div class="intel-empty">' + U.fmtLabel(null) + '</div>' : U.safeArray(p.investors, []).map(i => `
                        <div style="padding:10px 0; border-bottom:1px solid var(--intel-border); display:flex; justify-content:space-between; gap:10px;">
                            <div>
                                <strong style="color:var(--intel-text);">${U.esc(i.name)}</strong>
                                <span style="color:var(--intel-text-faint); font-size:12px; margin-left:6px;">${U.esc(i.tier)}</span>
                            </div>
                            <div style="color:var(--intel-text-dim); font-size:12px; text-align:right;">${U.safeArray(i.rounds, []).map(U.esc).join('<br>')}</div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="intel-block reveal-on-scroll">
                <h3>Roadmap</h3>
                ${U.safeArray(p.roadmap, []).length === 0 ? '<div class="intel-empty">' + U.fmtLabel(null) + '</div>' : `
                <table class="intel-table">
                    <thead><tr><th>Quarter</th><th>Milestone</th><th>Status</th></tr></thead>
                    <tbody>
                        ${U.safeArray(p.roadmap, []).map(r => `
                            <tr>
                                <td><strong>${U.esc(r.quarter)}</strong></td>
                                <td>${U.esc(r.milestone)}</td>
                                <td>
                                    <span class="intel-risk ${r.status === 'on-track' ? 'intel-risk-low' : (r.status === 'in-progress' ? 'intel-risk-medium' : 'intel-risk-low')}" style="margin-left:0;">
                                        ${U.esc(r.status)}
                                    </span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                `}
            </div>

            <div class="intel-block reveal-on-scroll">
                <h3>GitHub Activity</h3>
                <div class="intel-component-grid" style="grid-template-columns:repeat(auto-fill, minmax(140px, 1fr));">
                    <div class="intel-component"><div class="intel-component-name">Stars</div><div class="intel-component-score">${U.fmtNum(U.projField(p, 'github', 'stars'))}</div></div>
                    <div class="intel-component"><div class="intel-component-name">Forks</div><div class="intel-component-score">${U.fmtNum(U.projField(p, 'github', 'forks'))}</div></div>
                    <div class="intel-component"><div class="intel-component-name">Commits 30d</div><div class="intel-component-score">${U.fmtNum(U.projField(p, 'github', 'commits_30d'))}</div></div>
                    <div class="intel-component"><div class="intel-component-name">Active Devs 30d</div><div class="intel-component-score">${U.fmtNum(U.projField(p, 'github', 'active_devs_30d'))}</div></div>
                    <div class="intel-component"><div class="intel-component-name">Contributors</div><div class="intel-component-score">${U.fmtNum(U.projField(p, 'github', 'contributors_total'))}</div></div>
                    <div class="intel-component"><div class="intel-component-name">Last commit</div><div class="intel-component-score" style="font-size:14px;">${U.fmtDate(U.projField(p, 'github', 'last_commit'))}</div></div>
                </div>
                <p style="margin-top:14px; font-size:12px; color:var(--intel-text-faint);">
                    <strong>Repository:</strong> <code style="color:var(--intel-text);">${U.esc(U.projField(p, 'github', 'repo'))}</code>
                    · <strong>Languages:</strong> ${U.fmtJoin(U.projField(p, 'github', 'primary_languages'))}
                </p>
            </div>

            <div class="intel-block reveal-on-scroll">
                <h3>Tokenomics</h3>
                <p><strong style="color:var(--intel-text);">Initial Supply:</strong> ${U.fmtNum(U.projField(p, 'tokenomics', 'initial_supply'))} · <strong style="color:var(--intel-text);">Circulating:</strong> ${U.fmtFixed(U.projField(p, 'tokenomics', 'circulating_pct'), 1)}%</p>
                <p><strong style="color:var(--intel-text);">Vesting:</strong> ${U.fmtLabel(U.projField(p, 'tokenomics', 'vesting'))}</p>
                <p><strong style="color:var(--intel-text);">Utility:</strong> ${U.fmtLabel(U.projField(p, 'tokenomics', 'utility'))}</p>
                <p><strong style="color:var(--intel-text);">Buyback/Burn:</strong> ${U.fmtLabel(U.projField(p, 'tokenomics', 'buyback_burn'))}</p>
            </div>

            <div class="intel-block reveal-on-scroll">
                <h3>Unlock Schedule</h3>
                ${U.safeArray(p.unlock_schedule, []).length === 0 ? '<div class="intel-empty">' + U.fmtLabel(null) + '</div>' : `
                <table class="intel-table">
                    <thead><tr><th>Date</th><th class="cell-num">% Supply</th><th class="cell-num">USD Value</th><th>Type</th></tr></thead>
                    <tbody>
                        ${U.safeArray(p.unlock_schedule, []).map(u => `
                            <tr>
                                <td>${U.fmtDate(u.date)}</td>
                                <td class="cell-num cell-mono">${U.isAvailable(u.pct) ? u.pct.toFixed(2) : UNAVAILABLE}%</td>
                                <td class="cell-num cell-mono">${U.esc(u.usd_value)}</td>
                                <td>${U.esc(u.type)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                `}
            </div>

            <div class="intel-block reveal-on-scroll">
                <h3>Partnerships</h3>
                ${U.safeArray(p.partnerships, []).length === 0 ? '<div class="intel-empty">' + U.fmtLabel(null) + '</div>' : U.safeArray(p.partnerships, []).map(pp => `
                    <div style="padding:10px 0; border-bottom:1px solid var(--intel-border);">
                        <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                            <strong style="color:var(--intel-text);">${U.esc(pp.partner)}</strong>
                            <span style="color:var(--intel-text-faint); font-size:12px;">${U.fmtDate(pp.date)}</span>
                        </div>
                        <div style="color:var(--intel-text-dim); font-size:13px; margin-top:2px;">${U.esc(pp.summary)}</div>
                    </div>
                `).join('')}
            </div>

            <div class="intel-cols-2">
                <div class="intel-block reveal-on-scroll">
                    <h3>Advantages</h3>
                    ${U.safeArray(p.advantages, []).length === 0 ? '<div class="intel-empty">' + U.fmtLabel(null) + '</div>' : `
                    <ul style="margin:0; padding-left:20px; color:var(--intel-text-dim); font-size:14px; line-height:1.7;">
                        ${U.safeArray(p.advantages, []).map(a => `<li style="color:var(--intel-green);">${U.esc(a)}</li>`).join('')}
                    </ul>
                    `}
                </div>
                <div class="intel-block reveal-on-scroll">
                    <h3>Disadvantages</h3>
                    ${U.safeArray(p.disadvantages, []).length === 0 ? '<div class="intel-empty">' + U.fmtLabel(null) + '</div>' : `
                    <ul style="margin:0; padding-left:20px; color:var(--intel-text-dim); font-size:14px; line-height:1.7;">
                        ${U.safeArray(p.disadvantages, []).map(d => `<li style="color:var(--intel-red);">${U.esc(d)}</li>`).join('')}
                    </ul>
                    `}
                </div>
            </div>

            <div class="intel-block reveal-on-scroll">
                <h3>Competitors</h3>
                ${U.safeArray(p.competitors, []).length === 0 ? '<div class="intel-empty">' + U.fmtLabel(null) + '</div>' : U.safeArray(p.competitors, []).map(c => `
                    <div style="padding:10px 0; border-bottom:1px solid var(--intel-border);">
                        <strong style="color:var(--intel-text);">${U.esc(c.name)}:</strong>
                        <span style="color:var(--intel-text-dim); font-size:14px;"> ${U.esc(c.comparison)}</span>
                    </div>
                `).join('')}
            </div>

            <button class="intel-detail-back" id="intel-back-btn-2" style="margin-top:32px;">← Back to Intelligence</button>
        `;

        container.querySelectorAll('#intel-back-btn, #intel-back-btn-2').forEach(btn => {
            btn.addEventListener('click', () => window.PAYD_INTEL_ROUTER.go('dashboard'));
        });

        // ── PAYD ALPHA ENGINE — инициализация блока 3 scores ──────────────
        // _renderAlphaScores теперь async — загружает данные из БД и затем рендерит.
        // Не блокирует основной рендер страницы.
        this._renderAlphaScores(container, ticker, p).catch(err => {
            console.error('[renderProjectDetail] _renderAlphaScores failed:', err);
        });
        U.observeReveal(container);
    },

    /**
     * Нормализует формат scores из IntelligenceDatabase в формат,
     * который ждёт intelligence-alpha-render.js (значение в `.value`).
     * В БД поле называется `value`, в некоторых записях — `score`.
     * @param {Object} scoresFromDb — { payd, conviction, alpha, discovery }
     * @returns {Object} — нормализованный объект
     */
    _normalizeScoresForAlpha(scoresFromDb) {
        const out = { payd: null, conviction: null, alpha: null, discovery: null };
        if (!scoresFromDb) return out;
        for (const key of Object.keys(out)) {
            const rec = scoresFromDb[key];
            if (!rec) continue;
            const value = rec.value != null ? rec.value : (rec.score != null ? rec.score : null);
            out[key] = {
                engine: key,
                value,
                breakdown: rec.breakdown || {},
                classification: rec.classification || null,
                explanation: rec.explanation || '',
                confidence: rec.confidence || 'unknown',
                confidenceScore: rec.confidenceScore || 0,
                sources: rec.sources || [],
                labels: rec.labels || null,
                events: rec.events || null,
                opportunityScore: rec.opportunityScore || null,
                timestamp: rec.timestamp || null,
            };
        }
        return out;
    },

    /**
     * Рендерит блок PAYD Alpha Engine (3 score cards + AI summary + history + timeline + labels)
     * внутри контейнера проекта. Вызывается из renderProjectDetail.
     * Async: загружает данные из IntelligenceDatabase (localStorage-based).
     * @param {HTMLElement} container
     * @param {string} ticker
     * @param {Object} project — базовый проект (без _scores)
     */
    async _renderAlphaScores(container, ticker, project) {
        const placeholder = container.querySelector('#payd-alpha-scores-' + ticker);
        if (!placeholder) return;

        // Если intelligence-alpha-render.js не загрузился — graceful fallback
        const alphaRender = (window.PAYD_ALPHA_RENDER && window.PAYD_ALPHA_RENDER.renderScoresBlock)
            ? window.PAYD_ALPHA_RENDER
            : (window.PAYD_INTEL_RENDER && window.PAYD_INTEL_RENDER.renderScoresBlock
                ? window.PAYD_INTEL_RENDER
                : null);

        if (!alphaRender) {
            placeholder.innerHTML = `
                <div class="payd-alpha-empty" style="padding:24px;">
                    ⚠️ intelligence-alpha-render.js не загружен. Проверьте порядок подключения скриптов.
                </div>
            `;
            return;
        }

        // Загружаем данные из БД асинхронно
        const arch = window.PAYD_INTEL && window.PAYD_INTEL.architecture;
        let scoresFromDb = {};
        try {
            if (arch && arch.database && typeof arch.database.getLatestScores === 'function') {
                const result = arch.database.getLatestScores(ticker);
                // Поддержка и sync, и async API
                if (result && typeof result.then === 'function') {
                    scoresFromDb = await result;
                } else {
                    scoresFromDb = result || {};
                }
            }
        } catch (e) {
            console.warn('[_renderAlphaScores] getLatestScores failed:', e);
        }

        // Нормализуем и обогащаем проект
        const normalizedScores = this._normalizeScoresForAlpha(scoresFromDb);
        const alphaProject = Object.assign({}, project, {
            id: ticker,
            coinId: ticker,
            name: project.name,
            _scores: normalizedScores,
            paidScore: normalizedScores.payd && normalizedScores.payd.value != null
                ? { value: normalizedScores.payd.value }
                : null,
        });

        try {
            alphaRender.renderScoresBlock(placeholder, alphaProject);
        } catch (e) {
            console.error('[PAYD Alpha] renderScoresBlock failed for', ticker, e);
            placeholder.innerHTML = `
                <div class="payd-alpha-empty" style="padding:24px;">
                    Failed to render PAYD Alpha: ${U.esc(e && e.message ? e.message : String(e))}
                </div>
            `;
        }
    },

    /* === Project card (reused across sections) === */
    projectCard(p) {
        return `
            <div class="intel-project-card reveal-on-scroll" data-ticker="${U.esc(p.ticker)}" role="button" tabindex="0">
                ${this.projectCardBody(p)}
                <p class="intel-card-summary">${U.esc(p.summary || p.thesis || '')}</p>
            </div>
        `;
    },

    projectCardBody(p) {
        const scoreClass = U.scoreClass(p.ai_score);
        return `
            <div class="intel-card-top">
                <div class="intel-project-logo">${U.esc(p.logo)}</div>
                <div class="intel-project-id">
                    <div class="intel-project-name">${U.esc(p.name)}</div>
                    <div class="intel-project-ticker">${U.esc(p.ticker)} · ${U.esc(p.sector)}</div>
                </div>
                <span class="intel-rating-pill ${U.ratingClass(p.investment_rating)}">${U.esc(U.fmtLabel(p.investment_rating))}</span>
            </div>

            <div class="intel-score-block">
                <div class="intel-score-row">
                    <span class="intel-score-label">AI Score</span>
                    <span class="intel-score-value">${U.fmtScore(p.ai_score)}<span class="of">${U.isAvailable(p.ai_score) ? '/100' : ''}</span></span>
                </div>
                <div class="intel-score-bar"><div class="intel-score-bar-fill ${scoreClass}" style="width:${U.safeWidthPct(p.ai_score)}%"></div></div>
            </div>

            <div class="intel-score-block">
                <div class="intel-score-row">
                    <span class="intel-score-label">Risk Score</span>
                    <span class="intel-score-value" style="font-size:18px;">${U.fmtRisk(p.risk_score)} <span class="intel-risk ${U.riskClass(p.risk_label)}" style="margin-left:6px;">${U.esc(U.fmtLabel(p.risk_label))}</span></span>
                </div>
                <div class="intel-score-bar"><div class="intel-score-bar-fill ${U.isAvailable(p.risk_score) ? (p.risk_score < 40 ? 'is-high' : (p.risk_score < 60 ? 'is-mid' : 'is-low')) : 'is-mid'}" style="width:${U.safeWidthPct(p.risk_score)}%"></div></div>
            </div>

            <div class="intel-metrics">
                <div class="intel-metric-cell">
                    <div class="intel-metric-label">Mkt Cap</div>
                    <div class="intel-metric-value">${U.fmtUSD(U.projField(p, 'metrics', 'market_cap_usd'))}</div>
                </div>
                <div class="intel-metric-cell">
                    <div class="intel-metric-label">TVL</div>
                    <div class="intel-metric-value">${U.fmtUSD(U.projField(p, 'metrics', 'tvl_usd'))}</div>
                </div>
                <div class="intel-metric-cell">
                    <div class="intel-metric-label">Revenue/mo</div>
                    <div class="intel-metric-value">${U.fmtUSD(U.projField(p, 'metrics', 'monthly_revenue_usd'))}</div>
                </div>
            </div>
        `;
    },

    /* === Attach click handlers for project cards === */
    attachCardHandlers(container) {
        const cards = container.querySelectorAll('.intel-project-card[data-ticker]');
        cards.forEach(card => {
            const ticker = card.dataset.ticker;
            const handler = () => window.PAYD_INTEL_ROUTER.go('project', { ticker });
            card.addEventListener('click', handler);
            card.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handler();
                }
            });
        });
    },

    /* === Loading state === */
    renderLoading(container) {
        container.innerHTML = `<div class="intel-loading">Loading intelligence data…</div>`;
    },

    /* === Error state === */
    renderError(container, err) {
        container.innerHTML = `
            <div class="intel-empty">
                <p style="color:var(--intel-red); font-size:16px; margin-bottom:8px;">Failed to load intelligence data</p>
                <p style="font-size:13px;">${U.esc(err && err.message ? err.message : String(err))}</p>
            </div>
        `;
    },

    /* === Research Library ===
       CANONICAL SSO: всегда читаем из канонического runtime map. */
    renderResearch(container) {
        const canonicalList = getCanonicalV1List();
        if (canonicalList) {
            return this._renderResearchBody(container, canonicalList);
        }
        // Fallback на legacy данные, если canonical ещё не готов
        const d = D.projects;
        if (!d) return this.renderLoading(container);
        return this._renderResearchBody(container, Object.values(d.projects));
    },

    _renderResearchBody(container, allProjects) {
        const sorted = [...allProjects].sort(U.compareByScoreDesc(p => p.ai_score));

        container.innerHTML = `
            <div class="intel-subhead reveal-on-scroll">
                <div>
                    <h3>Research Library · ${sorted.length} deep-dive reports</h3>
                    <div class="intel-subhead-meta">Pre-computed institutional research. Updated by AI agent each cycle.</div>
                </div>
            </div>

            <div class="intel-table-wrap reveal-on-scroll">
                <table class="intel-table intel-table-research">
                    <thead>
                        <tr>
                            <th class="col-logo">Logo</th>
                            <th class="col-name">Project</th>
                            <th class="col-ticker">Ticker</th>
                            <th>Sector</th>
                            <th class="cell-num">AI Score</th>
                            <th class="cell-num">Risk</th>
                            <th>Investment Rating</th>
                            <th class="col-action">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sorted.map(p => `
                            <tr class="intel-depin-row" data-ticker="${U.esc(p.ticker)}" tabindex="0">
                                <td class="col-logo"><div class="intel-row-logo">${U.esc(p.logo || '◇')}</div></td>
                                <td class="col-name">
                                    <div class="intel-row-name">${U.esc(p.name)}</div>
                                    <div class="intel-row-subsector">${U.esc(p.subsector || '')}</div>
                                </td>
                                <td class="col-ticker"><span class="intel-row-ticker">${U.esc(p.ticker)}</span></td>
                                <td>${U.esc(p.sector)}</td>
                                <td class="cell-num"><strong style="color:var(--intel-gold);">${U.fmtScore(p.ai_score)}</strong></td>
                                <td class="cell-num"><span class="intel-risk ${U.riskClass(p.risk_label)}">${U.fmtRisk(p.risk_score)}</span></td>
                                <td><span class="intel-rating-pill ${U.ratingClass(p.investment_rating)}">${U.esc(U.fmtLabel(p.investment_rating))}</span></td>
                                <td class="col-action">
                                    <button class="intel-btn intel-btn-primary intel-btn-open-research" data-ticker="${U.esc(p.ticker)}" type="button">Open Research</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        container.querySelectorAll('.intel-depin-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('.intel-btn')) return;
                window.PAYD_INTEL_ROUTER.go('project', { ticker: row.dataset.ticker });
            });
        });
        container.querySelectorAll('.intel-btn-open-research').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.PAYD_INTEL_ROUTER.go('project', { ticker: btn.dataset.ticker });
            });
        });

        U.observeReveal(container);
    },

    /* === AI Category View (Layer 1, Layer 2, DeFi, RWA, Gaming, DeSci, DePIN, AI) ===
       CANONICAL SSO: фильтрация по sectorIndex канонического runtime.
       Multi-sector проекты появляются во всех своих секторах
       с ИДЕНТИЧНЫМИ полями (Market Cap, FDV, AI Score, Risk, ...). */
    renderAICategoryView(container, cat) {
        const meta = SECTOR_CATMAP[cat] || SECTOR_CATMAP.l1;
        const canonSector = V1_TO_CANONICAL_SECTOR[cat];

        // Приоритет 1: канонический runtime (single source of truth)
        let filtered = null;
        const runtime = _getCanonicalRuntime();
        if (runtime && canonSector) {
            const ids = runtime.sectorIndex[canonSector] || [];
            filtered = ids
                .map(id => runtime.projects.get(id))
                .filter(Boolean)
                .map(canonicalToV1View)
                .filter(Boolean);
        }

        // Приоритет 2: legacy fallback (если canonical ещё не готов)
        if (!filtered) {
            const d = D.projects;
            if (!d) return this.renderLoading(container);
            const allProjects = Object.values(d.projects);
            const targetCanons = meta.sectors;
            filtered = allProjects.filter(p => {
                const projectSectors = normalizeSectorValue(p);
                return projectSectors.some(s => targetCanons.indexOf(s) !== -1);
            });
        }

        const sorted = [...filtered].sort(U.compareByScoreDesc(p => p.ai_score));

        container.innerHTML = `
            <div class="intel-subhead reveal-on-scroll">
                <div>
                    <h3>${U.esc(meta.label)} · ${sorted.length} projects</h3>
                    <div class="intel-subhead-meta">AI-curated institutional research for the ${U.esc(meta.label)} sector.</div>
                </div>
            </div>

            ${sorted.length === 0 ? `
                <div class="intel-empty reveal-on-scroll">
                    <p>No ${U.esc(meta.label)} projects in the current dataset. The AI Agent will populate this section during the next weekly run.</p>
                </div>
            ` : `
                <div class="intel-table-wrap reveal-on-scroll">
                    <table class="intel-table intel-table-depin">
                        <thead>
                            <tr>
                                <th class="col-logo">Logo</th>
                                <th class="col-name">Project</th>
                                <th class="col-ticker">Ticker</th>
                                <th class="cell-num">AI Score</th>
                                <th class="cell-num">Risk</th>
                                <th class="cell-num">Mkt Cap</th>
                                <th class="cell-num">TVL</th>
                                <th>Investment Rating</th>
                                <th class="col-action">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sorted.map(p => `
                                <tr class="intel-depin-row" data-ticker="${U.esc(p.ticker)}" tabindex="0">
                                    <td class="col-logo"><div class="intel-row-logo">${U.esc(p.logo || '◇')}</div></td>
                                    <td class="col-name">
                                        <div class="intel-row-name">${U.esc(p.name)}</div>
                                        <div class="intel-row-subsector">${U.esc(p.subsector || '')}</div>
                                    </td>
                                    <td class="col-ticker"><span class="intel-row-ticker">${U.esc(p.ticker)}</span></td>
                                    <td class="cell-num"><strong style="color:var(--intel-gold);">${U.fmtScore(p.ai_score)}</strong></td>
                                    <td class="cell-num"><span class="intel-risk ${U.riskClass(p.risk_label)}">${U.fmtRisk(p.risk_score)}</span></td>
                                    <td class="cell-num cell-mono">${U.fmtUSD(U.projField(p, 'metrics', 'market_cap_usd') ?? '', true)}</td>
                                    <td class="cell-num cell-mono">${U.fmtUSD(U.projField(p, 'metrics', 'tvl_usd') ?? '', true)}</td>
                                    <td><span class="intel-rating-pill ${U.ratingClass(p.investment_rating)}">${U.esc(U.fmtLabel(p.investment_rating))}</span></td>
                                    <td class="col-action">
                                        <button class="intel-btn intel-btn-primary intel-btn-open-research" data-ticker="${U.esc(p.ticker)}" type="button">Open Research</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `}
        `;

        container.querySelectorAll('.intel-depin-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('.intel-btn')) return;
                window.PAYD_INTEL_ROUTER.go('project', { ticker: row.dataset.ticker });
            });
        });
        container.querySelectorAll('.intel-btn-open-research').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.PAYD_INTEL_ROUTER.go('project', { ticker: btn.dataset.ticker });
            });
        });

        U.observeReveal(container);
    },
};

window.PAYD_INTEL_RENDER = INTEL_RENDER;
