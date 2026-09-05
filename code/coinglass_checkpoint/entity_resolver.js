/* =================================================================
   PAYD Intelligence V2 — Entity Type Resolver
   ----------------------------------------------------------------
   Каждый проект может быть классифицирован как одна или несколько
   entity types: TOKEN, CHAIN, PROTOCOL, APPLICATION, INFRASTRUCTURE

   На основе sector + coingeckoId + id, мы определяем состав типов.
   Это критично для правильного выбора источника данных.
   ================================================================= */

// Маппинг sector → набор базовых entity types
// (можно расширять по мере появления новых проектов)
const SECTOR_TO_ENTITIES = {
    // L1 chains (имеют свой блокчейн)
    layer1: ['CHAIN', 'TOKEN'],

    // L2 chains (имеют свой блокчейн поверх L1)
    layer2: ['CHAIN', 'TOKEN'],

    // DeFi протоколы
    defi: ['PROTOCOL', 'TOKEN'],

    // RWA протоколы
    rwa: ['PROTOCOL', 'TOKEN'],

    // DEX
    dex: ['PROTOCOL', 'TOKEN'],

    // DePIN — физическая инфраструктура
    depin: ['INFRASTRUCTURE', 'TOKEN'],

    // AI проекты (могут быть и infra, и app)
    ai: ['APPLICATION', 'TOKEN'],

    // Инфраструктура (oracle, RPC, мониторинг)
    infrastructure: ['INFRASTRUCTURE', 'TOKEN'],

    // GameFi
    gaming: ['APPLICATION', 'TOKEN'],

    // Meme
    meme: ['TOKEN'],

    // Privacy
    privacy: ['TOKEN'],
};

