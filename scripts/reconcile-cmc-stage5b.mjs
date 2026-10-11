import fs from 'node:fs/promises';

const INDEX_PATH = 'public/data/intelligence/token-index.json';
const REPORT_PATH = 'reports/cmc-reconcile-stage5b.json';
const PUBLIC_API = 'https://pro-api.coinmarketcap.com/public-api';
const QUOTE_BATCH = 90;
const SYMBOL_BATCH = 45;
const RETRIES = 3;

const mandatoryIds = new Set([
  'bitcoin',
  'ethereum',
  'chainlink',
  'ondo-finance',
  'bittensor',
  'aave',
  'decentraland',
]);

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function norm(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '');
}

function finitePrice(asset) {
  const price = asset?.quote?.USD?.price;
  return price !== null && price !== undefined && Number.isFinite(Number(price)) && Number(price) >= 0;
}

function tokenOverlap(a, b) {
  const aa = String(a ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const bb = String(b ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (!aa.length || !bb.length) return 0;
  const A = new Set(aa);
  const B = new Set(bb);
  let common = 0;
  for (const x of A) if (B.has(x)) common += 1;
  return common / Math.max(A.size, B.size);
}

function nameScore(record, candidate) {
  const rid = norm(record.id);
  const rname = norm(record.name);
  const rslug = norm(record.cmcSlug);
  const cslug = norm(candidate.slug);
  const cname = norm(candidate.name);

  let score = 0;
  const exactPairs = [
    [rid, cslug, 120],
    [rname, cslug, 110],
    [rid, cname, 105],
    [rname, cname, 100],
    [rslug, cslug, 95],
  ];
  for (const [a, b, pts] of exactPairs) {
    if (a && b && a === b) score = Math.max(score, pts);
  }

  const containsPairs = [
    [rid, cslug],
    [rname, cslug],
    [rid, cname],
    [rname, cname],
  ];
  for (const [a, b] of containsPairs) {
    if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) score = Math.max(score, 72);
  }

  const overlap = Math.max(
    tokenOverlap(record.id, candidate.slug),
    tokenOverlap(record.name, candidate.name),
    tokenOverlap(record.name, candidate.slug),
  );
  if (overlap >= 1) score = Math.max(score, 90);
  else if (overlap >= 0.67) score = Math.max(score, 70);
  else if (overlap >= 0.5) score = Math.max(score, 55);

  if (Number(candidate.is_active) === 1) score += 20;
  if (candidate.status === 'active') score += 10;
  const rank = Number(candidate.rank ?? candidate.cmc_rank);
  if (Number.isFinite(rank) && rank > 0) {
    if (rank <= 500) score += 10;
    else if (rank <= 2000) score += 5;
  }
  return score;
}

async function fetchJson(url) {
  let lastError;
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'PAYD-Stage5B-Reconciler/1.0',
        },
      });
      if (!res.ok) throw new Error(`HTTP_${res.status}:${(await res.text()).slice(0, 160)}`);
      const body = await res.json();
      if (body?.status && Number(body.status.error_code || 0) !== 0) {
        throw new Error(`CMC_${body.status.error_code}:${body.status.error_message || 'unknown'}`);
      }
      return body;
    } catch (err) {
      lastError = err;
      if (attempt < RETRIES) await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw lastError;
}

async function fetchQuotesByIds(ids) {
  const returned = new Map();
  for (const batch of chunk([...new Set(ids.map(String))], QUOTE_BATCH)) {
    if (!batch.length) continue;
    const url = new URL(`${PUBLIC_API}/v3/cryptocurrency/quotes/latest`);
    url.searchParams.set('id', batch.join(','));
    url.searchParams.set('convert', 'USD');
    const payload = await fetchJson(url);
    for (const [key, raw] of Object.entries(payload?.data || {})) {
      const assets = Array.isArray(raw) ? raw : [raw];
      for (const asset of assets) {
        if (!asset || typeof asset !== 'object') continue;
        returned.set(String(asset.id ?? key), asset);
      }
    }
  }
  return returned;
}

