/* =================================================================
   PAYD Intelligence V2 — MetricSourceRouter
   ----------------------------------------------------------------
   Центральный роутер, который для каждой метрики выбирает правильный
   провайдер на основе entity_type проекта.

   Правила:
   - TVL:    CHAIN → DefiLlama Chain, PROTOCOL → DefiLlama Protocol
   - TVL:    если оба → возвращаем оба (chain_tvl, protocol_tvl)
   - Fees:   только DefiLlama protocol (для PROTOCOL)
   - Revenue: только DefiLlama protocol
   - Market cap: CoinGecko → CMC → null
   - GitHub: GitHub API primary, CoinGecko developer_data fallback

   Каждый metric envelope содержит:
   { value, source, reason, http_status, confidence, raw, fetched_at }
   ================================================================= */

const chainProvider = require('../providers/defillama_chain.js');
const protocolProvider = require('../providers/defillama_protocol.js');
const cgProvider = require('../providers/coingecko.js');
const ghProvider = require('../providers/github.js');
const { resolveEntityTypes } = require('../entity_resolver.js');
const { getProviderIds } = require('../data_mappings_v2.js');
const { MISSING_REASONS, makeMetric, emptyMetric, isRealNumber } = require('../providers/_common.js');

/**
 * Resolve TVL — основная метрика, требующая router.
 * Возвращает:
 * {
 *   chain_tvl: MetricEnvelope | null,
 *   protocol_tvl: MetricEnvelope | null,
 *   tvl: MetricEnvelope | null,  // preferred single value
 *   tvl_source_priority: 'chain' | 'protocol' | null
 * }
 */
async function resolveTvl(project) {
    const ids = getProviderIds(project);
    const types = resolveEntityTypes(project);
    const isChain = types.includes('CHAIN');
    const isProtocol = types.includes('PROTOCOL');

    const out = {
        chain_tvl: null,
        protocol_tvl: null,
        tvl: null,
        tvl_source_priority: null,
    };

    if (isChain && ids?.defillama_chain) {
        const chainResult = await chainProvider.fetchChainMetrics(ids);
        out.chain_tvl = chainResult.metrics.tvl || emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
        out.chain_raw = chainResult.chain;
        // Дополнительно: загрузить raw chain entry для диагностики
        try {
            const raw = await chainProvider.fetchChainRaw(ids);
            out.chain_raw_full = raw.data;
        } catch (e) {
            out.chain_raw_full = { _error: e.message };
        }
    } else if (isChain) {
        out.chain_tvl = emptyMetric(MISSING_REASONS.MISSING_IDENTIFIER);
    }

    if (isProtocol && ids?.defillama_protocol) {
        const protResult = await protocolProvider.fetchProtocolMetrics(ids);
        out.protocol_tvl = protResult.metrics.tvl || emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
        out.protocol_raw = protResult.protocol;
        // Дополнительно: загрузить raw detail для диагностики
        try {
            const detail = await protocolProvider.fetchProtocolDetail(ids.defillama_protocol);
            out.protocol_raw_full = detail;
        } catch (e) {
            out.protocol_raw_full = { _error: e.message };
        }
    } else if (isProtocol) {
        out.protocol_tvl = emptyMetric(MISSING_REASONS.MISSING_IDENTIFIER);
    } else if (isChain && ids?.defillama_protocol) {
        // Chain, но также есть protocol mapping (например polygon имеет chain+protocol)
        const protResult = await protocolProvider.fetchProtocolMetrics(ids);
        out.protocol_tvl = protResult.metrics.tvl || emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
        out.protocol_raw = protResult.protocol;
        try {
            const detail = await protocolProvider.fetchProtocolDetail(ids.defillama_protocol);
            out.protocol_raw_full = detail;
        } catch (e) {
            out.protocol_raw_full = { _error: e.message };
        }
    }

    // Выбираем приоритетный TVL
    // Chain TVL предпочтительнее, если оба есть
    if (out.chain_tvl && isRealNumber(out.chain_tvl.value)) {
        out.tvl = out.chain_tvl;
        out.tvl_source_priority = 'chain';
    } else if (out.protocol_tvl && isRealNumber(out.protocol_tvl.value)) {
        out.tvl = out.protocol_tvl;
        out.tvl_source_priority = 'protocol';
    } else if (out.chain_tvl) {
        out.tvl = out.chain_tvl;  // null value, но envelope
        out.tvl_source_priority = 'chain';
    } else if (out.protocol_tvl) {
        out.tvl = out.protocol_tvl;
        out.tvl_source_priority = 'protocol';
    } else {
        out.tvl = emptyMetric(MISSING_REASONS.NOT_APPLICABLE);
        out.tvl_source_priority = null;
    }

    return out;
}

