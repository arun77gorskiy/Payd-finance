/* =================================================================
   PAYD Intelligence V2 — Data Enrichment Pipeline (v2)
   ----------------------------------------------------------------
   Обогащает projects.json данными из:
   - CoinGecko (рынок, supply, ATH/ATL, social)
   - DefiLlama (TVL, протоколы)
   - GitHub (stars, forks, commits, contributors, languages)
   - TokenUnlocks (skip без API key)

   Использование:
     node code/enrich_projects.js                    # full run
     node code/enrich_projects.js --input test       # тестовый набор
     node code/enrich_projects.js --input full --batch 50
   ================================================================= */

const fs = require('fs');
const path = require('path');
const { DEFI_LLAMA_SLUGS, GITHUB_REPO_FALLBACKS } = require('./data_mappings.js');

const DATA_DIR = '/workspace/public/data';
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const TEST_FILE = path.join(DATA_DIR, 'projects_test.json');
const ENRICHED_FILE = path.join(DATA_DIR, 'projects_enriched.json');
const TEST_OUTPUT = path.join(DATA_DIR, 'projects_test_enriched.json');
const PROGRESS_FILE = path.join(DATA_DIR, '_enrich_progress.json');

const args = process.argv.slice(2);
const argsMap = {};
args.forEach((arg, i) => {
    if (arg.startsWith('--')) argsMap[arg.slice(2)] = args[i + 1];
});

const INPUT_MODE = argsMap.input || 'full'; // 'full' | 'test'
const IS_TEST = INPUT_MODE === 'test';
const BATCH_SIZE = parseInt(argsMap.batch || (IS_TEST ? '5' : '50'), 10);
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const SKIP_GITHUB = argsMap['skip-github'] === 'true' || argsMap['skip-github'] === '1';
const SKIP_DETAIL = argsMap['skip-detail'] === 'true' || argsMap['skip-detail'] === '1'; // пропустить /coins/{id} детали (для скорости)

const PROJECTS_IN = IS_TEST ? TEST_FILE : PROJECTS_FILE;
const ENRICHED_OUT = IS_TEST ? TEST_OUTPUT : ENRICHED_FILE;

// Сектора, для которых запрашиваем DefiLlama TVL
const TVL_SECTORS = new Set(['defi', 'rwa', 'layer1', 'layer2', 'infrastructure', 'depin']);

// ── Rate-limited fetch ──────────────────────────────────────────────
const lastCall = { coingecko: 0, defillama: 0, github: 0, coingeckoCoin: 0 };
const RATE_MS = {
    coingecko: IS_TEST ? 1000 : 7000,
    coingeckoCoin: 3000,
    defillama: 800,
    github: GITHUB_TOKEN ? 1500 : 5000, // без токена: 12 req/min
};

async function rateLimitedFetch(name, url, opts = {}) {
    const now = Date.now();
    const wait = RATE_MS[name] - (now - (lastCall[name] || 0));
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastCall[name] = Date.now();

    const headers = { 'User-Agent': 'PAYD-Intel-Enrichment/2.0', ...(opts.headers || {}) };
    if (name === 'github' && GITHUB_TOKEN) {
        headers['Authorization'] = `token ${GITHUB_TOKEN}`;
    }

    try {
        const r = await fetch(url, { ...opts, headers });
        if (r.status === 429) {
            const retryAfter = parseInt(r.headers.get('Retry-After') || '60', 10);
            console.log(`  ⚠ ${name} 429 — спим ${retryAfter}s...`);
            await new Promise(res => setTimeout(res, retryAfter * 1000));
            return rateLimitedFetch(name, url, opts);
        }
        if (r.status === 403) {
            const remaining = r.headers.get('X-RateLimit-Remaining');
            if (remaining === '0') {
                const reset = parseInt(r.headers.get('X-RateLimit-Reset') || '60', 10) * 1000;
                const waitMs = Math.max(reset - Date.now(), 30000);
                console.log(`  ⚠ ${name} rate limit exhausted. Ждём ${Math.round(waitMs/1000)}s...`);
                await new Promise(res => setTimeout(res, waitMs));
                return rateLimitedFetch(name, url, opts);
            }
        }
        if (!r.ok) return { ok: false, status: r.status, data: null };
        const data = await r.json();
        return { ok: true, status: r.status, data };
    } catch (e) {
        return { ok: false, status: 0, error: e.message };
    }
}

