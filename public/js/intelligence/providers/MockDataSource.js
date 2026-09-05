/* =================================================================
   PAYD Intelligence — MockDataSource
   Реализация IDataSource, возвращающая реалистичные моковые данные.
   Используется в текущей версии, пока backend не подключён.
   В будущем будет заменена на REST API клиент с теми же методами.
   ================================================================= */

(function (global) {
    'use strict';

    const IDataSource = global.PAYD_INTEL.IDataSource;

    class MockDataSource {
        constructor(config = {}) {
            this.name = config.name || 'mock';
            this._enabled = config.enabled !== false;
            this._projects = config.projects || [];
            this._seed = config.seed || 42;
            this._baseTimestamp = config.baseTimestamp || Date.now();
            this._counter = 0;
        }

        getName() { return this.name; }
        isAvailable() { return this._enabled; }

        /**
         * Детерминированный "random" на основе seed + projectId.
         * Это даёт стабильные результаты между запусками pipeline'а
         * для одного и того же проекта (важно для тестирования).
         */
        _pseudoRandom(projectId, offset = 0) {
            let h = this._seed;
            const str = `${projectId}:${offset}:${Math.floor(this._baseTimestamp / (24 * 60 * 60 * 1000))}`;
            for (let i = 0; i < str.length; i++) {
                h = ((h << 5) - h) + str.charCodeAt(i);
                h |= 0;
            }
            return Math.abs(h % 10000) / 10000; // 0..1
        }

        _nextTimestamp() {
            // Каждый вызов — новая "свежая" метка времени
            return new Date(this._baseTimestamp + this._counter++ * 1000).toISOString();
        }

        // -------------------- Market Data --------------------

        async getMarketData(projectId) {
            if (!this._enabled || !projectId) return null;
            await this._simulateLatency();
            const r1 = this._pseudoRandom(projectId, 1);
            const r2 = this._pseudoRandom(projectId, 2);
            const r3 = this._pseudoRandom(projectId, 3);

            // Симулируем широкий диапазон: от $50M до $50B по market cap
            const marketCap = 50_000_000 + r1 * 50_000_000_000;
            const price = 0.01 + r2 * 1000;
            const volumeRatio = 0.02 + r3 * 0.15; // 2-17% от marketCap
            const fdv = marketCap * (1.05 + r1 * 0.5);

            return {
                marketCap: Math.round(marketCap),
                fdv: Math.round(fdv),
                price: parseFloat(price.toFixed(6)),
                volume24h: Math.round(marketCap * volumeRatio),
                circulatingSupply: Math.round(50_000_000 + r2 * 950_000_000),
                totalSupply: Math.round(100_000_000 + r3 * 900_000_000),
                maxSupply: r1 > 0.5 ? Math.round(1_000_000_000 + r2 * 1_000_000_000) : null,
                change24h: parseFloat(((r1 - 0.5) * 20).toFixed(2)),
                change7d: parseFloat(((r2 - 0.5) * 40).toFixed(2)),
                rank: Math.floor(r3 * 500) + 1,
                ath: parseFloat((price * (1 + r1 * 5)).toFixed(6)),
                atl: parseFloat((price * (1 - r2 * 0.8)).toFixed(6)),
                lastUpdated: this._nextTimestamp(),
            };
        }

        // -------------------- DeFi Data --------------------

        async getDefiData(projectId) {
            if (!this._enabled || !projectId) return null;
            await this._simulateLatency();
            const r1 = this._pseudoRandom(projectId, 10);
            const r2 = this._pseudoRandom(projectId, 11);
            const r3 = this._pseudoRandom(projectId, 12);

            return {
                tvl: Math.round(1_000_000 + r1 * 5_000_000_000),
                tvlChange24h: parseFloat(((r1 - 0.5) * 10).toFixed(2)),
                revenue24h: Math.round(1_000 + r2 * 1_000_000),
                fees24h: Math.round(500 + r3 * 500_000),
                activeUsers24h: Math.floor(100 + r1 * 50_000),
                nodes: Math.floor(10 + r2 * 5000),
                liquidityUsd: Math.round(500_000 + r3 * 2_000_000_000),
                lastUpdated: this._nextTimestamp(),
            };
        }

        // -------------------- GitHub Data --------------------

        async getGithubData(projectId) {
            if (!this._enabled || !projectId) return null;
            await this._simulateLatency();
            const r1 = this._pseudoRandom(projectId, 20);
            const r2 = this._pseudoRandom(projectId, 21);
            const r3 = this._pseudoRandom(projectId, 22);

            return {
                stars: Math.floor(50 + r1 * 50_000),
                forks: Math.floor(10 + r2 * 5_000),
                commits30d: Math.floor(5 + r3 * 200),
                contributors30d: Math.floor(1 + r1 * 50),
                pullRequests30d: Math.floor(2 + r2 * 100),
                issues30d: Math.floor(0 + r3 * 80),
                developerScore: parseFloat((50 + r1 * 50).toFixed(1)),
                lastUpdated: this._nextTimestamp(),
            };
        }

        // -------------------- Token Unlocks --------------------

        async getUnlockSchedule(projectId) {
            if (!this._enabled || !projectId) return null;
            await this._simulateLatency();
            const r1 = this._pseudoRandom(projectId, 30);
            const r2 = this._pseudoRandom(projectId, 31);
            const r3 = this._pseudoRandom(projectId, 32);

            const nextDays = Math.floor(r1 * 90) + 1;
            const nextUnlockAt = new Date(Date.now() + nextDays * 24 * 60 * 60 * 1000).toISOString();

            return {
                nextUnlockAt,
                nextUnlockAmount: Math.round(100_000 + r2 * 50_000_000),
                nextUnlockPercent: parseFloat((0.1 + r3 * 5).toFixed(3)),
                totalUnlockedPercent: parseFloat((20 + r1 * 70).toFixed(2)),
                remainingLockedPercent: parseFloat((100 - (20 + r1 * 70)).toFixed(2)),
                upcomingUnlocks: Array.from({ length: 4 }, (_, i) => ({
                    at: new Date(Date.now() + (nextDays + i * 30) * 24 * 60 * 60 * 1000).toISOString(),
                    amount: Math.round(100_000 + r2 * 30_000_000),
                    percent: parseFloat((0.1 + r3 * 2).toFixed(3)),
                })),
                lastUpdated: this._nextTimestamp(),
            };
        }

        // -------------------- News / RSS --------------------

        async getNews(projectId) {
            if (!this._enabled || !projectId) return [];
            await this._simulateLatency();
            const r1 = this._pseudoRandom(projectId, 40);
            const r2 = this._pseudoRandom(projectId, 41);
            const r3 = this._pseudoRandom(projectId, 42);

            const count = Math.floor(r1 * 5) + 1;
            const sources = ['CoinDesk', 'The Block', 'Decrypt', 'CoinTelegraph', 'Official Blog'];
            const items = [];
            for (let i = 0; i < count; i++) {
                const dayOffset = i * 3 + Math.floor(r2 * 5);
                items.push({
                    id: `${projectId}_news_${i}`,
                    title: `${projectId} ${['announces', 'launches', 'partners with', 'releases', 'completes'][i % 5]} ${['mainnet', 'upgrade', 'integration', 'funding round', 'audit'][i % 5]}`,
                    url: `https://example.com/news/${projectId}/${i}`,
                    source: sources[Math.floor(r3 * sources.length)],
                    publishedAt: new Date(Date.now() - dayOffset * 24 * 60 * 60 * 1000).toISOString(),
                    summary: `Mock news item for ${projectId}`,
                });
            }
            return items;
        }

        // -------------------- Social / X Data --------------------

        async getSocialData(projectId) {
            if (!this._enabled || !projectId) return null;
            await this._simulateLatency();
            const r1 = this._pseudoRandom(projectId, 50);
            const r2 = this._pseudoRandom(projectId, 51);
            const r3 = this._pseudoRandom(projectId, 52);

            return {
                twitterFollowers: Math.floor(1000 + r1 * 1_000_000),
                twitterEngagement30d: Math.floor(100 + r2 * 50_000),
                partnershipCount30d: Math.floor(0 + r3 * 5),
                investmentRounds: r1 > 0.7 ? [{
                    announcedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                    amount: Math.round(1_000_000 + r2 * 50_000_000),
                    lead: `VC ${Math.floor(r3 * 10)}`,
                    round: ['Seed', 'Series A', 'Series B', 'Strategic'][Math.floor(r2 * 4)],
                }] : [],
                lastUpdated: this._nextTimestamp(),
            };
        }

        async _simulateLatency() {
            // 10-50ms задержка для имитации реального сетевого вызова
            const delay = 10 + Math.random() * 40;
            await new Promise(r => setTimeout(r, delay));
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.MockDataSource = MockDataSource;

})(window);