/**
 * Resolve Fees (только для PROTOCOL).
 * Сохраняет raw response для диагностики.
 */
async function resolveFees(project) {
    const ids = getProviderIds(project);
    const types = resolveEntityTypes(project);
    if (!types.includes('PROTOCOL')) {
        return { fees_24h: emptyMetric(MISSING_REASONS.NOT_APPLICABLE) };
    }
    if (!ids?.defillama_protocol) {
        return { fees_24h: emptyMetric(MISSING_REASONS.MISSING_IDENTIFIER) };
    }
    const result = await protocolProvider.fetchProtocolMetrics(ids);
    // Дополнительно: raw fees
    let feesRaw = null;
    try {
        feesRaw = await protocolProvider.fetchProtocolFees(ids.defillama_protocol);
    } catch (e) {
        feesRaw = { _error: e.message };
    }
    return {
        fees_24h: result.metrics.fees_24h || emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA),
        raw_response: feesRaw,
    };
}

/**
 * Resolve Revenue (только для PROTOCOL).
 * Сохраняет raw response для диагностики.
 */
async function resolveRevenue(project) {
    const ids = getProviderIds(project);
    const types = resolveEntityTypes(project);
    if (!types.includes('PROTOCOL')) {
        return { revenue_24h: emptyMetric(MISSING_REASONS.NOT_APPLICABLE) };
    }
    if (!ids?.defillama_protocol) {
        return { revenue_24h: emptyMetric(MISSING_REASONS.MISSING_IDENTIFIER) };
    }
    const result = await protocolProvider.fetchProtocolMetrics(ids);
    return { revenue_24h: result.metrics.revenue_24h || emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA) };
}

/**
 * Resolve DEX volume.
 */
async function resolveDexVolume(project) {
    const ids = getProviderIds(project);
    if (!ids?.defillama_dex) {
        return { dex_volume_24h: emptyMetric(MISSING_REASONS.NOT_APPLICABLE) };
    }
    const result = await protocolProvider.fetchDexVolumeMetrics(ids);
    return { dex_volume_24h: result.metrics.dex_volume_24h || emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA) };
}

/**
 * Resolve Market Cap — primary: CoinGecko, fallback: CoinMarketCap.
 */
async function resolveMarketCap(project, cgMarketsMap) {
    const ids = getProviderIds(project);
    if (!ids?.coingecko) {
        return { market_cap_usd: emptyMetric(MISSING_REASONS.MISSING_IDENTIFIER) };
    }
    const cg = cgMarketsMap ? cgMarketsMap.get(ids.coingecko) : null;
    if (!cg) {
        return { market_cap_usd: emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA) };
    }
    const marketMetrics = cgProvider.buildMarketMetrics(cg);
    return { market_cap_usd: marketMetrics.market_cap_usd };
}

/**
 * Resolve all market metrics (price, supply, etc.)
 * Дополнительно сохраняет raw cg entry для диагностики.
 */
