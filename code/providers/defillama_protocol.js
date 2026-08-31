/* =================================================================
   PAYD Intelligence V2 — DefiLlama PROTOCOL Provider
   ----------------------------------------------------------------
   Работает с /protocols (list), /protocol/{slug} (detail),
   /summary/fees/{slug} (fees+revenue), /summary/dexs/{slug} (DEX volume).

   Возвращает null для каждой метрики без подтверждения.
   ================================================================= */

const { rateLimitedFetch, MISSING_REASONS, makeMetric, emptyMetric, isRealNumber } = require('./_common.js');

let protocolsCache = null;
let protocolsCacheTime = 0;
const CACHE_TTL = 60 * 60 * 1000;

async function getProtocolsList() {
    const now = Date.now();
    if (protocolsCache && (now - protocolsCacheTime) < CACHE_TTL) {
        return protocolsCache;
    }
    const res = await rateLimitedFetch('defillama', 'https://api.llama.fi/protocols');
    if (!res.ok) return null;
    protocolsCache = res.data;
    protocolsCacheTime = now;
    return protocolsCache;
}

/**
 * Найти protocol в списке по slug
 */
async function findProtocol(slug) {
    if (!slug) return null;
    const list = await getProtocolsList();
    if (!Array.isArray(list)) return null;
    const target = slug.toLowerCase();
    return list.find(p => (p.slug || '').toLowerCase() === target) || null;
}

/**
 * Получить детальную информацию о протоколе
 */
async function fetchProtocolDetail(slug) {
    if (!slug) return null;
    const url = `https://api.llama.fi/protocol/${encodeURIComponent(slug)}`;
    const res = await rateLimitedFetch('defillama', url);
    if (!res.ok) return null;
    return res.data;
}

/**
 * Получить fees+revenue для протокола.
 * @returns {Object|null} { total24h, total7d, total30d, revenue24h, ... }
 */
async function fetchProtocolFees(slug) {
    if (!slug) return null;
    const url = `https://api.llama.fi/summary/fees/${encodeURIComponent(slug)}`;
    const res = await rateLimitedFetch('defillama', url);
    if (!res.ok) return null;
    return res.data;
}

/**
 * Получить DEX volume для протокола.
 */
async function fetchProtocolDexVolume(slug) {
    if (!slug) return null;
    const url = `https://api.llama.fi/summary/dexs/${encodeURIComponent(slug)}`;
    const res = await rateLimitedFetch('defillama', url);
    if (!res.ok) return null;
    return res.data;
}

/**
 * Получить все protocol-метрики для проекта.
 * @param {Object} identifiers - { defillama_protocol, defillama_dex }
 * @returns {Object} { protocol, metrics, reasons }
 */
