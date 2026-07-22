/* =================================================================
   PAYD Intelligence V2 — Second Enrichment Pass (v2)
   ----------------------------------------------------------------
   Запускается ПОСЛЕ validate_enrichment.js.
   Обрабатывает ТОЛЬКО проекты из _second_pass_ids.json
   с ВКЛЮЧЁННЫМ GitHub enrichment.
   НЕ перезаписывает валидные существующие данные null-ами.
   ================================================================= */

const fs = require('fs');
const path = require('path');
const { DEFI_LLAMA_SLUGS, GITHUB_REPO_FALLBACKS } = require('./data_mappings.js');

const DATA_DIR = '/workspace/public/data';
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const ENRICHED_FILE = path.join(DATA_DIR, 'projects_enriched.json');
const SECOND_PASS_IDS = path.join(DATA_DIR, '_second_pass_ids.json');

if (!fs.existsSync(SECOND_PASS_IDS)) {
    console.error('Файл _second_pass_ids.json не найден. Сначала запустите validate_enrichment.js');
    process.exit(1);
}

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const secondPassIds = new Set(JSON.parse(fs.readFileSync(SECOND_PASS_IDS, 'utf8')));
const projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'))
    .filter(p => secondPassIds.has(p.id));

const enriched = JSON.parse(fs.readFileSync(ENRICHED_FILE, 'utf8'));

// Rate limiting
const lastCall = { coingecko: 0, defillama: 0, github: 0, coingeckoCoin: 0 };
const RATE_MS = {
    coingecko: 7000,
    coingeckoCoin: 5000,
    defillama: 1500,
    github: GITHUB_TOKEN ? 1500 : 6000,
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
        if (!r.ok) return { ok: false, status: r.status, data: null };
        const data = await r.json();
        return { ok: true, status: r.status, data };
    } catch (e) {
        return { ok: false, status: 0, error: e.message };
    }
}

async function fetchCoinGeckoCoin(id) {
    const url = `https://api.coingecko.com/api/v3/coins/${id}?localization=false&tickers=false&market_data=true&community_data=true&developer_data=true&sparkline=false`;
    const res = await rateLimitedFetch('coingeckoCoin', url);
    return res.ok ? res.data : null;
}

async function fetchGitHubRepo(owner, repo) {
    const url = `https://api.github.com/repos/${owner}/${repo}`;
    const res = await rateLimitedFetch('github', url);
    if (res.ok) return res.data;
    return null;
}

async function fetchGitHubLanguages(owner, repo) {
    const url = `https://api.github.com/repos/${owner}/${repo}/languages`;
    const res = await rateLimitedFetch('github', url);
    return res.ok ? res.data : null;
}

async function fetchGitHubCommits(owner, repo, since) {
    const url = `https://api.github.com/repos/${owner}/${repo}/commits?since=${since}&per_page=100`;
    const res = await rateLimitedFetch('github', url);
    return res.ok && Array.isArray(res.data) ? res.data : [];
}