async function fetchMapBySymbols(symbols) {
  const bySymbol = new Map();
  const unique = [...new Set(symbols.map((s) => String(s || '').toUpperCase()).filter(Boolean))];
  for (const batch of chunk(unique, SYMBOL_BATCH)) {
    const url = new URL(`${PUBLIC_API}/v1/cryptocurrency/map`);
    url.searchParams.set('symbol', batch.join(','));
    url.searchParams.set('aux', 'is_active,status,first_historical_data,last_historical_data');
    const payload = await fetchJson(url);
    for (const asset of payload?.data || []) {
      if (!asset || typeof asset !== 'object') continue;
      const symbol = String(asset.symbol || '').toUpperCase();
      if (!symbol) continue;
      if (!bySymbol.has(symbol)) bySymbol.set(symbol, []);
      bySymbol.get(symbol).push(asset);
    }
  }
  return bySymbol;
}

function chooseCandidate(record, candidates) {
  const desiredSymbol = String(record.symbol || '').toUpperCase();
  const exactSymbol = candidates.filter((c) => String(c.symbol || '').toUpperCase() === desiredSymbol);
  const pool = exactSymbol.length ? exactSymbol : candidates;
  const scored = pool
    .map((candidate) => ({ candidate, score: nameScore(record, candidate) }))
    .sort((a, b) => b.score - a.score || Number(a.candidate.rank ?? 1e9) - Number(b.candidate.rank ?? 1e9));

  const best = scored[0];
  const second = scored[1];
  if (!best) return { status: 'NO_CANDIDATE', scored: [] };

  const active = Number(best.candidate.is_active) === 1 || best.candidate.status === 'active';
  const margin = second ? best.score - second.score : 999;
  const highConfidence = active && best.score >= 95 && margin >= 15;
  return {
    status: highConfidence ? 'HIGH_CONFIDENCE' : 'AMBIGUOUS',
    best,
    second: second || null,
    scored: scored.slice(0, 5),
  };
}

