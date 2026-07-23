/* =================================================================
   PAYD Intelligence V2 — Change Detector
   ----------------------------------------------------------------
   Сравнивает два snapshot'а и выявляет значимые изменения.
   Каждое изменение сопровождается evidence (доказательством).
   ================================================================= */

// Thresholds for significance
const SIGNIFICANCE_THRESHOLDS = {
    pct_small: 2,      // < 2% — no significance
    pct_medium: 10,    // 2-10% — medium significance
    pct_large: 25,     // > 25% — high significance
    pct_huge: 50,      // > 50% — critical
};

// ── Field-by-field change detection ──────────────────────────
function detectFieldChange(fieldPath, prevVal, currVal, options = {}) {
    if (prevVal == null && currVal == null) return null;

    // Newly appeared data
    if (prevVal == null && currVal != null) {
        return {
            field: fieldPath,
            change_type: 'appeared',
            previous: null,
            current: currVal,
            delta: null,
            delta_pct: null,
            significance: 'medium',
            sentiment: options.sentiment_on_appear || 'positive',
            evidence: `New data available: ${fieldPath} = ${currVal}${options.unit || ''}`,
        };
    }

    // Lost data
    if (prevVal != null && currVal == null) {
        return {
            field: fieldPath,
            change_type: 'disappeared',
            previous: prevVal,
            current: null,
            delta: null,
            delta_pct: null,
            significance: 'medium',
            sentiment: 'negative',
            evidence: `Data no longer available: ${fieldPath} (was ${prevVal}${options.unit || ''})`,
        };
    }

    // Both present — calculate delta
    if (typeof prevVal === 'number' && typeof currVal === 'number') {
        const delta = currVal - prevVal;
        const deltaPct = prevVal !== 0 ? (delta / Math.abs(prevVal)) * 100 : null;

        if (Math.abs(deltaPct || 0) < SIGNIFICANCE_THRESHOLDS.pct_small) {
            return null; // insignificant
        }

        let significance;
        const absPct = Math.abs(deltaPct || 0);
        if (absPct > SIGNIFICANCE_THRESHOLDS.pct_huge) significance = 'critical';
        else if (absPct > SIGNIFICANCE_THRESHOLDS.pct_large) significance = 'high';
        else if (absPct > SIGNIFICANCE_THRESHOLDS.pct_medium) significance = 'medium';
        else significance = 'low';

        // Sentiment based on field type
        let sentiment = options.neutral ? 'neutral' : (delta > 0 ? 'positive' : 'negative');

        const prevStr = formatValue(prevVal, options.unit);
        const currStr = formatValue(currVal, options.unit);
        const deltaStr = delta > 0 ? `+${formatValue(delta, options.unit)}` : formatValue(delta, options.unit);
        const pctStr = deltaPct != null ? ` (${deltaPct >= 0 ? '+' : ''}${deltaPct.toFixed(1)}%)` : '';

        return {
            field: fieldPath,
            change_type: 'changed',
            previous: prevVal,
            current: currVal,
            delta: delta,
            delta_pct: deltaPct,
            significance,
            sentiment,
            evidence: `${fieldPath}: ${prevStr} → ${currStr} (${deltaStr}${pctStr})`,
        };
    }

    return null;
}

function formatValue(v, unit) {
    if (v == null) return 'N/A';
    if (typeof v !== 'number') return String(v);
    if (unit === 'usd') {
        if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
        if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
        if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
        return `$${v.toFixed(2)}`;
    }
    if (unit === 'pct') return `${v.toFixed(1)}%`;
    if (unit === 'count') return v.toLocaleString('en-US');
    return String(v);
}