// ── API: CoinGecko ──────────────────────────────────────────────────
async function fetchCoinGeckoMarkets(coinIds) {
    const all = [];
    for (let i = 0; i < coinIds.length; i += 200) {
        const batch = coinIds.slice(i, i + 200);
        const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(batch.join(','))}&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=1h%2C24h%2C7d%2C30d`;
        const res = await rateLimitedFetch('coingecko', url);
        if (res.ok && Array.isArray(res.data)) all.push(...res.data);
    }
    return all;
}

async function fetchCoinGeckoCoin(coinId) {
    const url = `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}?localization=false&tickers=false&market_data=false&community_data=true&developer_data=true`;
    const res = await rateLimitedFetch('coingeckoCoin', url);
    return res.ok ? res.data : null;
}

// ── API: DefiLlama ──────────────────────────────────────────────────
async function fetchDefiLlamaProtocols() {
    const url = 'https://api.llama.fi/protocols';
    const res = await rateLimitedFetch('defillama', url);
    if (!res.ok || !Array.isArray(res.data)) return [];
    return res.data;
}

async function fetchDefiLlamaProtocolTvl(slug) {
    const url = `https://api.llama.fi/protocol/${encodeURIComponent(slug)}`;
    const res = await rateLimitedFetch('defillama', url);
    return res.ok ? res.data : null;
}

// ── API: GitHub ──────────────────────────────────────────────────────
async function fetchGitHubRepo(owner, repo) {
    const url = `https://api.github.com/repos/${owner}/${repo}`;
    const res = await rateLimitedFetch('github', url);
    return res.ok ? res.data : null;
}

async function fetchGitHubCommits(owner, repo, since) {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits?since=${since}&per_page=100`;
    const res = await rateLimitedFetch('github', url);
    return res.ok && Array.isArray(res.data) ? res.data : [];
}

async function fetchGitHubLanguages(owner, repo) {
    const url = `https://api.github.com/repos/${owner}/${repo}/languages`;
    const res = await rateLimitedFetch('github', url);
    return res.ok ? res.data : null;
}

// ── AI Score calculation ───────────────────────────────────────────
function calcScores(p) {
    // Payd Score (0-100): взвешенная комбинация доступных сигналов
    let payd = 0;
    let weights = 0;

    // Market cap weight
    const mcap = p.market?.market_cap_usd;
    if (mcap != null) {
        const mcapScore = Math.min(Math.log10(Math.max(mcap, 1)) / 11 * 100, 100);
        payd += mcapScore * 0.20;
        weights += 0.20;
    }

    // GitHub stars (из прямого GitHub или CoinGecko developer_data)
    const stars = p.github?.stars ?? p.developer?.stars ?? 0;
    if (stars > 0) {
        const ghScore = Math.min(Math.log10(stars + 1) / 5 * 100, 100);
        payd += ghScore * 0.20;
        weights += 0.20;
    }

    // TVL weight
    const tvl = p.protocol?.tvl_usd;
    if (tvl != null && tvl > 0) {
        const tvlScore = Math.min(Math.log10(Math.max(tvl, 1)) / 10 * 100, 100);
        payd += tvlScore * 0.20;
        weights += 0.20;
    }

    // Social (twitter followers)
    const followers = p.social?.twitter_followers || 0;
    if (followers > 0) {
        const socScore = Math.min(Math.log10(followers + 1) / 7 * 100, 100);
        payd += socScore * 0.15;
        weights += 0.15;
    }

    // 24h change (volatility signal)
    const ch24 = Math.abs(p.market?.change_24h_pct || 0);
    if (p.market?.change_24h_pct != null) {
        const volScore = Math.max(100 - ch24 * 3, 0);
        payd += volScore * 0.10;
        weights += 0.10;
    }

    // Liquidity (volume/mcap ratio)
    if (mcap > 0 && p.market?.volume_24h_usd != null) {
        const liq = p.market.volume_24h_usd / mcap;
        const liqScore = Math.min(liq * 500, 100);
        payd += liqScore * 0.15;
        weights += 0.15;
    }

    const paydScore = weights > 0 ? Math.round(payd / weights) : null;

    // Risk Score (0-100, higher = riskier)
    let risk = 50;
    if (p.market?.ath_change_pct != null) {
        // Сильное падение от ATH = высокий риск
        risk += Math.max(-p.market.ath_change_pct - 30, 0) * 0.5;
    }
    if (p.market?.market_cap_rank != null) {
        risk -= Math.max(50 - p.market.market_cap_rank, 0) * 0.3;
    }
    if (p.github?.archived) risk += 20;
    risk = Math.max(0, Math.min(100, Math.round(risk)));

    // Conviction: на основе динамики и активности
    let conviction = 50;
    if (p.market?.change_7d_pct != null) conviction += Math.max(p.market.change_7d_pct, -20) * 2;
    if (p.github?.pushed_at) {
        const daysSince = (Date.now() - new Date(p.github.pushed_at).getTime()) / 86400000;
        if (daysSince < 7) conviction += 10;
        else if (daysSince > 60) conviction -= 15;
    }
    if (p.protocol?.tvl_change_7d != null) conviction += p.protocol.tvl_change_7d * 1.5;
    conviction = Math.max(0, Math.min(100, Math.round(conviction)));

    // Alpha Score: на основе уникальности (GitHub уникальность + объём торгов)
    let alpha = 50;
    if (p.github?.language && p.github?.topics?.length) alpha += p.github.topics.length * 1.5;
    if (p.protocol?.chains?.length) alpha += p.protocol.chains.length * 2;
    alpha = Math.max(0, Math.min(100, Math.round(alpha)));

    return {
        payd_score: paydScore,
        risk_score: risk,
        conviction_score: conviction,
        alpha_score: alpha,
    };
}

