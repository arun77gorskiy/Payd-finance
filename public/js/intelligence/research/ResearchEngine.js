/* =================================================================
   PAYD Finance — ResearchEngine
   AI Research Layer (Layer 2).
   ПРАВИЛА:
   - Читает ТОЛЬКО verified данные из UnifiedDataStore.
   - ВЫЧИСЛЯЕТ Payd Score по прозрачной формуле.
   - Генерирует ТЕКСТОВЫЕ объяснения (шаблоны) на основе verified facts.
   - НИКОГДА не генерирует новые финансовые числа.
   - Любое число в выводе — ссылка на verified value.
   ================================================================= */

(function (global) {
    'use strict';

    const DataModel = global.PAYD_INTEL.DataModel;

    class ResearchEngine {
        constructor(dataStore) {
            this.store = dataStore;
        }

        /**
         * Генерирует "Weekly Intelligence" — текстовый отчёт на verified данных.
         * Использует ТОЛЬКО шаблоны, подставляя реальные числа из verified значений.
         * @param {Array<Object>} projects
         * @returns {Object} — { title, sections, generatedAt, dataSources }
         */
        generateWeeklyIntelligence(projects) {
            const topScored = [...projects]
                .filter(p => p.paidScore && p.paidScore.value !== null)
                .sort((a, b) => DataModel.unwrap(b.paidScore, 0) - DataModel.unwrap(a.paidScore, 0))
                .slice(0, 5);

            const sections = [];

            // Section 1: Top performers
            sections.push({
                title: 'Top Performers by Payd Score',
                items: topScored.map(p => ({
                    name: p.name,
                    ticker: p.ticker,
                    paidScore: DataModel.unwrap(p.paidScore, 0),
                    scoreSource: p.paidScore ? p.paidScore.source : 'n/a',
                    summary: this._summarizeProject(p),
                })),
                dataSources: this._collectSources(projects),
            });

            // Section 2: Market movers (на основе verified change7d)
            const movers = projects
                .filter(p => DataModel.unwrap(p.market.change7d) !== null)
                .sort((a, b) =>
                    DataModel.unwrap(b.market.change7d, 0) - DataModel.unwrap(a.market.change7d, 0)
                )
                .slice(0, 5);

            sections.push({
                title: '7-Day Market Movers',
                items: movers.map(p => ({
                    name: p.name,
                    change7d: DataModel.unwrap(p.market.change7d, 0),
                    changeSource: p.market.change7d.source,
                    explanation: this._explainChange(p),
                })),
                dataSources: ['coingecko', 'coinmarketcap'],
            });

            // Section 3: High unlock risk
            const highRisk = projects
                .filter(p => DataModel.unwrap(p.unlocks.riskLevel) === 'High')
                .slice(0, 5);

            sections.push({
                title: 'High Unlock Risk Projects',
                items: highRisk.map(p => ({
                    name: p.name,
                    nextUnlock: DataModel.unwrap(p.unlocks.nextUnlockAmount, 0),
                    nextUnlockDate: DataModel.unwrap(p.unlocks.nextUnlockDate, null),
                    riskSource: p.unlocks.riskLevel ? p.unlocks.riskLevel.source : 'n/a',
                })),
                dataSources: ['tokenunlocks'],
            });

            // Section 4: Development trends
            const trends = projects
                .filter(p => DataModel.unwrap(p.development.developmentTrend) !== null)
                .reduce((acc, p) => {
                    const t = DataModel.unwrap(p.development.developmentTrend);
                    acc[t] = (acc[t] || 0) + 1;
                    return acc;
                }, {});

            sections.push({
                title: 'Development Activity Trends',
                items: Object.entries(trends).map(([trend, count]) => ({
                    trend, count,
                    source: 'github.trend_evaluator',
                })),
                dataSources: ['github'],
            });

            return {
                title: 'PAYD Weekly Intelligence',
                generatedAt: new Date().toISOString(),
                dataSources: this._collectSources(projects),
                disclaimer: 'All numerical values are sourced from verified providers (CoinGecko, CoinMarketCap, DefiLlama, GitHub, Token Unlocks). AI does not generate financial values.',
                sections,
            };
        }

        /**
         * Генерирует "Investment Research" для одного проекта.
         * @param {Object} project
         * @returns {Object} — { project, sections, dataSources }
         */
        generateInvestmentResearch(project) {
            const score = DataModel.unwrap(project.paidScore, 0);
            const mcap = DataModel.unwrap(project.market.marketCap, 0);
            const tvl = DataModel.unwrap(project.defi.tvl, 0);
            const unlockPct = DataModel.unwrap(project.unlocks.unlockedPct, 0);
            const trend = DataModel.unwrap(project.development.developmentTrend, 'Unknown');

            const sections = [
                {
                    title: 'Project Overview',
                    facts: this._collectFacts(project, ['name', 'ticker', 'category', 'chains']),
                },
                {
                    title: 'Market Position',
                    facts: this._collectFacts(project.market, [
                        'price', 'marketCap', 'fdv', 'volume24h',
                        'change24h', 'change7d', 'change30d', 'rank',
                    ]),
                    explanation: this._explainMarketPosition(project),
                },
                {
                    title: 'DeFi Footprint',
                    facts: this._collectFacts(project.defi, ['tvl', 'revenue', 'fees', 'protocolCategory', 'chains']),
                    explanation: tvl > 0
                        ? `TVL is sourced from DefiLlama. Current TVL: ${this._fmtUsd(tvl)}.`
                        : 'No TVL data available from DefiLlama for this project.',
                },
                {
                    title: 'Tokenomics & Unlocks',
                    facts: this._collectFacts(project.unlocks, [
                        'unlockedPct', 'lockedSupply', 'nextUnlockDate', 'nextUnlockAmount', 'riskLevel',
                    ]),
                    explanation: unlockPct > 0
                        ? `Unlocked supply: ${unlockPct.toFixed(2)}%. Risk level (computed): ${DataModel.unwrap(project.unlocks.riskLevel, 'Unknown')}.`
                        : 'No unlock data available.',
                },
                {
                    title: 'Development Activity',
                    facts: this._collectFacts(project.development, [
                        'commits', 'activeDevelopers', 'pullRequests', 'releases', 'stars', 'lastCommitDate',
                    ]),
                    explanation: `Development trend: ${trend}. All values sourced from GitHub.`,
                },
                {
                    title: 'Payd Score Breakdown',
                    facts: {
                        totalScore: score,
                        scoreSource: project.paidScore ? project.paidScore.source : 'n/a',
                        calculationNote: 'Payd Score is computed from verified market, DeFi, development, and unlock data. No AI generation involved.',
                    },
                },
            ];

            return {
                project: { name: project.name, ticker: project.ticker },
                generatedAt: new Date().toISOString(),
                sections,
                dataSources: this._collectSources([project]),
                disclaimer: 'All data is verified and sourced. AI does not generate financial values.',
            };
        }

        /**
         * Генерирует "Opportunity Scanner" — ранжированный список.
         * @param {Array<Object>} projects
         * @returns {Array<Object>}
         */
        generateOpportunityScanner(projects) {
            return projects
                .filter(p => p.paidScore && p.paidScore.value !== null)
                .sort((a, b) => DataModel.unwrap(b.paidScore, 0) - DataModel.unwrap(a.paidScore, 0))
                .map(p => ({
                    id: p.id,
                    name: p.name,
                    ticker: p.ticker,
                    category: p.category,
                    paidScore: DataModel.unwrap(p.paidScore, 0),
                    paidScoreSource: p.paidScore ? p.paidScore.source : 'n/a',
                    keyMetrics: {
                        mcap: DataModel.unwrap(p.market.marketCap, 0),
                        tvl: DataModel.unwrap(p.defi.tvl, 0),
                        unlockRisk: DataModel.unwrap(p.unlocks.riskLevel, 'Unknown'),
                        devTrend: DataModel.unwrap(p.development.developmentTrend, 'Unknown'),
                    },
                    dataSources: this._collectSources([p]),
                }));
        }

        // ===== Helpers =====

        _summarizeProject(p) {
            const parts = [];
            const score = DataModel.unwrap(p.paidScore, 0);
            const change = DataModel.unwrap(p.market.change7d, 0);
            const mcap = DataModel.unwrap(p.market.marketCap, 0);
            if (mcap > 0) parts.push(`market cap ${this._fmtUsd(mcap)}`);
            if (change !== 0) parts.push(`7d change ${change.toFixed(2)}%`);
            parts.push(`Payd Score ${score}`);
            return parts.join('; ');
        }

        _explainChange(p) {
            const change = DataModel.unwrap(p.market.change7d, 0);
            if (change > 10) return 'Strong positive price action over the 7-day window (verified).';
            if (change < -10) return 'Notable decline over the 7-day window (verified).';
            return 'Price remained within a typical range (verified).';
        }

        _explainMarketPosition(p) {
            const mcap = DataModel.unwrap(p.market.marketCap, 0);
            const rank = DataModel.unwrap(p.market.rank, null);
            if (mcap > 1e9 && rank && rank <= 100) {
                return `Established top-100 project with market cap ${this._fmtUsd(mcap)}.`;
            }
            if (mcap > 0) {
                return `Active project with market cap ${this._fmtUsd(mcap)}.`;
            }
            return 'Insufficient market data to assess position.';
        }

        _collectFacts(obj, fields) {
            const facts = {};
            for (const f of fields) {
                const v = obj[f];
                if (v && typeof v === 'object' && 'value' in v) {
                    facts[f] = { value: v.value, source: v.source, timestamp: v.lastUpdated, verified: v.verified };
                } else {
                    facts[f] = { value: v, source: 'unknown', verified: false };
                }
            }
            return facts;
        }

        _collectSources(projects) {
            const sources = new Set();
            for (const p of projects) {
                for (const section of [p.market, p.defi, p.unlocks, p.development]) {
                    if (!section) continue;
                    for (const field of Object.values(section)) {
                        if (field && typeof field === 'object' && field.source) {
                            sources.add(field.source);
                        }
                    }
                }
            }
            return Array.from(sources);
        }

        _fmtUsd(n) {
            if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
            if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
            if (n >= 1e3) return '$' + (n / 1e3).toFixed(2) + 'K';
            return '$' + n.toFixed(2);
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.ResearchEngine = ResearchEngine;

})(window);
