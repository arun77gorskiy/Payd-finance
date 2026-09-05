/* =================================================================
   PAYD Finance — GitHubService (v2)
   Расширенные метрики разработки:
   - Commits, Contributors, Releases, Pull Requests, Stars, Forks, Issues
   - Development Frequency (commits/week, releases/month)
   - Repository Health Score (композитная метрика)
   - Activity Trend
   - Confidence level (на основе rate limit)
   Endpoint: https://api.github.com
   ================================================================= */

(function (global) {
    'use strict';

    const ServiceBase = global.PAYD_INTEL.ServiceBase;
    const DataModel = global.PAYD_INTEL.DataModel;

    class GitHubService extends ServiceBase {
        constructor(config = {}) {
            super({
                name: 'github',
                baseUrl: 'https://api.github.com',
                cacheTtlMs: 60 * 60 * 1000,
                rateLimit: { requests: 30, perMs: 60 * 1000 },
                headers: config.token ? { 'Authorization': 'token ' + config.token } : {},
                ...config,
            });
            this._hasToken = !!config.token;
        }

        /**
         * Получает repo info: stars, forks, issues, contributors count, last commit.
         */
        async getRepo(owner, repo) {
            if (!owner || !repo) return null;
            const url = `${this.baseUrl}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
            const response = await this.fetch(url);
            if (!response.ok) return null;
            return response.data;
        }

        /**
         * Полная активность за период (в днях) с расширенными метриками.
         */
        async getActivity(owner, repo, days = 90) {
            const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
            const headers = { 'Accept': 'application/vnd.github.clojure-preview+json' };

            const [repoData, commitsRes, prsRes, releasesRes, contributorsRes] = await Promise.all([
                this.getRepo(owner, repo),
                this.fetch(`${this.baseUrl}/repos/${owner}/${repo}/commits?since=${since}&per_page=100`, { headers }),
                this.fetch(`${this.baseUrl}/repos/${owner}/${repo}/pulls?state=closed&per_page=100`, { headers }),
                this.fetch(`${this.baseUrl}/repos/${owner}/${repo}/releases?per_page=20`, { headers }),
                this.fetch(`${this.baseUrl}/repos/${owner}/${repo}/contributors?per_page=30`, { headers }).catch(() => null),
            ]);

            if (!repoData) return null;
            return this._mapActivity(repoData, commitsRes, prsRes, releasesRes, contributorsRes, since, days);
        }

        async getField(field, args = {}) {
            const { owner, repo, days } = args;
            if (!owner || !repo) return DataModel.missing(this.name, 'no_owner_repo');
            const data = await this.getActivity(owner, repo, days || 90);
            if (!data) return DataModel.missing(this.name, 'fetch_failed');
            const value = data[field];
            if (!value || value.missing) {
                return DataModel.missing(this.name, 'field_missing');
            }
            return value;
        }

        _mapActivity(repo, commitsRes, prsRes, releasesRes, contributorsRes, since, days) {
            const out = { source: this.name, timestamp: Date.now() };
            const ts = repo.pushed_at ? new Date(repo.pushed_at).getTime() : Date.now();
            const confidence = this._hasToken ? 'high' : 'medium'; // с токеном — высокое доверие

            out.stars = DataModel.verified(repo.stargazers_count || 0, this.name, ts, confidence, 'github_api');
            out.forks = DataModel.verified(repo.forks_count || 0, this.name, ts, confidence, 'github_api');
            out.issues = DataModel.verified(repo.open_issues_count || 0, this.name, ts, confidence, 'github_api');

            // Commits
            const commits = commitsRes && commitsRes.ok && Array.isArray(commitsRes.data) ? commitsRes.data : [];
            out.commits = DataModel.verified(commits.length, this.name, ts, confidence, 'github_commits_api');

            // Уникальные авторы (active developers)
            const authors = new Set();
            commits.forEach(c => { if (c.author && c.author.login) authors.add(c.author.login); });
            out.activeDevelopers = DataModel.verified(authors.size, this.name, ts, confidence, 'github_commits_api');

            // PR
            const prs = prsRes && prsRes.ok && Array.isArray(prsRes.data) ? prsRes.data : [];
            const merged = prs.filter(pr => pr.merged_at).length;
            out.pullRequests = DataModel.verified(merged, this.name, ts, confidence, 'github_pulls_api');

            // Releases
            const releases = releasesRes && releasesRes.ok && Array.isArray(releasesRes.data) ? releasesRes.data : [];
            out.releases = DataModel.verified(releases.length, this.name, ts, confidence, 'github_releases_api');

            // Contributors (если запрос прошёл)
            if (contributorsRes && contributorsRes.ok && Array.isArray(contributorsRes.data)) {
                out.contributors = DataModel.verified(contributorsRes.data.length, this.name, ts, confidence, 'github_contributors_api');
            } else {
                out.contributors = DataModel.missing(this.name, 'contributors_api_unavailable');
            }

            // Last commit
            if (commits.length > 0 && commits[0].commit && commits[0].commit.author) {
                out.lastCommitDate = DataModel.verified(
                    commits[0].commit.author.date,
                    this.name, ts, confidence, 'github_commits_api'
                );
            } else {
                out.lastCommitDate = DataModel.missing(this.name, 'no_commits_in_period');
            }

            // Development trend
            out.developmentTrend = this._computeTrend(commits, since, ts, confidence);

            // Development Frequency (НОВОЕ) — вычисляемые метрики
            out.developmentFrequency = this._computeFrequency(commits, releases, days, ts, confidence);

            // Repository Health Score (НОВОЕ)
            out.repositoryHealth = this._computeRepositoryHealth({
                stars: DataModel.unwrap(out.stars, 0),
                forks: DataModel.unwrap(out.forks, 0),
                contributors: DataModel.unwrap(out.contributors, 0),
                commits: commits.length,
                releases: releases.length,
                mergedPRs: merged,
                openIssues: repo.open_issues_count || 0,
                age: repo.created_at ? (Date.now() - new Date(repo.created_at).getTime()) : 0,
            }, ts, confidence);

            return out;
        }

        /**
         * Тренд разработки — детерминированная формула.
         */
        _computeTrend(commits, since, ts, confidence) {
            if (!commits.length) {
                return DataModel.missing(this.name, 'no_commits_for_trend');
            }
            const sinceTs = new Date(since).getTime();
            const now = Date.now();
            const halfPeriod = (now - sinceTs) / 2;
            const midpoint = sinceTs + halfPeriod;
            let firstHalf = 0, secondHalf = 0;
            for (const c of commits) {
                const date = c.commit && c.commit.author && c.commit.author.date
                    ? new Date(c.commit.author.date).getTime() : 0;
                if (date < midpoint) firstHalf++;
                else if (date >= midpoint) secondHalf++;
            }
            let trend = 'Stable';
            const ratio = firstHalf > 0 ? secondHalf / firstHalf : (secondHalf > 0 ? 2 : 1);
            if (ratio > 1.2) trend = 'Increasing';
            else if (ratio < 0.8) trend = 'Decreasing';
            return DataModel.verified(trend, this.name + '.trend_evaluator', ts, confidence, 'computed');
        }

        /**
         * Development Frequency — вычисляемая метрика активности.
         */
        _computeFrequency(commits, releases, days, ts, confidence) {
            if (days <= 0) days = 90;
            const weeks = days / 7;
            const months = days / 30;

            const commitsPerWeek = commits.length / weeks;
            const releasesPerMonth = releases.length / months;

            return DataModel.verified({
                commitsPerWeek: Math.round(commitsPerWeek * 100) / 100,
                releasesPerMonth: Math.round(releasesPerMonth * 100) / 100,
                periodDays: days,
            }, this.name + '.frequency_evaluator', ts, confidence, 'computed');
        }

        /**
         * Repository Health Score — композитная метрика.
         * Вычисляется из verified данных, НЕ AI-генерация.
         * Score 0-100.
         */
        _computeRepositoryHealth(metrics, ts, confidence) {
            let score = 0;
            const weights = {
                stars: 15,
                forks: 10,
                contributors: 20,
                commitActivity: 20,
                releaseActivity: 15,
                prActivity: 10,
                issueRatio: 10, // меньше открытых issues относительно звёзд — лучше
            };

            // Stars (log scale)
            if (metrics.stars > 0) {
                score += Math.min(weights.stars, Math.log10(metrics.stars + 1) * 4);
            }
            // Forks
            if (metrics.forks > 0) {
                score += Math.min(weights.forks, Math.log10(metrics.forks + 1) * 3);
            }
            // Contributors
            if (metrics.contributors > 0) {
                score += Math.min(weights.contributors, Math.log10(metrics.contributors + 1) * 7);
            }
            // Commit activity (per week)
            const weeks = (metrics.age || (90 * 24 * 60 * 60 * 1000)) / (7 * 24 * 60 * 60 * 1000);
            const commitsPerWeek = metrics.commits / Math.max(weeks, 1);
            score += Math.min(weights.commitActivity, commitsPerWeek * 2);

            // Release activity
            const months = weeks / 4.33;
            const releasesPerMonth = metrics.releases / Math.max(months, 1);
            score += Math.min(weights.releaseActivity, releasesPerMonth * 5);

            // PR activity
            if (metrics.mergedPRs > 0) {
                score += Math.min(weights.prActivity, Math.log10(metrics.mergedPRs + 1) * 4);
            }

            // Issue ratio (open_issues / stars): если < 0.5 — отлично
            if (metrics.stars > 0) {
                const issueRatio = metrics.openIssues / metrics.stars;
                if (issueRatio < 0.1) score += weights.issueRatio;
                else if (issueRatio < 0.3) score += weights.issueRatio * 0.6;
                else if (issueRatio < 0.5) score += weights.issueRatio * 0.3;
            }

            const finalScore = Math.round(Math.max(0, Math.min(100, score)));
            let grade = 'Poor';
            if (finalScore >= 80) grade = 'Excellent';
            else if (finalScore >= 60) grade = 'Good';
            else if (finalScore >= 40) grade = 'Average';
            else if (finalScore >= 20) grade = 'Below Average';

            return DataModel.verified({
                score: finalScore,
                grade,
            }, this.name + '.health_evaluator', ts, confidence, 'computed');
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.GitHubService = GitHubService;

})(window);