function buildInvestmentThesis(p) {
    const t = [];
    if (p.market?.market_cap_usd > 1e9) t.push('Established market cap (>$1B)');
    else if (p.market?.market_cap_usd > 1e8) t.push('Mid-cap with growth potential');
    if (p.github?.stars > 1000) t.push(`Strong developer interest (${p.github.stars.toLocaleString()} stars)`);
    if (p.protocol?.tvl_usd > 1e8) t.push(`Significant TVL ($${(p.protocol.tvl_usd/1e6).toFixed(0)}M)`);
    if (p.market?.change_24h_pct > 5) t.push('Strong 24h momentum');
    if (p.market?.change_24h_pct < -10) t.push('Recent sharp correction');
    if (p.github?.pushed_at && (Date.now() - new Date(p.github.pushed_at).getTime()) < 7*86400000) t.push('Active development (commits this week)');
    if (p.social?.twitter_followers > 100000) t.push('Large community');
    if (p.protocol?.chains?.length >= 3) t.push('Multi-chain deployment');
    return t;
}

function buildBullCase(p) {
    const b = [];
    if (p.market?.change_30d_pct > 20) b.push('Strong 30-day uptrend');
    if (p.protocol?.tvl_change_7d > 5) b.push('TVL growing 7d');
    if (p.market?.market_cap_rank && p.market.market_cap_rank <= 100) b.push('Top 100 by market cap');
    if (p.github?.stars > 5000) b.push('Major open-source presence');
    if (p.protocol?.mcap_to_tvl && p.protocol.mcap_to_tvl < 1) b.push('Undervalued relative to TVL');
    if (p.protocol?.chains?.length >= 5) b.push('Broad multi-chain reach');
    return b.length ? b : ['Mature ecosystem with broad support'];
}

function buildBearCase(p) {
    const b = [];
    if (p.market?.ath_change_pct < -70) b.push(`Down ${Math.abs(p.market.ath_change_pct).toFixed(0)}% from ATH`);
    if (p.market?.change_30d_pct < -20) b.push('Bearish 30-day trend');
    if (p.protocol?.tvl_change_7d < -10) b.push('TVL declining');
    if (p.github?.archived) b.push('GitHub repo archived');
    if (p.github?.open_issues > 1000) b.push('Large open issue backlog');
    if (p.market?.volume_24h_usd < 100000) b.push('Low liquidity');
    if (p.github?.pushed_at && (Date.now() - new Date(p.github.pushed_at).getTime()) > 90*86400000) b.push('No recent development activity');
    return b.length ? b : ['No major red flags detected'];
}

