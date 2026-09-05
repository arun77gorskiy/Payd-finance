/* =================================================================
   PAYD Finance — Intelligence Alpha Render
   UI для Payd Score / Payd Conviction Score / Payd Alpha Score.
   • 3 score cards
   • AI summary
   • Auto-labels (🔥🚀⭐💎)
   • History chart (SVG sparkline)
   • Promotion/Demotion timeline
   • Top opportunities feed
   ================================================================= */

(function (global) {
    'use strict';

    const PAYD = global.PAYD_INTEL || {};

    function getArchitecture() {
        return PAYD.architecture || global.PAYD_INTEL_RAW;
    }

    /**
     * Отрендерить блок трёх scores для проекта.
     * @param {HTMLElement} container
     * @param {Object} project — ProjectModel с _scores
     * @param {Object} [options]
     */
    async function renderScoresBlock(container, project, options = {}) {
        if (!container) return;
        const scores = project._scores || {};
        const payd = scores.payd || {};
        const conviction = scores.conviction || {};
        const alpha = scores.alpha || {};
        const discovery = scores.discovery || {};

        const projectId = project.id || project.coinId || project.symbol;
        const arch = getArchitecture();

        // Асинхронная загрузка history & events (localStorage-based)
        let history = [];
        let events = [];
        if (arch && arch.database) {
            try {
                const historyResult = arch.database.getScoreHistory(projectId);
                if (historyResult && typeof historyResult.then === 'function') {
                    history = await historyResult;
                } else {
                    history = historyResult || [];
                }
            } catch (e) {
                console.warn('[Alpha] getScoreHistory failed:', e);
            }
            try {
                const eventsResult = arch.database.getLabelEvents(projectId, 20);
                if (eventsResult && typeof eventsResult.then === 'function') {
                    events = await eventsResult;
                } else {
                    events = eventsResult || [];
                }
            } catch (e) {
                console.warn('[Alpha] getLabelEvents failed:', e);
            }
        }

        container.innerHTML = `
            ${renderThreeScoreCards(payd, conviction, alpha)}
            ${renderAutoLabels(discovery.labels || [])}
            ${renderAiSummary(payd, conviction, alpha, project)}
            ${renderScoreHistoryChart(history)}
            ${renderTimelineFromEvents(events)}
        `;
    }

    function renderThreeScoreCards(payd, conviction, alpha) {
        return `
            <div class="payd-alpha-grid">
                ${scoreCard('Payd Score', payd, '#D4AF37', 'Quality')}
                ${scoreCard('Payd Conviction', conviction, '#7B61FF', 'Confidence in analysis')}
                ${scoreCard('Payd Alpha', alpha, '#22c55e', 'Opportunity')}
            </div>
        `;
    }

    function scoreCard(title, scoreObj, accentColor, subtitle) {
        const value = scoreObj && scoreObj.value != null ? Math.round(scoreObj.value) : '—';
        const classification = (scoreObj && scoreObj.classification) || {};
        const label = classification.label || '';
        const tier = classification.tier || 'unknown';
        const color = classification.color || accentColor;
        const confidence = (scoreObj && scoreObj.confidence) || 'unknown';
        const confidenceScore = (scoreObj && scoreObj.confidenceScore) || 0;

        return `
            <div class="payd-alpha-card" data-tier="${tier}">
                <div class="payd-alpha-card-head">
                    <div>
                        <div class="payd-alpha-card-title">${title}</div>
                        <div class="payd-alpha-card-subtitle">${subtitle}</div>
                    </div>
                    <div class="payd-alpha-card-confidence" title="Confidence: ${confidence} (${confidenceScore}%)">
                        <span class="payd-conf-dot payd-conf-${confidence}"></span>
                        <span class="payd-conf-text">${confidence}</span>
                    </div>
                </div>
                <div class="payd-alpha-card-value" style="color: ${color}">${value}</div>
                <div class="payd-alpha-card-classification" style="background: ${color}22; color: ${color}">
                    ${label || '—'}
                </div>
                <div class="payd-alpha-card-bar">
                    <div class="payd-alpha-card-bar-fill" style="width: ${typeof value === 'number' ? value : 0}%; background: ${color}"></div>
                </div>
            </div>
        `;
    }

    function renderAutoLabels(labels) {
        if (!labels || labels.length === 0) {
            return `<div class="payd-alpha-labels payd-alpha-labels-empty">No active discovery labels</div>`;
        }
        return `
            <div class="payd-alpha-labels">
                ${labels.map(l => `
                    <span class="payd-alpha-label" style="background: ${l.color}22; color: ${l.color}; border-color: ${l.color}66">
                        <span class="payd-alpha-label-icon">${l.icon}</span>
                        <span class="payd-alpha-label-text">${l.label}</span>
                        <span class="payd-alpha-label-reason">${l.reason || ''}</span>
                    </span>
                `).join('')}
            </div>
        `;
    }

    function renderAiSummary(payd, conviction, alpha, project) {
        const p = payd && payd.value != null ? Math.round(payd.value) : 0;
        const c = conviction && conviction.value != null ? Math.round(conviction.value) : 0;
        const a = alpha && alpha.value != null ? Math.round(alpha.value) : 0;
        const name = (project && (project.name || project.ticker)) || 'This project';

        let summary = '';

        if (p >= 80 && a >= 80) {
            summary = `${name} демонстрирует одновременно высокое качество (Payd ${p}) и сильный opportunity-сигнал (Alpha ${a}). Рынок, возможно, ещё не полностью отразил фундаментал.`;
        } else if (p >= 80 && a < 60) {
            summary = `${name} имеет сильный фундаментал (Payd ${p}), но opportunity-сигнал слабый (Alpha ${a}): рынок уже мог учесть основные драйверы.`;
        } else if (p < 60 && a >= 80) {
            summary = `${name} пока не имеет сильного фундаментала (Payd ${p}), но opportunity-сигнал высокий (Alpha ${a}): возможен разворот, но требуется осторожность.`;
        } else if (p >= 60 && a >= 60) {
            summary = `${name} находится в здоровом балансе: фундаментал на уровне ${p}, opportunity ${a}. Проект-кандидат для дальнейшего наблюдения.`;
        } else {
            summary = `${name} не показывает ярко выраженного opportunity-сигнала (Alpha ${a}). Качество (Payd ${p}) и уверенность анализа (${c}) указывают на нейтральный профиль.`;
        }

        if (c < 50) {
            summary += ' ⚠️ Уверенность анализа низкая: данных недостаточно для уверенной оценки.';
        }

        return `
            <div class="payd-alpha-summary">
                <div class="payd-alpha-summary-head">
                    <span class="payd-alpha-summary-icon">✨</span>
                    <span class="payd-alpha-summary-title">AI Summary</span>
                </div>
                <div class="payd-alpha-summary-text">${summary}</div>
                <div class="payd-alpha-summary-formula">
                    Quality (Payd ${p}) • Confidence (${c}) • Opportunity (${a})
                </div>
            </div>
        `;
    }

    function renderScoreHistoryChart(history) {
        if (!history || history.length === 0) {
            return `<div class="payd-alpha-chart-empty">Нет исторических данных. Запустите IntelligenceScheduler для сбора snapshots.</div>`;
        }

        // Группируем по timestamp
        const grouped = {};
        for (const r of history) {
            const t = r.timestamp;
            if (!grouped[t]) grouped[t] = { timestamp: t, values: {} };
            grouped[t].values[r.engine] = r.value;
        }
        const series = Object.values(grouped).sort((a, b) => a.timestamp - b.timestamp);
        if (series.length === 0) {
            return `<div class="payd-alpha-chart-empty">Нет данных для графика</div>`;
        }

        const engines = [
            { key: 'payd',       label: 'Payd',       color: '#D4AF37' },
            { key: 'conviction', label: 'Conviction', color: '#7B61FF' },
            { key: 'alpha',      label: 'Alpha',      color: '#22c55e' },
        ];

        const w = 600;
        const h = 160;
        const padL = 30, padR = 10, padT = 10, padB = 25;

        const minX = series[0].timestamp;
        const maxX = series[series.length - 1].timestamp;
        const spanX = Math.max(1, maxX - minX);
        const spanY = 100; // 0..100

        function x(t) {
            if (series.length === 1) return padL + (w - padL - padR) / 2;
            return padL + ((t - minX) / spanX) * (w - padL - padR);
        }
        function y(v) {
            return padT + (1 - v / spanY) * (h - padT - padB);
        }

        const lines = engines.map(e => {
            const points = series
                .filter(s => s.values[e.key] != null)
                .map(s => `${x(s.timestamp).toFixed(1)},${y(s.values[e.key]).toFixed(1)}`)
                .join(' ');
            if (!points) return '';
            return `
                <polyline fill="none" stroke="${e.color}" stroke-width="2"
                    points="${points}" />
                ${series.filter(s => s.values[e.key] != null).map(s => `
                    <circle cx="${x(s.timestamp).toFixed(1)}" cy="${y(s.values[e.key]).toFixed(1)}" r="3" fill="${e.color}">
                        <title>${e.label}: ${Math.round(s.values[e.key])} (${new Date(s.timestamp).toLocaleDateString()})</title>
                    </circle>
                `).join('')}
            `;
        }).join('');

        // Оси
        const yAxis = [0, 25, 50, 75, 100].map(v => `
            <line x1="${padL}" x2="${w - padR}" y1="${y(v)}" y2="${y(v)}" stroke="rgba(255,255,255,0.05)" />
            <text x="${padL - 4}" y="${y(v) + 3}" fill="rgba(255,255,255,0.4)" font-size="9" text-anchor="end">${v}</text>
        `).join('');

        // Легенда
        const legend = engines.map(e => `
            <span class="payd-alpha-chart-legend-item">
                <span class="payd-alpha-chart-legend-dot" style="background: ${e.color}"></span>
                ${e.label}
            </span>
        `).join('');

        return `
            <div class="payd-alpha-chart">
                <div class="payd-alpha-chart-head">
                    <span class="payd-alpha-chart-title">Score History</span>
                    <span class="payd-alpha-chart-legend">${legend}</span>
                </div>
                <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="payd-alpha-chart-svg">
                    ${yAxis}
                    ${lines}
                </svg>
                <div class="payd-alpha-chart-foot">
                    ${series.length} snapshot(s) — ${series.length > 0 ? new Date(minX).toLocaleDateString() : ''} → ${series.length > 0 ? new Date(maxX).toLocaleDateString() : ''}
                </div>
            </div>
        `;
    }

    function renderTimelineFromEvents(events) {
        if (!events || events.length === 0) return '';

        return `
            <div class="payd-alpha-timeline">
                <div class="payd-alpha-timeline-title">📈 Promotion / Demotion Timeline</div>
                <div class="payd-alpha-timeline-list">
                    ${events.map(e => `
                        <div class="payd-alpha-timeline-item payd-alpha-timeline-${e.type}">
                            <span class="payd-alpha-timeline-icon">
                                ${e.type === 'promotion' ? '⬆️' : e.type === 'demotion' ? '⬇️' : '🎯'}
                            </span>
                            <span class="payd-alpha-timeline-text">
                                <strong>${e.type === 'promotion' ? 'Promotion' : e.type === 'demotion' ? 'Demotion' : 'Milestone'}</strong>
                                ${e.from && e.to ? `: ${e.from} → ${e.to}` : ''}
                                ${e.threshold ? `: crossed ${e.threshold}` : ''}
                                ${e.delta != null ? ` (${e.delta > 0 ? '+' : ''}${e.delta})` : ''}
                            </span>
                            <span class="payd-alpha-timeline-date">${new Date(e.timestamp).toLocaleDateString()}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // Legacy sync wrapper для обратной совместимости
    function renderTimeline(arch, projectId) {
        if (!arch || !arch.database) return '';
        const events = arch.database.getLabelEvents(projectId, 20);
        if (events && typeof events.then === 'function') {
            // Async API — caller должен использовать async renderScoresBlock
            return '';
        }
        return renderTimelineFromEvents(events || []);
    }

    /**
     * Top opportunities feed — список проектов с самым высоким opportunityScore.
     */
    function renderTopOpportunities(container, projects) {
        if (!container) return;
        const arch = getArchitecture();
        if (!arch || !arch.scoring) {
            container.innerHTML = '<div class="payd-alpha-empty">Scoring engine не загружен</div>';
            return;
        }
        const discovery = arch.scoring.get('discovery');
        if (!discovery) {
            container.innerHTML = '<div class="payd-alpha-empty">Discovery engine не зарегистрирован</div>';
            return;
        }
        const top = discovery.getTopOpportunities(projects, 10);

        container.innerHTML = `
            <div class="payd-alpha-top">
                <div class="payd-alpha-top-title">🔥 Top Opportunities</div>
                <div class="payd-alpha-top-list">
                    ${top.length === 0 ? '<div class="payd-alpha-empty">Нет данных</div>' : ''}
                    ${top.map((p, i) => `
                        <div class="payd-alpha-top-item">
                            <div class="payd-alpha-top-rank">#${i + 1}</div>
                            <div class="payd-alpha-top-info">
                                <div class="payd-alpha-top-name">${p.name || p.ticker || p.projectId}</div>
                                <div class="payd-alpha-top-labels">
                                    ${(p.labels || []).map(l => `<span style="color: ${l.color}">${l.icon} ${l.label}</span>`).join(' ')}
                                </div>
                            </div>
                            <div class="payd-alpha-top-scores">
                                <div class="payd-alpha-top-score" style="color: #22c55e">α ${p.alphaValue || '—'}</div>
                                <div class="payd-alpha-top-score" style="color: #D4AF37">P ${p.paydValue || '—'}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    global.PAYD_INTEL_RENDER = global.PAYD_INTEL_RENDER || {};
    global.PAYD_INTEL_RENDER.renderScoresBlock = renderScoresBlock;
    global.PAYD_INTEL_RENDER.renderTopOpportunities = renderTopOpportunities;

    global.PAYD_ALPHA_RENDER = {
        renderScoresBlock,
        renderTopOpportunities,
    };

})(window);
