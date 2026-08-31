/* =================================================================
   PAYD Intelligence V2 — Sector Strategies
   ----------------------------------------------------------------
   Каждая крипто-вертикаль имеет свои метрики, источники, скоринг.
   Helium (DePIN) ≠ Uniswap (DeFi) ≠ Ethereum (L1).

   Этот модуль определяет:
   - какие метрики применимы к каждому сектору
   - какие метрики НЕ применимы
   - какой provider primary / fallback
   - какие веса для score breakdown
   - минимальный coverage threshold
   ================================================================= */

/**
 * Sector-specific strategies.
 * Ключ — канонический sector (lowercase)
 */
const SECTOR_STRATEGIES = {
    // ───── L1 (Layer 1 blockchains) ─────
    'layer1': {
        name: 'Layer 1',
        applicable_metrics: [
            'tvl', 'tvl_change_1d', 'tvl_change_7d', 'tvl_change_30d',
            'market_cap', 'fdv', 'price', 'volume_24h', 'market_cap_rank',
            'ath', 'ath_drawdown', 'atl', 'price_change_24h', 'price_change_7d',
            'price_change_30d', 'price_change_1y',
            'circulating_supply', 'total_supply', 'max_supply',
            'github_activity', 'developer_activity',
            'protocol_count', 'bridged_tvl', 'stablecoin_mcap',
            'dex_volume_24h', 'chain_fees_24h', 'app_revenue_24h',
            'active_addresses', 'fees_24h', 'revenue_24h',
        ],
        not_applicable_metrics: [],
        provider_priority: {
            tvl: ['defillama:chain', 'defillama:protocol'],
            market_cap: ['coingecko:markets', 'coinmarketcap'],
            github: ['github:api', 'coingecko:developer_data'],
            fees: ['defillama:fees'],
        },
        score_weights: {
            network_adoption: 20,
            network_economics: 20,
            developer_activity: 15,
            tokenomics: 15,
            network_growth: 10,
            liquidity: 10,
            community: 5,
            partnerships: 0,
            market_momentum: 5,
        },
        min_coverage_pct: 60,
    },

    // ───── L2 (Layer 2) ─────
    'layer2': {
        name: 'Layer 2',
        applicable_metrics: [
            'tvl', 'tvl_change_1d', 'tvl_change_7d', 'tvl_change_30d',
            'market_cap', 'fdv', 'price', 'volume_24h', 'market_cap_rank',
            'github_activity', 'developer_activity',
            'protocol_count', 'bridged_tvl', 'stablecoin_mcap',
            'dex_volume_24h', 'chain_fees_24h', 'app_revenue_24h',
            'active_addresses', 'fees_24h',
            'circulating_supply', 'total_supply', 'max_supply',
        ],
        not_applicable_metrics: [],
        provider_priority: {
            tvl: ['defillama:chain', 'defillama:protocol'],
            market_cap: ['coingecko:markets'],
        },
        score_weights: {
            network_adoption: 20,
            network_economics: 15,
            developer_activity: 15,
            tokenomics: 15,
            network_growth: 10,
            liquidity: 10,
            community: 5,
            partnerships: 5,
            market_momentum: 5,
        },
        min_coverage_pct: 60,
    },

    // ───── DePIN (Decentralized Physical Infrastructure Networks) ─────
    'depin': {
        name: 'DePIN',
        applicable_metrics: [
            // Market (universal)
            'market_cap', 'fdv', 'price', 'volume_24h', 'market_cap_rank',
            'ath', 'ath_drawdown', 'atl', 'price_change_24h', 'price_change_7d',
            'price_change_30d', 'price_change_1y',
            'circulating_supply', 'total_supply', 'max_supply',
            // DePIN-specific
            'network_adoption_score',     // Network scale: hotspots/devices/users
            'active_hotspots',            // Active infrastructure nodes
            'iot_hotspots',               // IoT-specific
            'mobile_hotspots',            // 5G/Mobile hotspots
            'subscribers',                // User base
            'data_transfer_volume',       // Network usage
            'data_credits',               // Token utility
            'network_revenue',            // Operational revenue
            'network_growth_30d',         // Growth trend
            'burn_stats',                 // Token burn mechanism
            // Standard
            'github_activity', 'developer_activity',
            'liquidity', 'dex_volume_24h', 'cex_volume_24h',
            'partnerships', 'community',
            'funding_total', 'funding_rounds',
        ],
        not_applicable_metrics: [
            // DePIN сети НЕ имеют DeFi-style TVL. Это фундаментально другая модель.
            'tvl',
            'tvl_change_1d', 'tvl_change_7d', 'tvl_change_30d',
            'protocol_count', 'bridged_tvl', 'stablecoin_mcap',
            'chain_fees_24h', 'app_revenue_24h',
            'fees_24h', 'revenue_24h',  // Только если применимо (не TVL-related)
        ],
        provider_priority: {
            market_cap: ['coingecko:markets', 'coinmarketcap'],
            github: ['github:api', 'coingecko:developer_data'],
            network_metrics: ['helium_oracle', 'official_docs', 'coingecko'],
            tokenomics: ['official_docs', 'coingecko'],
            funding: ['defillama:raises', 'crunchbase', 'official_docs'],
        },
        // DePIN-specific weights из задания
        score_weights: {
            network_adoption: 20,       // 20% — масштаб сети (hotspots, users)
            network_economics: 15,      // 15% — сетевая экономика (revenue, burn)
            developer_activity: 15,     // 15% — активность разработки
            tokenomics: 15,             // 15% — токеномика (utility, value capture)
            network_growth: 10,         // 10% — рост сети
            liquidity: 10,              // 10% — ликвидность
            community: 5,               // 5%  — сообщество
            partnerships: 5,            // 5%  — партнёрства
            market_momentum: 5,         // 5%  — рыночный моментум
        },
        min_coverage_pct: 50,
    },

    // ───── DeFi ─────
    'defi': {
        name: 'DeFi',
        applicable_metrics: [
            'tvl', 'tvl_change_1d', 'tvl_change_7d', 'tvl_change_30d',
            'market_cap', 'fdv', 'price', 'volume_24h',
            'fees_24h', 'fees_7d', 'fees_30d',
            'revenue_24h', 'revenue_7d', 'revenue_30d',
            'holders_revenue',
            'dex_volume_24h', 'perp_volume_24h',
            'github_activity', 'developer_activity',
            'circulating_supply', 'total_supply', 'max_supply',
            'community', 'partnerships',
        ],
        not_applicable_metrics: [
            'protocol_count', 'bridged_tvl', 'stablecoin_mcap',
            'active_addresses',  // Опционально
        ],
        provider_priority: {
            tvl: ['defillama:protocol'],
            fees: ['defillama:fees'],
            revenue: ['defillama:fees'],
        },
        score_weights: {
            tvl: 25,
            network_economics: 20,
            developer_activity: 15,
            tokenomics: 10,
            liquidity: 10,
            community: 5,
            partnerships: 5,
            market_momentum: 10,
        },
        min_coverage_pct: 60,
    },

    // ───── RWA (Real World Assets) ─────
    'rwa': {
        name: 'RWA',
        applicable_metrics: [
            'tvl', 'market_cap', 'fdv', 'price', 'volume_24h',
            'asset_value_locked', 'asset_categories',
            'github_activity', 'developer_activity',
            'compliance_certifications', 'jurisdictions',
            'circulating_supply', 'total_supply',
            'community', 'partnerships',
        ],
        not_applicable_metrics: [
            'fees_24h', 'revenue_24h',  // Если не применимо
        ],
        provider_priority: {
            tvl: ['defillama:protocol'],
        },
        score_weights: {
            tvl: 25,
            compliance: 20,
            tokenomics: 15,
            liquidity: 10,
            developer_activity: 10,
            community: 5,
            partnerships: 10,
            market_momentum: 5,
        },
        min_coverage_pct: 50,
    },

    // ───── AI Infrastructure ─────
    'ai': {
        name: 'AI Infrastructure',
        applicable_metrics: [
            'market_cap', 'fdv', 'price', 'volume_24h',
            'github_activity', 'developer_activity',
            'model_count', 'api_calls', 'compute_capacity',
            'circulating_supply', 'total_supply',
            'community', 'partnerships',
        ],
        not_applicable_metrics: ['tvl', 'fees_24h', 'revenue_24h'],
        provider_priority: {
            market_cap: ['coingecko:markets'],
        },
        score_weights: {
            developer_activity: 25,
            network_adoption: 15,
            tokenomics: 15,
            liquidity: 10,
            community: 10,
            partnerships: 15,
            market_momentum: 10,
        },
        min_coverage_pct: 50,
    },

    // ───── Gaming ─────
    'gaming': {
        name: 'Gaming',
        applicable_metrics: [
            'market_cap', 'fdv', 'price', 'volume_24h',
            'github_activity', 'developer_activity',
            'daily_active_users', 'monthly_active_users',
            'circulating_supply', 'total_supply',
            'community', 'partnerships',
        ],
        not_applicable_metrics: ['tvl', 'fees_24h', 'revenue_24h'],
        provider_priority: {
            market_cap: ['coingecko:markets'],
        },
        score_weights: {
            network_adoption: 25,
            developer_activity: 15,
            tokenomics: 15,
            liquidity: 10,
            community: 15,
            partnerships: 10,
            market_momentum: 10,
        },
        min_coverage_pct: 50,
    },

    // ───── DeSci ─────
    'desci': {
        name: 'DeSci',
        applicable_metrics: [
            'market_cap', 'fdv', 'price', 'volume_24h',
            'github_activity', 'developer_activity',
            'circulating_supply', 'total_supply',
            'community', 'partnerships',
        ],
        not_applicable_metrics: ['tvl', 'fees_24h', 'revenue_24h'],
        provider_priority: {
            market_cap: ['coingecko:markets'],
        },
        score_weights: {
            developer_activity: 20,
            network_adoption: 20,
            tokenomics: 15,
            liquidity: 10,
            community: 15,
            partnerships: 10,
            market_momentum: 10,
        },
        min_coverage_pct: 50,
    },
};

