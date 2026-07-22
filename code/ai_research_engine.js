/* =================================================================
   PAYD Intelligence V2 — AI Research & Analysis Engine (v1.0)
   ----------------------------------------------------------------
   Принимает обогащённые данные проекта (из projects_enriched.json)
   и генерирует институциональный анализ.

   ПРИНЦИПЫ:
   - НИКОГДА не выдумывает факты (цены, метрики, инвесторов)
   - Каждый вывод ссылается на источник данных
   - Если данных нет — явно указывает это
   - Confidence Score зависит от полноты данных
   - Детерминированный (без LLM) для воспроизводимости

   ВХОД:  projects_enriched.json
   ВЫХОД: projects_ai_analyzed.json
   ================================================================= */

const fs = require('fs');
const path = require('path');

const ENGINE_VERSION = '1.0.0';

// ── Утилиты форматирования ──────────────────────────────────────
const fmtUsd = (n, decimals = 0) => {
    if (n == null) return null;
    if (n >= 1e9) return `$${(n / 1e9).toFixed(decimals || 2)}B`;
    if (n >= 1e6) return `$${(n / 1e6).toFixed(decimals || 1)}M`;
    if (n >= 1e3) return `$${(n / 1e3).toFixed(decimals || 1)}K`;
    return `$${n.toFixed(decimals)}`;
};

const fmtPct = (n, decimals = 1) => {
    if (n == null) return null;
    const sign = n > 0 ? '+' : '';
    return `${sign}${n.toFixed(decimals)}%`;
};

const fmtNum = (n) => {
    if (n == null) return null;
    return n.toLocaleString('en-US');
};

const safe = (v, fn, fallback = null) => {
    if (v == null || (typeof v === 'number' && isNaN(v))) return fallback;
    return fn(v);
};

const daysAgo = (dateStr) => {
    if (!dateStr) return null;
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return null;
        return Math.floor((Date.now() - d.getTime()) / 86400000);
    } catch { return null; }
};

// ── Анализ полноты данных ──────────────────────────────────────
function analyzeCompleteness(p) {
    const checks = {
        'market.price_usd': p.market?.price_usd != null,
        'market.market_cap_usd': p.market?.market_cap_usd != null,
        'market.fdv_usd': p.market?.fdv_usd != null,
        'market.volume_24h_usd': p.market?.volume_24h_usd != null,
        'market.change_24h_pct': p.market?.change_24h_pct != null,
        'market.change_7d_pct': p.market?.change_7d_pct != null,
        'market.change_30d_pct': p.market?.change_30d_pct != null,
        'market.ath_change_pct': p.market?.ath_change_pct != null,
        'market.circulating_supply': p.market?.circulating_supply != null,
        'market.total_supply': p.market?.total_supply != null,
        'market.max_supply': p.market?.max_supply != null,
        'market.market_cap_rank': p.market?.market_cap_rank != null,
        'protocol.tvl_usd': p.protocol?.tvl_usd != null,
        'protocol.tvl_change_7d': p.protocol?.tvl_change_7d != null,
        'protocol.chains': p.protocol?.chains?.length > 0,
        'github.full_name': p.github?.full_name != null,
        'github.stars': p.github?.stars != null,
        'github.commits_30d': p.github?.commits_30d != null,
        'github.last_commit': p.github?.last_commit != null,
        'github.contributors': p.github?.contributors != null,
        'developer.stars': p.developer?.stars != null,
        'developer.commit_count_4_weeks': p.developer?.commit_count_4_weeks != null,
        'social.twitter_followers': p.social?.twitter_followers != null,
        'social.reddit_subscribers': p.social?.reddit_subscribers != null,
        'description': p.description != null && p.description.length > 50,
    };
    const present = Object.values(checks).filter(Boolean).length;
    const total = Object.keys(checks).length;
    const missing = Object.entries(checks).filter(([_, v]) => !v).map(([k]) => k);
    return {
        completeness: present / total,
        present,
        total,
        missing_fields: missing,
    };
}

// ── Confidence Score (0-100) ──────────────────────────────────
function calculateConfidenceScore(p, completeness) {
    // Базовая оценка = полнота данных * 100
    let score = completeness.completeness * 100;

    // Бонусы за критически важные данные
    if (p.market?.market_cap_usd != null) score += 3;
    if (p.market?.price_usd != null) score += 2;
    if (p.protocol?.tvl_usd != null && ['defi', 'rwa'].includes(p.sector)) score += 5;
    if (p.github?.stars != null || p.developer?.stars != null) score += 3;
    if (p.description) score += 2;

    // Штрафы за отсутствие GitHub (важно для tech-оценки)
    if (!p.github?.full_name && !p.developer?.stars) score -= 5;

    // Штраф за отсутствие социальных метрик
    if (!p.social?.twitter_followers && !p.social?.reddit_subscribers) score -= 3;

    return {
        value: Math.max(0, Math.min(100, Math.round(score))),
        explanation: `Confidence is based on data completeness (${completeness.present}/${completeness.total} fields available${completeness.missing_fields.length > 0 ? `, missing: ${completeness.missing_fields.slice(0, 3).join(', ')}${completeness.missing_fields.length > 3 ? '...' : ''}` : ''})`
    };
}

