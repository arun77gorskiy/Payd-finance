/* =================================================================
   PAYD Intelligence V2 — БЫСТРЫЙ Enrichment (только /markets)
   ----------------------------------------------------------------
   Получает данные через:
   1. CoinGecko /markets (1-2 запроса для всех 349 проектов)
   2. DefiLlama /protocols (1 запрос)
   НЕ использует /coins/{id} (медленно, 429)
   НЕ использует GitHub (rate limit)
   ================================================================= */

const fs = require('fs');
const path = require('path');
const { DEFI_LLAMA_SLUGS } = require('./data_mappings.js');

const DATA_DIR = '/workspace/public/data';
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const ENRICHED_FILE = path.join(DATA_DIR, 'projects_enriched_fast.json');

const lastCall = { coingecko: 0, defillama: 0 };
const RATE_MS = { coingecko: 6000, defillama: 1000 };

async function rateLimitedFetch(name, url) {
    const wait = RATE_MS[name] - (Date.now() - (lastCall[name] || 0));
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastCall[name] = Date.now();
    try {
        const r = await fetch(url, { headers: { 'User-Agent': 'PAYD-Fast/1.0' } });
        if (r.status === 429) {
            console.log(`  ⚠ ${name} 429 — спим 30s...`);
            await new Promise(res => setTimeout(res, 30000));
            return rateLimitedFetch(name, url);
        }
        if (!r.ok) return { ok: false, status: r.status };
        return { ok: true, data: await r.json() };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

function calcScores(p) {
    let payd = 0, weights = 0;
    const mcap = p.market?.market_cap_usd;
    if (mcap) {
        payd += Math.min(Math.log10(mcap) / 11 * 100, 100) * 0.30;
        weights += 0.30;
    }
    const tvl = p.protocol?.tvl_usd;
    if (tvl) {
        payd += Math.min(Math.log10(tvl) / 10 * 100, 100) * 0.25;
        weights += 0.25;
    }
    if (p.market?.change_7d_pct != null) {
        payd += Math.max(50 + p.market.change_7d_pct * 2, 0) * 0.15;
        weights += 0.15;
    }
    if (mcap > 0 && p.market?.volume_24h_usd) {
        payd += Math.min(p.market.volume_24h_usd / mcap * 500, 100) * 0.15;
        weights += 0.15;
    }
    const rank = p.market?.market_cap_rank;
    if (rank) {
        payd += Math.max(100 - rank, 0) * 0.15;
        weights += 0.15;
    }
    const paydScore = weights > 0 ? Math.round(payd / weights) : null;

    let risk = 50;
    if (p.market?.ath_change_pct != null) risk += Math.max(-p.market.ath_change_pct - 30, 0) * 0.5;
    if (rank) risk -= Math.max(50 - rank, 0) * 0.3;
    risk = Math.max(0, Math.min(100, Math.round(risk)));

    let conviction = 50;
    if (p.market?.change_7d_pct != null) conviction += Math.max(p.market.change_7d_pct, -20) * 2;
    if (p.protocol?.tvl_change_7d != null) conviction += p.protocol.tvl_change_7d * 1.5;
    conviction = Math.max(0, Math.min(100, Math.round(conviction)));

    return { payd_score: paydScore, risk_score: risk, conviction_score: conviction, alpha_score: 50 };
}

function buildBullCase(p) {
    const b = [];
    if (p.market?.change_30d_pct > 20) b.push('Strong 30-day uptrend');
    if (p.protocol?.tvl_change_7d > 5) b.push('TVL growing 7d');
    if (p.market?.market_cap_rank && p.market.market_cap_rank <= 100) b.push('Top 100 by market cap');
    if (p.protocol?.tvl_usd > 1e8) b.push(`TVL $${(p.protocol.tvl_usd/1e6).toFixed(0)}M`);
    if (p.market?.change_24h_pct > 5) b.push('Strong 24h momentum');
    if (p.protocol?.chains?.length >= 3) b.push('Multi-chain deployment');
    return b.length ? b : ['Mature market presence'];
}

function buildBearCase(p) {
    const b = [];
    if (p.market?.ath_change_pct < -70) b.push(`Down ${Math.abs(p.market.ath_change_pct).toFixed(0)}% from ATH`);
    if (p.market?.change_30d_pct < -20) b.push('Bearish 30-day trend');
    if (p.protocol?.tvl_change_7d < -10) b.push('TVL declining');
    if (p.market?.volume_24h_usd < 100000) b.push('Low liquidity');
    return b.length ? b : ['No major red flags detected'];
}

function buildThesis(p) {
    const t = [];
    if (p.market?.market_cap_usd > 1e9) t.push('Established market cap (>$1B)');
    if (p.protocol?.tvl_usd > 1e8) t.push('Significant TVL');
    if (p.market?.change_24h_pct > 5) t.push('Strong 24h momentum');
    if (p.market?.market_cap_rank && p.market.market_cap_rank <= 50) t.push('Top 50 by market cap');
    return t;
}

async function main() {
    console.log('═══ PAYD Fast Enrichment v2 ═══\n');
    const projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
    console.log(`Проектов: ${projects.length}\n`);

    // ── 1. CoinGecko /markets (по нашему списку ids) ──
    console.log('→ CoinGecko /markets (по нашему списку)...');
    const allCoinIds = projects.map(p => p.coingeckoId).filter(Boolean);
    const allCoins = [];
    for (let i = 0; i < allCoinIds.length; i += 200) {
        const batch = allCoinIds.slice(i, i + 200);
        const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(batch.join(','))}&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=1h%2C24h%2C7d%2C30d`;
        const res = await rateLimitedFetch('coingecko', url);
        if (res.ok && Array.isArray(res.data)) {
            allCoins.push(...res.data);
            console.log(`  Batch ${Math.floor(i/200)+1}: ${res.data.length}/${batch.length} монет`);
        } else {
            console.log(`  Batch ${Math.floor(i/200)+1} FAILED: ${res.status}`);
        }
    }
    const coinMap = new Map();
    allCoins.forEach(c => coinMap.set(c.id, c));
    console.log(`  ✓ Загружено: ${coinMap.size}/${allCoinIds.length}\n`);

    // ── 2. DefiLlama /protocols ──
    console.log('→ DefiLlama /protocols...');
    const llamaRes = await rateLimitedFetch('defillama', 'https://api.llama.fi/protocols');
    const llamaMap = new Map();
    if (llamaRes.ok) {
        llamaRes.data.forEach(p => {
            if (p.slug) llamaMap.set(p.slug.toLowerCase(), p);
        });
        console.log(`  ✓ Протоколов: ${llamaMap.size}\n`);
    } else {
        console.log('  ✗ DefiLlama недоступен\n');
    }

    // ── 3. Обогащение ──
    console.log('→ Обогащение...');
    const enriched = {};
    let ok = 0, skipped = 0;

    for (const project of projects) {
        const cg = coinMap.get(project.coingeckoId);
        if (!cg) {
            skipped++;
            continue;
        }

        const data = {
            id: project.id,
            symbol: project.symbol,
            name: project.name,
            sector: project.sector,
            coingecko_id: project.coingeckoId,
            last_enriched_at: new Date().toISOString(),
            market: {
                price_usd: cg.current_price,
                market_cap_usd: cg.market_cap,
                fdv_usd: cg.fully_diluted_valuation,
                circulating_supply: cg.circulating_supply,
                total_supply: cg.total_supply,
                max_supply: cg.max_supply,
                volume_24h_usd: cg.total_volume,
                change_1h_pct: cg.price_change_percentage_1h_in_currency,
                change_24h_pct: cg.price_change_percentage_24h_in_currency,
                change_7d_pct: cg.price_change_percentage_7d_in_currency,
                change_30d_pct: cg.price_change_percentage_30d_in_currency,
                ath: cg.ath,
                ath_change_pct: cg.ath_change_percentage,
                atl: cg.atl,
                atl_change_pct: cg.atl_change_percentage,
                market_cap_rank: cg.market_cap_rank,
                image: cg.image,
            },
            social: {
                twitter_handle: project.xHandle || null,
                twitter_url: project.xHandle ? `https://x.com/${project.xHandle}` : null,
                website: project.website || null,
            },
        };

        // DefiLlama
        const mappedSlug = DEFI_LLAMA_SLUGS[project.coingeckoId] || DEFI_LLAMA_SLUGS[project.id];
        const slugs = [mappedSlug, project.id, project.symbol?.toLowerCase()].filter(Boolean);
        let llama = null;
        for (const s of slugs) {
            if (llamaMap.has(s.toLowerCase())) {
                llama = llamaMap.get(s.toLowerCase());
                break;
            }
        }
        if (llama) {
            data.protocol = {
                slug: llama.slug,
                tvl_usd: llama.tvl,
                tvl_change_24h: llama.change_1d,
                tvl_change_7d: llama.change_7d,
                category: llama.category,
                chains: llama.chains || [],
                mcap_to_tvl: llama.mcapToTvl,
                fdv_to_tvl: llama.fdvToTvl,
            };
        }

        // AI Scores
        const scores = calcScores(data);
        data.ai = {
            ...scores,
            thesis: buildThesis(data),
            bull_case: buildBullCase(data),
            bear_case: buildBearCase(data),
            opinion: scores.payd_score >= 70 ? 'High-conviction opportunity' :
                    scores.payd_score >= 50 ? 'Average metrics, watchlist' :
                    'Below average metrics',
            calculated_at: new Date().toISOString(),
        };

        enriched[project.id] = data;
        ok++;
    }

    fs.writeFileSync(ENRICHED_FILE, JSON.stringify(enriched, null, 2));
    console.log(`\n═══ Summary ═══`);
    console.log(`Успех: ${ok} | Пропущено: ${skipped}`);
    console.log(`Файл: ${ENRICHED_FILE} (${(fs.statSync(ENRICHED_FILE).size / 1024 / 1024).toFixed(2)} MB)`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
