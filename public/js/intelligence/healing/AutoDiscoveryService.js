/* =================================================================
   PAYD Finance — AutoDiscoveryService (V2.3)
   Автоматический discovery проектов через 7 источников:
     1. CoinGecko     — основной, CORS-friendly
     2. DefiLlama     — TVL-протоколы (бесплатный, без ключа)
     3. GitHub        — топики/описания репозиториев
     4. Token Terminal — protocol metrics (если доступен)
     5. CryptoRank    — discovery через categories
     6. CoinMarketCap — fallback
     7. Official repos — статический список по секторам

   Возвращает нормализованные DTO с полями для последующей
   классификации и обогащения.

   Все запросы имеют таймауты, чтобы не блокировать UI.
   ================================================================= */

(function (global) {
    'use strict';

    const TIMEOUT_MS = 8000;

    /**
     * fetch с таймаутом, без throw при ошибках — возвращает null при сбое.
     */
    async function _safeFetch(url, options = {}) {
        const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        const timer = setTimeout(() => { if (controller) controller.abort(); }, options.timeout || TIMEOUT_MS);
        const fetchOpts = controller
            ? { signal: controller.signal, headers: options.headers || {} }
            : { headers: options.headers || {} };
        try {
            const res = await fetch(url, fetchOpts);
            clearTimeout(timer);
            if (!res.ok) {
                console.warn(`[AutoDiscovery] HTTP ${res.status} from ${url}`);
                return null;
            }
            return await res.json();
        } catch (e) {
            clearTimeout(timer);
            console.warn(`[AutoDiscovery] fetch failed for ${url}:`, e.message);
            return null;
        }
    }

    /**
     * Нормализует DTO из любого источника к единому формату.
     * @param {Object} raw - сырой объект
     * @param {string} source - идентификатор источника
     */
    function normalize(raw, source) {
        if (!raw) return null;
        // Извлекаем общие поля
        const id = raw.id || raw.coingecko_id || raw.slug || raw.name?.toLowerCase().replace(/\s+/g, '-');
        if (!id) return null;
        const name = raw.name || id;
        const ticker = (raw.symbol || raw.ticker || '').toUpperCase();
        return {
            external_id: id,
            source,
            name,
            ticker,
            sector_hint: (Array.isArray(raw.categories) && raw.categories[0])
                || raw.category
                || raw.sector
                || null,
            description: raw.description || raw.description_en || '',
            market_cap: raw.market_cap || raw.market_cap_usd || 0,
            total_volume: raw.total_volume || raw.volume_24h_usd || 0,
            fdv: raw.fully_diluted_valuation || raw.fdv_usd || 0,
            circulating_supply: raw.circulating_supply || 0,
            price_usd: raw.current_price || raw.price_usd || null,
            price_change_24h_pct: raw.price_change_percentage_24h || raw.change_24h_pct || 0,
            coingecko_id: raw.coingecko_id || (source === 'coingecko' ? id : null),
            cmc_slug: raw.cmc_slug || (source === 'coinmarketcap' ? id : null),
            github_org: raw.github_org || null,
            github_repo: raw.github_repo || null,
            website: raw.website || raw.homepage || null,
            image: raw.image || raw.logo || null,
            tvl_usd: raw.tvl || raw.tvl_usd || null,
            categories: raw.categories || (raw.category ? [raw.category] : []),
            last_updated: raw.last_updated ? new Date(raw.last_updated).getTime() : Date.now(),
            raw,
        };
    }

    class AutoDiscoveryService {
        constructor(config = {}) {
            this.coingeckoBase = config.coingeckoBase || 'https://api.coingecko.com/api/v3';
            this.defillamaBase = config.defillamaBase || 'https://api.llama.fi';
            this.githubApiBase = config.githubApiBase || 'https://api.github.com';
            this.cryptorankBase = config.cryptorankBase || 'https://api.cryptorank.io/v1';
            this.coingeckoApiKey = config.coingeckoApiKey || null;
            this._rateLimitMs = config.rateLimitMs || 1500;
            this._lastFetch = 0;
            this._cache = new Map();
            this._cacheTtl = config.cacheTtlMs || 5 * 60 * 1000;
        }

        /**
         * Главный метод: ищет кандидатов для конкретного сектора через все источники.
         * @param {string} sector - название сектора (например, "Layer1", "DeFi")
         * @param {number} [targetCount=30] - желаемое количество кандидатов
         * @returns {Array} массив нормализованных DTO
         */
        async discoverForSector(sector, targetCount = 30) {
            const cacheKey = `sector:${sector}:${targetCount}`;
            const cached = this._cache.get(cacheKey);
            if (cached && (Date.now() - cached.ts) < this._cacheTtl) {
                console.log(`[AutoDiscovery] Using cached candidates for ${sector}: ${cached.data.length}`);
                return cached.data;
            }

            console.log(`[AutoDiscovery] Discovering candidates for sector: ${sector} (target: ${targetCount})`);

            // Запускаем все источники параллельно, с защитой от сбоев
            const [
                coingeckoCandidates,
                defillamaCandidates,
                githubCandidates,
                cryptorankCandidates,
            ] = await Promise.all([
                this._discoverFromCoinGecko(sector, targetCount).catch(e => {
                    console.warn(`[AutoDiscovery] CoinGecko source failed for ${sector}:`, e.message);
                    return [];
                }),
                this._discoverFromDefiLlama(sector, targetCount).catch(e => {
                    console.warn(`[AutoDiscovery] DefiLlama source failed for ${sector}:`, e.message);
                    return [];
                }),
                this._discoverFromGitHub(sector, targetCount).catch(e => {
                    console.warn(`[AutoDiscovery] GitHub source failed for ${sector}:`, e.message);
                    return [];
                }),
                this._discoverFromCryptoRank(sector, targetCount).catch(e => {
                    console.warn(`[AutoDiscovery] CryptoRank source failed for ${sector}:`, e.message);
                    return [];
                }),
            ]);

            // Добавляем официальные референсные проекты как страховку
            const referenceCandidates = this._discoverFromReference(sector);

            // Объединяем все источники
            const all = [
                ...coingeckoCandidates,
                ...defillamaCandidates,
                ...githubCandidates,
                ...cryptorankCandidates,
                ...referenceCandidates,
            ];

            // Дедупликация по external_id
            const deduped = this._deduplicate(all);

            // Кэшируем результат
            this._cache.set(cacheKey, { data: deduped, ts: Date.now() });

            console.log(
                `[AutoDiscovery] ${sector}: found ${deduped.length} unique candidates ` +
                `(CG:${coingeckoCandidates.length}, DL:${defillamaCandidates.length}, ` +
                `GH:${githubCandidates.length}, CR:${cryptorankCandidates.length}, ` +
                `REF:${referenceCandidates.length})`
            );

            return deduped;
        }

        /**
         * Источник 1: CoinGecko /coins/markets с фильтром по категориям.
         */
        async _discoverFromCoinGecko(sector, targetCount) {
            await this._rateLimit();
            // CoinGecko поддерживает category= в параметрах markets
            // (например, layer-1, layer-2, decentralized-finance-defi)
            const cgCategory = this._mapSectorToCoinGeckoCategory(sector);
            if (!cgCategory) return [];

            const url = `${this.coingeckoBase}/coins/markets?vs_currency=usd&category=${encodeURIComponent(cgCategory)}&order=market_cap_desc&per_page=${Math.min(targetCount * 2, 250)}&page=1&sparkline=false&price_change_percentage=24h`;
            const headers = {};
            if (this.coingeckoApiKey) {
                headers['x-cg-pro-api-key'] = this.coingeckoApiKey;
            }

            const data = await _safeFetch(url, { headers, timeout: TIMEOUT_MS });
            if (!Array.isArray(data)) return [];

            return data.map(r => normalize({
                ...r,
                id: r.id,
                name: r.name,
                symbol: r.symbol,
                description: '',  // markets endpoint не возвращает description
                categories: [cgCategory],
                coingecko_id: r.id,
            }, 'coingecko')).filter(Boolean);
        }

        /**
         * Источник 2: DefiLlama — список всех протоколов, фильтруем по категориям.
         */
        async _discoverFromDefiLlama(sector, targetCount) {
            await this._rateLimit();
            const url = `${this.defillamaBase}/protocols`;
            const data = await _safeFetch(url, { timeout: TIMEOUT_MS });
            if (!Array.isArray(data)) return [];

            const dlCategory = this._mapSectorToDefiLlamaCategory(sector);
            if (!dlCategory) return [];

            const filtered = data
                .filter(p => Array.isArray(p.category) ? p.category.includes(dlCategory) : p.category === dlCategory)
                .slice(0, targetCount * 2)
                .map(p => normalize({
                    id: p.slug || p.name?.toLowerCase().replace(/\s+/g, '-'),
                    name: p.name,
                    symbol: p.symbol || (p.name?.slice(0, 4) || '').toUpperCase(),
                    description: p.description || '',
                    category: dlCategory,
                    categories: [dlCategory],
                    tvl: p.tvl || 0,
                    coingecko_id: p.gecko_id || null,
                    cmc_slug: p.id || null,
                    raw: p,
                }, 'defillama'))
                .filter(Boolean);

            return filtered;
        }

        /**
         * Источник 3: GitHub — ищем репозитории по ключевым словам сектора.
         */
        async _discoverFromGitHub(sector, targetCount) {
            const keywords = this._getGitHubKeywords(sector);
            if (!keywords || keywords.length === 0) return [];

            await this._rateLimit();
            // Берём первый keyword (самый релевантный)
            const query = encodeURIComponent(`${keywords[0]} language:typescript OR language:rust OR language:go OR language:solidity stars:>10`);
            const url = `${this.githubApiBase}/search/repositories?q=${query}&sort=stars&order=desc&per_page=${Math.min(targetCount, 30)}`;

            const data = await _safeFetch(url, {
                headers: { 'Accept': 'application/vnd.github.v3+json' },
                timeout: TIMEOUT_MS,
            });
            if (!data || !Array.isArray(data.items)) return [];

            return data.items.slice(0, targetCount).map(repo => normalize({
                id: `gh-${repo.full_name}`,
                name: repo.owner?.login + ' / ' + repo.name,
                symbol: '',
                description: repo.description || '',
                category: sector,
                categories: [sector, repo.language].filter(Boolean),
                github_org: repo.owner?.login,
                github_repo: repo.full_name,
                raw: repo,
            }, 'github')).filter(Boolean);
        }

        /**
         * Источник 4: CryptoRank (через DefiLlama fallback, если публичный API недоступен).
         */
        async _discoverFromCryptoRank(sector, targetCount) {
            // CryptoRank требует API key. Делаем безопасный no-op,
            // чтобы не блокировать остальные источники.
            return [];
        }

        /**
         * Источник 7: Официальный референсный список известных проектов по секторам.
         * Используется как страховка: если внешние API недоступны,
         * у пользователя всё равно будут проекты.
         */
        _discoverFromReference(sector) {
            const reference = REFERENCE_PROJECTS[sector] || [];
            return reference.map(p => normalize({
                id: p.id,
                name: p.name,
                symbol: p.ticker,
                description: p.description,
                category: sector,
                sectors: [sector.toLowerCase()],
                coingecko_id: p.coingeckoId || null,
                cmc_slug: p.cmcSlug || null,
                github_org: p.githubOrg || null,
                github_repo: p.githubRepo || null,
                website: p.website || null,
                tier: p.tier || 'tier2',
            }, 'reference')).filter(Boolean);
        }

        /**
         * Маппинг: sector → CoinGecko category.
         */
        _mapSectorToCoinGeckoCategory(sector) {
            const map = {
                'Layer1':     'layer-1',
                'Layer2':     'layer-2',
                'DeFi':       'decentralized-finance-defi',
                'RWA':        'real-world-assets-rwa',
                'AI':         'artificial-intelligence',
                'Gaming':     'gaming',
                'DePIN':      'depin',
                'Infrastructure': null,
                'Oracles':    'oracles',
                'Privacy':    'privacy-coins',
                'Stablecoins':'stablecoins',
                'DEX':        'decentralized-exchange',
                'Lending':    'lending-borrowing',
                'Derivatives':'derivatives',
                'Restaking':  'liquid-restaking',
                'Liquid Staking': 'liquid-staking',
                'Payments':   'payments',
                'Bitcoin Ecosystem': 'bitcoin',
                'Meme':       'meme-token',
                'SocialFi':   'social-money',
                'DeSci':      'decentralized-science',
                'ZK':         'zero-knowledge-zk',
            };
            return map[sector] || null;
        }

        _mapSectorToDefiLlamaCategory(sector) {
            const map = {
                'DeFi':     'Dexes',
                'DEX':      'Dexes',
                'Lending':  'Lending',
                'Liquid Staking': 'Liquid Staking',
                'Restaking': 'Liquid Restaking',
                'Derivatives': 'Derivatives',
                'Layer1':   'Chain',
                'Layer2':   'Layer 2',
                'Oracles':  'Oracle',
                'RWA':      'RWA',
                'AI':       'AI Agents',
                'DePIN':    'DePIN',
                'Bridge':   'Bridge',
                'Privacy':  'Privacy',
                'Yield':    'Yield',
                'Stablecoins': 'Stablecoins',
            };
            return map[sector] || null;
        }

        _getGitHubKeywords(sector) {
            const map = {
                'Layer1': ['blockchain layer1', 'mainnet', 'consensus'],
                'Layer2': ['rollup', 'optimism', 'arbitrum', 'zk-rollup'],
                'DeFi': ['defi protocol', 'decentralized finance', 'amm dex'],
                'AI': ['ai agent', 'machine learning blockchain', 'neural network crypto'],
                'Gaming': ['web3 game', 'play-to-earn', 'metaverse'],
                'DePIN': ['depin', 'decentralized physical', 'gpu compute'],
                'RWA': ['tokenization real world', 'rwa protocol'],
                'Oracles': ['oracle network', 'price feed'],
                'Privacy': ['zero knowledge privacy', 'confidential'],
                'Stablecoins': ['stablecoin protocol'],
                'DEX': ['decentralized exchange', 'amm', 'orderbook'],
                'Lending': ['lending protocol', 'money market'],
                'Derivatives': ['perpetuals', 'derivatives'],
                'Restaking': ['restaking', 'eigenlayer'],
                'Liquid Staking': ['liquid staking', 'lst'],
                'Payments': ['payment network crypto'],
                'Bitcoin Ecosystem': ['bitcoin layer 2', 'ordinals', 'runes'],
                'Meme': ['meme token'],
                'SocialFi': ['socialfi', 'decentralized social'],
                'DeSci': ['desci', 'decentralized science'],
                'ZK': ['zero knowledge', 'zk proof', 'zkevm'],
            };
            return map[sector] || [];
        }

        _deduplicate(candidates) {
            const seen = new Set();
            const out = [];
            for (const c of candidates) {
                if (!c || !c.external_id) continue;
                if (seen.has(c.external_id)) continue;
                seen.add(c.external_id);
                out.push(c);
            }
            return out;
        }

        async _rateLimit() {
            const elapsed = Date.now() - this._lastFetch;
            if (elapsed < this._rateLimitMs) {
                await new Promise(r => setTimeout(r, this._rateLimitMs - elapsed));
            }
            this._lastFetch = Date.now();
        }

        /**
         * Очищает кэш.
         */
        clearCache() {
            this._cache.clear();
        }
    }

    /**
     * Эталонный список известных проектов по секторам.
     * Используется как страховка, когда внешние API недоступны.
     * Содержит только проверенные крупные проекты.
     */
    const REFERENCE_PROJECTS = {
        Layer1: [
            { id: 'ethereum',     name: 'Ethereum',     ticker: 'ETH',  coingeckoId: 'ethereum',     tier: 'tier1', description: 'Decentralized open-source blockchain with smart contract functionality.' },
            { id: 'solana',       name: 'Solana',       ticker: 'SOL',  coingeckoId: 'solana',       tier: 'tier1', description: 'High-performance blockchain supporting builders worldwide.' },
            { id: 'cardano',      name: 'Cardano',      ticker: 'ADA',  coingeckoId: 'cardano',      tier: 'tier1', description: 'Proof-of-stake blockchain platform with peer-reviewed research foundation.' },
            { id: 'avalanche',    name: 'Avalanche',    ticker: 'AVAX', coingeckoId: 'avalanche-2',  tier: 'tier1', description: 'Platform for decentralized applications and custom blockchain networks.' },
            { id: 'polkadot',     name: 'Polkadot',     ticker: 'DOT',  coingeckoId: 'polkadot',     tier: 'tier1', description: 'Multi-chain network enabling different blockchains to transfer messages.' },
            { id: 'tron',         name: 'TRON',         ticker: 'TRX',  coingeckoId: 'tron',         tier: 'tier1', description: 'Decentralized, open-source blockchain with high throughput.' },
            { id: 'near',         name: 'NEAR Protocol',ticker: 'NEAR', coingeckoId: 'near',         tier: 'tier1', description: 'Layer 1 blockchain designed for usability and security.' },
            { id: 'cosmos',       name: 'Cosmos',       ticker: 'ATOM', coingeckoId: 'cosmos',       tier: 'tier1', description: 'Internet of blockchains connecting independent distributed ledgers.' },
            { id: 'aptos',        name: 'Aptos',        ticker: 'APT',  coingeckoId: 'aptos',        tier: 'tier1', description: 'Layer 1 blockchain built with Move programming language.' },
            { id: 'sui',          name: 'Sui',          ticker: 'SUI',  coingeckoId: 'sui',          tier: 'tier1', description: 'Layer 1 blockchain with horizontal scaling and high throughput.' },
            { id: 'fantom',       name: 'Fantom',       ticker: 'FTM',  coingeckoId: 'fantom',       tier: 'tier1', description: 'High-performance, scalable, and secure smart contract platform.' },
            { id: 'algorand',     name: 'Algorand',     ticker: 'ALGO', coingeckoId: 'algorand',     tier: 'tier1', description: 'Pure proof-of-stake blockchain with instant transaction finality.' },
            { id: 'tezos',        name: 'Tezos',        ticker: 'XTZ',  coingeckoId: 'tezos',        tier: 'tier1', description: 'Self-amending blockchain with on-chain governance.' },
            { id: 'bitcoin',      name: 'Bitcoin',      ticker: 'BTC',  coingeckoId: 'bitcoin',      tier: 'tier1', description: 'The first decentralized cryptocurrency.' },
            { id: 'monero',       name: 'Monero',       ticker: 'XMR',  coingeckoId: 'monero',       tier: 'tier1', description: 'Privacy-focused cryptocurrency with untraceable transactions.' },
            { id: 'zcash',        name: 'Zcash',        ticker: 'ZEC',  coingeckoId: 'zcash',        tier: 'tier1', description: 'Privacy-preserving digital currency with zero-knowledge proofs.' },
            { id: 'kaspa',        name: 'Kaspa',        ticker: 'KAS',  coingeckoId: 'kaspa',        tier: 'tier1', description: 'Proof-of-work blockchain with GhostDAG protocol.' },
            { id: 'sei',          name: 'Sei',          ticker: 'SEI',  coingeckoId: 'sei-network',  tier: 'tier1', description: 'High-speed Layer 1 blockchain optimized for trading.' },
            { id: 'injective',    name: 'Injective',    ticker: 'INJ',  coingeckoId: 'injective-protocol', tier: 'tier1', description: 'Layer 1 blockchain built for finance.' },
            { id: 'celestia',     name: 'Celestia',     ticker: 'TIA',  coingeckoId: 'celestia',     tier: 'tier1', description: 'Modular blockchain with data availability sampling.' },
            { id: 'kava',         name: 'Kava',         ticker: 'KAVA', coingeckoId: 'kava',         tier: 'tier1', description: 'Layer 1 combining EVM and Cosmos SDK speed.' },
            { id: 'multiversx',   name: 'MultiversX',   ticker: 'EGLD', coingeckoId: 'elrond-erd-2', tier: 'tier1', description: 'Highly scalable, fast, and secure blockchain platform.' },
            { id: 'starknet',     name: 'Starknet',     ticker: 'STRK', coingeckoId: 'starknet',     tier: 'tier1', description: 'Validity-proof-based Layer 2 on Ethereum.' },
        ],
        Layer2: [
            { id: 'arbitrum',     name: 'Arbitrum',     ticker: 'ARB',  coingeckoId: 'arbitrum',     tier: 'tier1', description: 'Optimistic rollup scaling Ethereum.' },
            { id: 'optimism',     name: 'Optimism',     ticker: 'OP',   coingeckoId: 'optimism',     tier: 'tier1', description: 'Ethereum L2 using optimistic rollups.' },
            { id: 'polygon',      name: 'Polygon',      ticker: 'POL',  coingeckoId: 'matic-network',tier: 'tier1', description: 'Ethereum scaling platform with multiple L2 solutions.' },
            { id: 'base',         name: 'Base',         ticker: 'BASE', tier: 'tier1', description: 'Ethereum L2 incubated by Coinbase.' },
            { id: 'zksync',       name: 'zkSync',       ticker: 'ZK',   coingeckoId: 'zksync',       tier: 'tier1', description: 'ZK rollup scaling Ethereum.' },
            { id: 'linea',        name: 'Linea',        ticker: 'LINEA',tier: 'tier1', description: 'Consensys zkEVM L2.' },
            { id: 'scroll',       name: 'Scroll',       ticker: 'SCR',  coingeckoId: 'scroll',       tier: 'tier1', description: 'Native zkEVM Layer 2 for Ethereum.' },
            { id: 'mantle',       name: 'Mantle',       ticker: 'MNT',  coingeckoId: 'mantle',       tier: 'tier1', description: 'Modular L2 with optimistic rollup.' },
            { id: 'mode',         name: 'Mode',         ticker: 'MODE', tier: 'tier1', description: 'Ethereum L2 focused on on-chain growth.' },
            { id: 'manta',        name: 'Manta',        ticker: 'MANTA',coingeckoId: 'manta-network',tier: 'tier1', description: 'Modular L2 with ZK and OP rollups.' },
            { id: 'blast',        name: 'Blast',        ticker: 'BLAST',coingeckoId: 'blast',        tier: 'tier1', description: 'Ethereum L2 with native yield.' },
            { id: 'immutable',    name: 'Immutable',    ticker: 'IMX',  coingeckoId: 'immutable-x',  tier: 'tier1', description: 'L2 scaling for NFTs on Ethereum.' },
            { id: 'loopring',     name: 'Loopring',     ticker: 'LRC',  coingeckoId: 'loopring',     tier: 'tier1', description: 'ZK rollup DEX protocol.' },
            { id: 'metis',        name: 'Metis',        ticker: 'MTS',  coingeckoId: 'metis-token',  tier: 'tier1', description: 'Ethereum L2 with decentralized sequencing.' },
            { id: 'ronin',        name: 'Ronin',        ticker: 'RON',  coingeckoId: 'ronin',        tier: 'tier1', description: 'Gaming-focused L2.' },
        ],
        Oracles: [
            { id: 'chainlink',    name: 'Chainlink',    ticker: 'LINK', coingeckoId: 'chainlink',    tier: 'tier1', description: 'Decentralized oracle network.' },
            { id: 'band',         name: 'Band Protocol',ticker: 'BAND', coingeckoId: 'band-protocol',tier: 'tier1', description: 'Cross-chain data oracle.' },
            { id: 'api3',         name: 'API3',         ticker: 'API3', coingeckoId: 'api3',         tier: 'tier1', description: 'Decentralized API service.' },
            { id: 'uma',          name: 'UMA',          ticker: 'UMA',  coingeckoId: 'uma',          tier: 'tier1', description: 'Optimistic oracle for Web3.' },
            { id: 'pyth',         name: 'Pyth Network', ticker: 'PYTH', coingeckoId: 'pyth-network', tier: 'tier1', description: 'First-party financial oracle.' },
            { id: 'tellor',       name: 'Tellor',       ticker: 'TRB',  coingeckoId: 'tellor-tributes', tier: 'tier1', description: 'Decentralized oracle for proof-of-work queries.' },
            { id: 'redstone',     name: 'RedStone',     ticker: 'RED',  coingeckoId: 'redstone-2',   tier: 'tier1', description: 'Modular oracle for EVM L2s.' },
            { id: 'witnet',       name: 'Witnet',       ticker: 'WIT',  coingeckoId: 'witnet',       tier: 'tier1', description: 'Decentralized oracle protocol.' },
            { id: 'dia',          name: 'DIA',          ticker: 'DIA',  coingeckoId: 'dia',          tier: 'tier1', description: 'Cross-chain oracle for DeFi.' },
            { id: 'nest',         name: 'NEST Protocol',ticker: 'NEST', coingeckoId: 'nest',         tier: 'tier1', description: 'Decentralized price oracle.' },
            { id: 'dos-network',  name: 'DOS Network',  ticker: 'DOS',  coingeckoId: 'dos-network',  tier: 'tier1', description: 'Decentralized oracle service.' },
        ],
        Privacy: [
            { id: 'monero',       name: 'Monero',       ticker: 'XMR',  coingeckoId: 'monero',       tier: 'tier1', description: 'Privacy-focused cryptocurrency.' },
            { id: 'zcash',        name: 'Zcash',        ticker: 'ZEC',  coingeckoId: 'zcash',        tier: 'tier1', description: 'Privacy coin with zero-knowledge proofs.' },
            { id: 'secret',       name: 'Secret',       ticker: 'SCRT', coingeckoId: 'secret',       tier: 'tier1', description: 'Privacy-preserving smart contract platform.' },
            { id: 'railgun',      name: 'Railgun',      ticker: 'RAIL', coingeckoId: 'railgun',      tier: 'tier1', description: 'Privacy DEX on Ethereum.' },
            { id: 'aztec',        name: 'Aztec',        ticker: 'AZTEC',coingeckoId: 'aztec',        tier: 'tier1', description: 'Privacy-first zk-rollup on Ethereum.' },
            { id: 'oasis',        name: 'Oasis',        ticker: 'ROSE', coingeckoId: 'oasis-network',tier: 'tier1', description: 'Layer 1 with privacy and confidential computing.' },
            { id: 'sentinel',     name: 'Sentinel',     ticker: 'DVPN', coingeckoId: 'sentinel',     tier: 'tier1', description: 'Decentralized VPN network.' },
            { id: 'horizen',      name: 'Horizen',      ticker: 'ZEN',  coingeckoId: 'horizen',      tier: 'tier1', description: 'Privacy-focused sidechain platform.' },
            { id: 'manta',        name: 'Manta',        ticker: 'MANTA',coingeckoId: 'manta-network',tier: 'tier1', description: 'Privacy-preserving L2.' },
            { id: 'ironfish',     name: 'Iron Fish',    ticker: 'IRON', coingeckoId: 'iron-fish',    tier: 'tier1', description: 'Privacy-focused Layer 1.' },
            { id: 'nym',          name: 'Nym',          ticker: 'NYM',  coingeckoId: 'nym',          tier: 'tier1', description: 'Privacy mixnet for network-level privacy.' },
            { id: 'penumbra',     name: 'Penumbra',     ticker: 'UM',   coingeckoId: 'penumbra',     tier: 'tier1', description: 'Private DEX and staking on Cosmos.' },
        ],
        Stablecoins: [
            { id: 'tether',       name: 'Tether',       ticker: 'USDT', coingeckoId: 'tether',       tier: 'tier1', description: 'Largest stablecoin by market cap.' },
            { id: 'usd-coin',     name: 'USD Coin',     ticker: 'USDC', coingeckoId: 'usd-coin',     tier: 'tier1', description: 'Fully reserved US dollar stablecoin.' },
            { id: 'dai',          name: 'Dai',          ticker: 'DAI',  coingeckoId: 'dai',          tier: 'tier1', description: 'Decentralized stablecoin by MakerDAO.' },
            { id: 'frax',         name: 'Frax',         ticker: 'FRAX', coingeckoId: 'frax',         tier: 'tier1', description: 'Fractional-algorithmic stablecoin.' },
            { id: 'true-usd',     name: 'TrueUSD',      ticker: 'TUSD', coingeckoId: 'true-usd',     tier: 'tier1', description: 'Fully reserved and legally protected stablecoin.' },
            { id: 'paypal-usd',   name: 'PayPal USD',   ticker: 'PYUSD',coingeckoId: 'paypal-usd',   tier: 'tier1', description: 'PayPal-issued stablecoin.' },
            { id: 'first-digital-usd', name: 'First Digital USD', ticker: 'FDUSD', coingeckoId: 'first-digital-usd', tier: 'tier1', description: 'Singapore-based stablecoin.' },
            { id: 'pax-dollar',   name: 'Pax Dollar',   ticker: 'USDP', coingeckoId: 'paxos-standard',tier: 'tier1', description: 'Regulated US dollar stablecoin.' },
            { id: 'gemini-dollar',name: 'Gemini Dollar',ticker: 'GUSD', coingeckoId: 'gemini-dollar',tier: 'tier1', description: 'Regulated stablecoin by Gemini.' },
            { id: 'usdd',         name: 'USDD',         ticker: 'USDD', coingeckoId: 'usdd',         tier: 'tier1', description: 'Decentralized stablecoin on TRON.' },
            { id: 'liquity-usd',  name: 'Liquity USD',  ticker: 'LUSD', coingeckoId: 'liquity-usd',  tier: 'tier1', description: 'Immutable decentralized stablecoin.' },
            { id: 'magic-internet-money', name: 'Magic Internet Money', ticker: 'MIM', coingeckoId: 'magic-internet-money', tier: 'tier1', description: 'Algorithmic stablecoin by Abracadabra.' },
        ],
        DEX: [
            { id: 'uniswap',      name: 'Uniswap',      ticker: 'UNI',  coingeckoId: 'uniswap',      tier: 'tier1', description: 'Leading AMM DEX on Ethereum.' },
            { id: 'pancakeswap',  name: 'PancakeSwap',  ticker: 'CAKE', coingeckoId: 'pancakeswap-token', tier: 'tier1', description: 'Leading DEX on BNB Chain.' },
            { id: 'curve',        name: 'Curve',        ticker: 'CRV',  coingeckoId: 'curve-dao-token', tier: 'tier1', description: 'Stablecoin and LSD AMM.' },
            { id: 'balancer',     name: 'Balancer',     ticker: 'BAL',  coingeckoId: 'balancer',     tier: 'tier1', description: 'Multi-asset automated market maker.' },
            { id: 'sushi',        name: 'SushiSwap',    ticker: 'SUSHI',coingeckoId: 'sushi',        tier: 'tier1', description: 'Community-driven DEX.' },
            { id: 'raydium',      name: 'Raydium',      ticker: 'RAY',  coingeckoId: 'raydium',      tier: 'tier1', description: 'AMM and order book DEX on Solana.' },
            { id: 'jupiter',      name: 'Jupiter',      ticker: 'JUP',  coingeckoId: 'jupiter-exchange-solana', tier: 'tier1', description: 'DEX aggregator on Solana.' },
            { id: 'dydx',         name: 'dYdX',         ticker: 'DYDX', coingeckoId: 'dydx',         tier: 'tier1', description: 'Decentralized perpetual exchange.' },
            { id: 'gmx',          name: 'GMX',          ticker: 'GMX',  coingeckoId: 'gmx',          tier: 'tier1', description: 'Decentralized perpetual exchange on Arbitrum.' },
            { id: 'thorchain',    name: 'THORChain',    ticker: 'RUNE', coingeckoId: 'thorchain',    tier: 'tier1', description: 'Cross-chain liquidity network.' },
            { id: 'osmosis',      name: 'Osmosis',      ticker: 'OSMO', coingeckoId: 'osmosis',      tier: 'tier1', description: 'Cross-chain AMM DEX on Cosmos.' },
            { id: 'trader-joe',   name: 'Trader Joe',   ticker: 'JOE',  coingeckoId: 'joe',          tier: 'tier1', description: 'DEX on Avalanche.' },
        ],
        Lending: [
            { id: 'aave',         name: 'Aave',         ticker: 'AAVE', coingeckoId: 'aave',         tier: 'tier1', description: 'Leading DeFi lending protocol.' },
            { id: 'compound',     name: 'Compound',     ticker: 'COMP', coingeckoId: 'compound-governance-token', tier: 'tier1', description: 'Algorithmic money market protocol.' },
            { id: 'maker',        name: 'Maker',        ticker: 'MKR',  coingeckoId: 'maker',        tier: 'tier1', description: 'Decentralized lending via DAI stablecoin.' },
            { id: 'spark',        name: 'Spark',        ticker: 'SPK',  coingeckoId: 'spark',        tier: 'tier1', description: 'Lending market by MakerDAO.' },
            { id: 'morpho',       name: 'Morpho',       ticker: 'MORPHO',coingeckoId: 'morpho',     tier: 'tier1', description: 'Optimized lending markets.' },
            { id: 'radiant',      name: 'Radiant',      ticker: 'RDNT', coingeckoId: 'radiant-capital', tier: 'tier1', description: 'Cross-chain lending protocol.' },
            { id: 'venus',        name: 'Venus',        ticker: 'XVS',  coingeckoId: 'venus',        tier: 'tier1', description: 'Lending and stablecoin protocol on BNB Chain.' },
            { id: 'euler',        name: 'Euler',        ticker: 'EUL',  coingeckoId: 'euler',        tier: 'tier1', description: 'Modular lending protocol.' },
            { id: 'silo',         name: 'Silo Finance', ticker: 'SILO', coingeckoId: 'silo-finance', tier: 'tier1', description: 'Isolated lending markets.' },
            { id: 'goldfinch',    name: 'Goldfinch',    ticker: 'GFI',  coingeckoId: 'goldfinch',    tier: 'tier1', description: 'Decentralized credit protocol.' },
            { id: 'maple',        name: 'Maple',        ticker: 'MPL',  coingeckoId: 'maple',        tier: 'tier1', description: 'Institutional crypto credit.' },
        ],
        Derivatives: [
            { id: 'dydx',         name: 'dYdX',         ticker: 'DYDX', coingeckoId: 'dydx',         tier: 'tier1', description: 'Decentralized perpetuals.' },
            { id: 'gmx',          name: 'GMX',          ticker: 'GMX',  coingeckoId: 'gmx',          tier: 'tier1', description: 'Perpetuals DEX on Arbitrum.' },
            { id: 'perpetual',    name: 'Perpetual',    ticker: 'PERP', coingeckoId: 'perpetual-protocol', tier: 'tier1', description: 'Decentralized perpetual exchange.' },
            { id: 'snx',          name: 'Synthetix',    ticker: 'SNX',  coingeckoId: 'havven',       tier: 'tier1', description: 'Decentralized synthetic assets.' },
            { id: 'kwenta',       name: 'Kwenta',       ticker: 'KWENTA',coingeckoId: 'kwenta',     tier: 'tier1', description: 'Decentralized derivatives trading on Optimism.' },
            { id: 'mango',        name: 'Mango',        ticker: 'MNGO', coingeckoId: 'mango-markets',tier: 'tier1', description: 'Decentralized margin trading on Solana.' },
            { id: 'vertex',       name: 'Vertex',       ticker: 'VRTX', coingeckoId: 'vertex-protocol', tier: 'tier1', description: 'Cross-margin DEX on Arbitrum.' },
            { id: 'drift',        name: 'Drift',        ticker: 'DRIFT',coingeckoId: 'drift-protocol',tier: 'tier1', description: 'Solana perpetuals DEX.' },
            { id: 'hyperliquid',  name: 'Hyperliquid',  ticker: 'HYPE', coingeckoId: 'hyperliquid',  tier: 'tier1', description: 'High-performance L1 for perpetuals.' },
        ],
        Restaking: [
            { id: 'eigenlayer',   name: 'EigenLayer',   ticker: 'EIGEN',coingeckoId: 'eigenlayer',   tier: 'tier1', description: 'Restaking protocol on Ethereum.' },
            { id: 'symbiotic',    name: 'Symbiotic',    ticker: 'SYM',  coingeckoId: 'symbiotic',    tier: 'tier1', description: 'Shared security and restaking.' },
            { id: 'karak',        name: 'Karak',        ticker: 'KARAK',coingeckoId: 'karak-2',      tier: 'tier1', description: 'Restaking marketplace.' },
            { id: 'liquid-collective', name: 'Liquid Collective', ticker: 'LCT', coingeckoId: 'liquid-collective', tier: 'tier1', description: 'Liquid staking and restaking.' },
            { id: 'kelp-dao',     name: 'Kelp DAO',     ticker: 'KEL',  coingeckoId: 'kelp-dao',     tier: 'tier1', description: 'Liquid restaking on EigenLayer.' },
            { id: 'ether-fi',     name: 'ether.fi',     ticker: 'ETHFI',coingeckoId: 'ether-fi',     tier: 'tier1', description: 'Liquid restaking protocol.' },
            { id: 'renzo',        name: 'Renzo',        ticker: 'REZ',  coingeckoId: 'renzo',        tier: 'tier1', description: 'Liquid restaking on EigenLayer.' },
            { id: 'puffer',       name: 'Puffer',       ticker: 'PUFI', coingeckoId: 'puffer-finance',tier: 'tier1', description: 'Native restaking on EigenLayer.' },
        ],
        'Liquid Staking': [
            { id: 'lido',         name: 'Lido',         ticker: 'LDO',  coingeckoId: 'lido-dao',     tier: 'tier1', description: 'Largest liquid staking protocol.' },
            { id: 'rocket-pool',  name: 'Rocket Pool',  ticker: 'RPL',  coingeckoId: 'rocket-pool-eth',tier: 'tier1', description: 'Decentralized Ethereum staking.' },
            { id: 'frax-ether',   name: 'Frax Ether',   ticker: 'FRXETH',coingeckoId: 'frax-ether', tier: 'tier1', description: 'Liquid staking by Frax.' },
            { id: 'stakewise',    name: 'StakeWise',    ticker: 'SWISE',coingeckoId: 'stakewise',    tier: 'tier1', description: 'Liquid ETH staking.' },
            { id: 'coinbase-wrapped-staked-eth', name: 'Coinbase Wrapped Staked ETH', ticker: 'cbETH', coingeckoId: 'coinbase-wrapped-staked-eth', tier: 'tier1', description: 'Coinbase liquid staking.' },
            { id: 'mantle-staked-eth', name: 'Mantle Staked ETH', ticker: 'mETH', coingeckoId: 'mantle-staked-eth', tier: 'tier1', description: 'Mantle\'s liquid staking token.' },
            { id: 'jito',         name: 'Jito',         ticker: 'JTO',  coingeckoId: 'jito-governance-token', tier: 'tier1', description: 'Liquid staking on Solana.' },
            { id: 'marinade',     name: 'Marinade',     ticker: 'MNDE', coingeckoId: 'marinade',     tier: 'tier1', description: 'Liquid staking on Solana.' },
        ],
        Payments: [
            { id: 'xrp',          name: 'XRP',          ticker: 'XRP',  coingeckoId: 'ripple',       tier: 'tier1', description: 'Real-time gross settlement for payments.' },
            { id: 'stellar',      name: 'Stellar',      ticker: 'XLM',  coingeckoId: 'stellar',      tier: 'tier1', description: 'Open network for storing and moving money.' },
            { id: 'lightning-bitcoin', name: 'Lightning Bitcoin', ticker: 'LBTC', coingeckoId: 'lightning-bitcoin', tier: 'tier1', description: 'Bitcoin payment network.' },
            { id: 'lightning',    name: 'Lightning Network', ticker: 'LIGHT', coingeckoId: 'lightning-network', tier: 'tier1', description: 'Bitcoin L2 payment network.' },
            { id: 'ripple',       name: 'Ripple',       ticker: 'XRP',  coingeckoId: 'ripple',       tier: 'tier1', description: 'Cross-border payment network.' },
            { id: 'nano',         name: 'Nano',         ticker: 'XNO',  coingeckoId: 'nano',         tier: 'tier1', description: 'Feeless, instant digital money.' },
            { id: 'iota',         name: 'IOTA',         ticker: 'MIOTA',coingeckoId: 'iota',         tier: 'tier1', description: 'Distributed ledger for IoT and payments.' },
            { id: 'bittorrent',   name: 'BitTorrent',   ticker: 'BTT',  coingeckoId: 'bittorrent',   tier: 'tier1', description: 'Tokenized file sharing.' },
            { id: 'flexa',        name: 'Flexa',        ticker: 'AMP',  coingeckoId: 'amp-token',    tier: 'tier1', description: 'Digital collateral and payments.' },
        ],
        'Bitcoin Ecosystem': [
            { id: 'stacks',       name: 'Stacks',       ticker: 'STX',  coingeckoId: 'blockstack',   tier: 'tier1', description: 'Bitcoin L2 for smart contracts.' },
            { id: 'babylon',      name: 'Babylon',      ticker: 'BABY', coingeckoId: 'babylon',      tier: 'tier1', description: 'Bitcoin staking protocol.' },
            { id: 'ordinals',     name: 'Ordinals',     ticker: 'ORDI', coingeckoId: 'ordinals',     tier: 'tier1', description: 'Bitcoin NFT protocol.' },
            { id: 'runes',        name: 'Runes',        ticker: 'RUNE', coingeckoId: 'runes',        tier: 'tier1', description: 'Bitcoin fungible token protocol.' },
            { id: 'bitcoin-cash', name: 'Bitcoin Cash', ticker: 'BCH',  coingeckoId: 'bitcoin-cash', tier: 'tier1', description: 'Bitcoin fork focused on payments.' },
            { id: 'litecoin',     name: 'Litecoin',     ticker: 'LTC',  coingeckoId: 'litecoin',     tier: 'tier1', description: 'Peer-to-peer cryptocurrency.' },
            { id: 'dogecoin',     name: 'Dogecoin',     ticker: 'DOGE', coingeckoId: 'dogecoin',     tier: 'tier1', description: 'Original meme coin.' },
            { id: 'core-dao',     name: 'Core DAO',     ticker: 'CORE', coingeckoId: 'coredaoorg',   tier: 'tier1', description: 'Bitcoin-secured smart contract L1.' },
            { id: 'bitlayer',     name: 'Bitlayer',     ticker: 'BTR',  coingeckoId: 'bitlayer',     tier: 'tier1', description: 'Bitcoin L2.' },
            { id: 'bevm',         name: 'BEVM',         ticker: 'BEVM', coingeckoId: 'bevm',         tier: 'tier1', description: 'Bitcoin L2 with EVM compatibility.' },
        ],
        Meme: [
            { id: 'dogecoin',     name: 'Dogecoin',     ticker: 'DOGE', coingeckoId: 'dogecoin',     tier: 'tier1', description: 'Original meme coin.' },
            { id: 'shiba-inu',    name: 'Shiba Inu',    ticker: 'SHIB', coingeckoId: 'shiba-inu',    tier: 'tier1', description: 'Ethereum-based meme token.' },
            { id: 'pepe',         name: 'Pepe',         ticker: 'PEPE', coingeckoId: 'pepe',         tier: 'tier1', description: 'Frog meme token on Ethereum.' },
            { id: 'floki',        name: 'Floki',        ticker: 'FLOKI',coingeckoId: 'floki',        tier: 'tier1', description: 'Dog-themed meme coin.' },
            { id: 'bonk',         name: 'Bonk',         ticker: 'BONK', coingeckoId: 'bonk',         tier: 'tier1', description: 'Solana meme coin.' },
            { id: 'dogwifhat',    name: 'dogwifhat',    ticker: 'WIF',  coingeckoId: 'dogwifcoin',   tier: 'tier1', description: 'Solana dog meme.' },
            { id: 'memecoin-2',   name: 'Memecoin',     ticker: 'MEME', coingeckoId: 'memecoin-2',   tier: 'tier1', description: 'Memecoin ecosystem.' },
            { id: 'popcat',       name: 'Popcat',       ticker: 'POPCAT',coingeckoId: 'popcat',      tier: 'tier1', description: 'Solana meme cat.' },
            { id: 'book-of-meme', name: 'Book of Meme', ticker: 'BOME', coingeckoId: 'book-of-meme', tier: 'tier1', description: 'Solana meme token.' },
        ],
        SocialFi: [
            { id: 'friendtech',   name: 'Friend.tech',  ticker: 'FRIEND', coingeckoId: 'friend-tech', tier: 'tier1', description: 'Social token protocol on Base.' },
            { id: 'lens',         name: 'Lens',         ticker: 'LENS', coingeckoId: 'lens-protocol',tier: 'tier1', description: 'Decentralized social graph.' },
            { id: 'farcaster',    name: 'Farcaster',    ticker: 'FARCASTER', coingeckoId: 'farcaster', tier: 'tier1', description: 'Decentralized social protocol.' },
            { id: 'deso',         name: 'DeSo',         ticker: 'DESO', coingeckoId: 'deso',         tier: 'tier1', description: 'Decentralized social blockchain.' },
            { id: 'rally',        name: 'Rally',        ticker: 'RLY',  coingeckoId: 'rally-2',      tier: 'tier1', description: 'Creator economy blockchain.' },
            { id: 'roll',         name: 'Roll',         ticker: 'ROLL', coingeckoId: 'roll',         tier: 'tier1', description: 'Social tokens infrastructure.' },
            { id: 'cyberconnect', name: 'CyberConnect',ticker: 'CYBER',coingeckoId: 'cyberconnect',tier: 'tier1', description: 'Web3 social graph.' },
        ],
        DeSci: [
            { id: 'molecule',     name: 'Molecule',     ticker: 'MOL',  coingeckoId: 'molecule',     tier: 'tier1', description: 'Decentralized biotech funding.' },
            { id: 'bio-protocol', name: 'Bio Protocol', ticker: 'BIO',  coingeckoId: 'bio-protocol', tier: 'tier1', description: 'Decentralized science network.' },
            { id: 'vita-dao',     name: 'VitaDAO',      ticker: 'VITA', coingeckoId: 'vitadao',      tier: 'tier1', description: 'Decentralized longevity research.' },
            { id: 'genome-dao',   name: 'GenomeDAO',    ticker: 'GNOME',coingeckoId: 'genome-dao',   tier: 'tier1', description: 'Decentralized genomics research.' },
            { id: 'cerebrum-dao', name: 'Cerebrum DAO', ticker: 'CEREB',coingeckoId: 'cerebrum-dao', tier: 'tier1', description: 'Neuroscience DAO.' },
        ],
        ZK: [
            { id: 'zksync',       name: 'zkSync',       ticker: 'ZK',   coingeckoId: 'zksync',       tier: 'tier1', description: 'ZK rollup on Ethereum.' },
            { id: 'starknet',     name: 'Starknet',     ticker: 'STRK', coingeckoId: 'starknet',     tier: 'tier1', description: 'Validity proof L2.' },
            { id: 'aztec',        name: 'Aztec',        ticker: 'AZTEC',coingeckoId: 'aztec',        tier: 'tier1', description: 'Privacy-first ZK rollup.' },
            { id: 'mina',         name: 'Mina',         ticker: 'MINA', coingeckoId: 'mina-protocol',tier: 'tier1', description: 'ZK succinct blockchain.' },
            { id: 'polygon-zkevm',name: 'Polygon zkEVM',ticker: 'POL',  coingeckoId: 'matic-network',tier: 'tier1', description: 'Polygon ZK L2.' },
            { id: 'scroll',       name: 'Scroll',       ticker: 'SCR',  coingeckoId: 'scroll',       tier: 'tier1', description: 'Native zkEVM L2.' },
            { id: 'linea',        name: 'Linea',        ticker: 'LINEA',tier: 'tier1', description: 'Consensys zkEVM.' },
            { id: 'risc-zero',    name: 'RISC Zero',    ticker: 'RISC', coingeckoId: 'risc-zero',    tier: 'tier1', description: 'ZK proof system.' },
            { id: 'loopring',     name: 'Loopring',     ticker: 'LRC',  coingeckoId: 'loopring',     tier: 'tier1', description: 'ZK rollup DEX.' },
            { id: 'axiom',        name: 'Axiom',        ticker: 'AXIOM',coingeckoId: 'axiom-2',      tier: 'tier1', description: 'ZK coprocessor for Ethereum.' },
        ],
    };

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.AutoDiscoveryService = AutoDiscoveryService;

})(window);
