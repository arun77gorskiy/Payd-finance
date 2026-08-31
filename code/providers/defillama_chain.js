/* =================================================================
   PAYD Intelligence V2 — DefiLlama CHAIN Provider
   ----------------------------------------------------------------
   Работает с /v2/chains (list) и /v2/historicalChainTvl/{name} (history).
   Возвращает null для каждой метрики, которая не подтверждена
   реальным ненулевым значением от провайдера.

   Метрики chain:
   - TVL (current)
   - TVL change 1d, 7d, 30d
   - protocol count
   - gecko_id
   - chainId
   - cmcId
   - tokenSymbol
   ================================================================= */

const { rateLimitedFetch, MISSING_REASONS, makeMetric, emptyMetric, isRealNumber } = require('./_common.js');

let chainListCache = null;
let chainListCacheTime = 0;
const CHAIN_CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getChainList() {
    const now = Date.now();
    if (chainListCache && (now - chainListCacheTime) < CHAIN_CACHE_TTL) {
        return chainListCache;
    }
    const res = await rateLimitedFetch('defillama', 'https://api.llama.fi/v2/chains');
    if (!res.ok) {
        return null;
    }
    chainListCache = res.data;
    chainListCacheTime = now;
    return chainListCache;
}

/**
 * Поиск chain по разным идентификаторам.
 * @param {Object} identifiers - { defillama_chain, coingecko }
 * @returns {Object|null} chain entry from DefiLlama
 */
async function findChain(identifiers) {
    if (!identifiers) return null;
    const list = await getChainList();
    if (!Array.isArray(list)) return null;

    // 1. По точному имени (defillama_chain)
    if (identifiers.defillama_chain) {
        const name = identifiers.defillama_chain;
        let found = list.find(c => c.name === name);
        if (found) return found;
        // Case-insensitive fallback
        const nameLower = name.toLowerCase();
        found = list.find(c => (c.name || '').toLowerCase() === nameLower);
        if (found) return found;
    }

    // 2. По gecko_id
    if (identifiers.coingecko) {
        const cg = identifiers.coingecko.toLowerCase();
        const found = list.find(c => (c.gecko_id || '').toLowerCase() === cg);
        if (found) return found;
    }

    return null;
}

/**
 * Получить все доступные chain-метрики для проекта.
 * Никогда не возвращает 0 — только null или реальное число.
 */
async function fetchChainMetrics(identifiers) {
    const out = {
        chain: null,
        metrics: {},
        reasons: {},
    };

    const chain = await findChain(identifiers);
    if (!chain) {
        out.reasons.tvl = MISSING_REASONS.MISSING_IDENTIFIER;
        out.reasons.chain_id = MISSING_REASONS.MISSING_IDENTIFIER;
        return out;
    }

    out.chain = {
        name: chain.name,
        gecko_id: chain.gecko_id || null,
        chainId: chain.chainId || null,
        cmcId: chain.cmcId || null,
        tokenSymbol: chain.tokenSymbol || null,
    };

    // TVL: только если это реальное число > 0
    if (isRealNumber(chain.tvl)) {
        out.metrics.tvl = makeMetric({
            value: chain.tvl,
            source: 'defillama:chain',
            httpStatus: 200,
            confidence: 1.0,
        });
    } else {
        out.metrics.tvl = makeMetric({
            value: null,
            source: 'defillama:chain',
            reason: MISSING_REASONS.PROVIDER_NO_DATA,
        });
    }

    return out;
}

/**
 * Получить историю TVL chain.
 * @returns {Array|null} [{ date, tvl }, ...] или null
 */
async function fetchChainTvlHistory(chainName) {
    if (!chainName) return null;
    const url = `https://api.llama.fi/v2/historicalChainTvl/${encodeURIComponent(chainName)}`;
    const res = await rateLimitedFetch('defillama', url);
    if (!res.ok) return null;
    if (!Array.isArray(res.data)) return null;
    return res.data;
}

/**
 * Получить raw chain данные для диагностики.
 */
async function fetchChainRaw(identifiers) {
    const chain = await findChain(identifiers);
    if (!chain) return { found: false, data: null };
    return { found: true, data: chain };
}

module.exports = {
    getChainList,
    findChain,
    fetchChainMetrics,
    fetchChainTvlHistory,
    fetchChainRaw,
};
