/* =================================================================
   PAYD Finance — AutoEnrichmentService (V2.3)
   Обогащает вновь обнаруженные проекты:
     1. Рыночные данные (CoinGecko: price, market cap, volume, supply)
     2. GitHub метрики (stars, commits, contributors)
     3. Social метрики (Twitter followers, Telegram, Discord)
     4. AI Scores (payd, conviction, alpha, risk) — derived из market data
     5. V1 формат данных (для рендерера)

   Если внешние API недоступны, проект всё равно сохраняется
   с минимальным набором полей (не блокируем UI).

   Также кэширует результаты в localStorage, чтобы при повторных
   загрузках страницы не дублировать запросы.
   ================================================================= */

(function (global) {
    'use strict';

    const TIMEOUT_MS = 6000;
    const CACHE_KEY = 'payd_heal_enrichment_cache';
    const CACHE_TTL_MS = 30 * 60 * 1000; // 30 min

    /**
     * Безопасный fetch с таймаутом.
     */
    async function _safeFetch(url, options = {}) {
        const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        const timer = setTimeout(() => { if (controller) controller.abort(); }, options.timeout || TIMEOUT_MS);
        const fetchOpts = controller
            ? { signal: controller.signal, headers: options.headers || {} }
            : { headers: options.headers || {} };
        try {
            const res = await fetch(url, fetchOpts);
            clearTimeout(timer);
            if (!res.ok) return null;
            return await res.json();
        } catch (e) {
            clearTimeout(timer);
            return null;
        }
    }

    class AutoEnrichmentService {
        constructor(config = {}) {
            this.coingeckoBase = config.coingeckoBase || 'https://api.coingecko.com/api/v3';
            this.githubApiBase = config.githubApiBase || 'https://api.github.com';
            this.coingeckoApiKey = config.coingeckoApiKey || null;
            this._cache = this._loadCache();
            this._rateLimitMs = config.rateLimitMs || 1200;
            this._lastFetch = 0;
        }

        /**
         * Главный метод: обогащает массив проектов.
         * @param {Array} candidates - массив DTO (после classification)
         * @param {Object} options - { onProgress: (done, total) => void }
         * @returns {Array} массив enriched DTO в V2 формате
         */
        async enrichMany(candidates, options = {}) {
            if (!Array.isArray(candidates) || candidates.length === 0) return [];

            const enriched = [];
            const total = candidates.length;
            const concurrency = 3; // параллельных запросов

            for (let i = 0; i < candidates.length; i += concurrency) {
                const batch = candidates.slice(i, i + concurrency);
                const results = await Promise.allSettled(
                    batch.map(c => this.enrichOne(c))
                );
                for (const r of results) {
                    if (r.status === 'fulfilled' && r.value) {
                        enriched.push(r.value);
                    }
                }
                if (typeof options.onProgress === 'function') {
                    options.onProgress(Math.min(i + concurrency, total), total);
                }
            }

            return enriched;
        }

        /**
         * Обогащает один проект.
         */
        async enrichOne(candidate) {
            if (!candidate || !candidate.external_id) return null;

            // Проверяем кэш
            const cacheKey = candidate.external_id;
            const cached = this._cache.get(cacheKey);
            if (cached && (Date.now() - cached.ts) < CACHE_TTL_MS) {
                return { ...cached.data, _fromCache: true };
            }

            // Параллельно запрашиваем все источники (макс 4 параллельных)
            const [marketData, githubData, socialData] = await Promise.allSettled([
                this._fetchMarketData(candidate),
                this._fetchGitHubData(candidate),
                this._fetchSocialData(candidate),
            ]);

            const market = marketData.status === 'fulfilled' ? marketData.value : null;
            const github = githubData.status === 'fulfilled' ? githubData.value : null;
            const social = socialData.status === 'fulfilled' ? socialData.value : null;

            // Собираем AI scores
            const aiScores = this._deriveAIScores(candidate, market, github);

            // Собираем enriched DTO в V2 формате
            const enriched = {
                id: candidate.external_id,
                symbol: (candidate.ticker || '').toUpperCase(),
                name: candidate.name,
                sector: candidate.sector || candidate.classification?.sector,
                sectors: candidate.classification ? [candidate.classification.sector] : [],
                coingeckoId: candidate.coingecko_id || (candidate.source === 'coingecko' ? candidate.external_id : null),
                cmcId: candidate.cmc_id || null,
                cmcSlug: candidate.cmc_slug || null,
                githubOrg: candidate.github_org || github?.org || null,
                githubRepo: candidate.github_repo || github?.repo || null,
                xHandle: social?.twitter_handle || null,
                website: candidate.website || social?.website || null,
                description: candidate.description || '',
                tier: candidate.tier || 'tier2',
                verifiedStatus: candidate.source === 'reference' ? 'verified' : 'unverified',
                lastVerifiedAt: new Date().toISOString(),
                lastEnrichedAt: new Date().toISOString(),
                // Enriched данные
                market: market || null,
                github: github || null,
                social: social || null,
                protocol: this._extractProtocolData(market, candidate),
                developer: this._extractDeveloperData(github),
                ai: aiScores,
                // Classification metadata
                _classification: candidate.classification || null,
                _source: candidate.source,
            };

            // Сохраняем в кэш
            this._cache.set(cacheKey, { data: enriched, ts: Date.now() });
            this._saveCache();

            return enriched;
        }

        /**
         * Получает market data с CoinGecko.
         */
        async _fetchMarketData(candidate) {
            await this._rateLimit();
            const cgId = candidate.coingecko_id
                || (candidate.source === 'coingecko' ? candidate.external_id : null);

            if (!cgId) {
                // Fallback: используем то, что уже есть в candidate
                if (candidate.market_cap || candidate.price_usd) {
                    return {
                        price_usd: candidate.price_usd || null,
                        market_cap_usd: candidate.market_cap || null,
                        fdv_usd: candidate.fdv || null,
                        circulating_supply: candidate.circulating_supply || null,
                        total_supply: null,
                        max_supply: null,
                        volume_24h_usd: candidate.total_volume || null,
                        change_24h_pct: candidate.price_change_24h_pct || null,
                        change_7d_pct: null,
                        change_30d_pct: null,
                        ath: null,
                        ath_change_pct: null,
                        atl: null,
                        market_cap_rank: null,
                        last_updated: new Date().toISOString(),
                    };
                }
                return null;
            }

            const url = `${this.coingeckoBase}/coins/markets?vs_currency=usd&ids=${encodeURIComponent(cgId)}&sparkline=false&price_change_percentage=24h,7d,30d`;
            const headers = {};
            if (this.coingeckoApiKey) headers['x-cg-pro-api-key'] = this.coingeckoApiKey;

            const data = await _safeFetch(url, { headers, timeout: TIMEOUT_MS });
            if (!Array.isArray(data) || data.length === 0) return null;

            const r = data[0];
            return {
                price_usd: r.current_price ?? null,
                market_cap_usd: r.market_cap ?? null,
                fdv_usd: r.fully_diluted_valuation ?? null,
                circulating_supply: r.circulating_supply ?? null,
                total_supply: r.total_supply ?? null,
                max_supply: r.max_supply ?? null,
                volume_24h_usd: r.total_volume ?? null,
                change_24h_pct: r.price_change_percentage_24h ?? null,
                change_7d_pct: r.price_change_percentage_7d_in_currency ?? r.price_change_percentage_7d ?? null,
                change_30d_pct: r.price_change_percentage_30d_in_currency ?? r.price_change_percentage_30d ?? null,
                ath: r.ath ?? null,
                ath_change_pct: r.ath_change_percentage ?? null,
                atl: r.atl ?? null,
                market_cap_rank: r.market_cap_rank ?? null,
                image: r.image || null,
                last_updated: r.last_updated || new Date().toISOString(),
            };
        }

        /**
         * Получает GitHub метрики.
         */
        async _fetchGitHubData(candidate) {
            await this._rateLimit();
            const repo = candidate.github_repo
                || (candidate.github_org ? `${candidate.github_org}/${candidate.external_id}` : null);

            if (!repo) {
                // Без GitHub данных — отдаём пустые метрики (не null!)
                return {
                    stars: 0, forks: 0, watchers: 0,
                    commits_30d: 0, active_devs_30d: 0,
                    open_issues: 0, last_commit: null, language: null,
                    repo: null, org: null, archived: false,
                };
            }

            const url = `${this.githubApiBase}/repos/${repo}`;
            const data = await _safeFetch(url, {
                headers: { 'Accept': 'application/vnd.github.v3+json' },
                timeout: TIMEOUT_MS,
            });
            if (!data) {
                return {
                    stars: 0, forks: 0, watchers: 0,
                    commits_30d: 0, active_devs_30d: 0,
                    open_issues: 0, last_commit: null, language: null,
                    repo, org: repo.split('/')[0] || null, archived: false,
                };
            }

            return {
                stars: data.stargazers_count || 0,
                forks: data.forks_count || 0,
                watchers: data.subscribers_count || 0,
                commits_30d: 0, // GitHub API не отдаёт напрямую, нужно считать отдельно
                active_devs_30d: 0,
                open_issues: data.open_issues_count || 0,
                last_commit: data.pushed_at || null,
                language: data.language || null,
                repo,
                org: data.owner?.login || null,
                archived: data.archived || false,
                topics: data.topics || [],
                license: data.license?.spdx_id || null,
                description: data.description || null,
            };
        }

        /**
         * Получает social метрики (минимальные — из CoinGecko).
         */
        async _fetchSocialData(candidate) {
            // Часть данных может быть в candidate.raw
            const raw = candidate.raw || {};
            return {
                twitter_handle: raw.twitter_handle || candidate.x_handle || null,
                twitter_url: raw.twitter_url || null,
                twitter_followers: raw.twitter_followers || 0,
                reddit_subscribers: raw.reddit_subscribers || 0,
                telegram_channel: raw.telegram_channel || null,
                discord: raw.discord || null,
                website: raw.website || candidate.website || null,
            };
        }

        /**
         * Извлекает protocol data (TVL и пр.) из market данных.
         */
        _extractProtocolData(market, candidate) {
            if (!market && !candidate.tvl_usd) return null;
            return {
                tvl_usd: candidate.tvl_usd || market?.tvl || null,
                category: candidate.sector || null,
                last_updated: new Date().toISOString(),
            };
        }

        /**
         * Извлекает developer data.
         */
        _extractDeveloperData(github) {
            if (!github) return null;
            return {
                stars: github.stars || 0,
                forks: github.forks || 0,
                subscribers: github.watchers || 0,
                total_issues: 0,
                closed_issues: 0,
                pull_requests_merged: 0,
                commit_count_4_weeks: github.commits_30d || 0,
                last_commit: github.last_commit || null,
            };
        }

        /**
         * Derived AI scores из доступных данных.
         * Используем rule-based подход, чтобы получить осмысленные значения.
         */
        _deriveAIScores(candidate, market, github) {
            // === PAYD Score (0..100): composite quality metric ===
            let paydScore = 50; // baseline
            if (market) {
                if (market.market_cap_usd > 1e9) paydScore += 15;
                else if (market.market_cap_usd > 1e8) paydScore += 10;
                else if (market.market_cap_usd > 1e7) paydScore += 5;
                if (market.volume_24h_usd > 1e8) paydScore += 5;
                if (market.change_24h_pct > 0) paydScore += 3;
                if (market.market_cap_rank && market.market_cap_rank < 100) paydScore += 5;
            }
            if (github) {
                if (github.stars > 1000) paydScore += 10;
                else if (github.stars > 100) paydScore += 5;
                if (github.language) paydScore += 2;
            }
            if (candidate.classification?.confidence) {
                paydScore += candidate.classification.confidence * 5;
            }
            if (candidate.tier === 'tier1') paydScore += 5;
            paydScore = Math.max(0, Math.min(100, paydScore));

            // === Conviction Score (0..100): confidence in holding ===
            let conviction = paydScore;
            if (candidate.source === 'reference') conviction += 10;
            if (market?.market_cap_usd > 1e9) conviction += 5;
            conviction = Math.max(0, Math.min(100, conviction));

            // === Alpha Score (0..100): potential for asymmetric returns ===
            let alpha = 50;
            if (market?.market_cap_usd && market.market_cap_usd < 5e8) alpha += 15; // small caps = more alpha
            if (market?.change_24h_pct > 5) alpha += 10;
            if (github?.commits_30d > 50) alpha += 10;
            if (candidate.classification?.sector === 'AI' || candidate.classification?.sector === 'RWA') alpha += 5;
            alpha = Math.max(0, Math.min(100, alpha));

            // === Risk Score (0..100): lower = safer ===
            let risk = 50;
            if (candidate.source === 'reference') risk -= 5;
            if (candidate.tier === 'tier1') risk -= 5;
            if (market?.market_cap_usd > 1e9) risk -= 5;
            if (market?.market_cap_usd < 1e7) risk += 10;
            if (!github || github.stars === 0) risk += 5;
            if (candidate.classification?.needsReview) risk += 10;
            risk = Math.max(0, Math.min(100, risk));

            // === Bull/Bear cases ===
            const bull = [];
            const bear = [];
            if (market?.market_cap_usd > 1e9) bull.push('Established market cap');
            if (github?.stars > 100) bull.push('Active community');
            if (candidate.tier === 'tier1') bull.push('Tier-1 verified project');
            if (market?.change_24h_pct > 0) bull.push('Positive momentum');
            if (market?.market_cap_usd < 1e7) bear.push('Low market cap — high volatility');
            if (risk > 60) bear.push('Elevated risk profile');
            if (candidate.classification?.needsReview) bear.push('Classification needs review');

            return {
                payd_score: Math.round(paydScore),
                conviction_score: Math.round(conviction),
                alpha_score: Math.round(alpha),
                risk_score: Math.round(risk),
                confidence: candidate.classification?.confidence > 0.6 ? 'high' :
                            candidate.classification?.confidence > 0.4 ? 'medium' : 'low',
                bull_case: bull.length > 0 ? bull : ['Under evaluation'],
                bear_case: bear.length > 0 ? bear : ['No major red flags detected'],
                thesis: this._buildThesis(candidate, market),
                opinion: this._buildOpinion(paydScore, risk, alpha),
                calculated_at: new Date().toISOString(),
            };
        }

        _buildThesis(candidate, market) {
            const parts = [];
            if (candidate.classification?.sector) {
                parts.push(`${candidate.classification.sector} project.`);
            }
            if (candidate.description) {
                const desc = candidate.description.slice(0, 100);
                parts.push(desc);
            }
            if (market?.market_cap_usd) {
                if (market.market_cap_usd > 1e9) parts.push('Established market position.');
                else if (market.market_cap_usd > 1e7) parts.push('Mid-cap project with growth potential.');
                else parts.push('Early-stage project.');
            }
            return parts.join(' ');
        }

        _buildOpinion(payd, risk, alpha) {
            if (payd >= 75 && risk < 40) return 'Strong candidate for core allocation.';
            if (payd >= 65) return 'Solid fundamentals with reasonable risk profile.';
            if (alpha >= 70) return 'High alpha potential — speculative position.';
            if (risk >= 70) return 'Elevated risk — suitable for small speculative positions only.';
            return 'Neutral — warrants further analysis.';
        }

        async _rateLimit() {
            const elapsed = Date.now() - this._lastFetch;
            if (elapsed < this._rateLimitMs) {
                await new Promise(r => setTimeout(r, this._rateLimitMs - elapsed));
            }
            this._lastFetch = Date.now();
        }

        _loadCache() {
            try {
                const raw = localStorage.getItem(CACHE_KEY);
                if (!raw) return new Map();
                const parsed = JSON.parse(raw);
                return new Map(Object.entries(parsed));
            } catch (e) {
                return new Map();
            }
        }

        _saveCache() {
            try {
                const obj = Object.fromEntries(this._cache);
                localStorage.setItem(CACHE_KEY, JSON.stringify(obj));
            } catch (e) { /* quota exceeded — ignore */ }
        }

        clearCache() {
            this._cache.clear();
            try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.AutoEnrichmentService = AutoEnrichmentService;

})(window);
