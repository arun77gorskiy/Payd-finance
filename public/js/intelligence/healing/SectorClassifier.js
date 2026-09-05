/* =================================================================
   PAYD Finance — SectorClassifier (V2.3)
   AI-классификатор проектов по секторам на основе многофакторного
   анализа: описание, теги, функциональность, технологии, экосистема.

   Использует rule-based подход с весовыми коэффициентами и оценкой
   confidence (0..1). При низкой уверенности помечает проект как
   "Needs Review" — для последующей модерации человеком.

   Возвращает:
     {
       sector:    "DeFi" | "AI" | ...,
       confidence: 0.85,           // 0..1
       needsReview: false,         // true если confidence < 0.5
       scores:    { DeFi: 0.85, AI: 0.20, ... },
       reasons:   ["description contains 'lending'", "category matches DeFi", ...]
     }
   ================================================================= */

(function (global) {
    'use strict';

    /**
     * Правила классификации. Каждое правило определяет:
     *   - sector: название сектора
     *   - keywords: слова/фразы, указывающие на сектор
     *   - tags: теги из CoinGecko/DefiLlama
     *   - patterns: regex-паттерны для более гибкого матчинга
     *   - weight: важность правила (0..1)
     *   - negativeKeywords: слова, ИСКЛЮЧАЮЩИЕ принадлежность к этому сектору
     *
     * При матчинге используется TF-IDF-подобный подход:
     *   score += sum(weight) * (1 + 0.2 * (1 - word_score_normalized))
     */
    const CLASSIFICATION_RULES = {
        Layer1: {
            keywords: [
                'layer 1', 'layer1', 'mainnet', 'blockchain platform', 'consensus',
                'smart contract platform', 'base layer', 'l1 chain', 'proof of stake',
                'proof of work', 'pos chain', 'pow chain', 'blockchain network',
                'validator', 'genesis block', 'native token', 'blockchain protocol',
            ],
            tags: ['layer-1', 'l1', 'pos', 'pow', 'mainnet', 'blockchain-platform'],
            patterns: [
                /blockchain\s+(platform|network|protocol)/i,
                /(ethereum|bitcoin|solana|cardano|polkadot|near|cosmos|aptos|sui|avalanche|fantom|tron|tezos|kaspa|sei|injective|celestia|monero|zcash|bitcoin cash|litecoin)\s*[-a-z]*\s*(chain|protocol|network)/i,
                /(consensus|validator|node)\s*(mechanism|network)/i,
            ],
            negativeKeywords: ['rollup', 'l2', 'sidechain', 'bridges only', 'amm', 'dex', 'lending'],
            weight: 1.0,
        },
        Layer2: {
            keywords: [
                'layer 2', 'layer2', 'rollup', 'scaling solution', 'optimistic rollup',
                'zk rollup', 'zkrollup', 'arbitrum', 'optimism', 'polygon zkevm',
                'starknet', 'zksync', 'l2 network', 'sidechain', 'l2 scaling',
                'validity proof', 'fraud proof', 'sequencer', 'l2 ecosystem',
            ],
            tags: ['layer-2', 'l2', 'rollup', 'scaling', 'optimistic-rollup', 'zk-rollup'],
            patterns: [
                /l2\s+(scaling|solution|network|chain)/i,
                /(optimistic|zk|zksync|starknet|validity)\s+rollup/i,
                /(scaling|layer\s*2|rollup)\s+(solution|protocol|chain|network)/i,
            ],
            negativeKeywords: ['base layer', 'mainnet consensus', 'validator set'],
            weight: 1.0,
        },
        DeFi: {
            keywords: [
                'defi', 'decentralized finance', 'decentralised finance',
                'finance protocol', 'lending', 'borrowing', 'swap', 'amm',
                'automated market maker', 'liquidity pool', 'yield', 'staking',
                'farming', 'vault', 'borrow', 'collateral', 'derivative',
                'money market', 'flash loan', 'liquidity provider',
            ],
            tags: ['decentralized-finance-defi', 'defi', 'amm', 'dex', 'lending', 'borrowing', 'yield-farming'],
            patterns: [
                /(decentralized|decentralised)\s+finance/i,
                /(lending|borrowing|swap|exchange|derivatives?)\s+protocol/i,
                /(money\s+market|liquidity\s+pool|yield\s+farm)/i,
                /\b(lend|borrow|swap|trade|provide\s+liquidity|earn\s+yield)\b/i,
            ],
            negativeKeywords: ['centralized', 'cex only', 'kyc required'],
            weight: 1.0,
        },
        RWA: {
            keywords: [
                'rwa', 'real world asset', 'real-world asset', 'tokenization',
                'asset tokenization', 'securities', 'treasury', 'bond',
                'real estate', 'commodity', 'invoices', 'private credit',
                'institutional finance', 'tradfi', 'tokenized funds',
                'gold token', 'treasury bonds', 'asset-backed',
            ],
            tags: ['real-world-assets-rwa', 'rwa', 'tokenization', 'securities'],
            patterns: [
                /real[\s-]world\s+assets?/i,
                /(tokeniz|asset[\s-]backed|backed\s+by)\s+\w+/i,
                /(bonds?|treasur(y|ies)|invoice|real\s+estate|commodit(y|ies))\s+(token|protocol|platform)/i,
            ],
            negativeKeywords: ['pure crypto', 'no fiat'],
            weight: 1.0,
        },
        AI: {
            keywords: [
                'artificial intelligence', 'machine learning', 'deep learning',
                'neural network', 'ai agent', 'gpt', 'llm', 'large language model',
                'nlp', 'computer vision', 'inference', 'training model',
                'ai protocol', 'ai compute', 'ai model', 'transformer',
                'openai', 'claude', 'chatbot', 'generative ai', 'ai marketplace',
            ],
            tags: ['artificial-intelligence', 'ai', 'machine-learning', 'llm', 'ai-agents'],
            patterns: [
                /(ai|artificial\s+intelligence|machine\s+learning|deep\s+learning)\s+(protocol|model|agent|compute|inference|training)/i,
                /\b(llm|gpt|neural\s+network|nlp|transformer)\b/i,
            ],
            negativeKeywords: ['hardware only', 'no ai', 'ai washing'],
            weight: 1.0,
        },
        Gaming: {
            keywords: [
                'gaming', 'game', 'play-to-earn', 'p2e', 'metaverse', 'virtual world',
                'nft game', 'gamefi', 'web3 game', 'blockchain game', 'mmorpg',
                'in-game asset', 'gaming guild', 'gaming platform', 'mobile game',
            ],
            tags: ['gaming', 'metaverse', 'play-to-earn', 'gamefi', 'nft-games'],
            patterns: [
                /(play[\s-]to[\s-]earn|p2e|gamefi|web3\s+game|blockchain\s+game)/i,
                /(in[\s-]game|nft\s+game)\s+(asset|item|token|character)/i,
                /(gaming|metaverse)\s+(platform|protocol|world|guild)/i,
            ],
            negativeKeywords: ['no gaming', 'enterprise only'],
            weight: 0.9,
        },
        DePIN: {
            keywords: [
                'depin', 'decentralized physical infrastructure', 'physical infrastructure',
                'wireless', '5g', 'telecom', 'storage network', 'compute network',
                'gpu', 'rendering', 'iot', 'sensor', 'helium', 'akash',
                'filecoin', 'decentralized storage', 'distributed compute',
                'mesh network', 'wireless network', 'hotspot',
            ],
            tags: ['depin', 'decentralized-physical-infrastructure-networks', 'iot', 'wireless', 'storage'],
            patterns: [
                /(decentralized|decentralised)\s+(physical|infrastructure|storage|compute|wireless|rendering)/i,
                /(wireless\s+network|hotspot|gpu\s+compute|iot\s+device|file\s+storage)/i,
                /\b(helium|akash|filecoin|render\s+network|theta|chia)\b/i,
            ],
            negativeKeywords: ['pure software'],
            weight: 1.0,
        },
        Infrastructure: {
            keywords: [
                'middleware', 'cross-chain', 'interoperability', 'bridge', 'indexer',
                'graphql', 'subgraph', 'data infrastructure', 'api service',
                'developer tools', 'sdk', 'developer platform', 'infrastructure',
                'blockchain infrastructure', 'web3 infrastructure',
            ],
            tags: ['infrastructure', 'middleware', 'interoperability', 'indexer', 'cross-chain'],
            patterns: [
                /(cross[\s-]chain|interoperability|middleware|infrastructure|indexer)\s+(protocol|service|platform|network)/i,
                /\b(bridge|subgraph|indexer|sdk|api\s+service)\b/i,
            ],
            negativeKeywords: ['consumer-facing', 'no infrastructure'],
            weight: 0.9,
        },
        Oracles: {
            keywords: [
                'oracle', 'price feed', 'data feed', 'chainlink', 'off-chain data',
                'price oracle', 'data oracle', 'reliable data', 'cross-chain oracle',
            ],
            tags: ['oracles', 'oracle', 'data-feed', 'price-feed'],
            patterns: [
                /(price|data|off[\s-]chain)\s+(oracle|feed)/i,
                /\b(chainlink|band\s+protocol|api3|uma|pyth|tellor|redstone)\b/i,
            ],
            negativeKeywords: ['no oracle', 'no external data'],
            weight: 1.0,
        },
        Privacy: {
            keywords: [
                'privacy', 'anonymous', 'private transaction', 'zero knowledge privacy',
                'confidential', 'shielded', 'mixer', 'mixnet', 'private compute',
                'privacy preserving', 'privacy preserving', 'anonymity',
            ],
            tags: ['privacy-coins', 'privacy', 'zk', 'confidential'],
            patterns: [
                /(privacy|private|confidential|anonymous|shielded|stealth)\s+(coin|token|transaction|computing|protocol)/i,
                /\b(monero|zcash|secret|aztec|railgun|oasis|horizen|manta|iron\s*fish|penumbra|nym)\b/i,
            ],
            negativeKeywords: ['public', 'transparent by design'],
            weight: 1.0,
        },
        Stablecoins: {
            keywords: [
                'stablecoin', 'stable coin', 'usd', 'pegged', 'fiat backed',
                'algorithmic stable', 'over-collateralized', 'crypto collateralized',
                'fiat-collateralized', 'price stable', '1:1 backed',
            ],
            tags: ['stablecoins', 'stablecoin', 'usd-stable', 'algorithmic-stablecoin'],
            patterns: [
                /(stablecoin|stable\s+coin|stable[\s-]backed)/i,
                /(fiat|usd|usdc|usdt|dai|frax)\s*(-|\s+)?\s*(pegged|backed|collateralized)/i,
                /\b(usdt|usdc|dai|frax|tusd|pyusd|fdusd|lusd|mim|usdd)\b/i,
            ],
            negativeKeywords: ['volatile', 'not stable'],
            weight: 1.0,
        },
        DEX: {
            keywords: [
                'decentralized exchange', 'dex', 'amm', 'automated market maker',
                'orderbook', 'on-chain exchange', 'spot exchange', 'perp dex',
                'decentralized swap', 'p2p exchange', 'non-custodial exchange',
            ],
            tags: ['decentralized-exchange', 'dex', 'amm', 'spot', 'orderbook'],
            patterns: [
                /(decentralized|decentralised)\s+(exchange|swap|amm)/i,
                /\b(amm|orderbook|matching\s+engine|perp\s+dex)\b/i,
                /\b(uniswap|pancake|curve|balancer|sushi|raydium|jupiter|dydx|gmx|osmosis|joe)\b/i,
            ],
            negativeKeywords: ['centralized exchange', 'cex', 'order book only'],
            weight: 0.95,
        },
        Lending: {
            keywords: [
                'lending', 'borrowing', 'lend', 'borrow', 'money market',
                'collateralized debt', 'liquidation', 'over-collateralized',
                'lending pool', 'interest rate', 'supply and borrow',
            ],
            tags: ['lending-borrowing', 'lending', 'borrowing', 'money-market'],
            patterns: [
                /(lend(ing)?|borrow(ing)?|money\s+market)\s+(protocol|platform|pool|service)/i,
                /\b(aave|compound|venus|maker|spark|morpho|radiant|euler|silo)\b/i,
            ],
            negativeKeywords: ['no lending', 'cex only'],
            weight: 1.0,
        },
        Derivatives: {
            keywords: [
                'derivative', 'perpetual', 'future', 'options', 'synthetic asset',
                'synthetix', 'perp', 'leverage trading', 'margin trading',
                'perpetual swap', 'perpetual contract', 'options protocol',
            ],
            tags: ['derivatives', 'perpetuals', 'futures', 'options', 'synthetics'],
            patterns: [
                /(perpetual|perp|futures?|options?|derivative|leverage|margin)\s+(contract|swap|trading|protocol)/i,
                /\b(snx|perpetual\s+protocol|gmx|kwenta|mango|vertex|drift|hyperliquid)\b/i,
            ],
            negativeKeywords: ['spot only', 'no leverage'],
            weight: 1.0,
        },
        Restaking: {
            keywords: [
                'restaking', 're-staking', 'liquid restaking', 'shared security',
                'eigenlayer', 'symbiotic', 'karak', 'restake', 'restaked',
                'restaking protocol', 'avs', 'actively validated service',
            ],
            tags: ['liquid-restaking', 'restaking', 'shared-security', 'avs'],
            patterns: [
                /(re[\s-]?staking|shared\s+security|actively\s+validated\s+service)/i,
                /\b(eigenlayer|symbiotic|karak|kelp|etherfi|renzo|puffer)\b/i,
            ],
            negativeKeywords: ['no restaking', 'centralized'],
            weight: 1.0,
        },
        'Liquid Staking': {
            keywords: [
                'liquid staking', 'lst', 'staked eth', 'steth', 'lido',
                'rocket pool', 'liquid staking derivative', 'stake eth',
                'stake pool', 'validator pool',
            ],
            tags: ['liquid-staking', 'lst', 'liquid-staking-derivatives'],
            patterns: [
                /liquid\s+staking/i,
                /\b(lido|rocket\s+pool|stakewise|coinbase\s+wrapped|jito|marinade|frax\s+ether)\b/i,
            ],
            negativeKeywords: ['centralized staking', 'no liquid'],
            weight: 1.0,
        },
        Payments: {
            keywords: [
                'payment', 'remittance', 'cross-border', 'merchant', 'point of sale',
                'mobile money', 'transfer', 'transaction', 'settle', 'settlement',
                'payment network', 'payment rails', 'transaction processing',
            ],
            tags: ['payments', 'payment', 'remittance', 'settlement'],
            patterns: [
                /(payment|remittance|cross[\s-]border)\s+(network|protocol|platform|service|rails)/i,
                /\b(xrp|stellar|lightning|nano|iota|flexa|amp)\b/i,
            ],
            negativeKeywords: ['no payment', 'store of value only'],
            weight: 1.0,
        },
        'Bitcoin Ecosystem': {
            keywords: [
                'bitcoin', 'btc', 'satoshi', 'ordinals', 'runes', 'brc-20',
                'bitcoin l2', 'lightning network', 'stacks', 'bitcoin defi',
                'bitcoin staking', 'babylon', 'bitcoin sidechain', 'rgb',
            ],
            tags: ['bitcoin', 'bitcoin-ecosystem', 'ordinals', 'runes', 'lightning'],
            patterns: [
                /bitcoin[\s-]*(l2|defi|staking|sidechain|ecosystem)/i,
                /\b(stacks|babylon|ordinals|runes|bitcoin\s+cash|litecoin|core\s+dao|bitlayer|bevm)\b/i,
            ],
            negativeKeywords: ['no bitcoin', 'altcoin only'],
            weight: 0.9,
        },
        Meme: {
            keywords: [
                'meme', 'memecoin', 'meme coin', 'meme token', 'community coin',
                'joke coin', 'dog', 'cat', 'frog', 'pepe', 'inu',
            ],
            tags: ['meme-token', 'meme', 'memecoin'],
            patterns: [
                /\b(meme\s*(coin|token)|memecoin)\b/i,
                /\b(dogecoin|shiba|pepe|floki|bonk|wif|popcat|bome|meme)\b/i,
            ],
            negativeKeywords: ['serious project', 'enterprise', 'b2b'],
            weight: 0.85,
        },
        SocialFi: {
            keywords: [
                'social', 'socialfi', 'social network', 'creator economy',
                'content creator', 'social graph', 'decentralized social',
                'farcaster', 'lens', 'friend.tech', 'creator token', 'tip',
            ],
            tags: ['social-money', 'socialfi', 'social-network', 'creator-economy'],
            patterns: [
                /(socialfi|decentralized\s+social|social\s+graph|creator\s+economy)/i,
                /\b(friend\.?tech|farcaster|lens|deso|rally|roll|cyberconnect)\b/i,
            ],
            negativeKeywords: ['no social', 'no creator'],
            weight: 0.9,
        },
        DeSci: {
            keywords: [
                'desci', 'decentralized science', 'science dao', 'research dao',
                'biotech', 'pharmaceutical', 'genomics', 'longevity',
                'scientific research', 'ip-nft', 'research token', 'bio dao',
            ],
            tags: ['decentralized-science', 'desci', 'biotech', 'research'],
            patterns: [
                /(desci|decentrali[sz]ed\s+science|research\s+dao|ip[\s-]nft)/i,
                /\b(molecule|bio[\s-]?protocol|vitadao|genome|labdao)\b/i,
            ],
            negativeKeywords: ['no research', 'pure crypto'],
            weight: 1.0,
        },
        ZK: {
            keywords: [
                'zero knowledge', 'zero-knowledge', 'zk proof', 'zk-snark',
                'zk-stark', 'zkevm', 'zk rollup', 'zkp', 'succinct proof',
                'validity proof', 'plonk', 'groth16', 'zk circuit',
            ],
            tags: ['zero-knowledge-zk', 'zk', 'zk-proof', 'zkevm'],
            patterns: [
                /(zero[\s-]?knowledge|zk[\s-]?(proof|snark|stark|rollup|evm|circuit|validity))/i,
                /\b(zksync|starknet|aztec|mina|polygon\s+zkevm|scroll|linea|risc\s*zero|loopring|axiom)\b/i,
            ],
            negativeKeywords: ['transparent'],
            weight: 1.0,
        },
    };

    class SectorClassifier {
        constructor() {
            this.rules = CLASSIFICATION_RULES;
            this.REVIEW_THRESHOLD = 0.45; // ниже — помечаем "Needs Review"
        }

        /**
         * Классифицирует один проект.
         * @param {Object} candidate - DTO проекта (из AutoDiscoveryService)
         * @returns {Object} { sector, confidence, needsReview, scores, reasons }
         */
        classify(candidate) {
            if (!candidate) {
                return {
                    sector: 'Uncategorized',
                    confidence: 0,
                    needsReview: true,
                    scores: {},
                    reasons: ['empty candidate'],
                };
            }

            const text = this._buildText(candidate);
            const sectorScores = {};

            for (const [sector, rule] of Object.entries(this.rules)) {
                const score = this._scoreSector(text, sector, rule, candidate);
                sectorScores[sector] = score;
            }

            // Выбираем сектор с максимальным score
            let bestSector = 'Uncategorized';
            let bestScore = 0;
            const reasons = [];
            for (const [sector, score] of Object.entries(sectorScores)) {
                if (score > bestScore) {
                    bestScore = score;
                    bestSector = sector;
                }
            }

            // Нормализуем score (0..1)
            const maxPossible = 1.0; // уже нормализовано внутри _scoreSector
            const confidence = Math.min(1.0, bestScore / maxPossible);

            // Формируем reasons
            const topRule = this.rules[bestSector];
            if (topRule) {
                const matched = this._findMatches(text, topRule, candidate);
                reasons.push(...matched.slice(0, 3));
            }

            const needsReview = confidence < this.REVIEW_THRESHOLD;
            if (needsReview) {
                reasons.push(`low confidence (${(confidence * 100).toFixed(0)}%) — needs manual review`);
            }

            return {
                sector: bestSector,
                confidence: Math.round(confidence * 100) / 100,
                needsReview,
                scores: sectorScores,
                reasons,
            };
        }

        /**
         * Классифицирует массив проектов.
         */
        classifyMany(candidates) {
            return candidates.map(c => ({
                candidate: c,
                classification: this.classify(c),
            }));
        }

        _buildText(candidate) {
            const parts = [];
            if (candidate.name)         parts.push(String(candidate.name));
            if (candidate.ticker)       parts.push(String(candidate.ticker));
            if (candidate.description)  parts.push(String(candidate.description));
            if (candidate.sector_hint)  parts.push(String(candidate.sector_hint));
            if (Array.isArray(candidate.categories)) {
                parts.push(candidate.categories.join(' '));
            }
            if (candidate.website)      parts.push(String(candidate.website));
            return parts.join(' ').toLowerCase();
        }

        _scoreSector(text, sector, rule, candidate) {
            let score = 0;

            // 1) Keywords (weight 1.0)
            for (const kw of (rule.keywords || [])) {
                if (text.includes(kw.toLowerCase())) {
                    score += rule.weight * 0.4;
                }
            }

            // 2) Tags (weight 1.0, сильнее)
            if (Array.isArray(candidate.categories)) {
                for (const tag of candidate.categories) {
                    if ((rule.tags || []).includes(String(tag).toLowerCase())) {
                        score += rule.weight * 0.5;
                    }
                }
            }
            if (candidate.sector_hint && (rule.tags || []).includes(String(candidate.sector_hint).toLowerCase())) {
                score += rule.weight * 0.5;
            }

            // 3) Patterns (weight 1.5, сильнее всего)
            for (const pat of (rule.patterns || [])) {
                if (pat.test(text)) {
                    score += rule.weight * 0.6;
                }
            }

            // 4) Negative keywords (штраф)
            for (const nkw of (rule.negativeKeywords || [])) {
                if (text.includes(nkw.toLowerCase())) {
                    score -= rule.weight * 0.3;
                }
            }

            // 5) Source boost: если источник "reference" и проект уже в списке — высокая уверенность
            if (candidate.source === 'reference') {
                score += 0.5;
            }

            // 6) Tier boost (tier1 → +0.1, tier2 → +0.05)
            if (candidate.tier === 'tier1') score += 0.1;
            else if (candidate.tier === 'tier2') score += 0.05;

            return Math.max(0, score);
        }

        _findMatches(text, rule, candidate) {
            const matches = [];
            for (const kw of (rule.keywords || [])) {
                if (text.includes(kw.toLowerCase())) {
                    matches.push(`description contains "${kw}"`);
                }
            }
            for (const pat of (rule.patterns || [])) {
                if (pat.test(text)) {
                    matches.push(`pattern matched: ${pat.source}`);
                }
            }
            if (Array.isArray(candidate.categories)) {
                for (const tag of candidate.categories) {
                    if ((rule.tags || []).includes(String(tag).toLowerCase())) {
                        matches.push(`category tag matches: ${tag}`);
                    }
                }
            }
            if (candidate.source === 'reference') {
                matches.push('source: official reference list');
            }
            return matches;
        }

        /**
         * Возвращает список поддерживаемых секторов.
         */
        getSupportedSectors() {
            return Object.keys(this.rules);
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.SectorClassifier = SectorClassifier;

})(window);
