/* =================================================================
   PAYD Intelligence V2 — Catalyst Tracker
   ----------------------------------------------------------------
   Идентифицирует будущие катализаторы на основе текущих данных.
   Каждый катализатор получает sentiment, magnitude и evidence.
   ================================================================= */

function detectCatalysts(project, sector) {
    const catalysts = [];

    // ── Token Unlock (FDV/MCap > 1.5x) ──────────────────────
    if (project.market?.fdv_usd != null && project.market?.market_cap_usd
        && project.market.market_cap_usd > 0) {
        const ratio = project.market.fdv_usd / project.market.market_cap_usd;
        if (ratio > 1.2) {
            catalysts.push({
                type: 'token_unlock',
                sentiment: 'negative',
                magnitude: ratio > 3 ? 'high' : ratio > 2 ? 'medium' : 'low',
                evidence: `FDV/MCap ratio of ${ratio.toFixed(2)}x suggests ${(ratio - 1).toFixed(2)}x potential dilution from token unlocks.`,
                timing: 'unknown',
                confidence: 'medium',
                source: 'market.fdv_usd',
            });
        }
    }

    // ── Protocol Upgrade (active GitHub development) ─────────
    if (project.github?.commits_30d != null && project.github.commits_30d > 30) {
        catalysts.push({
            type: 'protocol_upgrade',
            sentiment: 'positive',
            magnitude: project.github.commits_30d > 100 ? 'high' : 'medium',
            evidence: `${project.github.commits_30d} commits in last 30 days indicates ongoing protocol development.`,
            timing: 'ongoing',
            confidence: 'high',
            source: 'github.commits_30d',
        });
    }

    // ── Multi-chain Expansion ────────────────────────────────
    if (project.protocol?.chains?.length) {
        const recentChainCount = project.protocol.chains.length;
        if (recentChainCount >= 5) {
            catalysts.push({
                type: 'ecosystem_expansion',
                sentiment: 'positive',
                magnitude: recentChainCount >= 15 ? 'high' : 'medium',
                evidence: `Deployed across ${recentChainCount} networks — strong multi-chain presence.`,
                timing: 'ongoing',
                confidence: 'high',
                source: 'protocol.chains',
            });
        }
    }

    // ── TVL Acceleration (positive momentum) ─────────────────
    if (project.protocol?.tvl_change_7d != null && project.protocol.tvl_change_7d > 10) {
        catalysts.push({
            type: 'tvl_acceleration',
            sentiment: 'positive',
            magnitude: project.protocol.tvl_change_7d > 30 ? 'high' : 'medium',
            evidence: `TVL grew ${project.protocol.tvl_change_7d.toFixed(1)}% in last 7 days — accelerating adoption.`,
            timing: 'recent',
            confidence: 'high',
            source: 'protocol.tvl_change_7d',
        });
    }

    // ── Institutional Adoption Proxy (large TVL) ────────────
    if (project.protocol?.tvl_usd != null && project.protocol.tvl_usd > 5e8) {
        catalysts.push({
            type: 'institutional_adoption',
            sentiment: 'positive',
            magnitude: project.protocol.tvl_usd > 5e9 ? 'high' : 'medium',
            evidence: `TVL of $${(project.protocol.tvl_usd / 1e9).toFixed(2)}B suggests institutional participation.`,
            timing: 'current',
            confidence: 'medium',
            source: 'protocol.tvl_usd',
        });
    }

    // ── Governance Improvement (active repo) ─────────────────
    if (project.github?.full_name && !project.github?.archived
        && project.github?.commits_30d != null && project.github.commits_30d > 10) {
        catalysts.push({
            type: 'governance_activity',
            sentiment: 'positive',
            magnitude: 'low',
            evidence: 'Active GitHub repository with regular contributions.',
            timing: 'ongoing',
            confidence: 'medium',
            source: 'github.commits_30d',
        });
    }

    // ── Security Risk Increase (issues open) ─────────────────
    if (project.github?.open_issues != null && project.github.open_issues > 500) {
        catalysts.push({
            type: 'security_risk',
            sentiment: 'negative',
            magnitude: project.github.open_issues > 2000 ? 'high' : 'medium',
            evidence: `${project.github.open_issues.toLocaleString()} open GitHub issues — possible technical debt.`,
            timing: 'current',
            confidence: 'medium',
            source: 'github.open_issues',
        });
    }

    // ── Sector-specific catalysts ────────────────────────────
    if (sector === 'rwa') {
        catalysts.push({
            type: 'regulatory_clarity',
            sentiment: 'positive',
            magnitude: 'medium',
            evidence: 'RWA sector may benefit from evolving regulatory frameworks.',
            timing: 'future',
            confidence: 'low',
            source: 'sector',
        });
    }

    if (sector === 'ai') {
        catalysts.push({
            type: 'narrative_momentum',
            sentiment: 'positive',
            magnitude: 'high',
            evidence: 'AI sector narrative continues to drive capital flows.',
            timing: 'current',
            confidence: 'medium',
            source: 'sector',
        });
    }

    // ── Narrative / Sector Momentum ──────────────────────────
    const hotSectors = ['ai', 'rwa', 'depin'];
    if (sector && hotSectors.includes(sector)) {
        catalysts.push({
            type: 'narrative_momentum',
            sentiment: 'positive',
            magnitude: 'medium',
            evidence: `${sector.toUpperCase()} is currently a hot narrative in the market.`,
            timing: 'current',
            confidence: 'medium',
            source: 'sector',
        });
    }

    // ── Whale Activity Proxy (large volume spike) ───────────
    if (project.market?.volume_24h_usd != null && project.market?.market_cap_usd
        && project.market.market_cap_usd > 0) {
        const turnover = project.market.volume_24h_usd / project.market.market_cap_usd;
        if (turnover > 0.5) {
            catalysts.push({
                type: 'whale_activity',
                sentiment: 'unknown',
                magnitude: turnover > 1 ? 'high' : 'medium',
                evidence: `High turnover ratio (${(turnover * 100).toFixed(0)}%) suggests unusual trading activity.`,
                timing: 'recent',
                confidence: 'low',
                source: 'market.volume_24h_usd',
            });
        }
    }

    return catalysts;
}

// Predict upcoming catalyst direction (positive/neutral/negative/unknown)
function predictImpact(catalyst) {
    const sentimentMap = {
        'token_unlock': 'negative',
        'protocol_upgrade': 'positive',
        'tvl_acceleration': 'positive',
        'institutional_adoption': 'positive',
        'governance_activity': 'positive',
        'security_risk': 'negative',
        'regulatory_clarity': 'positive',
        'narrative_momentum': 'positive',
        'whale_activity': 'unknown',
        'ecosystem_expansion': 'positive',
    };
    return sentimentMap[catalyst.type] || 'unknown';
}

module.exports = { detectCatalysts, predictImpact };