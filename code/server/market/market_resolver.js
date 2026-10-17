/**
 * PAYD Market Gateway — Canonical ID Resolver
 *
 * Reads the verified PAYD project dataset
 *   /public/data/intelligence/token-index.json    ← AUTHORITATIVE for CMC identity (Stage 4)
 * and resolves a canonical id to the CMC fields used by the gateway.
 *
 * For backward compatibility the resolver ALSO accepts the older
 *   /public/data/projects_enriched.json
 * shape, which carries a `projects[]` array and an extra `identifiers.coinmarketcap`
 * cross-check field. token-index.json is detected by the presence of a `records[]` array.
 *
 * Resolution rules (from STEP 2 spec):
 *   1. Primary identifier is `cmcId` (string or numeric).
 *   2. Slug is metadata only; do not use it for provider calls.
 *   3. (legacy projects_enriched only) Both `cmcId` and `identifiers.coinmarketcap`
 *      MUST exist and agree. A disagreement is a MAPPING_CONFLICT.
 *   4. The 31 projects without verified CMC identity MUST surface as
 *      UNKNOWN_MAPPING — the resolver NEVER guesses by ticker/name/slug.
 *
 * Unknown / malformed inputs are surfaced as MarketError subclasses so the
 * service can produce the documented envelope (INVALID_ID, UNKNOWN_MAPPING,
 * MAPPING_CONFLICT).
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { createHash } = require('crypto');

const {
  InvalidIdError,
  UnknownMappingError,
  MappingConflictError,
} = require('./market_errors');

function loadProjectsDataset(datasetPath) {
  const abs = path.resolve(datasetPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`projects_enriched.json not found at ${abs}`);
  }
  const raw = fs.readFileSync(abs, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.projects)) {
    throw new Error(`projects_enriched.json is malformed: missing 'projects' array`);
  }
  return parsed;
}

/**
 * Stage 4 verified source: token-index.json
 *
 *   {
 *     "count": 354,
 *     "records": [
 *       { "id": "bitcoin", "symbol": "BTC", "name": "Bitcoin",
 *         "cmcId": "1", "cmcSlug": "bitcoin", ... }
 *       ...
 *       { "id": "ipfs", "symbol": "FIL", "name": "IPFS" }   ← no cmcId
 *     ]
 *   }
 *
 * Records without a non-empty `cmcId` MUST surface as UNKNOWN_MAPPING and
 * MUST NOT be silently guessed.
 */
function loadTokenIndexDataset(datasetPath) {
  const abs = path.resolve(datasetPath);
  if (!fs.existsSync(abs)) {
    throw new Error(`token-index.json not found at ${abs}`);
  }
  const raw = fs.readFileSync(abs, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.records)) {
    throw new Error(`token-index.json is malformed: missing 'records' array`);
  }
  return parsed;
}

function _present(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string' && v.trim() === '') return false;
  return true;
}

/**
 * Build a fast lookup index keyed by canonical `id`. We do not support
 * symbol/alias resolution here on purpose — the spec is explicit:
 * "Do NOT resolve identity by symbol when cmcId exists."
 */
function indexProjects(dataset) {
  const idx = new Map();
  for (const p of dataset.projects) {
    if (!p || typeof p !== 'object') continue;
    const id = p.id;
    if (!_present(id)) continue;
    idx.set(String(id), p);
  }
  return idx;
}

/**
 * Build a fast lookup index for the Stage 4 token-index.json format.
 * Records are keyed by canonical `id`. Same single-key guarantee as above.
 */
function indexTokenIndex(dataset) {
  const idx = new Map();
  for (const p of dataset.records) {
    if (!p || typeof p !== 'object') continue;
    const id = p.id;
    if (!_present(id)) continue;
    idx.set(String(id), p);
  }
  return idx;
}

/**
 * Detect which dataset format the resolver was handed. Returns one of:
 *   'token-index'        — { records: [...] }
 *   'projects-enriched'  — { projects: [...] }
 */
function detectDatasetFormat(dataset) {
  if (!dataset || typeof dataset !== 'object') return 'unknown';
  if (Array.isArray(dataset.records)) return 'token-index';
  if (Array.isArray(dataset.projects)) return 'projects-enriched';
  return 'unknown';
}

