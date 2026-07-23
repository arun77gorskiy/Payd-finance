/* =================================================================
   PAYD Intelligence V2 — Reasoning Engine (Main)
   ----------------------------------------------------------------
   Главный модуль, объединяющий snapshot, change detection,
   score deltas, recommendation logic и catalysts.
   Генерирует полную историю рассуждений AI.
   ================================================================= */

const fs = require('fs');
const path = require('path');
const { createSnapshot, getLatestSnapshot, getPreviousSnapshot, getAllSnapshots } = require('./snapshot_manager');
const { compareProjects, detectEvents } = require('./change_detector');
const { deltaAnalysis } = require('./score_delta');
const { getRecommendation, detectRecommendationChange } = require('./recommendation');
const { detectCatalysts } = require('./catalyst_tracker');

const DATA_DIR = '/workspace/public/data';
const ENRICHED_FILE = path.join(DATA_DIR, 'projects_enriched.json');
const AI_FILE = path.join(DATA_DIR, 'projects_ai_analyzed.json');
const HISTORY_DIR = path.join(DATA_DIR, 'history');
const OUTPUT_FILE = path.join(DATA_DIR, 'projects_reasoning.json');
const TIMELINE_FILE = path.join(DATA_DIR, 'projects_timeline.json');

if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });

function buildReasoningForProject(prevProj, currProj, prevAI, currAI, projectsMeta) {
    const id = currProj.id || Object.keys(currProj)[0];
    const sector = projectsMeta?.sector || currProj.sector;

    // 1. Field-level changes
    const changes = compareProjects(prevProj, currProj);

    // 2. High-level events
    const events = detectEvents(changes);

    // 3. Score deltas with contributors
    const scoreDeltas = deltaAnalysis(prevAI?.scores, currAI?.scores, prevProj, currProj);

    // 4. Recommendation change
    const recChange = detectRecommendationChange(prevAI?.scores, currAI?.scores);

    // 5. Current recommendation
    const currentRec = getRecommendation(currAI?.scores);

    // 6. Catalysts (future events)
    const catalysts = detectCatalysts(currProj, sector);

    // 7. AI opinion text (why AI changed mind)
    const opinionChange = buildOpinionChange(scoreDeltas, recChange, events, changes);

    return {
        changes,
        events,
        score_deltas: scoreDeltas,
        recommendation: currentRec,
        recommendation_change: recChange,
        catalysts,
        opinion_change: opinionChange,
    };
}

function buildOpinionChange(scoreDeltas, recChange, events, changes) {
    const parts = [];

    // Recommendation change
    if (recChange && recChange.changed) {
        parts.push({
            aspect: 'Recommendation',
            previous: recChange.previous.tier,
            current: recChange.current.tier,
            direction: recChange.direction,
            reasoning: recChange.current.reasoning,
        });
    }

    // Score changes summary
    const scoreChanges = [];
    for (const [key, delta] of Object.entries(scoreDeltas)) {
        if (Math.abs(delta.delta) >= 3) {
            scoreChanges.push({
                score: key,
                previous: delta.previous,
                current: delta.current,
                delta: delta.delta,
                positive_count: delta.contributors?.positive?.length || 0,
                negative_count: delta.contributors?.negative?.length || 0,
            });
        }
    }

    if (scoreChanges.length > 0) {
        parts.push({
            aspect: 'Scores',
            changes: scoreChanges,
            reasoning: scoreChanges.map(sc =>
                `${sc.score}: ${sc.previous} → ${sc.current} (${sc.delta > 0 ? '+' : ''}${sc.delta})`
            ).join('; '),
        });
    }

    // Key events
    const positiveEvents = events.filter(e => e.sentiment === 'positive');
    const negativeEvents = events.filter(e => e.sentiment === 'negative');

    if (positiveEvents.length > 0 || negativeEvents.length > 0) {
        parts.push({
            aspect: 'Key Events',
            positive: positiveEvents.map(e => `${e.type}: ${e.evidence}`),
            negative: negativeEvents.map(e => `${e.type}: ${e.evidence}`),
        });
    }

    return {
        changed: recChange?.changed || scoreChanges.length > 0 || events.length > 0,
        summary: parts.length > 0
            ? parts.map(p => p.reasoning || p.summary).join(' | ')
            : 'No significant changes detected.',
        details: parts,
    };
}

