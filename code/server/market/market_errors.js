/**
 * PAYD Market Gateway — Error Types & Status Mapping
 *
 * Single source of truth for error classification.
 * Status strings must match the canonical contract from the spec.
 *
 * Authoritative status set (from STEP 2 spec):
 *   LIVE, PARTIAL, UNKNOWN_MAPPING, MAPPING_CONFLICT,
 *   PROVIDER_UNAVAILABLE, PROVIDER_ERROR, RATE_LIMITED,
 *   INVALID_RESPONSE, INVALID_ID
 */

'use strict';

const STATUS = Object.freeze({
  LIVE: 'LIVE',
  PARTIAL: 'PARTIAL',
  UNKNOWN_MAPPING: 'UNKNOWN_MAPPING',
  MAPPING_CONFLICT: 'MAPPING_CONFLICT',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  INVALID_ID: 'INVALID_ID',
});

const PROVIDER_NAME = 'coinmarketcap';

/**
 * Base error class for all PAYD Market Gateway errors.
 * Carries a stable status string so the HTTP layer can render the
 * normalized envelope without re-classifying.
 */
class MarketError extends Error {
  constructor(status, message, { cause = null, httpStatus = 200, retryAfterMs = null } = {}) {
    super(message);
    this.name = 'MarketError';
    this.status = status;
    this.httpStatus = httpStatus;
    this.retryAfterMs = retryAfterMs;
    if (cause) this.cause = cause;
  }
}

class InvalidIdError extends MarketError {
  constructor(canonicalId) {
    super(
      STATUS.INVALID_ID,
      `Unknown canonical_id: ${canonicalId}`,
      { httpStatus: 404 }
    );
    this.canonicalId = canonicalId;
  }
}

class UnknownMappingError extends MarketError {
  constructor(canonicalId) {
    super(
      STATUS.UNKNOWN_MAPPING,
      `No verified CMC mapping for ${canonicalId}`,
      { httpStatus: 200 } // documented API-level handling, per spec
    );
    this.canonicalId = canonicalId;
  }
}

class MappingConflictError extends MarketError {
  constructor(canonicalId, details) {
    super(
      STATUS.MAPPING_CONFLICT,
      `CMC identity fields disagree for ${canonicalId}: ${details}`,
      { httpStatus: 200 }
    );
    this.canonicalId = canonicalId;
    this.conflictDetails = details;
  }
}

class ProviderUnavailableError extends MarketError {
  constructor(message, { cause = null, retryAfterMs = null } = {}) {
    super(
      STATUS.PROVIDER_UNAVAILABLE,
      message || 'CoinMarketCap is not currently available',
      { cause, retryAfterMs, httpStatus: 200 } // spec: status conveys unavailability
    );
  }
}

class ProviderError extends MarketError {
  constructor(message, { cause = null } = {}) {
    super(
      STATUS.PROVIDER_ERROR,
      message || 'CoinMarketCap returned an error',
      { cause, httpStatus: 200 }
    );
  }
}

class RateLimitedError extends MarketError {
  constructor(message, { retryAfterMs = null } = {}) {
    super(
      STATUS.RATE_LIMITED,
      message || 'CoinMarketCap rate-limited the request',
      { retryAfterMs, httpStatus: 200 }
    );
  }
}

class InvalidResponseError extends MarketError {
  constructor(message, { cause = null } = {}) {
    super(
      STATUS.INVALID_RESPONSE,
      message || 'CoinMarketCap response failed validation',
      { cause, httpStatus: 200 }
    );
  }
}

class TimeoutError extends MarketError {
  constructor(message = 'Provider request timed out') {
    super(
      STATUS.PROVIDER_UNAVAILABLE,
      message,
      { httpStatus: 200 }
    );
  }
}

/**
 * Map any thrown value into a MarketError if it isn't already one.
 * Never leaks raw provider exceptions to callers.
 */
function normalizeUnknownError(err) {
  if (err instanceof MarketError) return err;
  // AbortError from undici / fetch when timeout fires
  if (err && (err.name === 'AbortError' || /aborted|timeout/i.test(String(err.message || '')))) {
    return new TimeoutError(err.message);
  }
  return new ProviderError(err && err.message ? err.message : 'Unknown provider error', { cause: err });
}

module.exports = {
  STATUS,
  PROVIDER_NAME,
  MarketError,
  InvalidIdError,
  UnknownMappingError,
  MappingConflictError,
  ProviderUnavailableError,
  ProviderError,
  RateLimitedError,
  InvalidResponseError,
  TimeoutError,
  normalizeUnknownError,
};
