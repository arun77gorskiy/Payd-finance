/* =================================================================
   PAYD Intelligence V2 — Score Delta Analyzer
   ----------------------------------------------------------------
   Сравнивает скоры между двумя snapshot'ами.
   Для каждого delta вычисляет positive/negative contributors с весами.
   ================================================================= */

function deltaAnalysis(prevScores, currScores, prevProj, currProj) {
    const result = {};

    if (!prevScores || !currScores) {
        return result;
    }

    const scoreKeys = ['payd', 'risk', 'conviction', 'alpha', 'confidence'];

    for (const key of scoreKeys) {
        const prevVal = prevScores[key]?.value;
        const currVal = currScores[key]?.value;

        if (typeof prevVal !== 'number' || typeof currVal !== 'number') continue;

        const delta = currVal - prevVal;
        if (Math.abs(delta) < 1) continue; // Skip negligible

        result[key] = {
            previous: prevVal,
            current: currVal,
            delta: delta,
            delta_pct: prevVal !== 0 ? (delta / prevVal) * 100 : null,
            direction: delta > 0 ? 'up' : 'down',
        };

        // Generate contributors (factors that likely caused the change)
        if (key === 'payd') {
            result[key].contributors = explainPaydDelta(prevProj, currProj);
        } else if (key === 'risk') {
            result[key].contributors = explainRiskDelta(prevProj, currProj);
        } else if (key === 'conviction') {
            result[key].contributors = explainConvictionDelta(prevProj, currProj);
        } else if (key === 'alpha') {
            result[key].contributors = explainAlphaDelta(prevProj, currProj);
        } else if (key === 'confidence') {
            result[key].contributors = explainConfidenceDelta(prevProj, currProj);
        }
    }

    return result;
}

function explainPaydDelta(prev, curr) {
    const positive = [];
    const negative = [];

    // TVL impact
    const tvlDelta = (curr?.protocol?.tvl_usd || 0) - (prev?.protocol?.tvl_usd || 0);
    if (tvlDelta !== 0) {
        const pct = prev?.protocol?.tvl_usd ? (tvlDelta / prev.protocol.tvl_usd * 100) : null;
        const entry = {
            factor: 'TVL',
            contribution: tvlDelta > 0 ? 3 : -3,
            evidence: `TVL changed by ${pct != null ? pct.toFixed(1) + '%' : '$' + tvlDelta.toLocaleString()}`,
        };
        (tvlDelta > 0 ? positive : negative).push(entry);
    }

    // GitHub stars
    const prevStars = prev?.github?.stars ?? prev?.developer?.stars ?? 0;
    const currStars = curr?.github?.stars ?? curr?.developer?.stars ?? 0;
    if (Math.abs(currStars - prevStars) > 50) {
        const entry = {
            factor: 'GitHub Stars',
            contribution: currStars > prevStars ? 1 : -1,
            evidence: `Stars: ${prevStars.toLocaleString()} → ${currStars.toLocaleString()}`,
        };
        (currStars > prevStars ? positive : negative).push(entry);
    }

    // Volume
    const volDelta = (curr?.market?.volume_24h_usd || 0) - (prev?.market?.volume_24h_usd || 0);
    if (Math.abs(volDelta) > 1e6) {
        const pct = prev?.market?.volume_24h_usd ? (volDelta / prev.market.volume_24h_usd * 100) : null;
        const entry = {
            factor: 'Trading Volume',
            contribution: volDelta > 0 ? 1.5 : -1.5,
            evidence: `24h volume ${pct != null ? pct.toFixed(1) + '%' : volDelta.toLocaleString()}`,
        };
        (volDelta > 0 ? positive : negative).push(entry);
    }

    // Market cap
    const mcapDelta = (curr?.market?.market_cap_usd || 0) - (prev?.market?.market_cap_usd || 0);
    if (Math.abs(mcapDelta) > 1e6) {
        const pct = prev?.market?.market_cap_usd ? (mcapDelta / prev.market.market_cap_usd * 100) : null;
        const entry = {
            factor: 'Market Cap',
            contribution: mcapDelta > 0 ? 1 : -1,
            evidence: `Market cap ${pct != null ? pct.toFixed(1) + '%' : '$' + mcapDelta.toLocaleString()}`,
        };
        (mcapDelta > 0 ? positive : negative).push(entry);
    }

    // Twitter followers
    const prevTw = prev?.social?.twitter_followers || 0;
    const currTw = curr?.social?.twitter_followers || 0;
    if (Math.abs(currTw - prevTw) > 1000) {
        const entry = {
            factor: 'Community',
            contribution: currTw > prevTw ? 0.5 : -0.5,
            evidence: `Twitter followers: ${prevTw.toLocaleString()} → ${currTw.toLocaleString()}`,
        };
        (currTw > prevTw ? positive : negative).push(entry);
    }

    // Token unlock warning (if FDV/MCap ratio worsened)
    if (curr?.market?.fdv_usd && curr?.market?.market_cap_usd
        && prev?.market?.fdv_usd && prev?.market?.market_cap_usd) {
        const prevRatio = prev.market.fdv_usd / prev.market.market_cap_usd;
        const currRatio = curr.market.fdv_usd / curr.market.market_cap_usd;
        if (currRatio > prevRatio * 1.05) {
            negative.push({
                factor: 'Inflation Pressure',
                contribution: -1.5,
                evidence: `FDV/MCap ratio increased: ${prevRatio.toFixed(2)}x → ${currRatio.toFixed(2)}x`,
            });
        }
    }

    return { positive, negative };
}