function runReasoning() {
    console.log('\n═══ AI Reasoning History & Change Explanation Engine ═══\n');

    // 1. Create new snapshot
    console.log('Step 1: Creating snapshot...');
    let snapshotResult;
    try {
        snapshotResult = createSnapshot(ENRICHED_FILE, AI_FILE);
        console.log(`  ✓ Snapshot created: ${snapshotResult.snapshot_id}`);
    } catch (e) {
        console.error(`  ✗ Failed to create snapshot: ${e.message}`);
        return null;
    }

    const currentSnapshot = snapshotResult.snapshot;
    const previousSnapshotMeta = getPreviousSnapshot();

    if (!previousSnapshotMeta) {
        console.log('  ℹ No previous snapshot found — this is the baseline.');
        // Still build initial reasoning (no comparisons)
        const initialReasoning = buildInitialReasoning(currentSnapshot);
        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(initialReasoning, null, 2));
        console.log(`  ✓ Initial reasoning written to ${OUTPUT_FILE}`);
        return initialReasoning;
    }

    const previousSnapshot = previousSnapshotMeta.snapshot;
    console.log(`  ✓ Comparing against previous snapshot: ${previousSnapshotMeta.snapshot_id}`);
    console.log(`    Previous: ${previousSnapshotMeta.created_at}`);
    console.log(`    Current:  ${snapshotResult.snapshot_id}`);

    // 2. Compare snapshots per project
    console.log('\nStep 2: Comparing projects...');
    const reasoningResults = {};
    let compared = 0, changed = 0;

    const projectIds = Object.keys(currentSnapshot.data);
    for (const id of projectIds) {
        const currProj = currentSnapshot.data[id];
        const prevProj = previousSnapshot.data?.[id];
        const currAI = currentSnapshot.ai_analysis?.[id];
        const prevAI = previousSnapshot.ai_analysis?.[id];

        if (!currProj) continue;

        if (!prevProj) {
            reasoningResults[id] = {
                snapshot_id: snapshotResult.snapshot_id,
                status: 'new_project',
                _project_meta: { id: currProj.id, name: currProj.name, symbol: currProj.symbol, sector: currProj.sector },
            };
            continue;
        }

        const reasoning = buildReasoningForProject(prevProj, currProj, prevAI, currAI, currProj);
        reasoning.snapshot_id = snapshotResult.snapshot_id;
        reasoning.previous_snapshot_id = previousSnapshotMeta.snapshot_id;
        reasoning._project_meta = { id: currProj.id, name: currProj.name, symbol: currProj.symbol, sector: currProj.sector };

        if (reasoning.opinion_change.changed) changed++;
        compared++;
        reasoningResults[id] = reasoning;
    }

    console.log(`  ✓ Compared ${compared} projects, ${changed} with opinion changes`);

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(reasoningResults, null, 2));
    console.log(`  ✓ Reasoning data written to ${OUTPUT_FILE}`);

    // 3. Build timeline
    console.log('\nStep 3: Building timeline...');
    const timeline = buildTimeline();
    fs.writeFileSync(TIMELINE_FILE, JSON.stringify(timeline, null, 2));
    console.log(`  ✓ Timeline written to ${TIMELINE_FILE}`);

    // 4. Generate change summary report
    console.log('\nStep 4: Generating change summary...');
    const summary = generateSummary(reasoningResults);
    console.log(`  Projects with opinion changes: ${summary.opinion_changes}`);
    console.log(`  Projects with score improvements: ${summary.improved}`);
    console.log(`  Projects with score declines: ${summary.declined}`);
    console.log(`  Projects with new recommendation: ${summary.new_recommendation}`);
    console.log(`  Total catalysts detected: ${summary.total_catalysts}`);

    return {
        snapshot_id: snapshotResult.snapshot_id,
        reasoning: reasoningResults,
        timeline,
        summary,
    };
}