async function resolveMarketMetrics(project, cgMarketsMap) {
    const ids = getProviderIds(project);
    if (!ids?.coingecko) {
        return {
            price_usd: emptyMetric(MISSING_REASONS.MISSING_IDENTIFIER),
            market_cap_usd: emptyMetric(MISSING_REASONS.MISSING_IDENTIFIER),
            volume_24h_usd: emptyMetric(MISSING_REASONS.MISSING_IDENTIFIER),
            fdv_usd: emptyMetric(MISSING_REASONS.MISSING_IDENTIFIER),
            market_cap_rank: emptyMetric(MISSING_REASONS.MISSING_IDENTIFIER),
            cg_raw: null,
        };
    }
    const cg = cgMarketsMap ? cgMarketsMap.get(ids.coingecko) : null;
    if (!cg) {
        return {
            price_usd: emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA),
            market_cap_usd: emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA),
            volume_24h_usd: emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA),
            fdv_usd: emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA),
            market_cap_rank: emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA),
            cg_raw: null,
        };
    }
    const metrics = cgProvider.buildMarketMetrics(cg);
    metrics.cg_raw = cg;
    return metrics;
}

/**
 * Resolve GitHub metrics — primary: GitHub API, fallback: CoinGecko developer_data.
 * @param {Object} project
 * @param {Object} options - { token, fallbackCgDetail }
 */
async function resolveGitHub(project, options = {}) {
    const token = options.token || '';
    const cgDetail = options.cgDetail || null;
    const ids = getProviderIds(project);
    const repos = (ids?.github && ids.github.length > 0) ? ids.github
        : (project.githubRepo ? [project.githubRepo] : []);

    if (repos.length === 0) {
        // Никаких GitHub identifiers — fallback на CoinGecko developer_data
        if (cgDetail?.developer_data) {
            const fallback = cgProvider.buildSocialAndDeveloper(cgDetail);
            return {
                github: {
                    stars: fallback.developer_stars || emptyMetric(MISSING_REASONS.NOT_FOUND),
                    forks: fallback.developer_forks || emptyMetric(MISSING_REASONS.NOT_FOUND),
                    commits_30d: fallback.developer_commits_4w || emptyMetric(MISSING_REASONS.NOT_FOUND),
                    source: 'coingecko:developer_data (fallback)',
                    reason: MISSING_REASONS.MISSING_IDENTIFIER,
                    raw_response: cgDetail.developer_data,
                },
            };
        }
        return {
            github: {
                stars: emptyMetric(MISSING_REASONS.MISSING_IDENTIFIER),
                forks: emptyMetric(MISSING_REASONS.MISSING_IDENTIFIER),
                commits_30d: emptyMetric(MISSING_REASONS.MISSING_IDENTIFIER),
                reason: MISSING_REASONS.MISSING_IDENTIFIER,
            },
        };
    }

    // Собираем кандидатов: сначала project.githubRepo (специфичный),
    // затем ids.github (mapping), затем guess githubOrg/<id>
    const candidateRepos = [];
    if (project.githubRepo) candidateRepos.push(project.githubRepo);
    if (ids?.github) {
        for (const r of ids.github) {
            if (!candidateRepos.includes(r)) candidateRepos.push(r);
        }
    }
    if (project.githubOrg && project.id) {
        const guess = `${project.githubOrg}/${project.id}`;
        if (!candidateRepos.includes(guess)) candidateRepos.push(guess);
    }
    if (project.githubOrg && project.symbol) {
        const guess = `${project.githubOrg}/${project.symbol.toLowerCase()}`;
        if (!candidateRepos.includes(guess)) candidateRepos.push(guess);
    }

    // Пробуем каждый repo по очереди
    const attempts = [];
    for (const candidate of candidateRepos) {
        const parts = candidate.split('/');
        if (parts.length < 2) continue;
        const [owner, repo] = parts;
        const result = await ghProvider.fetchFullRepoMetrics(owner, repo, { token, includeCommits: true, days: 30 });
        attempts.push({ candidate, success: result.success, httpStatus: result.http_status, reason: result.reason || null });
        if (result.success) {
            return {
                github: {
                    ...result.metrics,
                    source_repo: result.source_repo,
                    source: 'github:api (primary)',
                    raw_response: result.raw,
                    attempts,
                },
            };
        }
    }

    // Не нашли ни одного рабочего репо → fallback на CoinGecko
    if (cgDetail?.developer_data) {
        const fallback = cgProvider.buildSocialAndDeveloper(cgDetail);
        return {
            github: {
                stars: fallback.developer_stars || emptyMetric(MISSING_REASONS.NOT_FOUND),
                forks: fallback.developer_forks || emptyMetric(MISSING_REASONS.NOT_FOUND),
                commits_30d: fallback.developer_commits_4w || emptyMetric(MISSING_REASONS.NOT_FOUND),
                source: 'coingecko:developer_data (fallback)',
                reason: MISSING_REASONS.PROVIDER_NO_DATA,
                raw_response: cgDetail.developer_data,
                attempts,
            },
        };
    }

    return {
        github: {
            stars: emptyMetric(MISSING_REASONS.NOT_FOUND),
            forks: emptyMetric(MISSING_REASONS.NOT_FOUND),
            commits_30d: emptyMetric(MISSING_REASONS.NOT_FOUND),
            reason: MISSING_REASONS.NOT_FOUND,
            attempts,
        },
    };
}