function explainRiskDelta(prev, curr) {
    const positive = [];
    const negative = [];

    // ATH recovery (good — risk decreases)
    if (curr?.market?.ath_change_pct != null && prev?.market?.ath_change_pct != null) {
        const recovery = curr.market.ath_change_pct - prev.market.ath_change_pct;
        if (Math.abs(recovery) > 2) {
            const entry = {
                factor: 'ATH Recovery',
                contribution: recovery > 0 ? -2 : 2,
                evidence: `ATH drawdown: ${prev.market.ath_change_pct.toFixed(1)}% → ${curr.market.ath_change_pct.toFixed(1)}%`,
            };
            (recovery > 0 ? positive : negative).push(entry);
        }
    }

    // Market rank improvement
    if (curr?.market?.market_cap_rank != null && prev?.market?.market_cap_rank != null) {
        const rankDelta = prev.market.market_cap_rank - curr.market.market_cap_rank; // lower = better
        if (Math.abs(rankDelta) > 2) {
            const entry = {
                factor: 'Market Rank',
                contribution: rankDelta > 0 ? -1 : 1,
                evidence: `Rank: #${prev.market.market_cap_rank} → #${curr.market.market_cap_rank}`,
            };
            (rankDelta > 0 ? positive : negative).push(entry);
        }
    }

    // GitHub activity decline (increases risk)
    const prevCommits = prev?.github?.commits_30d || 0;
    const currCommits = curr?.github?.commits_30d || 0;
    if (currCommits < prevCommits * 0.5 && prevCommits > 0) {
        negative.push({
            factor: 'Development Slowdown',
            contribution: 3,
            evidence: `Commits/30d dropped: ${prevCommits} → ${currCommits}`,
        });
    }

    // TVL decline (increases risk)
    const prevTvl = prev?.protocol?.tvl_usd || 0;
    const currTvl = curr?.protocol?.tvl_usd || 0;
    if (currTvl < prevTvl * 0.85 && prevTvl > 0) {
        const pct = ((currTvl - prevTvl) / prevTvl * 100).toFixed(1);
        negative.push({
            factor: 'TVL Decline',
            contribution: 4,
            evidence: `TVL dropped ${pct}%`,
        });
    }

    return { positive, negative };
}

function explainConvictionDelta(prev, curr) {
    const positive = [];
    const negative = [];

    // 7d momentum
    if (curr?.market?.change_7d_pct != null && prev?.market?.change_7d_pct != null) {
        const delta = curr.market.change_7d_pct - prev.market.change_7d_pct;
        if (Math.abs(delta) > 2) {
            const entry = {
                factor: '7d Momentum',
                contribution: delta > 0 ? 5 : -5,
                evidence: `7d change: ${prev.market.change_7d_pct.toFixed(1)}% → ${curr.market.change_7d_pct.toFixed(1)}%`,
            };
            (delta > 0 ? positive : negative).push(entry);
        }
    }

    // TVL change
    if (curr?.protocol?.tvl_change_7d != null && prev?.protocol?.tvl_change_7d != null) {
        const delta = curr.protocol.tvl_change_7d - prev.protocol.tvl_change_7d;
        if (Math.abs(delta) > 2) {
            const entry = {
                factor: 'TVL Change',
                contribution: delta * 0.75,
                evidence: `TVL 7d: ${prev.protocol.tvl_change_7d.toFixed(1)}% → ${curr.protocol.tvl_change_7d.toFixed(1)}%`,
            };
            (delta > 0 ? positive : negative).push(entry);
        }
    }

    return { positive, negative };
}

function explainAlphaDelta(prev, curr) {
    const positive = [];
    const negative = [];

    // Multi-chain expansion
    const prevChains = prev?.protocol?.chains?.length || 0;
    const currChains = curr?.protocol?.chains?.length || 0;
    if (currChains !== prevChains) {
        const entry = {
            factor: 'Multi-chain Expansion',
            contribution: (currChains - prevChains) * 2,
            evidence: `Chains: ${prevChains} → ${currChains}`,
        };
        (currChains > prevChains ? positive : negative).push(entry);
    }

    return { positive, negative };
}

function explainConfidenceDelta(prev, curr) {
    const positive = [];
    const negative = [];

    // Data fields gained
    const fieldsToCheck = [
        'market.price_usd', 'market.market_cap_usd', 'market.fdv_usd',
        'market.volume_24h_usd', 'protocol.tvl_usd', 'github.full_name',
        'github.stars', 'github.commits_30d', 'developer.stars',
        'social.twitter_followers', 'description',
    ];

    let gained = 0, lost = 0;
    for (const f of fieldsToCheck) {
        const [category, field] = f.split('.');
        const prevVal = prev?.[category]?.[field];
        const currVal = curr?.[category]?.[field];

        if (prevVal == null && currVal != null) gained++;
        if (prevVal != null && currVal == null) lost++;
    }

    if (gained > 0) {
        positive.push({
            factor: 'Data Coverage',
            contribution: gained * 1.5,
            evidence: `${gained} new data field(s) became available`,
        });
    }
    if (lost > 0) {
        negative.push({
            factor: 'Data Loss',
            contribution: -lost * 2,
            evidence: `${lost} data field(s) no longer available`,
        });
    }

    return { positive, negative };
}

module.exports = { deltaAnalysis };