// ── Score recalculation (копия из enrich_projects.js) ────────────
function calcScores(p) {
    let payd = 0, weights = 0;
    const mcap = p.market?.market_cap_usd;
    if (mcap != null) {
        const mcapScore = Math.min(Math.log10(Math.max(mcap, 1)) / 11 * 100, 100);
        payd += mcapScore * 0.20; weights += 0.20;
    }
    const stars = p.github?.stars ?? p.developer?.stars ?? 0;
    if (stars > 0) {
        const ghScore = Math.min(Math.log10(stars + 1) / 5 * 100, 100);
        payd += ghScore * 0.20; weights += 0.20;
    }
    const tvl = p.protocol?.tvl_usd;
    if (tvl != null && tvl > 0) {
        const tvlScore = Math.min(Math.log10(Math.max(tvl, 1)) / 10 * 100, 100);
        payd += tvlScore * 0.20; weights += 0.20;
    }
    const followers = p.social?.twitter_followers || 0;
    if (followers > 0) {
        const socScore = Math.min(Math.log10(followers + 1) / 7 * 100, 100);
        payd += socScore * 0.15; weights += 0.15;
    }
    const ch24 = Math.abs(p.market?.change_24h_pct || 0);
    if (p.market?.change_24h_pct != null) {
        const volScore = Math.max(100 - ch24 * 3, 0);
        payd += volScore * 0.10; weights += 0.10;
    }
    if (mcap > 0 && p.market?.volume_24h_usd != null) {
        const liq = p.market.volume_24h_usd / mcap;
        const liqScore = Math.min(liq * 500, 100);
        payd += liqScore * 0.15; weights += 0.15;
    }
    const paydScore = weights > 0 ? Math.round(payd / weights) : null;

    let risk = 50;
    if (p.market?.ath_change_pct != null) {
        risk += Math.max(-p.market.ath_change_pct - 30, 0) * 0.5;
    }
    if (p.market?.market_cap_rank != null) {
        risk -= Math.max(50 - p.market.market_cap_rank, 0) * 0.3;
    }
    if (p.github?.archived) risk += 20;
    risk = Math.max(0, Math.min(100, Math.round(risk)));

    let conviction = 50;
    if (p.market?.change_7d_pct != null) conviction += Math.max(p.market.change_7d_pct, -20) * 2;
    if (p.github?.pushed_at) {
        const daysSince = (Date.now() - new Date(p.github.pushed_at).getTime()) / 86400000;
        if (daysSince < 7) conviction += 10;
        else if (daysSince > 60) conviction -= 15;
    }
    if (p.protocol?.tvl_change_7d != null) conviction += p.protocol.tvl_change_7d * 1.5;
    conviction = Math.max(0, Math.min(100, Math.round(conviction)));

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

// ── Утилита: безопасный merge (не затирает валидные данные null) ─
function mergeField(target, source, field) {
    if (source[field] !== null && source[field] !== undefined) {
        target[field] = source[field];
    }
}
function mergeDeep(target, source, path) {
    const keys = path.split('.');
    let t = target, s = source;
    for (let i = 0; i < keys.length - 1; i++) {
        if (!t[keys[i]]) t[keys[i]] = {};
        t = t[keys[i]];
        s = s?.[keys[i]];
        if (!s) return;
    }
    const lastKey = keys[keys.length - 1];
    if (s && s[lastKey] !== null && s[lastKey] !== undefined) {
        t[lastKey] = s[lastKey];
    }
}

async function processProject(project) {
    const id = project.id;
    console.log(`\n[${id}] Обработка...`);

    // Берём существующие данные или создаём пустые
    const existing = enriched[id] || {
        id, symbol: project.symbol, name: project.name, sector: project.sector,
        coingecko_id: project.coingeckoId
    };

    if (!project.coingeckoId) {
        console.log(`  ✗ Пропуск: нет coingeckoId`);
        return false;
    }

    // ── CoinGecko (свежие данные) ──
    try {
        const cgDetail = await fetchCoinGeckoCoin(project.coingeckoId);
        if (cgDetail) {
            // Market data
            if (cgDetail.market_data) {
                const md = cgDetail.market_data;
                existing.market = {
                    ...(existing.market || {}),
                    price_usd: md.current_price?.usd ?? existing.market?.price_usd ?? null,
                    market_cap_usd: md.market_cap?.usd ?? existing.market?.market_cap_usd ?? null,
                    fdv_usd: md.fully_diluted_valuation?.usd ?? existing.market?.fdv_usd ?? null,
                    circulating_supply: md.circulating_supply ?? existing.market?.circulating_supply ?? null,
                    total_supply: md.total_supply?.usd ?? existing.market?.total_supply ?? null,
                    max_supply: md.max_supply?.usd ?? existing.market?.max_supply ?? null,
                    volume_24h_usd: md.total_volume?.usd ?? existing.market?.volume_24h_usd ?? null,
                    change_24h_pct: md.price_change_percentage_24h ?? existing.market?.change_24h_pct ?? null,
                    change_7d_pct: md.price_change_percentage_7d ?? existing.market?.change_7d_pct ?? null,
                    change_30d_pct: md.price_change_percentage_30d ?? existing.market?.change_30d_pct ?? null,
                    change_1h_pct: md.price_change_percentage_1h_in_currency?.usd ?? existing.market?.change_1h_pct ?? null,
                    ath: md.ath?.usd ?? existing.market?.ath ?? null,
                    ath_change_pct: md.ath_change_percentage?.usd ?? existing.market?.ath_change_pct ?? null,
                    atl: md.atl?.usd ?? existing.market?.atl ?? null,
                    atl_change_pct: md.atl_change_percentage?.usd ?? existing.market?.atl_change_pct ?? null,
                    market_cap_rank: md.market_cap_rank ?? existing.market?.market_cap_rank ?? null,
                    last_updated: md.last_updated ?? existing.market?.last_updated ?? null,
                    image: cgDetail.image?.large || cgDetail.image?.small || existing.market?.image || null,
                };
            }
            // Social
            if (cgDetail.community_data || cgDetail.links) {
                existing.social = {
                    ...(existing.social || {}),
                    twitter_handle: cgDetail.links?.twitter_screen_name || existing.social?.twitter_handle || null,
                    twitter_url: cgDetail.links?.twitter_screen_name
                        ? `https://x.com/${cgDetail.links.twitter_screen_name}`
                        : existing.social?.twitter_url || null,
                    twitter_followers: cgDetail.community_data?.twitter_followers ?? existing.social?.twitter_followers ?? null,
                    reddit_subscribers: cgDetail.community_data?.reddit_subscribers ?? existing.social?.reddit_subscribers ?? null,
                    telegram_channel: cgDetail.links?.telegram_channel_identifier || existing.social?.telegram_channel || null,
                    discord: cgDetail.links?.chat_url?.find(u => u.includes('discord')) || existing.social?.discord || null,
                    website: cgDetail.links?.homepage?.[0] || existing.social?.website || null,
                };
            }
            // Developer
            if (cgDetail.developer_data) {
                existing.developer = {
                    ...(existing.developer || {}),
                    stars: cgDetail.developer_data.stars ?? existing.developer?.stars ?? null,
                    forks: cgDetail.developer_data.forks ?? existing.developer?.forks ?? null,
                    subscribers: cgDetail.developer_data.subscribers ?? existing.developer?.subscribers ?? null,
                    total_issues: cgDetail.developer_data.total_issues ?? existing.developer?.total_issues ?? null,
                    closed_issues: cgDetail.developer_data.closed_issues ?? existing.developer?.closed_issues ?? null,
                    pull_requests_merged: cgDetail.developer_data.pull_requests_merged ?? existing.developer?.pull_requests_merged ?? null,
                    commit_count_4_weeks: cgDetail.developer_data.commit_count_4_weeks ?? existing.developer?.commit_count_4_weeks ?? null,
                };
            }
            if (cgDetail.description?.en && !existing.description) {
                existing.description = cgDetail.description.en;
            }
            if (cgDetail.categories?.length && (!existing.categories || !existing.categories.length)) {
                existing.categories = cgDetail.categories;
            }
            console.log(`  ✓ CoinGecko обновлён`);
        }
    } catch (e) {
        console.log(`  ⚠ CoinGecko: ${e.message}`);
    }

    // ── GitHub (полное обогащение) ──
    const repoCandidates = [];
    if (project.githubRepo) repoCandidates.push(project.githubRepo);
    if (GITHUB_REPO_FALLBACKS[project.coingeckoId]) {
        repoCandidates.push(...GITHUB_REPO_FALLBACKS[project.coingeckoId]);
    }
    if (GITHUB_REPO_FALLBACKS[project.id]) {
        repoCandidates.push(...GITHUB_REPO_FALLBACKS[project.id]);
    }

    let githubFound = !!existing.github;
    for (const candidate of repoCandidates) {
        const parts = candidate.split('/');
        if (parts.length < 2) continue;
        const owner = parts[0];
        const repo = parts[1];

        try {
            const gh = await fetchGitHubRepo(owner, repo);
            if (gh) {
                existing.github = {
                    ...(existing.github || {}),
                    owner, repo,
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
                try {
                    const langs = await fetchGitHubLanguages(owner, repo);
                    if (langs && typeof langs === 'object') {
                        const total = Object.values(langs).reduce((a, b) => a + b, 0);
                        existing.github.languages = Object.entries(langs).map(([name, bytes]) => ({
                            name, bytes,
                            pct: total > 0 ? Math.round(bytes / total * 100) : 0
                        })).sort((a, b) => b.bytes - a.bytes);
                    }
                } catch (e) {}

                // Commits за 30 дней
                try {
                    const since30d = new Date(Date.now() - 30 * 86400000).toISOString();
                    const commits = await fetchGitHubCommits(owner, repo, since30d);
                    existing.github.commits_30d = commits.length;
                    existing.github.last_commit = commits[0]?.commit?.author?.date || gh.pushed_at;
                } catch (e) {}

                githubFound = true;
                console.log(`  ✓ GitHub: ${gh.full_name} (${gh.stargazers_count} ⭐, ${commits_count_30d} commits/30d)`);
                break;
            } else {
                console.log(`  → GitHub ${owner}/${repo}: не найден`);
            }
        } catch (e) {
            console.log(`  ⚠ GitHub ${owner}/${repo}: ${e.message}`);
        }
    }

    if (!githubFound) {
        console.log(`  ✗ GitHub: не удалось получить данные`);
    }

    // ── Пересчёт скоров ──
    const scores = calcScores(existing);
    existing.ai = {
        ...(existing.ai || {}),
        ...scores,
        calculated_at: new Date().toISOString(),
    };

    existing.last_enriched_at = new Date().toISOString();
    enriched[id] = existing;

    console.log(`  ✓ Payd:${scores.payd_score ?? '?'} Risk:${scores.risk_score} Alpha:${scores.alpha_score} Conv:${scores.conviction_score}`);
    return true;
}

async function main() {
    console.log(`\n=== Second enrichment pass ===`);
    console.log(`Projects to retry: ${projects.length}`);
    console.log(`GitHub token: ${GITHUB_TOKEN ? 'YES' : 'NO'}\n`);

    let ok = 0, fail = 0;
    for (let i = 0; i < projects.length; i++) {
        const p = projects[i];
        try {
            const success = await processProject(p);
            if (success) ok++;
            else fail++;
        } catch (e) {
            fail++;
            console.log(`  ✗ Fatal: ${e.message}`);
        }

        // Сохраняем каждые 10 проектов
        if ((i + 1) % 10 === 0) {
            fs.writeFileSync(ENRICHED_FILE, JSON.stringify(enriched, null, 2));
            console.log(`  💾 Saved (${i + 1}/${projects.length})`);
        }
    }

    fs.writeFileSync(ENRICHED_FILE, JSON.stringify(enriched, null, 2));
    console.log(`\n=== Done ===`);
    console.log(`Success: ${ok}, Failed: ${fail}`);
    console.log(`File: ${ENRICHED_FILE}`);
    console.log(`Size: ${(fs.statSync(ENRICHED_FILE).size / 1024).toFixed(1)} KB`);
}

main().catch(e => {
    console.error('FATAL:', e.message);
    console.error(e.stack);
    process.exit(1);
});
