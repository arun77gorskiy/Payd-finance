/* =================================================================
   PAYD Intelligence V2 — CoinGlass Provider Configuration
   ----------------------------------------------------------------
   Изолированный конфиг для безопасной интеграции CoinGlass.

   Правила:
   - API ключ читается ТОЛЬКО из переменной окружения COINGLASS_API_KEY
   - Ключ НИКОГДА не сохраняется в JSON, фронтенд-коде или логах
   - COINGLASS_ENABLED = false по умолчанию для безопасного rollout
   - При отсутствии ключа провайдер помечается AUTH_REQUIRED
   - При сбое провайдера остальная Intelligence продолжает работать

   Hard roll-back:
   - export COINGLASS_ENABLED=false
   - ИЛИ удалить COINGLASS_API_KEY
   ================================================================= */

const fs = require('fs');
const path = require('path');

// ── Feature flag ───────────────────────────────────────────────────
// Безопасное определение: по умолчанию ВЫКЛЮЧЕНО.
const _envEnabled = (process.env.COINGLASS_ENABLED || '').toLowerCase();
const ENV_ENABLED = _envEnabled === 'true' || _envEnabled === '1' || _envEnabled === 'yes';

// ── API key (server-side ONLY) ─────────────────────────────────────
// ВАЖНО: ключ НИКОГДА не должен попасть в JSON-файлы или фронтенд.
const API_KEY = process.env.COINGLASS_API_KEY || '';

// ── Provider health tracking (in-memory) ───────────────────────────
const HEALTH = {
    enabled: ENV_ENABLED && API_KEY.length > 0,
    api_key_present: API_KEY.length > 0,
    api_key_masked: API_KEY ? `${API_KEY.substring(0, 4)}...${API_KEY.substring(API_KEY.length - 4)}` : null,
    last_check_at: null,
    last_successful_request_at: null,
    successful_requests: 0,
    failed_requests: 0,
    rate_limited_requests: 0,
    auth_required_count: 0,
    supported_projects: [],
    metrics_written: 0,
    status: 'PENDING', // PENDING | AUTH_REQUIRED | AVAILABLE | DISABLED | RATE_LIMITED
    error: null,
};

// ── Configuration ─────────────────────────────────────────────────
const CONFIG = {
    baseUrl: 'https://open-api.coinglass.com/public/v2',
    timeoutMs: 12000,
    retryAttempts: 2,
    retryDelayMs: 1500,
    rateLimitMs: 1100, // ~55 req/min default for public tier
    maxConcurrentRequests: 3,
    // CoinGlass API поддерживает только проверенные символы — никаких fuzzy matches
    symbolValidationRequired: true,
    // TTL для persisted данных
    freshnessTtlHours: 2,
};

// ── Status determination ───────────────────────────────────────────
function determineStatus() {
    if (!ENV_ENABLED) {
        HEALTH.status = 'DISABLED';
        HEALTH.error = 'COINGLASS_ENABLED=false (feature flag off)';
        return HEALTH.status;
    }
    if (!API_KEY) {
        HEALTH.status = 'AUTH_REQUIRED';
        HEALTH.error = 'COINGLASS_API_KEY is empty. Set environment variable to enable.';
        HEALTH.auth_required_count++;
        return HEALTH.status;
    }
    HEALTH.status = 'AVAILABLE';
    HEALTH.error = null;
    return HEALTH.status;
}

// Initial status check
determineStatus();

/**
 * Маскирование ключа для логов и отчётов.
 * НИКОГДА не возвращает полный ключ.
 */
function maskApiKey() {
    if (!API_KEY) return null;
    if (API_KEY.length < 8) return '***';
    return `${API_KEY.substring(0, 4)}***${API_KEY.substring(API_KEY.length - 4)}`;
}

/**
 * Проверить, активен ли провайдер. Без активного провайдера все
 * методы возвращают безопасный envelope со статусом AUTH_REQUIRED.
 */
function isActive() {
    return HEALTH.enabled && HEALTH.status === 'AVAILABLE';
}

/**
 * Получить health-отчёт для провайдера. Без раскрытия ключа.
 */
function getHealthReport() {
    return {
        provider: 'coinglass',
        enabled: HEALTH.enabled,
        authentication: HEALTH.api_key_present ? 'OK' : 'MISSING',
        api_key: maskApiKey(), // masked only
        status: HEALTH.status,
        last_check_at: HEALTH.last_check_at,
        last_successful_request_at: HEALTH.last_successful_request_at,
        successful_requests: HEALTH.successful_requests,
        failed_requests: HEALTH.failed_requests,
        rate_limited_requests: HEALTH.rate_limited_requests,
        auth_required_count: HEALTH.auth_required_count,
        supported_projects_count: HEALTH.supported_projects.length,
        metrics_written: HEALTH.metrics_written,
        error: HEALTH.error,
        rollback_instructions: 'Set COINGLASS_ENABLED=false to disable. Remove or unset COINGLASS_API_KEY to fully detach.',
    };
}

/**
 * Обновить health-метрики (internal use only).
 */
function recordSuccess(symbol, metricsCount) {
    HEALTH.successful_requests++;
    HEALTH.last_successful_request_at = new Date().toISOString();
    if (symbol && !HEALTH.supported_projects.includes(symbol)) {
        HEALTH.supported_projects.push(symbol);
    }
    HEALTH.metrics_written += metricsCount || 0;
}

function recordFailure(reason) {
    HEALTH.failed_requests++;
    if (reason === 'AUTH_REQUIRED') HEALTH.auth_required_count++;
    if (reason === 'RATE_LIMITED') HEALTH.rate_limited_requests++;
}

function recordRateLimit() {
    HEALTH.rate_limited_requests++;
}

function setLastCheck() {
    HEALTH.last_check_at = new Date().toISOString();
}

module.exports = {
    CONFIG,
    HEALTH,
    isActive,
    maskApiKey,
    getHealthReport,
    determineStatus,
    recordSuccess,
    recordFailure,
    recordRateLimit,
    setLastCheck,
    // Expose but mark as internal — do not pass API_KEY to consumer-facing code
    _internal: {
        API_KEY_PRESENT: API_KEY.length > 0,
    },
};