/**
 * Default стратегия для неизвестных секторов.
 * Применяет только universal metrics.
 */
const DEFAULT_STRATEGY = {
    name: 'Default',
    applicable_metrics: [
        'market_cap', 'fdv', 'price', 'volume_24h',
        'github_activity', 'developer_activity',
        'circulating_supply', 'total_supply', 'max_supply',
        'community', 'partnerships',
    ],
    not_applicable_metrics: [],
    provider_priority: {
        market_cap: ['coingecko:markets'],
    },
    score_weights: {
        network_adoption: 15,
        developer_activity: 15,
        tokenomics: 15,
        liquidity: 10,
        community: 10,
        partnerships: 10,
        market_momentum: 10,
        network_economics: 15,
    },
    min_coverage_pct: 40,
};

/**
 * Получить стратегию для сектора
 */
function getStrategy(sector) {
    if (!sector) return DEFAULT_STRATEGY;
    const canon = String(sector).toLowerCase().trim();
    return SECTOR_STRATEGIES[canon] || DEFAULT_STRATEGY;
}

/**
 * Проверить, применима ли метрика к сектору
 */
function isMetricApplicable(sector, metric) {
    const strategy = getStrategy(sector);
    if (strategy.not_applicable_metrics.includes(metric)) return false;
    if (strategy.applicable_metrics.length === 0) return true;
    return strategy.applicable_metrics.includes(metric);
}

