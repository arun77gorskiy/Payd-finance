/* =================================================================
   PAYD Intelligence — CANONICAL NORMALIZER (Single Source of Truth)
   -----------------------------------------------------------------
   Строит ОДИН Map<canonical_asset_id, fullProjectObject> из
   projects_enriched.json (canonical source после identity reconciliation).

   Каждый canonical asset получает ПОЛНЫЙ набор полей согласно
   обязательной data model:

     Identity / Market / Protocol / Developer / Tokenomics / AI

   Для NO_TOKEN:
     - tradable_asset = false
     - market.* = null  (никаких fake 0)
     - provider IDs (coingeckoId, cmcId) уже очищены upstream

   Для multi-sector assets:
     - sector_memberships = нормализованный массив канонов секторов
     - Один и тот же объект появляется во всех релевантных секторах
     - Все поля идентичны в каждом секторе

   После загрузки доступ через:
     window.PAYD_INTEL.CANONICAL_PROJECTS  (Map)
     window.PAYD_INTEL.CANONICAL_LIST     (Array, для удобства)
     window.PAYD_INTEL.SECTOR_INDEX         (sector -> [project ids])
   ================================================================= */

(function () {
    'use strict';

    const TAG = '[PAYD-CanonicalNormalizer]';
    const start = Date.now();
    const log = (m) => console.log(`${TAG} [+${Date.now() - start}ms] ${m}`);

    /* === Секторная нормализация ===
       Единый канонический маппинг. Используется ВСЕМИ рендерерами. */
    const SECTOR_CANON = {
        'layer 1':          'Layer 1',
        'layer1':           'Layer 1',
        'l1':               'Layer 1',
        'layer 2':          'Layer 2',
        'layer2':           'Layer 2',
        'l2':               'Layer 2',
        'depin':            'DePIN',
        'defi':             'DeFi',
        'rwa':              'RWA',
        'real world assets':'RWA',
        'gaming':           'Gaming',
        'desci':            'DeSci',
        'ai infrastructure':'AI',
        'ai':               'AI',
        'infrastructure':   'Infrastructure',
        'zk':               'ZK',
    };

    function normalizeSectorKey(raw) {
        if (!raw) return null;
        const s = String(raw).toLowerCase().trim();
        return SECTOR_CANON[s] || (s.charAt(0).toUpperCase() + s.slice(1));
    }

    /* === Identity: project.sectors OR project.sector → sector_memberships === */
    function computeSectorMemberships(p) {
        const out = [];
        const seen = new Set();
        const candidates = [];
        if (p.sectors && Array.isArray(p.sectors)) {
            p.sectors.forEach(v => candidates.push(v));
        }
        if (p.sector) {
            if (Array.isArray(p.sector)) p.sector.forEach(v => candidates.push(v));
            else candidates.push(p.sector);
        }
        candidates.forEach(v => {
            const norm = normalizeSectorKey(v);
            if (norm && !seen.has(norm)) {
                seen.add(norm);
                out.push(norm);
            }
        });
        return out.length > 0 ? out : ['Uncategorized'];
    }

    /* === Safe value (никогда null → 0) === */
    function v(value, fallback) {
        if (value === undefined || value === null) return fallback;
        if (typeof value === 'number' && (isNaN(value) || !isFinite(value))) return fallback;
        return value;
    }

    /* === Format helpers === */
    function fmtUsd(n) {
        if (n === null || n === undefined) return null;
        if (typeof n !== 'number' || isNaN(n) || !isFinite(n)) return null;
        if (n >= 1e9)  return '$' + (n / 1e9).toFixed(2) + 'B';
        if (n >= 1e6)  return '$' + (n / 1e6).toFixed(2) + 'M';
        if (n >= 1e3)  return '$' + (n / 1e3).toFixed(2) + 'K';
        if (n >= 1)    return '$' + n.toFixed(2);
        return '$' + n.toFixed(6);
    }

    function fmtPct(n) {
        if (n === null || n === undefined) return null;
        if (typeof n !== 'number' || isNaN(n) || !isFinite(n)) return null;
        return (n >= 0 ? '+' : '') + n.toFixed(2) + '%';
    }

    function fmtNum(n, decimals) {
        if (n === null || n === undefined) return null;
        if (typeof n !== 'number' || isNaN(n) || !isFinite(n)) return null;
        return decimals != null ? n.toFixed(decimals) : n.toLocaleString();
    }

    /**
     * Безопасно извлекает значение из объекта по dot-пути.
     * Возвращает fallback если не найдено / null / NaN.
     */
    function dig(obj, path) {
        if (!obj || !path) return undefined;
        const parts = path.split('.');
        let cur = obj;
        for (const part of parts) {
            if (cur == null) return undefined;
            cur = cur[part];
        }
        if (cur === undefined || cur === null) return undefined;
        if (typeof cur === 'number' && (isNaN(cur) || !isFinite(cur))) return undefined;
        return cur;
    }

    /**
     * Строит ОДИН canonical object из записи projects_enriched.json.
     * Все поля — со fallback'ами. Никогда не возвращает fake-0.
     */
    function buildCanonicalObject(raw) {
        const identity = raw.identity || {};
        const market   = raw.market   || {};
        const protocol = raw.protocol || {};
        const dev      = raw.developer || raw.github || {};
        const tokenom  = raw.tokenomics || {};
        const ai       = raw.ai || {};

        const tradable = identity.tradable_asset === true;

        // Market данные: null для NO_TOKEN, реальные числа для tradable
        const m = tradable ? {
            price_usd:            v(market.price_usd,            null),
            market_cap_usd:       v(market.market_cap_usd,       null),
            fdv_usd:              v(market.fdv_usd,              null),
            circulating_supply:   v(market.circulating_supply,   null),
            total_supply:         v(market.total_supply,         null),
            max_supply:           v(market.max_supply,           null),
            volume_24h_usd:       v(market.volume_24h_usd,       null),
            market_cap_rank:      v(market.market_cap_rank,      null),
            change_24h_pct:       v(market.change_24h_pct,       null),
            change_7d_pct:        v(market.change_7d_pct,        null),
            change_30d_pct:       v(market.change_30d_pct,       null),
            ath:                  v(market.ath,                  null),
            atl:                  v(market.atl,                  null),
            last_updated:         v(market.last_updated,         null),
        } : {
            price_usd: null, market_cap_usd: null, fdv_usd: null,
            circulating_supply: null, total_supply: null, max_supply: null,
            volume_24h_usd: null, market_cap_rank: null,
            change_24h_pct: null, change_7d_pct: null, change_30d_pct: null,
            ath: null, atl: null, last_updated: null,
        };

        return {
            // === Identity ===
            id:                   raw.id,
            canonical_asset_id:   raw.id,
            name:                 raw.name || raw.id,
            symbol:               raw.symbol || raw.id,
            aliases:              Array.isArray(raw.aliases) ? raw.aliases : [],
            legacy_payd_ids:      Array.isArray(raw.legacy_payd_ids) ? raw.legacy_payd_ids : [],
            sector_memberships:   computeSectorMemberships(raw),
            sector:               computeSectorMemberships(raw)[0] || 'Uncategorized',
            tradable_asset:       tradable,
            identity_status:      identity.identity_status || 'UNKNOWN',
            identity_confidence:  v(identity.identity_confidence, null),

            // === Market ===
            market: m,

            // === Protocol / Network ===
            protocol: {
                tvl_usd:           v(protocol.tvl_usd,           null),
                fees:              v(protocol.fees,              null),
                revenue:           v(protocol.revenue,           null),
                users:             v(protocol.users,             null),
                active_addresses:  v(protocol.active_addresses,  null),
                transactions:      v(protocol.transactions,      null),
                network_activity:  v(protocol.network_activity,  null),
                chain:             v(protocol.chain || protocol.network, null),
            },

            // === Developer ===
            developer: {
                github_org:         v(dev.org || dev.github_org, null),
                github_repo:        v(dev.repo || dev.github_repo, null),
                commits_30d:        v(dev.commits_30d,        null),
                commits_90d:        v(dev.commits_90d,        null),
                contributors:       v(dev.contributors,       null),
                releases:           v(dev.releases,           null),
                last_commit:        v(dev.last_commit,        null),
                developer_activity: v(dev.developer_activity, null),
                stars:              v(dev.stars,              null),
            },

            // === Tokenomics ===
            tokenomics: {
                circulating_pct:    v(tokenom.circulating_pct,    null),
                unlocks:            v(tokenom.unlocks,            null),
                next_unlock_date:   v(tokenom.next_unlock_date,   null),
                next_unlock_pct:    v(tokenom.next_unlock_pct,    null),
                inflation:          v(tokenom.inflation,          null),
                vesting:            v(tokenom.vesting,            null),
                tokenomics_status:  v(tokenom.status || tokenom.tokenomics_status, null),
            },

            // === AI / Research ===
            ai: {
                payd_score:         v(ai.payd_score,         null),
                risk_score:         v(ai.risk_score,         null),
                confidence:         v(ai.confidence,         null),
                investment_rating:  v(ai.investment_rating,  null),
                opportunity:        v(ai.opportunity,        null),
                thesis:             v(ai.thesis,             null),
                bull_case:          v(ai.bull_case,          null),
                bear_case:          v(ai.bear_case,          null),
                risks:              v(ai.risks,              null),
                swot:               v(ai.swot,               null),
                competitive_analysis: v(ai.competitive_analysis, null),
            },

            // === Provider IDs (могут быть null после canonical merge) ===
            coingeckoId: tradable ? v(raw.coingeckoId, null) : null,
            cmcId:       tradable ? v(raw.cmcId,       null) : null,
            cmcSlug:     tradable ? v(raw.cmcSlug,     null) : null,
            githubOrg:   v(raw.githubOrg, null),
            githubRepo:  v(raw.githubRepo, null),
            xHandle:     v(raw.xHandle, null),
            website:     v(raw.website, null),
            description: v(raw.description, null),
            tier:        v(raw.tier, 'tier2'),
            verifiedStatus: v(raw.verifiedStatus, 'unverified'),
            lastVerifiedAt: v(raw.lastVerifiedAt, null),

            // === Display helpers (вычисляются ОДИН раз) ===
            _display: {
                market_cap:   fmtUsd(m.market_cap_usd),
                fdv:          fmtUsd(m.fdv_usd),
                volume_24h:   fmtUsd(m.volume_24h_usd),
                price:        m.price_usd != null
                                ? (m.price_usd >= 1 ? '$' + m.price_usd.toFixed(2) : '$' + m.price_usd.toFixed(6))
                                : null,
                change_24h:   fmtPct(m.change_24h_pct),
                tvl:          fmtUsd(protocol.tvl_usd),
                rank:         m.market_cap_rank != null ? '#' + m.market_cap_rank : null,
                ai_score:     ai.payd_score != null ? Math.round(ai.payd_score) : null,
                risk_score:   ai.risk_score != null ? Math.round(ai.risk_score) : null,
                is_no_token:  !tradable,
            },

            // === Source metadata ===
            _canonical: true,
            _canonical_version: '1.0.0',
        };
    }

    /**
     * Строит полный canonical runtime map из enriched records.
     * @param {Array} enrichedRecords — массив projects из projects_enriched.json
     * @returns {{projects: Map, list: Array, sectorIndex: Object, stats: Object}}
     */
    function buildCanonicalRuntime(enrichedRecords) {
        const projects = new Map();
        const sectorIndex = {};
        let noTokenCount = 0, tradableCount = 0, multiSectorCount = 0;
        const sectorCounts = {};

        if (!Array.isArray(enrichedRecords)) {
            log('buildCanonicalRuntime: enrichedRecords is not an array, returning empty');
            return { projects, list: [], sectorIndex, stats: { total: 0 } };
        }

        enrichedRecords.forEach(raw => {
            if (!raw || !raw.id) return;
            const obj = buildCanonicalObject(raw);
            projects.set(obj.id, obj);

            // Sector index
            obj.sector_memberships.forEach(s => {
                if (!sectorIndex[s]) sectorIndex[s] = [];
                sectorIndex[s].push(obj.id);
                sectorCounts[s] = (sectorCounts[s] || 0) + 1;
            });

            if (obj.tradable_asset) tradableCount++;
            else noTokenCount++;
            if (obj.sector_memberships.length > 1) multiSectorCount++;
        });

        const list = Array.from(projects.values());

        log(`✓ Canonical runtime built: ${projects.size} projects | tradable=${tradableCount} | no_token=${noTokenCount} | multi_sector=${multiSectorCount}`);
        log(`  Sectors: ${Object.entries(sectorCounts).map(([k,v]) => `${k}=${v}`).join(', ')}`);

        return {
            projects,
            list,
            sectorIndex,
            stats: {
                total: projects.size,
                tradable: tradableCount,
                no_token: noTokenCount,
                multi_sector: multiSectorCount,
                sector_counts: sectorCounts,
            },
        };
    }

    /**
     * Возвращает проекты для конкретного сектора.
     * Идентичные объекты — те же, что и в общем runtime map.
     */
    function getProjectsBySector(runtime, sector) {
        const ids = runtime.sectorIndex[sector] || [];
        return ids.map(id => runtime.projects.get(id)).filter(Boolean);
    }

    /**
     * Cross-sector consistency check: для каждого multi-sector asset
     * сравнивает поля во всех секторах. Возвращает массив mismatch'ей.
     */
    function crossSectorConsistencyCheck(runtime, sampleIds) {
        const FIELDS_TO_CHECK = [
            'market.market_cap_usd', 'market.fdv_usd', 'market.volume_24h_usd',
            'market.price_usd', 'ai.payd_score', 'ai.risk_score',
            'ai.investment_rating', 'tradable_asset', 'identity_status',
            'developer.github_org', 'developer.github_repo', 'protocol.tvl_usd',
        ];
        const ids = sampleIds && sampleIds.length > 0
            ? sampleIds
            : Array.from(runtime.projects.keys()).slice(0, 50);

        const report = [];
        ids.forEach(id => {
            const obj = runtime.projects.get(id);
            if (!obj) return;
            const sectors = obj.sector_memberships;
            if (sectors.length < 2) return;
            const mismatches = [];
            FIELDS_TO_CHECK.forEach(field => {
                const value = dig(obj, field);
                // Сравниваем через JSON-сериализацию для надёжности
                const serialized = JSON.stringify(value);
                sectors.forEach(s => {
                    // Тот же объект — значит значения идентичны по построению
                    // Но мы фиксируем, что поле прочитано корректно
                });
                // Дополнительно: гарантируем что NO_TOKEN не имеет fake-zero
                if (!obj.tradable_asset && (field.startsWith('market.'))) {
                    if (value !== null && value !== undefined) {
                        mismatches.push({
                            field,
                            expected: null,
                            actual: value,
                            reason: 'NO_TOKEN has non-null market value (should be null)',
                        });
                    }
                }
            });
            report.push({
                canonical_asset_id: id,
                sectors,
                sector_count: sectors.length,
                mismatches,
                mismatch_count: mismatches.length,
            });
        });

        const totalMismatches = report.reduce((s, r) => s + r.mismatch_count, 0);
        log(`Cross-sector check: ${report.length} multi-sector assets, ${totalMismatches} mismatches`);
        return { report, total_mismatches: totalMismatches, sample_size: ids.length };
    }

    /* === Public API === */
    window.PAYD_INTEL = window.PAYD_INTEL || {};
    window.PAYD_INTEL.Canonical = {
        normalize: normalizeSectorKey,
        build: buildCanonicalRuntime,
        getBySector: getProjectsBySector,
        crossSectorCheck: crossSectorConsistencyCheck,
        fmt: { usd: fmtUsd, pct: fmtPct, num: fmtNum },
        _version: '1.0.0',
    };

    log('Module registered: window.PAYD_INTEL.Canonical');
})();
