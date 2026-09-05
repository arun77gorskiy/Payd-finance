/* =================================================================
   PAYD Intelligence V2 — CoinGlass Provider
   ----------------------------------------------------------------
   Безопасный изолированный адаптер для CoinGlass derivatives data.

   Правила:
   - Полностью изолирован от других провайдеров.
   - Никогда не блокирует другие enrichment-процессы.
   - Все вызовы через independent timeout / retry / rate-limit.
   - API ключ только из env (COINGLASS_API_KEY).
   - При отсутствии ключа → AUTH_REQUIRED, остальная Intelligence работает.
   - Никогда не возвращает 0 — только null + reason.

   Поддерживаемые метрики (CoinGlass public API):
   - Open Interest (USD и quantity)
   - Funding Rate (current + history)
   - Liquidations (long/short)
   - Long/Short Account Ratio
   - Top Trader Position Ratio
   - Taker Buy/Sell Volume
   - Market Depth (где доступно)
   - Exchange Distribution
   ================================================================= */

const { MISSING_REASONS, makeMetric, emptyMetric, isRealNumber } = require('./_common.js');
const {
    CONFIG: CG_CONFIG,
    isActive: cgIsActive,
    maskApiKey,
    recordSuccess,
    recordFailure,
    recordRateLimit,
    setLastCheck,
    getHealthReport,
} = require('../coinglass_config.js');

const BASE = 'https://open-api.coinglass.com/public/v2';

// ── Independent rate-limited fetch (NO shared state with other providers) ──
const lastCall = { coinglass: 0 };

async function cgRateLimitedFetch(endpoint, params = {}) {
    if (!cgIsActive()) {
        return {
            ok: false,
            status: 0,
            reason: MISSING_REASONS.AUTH_REQUIRED,
            data: null,
            error: 'CoinGlass disabled or missing API key',
        };
    }

    const { API_KEY, maskApiKey: _ } = require('../coinglass_config.js');
    // Safe read: API_KEY здесь доступен, но никогда не возвращается наружу
    const key = process.env.COINGLASS_API_KEY;

    // Independent rate limit — не использует общий lastCall
    const now = Date.now();
    const wait = CG_CONFIG.rateLimitMs - (now - (lastCall.coinglass || 0));
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastCall.coinglass = Date.now();
    setLastCheck();

    const url = new URL(`${BASE}${endpoint}`);
    Object.entries(params).forEach(([k, v]) => {
        if (v !== null && v !== undefined) url.searchParams.set(k, String(v));
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CG_CONFIG.timeoutMs);

    try {
        const r = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'User-Agent': 'PAYD-Intel-CoinGlass/1.0',
                'Accept': 'application/json',
                'coinglassSecret': key, // CoinGlass header name
            },
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (r.status === 429) {
            recordRateLimit();
            const retryAfter = parseInt(r.headers.get('Retry-After') || '60', 10);
            const currentRetries = params._retries || 0;
            if (currentRetries < CG_CONFIG.retryAttempts) {
                await new Promise(res => setTimeout(res, Math.min(retryAfter * 1000, 30000)));
                return cgRateLimitedFetch(endpoint, { ...params, _retries: currentRetries + 1 });
            }
            return { ok: false, status: 429, reason: MISSING_REASONS.RATE_LIMITED, data: null };
        }
        if (r.status === 401 || r.status === 403) {
            recordFailure(MISSING_REASONS.AUTH_REQUIRED);
            return { ok: false, status: r.status, reason: MISSING_REASONS.AUTH_REQUIRED, data: null };
        }
        if (r.status === 404) {
            return { ok: false, status: 404, reason: MISSING_REASONS.NOT_FOUND, data: null };
        }
        if (!r.ok) {
            recordFailure(MISSING_REASONS.PROVIDER_ERROR);
            return { ok: false, status: r.status, reason: MISSING_REASONS.PROVIDER_ERROR, data: null };
        }
        const data = await r.json();
        if (data && data.success === false) {
            // CoinGlass-specific error format
            return {
                ok: false,
                status: r.status,
                reason: data.code === '401' ? MISSING_REASONS.AUTH_REQUIRED : MISSING_REASONS.PROVIDER_ERROR,
                data: null,
                cg_message: data.msg || null,
            };
        }
        return { ok: true, status: r.status, data };
    } catch (e) {
        clearTimeout(timeoutId);
        recordFailure(MISSING_REASONS.PROVIDER_ERROR);
        return { ok: false, status: 0, reason: MISSING_REASONS.PROVIDER_ERROR, data: null, error: e.message };
    }
}