class MarketResolver {
  /**
   * @param {object} opts
   * @param {string} [opts.datasetPath]  path to projects_enriched.json OR token-index.json
   * @param {object} [opts.dataset]      pre-loaded dataset (for tests). Auto-detects format.
   * @param {string} [opts.format]       explicit 'token-index' | 'projects-enriched' override
   */
  constructor({ datasetPath, dataset, format } = {}) {
    if (dataset) {
      this.dataset = dataset;
      this.datasetSha256 = createHash('sha256').update(JSON.stringify(dataset)).digest('hex');
    } else if (datasetPath) {
      // Try token-index (Stage 4 source) first, fall back to projects_enriched
      const abs = path.resolve(datasetPath);
      if (!fs.existsSync(abs)) {
        throw new Error(`Market resolver dataset not found at ${abs}`);
      }
      const bytes = fs.readFileSync(abs);
      this.datasetSha256 = createHash('sha256').update(bytes).digest('hex');
      const raw = JSON.parse(bytes.toString('utf-8'));
      if (Array.isArray(raw.records)) {
        this.dataset = raw;
      } else if (Array.isArray(raw.projects)) {
        this.dataset = raw;
      } else {
        throw new Error(
          `Market resolver dataset is malformed: expected 'records' (token-index) or 'projects' (projects_enriched)`
        );
      }
    } else {
      throw new Error('MarketResolver requires either datasetPath or dataset');
    }

    const detected = format || detectDatasetFormat(this.dataset);
    this.format = detected;
    if (detected === 'token-index') {
      this.index = indexTokenIndex(this.dataset);
    } else if (detected === 'projects-enriched') {
      this.index = indexProjects(this.dataset);
    } else {
      throw new Error(`Unsupported dataset format: ${detected}`);
    }
  }

  /**
   * Resolve a canonical id and return either:
   *   { ok:true,  context:{ canonicalId, symbol, name, cmcId, cmcSlug, format } }
   *   { ok:false, error: MarketError }
   *
   * Errors are returned as values (not thrown) so the service can map them
   * to the documented envelope without try/catch noise.
   */
  resolve(canonicalId) {
    if (!_present(canonicalId)) {
      return { ok: false, error: new InvalidIdError(String(canonicalId)) };
    }
    const id = String(canonicalId).trim();
    const project = this.index.get(id);
    if (!project) {
      return { ok: false, error: new InvalidIdError(id) };
    }

    const cmcId = project.cmcId;
    const cmcSlug = project.cmcSlug;

    const hasPrimary = _present(cmcId);

    // UNKNOWN_MAPPING — absent, quarantined, or explicitly non-token identity.
    // Resolver MUST NOT guess by symbol/name/slug.
    if (!hasPrimary || project.mapping_status === 'unverified' ||
        project.mapping_status === 'quarantined' || project.asset_type === 'project_without_token' ||
        project.asset_type === 'unverified') {
      return {
        ok: false,
        error: new UnknownMappingError(id),
        context: {
          canonicalId: id,
          symbol: project.symbol || null,
          name: project.name || null,
          cmcSlug: cmcSlug || null,
          format: this.format,
        },
      };
    }

    // Legacy cross-check: only when projects_enriched.json carries
    // identifiers.coinmarketcap must it agree with cmcId.
    if (this.format === 'projects-enriched') {
      const identifiers = (project.identifiers && typeof project.identifiers === 'object')
        ? project.identifiers
        : {};
      const identifiersCmc = identifiers.coinmarketcap;
      if (_present(identifiersCmc) && String(cmcId) !== String(identifiersCmc)) {
        return {
          ok: false,
          error: new MappingConflictError(
            id,
            `cmcId=${cmcId} vs identifiers.coinmarketcap=${identifiersCmc}`
          ),
          context: {
            canonicalId: id,
            symbol: project.symbol || null,
            name: project.name || null,
            cmcId: String(cmcId),
            cmcSlug: cmcSlug || null,
            format: this.format,
          },
        };
      }
    }

    return {
      ok: true,
      context: {
        canonicalId: id,
        symbol: project.symbol || null,
        name: project.name || null,
        cmcId: String(cmcId),
        cmcSlug: cmcSlug || null,
        format: this.format,
      },
    };
  }
}

module.exports = {
  MarketResolver,
  loadProjectsDataset,
  loadTokenIndexDataset,
  indexProjects,
  indexTokenIndex,
  detectDatasetFormat,
};
