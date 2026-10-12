import fs from 'node:fs/promises';

// Owner-approved V7 application trigger: 2026-10-12.
const INDEX_PATH = 'public/data/intelligence/token-index.json';
const REPORT_PATH = 'reports/cmc-reconcile-stage5b.json';

const EXPECTED_TOTAL = 354;
const EXPECTED_MAPPED = 323;
const EXPECTED_UNMAPPED = 31;

const APPROVED_REMAPS = [
  {
    canonical_id: 'casper-network',
    symbol: 'CSPR',
    before: { cmcId: '10784', cmcSlug: 'casper-network' },
    after: { cmcId: '5899', cmcSlug: 'casper' },
  },
  {
    canonical_id: 'morpheusai',
    symbol: 'MOR',
    before: { cmcId: '26712', cmcSlug: 'morpheusai' },
    after: { cmcId: '31656', cmcSlug: 'morpheus' },
  },
  {
    canonical_id: 'drift-protocol',
    symbol: 'DRIFT',
    before: { cmcId: '27962', cmcSlug: 'drift-protocol' },
    after: { cmcId: '31278', cmcSlug: 'drift' },
  },
  {
    canonical_id: 'cess',
    symbol: 'CESS',
    before: { cmcId: '20810', cmcSlug: 'cess' },
    after: { cmcId: '36957', cmcSlug: 'cess-network' },
  },
  {
    canonical_id: 'nodle-network',
    symbol: 'NODL',
    before: { cmcId: '16506', cmcSlug: 'nodle-network' },
    after: { cmcId: '6837', cmcSlug: 'nodleiot' },
  },
];

function isMapped(record) {
  return Boolean(record && record.cmcId !== undefined && record.cmcId !== null && String(record.cmcId).trim() !== '');
}

function assertBaseline(records) {
  const mapped = records.filter(isMapped);
  const unmapped = records.length - mapped.length;
  if (records.length !== EXPECTED_TOTAL) throw new Error(`INVARIANT_TOTAL:${records.length}`);
  if (mapped.length !== EXPECTED_MAPPED) throw new Error(`INVARIANT_MAPPED:${mapped.length}`);
  if (unmapped !== EXPECTED_UNMAPPED) throw new Error(`INVARIANT_UNMAPPED:${unmapped}`);

  const ipfs = records.find((r) => r?.id === 'ipfs');
  if (!ipfs || isMapped(ipfs) || ipfs.cmcSlug !== undefined) throw new Error('INVARIANT_IPFS_MAPPING');

  const ids = mapped.map((r) => String(r.cmcId));
  const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
  if (dupes.length) throw new Error(`INVARIANT_DUPLICATE_CMC_IDS:${dupes.join(',')}`);
}

async function main() {
  const dataset = JSON.parse(await fs.readFile(INDEX_PATH, 'utf8'));
  const records = Array.isArray(dataset.records) ? dataset.records : [];
  assertBaseline(records);

  const changes = [];
  const alreadyApplied = [];

  for (const remap of APPROVED_REMAPS) {
    const record = records.find((r) => r?.id === remap.canonical_id);
    if (!record) throw new Error(`MISSING_CANONICAL:${remap.canonical_id}`);
    if (String(record.symbol || '').toUpperCase() !== remap.symbol) {
      throw new Error(`SYMBOL_MISMATCH:${remap.canonical_id}:${record.symbol}`);
    }

    const currentId = String(record.cmcId ?? '');
    const currentSlug = record.cmcSlug ?? null;

    if (currentId === remap.after.cmcId && currentSlug === remap.after.cmcSlug) {
      alreadyApplied.push(remap.canonical_id);
      continue;
    }

    if (currentId !== remap.before.cmcId || currentSlug !== remap.before.cmcSlug) {
      throw new Error(`UNEXPECTED_CURRENT_MAPPING:${remap.canonical_id}:${currentId}:${currentSlug}`);
    }

    const targetOwner = records.find((r) => r?.id !== remap.canonical_id && isMapped(r) && String(r.cmcId) === remap.after.cmcId);
    if (targetOwner) {
      throw new Error(`TARGET_CMC_ID_ALREADY_OWNED:${remap.canonical_id}:${remap.after.cmcId}:${targetOwner.id}`);
    }

    record.cmcId = remap.after.cmcId;
    record.cmcSlug = remap.after.cmcSlug;
    changes.push(remap);
  }

  assertBaseline(records);

  const report = {
    ok: true,
    mode: 'approved_v7_collision_guard_remaps_only',
    generated_at: new Date().toISOString(),
    counts: {
      total: records.length,
      mapped: records.filter(isMapped).length,
      unmapped: records.length - records.filter(isMapped).length,
      changed: changes.length,
      already_applied: alreadyApplied.length,
      duplicate_cmc_ids: 0,
    },
    changes,
    already_applied: alreadyApplied,
  };

  await fs.mkdir('reports', { recursive: true });
  await fs.writeFile(INDEX_PATH, `${JSON.stringify(dataset, null, 2)}\n`, 'utf8');
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report.counts));
}

main().catch((err) => {
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
