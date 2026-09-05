/* =================================================================
   PAYD Intelligence V2 — CoinGecko Provider
   ----------------------------------------------------------------
   Использует:
   - /coins/markets — для батча по market data
   - /coins/{id} — для деталей, community_data, developer_data

   Правила:
   - Никогда не конвертировать null/undefined в 0
   - Возвращать полный envelope с reason
   - developer_data и community_data помечаются как fallback-источники
   ================================================================= */

const { rateLimitedFetch, MISSING_REASONS, makeMetric, emptyMetric, isRealNumber } = require('./_common.js');

const BASE = 'https://api.coingecko.com/api/v3';

/**
 * Batch fetch /coins/markets
 * @param {string[]} coinIds
 * @returns {Array} массив объектов CoinGecko
 */
async function fetchMarkets(coinIds) {
    if (!Array.isArray(coinIds) || coinIds.length === 0) return [];
    const all = [];
    for (let i = 0; i < coinIds.length; i += 200) {
        const batch = coinIds.slice(i, i + 200);
        const url = `${BASE}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(batch.join(','))}&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=1h%2C24h%2C7d%2C30d`;
        const res = await rateLimitedFetch('coingecko', url);
        if (res.ok && Array.isArray(res.data)) {
            all.push(...res.data);
        }
    }
    return all;
}

/**
 * Получить market data для одного coinId.
 * Возвращает null-safe envelope.
 */
function buildMarketMetrics(cg) {
    const m = {};
    if (!cg || typeof cg !== 'object') {
        m.price_usd = emptyMetric(MISSING_REASONS.NOT_FOUND);
        m.market_cap_usd = emptyMetric(MISSING_REASONS.NOT_FOUND);
        return m;
    }

    const set = (key, val) => {
        if (isRealNumber(val)) {
            m[key] = makeMetric({ value: val, source: 'coingecko:markets', httpStatus: 200 });
        } else {
            m[key] = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
        }
    };

    set('price_usd', cg.current_price);
    set('market_cap_usd', cg.market_cap);
    set('fdv_usd', cg.fully_diluted_valuation);
    set('circulating_supply', cg.circulating_supply);
    set('total_supply', cg.total_supply);
    set('max_supply', cg.max_supply);
    set('volume_24h_usd', cg.total_volume);
    set('change_24h_pct', cg.price_change_percentage_24h_in_currency);
    set('change_7d_pct', cg.price_change_percentage_7d_in_currency);
    set('change_30d_pct', cg.price_change_percentage_30d_in_currency);
    set('change_1h_pct', cg.price_change_percentage_1h_in_currency);
    set('ath', cg.ath);
    set('ath_change_pct', cg.ath_change_percentage);
    set('atl', cg.atl);
    set('atl_change_pct', cg.atl_change_percentage);
    if (Number.isInteger(cg.market_cap_rank)) {
        m.market_cap_rank = makeMetric({ value: cg.market_cap_rank, source: 'coingecko:markets' });
    } else {
        m.market_cap_rank = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
    }
    return m;
}

/**
 * Fetch /coins/{id} с developer_data и community_data.
 * @returns {Object|null} raw CoinGecko response
 */
async function fetchCoinDetail(coinId) {
    if (!coinId) return null;
    const url = `${BASE}/coins/${encodeURIComponent(coinId)}?localization=false&tickers=false&market_data=false&community_data=true&developer_data=true`;
    const res = await rateLimitedFetch('coingeckoCoin', url);
    if (!res.ok) return null;
    return res.data;
}

/**
 * Build social & developer metrics envelope.
 * Эти данные помечаются как fallback, не primary source.
 */
function buildSocialAndDeveloper(cg) {
    const m = {};
    if (!cg) return m;

    // Social
    const twitter = cg.links?.twitter_screen_name || null;
    if (twitter) {
        m.twitter_handle = makeMetric({ value: twitter, source: 'coingecko:detail' });
        m.twitter_url = makeMetric({ value: `https://x.com/${twitter}`, source: 'coingecko:detail' });
    } else {
        m.twitter_handle = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
        m.twitter_url = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
    }
    if (isRealNumber(cg.community_data?.twitter_followers)) {
        m.twitter_followers = makeMetric({
            value: cg.community_data.twitter_followers,
            source: 'coingecko:community_data',
            confidence: 0.6, // marked as fallback
        });
    } else {
        m.twitter_followers = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
    }
    if (isRealNumber(cg.community_data?.reddit_subscribers)) {
        m.reddit_subscribers = makeMetric({
            value: cg.community_data.reddit_subscribers,
            source: 'coingecko:community_data',
            confidence: 0.6,
        });
    } else {
        m.reddit_subscribers = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
    }
    // Telegram / Discord
    if (cg.links?.telegram_channel_identifier) {
        m.telegram_channel = makeMetric({ value: cg.links.telegram_channel_identifier, source: 'coingecko:detail' });
    } else {
        m.telegram_channel = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
    }
    if (cg.links?.chat_url) {
        const discord = cg.links.chat_url.find(u => u.includes('discord')) || null;
        if (discord) {
            m.discord = makeMetric({ value: discord, source: 'coingecko:detail' });
        } else {
            m.discord = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
        }
    } else {
        m.discord = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
    }

    // Developer (fallback, не primary)
    if (cg.developer_data) {
        const dd = cg.developer_data;
        if (isRealNumber(dd.stars)) {
            m.developer_stars = makeMetric({ value: dd.stars, source: 'coingecko:developer_data', confidence: 0.5 });
        } else {
            m.developer_stars = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
        }
        if (isRealNumber(dd.forks)) {
            m.developer_forks = makeMetric({ value: dd.forks, source: 'coingecko:developer_data', confidence: 0.5 });
        } else {
            m.developer_forks = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
        }
        if (isRealNumber(dd.subscribers)) {
            m.developer_subscribers = makeMetric({ value: dd.subscribers, source: 'coingecko:developer_data', confidence: 0.5 });
        } else {
            m.developer_subscribers = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
        }
        if (isRealNumber(dd.total_issues)) {
            m.developer_total_issues = makeMetric({ value: dd.total_issues, source: 'coingecko:developer_data', confidence: 0.5 });
        } else {
            m.developer_total_issues = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
        }
        if (isRealNumber(dd.closed_issues)) {
            m.developer_closed_issues = makeMetric({ value: dd.closed_issues, source: 'coingecko:developer_data', confidence: 0.5 });
        } else {
            m.developer_closed_issues = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
        }
        if (isRealNumber(dd.pull_requests_merged)) {
            m.developer_prs_merged = makeMetric({ value: dd.pull_requests_merged, source: 'coingecko:developer_data', confidence: 0.5 });
        } else {
            m.developer_prs_merged = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
        }
        if (isRealNumber(dd.commit_count_4_weeks)) {
            m.developer_commits_4w = makeMetric({ value: dd.commit_count_4_weeks, source: 'coingecko:developer_data', confidence: 0.5 });
        } else {
            m.developer_commits_4w = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
        }
    }

    return m;
}

module.exports = {
    fetchMarkets,
    buildMarketMetrics,
    fetchCoinDetail,
    buildSocialAndDeveloper,
};