/**
 * Получить список applicable metrics
 */
function getApplicableMetrics(sector) {
    const strategy = getStrategy(sector);
    return [...strategy.applicable_metrics];
}

/**
 * Получить список not_applicable metrics
 */
function getNotApplicableMetrics(sector) {
    const strategy = getStrategy(sector);
    return [...strategy.not_applicable_metrics];
}

/**
 * Получить weights для score breakdown
 */
function getScoreWeights(sector) {
    const strategy = getStrategy(sector);
    return { ...strategy.score_weights };
}

/**
 * Сумма весов (должна быть 100 для валидного scoring)
 */
function getWeightsSum(sector) {
    return Object.values(getScoreWeights(sector)).reduce((a, b) => a + b, 0);
}

/**
 * Min coverage threshold для сектора
 */
function getMinCoverage(sector) {
    return getStrategy(sector).min_coverage_pct;
}

/**
 * Проверить, проходит ли сектор coverage threshold
 */
function passesCoverage(sector, coveragePct) {
    return coveragePct >= getMinCoverage(sector);
}

module.exports = {
    SECTOR_STRATEGIES,
    DEFAULT_STRATEGY,
    getStrategy,
    isMetricApplicable,
    getApplicableMetrics,
    getNotApplicableMetrics,
    getScoreWeights,
    getWeightsSum,
    getMinCoverage,
    passesCoverage,
};