function buildInitialReasoning(snapshot) {
    const results = {};
    for (const [id, proj] of Object.entries(snapshot.data)) {
        const ai = snapshot.ai_analysis?.[id];
        const rec = getRecommendation(ai?.scores);
        const catalysts = detectCatalysts(proj, proj.sector);

        results[id] = {
            snapshot_id: snapshot.snapshot_id,
            status: 'baseline',
            _project_meta: { id: proj.id, name: proj.name, symbol: proj.symbol, sector: proj.sector },
            recommendation: rec,
            catalysts,
            opinion_change: {
                changed: false,
                summary: 'Baseline snapshot — no comparison available.',
            },
        };
    }
    return results;
}

function buildTimeline() {
    const allSnapshots = getAllSnapshots();
    if (allSnapshots.length === 0) return {};

    const timeline = {};

    // For each snapshot, build per-project timeline entry
    for (const snapMeta of allSnapshots) {
        try {
            const snap = JSON.parse(fs.readFileSync(snapMeta.file, 'utf8'));
            for (const [id, proj] of Object.entries(snap.data || {})) {
                if (!timeline[id]) {
                    timeline[id] = {
                        project_id: id,
                        project_name: proj.name,
                        project_symbol: proj.symbol,
                        project_sector: proj.sector,
                        snapshots: [],
                    };
                }
                const ai = snap.ai_analysis?.[id];
                timeline[id].snapshots.push({
                    snapshot_id: snapMeta.snapshot_id,
                    date: snapMeta.created_at,
                    scores: ai?.scores || null,
                    confidence: ai?.scores?.confidence?.value || null,
                    recommendation: ai ? getRecommendation(ai.scores).tier : null,
                    key_factors: ai ? extractKeyFactors(proj, ai) : [],
                    data_completeness: ai?.meta?.data_completeness || null,
                });
            }
        } catch (e) {
            console.error(`  ⚠ Could not read snapshot ${snapMeta.snapshot_id}: ${e.message}`);
        }
    }

    return timeline;
}

function extractKeyFactors(proj, ai) {
    const factors = [];
    if (proj.market?.market_cap_usd > 1e9) factors.push('Large market cap');
    if (proj.protocol?.tvl_usd > 1e8) factors.push('Significant TVL');
    if ((proj.github?.commits_30d || 0) > 50) factors.push('Active development');
    if (proj.protocol?.chains?.length >= 5) factors.push('Multi-chain');
    if ((proj.social?.twitter_followers || 0) > 50000) factors.push('Large community');
    return factors;
}

function generateSummary(reasoningResults) {
    let opinion_changes = 0, improved = 0, declined = 0;
    let new_recommendation = 0;
    let total_catalysts = 0;
    let confidence_improved = 0, confidence_declined = 0;

    for (const r of Object.values(reasoningResults)) {
        if (r.opinion_change?.changed) opinion_changes++;
        if (r.recommendation_change?.changed) new_recommendation++;

        if (r.score_deltas?.payd) {
            if (r.score_deltas.payd.delta > 0) improved++;
            else if (r.score_deltas.payd.delta < 0) declined++;
        }

        if (r.score_deltas?.confidence) {
            if (r.score_deltas.confidence.delta > 0) confidence_improved++;
            else if (r.score_deltas.confidence.delta < 0) confidence_declined++;
        }

        total_catalysts += r.catalysts?.length || 0;
    }

    return {
        opinion_changes,
        improved,
        declined,
        new_recommendation,
        total_catalysts,
        confidence_improved,
        confidence_declined,
    };
}

module.exports = { runReasoning, buildReasoningForProject };

// CLI mode - execute when run directly OR via wrapper
if (require.main === module || (process.argv[1] && (process.argv[1].includes('reasoning_engine') || process.argv[1].includes('run_reasoning')))) {
    runReasoning();
}