/**
 * Resolve active addresses — пока не подключено (нет стабильного источника).
 */
async function resolveActiveAddresses() {
    return { active_addresses: emptyMetric(MISSING_REASONS.NOT_APPLICABLE) };
}

/**
 * Полный резолв всех метрик для проекта.
 * Использует переданный cgMarketsMap (заранее загруженный батч) и cgDetailMap.
 */
async function resolveAllMetrics(project, context = {}) {
    const ids = getProviderIds(project);
    const types = resolveEntityTypes(project);
    const cgMarketsMap = context.cgMarketsMap || new Map();
    const cgDetailMap = context.cgDetailMap || new Map();
    const cgDetail = ids?.coingecko ? cgDetailMap.get(ids.coingecko) : null;

    // Параллельно: TVL, Fees, Revenue, DEX, Market, GitHub
    const [tvlResult, feesResult, revenueResult, dexResult, marketResult, githubResult, activeResult] = await Promise.all([
        resolveTvl(project),
        resolveFees(project),
        resolveRevenue(project),
        resolveDexVolume(project),
        resolveMarketMetrics(project, cgMarketsMap),
        resolveGitHub(project, { token: context.token, cgDetail }),
        resolveActiveAddresses(),
    ]);

    return {
        entity_types: types,
        identifiers: ids,
        tvl: tvlResult,
        fees: feesResult,
        revenue: revenueResult,
        dex: dexResult,
        market: marketResult,
        github: githubResult,
        active: activeResult,
    };
}

/**
 * Подсчёт data completeness: % метрик с реальным value (не null).
 */
function calculateCompleteness(metrics) {
    const fields = [
        'tvl.tvl', 'fees.fees_24h', 'revenue.revenue_24h',
        'dex.dex_volume_24h', 'market.price_usd', 'market.market_cap_usd',
        'market.volume_24h_usd', 'market.fdv_usd',
        'github.github.stars', 'github.github.forks', 'github.github.commits_30d',
    ];
    let total = 0;
    let present = 0;
    const missing = [];

    const get = (path) => {
        const parts = path.split('.');
        let v = metrics;
        for (const p of parts) {
            if (v == null) return null;
            v = v[p];
        }
        return v;
    };

    for (const f of fields) {
        total++;
        const env = get(f);
        if (env && isRealNumber(env.value)) {
            present++;
        } else {
            missing.push({ field: f, reason: env?.reason || MISSING_REASONS.MISSING_IDENTIFIER });
        }
    }
    return { total, present, completeness_pct: Math.round((present / total) * 100), missing };
}

module.exports = {
    resolveTvl,
    resolveFees,
    resolveRevenue,
    resolveDexVolume,
    resolveMarketCap,
    resolveMarketMetrics,
    resolveGitHub,
    resolveActiveAddresses,
    resolveAllMetrics,
    calculateCompleteness,
};
