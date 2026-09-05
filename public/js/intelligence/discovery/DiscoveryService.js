/* =================================================================
   PAYD Finance — DiscoveryService (V2 — модуль, не Application Layer)
   Забирает кандидатов из внешних источников (CoinGecko mock).
   Возвращает DTO, не имеет side-effects на БД.
   ================================================================= */

(function (global) {
    'use strict';

    const COINGECKO_API = 'https://api.coingecko.com/api/v3';

    class DiscoveryService {
        constructor(config = {}) {
            this.apiBase = config.apiBase || COINGECKO_API;
            this.timeout = config.timeout || 10000;
            this.rateLimitMs = config.rateLimitMs || 2000; // 2s between requests
            this._lastFetch = 0;
        }

        /**
         * Получить кандидатов с CoinGecko.
         * Возвращает массив normalized DTO.
         */
        async fetchCandidates({ perPage = 250, pages = 1, vsCurrency = 'usd' } = {}) {
            const all = [];
            for (let page = 1; page <= pages; page++) {
                await this._rateLimit();
                const batch = await this._fetchPage(page, perPage, vsCurrency);
                all.push(...batch);
            }
            return this.deduplicate(all);
        }

        async _fetchPage(page, perPage, vsCurrency) {
            const url = `${this.apiBase}/coins/markets?vs_currency=${vsCurrency}&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=false&price_change_percentage=24h`;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), this.timeout);
            try {
                const res = await fetch(url, { signal: controller.signal });
                clearTimeout(timeout);
                if (!res.ok) {
                    if (res.status === 429) {
                        throw new Error('[DiscoveryService] Rate limited by CoinGecko (429)');
                    }
                    throw new Error(`CoinGecko HTTP ${res.status}`);
                }
                const raw = await res.json();
                return raw.map(r => this._normalize(r));
            } catch (e) {
                clearTimeout(timeout);
                console.warn(`[DiscoveryService] Failed to fetch page ${page}:`, e.message);
                return [];
            }
        }

        _normalize(raw) {
            return {
                external_id: raw.id,
                ticker: (raw.symbol || '').toUpperCase(),
                name: raw.name,
                sector_hint: (raw.categories && raw.categories[0]) || null,
                market_cap: raw.market_cap || 0,
                total_volume: raw.total_volume || 0,
                fdv: raw.fully_diluted_valuation || 0,
                circulating_supply: raw.circulating_supply || 0,
                price_change_24h_pct: raw.price_change_percentage_24h || 0,
                image: raw.image || null,
                last_updated: raw.last_updated ? new Date(raw.last_updated).getTime() : Date.now(),
                first_listed_at: raw.atl_date ? new Date(raw.atl_date).getTime() : null,
                raw: raw,
            };
        }

        deduplicate(candidates) {
            const seen = new Set();
            const out = [];
            for (const c of candidates) {
                if (!c.external_id || seen.has(c.external_id)) continue;
                seen.add(c.external_id);
                out.push(c);
            }
            return out;
        }

        classifyBySector(candidate) {
            const hint = (candidate.sector_hint || '').toLowerCase();
            const name = (candidate.name || '').toLowerCase();
            const text = `${hint} ${name}`;

            const rules = [
                { sector: 'DePIN', patterns: ['depin', 'storage', 'compute', 'wireless', 'gpu', 'rendering', 'cloud', 'iot', 'sensor', 'helium', 'akash', 'render', 'filecoin'] },
                { sector: 'AI', patterns: ['ai', 'artificial', 'machine learning', 'ml', 'neural', 'gpt', 'llm', 'bittensor', 'fetch.ai', 'ocean protocol'] },
                { sector: 'Layer1', patterns: ['layer 1', 'pos', 'pow', 'mainnet', 'blockchain platform', 'ethereum', 'solana', 'polkadot', 'cosmos', 'near', 'aptos', 'sui'] },
                { sector: 'DeFi', patterns: ['defi', 'dex', 'lending', 'swap', 'liquidity', 'yield', 'aave', 'uniswap', 'curve', 'makerdao', 'compound'] },
                { sector: 'RWA', patterns: ['rwa', 'real world', 'tokenization', 'asset', 'securities', 'ondo', 'centrifuge', 'maple'] },
                { sector: 'Gaming', patterns: ['gaming', 'metaverse', 'game', 'play-to-earn', 'p2e', 'axie', 'gala', 'sandbox', 'decentraland'] },
                { sector: 'ZK', patterns: ['zk', 'zero-knowledge', 'proof', 'privacy', 'zk-snark', 'zk-stark', 'zksync', 'starknet', 'aztec', 'mina'] },
            ];

            for (const rule of rules) {
                if (rule.patterns.some(p => text.includes(p))) {
                    return rule.sector;
                }
            }
            return 'Uncategorized';
        }

        async _rateLimit() {
            const elapsed = Date.now() - this._lastFetch;
            if (elapsed < this.rateLimitMs) {
                await new Promise(r => setTimeout(r, this.rateLimitMs - elapsed));
            }
            this._lastFetch = Date.now();
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.DiscoveryServiceCore = DiscoveryService;

})(window);
