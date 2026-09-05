/* =================================================================
   PAYD Intelligence — DataAggregator
   Агрегирует данные от нескольких IDataSource'ов с fallback chain.
   Например: сначала CoinGecko, если null — fallback на CoinMarketCap.

   Контракт:
     - registerSource(source)
     - refreshAll() — собрать данные для всех проектов по всем источникам
     - refreshProject(projectId) — собрать данные для одного проекта
     - getDataForProject(projectId) — последний успешно собранный снимок
   ================================================================= */

(function (global) {
    'use strict';

    const IDataSource = global.PAYD_INTEL.IDataSource;
    const MockDataSource = global.PAYD_INTEL.MockDataSource;

    class DataAggregator {
        /**
         * @param {Object} config
         * @param {Array<IDataSource>} [config.sources] — массив источников
         * @param {Array<Object>} [config.projects] — список проектов для обновления
         * @param {number} [config.concurrency=5] — параллелизм
         * @param {Function} [config.onProgress] — callback(progress) после каждого проекта
         */
        constructor(config = {}) {
            this.sources = config.sources || [];
            this.projects = config.projects || [];
            this.concurrency = config.concurrency || 5;
            this.onProgress = config.onProgress || null;
            this._cache = new Map(); // projectId -> last snapshot
            this._rawResponses = []; // лог сырых ответов
        }

        registerSource(source) {
            if (!IDataSource.isIDataSource(source)) {
                console.warn('[DataAggregator] not a valid IDataSource:', source);
                return false;
            }
            this.sources.push(source);
            return true;
        }

        setProjects(projects) {
            this.projects = Array.isArray(projects) ? projects.slice() : [];
        }

        /**
         * Обновить все проекты по всем источникам.
         * Использует fallback chain: первый успешный ответ — финальный.
         */
        async refreshAll() {
            const startedAt = Date.now();
            const projectsUpdated = 0;
            const providers = this.sources.map(s => s.getName());
            const fields = [
                'marketCap', 'fdv', 'price', 'volume24h',
                'circulatingSupply', 'totalSupply', 'maxSupply',
                'tvl', 'revenue24h', 'fees24h', 'activeUsers24h',
                'nodes', 'liquidityUsd',
                'stars', 'commits30d', 'contributors30d',
                'unlockSchedule', 'news', 'socialData',
            ];

            const queue = [...this.projects];
            const total = queue.length;
            let done = 0;
            let updated = 0;
            let failed = 0;

            const worker = async () => {
                while (queue.length > 0) {
                    const project = queue.shift();
                    if (!project) break;
                    try {
                        const snapshot = await this.refreshProject(project);
                        if (snapshot) {
                            updated++;
                            this._cache.set(project.id || project.symbol, snapshot);
                        } else {
                            failed++;
                        }
                    } catch (e) {
                        failed++;
                        console.error(`[DataAggregator] refresh failed for ${project.id || project.symbol}:`, e);
                    }
                    done++;
                    if (this.onProgress) {
                        try {
                            this.onProgress({
                                done, total,
                                percent: total > 0 ? Math.round((done / total) * 100) : 100,
                            });
                        } catch (_) { /* ignore */ }
                    }
                }
            };

            const workers = Array.from({ length: Math.min(this.concurrency, total) }, () => worker());
            await Promise.all(workers);

            return {
                projectsUpdated: updated,
                projectsFailed: failed,
                providers,
                fields,
                duration: Date.now() - startedAt,
            };
        }

        /**
         * Обновить один проект. Fallback chain: первый успешный источник выигрывает.
         * @param {Object} project
         * @returns {Promise<Object|null>} — собранный снимок или null
         */
        async refreshProject(project) {
            const projectId = project.id || project.symbol || project.coinId;
            if (!projectId) return null;

            const marketData = await this._tryChain('getMarketData', projectId);
            const defiData = await this._tryChain('getDefiData', projectId);
            const githubData = await this._tryChain('getGithubData', projectId);
            const unlockSchedule = await this._tryChain('getUnlockSchedule', projectId);
            const news = await this._tryChain('getNews', projectId);
            const socialData = await this._tryChain('getSocialData', projectId);

            // Если нет ни market data, ни defi — проект недоступен
            if (!marketData && !defiData) {
                return null;
            }

            const snapshot = {
                projectId,
                projectName: project.name || projectId,
                sector: project.sector || null,
                refreshedAt: new Date().toISOString(),
                marketData,
                defiData,
                githubData,
                unlockSchedule,
                news: Array.isArray(news) ? news : [],
                socialData,
                sources: this.sources.filter(s => s.isAvailable()).map(s => s.getName()),
            };

            return snapshot;
        }

        async _tryChain(method, projectId) {
            for (const source of this.sources) {
                if (!source.isAvailable()) continue;
                if (typeof source[method] !== 'function') continue;
                try {
                    const result = await source[method](projectId);
                    this._rawResponses.push({
                        source: source.getName(),
                        method,
                        projectId,
                        success: result !== null && result !== undefined,
                        at: new Date().toISOString(),
                    });
                    if (result !== null && result !== undefined) {
                        return result;
                    }
                } catch (e) {
                    this._rawResponses.push({
                        source: source.getName(),
                        method,
                        projectId,
                        success: false,
                        error: e.message,
                        at: new Date().toISOString(),
                    });
                }
            }
            return null;
        }

        getDataForProject(projectId) {
            return this._cache.get(projectId) || null;
        }

        getAllData() {
            const all = {};
            for (const [id, snap] of this._cache.entries()) {
                all[id] = snap;
            }
            return all;
        }

        getRawResponses() {
            return this._rawResponses.slice();
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.DataAggregator = DataAggregator;

})(window);