function buildAiOpinion(p, scores) {
    if (!scores.payd_score) return 'Insufficient data for opinion';
    const s = scores.payd_score;
    const r = scores.risk_score;
    if (s >= 70 && r < 50) return 'Strong conviction with manageable risk profile';
    if (s >= 70) return 'High-scoring opportunity, monitor risk factors';
    if (s >= 50 && r < 50) return 'Balanced opportunity with stable risk metrics';
    if (s >= 50) return 'Average metrics, requires deeper due diligence';
    if (r >= 70) return 'High-risk profile, caution advised';
    return 'Below-average metrics, watchlist only';
}

// ── Main enrichment ────────────────────────────────────────────────
async function enrich() {
    console.log('═══ PAYD Intelligence V2 — Data Enrichment Pipeline (v2) ═══');
    console.log(`Режим: ${IS_TEST ? 'ТЕСТ (10 проектов)' : 'ПОЛНЫЙ'} | Batch: ${BATCH_SIZE} | GitHub token: ${GITHUB_TOKEN ? 'YES' : 'NO'}\n`);

    if (!fs.existsSync(PROJECTS_IN)) {
        throw new Error(`Файл не найден: ${PROJECTS_IN}`);
    }

    const projects = JSON.parse(fs.readFileSync(PROJECTS_IN, 'utf8'));
    console.log(`Загружено проектов: ${projects.length}`);

    // Прогресс
    let progress = { done: {} };
    if (fs.existsSync(PROGRESS_FILE) && !IS_TEST) {
        try {
            progress = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
            console.log(`Уже обработано: ${Object.keys(progress.done).length}`);
        } catch (e) {}
    }

    const toEnrich = projects.filter(p => p.coingeckoId && !progress.done[p.id]);
    console.log(`К обогащению: ${toEnrich.length}\n`);

    // ── 1. CoinGecko batch ─────────────────────────────────
    console.log('→ [1/4] CoinGecko /markets batch...');
    const coinIds = toEnrich.map(p => p.coingeckoId);
    const cgMarkets = await fetchCoinGeckoMarkets(coinIds);
    const cgMarketMap = new Map();
    cgMarkets.forEach(c => cgMarketMap.set(c.id, c));
    console.log(`  ✓ CoinGecko: ${cgMarketMap.size}/${coinIds.length} монет\n`);

    // ── 2. DefiLlama protocols lookup ─────────────────────
    console.log('→ [2/4] DefiLlama /protocols...');
    const llamaProtocols = await fetchDefiLlamaProtocols();
    const llamaMap = new Map();
    llamaProtocols.forEach(p => {
        if (p.slug) llamaMap.set(p.slug.toLowerCase(), p);
    });
    console.log(`  ✓ DefiLlama: ${llamaMap.size} протоколов\n`);

    // ── 3. Per-project enrichment ─────────────────────────
    console.log('→ [3/4] Per-project enrichment...');
    const enriched = {};
    let ok = 0, fail = 0;
    const errors = [];

    for (let idx = 0; idx < toEnrich.length; idx++) {
        const project = toEnrich[idx];
        const id = project.id;

        try {
            const data = {
                id,
                symbol: project.symbol,
                name: project.name,
                sector: project.sector,
                coingecko_id: project.coingeckoId,
                last_enriched_at: new Date().toISOString(),
            };

            // ── CoinGecko market ──
            const cg = cgMarketMap.get(project.coingeckoId);
            if (cg) {
                data.market = {
                    price_usd: cg.current_price ?? null,
                    market_cap_usd: cg.market_cap ?? null,
                    fdv_usd: cg.fully_diluted_valuation ?? null,
                    circulating_supply: cg.circulating_supply ?? null,
                    total_supply: cg.total_supply ?? null,
                    max_supply: cg.max_supply ?? null,
                    volume_24h_usd: cg.total_volume ?? null,
                    change_24h_pct: cg.price_change_percentage_24h_in_currency ?? null,
                    change_7d_pct: cg.price_change_percentage_7d_in_currency ?? null,
                    change_30d_pct: cg.price_change_percentage_30d_in_currency ?? null,
                    change_1h_pct: cg.price_change_percentage_1h_in_currency ?? null,
                    ath: cg.ath ?? null,
                    ath_change_pct: cg.ath_change_percentage ?? null,
                    atl: cg.atl ?? null,
                    atl_change_pct: cg.atl_change_percentage ?? null,
                    market_cap_rank: cg.market_cap_rank ?? null,
                    last_updated: cg.last_updated ?? null,
                    image: cg.image ?? null,
                };
            }

            // ── CoinGecko detailed (community + developer data) ──
            // Пробуем получить social/developer метрики
            const cgDetail = await fetchCoinGeckoCoin(project.coingeckoId);
            if (cgDetail) {
                data.social = {
                    twitter_handle: cgDetail.links?.twitter_screen_name || null,
                    twitter_url: cgDetail.links?.twitter_screen_name ? `https://x.com/${cgDetail.links.twitter_screen_name}` : null,
                    twitter_followers: cgDetail.community_data?.twitter_followers ?? null,
                    reddit_subscribers: cgDetail.community_data?.reddit_subscribers ?? null,
                    telegram_channel: cgDetail.links?.telegram_channel_identifier || null,
                    discord: cgDetail.links?.chat_url?.find(u => u.includes('discord')) || null,
                    website: project.website || (cgDetail.links?.homepage?.[0] ?? null),
                };
                data.developer = {
                    stars: cgDetail.developer_data?.stars ?? null,
                    forks: cgDetail.developer_data?.forks ?? null,
                    subscribers: cgDetail.developer_data?.subscribers ?? null,
                    total_issues: cgDetail.developer_data?.total_issues ?? null,
                    closed_issues: cgDetail.developer_data?.closed_issues ?? null,
                    pull_requests_merged: cgDetail.developer_data?.pull_requests_merged ?? null,
                    commit_count_4_weeks: cgDetail.developer_data?.commit_count_4_weeks ?? null,
                };
                data.description = cgDetail.description?.en || null;
                data.categories = cgDetail.categories || [];
            }

            // ── DefiLlama ──
            if (TVL_SECTORS.has(project.sector)) {
                // 1) Сначала пробуем ручной маппинг
                const mappedSlug = DEFI_LLAMA_SLUGS[project.coingeckoId] || DEFI_LLAMA_SLUGS[project.id];
                const slugs = [mappedSlug, project.id, project.symbol?.toLowerCase(), project.coingeckoId].filter(Boolean);
                let llama = null;
                let matchedSlug = null;
                for (const s of slugs) {
                    if (llamaMap.has(s.toLowerCase())) {
                        llama = llamaMap.get(s.toLowerCase());
                        matchedSlug = s;
                        break;
                    }
                }
                if (llama) {
                    data.protocol = {
                        slug: llama.slug,
                        tvl_usd: llama.tvl ?? null,
                        tvl_change_24h: llama.change_1d ?? null,
                        tvl_change_7d: llama.change_7d ?? null,
                        category: llama.category || null,
                        chains: llama.chains || [],
                        mcap_to_tvl: llama.mcapToTvl ?? null,
                        methodology: (llama.methodology || '').slice(0, 200),
                        fdv_to_tvl: llama.fdvToTvl ?? null,
                    };
                }
            }

            // ── GitHub repo (опционально — для скорости можно пропустить) ──
            // Используем CoinGecko developer_data как основной источник GitHub-метрик
            const repoCandidates = [];
            if (project.githubRepo) repoCandidates.push(project.githubRepo);
            if (GITHUB_REPO_FALLBACKS[project.coingeckoId]) {
                repoCandidates.push(...GITHUB_REPO_FALLBACKS[project.coingeckoId]);
            }
            if (GITHUB_REPO_FALLBACKS[project.id]) {
                repoCandidates.push(...GITHUB_REPO_FALLBACKS[project.id]);
            }

            // GitHub (если не отключен флагом --skip-github)
            if (!SKIP_GITHUB) {
                for (const candidate of repoCandidates) {
                    const parts = candidate.split('/');
                    if (parts.length < 2) continue;
                    const owner = parts[0];
                    const repo = parts[1];
                    const gh = await fetchGitHubRepo(owner, repo);
                    if (gh) {
                        data.github = {
                            owner,
                            repo,
                            full_name: gh.full_name,
                            stars: gh.stargazers_count || 0,
                            forks: gh.forks_count || 0,
                            open_issues: gh.open_issues_count || 0,
                            watchers: gh.subscribers_count || 0,
                            language: gh.language || null,
                            size_kb: gh.size || 0,
                            default_branch: gh.default_branch || 'main',
                            created_at: gh.created_at || null,
                            updated_at: gh.updated_at || null,
                            pushed_at: gh.pushed_at || null,
                            topics: gh.topics || [],
                            license: gh.license?.spdx_id || null,
                            archived: gh.archived || false,
                            disabled: gh.disabled || false,
                            has_issues: gh.has_issues || false,
                            homepage: gh.homepage || null,
                            description: gh.description || null,
                            source_repo: candidate,
                        };

                        // Languages
                        const langs = await fetchGitHubLanguages(owner, repo);
                        if (langs && typeof langs === 'object') {
                            const total = Object.values(langs).reduce((a, b) => a + b, 0);
                            data.github.languages = Object.entries(langs).map(([name, bytes]) => ({
                                name,
                                bytes,
                                pct: total > 0 ? Math.round(bytes / total * 100) : 0,
                            })).sort((a, b) => b.bytes - a.bytes);
                        }

                        // Commits за последние 30 дней
                        const since30d = new Date(Date.now() - 30*86400000).toISOString();
                        const commits = await fetchGitHubCommits(owner, repo, since30d);
                        data.github.commits_30d = commits.length;
                        data.github.last_commit = commits[0]?.commit?.author?.date || gh.pushed_at;
                        break; // Успех — выходим
                    } // if (gh)
                } // for candidate
            } // if (!SKIP_GITHUB)

            // ── AI Scores ──
            const scores = calcScores(data);
            data.ai = {
                ...scores,
                thesis: buildInvestmentThesis(data),
                bull_case: buildBullCase(data),
                bear_case: buildBearCase(data),
                opinion: buildAiOpinion(data, scores),
                calculated_at: new Date().toISOString(),
            };

            enriched[id] = data;
            progress.done[id] = true;
            ok++;

            if ((idx + 1) % 5 === 0 || idx === toEnrich.length - 1) {
                console.log(`  [${idx + 1}/${toEnrich.length}] ✓ ${project.name} (${project.symbol}) — payd:${scores.payd_score ?? '?'} risk:${scores.risk_score} bull:${(data.ai.bull_case || []).length} bear:${(data.ai.bear_case || []).length}`);
            }

            // Периодическое сохранение
            if (!IS_TEST && (idx + 1) % BATCH_SIZE === 0) {
                fs.writeFileSync(ENRICHED_OUT, JSON.stringify({ ...enriched, ...loadExisting() }, null, 2));
                fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
            }

        } catch (e) {
            fail++;
            errors.push({ id, error: e.message });
            console.log(`  ✗ ${id}: ${e.message}`);
        }
    }

    // ── 4. Финальное сохранение ───────────────────────────
    console.log('\n→ [4/4] Сохранение...');
    let finalData;
    if (IS_TEST) {
        finalData = enriched;
    } else {
        finalData = { ...loadExisting(), ...enriched };
    }
    fs.writeFileSync(ENRICHED_OUT, JSON.stringify(finalData, null, 2));

    if (!IS_TEST && fs.existsSync(PROGRESS_FILE)) {
        fs.unlinkSync(PROGRESS_FILE);
    }

    console.log('\n═══ Summary ═══');
    console.log(`Успех:   ${ok}`);
    console.log(`Ошибок:  ${fail}`);
    console.log(`Файл:    ${ENRICHED_OUT}`);
    console.log(`Размер:  ${(fs.statSync(ENRICHED_OUT).size / 1024).toFixed(1)} KB`);

    if (errors.length && IS_TEST) {
        console.log('\nОшибки:');
        errors.forEach(e => console.log('  -', e.id, '→', e.error));
    }
}

function loadExisting() {
    if (fs.existsSync(ENRICHED_OUT) && !IS_TEST) {
        try { return JSON.parse(fs.readFileSync(ENRICHED_OUT, 'utf8')); } catch (e) {}
    }
    return {};
}

enrich().catch(e => {
    console.error('FATAL:', e.message);
    console.error(e.stack);
    process.exit(1);
});