// Ручные overrides — для известных исключений
// id → дополнительные/другие entity types
const ENTITY_OVERRIDES = {
    // L1 chains
    'ethereum': ['CHAIN', 'TOKEN'],
    'bitcoin': ['CHAIN', 'TOKEN'],
    'solana': ['CHAIN', 'TOKEN'],
    'cardano': ['CHAIN', 'TOKEN'],
    'tron': ['CHAIN', 'TOKEN'],
    'polkadot': ['CHAIN', 'TOKEN'],
    'avalanche-2': ['CHAIN', 'TOKEN'],
    'cosmos': ['CHAIN', 'TOKEN'],
    'near': ['CHAIN', 'TOKEN'],
    'sui': ['CHAIN', 'TOKEN'],
    'aptos': ['CHAIN', 'TOKEN'],
    'tezos': ['CHAIN', 'TOKEN'],
    'monad': ['CHAIN', 'TOKEN'],
    'flow': ['CHAIN', 'TOKEN'],
    'celestia': ['CHAIN', 'TOKEN'],
    'fantom': ['CHAIN', 'TOKEN'],
    'internet-computer': ['CHAIN', 'TOKEN'],
    'hedera-hashgraph': ['CHAIN', 'TOKEN'],
    'iota': ['CHAIN', 'TOKEN'],
    'dogecoin': ['CHAIN', 'TOKEN'],
    'filecoin': ['CHAIN', 'INFRASTRUCTURE', 'TOKEN'],
    'flare': ['CHAIN', 'TOKEN'],
    'berachain': ['CHAIN', 'TOKEN'],
    'sonic-3': ['CHAIN', 'TOKEN'],

    // L2 chains
    'arbitrum': ['CHAIN', 'TOKEN'],
    'optimism': ['CHAIN', 'TOKEN'],
    'polygon': ['CHAIN', 'TOKEN'],
    'base': ['CHAIN', 'TOKEN'],
    'mantle': ['CHAIN', 'TOKEN'],
    'linea': ['CHAIN', 'TOKEN'],
    'scroll': ['CHAIN', 'TOKEN'],
    'starknet': ['CHAIN', 'TOKEN'],
    'zksync': ['CHAIN', 'TOKEN'],
    'manta-network': ['CHAIN', 'TOKEN'],
    'metis': ['CHAIN', 'TOKEN'],
    'celo': ['CHAIN', 'TOKEN'],
    'gnosis': ['CHAIN', 'TOKEN'],
    'moonbeam': ['CHAIN', 'TOKEN'],
    'astar': ['CHAIN', 'TOKEN'],
    'cyber': ['CHAIN', 'TOKEN'],
    'ord': ['CHAIN', 'TOKEN'],
    'connext': ['INFRASTRUCTURE', 'PROTOCOL', 'TOKEN'],
    'everclear': ['INFRASTRUCTURE', 'PROTOCOL', 'TOKEN'],
    'safe': ['INFRASTRUCTURE', 'PROTOCOL', 'TOKEN'],
    'api3': ['INFRASTRUCTURE', 'TOKEN'],
    'layerzero': ['INFRASTRUCTURE', 'PROTOCOL', 'TOKEN'],
    'chainlink': ['INFRASTRUCTURE', 'TOKEN'],
    'the-graph': ['INFRASTRUCTURE', 'TOKEN'],
    'arweave': ['INFRASTRUCTURE', 'TOKEN'],
    'livepeer': ['INFRASTRUCTURE', 'TOKEN'],
    'helium': ['INFRASTRUCTURE', 'TOKEN'],
    'hivemapper': ['INFRASTRUCTURE', 'TOKEN'],
    'iotex': ['INFRASTRUCTURE', 'TOKEN'],
    'peaq': ['INFRASTRUCTURE', 'TOKEN'],
    'geodnet': ['INFRASTRUCTURE', 'TOKEN'],
    'iagon': ['INFRASTRUCTURE', 'TOKEN'],
    'my-neighbor-alice': ['APPLICATION', 'TOKEN'],
    'apecoin': ['APPLICATION', 'TOKEN'],
    'axie-infinity': ['APPLICATION', 'TOKEN'],
    'beam': ['APPLICATION', 'TOKEN'],
    'big-time': ['APPLICATION', 'TOKEN'],
    'illuvium': ['APPLICATION', 'TOKEN'],
    'immutable-x': ['INFRASTRUCTURE', 'APPLICATION', 'TOKEN'],
    'defi-kingdoms': ['APPLICATION', 'TOKEN'],
    'mobox': ['APPLICATION', 'TOKEN'],
    'myria': ['APPLICATION', 'TOKEN'],
    'oasys': ['CHAIN', 'TOKEN'],
    'the-sandbox': ['APPLICATION', 'TOKEN'],
    'yield-guild-games': ['APPLICATION', 'TOKEN'],
    'orderly': ['PROTOCOL', 'INFRASTRUCTURE', 'TOKEN'],
    'zetachain': ['CHAIN', 'INFRASTRUCTURE', 'TOKEN'],
    'zircuit': ['CHAIN', 'TOKEN'],
    'concordium': ['CHAIN', 'TOKEN'],
    'quickswap': ['PROTOCOL', 'TOKEN'],
    'thorchain': ['PROTOCOL', 'INFRASTRUCTURE', 'TOKEN'],
    'synthetix': ['PROTOCOL', 'TOKEN'],
    'stargate': ['PROTOCOL', 'INFRASTRUCTURE', 'TOKEN'],
    'sushi': ['PROTOCOL', 'TOKEN'],
    'synapse': ['PROTOCOL', 'INFRASTRUCTURE', 'TOKEN'],
    'uniswap': ['PROTOCOL', 'TOKEN'],
    'aave': ['PROTOCOL', 'TOKEN'],
    'lido-dao': ['PROTOCOL', 'TOKEN'],
    'pendle': ['PROTOCOL', 'TOKEN'],
    'balancer': ['PROTOCOL', 'TOKEN'],
    '1inch': ['PROTOCOL', 'TOKEN'],
    'convex-finance': ['PROTOCOL', 'TOKEN'],
    'beefy': ['PROTOCOL', 'TOKEN'],
    'loopring': ['PROTOCOL', 'INFRASTRUCTURE', 'TOKEN'],
};

/**
 * Резолвит entity types для проекта.
 * @param {Object} project - { id, sector, coingeckoId }
 * @returns {string[]} Массив entity types, например ['CHAIN', 'TOKEN']
 */
function resolveEntityTypes(project) {
    if (!project) return ['TOKEN'];
    const id = (project.id || '').toLowerCase();
    const cg = (project.coingeckoId || '').toLowerCase();

    // Проверяем override по id
    if (ENTITY_OVERRIDES[id]) {
        return [...new Set(ENTITY_OVERRIDES[id])];
    }
    // По coingeckoId
    if (ENTITY_OVERRIDES[cg]) {
        return [...new Set(ENTITY_OVERRIDES[cg])];
    }

    // По sector
    const sectorTypes = SECTOR_TO_ENTITIES[project.sector] || ['TOKEN'];
    return [...new Set(sectorTypes)];
}

/**
 * Является ли проект chain entity
 */
function isChainEntity(types) {
    return Array.isArray(types) && types.includes('CHAIN');
}

/**
 * Является ли протоколом
 */
function isProtocolEntity(types) {
    return Array.isArray(types) && types.includes('PROTOCOL');
}

/**
 * Является ли инфраструктурой
 */
function isInfraEntity(types) {
    return Array.isArray(types) && types.includes('INFRASTRUCTURE');
}

module.exports = {
    resolveEntityTypes,
    isChainEntity,
    isProtocolEntity,
    isInfraEntity,
    SECTOR_TO_ENTITIES,
    ENTITY_OVERRIDES,
};