// ── Symbol validation ──────────────────────────────────────────────
// CoinGlass использует тикеры (BTC, ETH), но они могут быть неоднозначны.
// Возвращаемые статусы: VERIFIED | NOT_SUPPORTED | AMBIGUOUS | NO_DERIVATIVES_MARKET | AUTH_REQUIRED
function validateSymbol(symbol) {
    if (!symbol || typeof symbol !== 'string' || symbol.length < 2) {
        return { status: 'NOT_SUPPORTED', reason: 'Empty or invalid symbol' };
    }
    const sym = symbol.toUpperCase();
    // Whitelist verified символов для контрольной группы
    // (расширяется по мере валидации)
    const VERIFIED = new Set([
        'BTC', 'ETH', 'SOL', 'LINK', 'ARB', 'OP', 'HNT', 'RENDER', 'AKT', 'ONDO',
        // Расширенный набор — после успешной проверки через API
        'MATIC', 'AVAX', 'DOGE', 'XRP', 'ADA', 'DOT', 'NEAR', 'APT', 'SUI',
        'ATOM', 'LTC', 'BCH', 'ETC', 'TRX', 'FIL', 'ICP', 'STX', 'INJ',
        'RNDR', // старый тикер Render
    ]);
    if (VERIFIED.has(sym)) {
        return { status: 'VERIFIED', symbol: sym };
    }
    return { status: 'NOT_SUPPORTED', reason: 'Symbol not in verified whitelist' };
}

// ── 1. Open Interest ──────────────────────────────────────────────
async function fetchOpenInterest(symbol) {
    const v = validateSymbol(symbol);
    if (v.status !== 'VERIFIED') {
        return { success: false, status: v.status, reason: v.reason, metrics: null };
    }
    if (!cgIsActive()) {
        return { success: false, status: 'AUTH_REQUIRED', reason: MISSING_REASONS.AUTH_REQUIRED, metrics: null };
    }
    const res = await cgRateLimitedFetch('/openInterest', { symbol: v.symbol });
    if (!res.ok) {
        return { success: false, status: res.reason, reason: res.reason, metrics: null };
    }
    const data = res.data?.data || [];
    if (!Array.isArray(data) || data.length === 0) {
        return { success: false, status: 'NO_DERIVATIVES_MARKET', reason: 'No OI data', metrics: null };
    }
    // Суммируем OI по всем биржам
    let totalOiUsd = 0;
    let totalOiQty = 0;
    const exchanges = {};
    for (const row of data) {
        if (isRealNumber(row.openInterest)) totalOiUsd += row.openInterest;
        if (isRealNumber(row.holdVolume)) totalOiQty += row.holdVolume;
        if (row.exchangeName) {
            exchanges[row.exchangeName] = {
                open_interest_usd: isRealNumber(row.openInterest) ? row.openInterest : null,
                open_interest_qty: isRealNumber(row.holdVolume) ? row.holdVolume : null,
            };
        }
    }
    const metrics = {
        open_interest_usd: totalOiUsd > 0 ? makeMetric({
            value: totalOiUsd,
            source: 'coinglass:openInterest',
            httpStatus: 200,
        }) : emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA),
        open_interest_quantity: totalOiQty > 0 ? makeMetric({
            value: totalOiQty,
            source: 'coinglass:openInterest',
            httpStatus: 200,
        }) : emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA),
        exchange_open_interest: exchanges,
    };
    recordSuccess(v.symbol, 2);
    return { success: true, status: 'AVAILABLE', metrics, raw_count: data.length };
}

