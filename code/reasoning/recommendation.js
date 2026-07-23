/* =================================================================
   PAYD Intelligence V2 — Recommendation Logic
   ----------------------------------------------------------------
   Переводит AI Scores в инвестиционные рекомендации.
   Детектирует изменения рекомендаций с объяснением.
   ================================================================= */

// Recommendation tiers based on Payd + Risk + Conviction scores
function getRecommendation(scores) {
    // Defensive guard: scores can be undefined if AI analysis is missing
    // for a given project (e.g., first snapshot, or incomplete pipeline step)
    if (!scores || typeof scores !== 'object') {
        return {
            tier: 'Insufficient Data',
            short: 'INSUFFICIENT',
            color: 'gray',
            reasoning: 'No AI analysis available to form recommendation.',
        };
    }

    const payd = scores.payd?.value;
    const risk = scores.risk?.value ?? 50;
    const conviction = scores.conviction?.value ?? 50;
    const confidence = scores.confidence?.value ?? 0;

    // Insufficient data
    if (payd == null || confidence < 30) {
        return {
            tier: 'Insufficient Data',
            short: 'INSUFFICIENT',
            color: 'gray',
            reasoning: 'Insufficient data or low confidence to form recommendation.',
        };
    }

    // Strong Buy: Payd >= 75, Risk < 50, Conviction >= 60
    if (payd >= 75 && risk < 50 && conviction >= 60) {
        return {
            tier: 'Strong Buy',
            short: 'STRONG_BUY',
            color: 'green',
            reasoning: `Payd ${payd}, low risk (${risk}), strong conviction (${conviction}).`,
        };
    }

    // Watch Closely: Payd >= 70 with acceptable risk
    if (payd >= 70 && risk < 60) {
        return {
            tier: 'Watch Closely',
            short: 'WATCH_CLOSELY',
            color: 'blue',
            reasoning: `Payd ${payd} with manageable risk (${risk}).`,
        };
    }

    // Accumulation: Payd >= 60
    if (payd >= 60 && risk < 65) {
        return {
            tier: 'Accumulation',
            short: 'ACCUMULATION',
            color: 'cyan',
            reasoning: `Payd ${payd} supports gradual accumulation within risk limits (${risk}).`,
        };
    }

    // Hold: Payd >= 50
    if (payd >= 50) {
        return {
            tier: 'Hold',
            short: 'HOLD',
            color: 'yellow',
            reasoning: `Payd ${payd} justifies holding current position (risk: ${risk}).`,
        };
    }

    // Watchlist: Payd >= 40
    if (payd >= 40) {
        return {
            tier: 'Watchlist',
            short: 'WATCHLIST',
            color: 'orange',
            reasoning: `Payd ${payd} warrants monitoring for improving fundamentals (risk: ${risk}).`,
        };
    }

    // Avoid: Payd < 40 or Risk >= 75
    if (risk >= 75) {
        return {
            tier: 'Avoid',
            short: 'AVOID',
            color: 'red',
            reasoning: `Elevated risk profile (${risk}) outweighs opportunity.`,
        };
    }

    return {
        tier: 'Avoid',
        short: 'AVOID',
        color: 'red',
        reasoning: `Below-average metrics (Payd ${payd}, risk ${risk}).`,
    };
}

// Detect recommendation change
function detectRecommendationChange(prevScores, currScores) {
    // Both score objects must exist to compare recommendations
    if (!prevScores || !currScores) return null;

    const prevRec = getRecommendation(prevScores);
    const currRec = getRecommendation(currScores);

    if (!prevRec || !currRec) return null;
    if (prevRec.short === currRec.short) return null;

    return {
        previous: prevRec,
        current: currRec,
        changed: true,
        from_tier: prevRec.tier,
        to_tier: currRec.tier,
        direction: getChangeDirection(prevRec.short, currRec.short),
    };
}

function getChangeDirection(from, to) {
    const tiers = {
        'STRONG_BUY': 6, 'WATCH_CLOSELY': 5, 'ACCUMULATION': 4,
        'HOLD': 3, 'WATCHLIST': 2, 'AVOID': 1, 'INSUFFICIENT': 0,
    };
    const fromLevel = tiers[from] ?? 0;
    const toLevel = tiers[to] ?? 0;
    if (toLevel > fromLevel) return 'upgrade';
    if (toLevel < fromLevel) return 'downgrade';
    return 'lateral';
}

module.exports = {
    getRecommendation,
    detectRecommendationChange,
};