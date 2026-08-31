/* =================================================================
   PAYD Intelligence V2 — GitHub Provider
   ----------------------------------------------------------------
   GitHub API — primary source для developer activity.
   CoinGecko developer_data — fallback с низким confidence.
   Никогда не возвращаем 0 — только null или реальное число.
   ================================================================= */

const { rateLimitedFetch, MISSING_REASONS, makeMetric, emptyMetric, isRealNumber } = require('./_common.js');

/**
 * Получить информацию о репо: stars, forks, watchers, etc.
 * @returns {Object|null} raw GitHub response
 */
async function fetchRepo(owner, repo, token) {
    if (!owner || !repo) return null;
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const res = await rateLimitedFetch('github', url, { token });
    if (!res.ok) return null;
    return res.data;
}

/**
 * Получить commits за период
 */
async function fetchCommits(owner, repo, since, token) {
    if (!owner || !repo) return [];
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?since=${encodeURIComponent(since)}&per_page=100`;
    const res = await rateLimitedFetch('github', url, { token });
    if (!res.ok || !Array.isArray(res.data)) return [];
    return res.data;
}

/**
 * Получить языки репо
 */
async function fetchLanguages(owner, repo, token) {
    if (!owner || !repo) return null;
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/languages`;
    const res = await rateLimitedFetch('github', url, { token });
    if (!res.ok) return null;
    return res.data;
}

/**
 * Получить contributors
 */
async function fetchContributors(owner, repo, token) {
    if (!owner || !repo) return [];
    const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contributors?per_page=100&anon=true`;
    const res = await rateLimitedFetch('github', url, { token });
    if (!res.ok || !Array.isArray(res.data)) return [];
    return res.data;
}

/**
 * Build GitHub metrics envelope из repo данных.
 * 0 → null для counts. Используем null для "no data".
 */
function buildRepoMetrics(repo) {
    const m = {};
    if (!repo || typeof repo !== 'object') {
        m.stars = emptyMetric(MISSING_REASONS.NOT_FOUND);
        m.forks = emptyMetric(MISSING_REASONS.NOT_FOUND);
        m.watchers = emptyMetric(MISSING_REASONS.NOT_FOUND);
        m.open_issues = emptyMetric(MISSING_REASONS.NOT_FOUND);
        m.size_kb = emptyMetric(MISSING_REASONS.NOT_FOUND);
        m.archived = emptyMetric(MISSING_REASONS.NOT_FOUND);
        return m;
    }

    const setNum = (key, val) => {
        if (isRealNumber(val)) {
            m[key] = makeMetric({ value: val, source: 'github:api' });
        } else {
            m[key] = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
        }
    };

    setNum('stars', repo.stargazers_count);
    setNum('forks', repo.forks_count);
    setNum('watchers', repo.subscribers_count);
    setNum('open_issues', repo.open_issues_count);
    setNum('size_kb', repo.size);

    // Archived: boolean
    if (typeof repo.archived === 'boolean') {
        m.archived = makeMetric({ value: repo.archived, source: 'github:api' });
    } else {
        m.archived = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
    }

    // Даты
    if (repo.created_at) {
        m.created_at = makeMetric({ value: repo.created_at, source: 'github:api' });
    } else {
        m.created_at = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
    }
    if (repo.updated_at) {
        m.updated_at = makeMetric({ value: repo.updated_at, source: 'github:api' });
    } else {
        m.updated_at = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
    }
    if (repo.pushed_at) {
        m.pushed_at = makeMetric({ value: repo.pushed_at, source: 'github:api' });
    } else {
        m.pushed_at = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
    }

    // License
    if (repo.license && repo.license.spdx_id) {
        m.license = makeMetric({ value: repo.license.spdx_id, source: 'github:api' });
    } else {
        m.license = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
    }
    if (repo.language) {
        m.primary_language = makeMetric({ value: repo.language, source: 'github:api' });
    } else {
        m.primary_language = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
    }
    if (Array.isArray(repo.topics)) {
        m.topics = makeMetric({ value: repo.topics, source: 'github:api' });
    } else {
        m.topics = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
    }

    return m;
}

/**
 * Полная выборка GitHub-метрик для одного репо.
 * @param {string} owner
 * @param {string} repo
 * @param {Object} options - { token, includeCommits: true, days: 30 }
 * @returns {Promise<{success: boolean, source_repo: string, metrics: Object, error?: string}>}
 */
async function fetchFullRepoMetrics(owner, repo, options = {}) {
    const token = options.token || '';
    const days = options.days || 30;
    const includeCommits = options.includeCommits !== false;

    const gh = await fetchRepo(owner, repo, token);
    if (!gh) {
        return {
            success: false,
            source_repo: `${owner}/${repo}`,
            metrics: {},
            error: 'NOT_FOUND',
            reason: MISSING_REASONS.NOT_FOUND,
            http_status: 404,
        };
    }

    const metrics = buildRepoMetrics(gh);
    metrics.full_name = makeMetric({ value: gh.full_name, source: 'github:api' });
    metrics.html_url = makeMetric({ value: gh.html_url, source: 'github:api' });
    metrics.description = gh.description
        ? makeMetric({ value: gh.description, source: 'github:api' })
        : emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
    metrics.homepage = gh.homepage
        ? makeMetric({ value: gh.homepage, source: 'github:api' })
        : emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);

    if (includeCommits) {
        const since = new Date(Date.now() - days * 86400000).toISOString();
        const commits = await fetchCommits(owner, repo, since, token);
        if (Array.isArray(commits) && commits.length > 0) {
            metrics.commits_30d = makeMetric({ value: commits.length, source: 'github:commits' });
            if (commits[0]?.commit?.author?.date) {
                metrics.last_commit = makeMetric({ value: commits[0].commit.author.date, source: 'github:commits' });
            } else {
                metrics.last_commit = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
            }
        } else {
            metrics.commits_30d = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
            metrics.last_commit = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
        }
    }

    // Languages
    const langs = await fetchLanguages(owner, repo, token);
    if (langs && typeof langs === 'object' && Object.keys(langs).length > 0) {
        const total = Object.values(langs).reduce((a, b) => a + (isRealNumber(b) ? b : 0), 0);
        const arr = Object.entries(langs).map(([name, bytes]) => ({
            name,
            bytes,
            pct: total > 0 ? Math.round((bytes / total) * 100) : null,
        })).sort((a, b) => b.bytes - a.bytes);
        metrics.languages = makeMetric({ value: arr, source: 'github:languages' });
    } else {
        metrics.languages = emptyMetric(MISSING_REASONS.PROVIDER_NO_DATA);
    }

    return {
        success: true,
        source_repo: `${owner}/${repo}`,
        metrics,
        raw: gh,         // raw GitHub repo response для диагностики
        http_status: 200,
    };
}

module.exports = {
    fetchRepo,
    fetchCommits,
    fetchLanguages,
    fetchContributors,
    buildRepoMetrics,
    fetchFullRepoMetrics,
};
