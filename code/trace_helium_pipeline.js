/* =================================================================
   HELIUM END-TO-END PIPELINE TRACER
   ----------------------------------------------------------------
   Трассировка данных Helium через ВСЕ слои pipeline:
   1. projects.json (raw)
   2. projects_enriched.json (enrichment)
   3. projects_ai_analyzed.json (AI layer)
   4. projects_reasoning.json
   5. public/data/projects.json
   6. public/data/intelligence/projects/helium.json (V2)

   Для каждой стадии: project_id, coingeckoId, defillama_slug,
   githubRepo, field_count, non-null field count.
   ================================================================= */

const fs = require('fs');
const path = require('path');

const FILES_TO_TRACE = [
    { name: 'data/projects.json (root)',             path: '/workspace/data/projects.json' },
    { name: 'public/data/projects.json (deployed)',  path: '/workspace/public/data/projects.json' },
    { name: 'public/data/projects_enriched.json',    path: '/workspace/public/data/projects_enriched.json' },
    { name: 'public/data/projects_ai_analyzed.json', path: '/workspace/public/data/projects_ai_analyzed.json' },
    { name: 'public/data/projects_reasoning.json',   path: '/workspace/public/data/projects_reasoning.json' },
    { name: 'public/data/projects_timeline.json',    path: '/workspace/public/data/projects_timeline.json' },
    { name: 'public/data/intelligence/projects/helium.json (V2)', path: '/workspace/public/data/intelligence/projects/helium.json' },
];

function findHelium(data, sourceName) {
    let results = [];
    if (Array.isArray(data)) {
        for (const item of data) {
            if (item && typeof item === 'object') {
                if ((item.id === 'helium' || item.symbol === 'HNT' || item.coingeckoId === 'helium' || item.canonical_name === 'Helium')) {
                    results.push(item);
                }
            }
        }
    } else if (data && typeof data === 'object') {
        for (const [k, v] of Object.entries(data)) {
            if (k === 'helium' || k === 'HNT') {
                results.push(v);
            } else if (v && typeof v === 'object') {
                results.push(...findHelium(v, sourceName + '.' + k));
            }
        }
    }
    return results;
}

function countFields(obj, prefix = '') {
    let total = 0, nonNull = 0;
    const leafMetrics = [];
    function walk(o, p) {
        if (o === null || o === undefined) return;
        if (typeof o !== 'object') {
            total++;
            if (o !== null && o !== undefined && o !== '') nonNull++;
            leafMetrics.push({ field: p, value: o });
            return;
        }
        if (Array.isArray(o)) {
            if (o.length === 0) {
                total++;
                return;
            }
            // Treat as a leaf
            total++;
            nonNull++;
            leafMetrics.push({ field: p, value: o });
            return;
        }
        for (const [k, v] of Object.entries(o)) {
            if (v && typeof v === 'object' && !Array.isArray(v) && 'value' in v) {
                // metric envelope
                total++;
                if (v.value !== null && v.value !== undefined) nonNull++;
                leafMetrics.push({ field: p + k, value: v.value, source: v.source, reason: v.reason });
            } else {
                walk(v, p + k + '.');
            }
        }
    }
    walk(obj, prefix);
    return { total, nonNull, leafMetrics };
}

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║  HELIUM END-TO-END PIPELINE TRACE                        ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');

for (const file of FILES_TO_TRACE) {
    console.log(`\n━━━━━ ${file.name} ━━━━━`);
    if (!fs.existsSync(file.path)) {
        console.log(`  ✗ FILE NOT FOUND: ${file.path}`);
        continue;
    }
    let data;
    try {
        data = JSON.parse(fs.readFileSync(file.path, 'utf-8'));
    } catch (e) {
        console.log(`  ✗ JSON PARSE ERROR: ${e.message}`);
        continue;
    }

    const heliumRecords = findHelium(data, file.name);
    if (heliumRecords.length === 0) {
        console.log(`  ⚠ Helium not found in this file`);
        continue;
    }
    if (heliumRecords.length > 1) {
        console.log(`  ⚠ Multiple Helium records found: ${heliumRecords.length}`);
    }

    const h = heliumRecords[0];
    const { total, nonNull, leafMetrics } = countFields(h);

    console.log(`  File:           ${file.path}`);
    console.log(`  project_id:     ${h.id || h.project_id || h.canonical_name || '—'}`);
    console.log(`  symbol:         ${h.symbol || '—'}`);
    console.log(`  coingeckoId:    ${h.coingeckoId || h.coingecko_id || (h.identifiers?.coingecko?.id) || '—'}`);
    console.log(`  defillama_slug: ${h.defillama_slug || h.defillamaProtocol || h.defillama_protocol_id || (h.identifiers?.defillama_protocol?.id) || '—'}`);
    console.log(`  githubRepo:     ${h.githubRepo || h.githubOrg || (h.identifiers?.github_org?.id) || '—'}`);
    console.log(`  sector:         ${h.sector || '—'}`);
    console.log(`  entity_types:   ${(h.entity_types || []).join(', ') || '—'}`);
    console.log(`  Total fields:   ${total}`);
    console.log(`  Non-null fields: ${nonNull}`);
    console.log(`  Coverage:        ${total > 0 ? Math.round((nonNull / total) * 100) : 0}%`);
}
