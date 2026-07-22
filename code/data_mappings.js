/* =================================================================
   PAYD Intelligence V2 — DefiLlama Slug Mapping
   ----------------------------------------------------------------
   Ручной маппинг coingecko_id → defillama_slug для известных
   протоколов, потому что DefiLlama использует свои внутренние
   slug-имена, не совпадающие с coingecko_id.
   ================================================================= */

const DEFI_LLAMA_SLUGS = {
    // DEX
    'uniswap': 'uniswap-v3',
    '1inch': '1inch-network',
    'pancakeswap': 'pancakeswap-amm',
    'sushiswap': 'sushiswap',
    'curve-dao-token': 'curve-dao',
    'balancer': 'balancer-v2',
    'dydx': 'dydx',
    'jupiter-exchange-solana': 'jupiter',
    'raydium': 'raydium',

    // Lending
    'aave': 'aave-v3',
    'maker': 'lido', // NOTE: maker — это SKY, не MakerDAO lending
    'compound-governance-token': 'compound-v3',
    'spark': 'spark',
    'morpho': 'morpho',
    'kamino': 'kamino',

    // Liquid Staking
    'lido-dao': 'lido',
    'rocket-pool-eth': 'rocket-pool',
    'jito-staked-sol': 'jito',
    'ether-fi': 'ether.fi',
    'renzo': 'renzo',
    'puffer-finance': 'puffer',

    // RWA
    'ondo-finance': 'ondo-global-markets',
    'ondo-yield-assets': 'ondo-yield-assets',
    'makerdao': 'sky',
    'sky': 'sky',
    'centrifuge': 'centrifuge',
    'maple': 'maple',
    'goldfinch': 'goldfinch',
    'clearpool': 'clearpool',
    'plume': 'plume',
    'open-eden': 'openeden',
    'backed-finance': 'backed',
    'hashnote': 'hashnote',
    'securitize': 'securitize',

    // Layer 1
    'ethereum': 'ethereum',
    'solana': 'solana',
    'avalanche-2': 'avalanche',
    'near': 'near',
    'aptos': 'aptos',
    'sui': 'sui',
    'tron': 'tron',
    'cardano': 'cardano',
    'polkadot': 'polkadot',
    'cosmos': 'cosmos',
    'celestia': 'celestia',
    'monad': 'monad',

    // Layer 2
    'arbitrum': 'arbitrum',
    'optimism': 'optimism',
    'polygon': 'polygon',
    'base': 'base',
    'mantle': 'mantle',
    'linea': 'linea',
    'scroll': 'scroll',
    'manta-network': 'manta',
    'zksync': 'zksync',
    'starknet': 'starknet',

    // DePIN
    'render-token': 'render-network',
    'filecoin': 'filecoin',
    'the-graph': 'the-graph',
    'helium': 'helium',
    'akash-network': 'akash',
    'arweave': 'arweave',
    'io-net': 'io-net',
    'livepeer': 'livepeer',

    // Infrastructure
    'chainlink': 'chainlink',
    'fetch-ai': 'fetch-ai',
    'ocean-protocol': 'ocean-protocol',
    'singularitynet': 'singularitynet',
    'story-2': 'story-protocol',
    'story-protocol': 'story-protocol',

    // AI
    'near-protocol': 'near',
    'bittensor': 'bittensor',
    'injective': 'injective',
    'thorchain': 'thorchain',
};

const GITHUB_REPO_FALLBACKS = {
    // Если основной репо вернул 404, пробуем эти альтернативы
    'ondo-finance': [], // Нет публичного репо
    'story-2': ['storyprotocol/protocol-core', 'storyprotocol/story'],
    'story-protocol': ['storyprotocol/protocol-core', 'storyprotocol/story'],
    'maker': ['sky-ecosystem/makerdao-spellbook', 'sky-ecosystem/dss', 'makerdao/dss'],
    'arbitrum': ['OffchainLabs/nitro', 'OffchainLabs/arbitrum'],
    'uniswap': ['Uniswap/v3-core', 'Uniswap/contracts'],
    'fetch-ai': ['fetchai/agent-protocol', 'fetchai/fetchd'],
    // RWA
    'centrifuge': ['centrifuge/protocol-v3', 'centrifuge/protocol'],
    'maple': ['maple-finance/maple-core-v2', 'maplefinance/maple-core'],
    'goldfinch': ['goldfinch-eng/goldfinch-core', 'goldfinch-finance/goldfinch-core'],
    'clearpool': ['clearpool-finance/clearpool-core', 'clearpool-labs/clearpool-core'],
    'plume': ['plumenetwork/plume', 'plume-network/plume'],
    'openeden': ['openeden/eden', 'openeden-com/contracts'],
    // AI
    'akash-network': ['akash-network/node', 'akash/akash'],
    'bittensor': ['opentensor/bittensor'],
    'singularitynet': ['singnet/snet-cli', 'singularitynet/snet-cli'],
    // DePIN
    'render-token': ['rsksmart/render-token', 'Render-Token/render'],
    'the-graph': ['graphprotocol/graph-node', 'graphprotocol/core'],
    'filecoin': ['filecoin-project/lotus', 'filecoin-project/builtin-actors'],
    'helium': ['helium/blockchain-core', 'helium/gateway-rs'],
    'livepeer': ['livepeer/go-livepeer'],
    'arweave': ['ArweaveTeam/arweave'],
};

module.exports = { DEFI_LLAMA_SLUGS, GITHUB_REPO_FALLBACKS };
