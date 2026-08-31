/* =================================================================
   PAYD Intelligence V2 — Common Provider Utilities
   ----------------------------------------------------------------
   - Rate-limited fetch with retry
   - Null-safe response envelopes
   - Reason codes for missing data
   ================================================================= */

// Коды причин отсутствия данных (machine-readable)
const MISSING_REASONS = {
    MISSING_IDENTIFIER: 'MISSING_IDENTIFIER',     // Нет нужного identifier
    NOT_APPLICABLE: 'NOT_APPLICABLE',              // Метрика не применима к entity type
    PROVIDER_NO_DATA: 'PROVIDER_NO_DATA',          // Провайдер не отдаёт метрику
    PROVIDER_ERROR: 'PROVIDER_ERROR',              // Ошибка провайдера (5xx, timeout)
    RATE_LIMITED: 'RATE_LIMITED',                  // 429
    AUTH_REQUIRED: 'AUTH_REQUIRED',                // 401/403
    MAPPING_AMBIGUOUS: 'MAPPING_AMBIGUOUS',        // Несколько кандидатов
    NOT_FOUND: 'NOT_FOUND',                        // 404
    PENDING: 'PENDING',                            // Ещё не запрашивалось
};

/**
 * Создаёт "конверт" для метрики с явным указанием источника и причины.
 * $0 не возвращается без явного подтверждения; по умолчанию — null.
 */
function makeMetric({ value, source = null, reason = null, httpStatus = null, confidence = null, raw = null, fetchedAt = null }) {
    return {
        value: value === undefined ? null : value,  // Никогда undefined
        source,
        reason,
        http_status: httpStatus,
        confidence,
        raw,
        fetched_at: fetchedAt || new Date().toISOString(),
    };
}

/**
 * Пустой envelope: метрика не была запрошена.
 */
function emptyMetric(reason = MISSING_REASONS.PENDING) {
    return makeMetric({ value: null, reason });
}

/**
 * Проверка: значение "truthy numeric" (не null, не undefined, не NaN, не 0-как-фолбэк)
 */
function isRealNumber(v) {
    return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Извлечь первое ненулевое числовое значение
 * (не использовать для null-safe fallback в 0)
 */
function pickNumeric(...vals) {
    for (const v of vals) {
        if (isRealNumber(v)) return v;
    }
    return null;
}

// Rate-limited fetch
const RATE_MS_DEFAULT = { coingecko: 7000, coingeckoCoin: 3000, defillama: 800, github: 5000, githubWithToken: 1500 };
const lastCall = {};
const RATE_MS = { ...RATE_MS_DEFAULT };

async function rateLimitedFetch(name, url, opts = {}) {
    const now = Date.now();
    const wait = RATE_MS[name] - (now - (lastCall[name] || 0));
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastCall[name] = Date.now();

    const headers = {
        'User-Agent': 'PAYD-Intel-Enrichment/2.0',
        'Accept': 'application/json',
        ...(opts.headers || {}),
    };
    if (opts.token) {
        headers['Authorization'] = `token ${opts.token}`;
    }

    try {
        const r = await fetch(url, { ...opts, headers });
        const status = r.status;
        if (status === 429) {
            const retryAfter = parseInt(r.headers.get('Retry-After') || '60', 10);
            await new Promise(res => setTimeout(res, retryAfter * 1000));
            return rateLimitedFetch(name, url, opts);
        }
        if (status === 401 || status === 403) {
            return { ok: false, status, reason: MISSING_REASONS.AUTH_REQUIRED, data: null };
        }
        if (status === 404) {
            return { ok: false, status, reason: MISSING_REASONS.NOT_FOUND, data: null };
        }
        if (!r.ok) {
            return { ok: false, status, reason: MISSING_REASONS.PROVIDER_ERROR, data: null };
        }
        const data = await r.json();
        return { ok: true, status, data };
    } catch (e) {
        return { ok: false, status: 0, reason: MISSING_REASONS.PROVIDER_ERROR, error: e.message };
    }
}

module.exports = {
    MISSING_REASONS,
    makeMetric,
    emptyMetric,
    isRealNumber,
    pickNumeric,
    rateLimitedFetch,
    RATE_MS,
};
