/* =================================================================
   PAYD Intelligence — InvestmentSummaryEngine
   Генерирует краткий текстовый инвестиционный обзор на основе
   verified scores от других engines. НЕ выдумывает цифры —
   использует только то, что посчитали другие engines.

   Генерирует:
     - headline: 1-2 предложения
     - bullets: 3-5 ключевых фактов (только verified)
     - risks: основные риски
     - opportunities: основные возможности
     - recommendation: STRONG_BUY | BUY | HOLD | REDUCE | AVOID
   ================================================================= */

(function (global) {
    'use strict';

    const BaseAnalysisEngine = global.PAYD_INTEL.BaseAnalysisEngine;

    class InvestmentSummaryEngine extends BaseAnalysisEngine {
        constructor(config = {}) {
            super({ ...config, name: 'InvestmentSummaryEngine' });
            this.otherEngines = config.otherEngines || {};
        }

        _analyzeSnapshot(snapshot, opts) {
            // Получаем scores от других engines
            const projectId = snapshot.projectId;
            const scores = {};
            for (const [name, engine] of Object.entries(this.otherEngines)) {
                const cached = engine.getCached ? engine.getCached(projectId) : null;
                if (cached && cached.score !== undefined) {
                    scores[name] = cached.score;
                }
            }

            if (Object.keys(scores).length === 0) {
                return null;
            }

            const headline = this._buildHeadline(snapshot, scores);
            const bullets = this._buildBullets(snapshot, scores);
            const risks = this._buildRisks(snapshot, scores);
            const opportunities = this._buildOpportunities(snapshot, scores);
            const recommendation = this._buildRecommendation(scores);

            return {
                score: this._aggregateScore(scores),
                headline,
                bullets,
                risks,
                opportunities,
                recommendation,
                components: scores,
                metadata: {
                    assessedAt: new Date().toISOString(),
                    dataAge: snapshot.refreshedAt,
                    engineInputs: Object.keys(scores),
                },
            };
        }

        _buildHeadline(snapshot, scores) {
            const name = snapshot.projectName || snapshot.projectId;
            const parts = [];
            if (scores.RiskAssessmentEngine !== undefined) {
                if (scores.RiskAssessmentEngine >= 70) {
                    parts.push('низкий риск');
                } else if (scores.RiskAssessmentEngine < 40) {
                    parts.push('высокий риск');
                }
            }
            if (scores.OpportunityAnalysisEngine !== undefined && scores.OpportunityAnalysisEngine >= 70) {
                parts.push('сильная возможность');
            }
            if (scores.GrowthAnalysisEngine !== undefined && scores.GrowthAnalysisEngine >= 70) {
                parts.push('активный рост');
            }
            if (parts.length === 0) {
                return `${name}: проект со средним потенциалом и умеренными рисками.`;
            }
            return `${name}: ${parts.join(', ')}.`;
        }

        _buildBullets(snapshot, scores) {
            const bullets = [];
            if (snapshot.marketData) {
                const mc = this._readNumber(snapshot.marketData, 'marketCap');
                if (mc) {
                    const mcM = mc / 1_000_000;
                    bullets.push(`Рыночная капитализация: $${mcM.toFixed(1)}M`);
                }
                const chg = this._readNumber(snapshot.marketData, 'change7d');
                if (chg !== null) {
                    bullets.push(`Изменение цены за 7 дней: ${chg > 0 ? '+' : ''}${chg.toFixed(1)}%`);
                }
            }
            if (snapshot.defiData) {
                const tvl = this._readNumber(snapshot.defiData, 'tvl');
                if (tvl) {
                    bullets.push(`TVL: $${(tvl / 1_000_000).toFixed(1)}M`);
                }
                const rev = this._readNumber(snapshot.defiData, 'revenue24h');
                if (rev) {
                    bullets.push(`Выручка за 24ч: $${(rev / 1000).toFixed(1)}K`);
                }
            }
            if (snapshot.githubData) {
                const commits = this._readNumber(snapshot.githubData, 'commits30d');
                if (commits !== null) {
                    bullets.push(`Коммитов за 30 дней: ${commits}`);
                }
            }
            return bullets;
        }

        _buildRisks(snapshot, scores) {
            const risks = [];
            if (scores.RiskAssessmentEngine !== undefined && scores.RiskAssessmentEngine < 50) {
                risks.push('Высокий общий риск (FDV/MC, волатильность, ликвидность)');
            }
            if (snapshot.marketData) {
                const fdv = this._readNumber(snapshot.marketData, 'fdv');
                const mc = this._readNumber(snapshot.marketData, 'marketCap');
                if (fdv && mc && mc > 0 && fdv / mc > 3) {
                    risks.push(`Высокое FDV/MC ratio: ${(fdv / mc).toFixed(2)} (вероятны будущие разблокировки)`);
                }
                const chg = this._readNumber(snapshot.marketData, 'change7d');
                if (chg !== null && Math.abs(chg) > 20) {
                    risks.push(`Высокая волатильность: ${chg > 0 ? '+' : ''}${chg.toFixed(1)}% за 7 дней`);
                }
            }
            if (snapshot.unlockSchedule) {
                const next = this._readNumber(snapshot.unlockSchedule, 'nextUnlockPercent');
                if (next !== null && next > 1) {
                    risks.push(`Ближайшая разблокировка: ${next.toFixed(2)}% supply`);
                }
            }
            return risks;
        }

        _buildOpportunities(snapshot, scores) {
            const opps = [];
            if (scores.OpportunityAnalysisEngine !== undefined && scores.OpportunityAnalysisEngine >= 60) {
                opps.push('Высокий opportunity score');
            }
            if (snapshot.marketData) {
                const ath = this._readNumber(snapshot.marketData, 'ath');
                const price = this._readNumber(snapshot.marketData, 'price');
                if (ath && price && ath > 0) {
                    const drop = (1 - price / ath) * 100;
                    if (drop > 50) {
                        opps.push(`Цена на ${drop.toFixed(0)}% ниже ATH — потенциал восстановления`);
                    }
                }
            }
            if (scores.GrowthAnalysisEngine !== undefined && scores.GrowthAnalysisEngine >= 60) {
                opps.push('Активный рост метрик');
            }
            return opps;
        }

        _buildRecommendation(scores) {
            const avg = this._aggregateScore(scores);
            if (avg >= 80) return 'STRONG_BUY';
            if (avg >= 65) return 'BUY';
            if (avg >= 45) return 'HOLD';
            if (avg >= 30) return 'REDUCE';
            return 'AVOID';
        }

        _aggregateScore(scores) {
            const values = Object.values(scores).filter(v => typeof v === 'number');
            if (values.length === 0) return 0;
            return values.reduce((a, b) => a + b, 0) / values.length;
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.InvestmentSummaryEngine = InvestmentSummaryEngine;

})(window);