// ── 1. Investment Thesis ──────────────────────────────────────
function buildThesis(p) {
    const parts = [];
    const sources = [];

    // Описание протокола
    if (p.description) {
        const desc = p.description.length > 200
            ? p.description.substring(0, 200).replace(/<[^>]*>/g, '') + '...'
            : p.description.replace(/<[^>]*>/g, '');
        parts.push(`${p.name} (${p.symbol?.toUpperCase()}) is a ${p.sector} protocol. ${desc}`);
        sources.push('description');
    } else {
        parts.push(`${p.name} (${p.symbol?.toUpperCase()}) operates in the ${p.sector} sector. (Detailed description unavailable)`);
        sources.push('sector');
    }

    // Market position
    if (p.market?.market_cap_usd != null) {
        const tier = p.market.market_cap_usd > 1e9 ? 'large-cap'
            : p.market.market_cap_usd > 1e8 ? 'mid-cap'
            : p.market.market_cap_usd > 1e7 ? 'small-cap'
            : 'micro-cap';
        parts.push(`With a market capitalization of ${fmtUsd(p.market.market_cap_usd)}, ${p.name} is positioned as a ${tier} asset${p.market.market_cap_rank ? ` (rank #${p.market.market_cap_rank})` : ''}.`);
        sources.push('market.market_cap_usd');
    } else {
        parts.push(`Market capitalization data is not available, limiting valuation analysis.`);
    }

    // TVL significance
    if (p.protocol?.tvl_usd != null) {
        parts.push(`The protocol holds ${fmtUsd(p.protocol.tvl_usd)} in Total Value Locked${p.protocol.category ? ` within the ${p.protocol.category} category` : ''}.`);
        sources.push('protocol.tvl_usd');
    }

    // Developer activity
    const stars = p.github?.stars ?? p.developer?.stars;
    if (stars != null) {
        parts.push(`Developer interest is evidenced by ${fmtNum(stars)} GitHub stars.`);
        sources.push(p.github?.stars ? 'github.stars' : 'developer.stars');
    }

    // Community
    if (p.social?.twitter_followers != null && p.social.twitter_followers > 0) {
        parts.push(`Community engagement includes ${fmtNum(p.social.twitter_followers)} Twitter followers.`);
        sources.push('social.twitter_followers');
    }

    return {
        thesis: parts.join(' '),
        sources_used: [...new Set(sources)],
    };
}

// ── 2. Bull Case ──────────────────────────────────────────────
function buildBullCase(p) {
    const cases = [];
    const sources = [];

    // Сильный 30-дневный тренд
    if (p.market?.change_30d_pct != null && p.market.change_30d_pct > 20) {
        cases.push({
            claim: `Strong 30-day price momentum of ${fmtPct(p.market.change_30d_pct)} indicates positive market sentiment.`,
            source: 'market.change_30d_pct',
            value: p.market.change_30d_pct,
        });
        sources.push('market.change_30d_pct');
    }

    // TVL рост
    if (p.protocol?.tvl_change_7d != null && p.protocol.tvl_change_7d > 5) {
        cases.push({
            claim: `TVL grew ${fmtPct(p.protocol.tvl_change_7d)} in the last 7 days, signaling increasing protocol adoption.`,
            source: 'protocol.tvl_change_7d',
            value: p.protocol.tvl_change_7d,
        });
        sources.push('protocol.tvl_change_7d');
    }

    // Топ-100 по капитализации
    if (p.market?.market_cap_rank != null && p.market.market_cap_rank <= 100) {
        cases.push({
            claim: `Top-100 market cap ranking (rank #${p.market.market_cap_rank}) demonstrates established market position.`,
            source: 'market.market_cap_rank',
            value: p.market.market_cap_rank,
        });
        sources.push('market.market_cap_rank');
    }

    // Сильное GitHub присутствие
    const stars = p.github?.stars ?? p.developer?.stars;
    if (stars != null && stars > 5000) {
        cases.push({
            claim: `Major open-source presence with ${fmtNum(stars)} GitHub stars indicates strong developer community.`,
            source: p.github?.stars ? 'github.stars' : 'developer.stars',
            value: stars,
        });
        sources.push(p.github?.stars ? 'github.stars' : 'developer.stars');
    }

    // Недооценённость по mcap/TVL
    if (p.protocol?.mcap_to_tvl != null && p.protocol.mcap_to_tvl > 0 && p.protocol.mcap_to_tvl < 1) {
        cases.push({
            claim: `Undervalued relative to TVL: market cap/TVL ratio of ${p.protocol.mcap_to_tvl.toFixed(2)} suggests the token trades below the value locked in the protocol.`,
            source: 'protocol.mcap_to_tvl',
            value: p.protocol.mcap_to_tvl,
        });
        sources.push('protocol.mcap_to_tvl');
    }

    // Multi-chain
    if (p.protocol?.chains?.length >= 5) {
        cases.push({
            claim: `Broad multi-chain deployment across ${p.protocol.chains.length} networks (${p.protocol.chains.slice(0, 5).join(', ')}${p.protocol.chains.length > 5 ? '...' : ''}) provides ecosystem reach.`,
            source: 'protocol.chains',
            value: p.protocol.chains,
        });
        sources.push('protocol.chains');
    }

    // Активная разработка
    if (p.github?.commits_30d != null && p.github.commits_30d > 50) {
        cases.push({
            claim: `Active development with ${p.github.commits_30d} commits in the last 30 days.`,
            source: 'github.commits_30d',
            value: p.github.commits_30d,
        });
        sources.push('github.commits_30d');
    }

    // Большое сообщество
    if (p.social?.twitter_followers != null && p.social.twitter_followers > 100000) {
        cases.push({
            claim: `Large community of ${fmtNum(p.social.twitter_followers)} Twitter followers provides network effects.`,
            source: 'social.twitter_followers',
            value: p.social.twitter_followers,
        });
        sources.push('social.twitter_followers');
    }

    if (cases.length === 0) {
        cases.push({
            claim: 'No strong bullish signals detected from available data.',
            source: 'none',
            value: null,
        });
    }

    return { cases, sources_used: [...new Set(sources)] };
}

// ── 3. Bear Case ──────────────────────────────────────────────
function buildBearCase(p) {
    const cases = [];
    const sources = [];

    // Далеко от ATH
    if (p.market?.ath_change_pct != null && p.market.ath_change_pct < -70) {
        cases.push({
            claim: `Trading ${fmtPct(p.market.ath_change_pct)} below all-time high indicates significant historical drawdown.`,
            source: 'market.ath_change_pct',
            value: p.market.ath_change_pct,
        });
        sources.push('market.ath_change_pct');
    }

    // Медвежий 30д тренд
    if (p.market?.change_30d_pct != null && p.market.change_30d_pct < -20) {
        cases.push({
            claim: `Bearish 30-day price trend of ${fmtPct(p.market.change_30d_pct)} suggests weakening momentum.`,
            source: 'market.change_30d_pct',
            value: p.market.change_30d_pct,
        });
        sources.push('market.change_30d_pct');
    }

    // Снижение TVL
    if (p.protocol?.tvl_change_7d != null && p.protocol.tvl_change_7d < -10) {
        cases.push({
            claim: `TVL declined ${fmtPct(p.protocol.tvl_change_7d)} in the last 7 days, indicating capital outflow.`,
            source: 'protocol.tvl_change_7d',
            value: p.protocol.tvl_change_7d,
        });
        sources.push('protocol.tvl_change_7d');
    }

    // Архивированный репозиторий
    if (p.github?.archived) {
        cases.push({
            claim: `GitHub repository is archived, signaling discontinued development.`,
            source: 'github.archived',
            value: p.github.archived,
        });
        sources.push('github.archived');
    }

    // Большой backlog issues
    if (p.github?.open_issues != null && p.github.open_issues > 1000) {
        cases.push({
            claim: `Large open issue backlog (${fmtNum(p.github.open_issues)} issues) suggests possible development bottlenecks.`,
            source: 'github.open_issues',
            value: p.github.open_issues,
        });
        sources.push('github.open_issues');
    }

    // Низкая ликвидность
    if (p.market?.volume_24h_usd != null && p.market.volume_24h_usd < 100000) {
        cases.push({
            claim: `Low 24h trading volume of ${fmtUsd(p.market.volume_24h_usd)} indicates limited liquidity.`,
            source: 'market.volume_24h_usd',
            value: p.market.volume_24h_usd,
        });
        sources.push('market.volume_24h_usd');
    }

    // Неактивная разработка
    const daysSinceCommit = daysAgo(p.github?.last_commit);
    if (daysSinceCommit != null && daysSinceCommit > 90) {
        cases.push({
            claim: `No recent development activity: last commit was ${daysSinceCommit} days ago.`,
            source: 'github.last_commit',
            value: p.github?.last_commit,
        });
        sources.push('github.last_commit');
    }

    // Инфляция (FDV >> market cap)
    if (p.market?.fdv_usd != null && p.market?.market_cap_usd != null
        && p.market.fdv_usd > p.market.market_cap_usd * 2) {
        const inflationRatio = p.market.fdv_usd / p.market.market_cap_usd;
        cases.push({
            claim: `FDV/Market Cap ratio of ${inflationRatio.toFixed(2)}x indicates significant potential dilution as more tokens unlock.`,
            source: 'market.fdv_usd',
            value: p.market.fdv_usd,
        });
        sources.push('market.fdv_usd');
    }

    if (cases.length === 0) {
        cases.push({
            claim: 'No major red flags detected from available data.',
            source: 'none',
            value: null,
        });
    }

    return { cases, sources_used: [...new Set(sources)] };
}

// ── 4. SWOT Analysis ─────────────────────────────────────────
function buildSWOT(p) {
    const strengths = [];
    const weaknesses = [];
    const opportunities = [];
    const threats = [];

    // Strengths
    if (p.market?.market_cap_usd != null && p.market.market_cap_usd > 1e9) {
        strengths.push({ item: `Established market cap of ${fmtUsd(p.market.market_cap_usd)}`, source: 'market.market_cap_usd' });
    }
    if (p.market?.market_cap_rank != null && p.market.market_cap_rank <= 50) {
        strengths.push({ item: `Top-50 market cap ranking (#${p.market.market_cap_rank})`, source: 'market.market_cap_rank' });
    }
    const stars = p.github?.stars ?? p.developer?.stars;
    if (stars != null && stars > 1000) {
        strengths.push({ item: `Strong developer interest (${fmtNum(stars)} stars)`, source: p.github?.stars ? 'github.stars' : 'developer.stars' });
    }
    if (p.protocol?.tvl_usd != null && p.protocol.tvl_usd > 1e8) {
        strengths.push({ item: `Significant TVL of ${fmtUsd(p.protocol.tvl_usd)}`, source: 'protocol.tvl_usd' });
    }
    if (p.social?.twitter_followers != null && p.social.twitter_followers > 50000) {
        strengths.push({ item: `Large community (${fmtNum(p.social.twitter_followers)} Twitter followers)`, source: 'social.twitter_followers' });
    }
    if (p.protocol?.chains?.length >= 3) {
        strengths.push({ item: `Multi-chain deployment (${p.protocol.chains.length} networks)`, source: 'protocol.chains' });
    }

    // Weaknesses
    if (p.market?.change_30d_pct != null && p.market.change_30d_pct < -30) {
        weaknesses.push({ item: `Significant 30-day decline (${fmtPct(p.market.change_30d_pct)})`, source: 'market.change_30d_pct' });
    }
    if (p.market?.volume_24h_usd != null && p.market.volume_24h_usd < 500000) {
        weaknesses.push({ item: `Low trading volume (${fmtUsd(p.market.volume_24h_usd)}/24h)`, source: 'market.volume_24h_usd' });
    }
    if (p.github?.commits_30d != null && p.github.commits_30d < 5) {
        weaknesses.push({ item: `Low development activity (${p.github.commits_30d} commits/30d)`, source: 'github.commits_30d' });
    }
    if (p.market?.fdv_usd != null && p.market?.market_cap_usd != null
        && p.market.fdv_usd > p.market.market_cap_usd * 3) {
        weaknesses.push({ item: `High dilution risk (FDV/MCap = ${(p.market.fdv_usd / p.market.market_cap_usd).toFixed(2)}x)`, source: 'market.fdv_usd' });
    }
    const daysSinceCommit = daysAgo(p.github?.last_commit);
    if (daysSinceCommit != null && daysSinceCommit > 180) {
        weaknesses.push({ item: `Stale development (${daysSinceCommit} days since last commit)`, source: 'github.last_commit' });
    }

    // Opportunities
    if (p.protocol?.tvl_change_7d != null && p.protocol.tvl_change_7d > 5) {
        opportunities.push({ item: `Growing TVL (+${p.protocol.tvl_change_7d.toFixed(1)}% in 7d)`, source: 'protocol.tvl_change_7d' });
    }
    if (p.protocol?.mcap_to_tvl != null && p.protocol.mcap_to_tvl > 0 && p.protocol.mcap_to_tvl < 0.5) {
        opportunities.push({ item: `Potentially undervalued (mcap/TVL = ${p.protocol.mcap_to_tvl.toFixed(2)})`, source: 'protocol.mcap_to_tvl' });
    }
    if (p.market?.change_24h_pct != null && p.market.change_24h_pct > 10) {
        opportunities.push({ item: `Recent positive momentum (+${p.market.change_24h_pct.toFixed(1)}% in 24h)`, source: 'market.change_24h_pct' });
    }
    if (p.github?.commits_30d != null && p.github.commits_30d > 100) {
        opportunities.push({ item: `Strong development acceleration (${p.github.commits_30d} commits/30d)`, source: 'github.commits_30d' });
    }

    // Threats
    if (p.market?.ath_change_pct != null && p.market.ath_change_pct < -80) {
        threats.push({ item: `Severe drawdown from ATH (${fmtPct(p.market.ath_change_pct)})`, source: 'market.ath_change_pct' });
    }
    if (p.protocol?.tvl_change_7d != null && p.protocol.tvl_change_7d < -15) {
        threats.push({ item: `Capital outflow risk (TVL -${Math.abs(p.protocol.tvl_change_7d).toFixed(1)}% in 7d)`, source: 'protocol.tvl_change_7d' });
    }
    if (p.github?.archived) {
        threats.push({ item: `Project abandonment risk (GitHub archived)`, source: 'github.archived' });
    }

    return { strengths, weaknesses, opportunities, threats };
}

// ── 5. Competitive Analysis ──────────────────────────────────
function buildCompetitive(p, sectorAverages) {
    const sector = p.sector || 'unknown';
    const avg = sectorAverages[sector] || {};
    const position = [];

    // Market cap position
    if (p.market?.market_cap_rank != null) {
        if (p.market.market_cap_rank <= 20) position.push('top-20 globally');
        else if (p.market.market_cap_rank <= 100) position.push('top-100 globally');
        else if (p.market.market_cap_rank <= 500) position.push('top-500 globally');
        else position.push(`ranked #${p.market.market_cap_rank} globally`);
    }

    // Sector position
    if (p.market?.market_cap_usd != null && avg.market_cap_usd != null) {
        const ratio = p.market.market_cap_usd / avg.market_cap_usd;
        if (ratio > 3) position.push(`significantly above sector average market cap (${ratio.toFixed(1)}x)`);
        else if (ratio > 1.5) position.push(`above sector average market cap (${ratio.toFixed(1)}x)`);
        else if (ratio < 0.5) position.push(`below sector average market cap (${(ratio * 100).toFixed(0)}%)`);
    }

    // TVL position
    if (p.protocol?.tvl_usd != null && avg.tvl_usd != null) {
        const ratio = p.protocol.tvl_usd / avg.tvl_usd;
        if (ratio > 2) position.push(`dominant in TVL (${ratio.toFixed(1)}x sector average)`);
        else if (ratio > 1) position.push(`above-average TVL`);
    }

    // Competitors in same sector
    const competitors = p.sector ? `Other ${p.sector} projects tracked in the platform` : 'Sector competitors not identified';

    // Advantages / Disadvantages
    const advantages = [];
    const disadvantages = [];

    if (p.market?.change_30d_pct != null && p.market.change_30d_pct > 0) {
        advantages.push(`Positive 30-day price action (${fmtPct(p.market.change_30d_pct)}) vs broader market`);
    }
    if (p.github?.commits_30d != null && p.github.commits_30d > 50) {
        advantages.push(`Higher-than-average development velocity (${p.github.commits_30d} commits/30d)`);
    }
    if (p.protocol?.chains?.length != null && p.protocol.chains.length >= 5) {
        advantages.push(`Multi-chain presence (${p.protocol.chains.length} networks) extends addressable market`);
    }

    if (p.market?.change_30d_pct != null && p.market.change_30d_pct < -20) {
        disadvantages.push(`Underperforming 30-day price action (${fmtPct(p.market.change_30d_pct)})`);
    }
    if (p.protocol?.chains?.length != null && p.protocol.chains.length === 1) {
        disadvantages.push(`Single-chain deployment limits ecosystem reach`);
    }
    if (p.social?.twitter_followers != null && p.social.twitter_followers < 10000) {
        disadvantages.push(`Limited community size (${fmtNum(p.social.twitter_followers)} followers) constrains network effects`);
    }

    return {
        market_position: position.length > 0
            ? `${p.name} is ${position.join(', ')} in the ${sector} sector.`
            : `${p.name} operates in the ${sector} sector. (Limited market position data available)`,
        competitors,
        advantages,
        disadvantages,
    };
}

// ── 6. Tokenomics Analysis ──────────────────────────────────
function buildTokenomics(p) {
    const analysis = {
        supply_model: null,
        inflation: null,
        emission: null,
        utility: null,
        governance: null,
        value_capture: null,
        unlock_risks: null,
    };

    // Supply model
    if (p.market?.max_supply != null && p.market?.circulating_supply != null) {
        const circRatio = p.market.circulating_supply / p.market.max_supply;
        analysis.supply_model = `Capped supply model: ${fmtNum(p.market.circulating_supply)} of ${fmtNum(p.market.max_supply)} tokens in circulation (${(circRatio * 100).toFixed(1)}%).`;
    } else if (p.market?.circulating_supply != null && p.market?.total_supply != null) {
        const circRatio = p.market.circulating_supply / p.market.total_supply;
        analysis.supply_model = `Inflationary supply model: ${fmtNum(p.market.circulating_supply)} of ${fmtNum(p.market.total_supply)} tokens in circulation (${(circRatio * 100).toFixed(1)}%).`;
    } else {
        analysis.supply_model = 'Supply model details unavailable.';
    }

    // Inflation / Dilution risk
    if (p.market?.fdv_usd != null && p.market?.market_cap_usd != null && p.market.market_cap_usd > 0) {
        const ratio = p.market.fdv_usd / p.market.market_cap_usd;
        if (ratio > 5) {
            analysis.inflation = `High inflation risk: FDV/MCap ratio of ${ratio.toFixed(2)}x indicates ${(ratio - 1).toFixed(1)}x potential dilution if all tokens unlock.`;
            analysis.unlock_risks = `Significant unlock overhang: ${fmtUsd(p.market.fdv_usd - p.market.market_cap_usd)} of additional dilution potential.`;
        } else if (ratio > 2) {
            analysis.inflation = `Moderate inflation risk: FDV/MCap ratio of ${ratio.toFixed(2)}x.`;
            analysis.unlock_risks = `Moderate unlock risk: ${fmtUsd(p.market.fdv_usd - p.market.market_cap_usd)} of potential dilution.`;
        } else {
            analysis.inflation = `Low inflation risk: FDV/MCap ratio of ${ratio.toFixed(2)}x suggests most supply is already circulating.`;
            analysis.unlock_risks = `Low unlock risk: limited additional supply (${fmtUsd(p.market.fdv_usd - p.market.market_cap_usd)}).`;
        }
    } else {
        analysis.inflation = 'Inflation analysis unavailable (FDV or Market Cap missing).';
        analysis.unlock_risks = 'Unlock risk analysis unavailable (FDV or Market Cap missing).';
    }

    // Utility / Governance (inferred from sector)
    const sectorUtilities = {
        defi: 'Used for governance, fee discounts, and protocol revenue sharing',
        rwa: 'Used for settlement, governance, and access to tokenized real-world assets',
        layer1: 'Used for gas fees, staking, and network security',
        layer2: 'Used for transaction fees, governance, and sequencer operations',
        ai: 'Used for compute payments, governance, and access to AI services',
        depin: 'Used for network resource payments and provider rewards',
        infrastructure: 'Used for service payments and protocol governance',
        meme: 'Primarily community-driven; limited utility beyond speculation',
    };

    analysis.utility = sectorUtilities[p.sector] || 'Token utility details require protocol-specific research.';
    analysis.governance = p.sector === 'meme'
        ? 'No governance function (meme token).'
        : 'Governance participation likely; voting power proportional to holdings.';

    // Value capture (based on volume/mcap ratio)
    if (p.market?.volume_24h_usd != null && p.market?.market_cap_usd != null && p.market.market_cap_usd > 0) {
        const turn = p.market.volume_24h_usd / p.market.market_cap_usd;
        const turnDesc = turn > 0.3 ? 'very high' : turn > 0.1 ? 'high' : turn > 0.03 ? 'moderate' : 'low';
        analysis.value_capture = `Value capture signal: ${turnDesc} turnover ratio (${(turn * 100).toFixed(2)}% of market cap traded daily).`;
    } else {
        analysis.value_capture = 'Value capture analysis unavailable.';
    }

    analysis.emission = analysis.inflation;

    return analysis;
}

// ── 7. Ecosystem Analysis ────────────────────────────────────
function buildEcosystem(p) {
    return {
        developer_ecosystem: p.github?.full_name
            ? `Active on GitHub: ${p.github.full_name} (${fmtNum(p.github.stars || 0)} stars, ${p.github.commits_30d || 0} commits in last 30 days).`
            : (p.developer?.stars ? `GitHub presence detected (${fmtNum(p.developer.stars)} stars) but detailed repo data unavailable.` : 'Developer ecosystem data unavailable.'),

        community: p.social?.twitter_followers != null
            ? `Community size: ${fmtNum(p.social.twitter_followers)} Twitter followers${p.social.reddit_subscribers ? `, ${fmtNum(p.social.reddit_subscribers)} Reddit subscribers` : ''}.`
            : 'Community metrics unavailable.',

        liquidity: p.market?.volume_24h_usd != null
            ? `24h trading volume: ${fmtUsd(p.market.volume_24h_usd)}${p.market?.market_cap_usd ? ` (turnover: ${((p.market.volume_24h_usd / p.market.market_cap_usd) * 100).toFixed(2)}%)` : ''}.`
            : 'Liquidity data unavailable.',

        integrations: p.protocol?.chains?.length
            ? `Deployed across ${p.protocol.chains.length} chain(s): ${p.protocol.chains.slice(0, 5).join(', ')}${p.protocol.chains.length > 5 ? ` and ${p.protocol.chains.length - 5} more` : ''}.`
            : 'Multi-chain deployment information unavailable.',

        institutional_adoption: p.protocol?.tvl_usd != null && p.protocol.tvl_usd > 1e8
            ? `TVL of ${fmtUsd(p.protocol.tvl_usd)} suggests significant institutional or whale participation.`
            : (p.market?.market_cap_usd != null && p.market.market_cap_usd > 1e9
                ? `Large market cap (${fmtUsd(p.market.market_cap_usd)}) indicates broader institutional awareness.`
                : 'Institutional adoption cannot be assessed from available data.'),

        security: p.github?.has_issues != null
            ? `GitHub issues enabled${p.github.open_issues != null ? ` (${fmtNum(p.github.open_issues)} open, ${fmtNum(p.github.closed_issues || 0)} closed)` : ''}.${p.github.license ? ` Licensed under ${p.github.license}.` : ''}`
            : 'Security and repository health data unavailable.',
    };
}

// ── 8. Risk Analysis ─────────────────────────────────────────
function buildRiskAnalysis(p) {
    return {
        protocol_risk: p.protocol?.tvl_change_7d != null && p.protocol.tvl_change_7d < -10
            ? `Elevated: TVL declined ${fmtPct(p.protocol.tvl_change_7d)} in 7 days, indicating protocol-level risk.`
            : (p.protocol?.tvl_usd != null
                ? `Moderate: TVL of ${fmtUsd(p.protocol.tvl_usd)} with ${p.protocol.tvl_change_7d != null ? fmtPct(p.protocol.tvl_change_7d) + ' 7d change' : 'no recent change data'}.`
                : 'Protocol risk cannot be fully assessed (no TVL data).'),

        market_risk: p.market?.ath_change_pct != null
            ? `Current drawdown from ATH: ${fmtPct(p.market.ath_change_pct)}. ${Math.abs(p.market.ath_change_pct) > 80 ? 'Severe historical volatility.' : Math.abs(p.market.ath_change_pct) > 50 ? 'Significant historical volatility.' : 'Moderate volatility.'}`
            : 'Market risk data incomplete.',

        liquidity_risk: p.market?.volume_24h_usd != null && p.market?.market_cap_usd != null
            ? `Turnover ratio: ${((p.market.volume_24h_usd / p.market.market_cap_usd) * 100).toFixed(2)}% (${p.market.volume_24h_usd / p.market.market_cap_usd > 0.05 ? 'adequate' : p.market.volume_24h_usd / p.market.market_cap_usd > 0.01 ? 'moderate' : 'low'} liquidity).`
            : 'Liquidity risk cannot be assessed.',

        governance_risk: 'On-chain governance mechanisms require direct protocol research; not assessable from market data alone.',

        execution_risk: p.github?.commits_30d != null
            ? `${p.github.commits_30d > 50 ? 'Low' : p.github.commits_30d > 10 ? 'Moderate' : 'Elevated'} execution risk: ${p.github.commits_30d} commits in last 30 days${daysAgo(p.github.last_commit) != null ? `, last commit ${daysAgo(p.github.last_commit)} days ago` : ''}.`
            : 'Execution risk cannot be assessed (no GitHub activity data).',

        regulatory_risk: {
            'rwa': 'Elevated: subject to securities regulations in multiple jurisdictions.',
            'defi': 'Moderate: ongoing regulatory scrutiny of DeFi protocols.',
            'layer1': 'Moderate: regulatory landscape varies by jurisdiction.',
            'layer2': 'Moderate: dependent on underlying L1 regulatory framework.',
            'ai': 'Emerging: AI-specific regulations developing rapidly.',
            'meme': 'Lower: typically no functional utility to regulate.',
        }[p.sector] || 'Sector-specific regulatory risk requires specialized research.',

        technology_risk: p.github?.archived
            ? `High: GitHub repository is archived, indicating discontinued development.`
            : (p.github?.open_issues != null && p.github.open_issues > 500
                ? `Moderate: ${fmtNum(p.github.open_issues)} open issues suggest ongoing technical debt.`
                : (p.github?.full_name
                    ? `Low-Moderate: Active GitHub repository${p.github.language ? ` (${p.github.language})` : ''} with ${p.github.stars != null ? fmtNum(p.github.stars) + ' stars' : 'no star data'}.`
                    : 'Technology risk cannot be assessed (no GitHub data).')),
    };
}

// ── 9. AI Scores (with explanations) ─────────────────────────
function buildAIScores(p, completeness) {
    // Payd Score - копия логики из enrich_projects.js, но с объяснением
    let payd = 0, weights = 0, paydComponents = [];
    const mcap = p.market?.market_cap_usd;
    if (mcap != null) {
        const score = Math.min(Math.log10(Math.max(mcap, 1)) / 11 * 100, 100);
        payd += score * 0.20; weights += 0.20;
        paydComponents.push(`Market cap contribution: ${(score * 0.20).toFixed(1)} (weight 20%)`);
    }
    const stars = p.github?.stars ?? p.developer?.stars ?? 0;
    if (stars > 0) {
        const score = Math.min(Math.log10(stars + 1) / 5 * 100, 100);
        payd += score * 0.20; weights += 0.20;
        paydComponents.push(`GitHub stars contribution: ${(score * 0.20).toFixed(1)} (weight 20%)`);
    }
    const tvl = p.protocol?.tvl_usd;
    if (tvl != null && tvl > 0) {
        const score = Math.min(Math.log10(Math.max(tvl, 1)) / 10 * 100, 100);
        payd += score * 0.20; weights += 0.20;
        paydComponents.push(`TVL contribution: ${(score * 0.20).toFixed(1)} (weight 20%)`);
    }
    const followers = p.social?.twitter_followers || 0;
    if (followers > 0) {
        const score = Math.min(Math.log10(followers + 1) / 7 * 100, 100);
        payd += score * 0.15; weights += 0.15;
        paydComponents.push(`Social contribution: ${(score * 0.15).toFixed(1)} (weight 15%)`);
    }
    if (p.market?.change_24h_pct != null) {
        const ch24 = Math.abs(p.market.change_24h_pct);
        const score = Math.max(100 - ch24 * 3, 0);
        payd += score * 0.10; weights += 0.10;
        paydComponents.push(`Volatility contribution: ${(score * 0.10).toFixed(1)} (weight 10%)`);
    }
    if (mcap > 0 && p.market?.volume_24h_usd != null) {
        const liq = p.market.volume_24h_usd / mcap;
        const score = Math.min(liq * 500, 100);
        payd += score * 0.15; weights += 0.15;
        paydComponents.push(`Liquidity contribution: ${(score * 0.15).toFixed(1)} (weight 15%)`);
    }
    const paydScore = weights > 0 ? Math.round(payd / weights) : null;
    const paydExplanation = paydScore == null
        ? 'Insufficient data to calculate Payd Score'
        : `Weighted composite of ${paydComponents.length} factors. Components: ${paydComponents.join('; ')}.`;

    // Risk Score
    let risk = 50, riskComponents = ['Base risk: 50'];
    if (p.market?.ath_change_pct != null) {
        const add = Math.max(-p.market.ath_change_pct - 30, 0) * 0.5;
        risk += add;
        riskComponents.push(`ATH drawdown: +${add.toFixed(1)} (current: ${fmtPct(p.market.ath_change_pct)})`);
    }
    if (p.market?.market_cap_rank != null) {
        const sub = Math.max(50 - p.market.market_cap_rank, 0) * 0.3;
        risk -= sub;
        riskComponents.push(`Market rank adjustment: -${sub.toFixed(1)} (rank #${p.market.market_cap_rank})`);
    }
    if (p.github?.archived) {
        risk += 20;
        riskComponents.push('Archived repo: +20');
    }
    risk = Math.max(0, Math.min(100, Math.round(risk)));

    // Conviction Score
    let conviction = 50, convComponents = ['Base conviction: 50'];
    if (p.market?.change_7d_pct != null) {
        const add = Math.max(p.market.change_7d_pct, -20) * 2;
        conviction += add;
        convComponents.push(`7d momentum: ${add > 0 ? '+' : ''}${add.toFixed(1)}`);
    }
    if (p.github?.pushed_at) {
        const daysSince = daysAgo(p.github.pushed_at);
        if (daysSince != null) {
            if (daysSince < 7) { conviction += 10; convComponents.push('Recent push (<7d): +10'); }
            else if (daysSince > 60) { conviction -= 15; convComponents.push(`Stale push (${daysSince}d): -15`); }
        }
    }
    if (p.protocol?.tvl_change_7d != null) {
        const add = p.protocol.tvl_change_7d * 1.5;
        conviction += add;
        convComponents.push(`TVL 7d change: ${add > 0 ? '+' : ''}${add.toFixed(1)}`);
    }
    conviction = Math.max(0, Math.min(100, Math.round(conviction)));

    // Alpha Score
    let alpha = 50, alphaComponents = ['Base alpha: 50'];
    if (p.github?.language && p.github?.topics?.length) {
        const add = p.github.topics.length * 1.5;
        alpha += add;
        alphaComponents.push(`Topics diversity: +${add.toFixed(1)} (${p.github.topics.length} topics)`);
    }
    if (p.protocol?.chains?.length) {
        const add = p.protocol.chains.length * 2;
        alpha += add;
        alphaComponents.push(`Multi-chain: +${add} (${p.protocol.chains.length} chains)`);
    }
    alpha = Math.max(0, Math.min(100, Math.round(alpha)));

    // Confidence Score
    const conf = calculateConfidenceScore(p, completeness);

    return {
        payd: {
            value: paydScore,
            explanation: paydExplanation,
            components: paydComponents,
        },
        risk: {
            value: risk,
            explanation: `Risk assessment: ${riskComponents.join('; ')}.`,
            components: riskComponents,
        },
        conviction: {
            value: conviction,
            explanation: `Conviction signals: ${convComponents.join('; ')}.`,
            components: convComponents,
        },
        alpha: {
            value: alpha,
            explanation: `Alpha signals: ${alphaComponents.join('; ')}.`,
            components: alphaComponents,
        },
        confidence: conf,
    };
}

// ── 10. Opportunity Detection ────────────────────────────────
function detectOpportunities(p) {
    const opportunities = {
        undervalued: { detected: false, reason: null, source: null },
        fast_growing_ecosystem: { detected: false, reason: null, source: null },
        developer_acceleration: { detected: false, reason: null, source: null },
        revenue_acceleration: { detected: false, reason: null, source: null, note: 'Revenue data not available in current dataset' },
        tvl_growth: { detected: false, reason: null, source: null },
        institutional_adoption: { detected: false, reason: null, source: null },
        improving_fundamentals: { detected: false, reason: null, source: null },
        token_unlock_risks: { detected: false, reason: null, source: null },
        weakening_fundamentals: { detected: false, reason: null, source: null },
        emerging_narratives: { detected: false, reason: null, source: null },
    };

    // Undervalued (mcap/TVL < 0.5)
    if (p.protocol?.mcap_to_tvl != null && p.protocol.mcap_to_tvl > 0 && p.protocol.mcap_to_tvl < 0.5) {
        opportunities.undervalued = {
            detected: true,
            reason: `Market cap/TVL ratio of ${p.protocol.mcap_to_tvl.toFixed(2)} suggests token trades at significant discount to protocol's locked value.`,
            source: 'protocol.mcap_to_tvl',
            value: p.protocol.mcap_to_tvl,
        };
    }

    // Fast-growing ecosystem (TVL change 7d > 15%)
    if (p.protocol?.tvl_change_7d != null && p.protocol.tvl_change_7d > 15) {
        opportunities.fast_growing_ecosystem = {
            detected: true,
            reason: `TVL grew ${fmtPct(p.protocol.tvl_change_7d)} in last 7 days, indicating rapid ecosystem expansion.`,
            source: 'protocol.tvl_change_7d',
            value: p.protocol.tvl_change_7d,
        };
    }

    // Developer acceleration (commits 30d > 100)
    if (p.github?.commits_30d != null && p.github.commits_30d > 100) {
        opportunities.developer_acceleration = {
            detected: true,
            reason: `${p.github.commits_30d} commits in last 30 days indicates accelerated development velocity.`,
            source: 'github.commits_30d',
            value: p.github.commits_30d,
        };
    }

    // TVL growth (tvl_change_7d > 5%)
    if (p.protocol?.tvl_change_7d != null && p.protocol.tvl_change_7d > 5) {
        opportunities.tvl_growth = {
            detected: true,
            reason: `Positive TVL momentum: ${fmtPct(p.protocol.tvl_change_7d)} in last 7 days.`,
            source: 'protocol.tvl_change_7d',
            value: p.protocol.tvl_change_7d,
        };
    }

    // Institutional adoption proxy (TVL > $100M)
    if (p.protocol?.tvl_usd != null && p.protocol.tvl_usd > 1e8) {
        opportunities.institutional_adoption = {
            detected: true,
            reason: `TVL of ${fmtUsd(p.protocol.tvl_usd)} suggests significant institutional or whale participation.`,
            source: 'protocol.tvl_usd',
            value: p.protocol.tvl_usd,
        };
    }

    // Improving fundamentals (positive 7d + positive 30d)
    if (p.market?.change_7d_pct != null && p.market?.change_30d_pct != null
        && p.market.change_7d_pct > 0 && p.market.change_30d_pct > 0) {
        opportunities.improving_fundamentals = {
            detected: true,
            reason: `Positive momentum across timeframes: 7d ${fmtPct(p.market.change_7d_pct)}, 30d ${fmtPct(p.market.change_30d_pct)}.`,
            source: 'market.change_7d_pct, market.change_30d_pct',
            value: p.market.change_7d_pct,
        };
    }

    // Token unlock risks (FDV/MCap > 3x)
    if (p.market?.fdv_usd != null && p.market?.market_cap_usd != null
        && p.market.market_cap_usd > 0 && p.market.fdv_usd / p.market.market_cap_usd > 3) {
        const ratio = p.market.fdv_usd / p.market.market_cap_usd;
        opportunities.token_unlock_risks = {
            detected: true,
            reason: `Significant dilution overhang: FDV/MCap ratio of ${ratio.toFixed(2)}x.`,
            source: 'market.fdv_usd',
            value: ratio,
        };
    }

    // Weakening fundamentals (negative 7d + negative 30d + TVL decline)
    if (p.market?.change_7d_pct != null && p.market?.change_30d_pct != null
        && p.market.change_7d_pct < 0 && p.market.change_30d_pct < 0) {
        opportunities.weakening_fundamentals = {
            detected: true,
            reason: `Negative momentum: 7d ${fmtPct(p.market.change_7d_pct)}, 30d ${fmtPct(p.market.change_30d_pct)}.`,
            source: 'market.change_7d_pct, market.change_30d_pct',
            value: p.market.change_7d_pct,
        };
    }

    // Emerging narratives (sector-based)
    const hotSectors = ['ai', 'rwa', 'depin'];
    if (p.sector && hotSectors.includes(p.sector)) {
        opportunities.emerging_narratives = {
            detected: true,
            reason: `${p.sector.toUpperCase()} is considered an emerging narrative in the current market cycle.`,
            source: 'sector',
            value: p.sector,
        };
    }

    return opportunities;
}

// ── 11. Executive Summary ───────────────────────────────────
function buildExecutiveSummary(p, scores, completeness) {
    const parts = [];
    const sources = [];

    parts.push(`${p.name} (${p.symbol?.toUpperCase() || 'N/A'}) is a ${p.sector} project.`);
    sources.push('sector');

    if (p.market?.market_cap_usd != null) {
        parts.push(`Current market cap: ${fmtUsd(p.market.market_cap_usd)}${p.market?.market_cap_rank ? ` (rank #${p.market.market_cap_rank})` : ''}.`);
        sources.push('market.market_cap_usd');
    }
    if (p.market?.change_24h_pct != null) {
        parts.push(`24h price change: ${fmtPct(p.market.change_24h_pct)}.`);
        sources.push('market.change_24h_pct');
    }
    if (p.protocol?.tvl_usd != null) {
        parts.push(`TVL: ${fmtUsd(p.protocol.tvl_usd)}${p.protocol.tvl_change_7d != null ? ` (7d: ${fmtPct(p.protocol.tvl_change_7d)})` : ''}.`);
        sources.push('protocol.tvl_usd');
    }
    const stars = p.github?.stars ?? p.developer?.stars;
    if (stars != null) {
        parts.push(`GitHub stars: ${fmtNum(stars)}.`);
        sources.push(p.github?.stars ? 'github.stars' : 'developer.stars');
    }

    parts.push(`AI Scores — Payd: ${scores.payd.value ?? 'N/A'}, Risk: ${scores.risk.value}, Conviction: ${scores.conviction.value}, Alpha: ${scores.alpha.value}, Confidence: ${scores.confidence.value}/100.`);

    if (completeness.missing_fields.length > 0) {
        parts.push(`Note: ${completeness.missing_fields.length} data fields unavailable — Confidence Score reflects this.`);
    }

    return {
        summary: parts.join(' '),
        sources_used: [...new Set(sources)],
    };
}

// ── MAIN: Analyze a single project ──────────────────────────
function analyzeProject(p, sectorAverages) {
    const completeness = analyzeCompleteness(p);

    const thesis = buildThesis(p);
    const bullCase = buildBullCase(p);
    const bearCase = buildBearCase(p);
    const swot = buildSWOT(p);
    const competitive = buildCompetitive(p, sectorAverages);
    const tokenomics = buildTokenomics(p);
    const ecosystem = buildEcosystem(p);
    const risks = buildRiskAnalysis(p);
    const scores = buildAIScores(p, completeness);
    const opportunities = detectOpportunities(p);
    const summary = buildExecutiveSummary(p, scores, completeness);

    return {
        thesis: thesis.thesis,
        thesis_sources: thesis.sources_used,
        bull_case: bullCase.cases,
        bear_case: bearCase.cases,
        swot,
        competitive,
        tokenomics,
        ecosystem,
        risks,
        scores,
        opportunities,
        summary: summary.summary,
        summary_sources: summary.sources_used,
        meta: {
            engine_version: ENGINE_VERSION,
            analyzed_at: new Date().toISOString(),
            data_completeness: completeness.completeness,
            present_fields: completeness.present,
            total_fields: completeness.total,
            missing_fields: completeness.missing_fields,
        },
    };
}

// ── MAIN: Run on all projects ───────────────────────────────
function runAnalysis(inputFile, outputFile) {
    console.log(`\n═══ AI Research & Analysis Engine v${ENGINE_VERSION} ═══`);

    if (!fs.existsSync(inputFile)) {
        console.error(`Input file not found: ${inputFile}`);
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
    const projectIds = Object.keys(data);
    console.log(`Total projects to analyze: ${projectIds.length}`);

    // Calculate sector averages for competitive analysis
    const sectorSums = {};
    const sectorCounts = {};
    for (const id of projectIds) {
        const p = data[id];
        const s = p.sector || 'unknown';
        if (!sectorSums[s]) {
            sectorSums[s] = { market_cap_usd: 0, tvl_usd: 0 };
            sectorCounts[s] = 0;
        }
        if (p.market?.market_cap_usd != null) {
            sectorSums[s].market_cap_usd += p.market.market_cap_usd;
        }
        if (p.protocol?.tvl_usd != null) {
            sectorSums[s].tvl_usd += p.protocol.tvl_usd;
        }
        sectorCounts[s]++;
    }
    const sectorAverages = {};
    for (const [s, sums] of Object.entries(sectorSums)) {
        const count = sectorCounts[s];
        sectorAverages[s] = {
            market_cap_usd: count > 0 ? sums.market_cap_usd / count : null,
            tvl_usd: count > 0 ? sums.tvl_usd / count : null,
            count,
        };
    }

    const results = {};
    let analyzed = 0;
    const startTime = Date.now();

    for (const id of projectIds) {
        const p = data[id];
        try {
            results[id] = {
                ...analyzeProject(p, sectorAverages),
                _project_meta: {
                    id: p.id,
                    name: p.name,
                    symbol: p.symbol,
                    sector: p.sector,
                },
            };
            analyzed++;
        } catch (e) {
            console.error(`  ✗ ${id}: ${e.message}`);
            results[id] = { error: e.message };
        }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));

    console.log(`\n=== Analysis complete ===`);
    console.log(`Analyzed: ${analyzed}/${projectIds.length}`);
    console.log(`Time: ${elapsed}s`);
    console.log(`Output: ${outputFile}`);
    console.log(`Size: ${(fs.statSync(outputFile).size / 1024).toFixed(1)} KB`);

    // Quick statistics
    const scoreStats = {
        high_payd: 0,
        high_risk: 0,
        high_confidence: 0,
        opportunities_detected: 0,
    };
    for (const id of projectIds) {
        const r = results[id];
        if (r?.scores) {
            if (r.scores.payd.value != null && r.scores.payd.value >= 70) scoreStats.high_payd++;
            if (r.scores.risk.value >= 70) scoreStats.high_risk++;
            if (r.scores.confidence.value >= 80) scoreStats.high_confidence++;
        }
        if (r?.opportunities) {
            const detected = Object.values(r.opportunities).filter(o => o.detected).length;
            if (detected > 0) scoreStats.opportunities_detected += detected;
        }
    }
    console.log(`\nQuick stats:`);
    console.log(`  High Payd (≥70): ${scoreStats.high_payd}`);
    console.log(`  High Risk (≥70): ${scoreStats.high_risk}`);
    console.log(`  High Confidence (≥80): ${scoreStats.high_confidence}`);
    console.log(`  Total opportunities detected: ${scoreStats.opportunities_detected}`);

    return results;
}

module.exports = { analyzeProject, runAnalysis, analyzeCompleteness, ENGINE_VERSION };

// CLI mode
if (require.main === module) {
    const inputFile = process.argv[2] || '/workspace/public/data/projects_enriched.json';
    const outputFile = process.argv[3] || '/workspace/public/data/projects_ai_analyzed.json';
    runAnalysis(inputFile, outputFile);
}