// ── High-level event detection ────────────────────────────────
function detectEvents(changes) {
    const events = [];

    // Map field changes to high-level events
    for (const ch of changes) {
        const f = ch.field;

        // Developer activity
        if (f === 'github.commits_30d' && ch.sentiment === 'positive') {
            events.push({
                type: 'developer_activity_increased',
                evidence: ch.evidence,
                sentiment: 'positive',
                source_field: f,
            });
        }
        if (f === 'github.commits_30d' && ch.sentiment === 'negative') {
            events.push({
                type: 'developer_activity_declined',
                evidence: ch.evidence,
                sentiment: 'negative',
                source_field: f,
            });
        }

        // TVL changes
        if (f === 'protocol.tvl_usd' && ch.sentiment === 'positive' && ch.significance !== 'low') {
            events.push({
                type: 'tvl_increased_significantly',
                evidence: ch.evidence,
                sentiment: 'positive',
                source_field: f,
            });
        }
        if (f === 'protocol.tvl_usd' && ch.sentiment === 'negative' && ch.significance !== 'low') {
            events.push({
                type: 'tvl_dropped',
                evidence: ch.evidence,
                sentiment: 'negative',
                source_field: f,
            });
        }

        // Liquidity
        if (f === 'market.volume_24h_usd') {
            if (ch.sentiment === 'positive' && ch.significance !== 'low') {
                events.push({
                    type: 'liquidity_improved',
                    evidence: ch.evidence,
                    sentiment: 'positive',
                    source_field: f,
                });
            }
            if (ch.sentiment === 'negative' && ch.significance !== 'low') {
                events.push({
                    type: 'liquidity_deteriorated',
                    evidence: ch.evidence,
                    sentiment: 'negative',
                    source_field: f,
                });
            }
        }

        // Market share (via market cap rank)
        if (f === 'market.market_cap_rank') {
            if (ch.delta < 0) {
                events.push({
                    type: 'market_share_increased',
                    evidence: `Rank improved: ${ch.previous} → ${ch.current}`,
                    sentiment: 'positive',
                    source_field: f,
                });
            } else {
                events.push({
                    type: 'market_share_declined',
                    evidence: `Rank declined: ${ch.previous} → ${ch.current}`,
                    sentiment: 'negative',
                    source_field: f,
                });
            }
        }

        // Inflation pressure (FDV/MCap ratio)
        if (f === 'market.fdv_usd') {
            events.push({
                type: ch.sentiment === 'positive' ? 'market_cap_grew' : 'market_cap_shrank',
                evidence: ch.evidence,
                sentiment: ch.sentiment,
                source_field: f,
            });
        }

        // Ecosystem expansion
        if (f === 'protocol.chains' && ch.change_type === 'appeared') {
            events.push({
                type: 'new_integrations',
                evidence: ch.evidence,
                sentiment: 'positive',
                source_field: f,
            });
        }

        // Sector leadership via market cap growth vs sector
        if (f === 'market.market_cap_usd' && ch.significance === 'critical' && ch.sentiment === 'positive') {
            events.push({
                type: 'sector_leadership_strengthened',
                evidence: ch.evidence,
                sentiment: 'positive',
                source_field: f,
            });
        }
        if (f === 'market.market_cap_usd' && ch.significance === 'critical' && ch.sentiment === 'negative') {
            events.push({
                type: 'competitive_position_weakened',
                evidence: ch.evidence,
                sentiment: 'negative',
                source_field: f,
            });
        }

        // Community growth
        if (f === 'social.twitter_followers' && ch.significance !== 'low') {
            events.push({
                type: ch.sentiment === 'positive' ? 'community_grew' : 'community_declined',
                evidence: ch.evidence,
                sentiment: ch.sentiment,
                source_field: f,
            });
        }
    }

    // De-duplicate
    const seen = new Set();
    return events.filter(e => {
        const key = `${e.type}_${e.source_field}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ── Compare two project states ────────────────────────────────
function compareProjects(prevProj, currProj) {
    const changes = [];
    if (!prevProj || !currProj) return changes;

    // Market changes
    changes.push(detectFieldChange('market.price_usd',
        prevProj.market?.price_usd, currProj.market?.price_usd, { unit: 'usd' }));
    changes.push(detectFieldChange('market.market_cap_usd',
        prevProj.market?.market_cap_usd, currProj.market?.market_cap_usd, { unit: 'usd' }));
    changes.push(detectFieldChange('market.fdv_usd',
        prevProj.market?.fdv_usd, currProj.market?.fdv_usd, { unit: 'usd' }));
    changes.push(detectFieldChange('market.volume_24h_usd',
        prevProj.market?.volume_24h_usd, currProj.market?.volume_24h_usd, { unit: 'usd' }));
    changes.push(detectFieldChange('market.market_cap_rank',
        prevProj.market?.market_cap_rank, currProj.market?.market_cap_rank, { neutral: true }));
    changes.push(detectFieldChange('market.circulating_supply',
        prevProj.market?.circulating_supply, currProj.market?.circulating_supply, { unit: 'count' }));

    // Protocol changes
    changes.push(detectFieldChange('protocol.tvl_usd',
        prevProj.protocol?.tvl_usd, currProj.protocol?.tvl_usd, { unit: 'usd' }));

    // GitHub changes
    changes.push(detectFieldChange('github.commits_30d',
        prevProj.github?.commits_30d, currProj.github?.commits_30d, { unit: 'count' }));
    changes.push(detectFieldChange('github.stars',
        prevProj.github?.stars, currProj.github?.stars, { unit: 'count' }));
    changes.push(detectFieldChange('developer.stars',
        prevProj.developer?.stars, currProj.developer?.stars, { unit: 'count' }));

    // Social changes
    changes.push(detectFieldChange('social.twitter_followers',
        prevProj.social?.twitter_followers, currProj.social?.twitter_followers, { unit: 'count' }));

    return changes.filter(Boolean);
}

module.exports = {
    compareProjects,
    detectEvents,
    detectFieldChange,
    SIGNIFICANCE_THRESHOLDS,
};