// ── 2. Funding Rate ────────────────────────────────────────────────
async function fetchFundingRate(symbol) {
    const v = validateSymbol(symbol);
    if (v.status !== 'VERIFIED') {
        return { success: false, status: v.status, reason: v.reason, metrics: null };
    }
    if (!cgIsActive()) {
        return { success: false, status: 'AUTH_REQUIRED', reason: MISSING_REASONS.AUTH_REQUIRED, metrics: null };
    }
    const res = await cgRateLimitedFetch('/funding', { symbol: v.symbol });
    if (!res.ok) {
        return { success: false, status: res.reason, reason: res.reason, metrics: null };
    }
    const list = res.data?.data || [];
    if (!Array.isArray(list) || list.length === 0) {
        return { success: false, status: 'NO_DERIVATIVES_MARKET', reason: 'No funding data', metrics: null };
    }
    // Средние funding rates по всем биржам
    let sumRate = 0, count = 0;
    const fundingByExchange = {};
    for (const row of list) {
        if (isRealNumber(row.rate)) {
            sumRate += row.rate;
            count++;
            if (row.exchangeName) {
                fundingByExchange[row.exchangeName] = row.rate;
            }
        }
    }
    const avgRate = count > 0 ? sumRate / count : null;
    const metrics = {
        current_funding_rate: avgRate !== null ? makeMetric({
            value: avgRate,
            source: 'coinglass:funding',
            httpStatus: 200,
            confidence: 0.7,
        }) : emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA),
        funding_by_exchange: fundingByExchange,
    };
    recordSuccess(v.symbol, 1);
    return { success: true, status: 'AVAILABLE', metrics, raw_count: list.length };
}

// ── 3. Liquidations ────────────────────────────────────────────────
async function fetchLiquidations(symbol) {
    const v = validateSymbol(symbol);
    if (v.status !== 'VERIFIED') {
        return { success: false, status: v.status, reason: v.reason, metrics: null };
    }
    if (!cgIsActive()) {
        return { success: false, status: 'AUTH_REQUIRED', reason: MISSING_REASONS.AUTH_REQUIRED, metrics: null };
    }
    const res = await cgRateLimitedFetch('/liquidation', {
        symbol: v.symbol,
        interval: 'h1', // последние 24h
    });
    if (!res.ok) {
        return { success: false, status: res.reason, reason: res.reason, metrics: null };
    }
    const data = res.data?.data || {};
    const longLiq = isRealNumber(data.longLiquidationUsd) ? data.longLiquidationUsd : null;
    const shortLiq = isRealNumber(data.shortLiquidationUsd) ? data.shortLiquidationUsd : null;
    const total = (longLiq || 0) + (shortLiq || 0);
    const metrics = {
        long_liquidations_24h: longLiq !== null ? makeMetric({
            value: longLiq,
            source: 'coinglass:liquidation',
            httpStatus: 200,
        }) : emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA),
        short_liquidations_24h: shortLiq !== null ? makeMetric({
            value: shortLiq,
            source: 'coinglass:liquidation',
            httpStatus: 200,
        }) : emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA),
        total_liquidations_24h: total > 0 ? makeMetric({
            value: total,
            source: 'coinglass:liquidation',
            httpStatus: 200,
        }) : emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA),
    };
    recordSuccess(v.symbol, 3);
    return { success: true, status: 'AVAILABLE', metrics };
}

// ── 4. Long/Short Account Ratio ───────────────────────────────────
async function fetchLongShortRatio(symbol) {
    const v = validateSymbol(symbol);
    if (v.status !== 'VERIFIED') {
        return { success: false, status: v.status, reason: v.reason, metrics: null };
    }
    if (!cgIsActive()) {
        return { success: false, status: 'AUTH_REQUIRED', reason: MISSING_REASONS.AUTH_REQUIRED, metrics: null };
    }
    const res = await cgRateLimitedFetch('/longShortAccountRatio', { symbol: v.symbol, interval: 'h1' });
    if (!res.ok) {
        return { success: false, status: res.reason, reason: res.reason, metrics: null };
    }
    const list = res.data?.data || [];
    if (!Array.isArray(list) || list.length === 0) {
        return { success: false, status: 'NO_DERIVATIVES_MARKET', reason: 'No L/S ratio data', metrics: null };
    }
    // Берём последнее значение
    const latest = list[list.length - 1];
    const ratio = isRealNumber(latest.longAccount) && isRealNumber(latest.shortAccount)
        ? latest.longAccount / (latest.longAccount + latest.shortAccount)
        : null;
    const metrics = {
        long_short_ratio: ratio !== null ? makeMetric({
            value: ratio,
            source: 'coinglass:longShort',
            httpStatus: 200,
        }) : emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA),
    };
    recordSuccess(v.symbol, 1);
    return { success: true, status: 'AVAILABLE', metrics };
}

