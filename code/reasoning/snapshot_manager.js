/* =================================================================
   PAYD Intelligence V2 — Snapshot Manager
   ----------------------------------------------------------------
   Создаёт и управляет историческими снимками обогащённых данных.
   Каждый успешный enrichment создаёт новый snapshot.
   ================================================================= */

const fs = require('fs');
const path = require('path');

const HISTORY_DIR = '/workspace/public/data/history';
const SNAPSHOT_INDEX = path.join(HISTORY_DIR, '_snapshot_index.json');

if (!fs.existsSync(HISTORY_DIR)) {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

function loadIndex() {
    if (!fs.existsSync(SNAPSHOT_INDEX)) return { snapshots: [] };
    try {
        return JSON.parse(fs.readFileSync(SNAPSHOT_INDEX, 'utf8'));
    } catch {
        return { snapshots: [] };
    }
}

function saveIndex(idx) {
    fs.writeFileSync(SNAPSHOT_INDEX, JSON.stringify(idx, null, 2));
}

function generateSnapshotId() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

// Create new snapshot from enriched file
function createSnapshot(enrichedFile, aiAnalysisFile) {
    const enriched = JSON.parse(fs.readFileSync(enrichedFile, 'utf8'));
    const aiAnalysis = fs.existsSync(aiAnalysisFile)
        ? JSON.parse(fs.readFileSync(aiAnalysisFile, 'utf8'))
        : {};

    const snapshotId = generateSnapshotId();
    const snapshotFile = path.join(HISTORY_DIR, `snapshot_${snapshotId}.json`);

    // Compute aggregate stats
    const projects = Object.values(enriched);
    let totalFields = 0;
    let presentFields = 0;
    let totalTVL = 0;
    let totalMarketCap = 0;

    for (const p of projects) {
        const fields = ['price_usd', 'market_cap_usd', 'fdv_usd', 'volume_24h_usd',
            'circulating_supply', 'total_supply', 'max_supply',
            'twitter_followers', 'stars', 'commits_30d', 'tvl_usd'];
        for (const f of fields) {
            totalFields++;
            const paths = {
                'price_usd': p.market?.price_usd,
                'market_cap_usd': p.market?.market_cap_usd,
                'fdv_usd': p.market?.fdv_usd,
                'volume_24h_usd': p.market?.volume_24h_usd,
                'circulating_supply': p.market?.circulating_supply,
                'total_supply': p.market?.total_supply,
                'max_supply': p.market?.max_supply,
                'twitter_followers': p.social?.twitter_followers,
                'stars': p.github?.stars ?? p.developer?.stars,
                'commits_30d': p.github?.commits_30d,
                'tvl_usd': p.protocol?.tvl_usd,
            };
            if (paths[f] != null) presentFields++;
        }
        totalTVL += p.protocol?.tvl_usd || 0;
        totalMarketCap += p.market?.market_cap_usd || 0;
    }

    const snapshot = {
        snapshot_id: snapshotId,
        created_at: new Date().toISOString(),
        projects_count: projects.length,
        data_completeness: totalFields > 0 ? presentFields / totalFields : 0,
        aggregate_stats: {
            total_tvl_usd: totalTVL,
            total_market_cap_usd: totalMarketCap,
            avg_payd_score: computeAvgScore(aiAnalysis, 'payd'),
            avg_risk_score: computeAvgScore(aiAnalysis, 'risk'),
            avg_confidence: computeAvgScore(aiAnalysis, 'confidence'),
        },
        source_files: {
            enriched: enrichedFile,
            ai_analysis: aiAnalysisFile,
        },
        data: enriched,
        ai_analysis: aiAnalysis,
    };

    fs.writeFileSync(snapshotFile, JSON.stringify(snapshot));

    const idx = loadIndex();
    idx.snapshots.push({
        snapshot_id: snapshotId,
        created_at: snapshot.created_at,
        file: snapshotFile,
        projects_count: snapshot.projects_count,
        data_completeness: snapshot.data_completeness,
        aggregate_stats: snapshot.aggregate_stats,
    });
    saveIndex(idx);

    return { snapshot_id: snapshotId, file: snapshotFile, snapshot };
}

function computeAvgScore(aiAnalysis, scoreKey) {
    const values = Object.values(aiAnalysis)
        .map(a => a?.scores?.[scoreKey]?.value)
        .filter(v => typeof v === 'number' && !isNaN(v));
    if (values.length === 0) return null;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

// Get latest snapshot
function getLatestSnapshot() {
    const idx = loadIndex();
    if (idx.snapshots.length === 0) return null;
    const latest = idx.snapshots[idx.snapshots.length - 1];
    try {
        const snapshot = JSON.parse(fs.readFileSync(latest.file, 'utf8'));
        return { ...latest, snapshot };
    } catch {
        return null;
    }
}

// Get previous snapshot (second to last)
function getPreviousSnapshot() {
    const idx = loadIndex();
    if (idx.snapshots.length < 2) return null;
    const prev = idx.snapshots[idx.snapshots.length - 2];
    try {
        const snapshot = JSON.parse(fs.readFileSync(prev.file, 'utf8'));
        return { ...prev, snapshot };
    } catch {
        return null;
    }
}

// Get all snapshots
function getAllSnapshots() {
    const idx = loadIndex();
    return idx.snapshots;
}

module.exports = {
    createSnapshot,
    getLatestSnapshot,
    getPreviousSnapshot,
    getAllSnapshots,
    loadIndex,
    HISTORY_DIR,
};