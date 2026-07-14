/* =================================================================
   PAYD Finance — Intelligence Render Module
   Рендеринг всех секций модуля Intelligence.
   Использует только предрассчитанные данные (никакого AI на клиенте).
   ================================================================= */

const U = window.PAYD_INTEL_UTILS;
const D = window.PAYD_INTEL.data;

const INTEL_RENDER = {
    /* === Generic helpers === */
    $: (sel, root = document) => root.querySelector(sel),

    /* === Render: Dashboard (Main "Intelligence" page) === */
    renderDashboard(container) {
        const o = D.overview;
        if (!o) return this.renderLoading(container);

        const lastUpdate = U.fmtDate(o.last_updated);
        const riskAlerts = (o.biggest_risks_7d || []).slice(0, 4);
        const unlocks = (o.upcoming_unlocks_7d || []);
        const research = (o.latest_research || []);
        const latestUpdates = (o.weekly_updates || []).slice(0, 4);

        container.innerHTML = `
            <div class="intel-dash-header reveal-on-scroll">
                <div>
                    <h2 class="intel-dash-title">Market Snapshot</h2>
                    <p class="intel-dash-meta">Last sync: ${lastUpdate} · Next agent run: ${U.fmtDate(o.next_run_at)}</p>
                </div>
                <div class="intel-dash-status">
                    <span class="intel-status-dot"></span>
                    <span>AI Agent Online</span>
                </div>
            </div>

            <div class="intel-kpi-grid">
                <div class="intel-kpi reveal-on-scroll">
                    <div class="intel-kpi-label">Market Overview</div>
                    <div class="intel-kpi-value">${U.fmtUSD(o.market_overview.total_market_cap_usd)}</div>
                    <div class="intel-kpi-delta ${U.deltaClass(o.market_overview.market_cap_change_24h)}">
                        ${U.deltaArrow(o.market_overview.market_cap_change_24h)} ${U.fmtPct(o.market_overview.market_cap_change_24h)} 24h
                    </div>
                </div>

                <div class="intel-kpi reveal-on-scroll">
                    <div class="intel-kpi-label">Projects Tracked</div>
                    <div class="intel-kpi-value">${U.fmtNum(o.totals.projects_tracked)}</div>
                    <div class="intel-kpi-delta ${U.deltaClass(o.totals.tracked_change_7d)}">
                        ${U.deltaArrow(o.totals.tracked_change_7d)} +${o.totals.tracked_change_7d} 7d
                    </div>
                </div>

                <div class="intel-kpi reveal-on-scroll">
                    <div class="intel-kpi-label">AI Score Average</div>
                    <div class="intel-kpi-value">${o.ai_score_average.global.toFixed(1)}<span class="intel-unit">/100</span></div>
                    <div class="intel-kpi-delta ${U.deltaClass(o.ai_score_average.change_7d)}">
                        ${U.deltaArrow(o.ai_score_average.change_7d)} ${U.fmtPct(o.ai_score_average.change_7d, false)} 7d
                    </div>
                </div>

                <div class="intel-kpi reveal-on-scroll">
                    <div class="intel-kpi-label">Weekly Reports</div>
                    <div class="intel-kpi-value">${o.weekly_reports_count || 24}</div>
                    <div class="intel-kpi-delta is-flat">Published Mon · Thu</div>
                </div>

                <div class="intel-kpi reveal-on-scroll">
                    <div class="intel-kpi-label">Top Opportunities</div>
                    <div class="intel-kpi-value">${o.weekly_opportunities.count}</div>
                    <div class="intel-kpi-delta is-flat">Top: ${U.esc(o.weekly_opportunities.top_sector)}</div>
                </div>

                <div class="intel-kpi reveal-on-scroll">
                    <div class="intel-kpi-label">Risk Alerts</div>
                    <div class="intel-kpi-value">${riskAlerts.length}</div>
                    <div class="intel-kpi-delta is-flat">${o.market_overview.fear_greed_index} · ${U.esc(o.market_overview.fear_greed_label)}</div>
                </div>

                <div class="intel-kpi reveal-on-scroll">
                    <div class="intel-kpi-label">Upcoming Unlocks</div>
                    <div class="intel-kpi-value">${unlocks.length}</div>
                    <div class="intel-kpi-delta is-flat">Next 30 days</div>
                </div>

                <div class="intel-kpi reveal-on-scroll">
                    <div class="intel-kpi-label">Latest Research</div>
                    <div class="intel-kpi-value">${research.length}</div>
                    <div class="intel-kpi-delta is-flat">New this week</div>
                </div>

                <div class="intel-kpi reveal-on-scroll">
                    <div class="intel-kpi-label">Latest Updates</div>
                    <div class="intel-kpi-value">${latestUpdates.length}</div>
                    <div class="intel-kpi-delta is-flat">Last: ${lastUpdate}</div>
                </div>
            </div>

            <div class="intel-cols-2">
                <div class="intel-list reveal-on-scroll">
                    <h4 class="intel-list-title">Top Opportunities · 7d</h4>
                    ${(o.weekly_opportunities.highlighted || []).slice(0, 5).map(m => `
                        <div class="intel-list-item">
                            <div class="intel-list-rank">${U.esc(m.ticker.slice(0, 3))}</div>
                            <div class="intel-list-main">
                                <div class="intel-list-name">${U.esc(m.name)}</div>
                                <div class="intel-list-meta">AI Score: <strong style="color:var(--intel-gold);">${m.score}</strong> · Momentum +${U.fmtPct(m.delta, false)}</div>
                            </div>
                            <div class="intel-list-value ${U.deltaClass(m.delta)}">${U.fmtPct(m.delta)}</div>
                        </div>
                    `).join('')}
                </div>

                <div class="intel-list reveal-on-scroll">
                    <h4 class="intel-list-title">Risk Alerts</h4>
                    ${riskAlerts.map(r => `
                        <div class="intel-list-item">
                            <div class="intel-list-rank">!</div>
                            <div class="intel-list-main">
                                <div class="intel-list-name">${U.esc(r.name)}</div>
                                <div class="intel-list-meta">${U.esc(r.risk)}</div>
                            </div>
                            <span class="intel-risk ${U.severityClass(r.severity)}">${U.esc(r.severity)}</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="intel-cols-2">
                <div class="intel-list reveal-on-scroll">
                    <h4 class="intel-list-title">Upcoming Unlocks · 30d</h4>
                    ${unlocks.length === 0 ? '<div class="intel-empty">No major unlocks in the next 30 days.</div>' : unlocks.map(u => `
                        <div class="intel-list-item">
                            <div class="intel-list-rank">${U.esc(u.ticker.slice(0, 3))}</div>
                            <div class="intel-list-main">
                                <div class="intel-list-name">${U.esc(u.name)}</div>
                                <div class="intel-list-meta">${U.fmtDate(u.date)} · ${u.pct_supply.toFixed(2)}% supply</div>
                            </div>
                            <div class="intel-list-value" style="color:var(--intel-orange);">${U.esc(u.usd_value)}</div>
                        </div>
                    `).join('')}
                </div>

                <div class="intel-list reveal-on-scroll">
                    <h4 class="intel-list-title">Latest Research</h4>
                    ${research.length === 0 ? '<div class="intel-empty">No research published this week.</div>' : research.map(r => `
                        <div class="intel-list-item" style="cursor:pointer;" data-ticker="${U.esc(r.ticker || '')}">
                            <div class="intel-list-rank">${U.esc((r.ticker || 'DOC').slice(0, 3))}</div>
                            <div class="intel-list-main">
                                <div class="intel-list-name">${U.esc(r.title)}</div>
                                <div class="intel-list-meta">${U.esc(r.type)} · ${U.fmtDate(r.date)}</div>
                            </div>
                            <div class="intel-list-value" style="color:var(--intel-violet); font-size:11px;">Open ›</div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <h3 class="intel-section-title reveal-on-scroll">Latest Updates</h3>
            <div class="intel-card-grid">
                ${latestUpdates.map(upd => `
                    <div class="intel-project-card reveal-on-scroll" style="cursor:default;">
                        <div class="intel-card-top">
                            <div class="intel-list-main">
                                <div class="intel-list-name" style="font-size:15px;">${U.esc(upd.title)}</div>
                                <div class="intel-list-meta">${U.fmtDate(upd.date)} · ${U.esc(upd.category)}</div>
                            </div>
                            <span class="intel-risk ${upd.impact === 'positive' ? 'intel-risk-low' : (upd.impact === 'negative' ? 'intel-risk-high' : 'intel-risk-medium')}">${U.esc(upd.impact)}</span>
                        </div>
                        <div class="intel-card-summary" style="border-top:none; padding-top:0; margin-top:0;">
                            ${U.esc(upd.summary)}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        U.observeReveal(container);

        // Attach research click → project detail
        container.querySelectorAll('[data-ticker]').forEach(el => {
            const t = el.dataset.ticker;
            if (t && D.projects && D.projects.projects[t]) {
                el.addEventListener('click', () => window.PAYD_INTEL_ROUTER.go('project', { ticker: t }));
            }
        });
    },

    /* === Render: DePIN Intelligence — Professional Table === */
    renderDePIN(container) {
        const d = D.depin;
        if (!d) return this.renderLoading(container);

        const sorted = [...d.projects].sort((a, b) => b.ai_score - a.ai_score);

        container.innerHTML = `
            <div class="intel-subhead reveal-on-scroll">
                <div>
                    <h3>DePIN Intelligence · ${d.total_projects} tracked projects</h3>
                    <div class="intel-subhead-meta">Last sync: ${U.fmtDate(d.last_updated)} · Sorted by AI Score</div>
                </div>
                <div class="intel-subhead-actions">
                    <button class="intel-btn intel-btn-ghost" id="intel-depin-export" type="button">Export CSV</button>
                </div>
            </div>

            <div class="intel-table-wrap reveal-on-scroll">
                <table class="intel-table intel-table-depin">
                    <thead>
                        <tr>
                            <th class="col-logo">Logo</th>
                            <th class="col-name">Project</th>
                            <th class="col-ticker">Ticker</th>
                            <th class="cell-num">AI Score</th>
                            <th class="cell-num">Risk</th>
                            <th class="cell-num">Dev Activity</th>
                            <th class="cell-num">GitHub</th>
                            <th class="cell-num">Users</th>
                            <th class="cell-num">Revenue</th>
                            <th class="cell-num">TVL</th>
                            <th class="cell-num">Nodes</th>
                            <th class="cell-num">Market Cap</th>
                            <th class="cell-num">FDV</th>
                            <th class="cell-num">Unlock</th>
                            <th>Investment Rating</th>
                            <th class="col-action">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sorted.map(p => this.depinRow(p)).join('')}
                    </tbody>
                </table>
            </div>
        `;

        // Row click → project detail
        container.querySelectorAll('.intel-depin-row').forEach(row => {
            row.addEventListener('click', (e) => {
                // Don't navigate if clicking the action button (it has its own handler)
                if (e.target.closest('.intel-btn')) return;
                window.PAYD_INTEL_ROUTER.go('project', { ticker: row.dataset.ticker });
            });
        });
        container.querySelectorAll('.intel-btn-open-research').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.PAYD_INTEL_ROUTER.go('project', { ticker: btn.dataset.ticker });
            });
        });

        // Export CSV
        const exportBtn = container.querySelector('#intel-depin-export');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportDePINCSV(sorted));
        }

        U.observeReveal(container);
    },

    depinRow(p) {
        const m = p.metrics || {};
        const aiDelta = p.ai_score_change_7d || 0;
        const aiClass = aiDelta >= 0 ? 'is-up' : 'is-down';
        const riskClass = U.riskClass(p.risk_label);

        return `
            <tr class="intel-depin-row" data-ticker="${U.esc(p.ticker)}" tabindex="0">
                <td class="col-logo"><div class="intel-row-logo">${U.esc(p.logo || '◇')}</div></td>
                <td class="col-name">
                    <div class="intel-row-name">${U.esc(p.name)}</div>
                    <div class="intel-row-subsector">${U.esc(p.subsector || '')}</div>
                </td>
                <td class="col-ticker"><span class="intel-row-ticker">${U.esc(p.ticker)}</span></td>
                <td class="cell-num">
                    <div class="intel-row-score">
                        <strong>${p.ai_score}</strong>
                        <span class="intel-row-delta ${aiClass}">${U.deltaArrow(aiDelta)} ${U.fmtPct(aiDelta, false)}</span>
                    </div>
                </td>
                <td class="cell-num"><span class="intel-risk ${riskClass}">${p.risk_score}<span class="intel-risk-sub">${U.esc(p.risk_label)}</span></span></td>
                <td class="cell-num cell-mono">${p.developer_activity || 0}</td>
                <td class="cell-num cell-mono">${p.github_activity || 0}</td>
                <td class="cell-num cell-mono">${U.fmtCompact(m.monthly_active_users || 0)}</td>
                <td class="cell-num cell-mono">${U.fmtUSD(m.monthly_revenue_usd || 0, true)}</td>
                <td class="cell-num cell-mono">${U.fmtUSD(m.tvl_usd || 0, true)}</td>
                <td class="cell-num cell-mono">${U.fmtNum(m.nodes_count || 0)}</td>
                <td class="cell-num cell-mono">${U.fmtUSD(m.market_cap_usd || 0, true)}</td>
                <td class="cell-num cell-mono">${U.fmtUSD(m.fdv_usd || 0, true)}</td>
                <td class="cell-num">
                    <div class="intel-row-unlock">
                        <div>${U.fmtDate(m.next_unlock)}</div>
                        <div class="intel-row-unlock-pct">${(m.next_unlock_pct || 0).toFixed(2)}%</div>
                    </div>
                </td>
                <td><span class="intel-rating-pill ${U.ratingClass(p.investment_rating)}">${U.esc(p.investment_rating)}</span></td>
                <td class="col-action">
                    <button class="intel-btn intel-btn-primary intel-btn-open-research" data-ticker="${U.esc(p.ticker)}" type="button">Open Research</button>
                </td>
            </tr>
        `;
    },

    exportDePINCSV(projects) {
        const cols = ['Ticker', 'Name', 'Subsector', 'AI Score', 'Risk Score', 'Risk Label',
                      'Developer Activity', 'GitHub Activity', 'Users', 'Revenue (USD)',
                      'TVL (USD)', 'Nodes', 'Market Cap (USD)', 'FDV (USD)',
                      'Next Unlock', 'Unlock %', 'Investment Rating'];
        const rows = projects.map(p => [
            p.ticker, p.name, p.subsector || '', p.ai_score, p.risk_score, p.risk_label,
            p.developer_activity, p.github_activity,
            (p.metrics && p.metrics.monthly_active_users) || 0,
            (p.metrics && p.metrics.monthly_revenue_usd) || 0,
            (p.metrics && p.metrics.tvl_usd) || 0,
            (p.metrics && p.metrics.nodes_count) || 0,
            (p.metrics && p.metrics.market_cap_usd) || 0,
            (p.metrics && p.metrics.fdv_usd) || 0,
            (p.metrics && p.metrics.next_unlock) || '',
            (p.metrics && p.metrics.next_unlock_pct) || 0,
            p.investment_rating,
        ]);
        const csv = [cols, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'payd-depin-' + new Date().toISOString().slice(0, 10) + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    /* === Render: AI Infrastructure === */
    renderAIInfra(container) {
        const d = D.aiInfra;
        if (!d) return this.renderLoading(container);

        const cats = d.categories;
        const catKeys = Object.keys(cats);

        container.innerHTML = `
            <div class="intel-subtabs" id="intel-ai-subtabs">
                ${catKeys.map((k, i) => `
                    <button class="intel-subtab ${i === 0 ? 'is-active' : ''}" data-cat="${U.esc(k)}">
                        ${U.esc(cats[k].label)} <span style="color:var(--intel-text-faint);font-weight:400;">· ${cats[k].projects.length}</span>
                    </button>
                `).join('')}
            </div>
            <div id="intel-ai-subcontent">
                ${this.renderAICategory(cats[catKeys[0]], true)}
            </div>
        `;

        const subtabs = container.querySelectorAll('.intel-subtab');
        const subcontent = container.querySelector('#intel-ai-subcontent');
        subtabs.forEach(t => {
            t.addEventListener('click', () => {
                subtabs.forEach(s => s.classList.remove('is-active'));
                t.classList.add('is-active');
                subcontent.innerHTML = this.renderAICategory(cats[t.dataset.cat]);
                this.attachCardHandlers(subcontent);
                U.observeReveal(subcontent);
            });
        });

        this.attachCardHandlers(subcontent);
        U.observeReveal(container);
    },

    renderAICategory(cat, isFirst = false) {
        if (!cat) return '';
        return `
            <div class="intel-list" style="margin-bottom:20px;">
                <h4 class="intel-list-title">${U.esc(cat.label)}</h4>
                <div class="intel-list-meta" style="font-size:13px; line-height:1.5;">${U.esc(cat.description)}</div>
            </div>
            <div class="intel-card-grid">
                ${[...cat.projects].sort((a, b) => b.ai_score - a.ai_score).map(p => this.projectCard(p)).join('')}
            </div>
        `;
    },

    /* === Render: Watchlist (admin-curated) === */
    renderWatchlist(container) {
        const d = D.watchlist;
        if (!d) return this.renderLoading(container);

        container.innerHTML = `
            <div class="intel-list" style="margin-bottom:24px;">
                <h4 class="intel-list-title">${U.esc(d.description)}</h4>
                <div class="intel-list-meta" style="font-size:13px; line-height:1.5;">
                    <strong>${d.count} projects</strong> · Curated by ${U.esc(d.curated_by)} · Updated ${d.update_frequency.toLowerCase()}
                </div>
            </div>
            <div class="intel-card-grid">
                ${d.watchlist.map(p => `
                    <div class="intel-project-card reveal-on-scroll" data-ticker="${U.esc(p.ticker)}" role="button" tabindex="0">
                        ${this.projectCardBody(p)}
                        <div class="intel-card-summary">
                            <strong style="color:var(--intel-text);">Thesis:</strong> ${U.esc(p.thesis)}
                        </div>
                        <div style="margin-top:12px; font-size:11px; color:var(--intel-text-faint);">
                            In watchlist since ${U.fmtDate(p.added_at)}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        this.attachCardHandlers(container);
        U.observeReveal(container);
    },

    /* === Render: Opportunity Scanner === */
    renderOpportunities(container) {
        const d = D.opportunities;
        if (!d) return this.renderLoading(container);

        container.innerHTML = `
            <div class="intel-list" style="margin-bottom:24px;">
                <h4 class="intel-list-title">Opportunity Scanner · ${d.total_flagged} flagged</h4>
                <div class="intel-list-meta" style="font-size:13px; line-height:1.5;">
                    <strong>Scan logic:</strong> ${U.esc(d.scan_logic)}<br>
                    <strong>Window:</strong> ${d.scan_window_days}d momentum vs ${d.baseline_window_days}d baseline
                </div>
            </div>
            ${d.opportunities.map(opp => `
                <div class="intel-block reveal-on-scroll">
                    <div class="intel-card-top" style="margin-bottom:16px;">
                        <div class="intel-project-logo">${U.esc(opp.logo)}</div>
                        <div class="intel-project-id">
                            <div class="intel-project-name">${U.esc(opp.name)}</div>
                            <div class="intel-project-ticker">${U.esc(opp.ticker)} · ${U.esc(opp.sector)} · ${U.esc(opp.subsector)}</div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:11px; color:var(--intel-text-faint); letter-spacing:0.08em; text-transform:uppercase;">Conviction</div>
                            <div style="font-size:14px; font-weight:700; color:var(--intel-gold);">${U.esc(opp.conviction)}</div>
                        </div>
                    </div>

                    <div class="intel-component-grid" style="grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); margin-bottom:18px;">
                        <div class="intel-component">
                            <div class="intel-component-head">
                                <span class="intel-component-name">AI Score</span>
                            </div>
                            <div class="intel-component-score">${opp.ai_score}</div>
                            <div class="intel-component-bar"><div class="intel-component-bar-fill" style="width:${opp.ai_score}%"></div></div>
                            <div style="font-size:11px; margin-top:6px; color:${U.deltaClass(opp.ai_score_change_7d) === 'is-up' ? 'var(--intel-green)' : (U.deltaClass(opp.ai_score_change_7d) === 'is-down' ? 'var(--intel-red)' : 'var(--intel-text-faint)')}">
                                ${U.deltaArrow(opp.ai_score_change_7d)} ${U.fmtPct(opp.ai_score_change_7d, false)} 7d
                            </div>
                        </div>
                        <div class="intel-component">
                            <div class="intel-component-head">
                                <span class="intel-component-name">Momentum</span>
                            </div>
                            <div class="intel-component-score">${opp.momentum_score}</div>
                            <div class="intel-component-bar"><div class="intel-component-bar-fill" style="width:${opp.momentum_score}%; background:linear-gradient(90deg, #4ADE80, #F3C94A);"></div></div>
                            <div style="font-size:11px; margin-top:6px; color:${U.deltaClass(opp.momentum_change_7d) === 'is-up' ? 'var(--intel-green)' : (U.deltaClass(opp.momentum_change_7d) === 'is-down' ? 'var(--intel-red)' : 'var(--intel-text-faint)')}">
                                ${U.deltaArrow(opp.momentum_change_7d)} ${U.fmtPct(opp.momentum_change_7d, false)} 7d
                            </div>
                        </div>
                    </div>

                    <h4 style="font-size:13px; font-weight:600; color:var(--intel-text-dim); letter-spacing:0.08em; text-transform:uppercase; margin:18px 0 10px;">Fundamental Deltas</h4>
                    <table class="intel-table">
                        <thead>
                            <tr>
                                <th>Metric</th>
                                <th class="cell-num">Current</th>
                                <th class="cell-num">90d Avg</th>
                                <th class="cell-num">Δ</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.entries(opp.fundamental_delta).map(([k, v]) => `
                                <tr>
                                    <td>${U.esc(k.replace(/_/g, ' '))}</td>
                                    <td class="cell-num cell-mono">${typeof v.current === 'number' && v.current > 1000 ? U.fmtCompact(v.current) : U.fmtNum(v.current)}</td>
                                    <td class="cell-num cell-mono">${typeof v.previous_avg === 'number' && v.previous_avg > 1000 ? U.fmtCompact(v.previous_avg) : U.fmtNum(v.previous_avg)}</td>
                                    <td class="cell-num" style="color:${v.delta_pct >= 0 ? 'var(--intel-green)' : 'var(--intel-red)'};">${U.fmtPct(v.delta_pct, false)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>

                    <h4 style="font-size:13px; font-weight:600; color:var(--intel-text-dim); letter-spacing:0.08em; text-transform:uppercase; margin:20px 0 10px;">Signal Triggers</h4>
                    <ul style="margin:0; padding-left:20px; color:var(--intel-text-dim); font-size:14px; line-height:1.7;">
                        ${opp.signal_triggers.map(s => `<li>${U.esc(s)}</li>`).join('')}
                    </ul>

                    <h4 style="font-size:13px; font-weight:600; color:var(--intel-text-dim); letter-spacing:0.08em; text-transform:uppercase; margin:20px 0 10px;">AI Investment Opinion</h4>
                    <p style="font-size:14px; line-height:1.65; color:var(--intel-text);">${U.esc(opp.ai_investment_opinion)}</p>

                    ${opp.risk_factors && opp.risk_factors.length ? `
                        <h4 style="font-size:13px; font-weight:600; color:var(--intel-text-dim); letter-spacing:0.08em; text-transform:uppercase; margin:20px 0 10px;">Risk Factors</h4>
                        <ul style="margin:0; padding-left:20px; color:var(--intel-red); font-size:14px; line-height:1.7;">
                            ${opp.risk_factors.map(r => `<li>${U.esc(r)}</li>`).join('')}
                        </ul>
                    ` : ''}
                </div>
            `).join('')}
        `;
        U.observeReveal(container);
    },

    /* === Render: Weekly Intelligence === */
    renderWeeklyReports(container) {
        const d = D.weeklyReports;
        if (!d) return this.renderLoading(container);

        const reports = d.reports;
        const archived = d.total_reports_archived;

        container.innerHTML = `
            <div class="intel-list" style="margin-bottom:24px;">
                <h4 class="intel-list-title">Weekly Intelligence Schedule</h4>
                <div class="intel-list-meta" style="font-size:13px; line-height:1.5;">
                    <strong>Published:</strong> ${U.esc(d.schedule)}<br>
                    <strong>Archived reports:</strong> ${archived} · <strong>Last run:</strong> ${U.fmtDate(d.last_run_at)}
                </div>
            </div>
            ${reports.map((r, i) => `
                <div class="intel-block reveal-on-scroll">
                    <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:20px; margin-bottom:14px; flex-wrap:wrap;">
                        <div>
                            <div style="font-size:11px; color:var(--intel-text-faint); letter-spacing:0.08em; text-transform:uppercase; margin-bottom:4px;">
                                ${U.esc(r.type)} · ${U.fmtDate(r.date)} · ${U.esc(r.id)}
                            </div>
                            <h3 style="font-size:22px; font-weight:700; color:var(--intel-text); margin:0; letter-spacing:-0.01em;">${U.esc(r.title)}</h3>
                        </div>
                    </div>
                    <p style="font-size:14px; line-height:1.65; color:var(--intel-text-dim); margin-bottom:20px;">${U.esc(r.summary)}</p>

                    <h4 style="font-size:13px; font-weight:600; color:var(--intel-gold); letter-spacing:0.08em; text-transform:uppercase; margin:20px 0 10px;">Market Overview</h4>
                    <div class="intel-component-grid" style="grid-template-columns:repeat(auto-fill, minmax(150px, 1fr));">
                        <div class="intel-component"><div class="intel-component-name">Market Cap</div><div class="intel-component-score">${U.esc(r.market_overview.total_market_cap)}</div></div>
                        <div class="intel-component"><div class="intel-component-name">7d Change</div><div class="intel-component-score" style="color:${r.market_overview.market_cap_change_7d >= 0 ? 'var(--intel-green)' : 'var(--intel-red)'};">${U.fmtPct(r.market_overview.market_cap_change_7d)}</div></div>
                        <div class="intel-component"><div class="intel-component-name">BTC Dom</div><div class="intel-component-score">${r.market_overview.btc_dominance}%</div></div>
                        <div class="intel-component"><div class="intel-component-name">Fear &amp; Greed</div><div class="intel-component-score">${r.market_overview.fear_greed}</div></div>
                    </div>
                    <p style="font-size:14px; line-height:1.65; color:var(--intel-text-dim); margin-top:14px;"><strong>Macro:</strong> ${U.esc(r.market_overview.key_macro)}</p>

                    <h4 style="font-size:13px; font-weight:600; color:var(--intel-gold); letter-spacing:0.08em; text-transform:uppercase; margin:20px 0 10px;">Top Opportunities</h4>
                    ${r.top_opportunities.map(o => `
                        <div style="padding:10px 0; border-bottom:1px solid var(--intel-border);">
                            <strong style="color:var(--intel-text);">${U.esc(o.ticker)}:</strong>
                            <span style="color:var(--intel-text-dim); font-size:14px;"> ${U.esc(o.thesis)}</span>
                        </div>
                    `).join('')}

                    ${r.biggest_ecosystem_growth ? `
                    <h4 style="font-size:13px; font-weight:600; color:var(--intel-gold); letter-spacing:0.08em; text-transform:uppercase; margin:20px 0 10px;">Biggest Ecosystem Growth</h4>
                    ${r.biggest_ecosystem_growth.map(g => `
                        <div style="padding:10px 0; border-bottom:1px solid var(--intel-border); display:flex; justify-content:space-between; gap:14px; flex-wrap:wrap;">
                            <div>
                                <strong style="color:var(--intel-text);">${U.esc(g.ticker)}</strong>
                                <span style="color:var(--intel-text-faint); font-size:13px; margin-left:6px;">${U.esc(g.metric)}: ${U.esc(g.value)}</span>
                                <div style="color:var(--intel-text-dim); font-size:13px; margin-top:2px;">${U.esc(g.comment)}</div>
                            </div>
                            <div style="color:var(--intel-green); font-weight:600; font-size:14px; white-space:nowrap;">${U.fmtPct(g.delta_pct, false)}</div>
                        </div>
                    `).join('')}
                    ` : ''}

                    ${r.most_active_developers ? `
                    <h4 style="font-size:13px; font-weight:600; color:var(--intel-gold); letter-spacing:0.08em; text-transform:uppercase; margin:20px 0 10px;">Most Active Developers</h4>
                    <table class="intel-table">
                        <thead><tr><th>Project</th><th class="cell-num">Active Devs (30d)</th><th class="cell-num">Δ</th><th>Comment</th></tr></thead>
                        <tbody>
                            ${r.most_active_developers.map(d => `
                                <tr>
                                    <td><strong>${U.esc(d.ticker)}</strong></td>
                                    <td class="cell-num cell-mono">${d.active_devs_30d}</td>
                                    <td class="cell-num" style="color:${d.delta_pct >= 0 ? 'var(--intel-green)' : 'var(--intel-red)'};">${U.fmtPct(d.delta_pct, false)}</td>
                                    <td style="color:var(--intel-text-dim); font-size:13px;">${U.esc(d.comment)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    ` : ''}

                    ${r.github_leaders ? `
                    <h4 style="font-size:13px; font-weight:600; color:var(--intel-gold); letter-spacing:0.08em; text-transform:uppercase; margin:20px 0 10px;">GitHub Leaders</h4>
                    <table class="intel-table">
                        <thead><tr><th>Project</th><th class="cell-num">Commits (30d)</th><th>Comment</th></tr></thead>
                        <tbody>
                            ${r.github_leaders.map(g => `
                                <tr>
                                    <td><strong>${U.esc(g.ticker)}</strong></td>
                                    <td class="cell-num cell-mono">${g.commits_30d}</td>
                                    <td style="color:var(--intel-text-dim); font-size:13px;">${U.esc(g.comment)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    ` : ''}

                    ${r.new_partnerships ? `
                    <h4 style="font-size:13px; font-weight:600; color:var(--intel-gold); letter-spacing:0.08em; text-transform:uppercase; margin:20px 0 10px;">New Partnerships</h4>
                    ${r.new_partnerships.map(p => `
                        <div style="padding:10px 0; border-bottom:1px solid var(--intel-border);">
                            <strong style="color:var(--intel-text);">${U.esc(p.ticker)} × ${U.esc(p.partner)}</strong>
                            <div style="color:var(--intel-text-dim); font-size:13px; margin-top:2px;">${U.esc(p.summary)}</div>
                        </div>
                    `).join('')}
                    ` : ''}

                    ${r.investment_rounds ? `
                    <h4 style="font-size:13px; font-weight:600; color:var(--intel-gold); letter-spacing:0.08em; text-transform:uppercase; margin:20px 0 10px;">Investment Rounds</h4>
                    <table class="intel-table">
                        <thead><tr><th>Company</th><th>Round</th><th class="cell-num">Amount</th><th>Lead</th><th>Date</th></tr></thead>
                        <tbody>
                            ${r.investment_rounds.map(ir => `
                                <tr>
                                    <td><strong>${U.esc(ir.company)}</strong></td>
                                    <td>${U.esc(ir.round)}</td>
                                    <td class="cell-num cell-mono">${U.esc(ir.amount)}</td>
                                    <td>${U.esc(ir.lead)}</td>
                                    <td>${U.fmtDate(ir.date)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    ` : ''}

                    ${r.upcoming_unlocks ? `
                    <h4 style="font-size:13px; font-weight:600; color:var(--intel-orange); letter-spacing:0.08em; text-transform:uppercase; margin:20px 0 10px;">Upcoming Unlocks</h4>
                    <table class="intel-table">
                        <thead><tr><th>Project</th><th>Date</th><th class="cell-num">% Supply</th><th class="cell-num">USD Value</th><th>Note</th></tr></thead>
                        <tbody>
                            ${r.upcoming_unlocks.map(u => `
                                <tr>
                                    <td><strong>${U.esc(u.ticker)}</strong></td>
                                    <td>${U.fmtDate(u.date)}</td>
                                    <td class="cell-num cell-mono">${u.pct_supply.toFixed(2)}%</td>
                                    <td class="cell-num cell-mono">${U.esc(u.usd_value)}</td>
                                    <td style="color:var(--intel-text-dim); font-size:13px;">${U.esc(u.comment)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    ` : ''}

                    ${r.risk_alerts ? `
                    <h4 style="font-size:13px; font-weight:600; color:var(--intel-red); letter-spacing:0.08em; text-transform:uppercase; margin:20px 0 10px;">Risk Alerts</h4>
                    ${r.risk_alerts.map(ra => `
                        <div style="padding:10px 0; border-bottom:1px solid var(--intel-border); display:flex; align-items:flex-start; gap:10px;">
                            <span class="intel-risk ${U.severityClass(ra.severity)}" style="margin-left:0; margin-top:2px; flex-shrink:0;">${U.esc(ra.severity)}</span>
                            <div>
                                <strong style="color:var(--intel-text);">${U.esc(ra.ticker)}</strong>
                                <span style="color:var(--intel-text-dim); font-size:14px;"> — ${U.esc(ra.alert)}</span>
                            </div>
                        </div>
                    `).join('')}
                    ` : ''}

                    <h4 style="font-size:13px; font-weight:600; color:var(--intel-gold); letter-spacing:0.08em; text-transform:uppercase; margin:20px 0 10px;">AI Conclusions</h4>
                    <p style="font-size:14px; line-height:1.65; color:var(--intel-text); background:rgba(124,92,255,0.06); padding:16px; border-radius:8px; border-left:3px solid var(--intel-violet);">${U.esc(r.ai_conclusions)}</p>

                    ${r.metadata ? `
                    <div style="margin-top:20px; padding-top:14px; border-top:1px solid var(--intel-border); font-size:11px; color:var(--intel-text-faint);">
                        <strong>Agent metadata:</strong>
                        ${U.fmtNum(r.metadata.tokens_analyzed)} tokens analyzed ·
                        ${U.fmtCompact(r.metadata.data_points_processed)} data points ·
                        ${r.metadata.apis_called.join(', ')} ·
                        ${U.esc(r.metadata.agent_version)} ·
                        ${r.metadata.compute_time_seconds}s compute
                    </div>
                    ` : ''}
                </div>
            `).join('')}

            <div style="text-align:center; padding:24px; color:var(--intel-text-faint); font-size:13px;">
                <strong style="color:var(--intel-text);">${archived - reports.length} earlier reports</strong> archived in the system. Use navigation menu to access historical reports.
            </div>
        `;
        U.observeReveal(container);
    },

    /* === Render: Project Detail (Project Research) === */
    renderProjectDetail(container, ticker) {
        const d = D.projects;
        if (!d) return this.renderLoading(container);

        const p = d.projects[ticker];
        if (!p) {
            container.innerHTML = `
                <button class="intel-detail-back" id="intel-back-btn">← Back to Intelligence</button>
                <div class="intel-empty">Project "${U.esc(ticker)}" not found in current dataset.</div>
            `;
            container.querySelector('#intel-back-btn').addEventListener('click', () => window.PAYD_INTEL_ROUTER.go('dashboard'));
            return;
        }

        const scoreChange = p.ai_score_change_7d;

        // ── PAYD ALPHA ENGINE ─────────────────────────────────────────────
        // Данные из IntelligenceDatabase подгружаются асинхронно внутри
        // _renderAlphaScores (см. ниже). Это нужно для совместимости с
        // IntelligenceDatabaseSupabase, у которого read-методы возвращают Promise.
        // ─────────────────────────────────────────────────────────────────

        container.innerHTML = `
            <button class="intel-detail-back" id="intel-back-btn">← Back to Intelligence</button>

            <div class="intel-detail-hero reveal-on-scroll">
                <div class="intel-detail-logo">${U.esc(p.logo)}</div>
                <div class="intel-detail-id">
                    <h1>${U.esc(p.name)}</h1>
                    <div class="intel-detail-meta">
                        <span><strong>${U.esc(p.ticker)}</strong></span>
                        <span>·</span>
                        <span>${U.esc(p.sector)}</span>
                        <span>·</span>
                        <span>${U.esc(p.subsector)}</span>
                        <span>·</span>
                        <span>${U.esc(p.headquarters)}</span>
                        <span>·</span>
                        <span>Founded ${p.founded}</span>
                    </div>
                </div>
                <div class="intel-detail-score">
                    <div class="intel-detail-score-label">AI Score</div>
                    <div class="intel-detail-score-value">${p.ai_score}</div>
                    <div class="intel-detail-score-delta ${U.deltaClass(scoreChange)}">${U.deltaArrow(scoreChange)} ${U.fmtPct(scoreChange, false)} 7d</div>
                </div>
            </div>

            <!-- === PAYD ALPHA ENGINE — 3 score cards + AI summary + history + labels + timeline === -->
            <div class="payd-alpha-section reveal-on-scroll" id="payd-alpha-scores-${U.esc(ticker)}" data-ticker="${U.esc(ticker)}">
                <div class="payd-alpha-section-head">
                    <div class="payd-alpha-section-title">PAYD Alpha Engine</div>
                    <div class="payd-alpha-section-subtitle">Quality · Confidence · Opportunity</div>
                </div>
                <div class="payd-alpha-loading">Loading 3-score analysis…</div>
            </div>

            <div class="intel-cols-2">
                <div class="intel-block reveal-on-scroll">
                    <h3>Rating &amp; Risk</h3>
                    <p>
                        <span class="intel-rating-pill ${U.ratingClass(p.investment_rating)}">${U.esc(p.investment_rating)}</span>
                        <span style="margin-left:10px; color:var(--intel-text-dim);">Score: ${p.rating_score.toFixed(1)} / 5.0</span>
                    </p>
                    <p>
                        <strong style="color:var(--intel-text);">Risk Score:</strong>
                        <span class="intel-risk ${U.riskClass(p.risk_label)}">${p.risk_score} · ${U.esc(p.risk_label)}</span>
                    </p>
                </div>
                <div class="intel-block reveal-on-scroll">
                    <h3>Quick Stats</h3>
                    <p>
                        <strong style="color:var(--intel-text);">Market Cap:</strong>
                        <span style="font-variant-numeric:tabular-nums;">${U.fmtUSD(p.metrics.market_cap_usd)}</span>
                        &nbsp;·&nbsp;
                        <strong style="color:var(--intel-text);">FDV:</strong>
                        <span style="font-variant-numeric:tabular-nums;">${U.fmtUSD(p.metrics.fdv_usd)}</span>
                    </p>
                    <p>
                        <strong style="color:var(--intel-text);">TVL:</strong> ${U.fmtUSD(p.metrics.tvl_usd)}
                        &nbsp;·&nbsp;
                        <strong style="color:var(--intel-text);">Monthly Revenue:</strong> ${U.fmtUSD(p.metrics.monthly_revenue_usd)}
                    </p>
                    <p>
                        <strong style="color:var(--intel-text);">Next unlock:</strong>
                        ${U.fmtDate(p.metrics.next_unlock_date)} · ${p.metrics.next_unlock_pct.toFixed(2)}% · ${U.esc(p.metrics.next_unlock_usd_value)}
                    </p>
                </div>
            </div>

            <div class="intel-block reveal-on-scroll">
                <h3>Description</h3>
                <p>${U.esc(p.description)}</p>
            </div>

            <div class="intel-block reveal-on-scroll">
                <h3>Investment Thesis</h3>
                <p>${U.esc(p.thesis)}</p>
            </div>

            <div class="intel-block reveal-on-scroll">
                <h3>AI Investment Opinion</h3>
                <p style="background:rgba(124,92,255,0.06); padding:16px; border-radius:8px; border-left:3px solid var(--intel-violet);">${U.esc(p.ai_investment_opinion)}</p>
            </div>

            <div class="intel-block reveal-on-scroll">
                <h3>AI Score · Components</h3>
                <p style="font-size:12px; color:var(--intel-text-faint); margin-bottom:14px;">
                    Weighted composite of 11 fundamental factors. Total weights sum to 100%.
                </p>
                <div class="intel-component-grid">
                    ${Object.entries({
                        'GitHub Activity':  ['github_activity', 20],
                        'Developer Activity':['developer_activity', 15],
                        'Revenue':           ['revenue', 15],
                        'Users':             ['users', 10],
                        'TVL':               ['tvl', 10],
                        'Community':         ['community', 10],
                        'Partnerships':      ['partnerships', 10],
                        'Liquidity':         ['liquidity', 5],
                        'Tokenomics':        ['tokenomics', 5],
                        'Unlock Risk':       ['unlock_risk', 5],
                        'Market Momentum':   ['market_momentum', 5],
                    }).map(([label, [key, weight]]) => `
                        <div class="intel-component">
                            <div class="intel-component-head">
                                <span class="intel-component-name">${U.esc(label)}</span>
                                <span class="intel-component-weight">${weight}%</span>
                            </div>
                            <div class="intel-component-score">${p.ai_score_components[key]}</div>
                            <div class="intel-component-bar"><div class="intel-component-bar-fill" style="width:${p.ai_score_components[key]}%"></div></div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="intel-block reveal-on-scroll">
                <h3>AI Score History (6 months)</h3>
                <div class="intel-history-chart">${U.sparkline(p.ai_score_history.map(h => h.score))}</div>
                <p style="font-size:12px; color:var(--intel-text-faint); margin-top:8px;">
                    ${U.fmtDate(p.ai_score_history[0].date)}: <strong>${p.ai_score_history[0].score}</strong>
                    → ${U.fmtDate(p.ai_score_history[p.ai_score_history.length - 1].date)}: <strong>${p.ai_score_history[p.ai_score_history.length - 1].score}</strong>
                </p>
            </div>

            <div class="intel-cols-2">
                <div class="intel-block reveal-on-scroll">
                    <h3>Team</h3>
                    ${p.team.map(m => `
                        <div style="padding:10px 0; border-bottom:1px solid var(--intel-border);">
                            <strong style="color:var(--intel-text);">${U.esc(m.name)}</strong>
                            <span style="color:var(--intel-gold); font-size:12px; margin-left:6px;">${U.esc(m.role)}</span>
                            <div style="color:var(--intel-text-dim); font-size:13px; margin-top:2px;">${U.esc(m.background)}</div>
                        </div>
                    `).join('')}
                </div>
                <div class="intel-block reveal-on-scroll">
                    <h3>Investors</h3>
                    ${p.investors.map(i => `
                        <div style="padding:10px 0; border-bottom:1px solid var(--intel-border); display:flex; justify-content:space-between; gap:10px;">
                            <div>
                                <strong style="color:var(--intel-text);">${U.esc(i.name)}</strong>
                                <span style="color:var(--intel-text-faint); font-size:12px; margin-left:6px;">${U.esc(i.tier)}</span>
                            </div>
                            <div style="color:var(--intel-text-dim); font-size:12px; text-align:right;">${i.rounds.map(U.esc).join('<br>')}</div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div class="intel-block reveal-on-scroll">
                <h3>Roadmap</h3>
                <table class="intel-table">
                    <thead><tr><th>Quarter</th><th>Milestone</th><th>Status</th></tr></thead>
                    <tbody>
                        ${p.roadmap.map(r => `
                            <tr>
                                <td><strong>${U.esc(r.quarter)}</strong></td>
                                <td>${U.esc(r.milestone)}</td>
                                <td>
                                    <span class="intel-risk ${r.status === 'on-track' ? 'intel-risk-low' : (r.status === 'in-progress' ? 'intel-risk-medium' : 'intel-risk-low')}" style="margin-left:0;">
                                        ${U.esc(r.status)}
                                    </span>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <div class="intel-block reveal-on-scroll">
                <h3>GitHub Activity</h3>
                <div class="intel-component-grid" style="grid-template-columns:repeat(auto-fill, minmax(140px, 1fr));">
                    <div class="intel-component"><div class="intel-component-name">Stars</div><div class="intel-component-score">${U.fmtNum(p.github.stars)}</div></div>
                    <div class="intel-component"><div class="intel-component-name">Forks</div><div class="intel-component-score">${U.fmtNum(p.github.forks)}</div></div>
                    <div class="intel-component"><div class="intel-component-name">Commits 30d</div><div class="intel-component-score">${p.github.commits_30d}</div></div>
                    <div class="intel-component"><div class="intel-component-name">Active Devs 30d</div><div class="intel-component-score">${p.github.active_devs_30d}</div></div>
                    <div class="intel-component"><div class="intel-component-name">Contributors</div><div class="intel-component-score">${U.fmtNum(p.github.contributors_total)}</div></div>
                    <div class="intel-component"><div class="intel-component-name">Last commit</div><div class="intel-component-score" style="font-size:14px;">${U.fmtDate(p.github.last_commit)}</div></div>
                </div>
                <p style="margin-top:14px; font-size:12px; color:var(--intel-text-faint);">
                    <strong>Repository:</strong> <code style="color:var(--intel-text);">${U.esc(p.github.repo)}</code>
                    · <strong>Languages:</strong> ${p.github.primary_languages.join(', ')}
                </p>
            </div>

            <div class="intel-block reveal-on-scroll">
                <h3>Tokenomics</h3>
                <p><strong style="color:var(--intel-text);">Initial Supply:</strong> ${U.fmtNum(p.tokenomics.initial_supply)} · <strong style="color:var(--intel-text);">Circulating:</strong> ${p.tokenomics.circulating_pct.toFixed(1)}%</p>
                <p><strong style="color:var(--intel-text);">Vesting:</strong> ${U.esc(p.tokenomics.vesting)}</p>
                <p><strong style="color:var(--intel-text);">Utility:</strong> ${U.esc(p.tokenomics.utility)}</p>
                <p><strong style="color:var(--intel-text);">Buyback/Burn:</strong> ${U.esc(p.tokenomics.buyback_burn)}</p>
            </div>

            <div class="intel-block reveal-on-scroll">
                <h3>Unlock Schedule</h3>
                <table class="intel-table">
                    <thead><tr><th>Date</th><th class="cell-num">% Supply</th><th class="cell-num">USD Value</th><th>Type</th></tr></thead>
                    <tbody>
                        ${p.unlock_schedule.map(u => `
                            <tr>
                                <td>${U.fmtDate(u.date)}</td>
                                <td class="cell-num cell-mono">${u.pct.toFixed(2)}%</td>
                                <td class="cell-num cell-mono">${U.esc(u.usd_value)}</td>
                                <td>${U.esc(u.type)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <div class="intel-block reveal-on-scroll">
                <h3>Partnerships</h3>
                ${p.partnerships.map(pp => `
                    <div style="padding:10px 0; border-bottom:1px solid var(--intel-border);">
                        <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                            <strong style="color:var(--intel-text);">${U.esc(pp.partner)}</strong>
                            <span style="color:var(--intel-text-faint); font-size:12px;">${U.fmtDate(pp.date)}</span>
                        </div>
                        <div style="color:var(--intel-text-dim); font-size:13px; margin-top:2px;">${U.esc(pp.summary)}</div>
                    </div>
                `).join('')}
            </div>

            <div class="intel-cols-2">
                <div class="intel-block reveal-on-scroll">
                    <h3>Advantages</h3>
                    <ul style="margin:0; padding-left:20px; color:var(--intel-text-dim); font-size:14px; line-height:1.7;">
                        ${p.advantages.map(a => `<li style="color:var(--intel-green);">${U.esc(a)}</li>`).join('')}
                    </ul>
                </div>
                <div class="intel-block reveal-on-scroll">
                    <h3>Disadvantages</h3>
                    <ul style="margin:0; padding-left:20px; color:var(--intel-text-dim); font-size:14px; line-height:1.7;">
                        ${p.disadvantages.map(d => `<li style="color:var(--intel-red);">${U.esc(d)}</li>`).join('')}
                    </ul>
                </div>
            </div>

            <div class="intel-block reveal-on-scroll">
                <h3>Competitors</h3>
                ${p.competitors.map(c => `
                    <div style="padding:10px 0; border-bottom:1px solid var(--intel-border);">
                        <strong style="color:var(--intel-text);">${U.esc(c.name)}:</strong>
                        <span style="color:var(--intel-text-dim); font-size:14px;"> ${U.esc(c.comparison)}</span>
                    </div>
                `).join('')}
            </div>

            <button class="intel-detail-back" id="intel-back-btn-2" style="margin-top:32px;">← Back to Intelligence</button>
        `;

        container.querySelectorAll('#intel-back-btn, #intel-back-btn-2').forEach(btn => {
            btn.addEventListener('click', () => window.PAYD_INTEL_ROUTER.go('dashboard'));
        });

        // ── PAYD ALPHA ENGINE — инициализация блока 3 scores ──────────────
        // _renderAlphaScores теперь async — загружает данные из БД и затем рендерит.
        // Не блокирует основной рендер страницы.
        this._renderAlphaScores(container, ticker, p).catch(err => {
            console.error('[renderProjectDetail] _renderAlphaScores failed:', err);
        });
        U.observeReveal(container);
    },

    /**
     * Нормализует формат scores из IntelligenceDatabase в формат,
     * который ждёт intelligence-alpha-render.js (значение в `.value`).
     * В БД поле называется `value`, в некоторых записях — `score`.
     * @param {Object} scoresFromDb — { payd, conviction, alpha, discovery }
     * @returns {Object} — нормализованный объект
     */
    _normalizeScoresForAlpha(scoresFromDb) {
        const out = { payd: null, conviction: null, alpha: null, discovery: null };
        if (!scoresFromDb) return out;
        for (const key of Object.keys(out)) {
            const rec = scoresFromDb[key];
            if (!rec) continue;
            const value = rec.value != null ? rec.value : (rec.score != null ? rec.score : null);
            out[key] = {
                engine: key,
                value,
                breakdown: rec.breakdown || {},
                classification: rec.classification || null,
                explanation: rec.explanation || '',
                confidence: rec.confidence || 'unknown',
                confidenceScore: rec.confidenceScore || 0,
                sources: rec.sources || [],
                labels: rec.labels || null,
                events: rec.events || null,
                opportunityScore: rec.opportunityScore || null,
                timestamp: rec.timestamp || null,
            };
        }
        return out;
    },

    /**
     * Рендерит блок PAYD Alpha Engine (3 score cards + AI summary + history + timeline + labels)
     * внутри контейнера проекта. Вызывается из renderProjectDetail.
     * Async: загружает данные из IntelligenceDatabase (может быть Supabase или localStorage).
     * @param {HTMLElement} container
     * @param {string} ticker
     * @param {Object} project — базовый проект (без _scores)
     */
    async _renderAlphaScores(container, ticker, project) {
        const placeholder = container.querySelector('#payd-alpha-scores-' + ticker);
        if (!placeholder) return;

        // Если intelligence-alpha-render.js не загрузился — graceful fallback
        const alphaRender = (window.PAYD_ALPHA_RENDER && window.PAYD_ALPHA_RENDER.renderScoresBlock)
            ? window.PAYD_ALPHA_RENDER
            : (window.PAYD_INTEL_RENDER && window.PAYD_INTEL_RENDER.renderScoresBlock
                ? window.PAYD_INTEL_RENDER
                : null);

        if (!alphaRender) {
            placeholder.innerHTML = `
                <div class="payd-alpha-empty" style="padding:24px;">
                    ⚠️ intelligence-alpha-render.js не загружен. Проверьте порядок подключения скриптов.
                </div>
            `;
            return;
        }

        // Загружаем данные из БД асинхронно
        const arch = window.PAYD_INTEL && window.PAYD_INTEL.architecture;
        let scoresFromDb = {};
        try {
            if (arch && arch.database && typeof arch.database.getLatestScores === 'function') {
                const result = arch.database.getLatestScores(ticker);
                // Поддержка и sync, и async API
                if (result && typeof result.then === 'function') {
                    scoresFromDb = await result;
                } else {
                    scoresFromDb = result || {};
                }
            }
        } catch (e) {
            console.warn('[_renderAlphaScores] getLatestScores failed:', e);
        }

        // Нормализуем и обогащаем проект
        const normalizedScores = this._normalizeScoresForAlpha(scoresFromDb);
        const alphaProject = Object.assign({}, project, {
            id: ticker,
            coinId: ticker,
            name: project.name,
            _scores: normalizedScores,
            paidScore: normalizedScores.payd && normalizedScores.payd.value != null
                ? { value: normalizedScores.payd.value }
                : null,
        });

        try {
            alphaRender.renderScoresBlock(placeholder, alphaProject);
        } catch (e) {
            console.error('[PAYD Alpha] renderScoresBlock failed for', ticker, e);
            placeholder.innerHTML = `
                <div class="payd-alpha-empty" style="padding:24px;">
                    Failed to render PAYD Alpha: ${U.esc(e && e.message ? e.message : String(e))}
                </div>
            `;
        }
    },

    /* === Project card (reused across sections) === */
    projectCard(p) {
        return `
            <div class="intel-project-card reveal-on-scroll" data-ticker="${U.esc(p.ticker)}" role="button" tabindex="0">
                ${this.projectCardBody(p)}
                <p class="intel-card-summary">${U.esc(p.summary || p.thesis || '')}</p>
            </div>
        `;
    },

    projectCardBody(p) {
        const scoreClass = U.scoreClass(p.ai_score);
        return `
            <div class="intel-card-top">
                <div class="intel-project-logo">${U.esc(p.logo)}</div>
                <div class="intel-project-id">
                    <div class="intel-project-name">${U.esc(p.name)}</div>
                    <div class="intel-project-ticker">${U.esc(p.ticker)} · ${U.esc(p.sector)}</div>
                </div>
                <span class="intel-rating-pill ${U.ratingClass(p.investment_rating)}">${U.esc(p.investment_rating)}</span>
            </div>

            <div class="intel-score-block">
                <div class="intel-score-row">
                    <span class="intel-score-label">AI Score</span>
                    <span class="intel-score-value">${p.ai_score}<span class="of">/100</span></span>
                </div>
                <div class="intel-score-bar"><div class="intel-score-bar-fill ${scoreClass}" style="width:${p.ai_score}%"></div></div>
            </div>

            <div class="intel-score-block">
                <div class="intel-score-row">
                    <span class="intel-score-label">Risk Score</span>
                    <span class="intel-score-value" style="font-size:18px;">${p.risk_score} <span class="intel-risk ${U.riskClass(p.risk_label)}" style="margin-left:6px;">${U.esc(p.risk_label)}</span></span>
                </div>
                <div class="intel-score-bar"><div class="intel-score-bar-fill ${p.risk_score < 40 ? 'is-high' : (p.risk_score < 60 ? 'is-mid' : 'is-low')}" style="width:${p.risk_score}%"></div></div>
            </div>

            <div class="intel-metrics">
                <div class="intel-metric-cell">
                    <div class="intel-metric-label">Mkt Cap</div>
                    <div class="intel-metric-value">${U.fmtUSD(p.metrics ? p.metrics.market_cap_usd : (p.metric ? null : null))}</div>
                </div>
                <div class="intel-metric-cell">
                    <div class="intel-metric-label">TVL</div>
                    <div class="intel-metric-value">${U.fmtUSD(p.metrics ? p.metrics.tvl_usd : null)}</div>
                </div>
                <div class="intel-metric-cell">
                    <div class="intel-metric-label">Revenue/mo</div>
                    <div class="intel-metric-value">${U.fmtUSD(p.metrics ? p.metrics.monthly_revenue_usd : null)}</div>
                </div>
            </div>
        `;
    },

    /* === Attach click handlers for project cards === */
    attachCardHandlers(container) {
        const cards = container.querySelectorAll('.intel-project-card[data-ticker]');
        cards.forEach(card => {
            const ticker = card.dataset.ticker;
            const handler = () => window.PAYD_INTEL_ROUTER.go('project', { ticker });
            card.addEventListener('click', handler);
            card.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handler();
                }
            });
        });
    },

    /* === Loading state === */
    renderLoading(container) {
        container.innerHTML = `<div class="intel-loading">Loading intelligence data…</div>`;
    },

    /* === Error state === */
    renderError(container, err) {
        container.innerHTML = `
            <div class="intel-empty">
                <p style="color:var(--intel-red); font-size:16px; margin-bottom:8px;">Failed to load intelligence data</p>
                <p style="font-size:13px;">${U.esc(err && err.message ? err.message : String(err))}</p>
            </div>
        `;
    },

    /* === Research Library === */
    renderResearch(container) {
        const d = D.projects;
        if (!d) return this.renderLoading(container);

        const allProjects = Object.values(d.projects);
        const sorted = allProjects.sort((a, b) => b.ai_score - a.ai_score);

        container.innerHTML = `
            <div class="intel-subhead reveal-on-scroll">
                <div>
                    <h3>Research Library · ${allProjects.length} deep-dive reports</h3>
                    <div class="intel-subhead-meta">Pre-computed institutional research. Updated by AI agent each cycle.</div>
                </div>
            </div>

            <div class="intel-table-wrap reveal-on-scroll">
                <table class="intel-table intel-table-research">
                    <thead>
                        <tr>
                            <th class="col-logo">Logo</th>
                            <th class="col-name">Project</th>
                            <th class="col-ticker">Ticker</th>
                            <th>Sector</th>
                            <th class="cell-num">AI Score</th>
                            <th class="cell-num">Risk</th>
                            <th>Investment Rating</th>
                            <th class="col-action">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sorted.map(p => `
                            <tr class="intel-depin-row" data-ticker="${U.esc(p.ticker)}" tabindex="0">
                                <td class="col-logo"><div class="intel-row-logo">${U.esc(p.logo || '◇')}</div></td>
                                <td class="col-name">
                                    <div class="intel-row-name">${U.esc(p.name)}</div>
                                    <div class="intel-row-subsector">${U.esc(p.subsector || '')}</div>
                                </td>
                                <td class="col-ticker"><span class="intel-row-ticker">${U.esc(p.ticker)}</span></td>
                                <td>${U.esc(p.sector)}</td>
                                <td class="cell-num"><strong style="color:var(--intel-gold);">${p.ai_score}</strong></td>
                                <td class="cell-num"><span class="intel-risk ${U.riskClass(p.risk_label)}">${p.risk_score}</span></td>
                                <td><span class="intel-rating-pill ${U.ratingClass(p.investment_rating)}">${U.esc(p.investment_rating)}</span></td>
                                <td class="col-action">
                                    <button class="intel-btn intel-btn-primary intel-btn-open-research" data-ticker="${U.esc(p.ticker)}" type="button">Open Research</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        container.querySelectorAll('.intel-depin-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('.intel-btn')) return;
                window.PAYD_INTEL_ROUTER.go('project', { ticker: row.dataset.ticker });
            });
        });
        container.querySelectorAll('.intel-btn-open-research').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.PAYD_INTEL_ROUTER.go('project', { ticker: btn.dataset.ticker });
            });
        });

        U.observeReveal(container);
    },

    /* === AI Category View (Layer 1, Layer 2, DeFi, RWA, Gaming, DeSci) === */
    renderAICategoryView(container, cat) {
        const d = D.projects;
        if (!d) return this.renderLoading(container);

        const allProjects = Object.values(d.projects);
        const catMap = {
            l1:     { label: 'Layer 1',       sectors: ['Layer 1', 'L1'] },
            l2:     { label: 'Layer 2',       sectors: ['Layer 2', 'L2'] },
            defi:   { label: 'DeFi',          sectors: ['DeFi'] },
            rwa:    { label: 'RWA',           sectors: ['RWA', 'Real World Assets'] },
            gaming: { label: 'Gaming',        sectors: ['Gaming'] },
            desci:  { label: 'DeSci',         sectors: ['DeSci'] },
        };
        const meta = catMap[cat] || catMap.l1;
        const filtered = allProjects.filter(p => {
            const sec = (p.sector || '').toLowerCase();
            return meta.sectors.some(s => sec === s.toLowerCase() || sec.includes(s.toLowerCase()));
        });

        const sorted = filtered.sort((a, b) => b.ai_score - a.ai_score);

        container.innerHTML = `
            <div class="intel-subhead reveal-on-scroll">
                <div>
                    <h3>${U.esc(meta.label)} · ${sorted.length} projects</h3>
                    <div class="intel-subhead-meta">AI-curated institutional research for the ${U.esc(meta.label)} sector.</div>
                </div>
            </div>

            ${sorted.length === 0 ? `
                <div class="intel-empty reveal-on-scroll">
                    <p>No ${U.esc(meta.label)} projects in the current dataset. The AI Agent will populate this section during the next weekly run.</p>
                </div>
            ` : `
                <div class="intel-table-wrap reveal-on-scroll">
                    <table class="intel-table intel-table-depin">
                        <thead>
                            <tr>
                                <th class="col-logo">Logo</th>
                                <th class="col-name">Project</th>
                                <th class="col-ticker">Ticker</th>
                                <th class="cell-num">AI Score</th>
                                <th class="cell-num">Risk</th>
                                <th class="cell-num">Mkt Cap</th>
                                <th class="cell-num">TVL</th>
                                <th>Investment Rating</th>
                                <th class="col-action">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sorted.map(p => `
                                <tr class="intel-depin-row" data-ticker="${U.esc(p.ticker)}" tabindex="0">
                                    <td class="col-logo"><div class="intel-row-logo">${U.esc(p.logo || '◇')}</div></td>
                                    <td class="col-name">
                                        <div class="intel-row-name">${U.esc(p.name)}</div>
                                        <div class="intel-row-subsector">${U.esc(p.subsector || '')}</div>
                                    </td>
                                    <td class="col-ticker"><span class="intel-row-ticker">${U.esc(p.ticker)}</span></td>
                                    <td class="cell-num"><strong style="color:var(--intel-gold);">${p.ai_score}</strong></td>
                                    <td class="cell-num"><span class="intel-risk ${U.riskClass(p.risk_label)}">${p.risk_score}</span></td>
                                    <td class="cell-num cell-mono">${U.fmtUSD((p.metrics && p.metrics.market_cap_usd) || 0, true)}</td>
                                    <td class="cell-num cell-mono">${U.fmtUSD((p.metrics && p.metrics.tvl_usd) || 0, true)}</td>
                                    <td><span class="intel-rating-pill ${U.ratingClass(p.investment_rating)}">${U.esc(p.investment_rating)}</span></td>
                                    <td class="col-action">
                                        <button class="intel-btn intel-btn-primary intel-btn-open-research" data-ticker="${U.esc(p.ticker)}" type="button">Open Research</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `}
        `;

        container.querySelectorAll('.intel-depin-row').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('.intel-btn')) return;
                window.PAYD_INTEL_ROUTER.go('project', { ticker: row.dataset.ticker });
            });
        });
        container.querySelectorAll('.intel-btn-open-research').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.PAYD_INTEL_ROUTER.go('project', { ticker: btn.dataset.ticker });
            });
        });

        U.observeReveal(container);
    },
};

window.PAYD_INTEL_RENDER = INTEL_RENDER;