async function fetchProtocolMetrics(identifiers) {
    const out = {
        protocol: null,
        metrics: {},
        reasons: {},
    };

    const protocolSlug = identifiers?.defillama_protocol;
    if (!protocolSlug) {
        out.reasons.tvl = MISSING_REASONS.MISSING_IDENTIFIER;
        return out;
    }

    // Сначала пробуем detail endpoint
    const detail = await fetchProtocolDetail(protocolSlug);
    if (!detail) {
        // Fallback к /protocols
        const listEntry = await findProtocol(protocolSlug);
        if (!listEntry) {
            out.reasons.tvl = MISSING_REASONS.NOT_FOUND;
            return out;
        }
        out.protocol = {
            slug: listEntry.slug,
            name: listEntry.name,
            category: listEntry.category || null,
            chains: listEntry.chains || [],
        };
        // TVL
        if (isRealNumber(listEntry.tvl)) {
            out.metrics.tvl = makeMetric({
                value: listEntry.tvl,
                source: 'defillama:protocol',
                httpStatus: 200,
            });
        } else {
            out.metrics.tvl = makeMetric({ value: null, source: 'defillama:protocol', reason: MISSING_REASONS.PROVIDER_NO_DATA });
        }
        // Change 1d/7d
        if (isRealNumber(listEntry.change_1d)) {
            out.metrics.tvl_change_1d = makeMetric({ value: listEntry.change_1d, source: 'defillama:protocol' });
        } else {
            out.metrics.tvl_change_1d = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
        }
        if (isRealNumber(listEntry.change_7d)) {
            out.metrics.tvl_change_7d = makeMetric({ value: listEntry.change_7d, source: 'defillama:protocol' });
        } else {
            out.metrics.tvl_change_7d = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
        }
        return out;
    }

    out.protocol = {
        slug: detail.slug,
        name: detail.name,
        category: detail.category || null,
        chains: detail.chains || [],
    };

    // TVL — обычно в chainTvls, берём общий
    // Для protocol detail — total TVL часто идёт через mcap или другой путь.
    // Надёжнее: используем currentChainTvls, если есть
    let totalTvl = null;
    if (isRealNumber(detail.tvl)) {
        totalTvl = detail.tvl;
    } else if (detail.currentChainTvls && typeof detail.currentChainTvls === 'object') {
        // Суммируем по всем chain
        const sum = Object.values(detail.currentChainTvls).reduce((a, b) => {
            return a + (isRealNumber(b) ? b : 0);
        }, 0);
        if (isRealNumber(sum) && sum > 0) totalTvl = sum;
    }
    if (isRealNumber(totalTvl)) {
        out.metrics.tvl = makeMetric({ value: totalTvl, source: 'defillama:protocol', httpStatus: 200 });
    } else {
        out.metrics.tvl = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
    }

    // Change 1d/7d
    if (isRealNumber(detail.change_1d)) {
        out.metrics.tvl_change_1d = makeMetric({ value: detail.change_1d, source: 'defillama:protocol' });
    } else {
        out.metrics.tvl_change_1d = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
    }
    if (isRealNumber(detail.change_7d)) {
        out.metrics.tvl_change_7d = makeMetric({ value: detail.change_7d, source: 'defillama:protocol' });
    } else {
        out.metrics.tvl_change_7d = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
    }

    // Fees & Revenue
    const fees = await fetchProtocolFees(protocolSlug);
    if (fees) {
        // total24h → fees 24h
        if (isRealNumber(fees.total24h)) {
            out.metrics.fees_24h = makeMetric({ value: fees.total24h, source: 'defillama:fees' });
        } else {
            out.metrics.fees_24h = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
        }
        // revenue24h
        if (isRealNumber(fees.revenue24h)) {
            out.metrics.revenue_24h = makeMetric({ value: fees.revenue24h, source: 'defillama:fees' });
        } else {
            out.metrics.revenue_24h = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
        }
    } else {
        out.metrics.fees_24h = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
        out.metrics.revenue_24h = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
    }

    return out;
}

/**
 * Получить DEX volume для проекта
 */
async function fetchDexVolumeMetrics(identifiers) {
    const out = { metrics: {}, reasons: {} };
    const dexSlug = identifiers?.defillama_dex;
    if (!dexSlug) {
        out.reasons.dex_volume_24h = MISSING_REASONS.NOT_APPLICABLE;
        return out;
    }
    const data = await fetchProtocolDexVolume(dexSlug);
    if (!data) {
        out.metrics.dex_volume_24h = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
        return out;
    }
    // total24h — это и есть volume
    if (isRealNumber(data.total24h)) {
        out.metrics.dex_volume_24h = makeMetric({ value: data.total24h, source: 'defillama:dexs' });
    } else {
        out.metrics.dex_volume_24h = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
    }
    return out;
}

module.exports = {
    getProtocolsList,
    findProtocol,
    fetchProtocolDetail,
    fetchProtocolFees,
    fetchProtocolDexVolume,
    fetchProtocolMetrics,
    fetchDexVolumeMetrics,
};