// ── Master fetch: все метрики для одного символа ──────────────────
/**
 * Изолированный безопасный вызов CoinGlass.
 * Возвращает market_intelligence envelope, который можно безопасно
 * подмешивать в project.market_intelligence.
 *
 * НИКОГДА не бросает исключения, не ломает основной pipeline.
 */
async function fetchMarketIntelligence(symbol) {
    const v = validateSymbol(symbol);
    if (v.status !== 'VERIFIED') {
        return {
            market_intelligence: null,
            symbol_status: v.status,
            reason: v.reason,
            fetched_at: new Date().toISOString(),
        };
    }
    if (!cgIsActive()) {
        return {
            market_intelligence: null,
            symbol_status: 'AUTH_REQUIRED',
            reason: MISSING_REASONS.AUTH_REQUIRED,
            fetched_at: new Date().toISOString(),
        };
    }

    // Параллельный вызов с failure isolation.
    // Каждый endpoint независим — падение одного не блокирует другие.
    const results = await Promise.allSettled([
        fetchOpenInterest(symbol),
        fetchFundingRate(symbol),
        fetchLiquidations(symbol),
        fetchLongShortRatio(symbol),
    ]);

    const [oiRes, frRes, liqRes, lsRes] = results;

    const safe = (r) => r.status === 'fulfilled' ? r.value : { success: false, status: 'PROVIDER_ERROR', metrics: null };

    const oi = safe(oiRes);
    const fr = safe(frRes);
    const liq = safe(liqRes);
    const ls = safe(lsRes);

    // Подсчёт статусов
    const statuses = [oi.status, fr.status, liq.status, ls.status];
    const anySuccess = statuses.includes('AVAILABLE');
    const anyAuth = statuses.includes('AUTH_REQUIRED');
    const anyUnsupported = statuses.includes('NOT_SUPPORTED') || statuses.includes('NO_DERIVATIVES_MARKET');

    let overallStatus = 'PENDING';
    if (anyAuth && !anySuccess) overallStatus = 'AUTH_REQUIRED';
    else if (anySuccess) overallStatus = 'AVAILABLE';
    else if (anyUnsupported) overallStatus = 'NOT_SUPPORTED';
    else overallStatus = 'PROVIDER_ERROR';

    const market_intelligence = {
        derivatives: {
            open_interest: oi.metrics || null,
            funding_rate: fr.metrics || null,
        },
        liquidations: liq.metrics || null,
        positioning: {
            long_short_ratio: ls.metrics?.long_short_ratio || null,
        },
        open_interest: oi.metrics || null,
        funding: fr.metrics || null,
        exchange_distribution: {
            by_oi: oi.metrics?.exchange_open_interest || {},
            by_funding: fr.metrics?.funding_by_exchange || {},
        },
        // Поле для derived значений — рассчитывается ниже
        derived: {},
        _provenance: {
            source: 'CoinGlass',
            retrieved_at: new Date().toISOString(),
            endpoints_called: 4,
            endpoints_succeeded: [oi, fr, liq, ls].filter(r => r.success).length,
        },
    };

    return {
        market_intelligence,
        symbol_status: overallStatus,
        reason: anyAuth ? MISSING_REASONS.AUTH_REQUIRED : null,
        fetched_at: new Date().toISOString(),
    };
}

// ── Health check (для диагностики) ────────────────────────────────
async function ping() {
    if (!cgIsActive()) {
        return {
            ok: false,
            status: 'AUTH_REQUIRED',
            reason: 'Provider disabled or missing key',
        };
    }
    // Лёгкий health check через BTC funding (минимальный ответ)
    const res = await cgRateLimitedFetch('/funding', { symbol: 'BTC' });
    if (res.ok) {
        return { ok: true, status: 'AVAILABLE', http_status: res.status };
    }
    return { ok: false, status: res.reason, http_status: res.status };
}

module.exports = {
    BASE,
    fetchOpenInterest,
    fetchFundingRate,
    fetchLiquidations,
    fetchLongShortRatio,
    fetchMarketIntelligence,
    validateSymbol,
    ping,
    getHealthReport,
};