async function main() {
  const raw = await fs.readFile(INDEX_PATH, 'utf8');
  const dataset = JSON.parse(raw);
  const records = Array.isArray(dataset.records) ? dataset.records : [];
  const mapped = records.filter((r) => r && r.cmcId !== undefined && r.cmcId !== null && String(r.cmcId).trim() !== '');

  const existingQuotes = await fetchQuotesByIds(mapped.map((r) => r.cmcId));
  const changes = [];
  const unresolved = [];
  const invalidExisting = [];
  const needsCandidate = [];

  for (const record of mapped) {
    const current = existingQuotes.get(String(record.cmcId));
    if (!current) {
      needsCandidate.push({ record, reason: 'EXISTING_ID_NOT_RETURNED' });
      continue;
    }

    const sameSymbol = String(current.symbol || '').toUpperCase() === String(record.symbol || '').toUpperCase();
    const exactStoredSlug = Boolean(record.cmcSlug) && String(current.slug || '') === String(record.cmcSlug);

    if (sameSymbol || exactStoredSlug) {
      const before = { cmcId: String(record.cmcId), cmcSlug: record.cmcSlug || null, symbol: record.symbol || null };
      const after = { cmcId: String(current.id), cmcSlug: current.slug || null, symbol: current.symbol || record.symbol || null };
      const changed = before.cmcId !== after.cmcId || before.cmcSlug !== after.cmcSlug || before.symbol !== after.symbol;
      if (changed) {
        record.cmcId = after.cmcId;
        record.cmcSlug = after.cmcSlug;
        record.symbol = after.symbol;
        changes.push({ canonical_id: record.id, type: sameSymbol ? 'REFRESH_SLUG' : 'CONFIRMED_REBRAND', before, after });
      }
      if (!finitePrice(current)) invalidExisting.push({ canonical_id: record.id, cmcId: String(record.cmcId), symbol: record.symbol, slug: record.cmcSlug, reason: 'INVALID_CURRENT_PRICE' });
      continue;
    }

    needsCandidate.push({ record, reason: 'EXISTING_ID_IDENTITY_MISMATCH', returned: { id: current.id, symbol: current.symbol, slug: current.slug } });
  }

  const candidateMap = await fetchMapBySymbols(needsCandidate.map((x) => x.record.symbol));
  const proposed = [];

  for (const item of needsCandidate) {
    const record = item.record;
    const symbol = String(record.symbol || '').toUpperCase();
    const candidates = candidateMap.get(symbol) || [];
    const selection = chooseCandidate(record, candidates);
    if (selection.status !== 'HIGH_CONFIDENCE') {
      unresolved.push({
        canonical_id: record.id,
        symbol: record.symbol,
        current_cmc_id: record.cmcId ?? null,
        current_cmc_slug: record.cmcSlug ?? null,
        reason: item.reason,
        returned: item.returned || null,
        candidates: selection.scored.map((x) => ({ id: x.candidate.id, symbol: x.candidate.symbol, slug: x.candidate.slug, name: x.candidate.name, is_active: x.candidate.is_active, status: x.candidate.status, rank: x.candidate.rank, score: x.score })),
      });
      continue;
    }

    const c = selection.best.candidate;
    proposed.push({ record, candidate: c, score: selection.best.score, reason: item.reason });
  }

  const proposedQuotes = await fetchQuotesByIds(proposed.map((x) => x.candidate.id));
  for (const item of proposed) {
    const { record, candidate, score, reason } = item;
    const quote = proposedQuotes.get(String(candidate.id));
    if (!quote || !finitePrice(quote)) {
      unresolved.push({
        canonical_id: record.id,
        symbol: record.symbol,
        current_cmc_id: record.cmcId ?? null,
        current_cmc_slug: record.cmcSlug ?? null,
        reason: quote ? 'PROPOSED_ID_INVALID_PRICE' : 'PROPOSED_ID_NO_QUOTE',
        proposed: { id: candidate.id, symbol: candidate.symbol, slug: candidate.slug, name: candidate.name, score },
      });
      continue;
    }

    const before = { cmcId: String(record.cmcId), cmcSlug: record.cmcSlug || null, symbol: record.symbol || null };
    const after = { cmcId: String(candidate.id), cmcSlug: candidate.slug || null, symbol: candidate.symbol || record.symbol || null };
    record.cmcId = after.cmcId;
    record.cmcSlug = after.cmcSlug;
    record.symbol = after.symbol;
    changes.push({ canonical_id: record.id, type: 'REMAP_HIGH_CONFIDENCE', reason, score, before, after });
  }

  // Hard invariants: canonical dataset size stays fixed and IPFS must remain unmapped.
  const ipfs = records.find((r) => r?.id === 'ipfs');
  if (ipfs) {
    delete ipfs.cmcId;
    delete ipfs.cmcSlug;
  }

  const mappedAfter = records.filter((r) => r && r.cmcId !== undefined && r.cmcId !== null && String(r.cmcId).trim() !== '');
  const mandatory = records
    .filter((r) => mandatoryIds.has(r.id))
    .map((r) => ({ canonical_id: r.id, symbol: r.symbol, cmcId: r.cmcId ?? null, cmcSlug: r.cmcSlug ?? null }));

  if (records.length !== 354) throw new Error(`INVARIANT_TOTAL:${records.length}`);
  if (mappedAfter.length !== 323) throw new Error(`INVARIANT_MAPPED:${mappedAfter.length}`);
  if (!ipfs || ipfs.cmcId !== undefined || ipfs.cmcSlug !== undefined) throw new Error('INVARIANT_IPFS_MAPPING');
  if (mandatory.length !== mandatoryIds.size || mandatory.some((x) => !x.cmcId)) throw new Error('INVARIANT_MANDATORY_MAPPING');

  const cmcIds = mappedAfter.map((r) => String(r.cmcId));
  const duplicateIds = [...new Set(cmcIds.filter((id, i) => cmcIds.indexOf(id) !== i))];
  if (duplicateIds.length) {
    // Do not write a potentially contaminated index; report and fail instead.
    throw new Error(`INVARIANT_DUPLICATE_CMC_IDS:${duplicateIds.join(',')}`);
  }

  dataset.generated_at = new Date().toISOString();
  dataset.source = 'PAYD canonical + CoinMarketCap high-confidence Stage5B reconciliation';

  await fs.mkdir('reports', { recursive: true });
  const report = {
    ok: true,
    generated_at: new Date().toISOString(),
    mode: 'high_confidence_only',
    counts: {
      total: records.length,
      mapped_before: mapped.length,
      mapped_after: mappedAfter.length,
      changed: changes.length,
      unresolved: unresolved.length,
      invalid_existing_price: invalidExisting.length,
      duplicate_cmc_ids: duplicateIds.length,
    },
    mandatory,
    changes,
    unresolved,
    invalid_existing_price: invalidExisting,
  };

  await fs.writeFile(INDEX_PATH, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report.counts));
}

main().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
