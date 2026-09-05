/* =================================================================
   PAYD Finance — QualityFilter (V2)
   Stateless-модуль с чистыми функциями для оценки качества кандидатов.
   Не знает о БД, не имеет side-effects.
   ================================================================= */

(function (global) {
    'use strict';

    const FieldUtils = (global.PAYD_INTEL && global.PAYD_INTEL.FieldUtils) || null;

    function _readField(project, name) {
        if (FieldUtils && typeof FieldUtils.getField === 'function') {
            return FieldUtils.getField(project, name, project && project.metadata);
        }
        if (!project) return undefined;
        const meta = project.metadata;
        if (project[name] !== undefined && project[name] !== null) return project[name];
        const snake = name.replace(/([A-Z])/g, '_$1').toLowerCase();
        if (project[snake] !== undefined && project[snake] !== null) return project[snake];
        if (meta) {
            if (meta[name] !== undefined && meta[name] !== null) return meta[name];
            if (meta[snake] !== undefined && meta[snake] !== null) return meta[snake];
        }
        return undefined;
    }

    const DEFAULT_WEIGHTS = {
        mcap: 0.20,
        volumeRatio: 0.20,
        devActivity: 0.20,
        age: 0.10,
        listings: 0.15,
        community: 0.15,
    };

    const MINIMUM_REQUIREMENTS = {
        minMcap: 1_000_000,            // $1M
        minAgeInDays: 30,
        requireGithub: false,          // soft requirement
        requireVolume: true,           // hard requirement
        requireVerified: true,         // INVALID PROJECT HANDLING v1.0: hard requirement
    };

    class QualityFilter {
        constructor(config = {}) {
            this.weights = { ...DEFAULT_WEIGHTS, ...(config.weights || {}) };
            this.requirements = { ...MINIMUM_REQUIREMENTS, ...(config.requirements || {}) };
            // INVALID PROJECT HANDLING v1.0: raised threshold to 70 for stricter quality.
            this.threshold = config.threshold || 70;
        }

        computeQualityScore(candidate) {
            const missing = [];
            const breakdown = {};

            // 1. Market cap score (0-100, log scale)
            const mcap = candidate.market_cap || 0;
            if (!mcap) missing.push('market_cap');
            const mcapScore = this._scoreMcap(mcap);
            breakdown.mcap = mcapScore;

            // 2. Volume/mcap ratio (liquidity health)
            const volume = candidate.total_volume || 0;
            if (!volume && this.requirements.requireVolume) missing.push('total_volume');
            const volumeRatio = mcap > 0 ? volume / mcap : 0;
            const volumeScore = this._scoreVolumeRatio(volumeRatio);
            breakdown.volumeRatio = volumeScore;

            // 3. Developer activity
            const devActivity = candidate.developer_score || candidate.github_commits_30d || 0;
            if (!devActivity) missing.push('developer_activity');
            const devScore = this._scoreDevActivity(devActivity);
            breakdown.devActivity = devScore;

            // 4. Age (maturity)
            const ageInDays = candidate.age_in_days || this._estimateAge(candidate);
            if (!ageInDays) missing.push('age');
            const ageScore = this._scoreAge(ageInDays);
            breakdown.age = ageScore;

            // 5. Listings
            const listings = candidate.listing_exchanges_count || candidate.exchanges || 0;
            if (!listings) missing.push('listings');
            const listingsScore = this._scoreListings(listings);
            breakdown.listings = listingsScore;

            // 6. Community
            const community = candidate.community_score || this._estimateCommunity(candidate);
            if (!community) missing.push('community');
            const communityScore = this._scoreCommunity(community);
            breakdown.community = communityScore;

            // Weighted total
            const total = Math.round(
                this.weights.mcap * mcapScore
              + this.weights.volumeRatio * volumeScore
              + this.weights.devActivity * devScore
              + this.weights.age * ageScore
              + this.weights.listings * listingsScore
              + this.weights.community * communityScore
            );

            return {
                score: total,
                breakdown,
                missingData: missing,
                signals: { mcap, volume, devActivity, ageInDays, listings, community },
            };
        }

        meetsThreshold(candidate, threshold = null) {
            const t = threshold || this.threshold;
            const reasons = [];
            const hardFails = [];

            // INVALID PROJECT HANDLING v1.0 — hard-fail: project MUST be verified
            // (verifiedStatus === 'verified' AND has coingeckoId/cmcId).
            // Поддержка обоих вариантов: camelCase (verifiedStatus) и snake_case (verified_status).
            const verifiedStatus = _readField(candidate, 'verifiedStatus');
            if (verifiedStatus !== 'verified') {
                hardFails.push(`not_verified[${verifiedStatus || 'unknown'}]`);
            }
            const hasCgId  = _readField(candidate, 'coingeckoId');
            const hasCmcId = _readField(candidate, 'cmcId');
            if (!hasCgId && !hasCmcId) {
                hardFails.push('missing_coin_id');
            }

            // Hard checks
            const mcap = candidate.market_cap || 0;
            if (mcap < this.requirements.minMcap) {
                hardFails.push(`mcap $${(mcap/1e6).toFixed(2)}M < $${this.requirements.minMcap/1e6}M`);
            }
            const ageInDays = candidate.age_in_days || this._estimateAge(candidate);
            if (ageInDays < this.requirements.minAgeInDays) {
                hardFails.push(`age ${ageInDays}d < ${this.requirements.minAgeInDays}d`);
            }
            if (this.requirements.requireVolume && !(candidate.total_volume > 0)) {
                hardFails.push('no volume');
            }
            if (this.requirements.requireGithub && !candidate.has_github) {
                hardFails.push('no github');
            }

            if (hardFails.length > 0) {
                return {
                    qualified: false,
                    hardFails,
                    reasons: [`Hard requirements failed: ${hardFails.join(', ')}`],
                };
            }

            const result = this.computeQualityScore(candidate);
            if (result.score < t) {
                reasons.push(`Score ${result.score} < threshold ${t}`);
            }
            if (result.missingData.length > 3) {
                reasons.push(`Too many missing signals: ${result.missingData.join(', ')}`);
            }

            return {
                qualified: result.score >= t && reasons.length === 0,
                score: result.score,
                breakdown: result.breakdown,
                missingData: result.missingData,
                hardFails,
                reasons,
            };
        }

        // -------- scoring helpers --------

        _scoreMcap(mcap) {
            if (!mcap) return 0;
            // log scale: $1M=20, $10M=40, $100M=60, $1B=80, $10B=100
            const score = 20 * Math.log10(Math.max(mcap / 1_000_000, 0.01)) + 20;
            return Math.max(0, Math.min(100, score));
        }

        _scoreVolumeRatio(ratio) {
            // 0% = 0, 5% = 50, 10% = 75, 20%+ = 100
            if (!ratio) return 0;
            const score = ratio * 500;
            return Math.max(0, Math.min(100, score));
        }

        _scoreDevActivity(score) {
            // assume input 0-100
            return Math.max(0, Math.min(100, score));
        }

        _scoreAge(days) {
            if (!days) return 0;
            // < 30d = 0, 90d = 50, 365d = 80, 730d+ = 100
            if (days < 30) return 0;
            if (days < 90) return (days - 30) * (50 / 60);
            if (days < 365) return 50 + (days - 90) * (30 / 275);
            if (days < 730) return 80 + (days - 365) * (20 / 365);
            return 100;
        }

        _scoreListings(count) {
            // 0=0, 1=20, 3=50, 5=70, 10+=100
            if (!count) return 0;
            if (count >= 10) return 100;
            const score = count * 10;
            return Math.max(0, Math.min(100, score));
        }

        _scoreCommunity(score) {
            return Math.max(0, Math.min(100, score));
        }

        _estimateAge(candidate) {
            if (candidate.first_listed_at) {
                return Math.floor((Date.now() - candidate.first_listed_at) / (24 * 60 * 60 * 1000));
            }
            return 0;
        }

        _estimateCommunity(candidate) {
            const twitter = candidate.twitter_followers || 0;
            const reddit = candidate.reddit_subscribers || 0;
            if (!twitter && !reddit) return 0;
            // log scale, twitter weighted 0.7, reddit 0.3
            const tScore = Math.log10(Math.max(twitter, 1)) * 15;
            const rScore = Math.log10(Math.max(reddit, 1)) * 20;
            return Math.max(0, Math.min(100, 0.7 * tScore + 0.3 * rScore));
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.QualityFilter = QualityFilter;

})(window);
