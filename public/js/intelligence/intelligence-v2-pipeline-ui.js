/* =================================================================
   PAYD Intelligence V2 — Pipeline UI
   Слой представления для AUTOMATED INTELLIGENCE UPDATE ENGINE.

   Отображает:
     - Статус pipeline (когда последний update, когда следующий)
     - Список scheduler jobs
     - Кнопка "Run Update Now" для ручного запуска
     - Latest intelligence reports
     - Data freshness indicators
     - Свежие label events (promotions/demotions)
   ================================================================= */

(function (global) {
    'use strict';

    const PAYD_INTEL = global.PAYD_INTEL || {};

    const State = {
        pipeline: null,
        isRunning: false,
        lastRenderedAt: null,
    };

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatDateTime(ts) {
        if (!ts) return '—';
        const d = new Date(ts);
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleString('en-US', {
            year: 'numeric', month: 'short', day: '2-digit',
            hour: '2-digit', minute: '2-digit', hour12: false,
        });
    }

    function formatRelative(ts) {
        if (!ts) return '—';
        const ms = Date.now() - new Date(ts).getTime();
        if (ms < 0) return 'in the future';
        const min = Math.floor(ms / 60000);
        if (min < 1) return 'just now';
        if (min < 60) return `${min}m ago`;
        const hr = Math.floor(min / 60);
        if (hr < 24) return `${hr}h ago`;
        const d = Math.floor(hr / 24);
        return `${d}d ago`;
    }

    // -------------------------------------------------------------
    // Загрузка projects.json для инициализации пайплайна
    // -------------------------------------------------------------
    async function loadProjectsForPipeline() {
        try {
            const response = await fetch('/data/projects.json');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            const projects = Array.isArray(data) ? data : (data.projects || []);
            return projects;
        } catch (e) {
            console.warn('[PAYD-V2-Pipeline] failed to load projects.json:', e);
            return [];
        }
    }

    async function loadDiscoveryCandidates() {
        try {
            const response = await fetch('/data/discovery_candidates.json');
            if (!response.ok) return [];
            const data = await response.json();
            return Array.isArray(data) ? data : (data.candidates || []);
        } catch (e) {
            return [];
        }
    }

    // -------------------------------------------------------------
    // Инициализация пайплайна
    // -------------------------------------------------------------
    async function initPipeline() {
        if (State.pipeline) return State.pipeline;

        if (!PAYD_INTEL.PipelineBootstrap) {
            console.error('[PAYD-V2-Pipeline] PipelineBootstrap not available');
            return null;
        }

        console.log('[PAYD-V2-Pipeline] Loading projects and discovery candidates...');
        const [projects, candidates] = await Promise.all([
            loadProjectsForPipeline(),
            loadDiscoveryCandidates(),
        ]);
        console.log('[PAYD-V2-Pipeline] Loaded', projects.length, 'projects,', candidates.length, 'candidates');

        console.log('[PAYD-V2-Pipeline] Creating PipelineBootstrap...');
        State.pipeline = new PAYD_INTEL.PipelineBootstrap({
            projects,
            discoveryCandidates: candidates,
            minSectorSize: 30,
            maxRetries: 3,
        });

        console.log('[PAYD-V2-Pipeline] Calling pipeline.init() (this may take a few seconds)...');
        // Защита от зависания: если init() не завершился за 20s, отменяем и продолжаем
        const initPromise = State.pipeline.init();
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('pipeline.init() timeout after 20s')), 20000)
        );
        try {
            await Promise.race([initPromise, timeoutPromise]);
            console.log('[PAYD-V2-Pipeline] Initialized with', projects.length, 'projects');
        } catch (e) {
            console.error('[PAYD-V2-Pipeline] init() failed or timed out:', e.message);
            // Возвращаем pipeline даже если init() не завершился — UI продолжит работу
        }
        return State.pipeline;
    }

    // -------------------------------------------------------------
    // Рендеринг статуса пайплайна
    // -------------------------------------------------------------
    async function renderPipelineStatus() {
        const container = document.getElementById('payd-v2-pipeline-status');
        if (!container) return;

        const pipeline = State.pipeline;
        if (!pipeline) {
            container.innerHTML = '<div class="payd-v2-loading">Pipeline initializing…</div>';
            return;
        }

        const status = pipeline.getStatus();
        const scheduler = status.scheduler[0] || null;
        const lastCycle = status.history && status.history.latestCycle;
        const historyStats = status.history || {};
        const lifecycleStats = status.lifecycle || {};

        const html = `
            <div class="payd-v2-pipeline-grid">
                <div class="payd-v2-pipeline-card">
                    <div class="payd-v2-pipeline-card-title">📅 Schedule</div>
                    <div class="payd-v2-pipeline-card-value">Mon · Wed · Fri</div>
                    <div class="payd-v2-pipeline-card-sub">09:00 UTC</div>
                </div>
                <div class="payd-v2-pipeline-card">
                    <div class="payd-v2-pipeline-card-title">⏱ Next Run</div>
                    <div class="payd-v2-pipeline-card-value">${escapeHtml(formatDateTime(scheduler?.nextRunAtISO))}</div>
                    <div class="payd-v2-pipeline-card-sub">${escapeHtml(formatRelative(scheduler?.nextRunAt))}</div>
                </div>
                <div class="payd-v2-pipeline-card">
                    <div class="payd-v2-pipeline-card-title">🕐 Last Cycle</div>
                    <div class="payd-v2-pipeline-card-value">${escapeHtml(formatDateTime(lastCycle?.completedAt))}</div>
                    <div class="payd-v2-pipeline-card-sub">${escapeHtml(formatRelative(lastCycle?.completedAt))}</div>
                </div>
                <div class="payd-v2-pipeline-card">
                    <div class="payd-v2-pipeline-card-title">📊 Cycles</div>
                    <div class="payd-v2-pipeline-card-value">${escapeHtml(String(historyStats.cycleHistory || 0))}</div>
                    <div class="payd-v2-pipeline-card-sub">total executed</div>
                </div>
                <div class="payd-v2-pipeline-card">
                    <div class="payd-v2-pipeline-card-title">📝 Score History</div>
                    <div class="payd-v2-pipeline-card-value">${escapeHtml(String(historyStats.scoreHistory || 0))}</div>
                    <div class="payd-v2-pipeline-card-sub">snapshots</div>
                </div>
                <div class="payd-v2-pipeline-card">
                    <div class="payd-v2-pipeline-card-title">🔄 Events</div>
                    <div class="payd-v2-pipeline-card-value">${escapeHtml(String(historyStats.labelEvents || 0))}</div>
                    <div class="payd-v2-pipeline-card-sub">promotions / demotions</div>
                </div>
            </div>
            <div class="payd-v2-pipeline-actions">
                <button id="payd-v2-run-update-btn" class="payd-v2-btn payd-v2-btn-primary"
                    ${State.isRunning ? 'disabled' : ''}>
                    ${State.isRunning ? '⏳ Running…' : '▶ Run Update Now'}
                </button>
                <button id="payd-v2-export-history-btn" class="payd-v2-btn payd-v2-btn-secondary">
                    📥 Export History
                </button>
            </div>
        `;
        container.innerHTML = html;

        // Привязываем обработчики
        const runBtn = document.getElementById('payd-v2-run-update-btn');
        if (runBtn) {
            runBtn.addEventListener('click', onRunUpdate);
        }
        const exportBtn = document.getElementById('payd-v2-export-history-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', onExportHistory);
        }
    }

    // -------------------------------------------------------------
    // Рендеринг последних Intelligence отчётов
    // -------------------------------------------------------------
    async function renderLatestIntelligence() {
        const container = document.getElementById('payd-v2-latest-intelligence');
        if (!container) return;

        const pipeline = State.pipeline;
        if (!pipeline || !pipeline.historyStore) {
            container.innerHTML = '<div class="payd-v2-loading">No intelligence yet.</div>';
            return;
        }

        const hs = pipeline.historyStore;
        const reportTypes = [
            'weekly_intelligence',
            'opportunity_scanner',
            'top_gainers_by_fundamentals',
            'developer_growth',
            'revenue_growth',
            'github_growth',
            'sector_leaders',
            'core_promotions',
            'demotions',
            'new_emerging',
        ];

        const sections = [];
        for (const reportType of reportTypes) {
            const latest = hs.getLatestReport(reportType);
            if (!latest) continue;
            sections.push(renderReportSection(latest));
        }

        if (sections.length === 0) {
            container.innerHTML = '<div class="payd-v2-empty">No intelligence reports yet. Trigger "Run Update Now" to generate.</div>';
            return;
        }

        container.innerHTML = sections.join('');
    }

    function renderReportSection(report) {
        const p = report.payload || {};
        let body = '';
        let icon = '📊';

        switch (report.reportType) {
            case 'weekly_intelligence':
                icon = '📅';
                const s = p.summary || {};
                body = `
                    <div class="payd-v2-intel-summary">
                        <span>Projects: <strong>${escapeHtml(String(s.totalProjects || 0))}</strong></span>
                        <span>Avg Payd: <strong>${escapeHtml(String(s.avgPaydScore || '—'))}</strong></span>
                        <span>Avg Risk: <strong>${escapeHtml(String(s.avgRiskScore || '—'))}</strong></span>
                        <span>Avg Opportunity: <strong>${escapeHtml(String(s.avgOpportunityScore || '—'))}</strong></span>
                    </div>
                `;
                if (p.topPerformers && p.topPerformers.length > 0) {
                    body += renderList('Top Performers', p.topPerformers.slice(0, 5), (x) =>
                        `<strong>${escapeHtml(x.name)}</strong> — ${escapeHtml(String(x.score))}`);
                }
                break;

            case 'opportunity_scanner':
                icon = '🎯';
                if (p.opportunities) {
                    body = renderList('Top Opportunities', p.opportunities.slice(0, 5), (x) =>
                        `<span class="payd-v2-tier-${escapeHtml((x.tier || 'c').toLowerCase())}">${escapeHtml(x.tier || 'C')}</span>
                         <strong>${escapeHtml(x.name)}</strong> — ${escapeHtml(String(x.score))}`);
                }
                break;

            case 'top_gainers_by_fundamentals':
                icon = '💎';
                if (p.items) {
                    body = renderList('Top by Fundamentals', p.items.slice(0, 5), (x) =>
                        `<strong>${escapeHtml(x.name)}</strong> — ${escapeHtml(String(x.score))}`);
                }
                break;

            case 'developer_growth':
                icon = '👨‍💻';
                if (p.items) {
                    body = renderList('Top by Dev Growth', p.items.slice(0, 5), (x) =>
                        `<strong>${escapeHtml(x.name)}</strong> — ${escapeHtml(String(x.commits))} commits / 30d`);
                }
                break;

            case 'revenue_growth':
                icon = '💰';
                if (p.items) {
                    body = renderList('Top by Revenue', p.items.slice(0, 5), (x) => {
                        const rev = x.revenue24h ? `$${(x.revenue24h/1000).toFixed(1)}K` : '—';
                        return `<strong>${escapeHtml(x.name)}</strong> — ${rev}/24h`;
                    });
                }
                break;

            case 'github_growth':
                icon = '📈';
                if (p.items) {
                    body = renderList('Top GitHub', p.items.slice(0, 5), (x) =>
                        `<strong>${escapeHtml(x.name)}</strong> — ⭐${escapeHtml(String(x.stars))} · ${escapeHtml(String(x.commits))} commits`);
                }
                break;

            case 'sector_leaders':
                icon = '🏆';
                if (p.leaders) {
                    const rows = [];
                    for (const [sector, list] of Object.entries(p.leaders)) {
                        if (!list || list.length === 0) continue;
                        const names = list.map(x => escapeHtml(x.name)).join(', ');
                        rows.push(`<div class="payd-v2-sector-leader-row">
                            <span class="payd-v2-sector-leader-sector">${escapeHtml(sector)}</span>
                            <span class="payd-v2-sector-leader-names">${names}</span>
                        </div>`);
                    }
                    body = rows.join('');
                }
                break;

            case 'core_promotions':
                icon = '⭐';
                if (p.promotions && p.promotions.length > 0) {
                    body = renderList('New Core', p.promotions, (x) =>
                        `<strong>${escapeHtml(x.projectId)}</strong> ${escapeHtml(x.from || '?')} → ${escapeHtml(x.to)}`);
                } else {
                    body = '<div class="payd-v2-empty">No new promotions this cycle.</div>';
                }
                break;

            case 'demotions':
                icon = '⬇';
                if (p.demotions && p.demotions.length > 0) {
                    body = renderList('Demotions', p.demotions, (x) =>
                        `<strong>${escapeHtml(x.projectId)}</strong> ${escapeHtml(x.from || '?')} → ${escapeHtml(x.to)}`);
                } else {
                    body = '<div class="payd-v2-empty">No demotions this cycle.</div>';
                }
                break;

            case 'new_emerging':
                icon = '🌱';
                body = `<div class="payd-v2-intel-count">${escapeHtml(String(p.count || 0))} projects in Emerging</div>`;
                if (p.projects && p.projects.length > 0) {
                    body += `<div class="payd-v2-project-list">${p.projects.slice(0, 10).map(x =>
                        `<span class="payd-v2-project-chip">${escapeHtml(typeof x === 'string' ? x : x.id || x.name)}</span>`
                    ).join('')}</div>`;
                }
                break;
        }

        return `
            <div class="payd-v2-intel-section">
                <div class="payd-v2-intel-header">
                    <span class="payd-v2-intel-icon">${icon}</span>
                    <span class="payd-v2-intel-title">${escapeHtml(humanizeReportType(report.reportType))}</span>
                    <span class="payd-v2-intel-time">${escapeHtml(formatRelative(report.generatedAt))}</span>
                </div>
                <div class="payd-v2-intel-body">${body}</div>
            </div>
        `;
    }

    function renderList(title, items, formatter) {
        if (!items || items.length === 0) {
            return `<div class="payd-v2-empty">No items.</div>`;
        }
        return `<div class="payd-v2-intel-list">
            <div class="payd-v2-intel-list-title">${escapeHtml(title)}</div>
            ${items.map(item => `<div class="payd-v2-intel-list-item">${formatter(item)}</div>`).join('')}
        </div>`;
    }

    function humanizeReportType(type) {
        return (type || '')
            .replace(/_/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase());
    }

    // -------------------------------------------------------------
    // Обработчики кнопок
    // -------------------------------------------------------------
    async function onRunUpdate() {
        if (State.isRunning) return;
        const pipeline = State.pipeline;
        if (!pipeline) return;

        State.isRunning = true;
        await renderPipelineStatus();

        try {
            const result = await pipeline.runManualCycle();
            if (result && result.success) {
                console.log('[PAYD-V2-Pipeline] Manual cycle complete:', result);
            } else {
                console.error('[PAYD-V2-Pipeline] Manual cycle failed:', result);
            }
        } catch (e) {
            console.error('[PAYD-V2-Pipeline] Error:', e);
        } finally {
            State.isRunning = false;
            await renderAll();
        }
    }

    function onExportHistory() {
        const pipeline = State.pipeline;
        if (!pipeline) return;
        const data = pipeline.exportAll();
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `payd-intel-history-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // -------------------------------------------------------------
    // Рендеринг всех pipeline-секций
    // -------------------------------------------------------------
    async function renderAll() {
        await Promise.all([
            renderPipelineStatus(),
            renderLatestIntelligence(),
        ]);
        State.lastRenderedAt = new Date().toISOString();
    }

    async function boot() {
        console.log('[PAYD-V2-Pipeline] boot() started');
        try {
            await initPipeline();
            console.log('[PAYD-V2-Pipeline] Pipeline ready, rendering UI...');
            await renderAll();
            console.log('[PAYD-V2-Pipeline] Render complete');
        } catch (e) {
            console.error('[PAYD-V2-Pipeline] Boot error:', e);
            // Гарантируем отрисовку хотя бы базового состояния
            try { await renderAll(); } catch (e2) { /* ignore */ }
        }
    }

    // Запускаем по событию payd-v2-ready
    if (global.window) {
        document.addEventListener('payd-v2-ready', () => {
            // Небольшая задержка чтобы основной render успел
            setTimeout(boot, 200);
        });
    }

    PAYD_INTEL.PipelineUI = {
        boot,
        renderAll,
        renderPipelineStatus,
        renderLatestIntelligence,
        getState: () => State,
    };

})(window);
