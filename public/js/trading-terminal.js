/**
 * Trading Terminal — профессиональные инструменты для Trader.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  Добавляет:
 *    1. Floating toolbar для рисования (горизонтальная линия, тренд,
 *       прямоугольник — зоны спроса/предложения)
 *    2. Click-to-place для Entry / Stop Loss / Take Profit
 *    3. Drag-and-drop для выставленных линий
 *    4. Сравнение с Module X после submit
 *    5. Hotkeys: L (long), S (short), W (wait), N (no_trade), E (entry),
 *       1 (SL), 2 (TP), Enter (submit), Esc (cancel), Delete (clear),
 *       H (toggle toolbar), B (sidebar toggle)
 *
 *  Использование:
 *    const terminal = new TradingTerminal.LabTerminal({
 *        chart, candleSeries, chartContainer, controlsContainer,
 *        onPositionChange, onDirectionChange, onSubmit, onError
 *    });
 *    terminal.mount();
 *    terminal.destroy();
 * ════════════════════════════════════════════════════════════════════════════
 */

(function (global) {
    'use strict';

    if (!global) throw new Error('[TradingTerminal] global is required');

    // ================================================================
    // УТИЛИТЫ
    // ================================================================

    function escapeHtml(s) {
        if (s === null || s === undefined) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatPrice(n) {
        if (n === null || n === undefined || Number.isNaN(n)) return '—';
        if (n >= 1000) return n.toFixed(2);
        if (n >= 1) return n.toFixed(4);
        return n.toFixed(6);
    }

    function clamp(n, min, max) {
        return Math.max(min, Math.min(max, n));
    }

    // ================================================================
    // КЛАСС TERMINAL
    // ================================================================

    class LabTerminal {
        constructor(cfg) {
            this.cfg = cfg || {};
            this.chart = cfg.chart;
            this.candleSeries = cfg.candleSeries;
            this.chartContainer = cfg.chartContainer; // DOM-элемент контейнера графика
            this.controlsContainer = cfg.controlsContainer; // DOM боковой панели

            this.direction = null; // 'long' | 'short' | 'wait' | 'no_trade'
            this.tool = 'cursor'; // active tool: 'cursor' | 'hline' | 'trend' | 'rect' | 'entry' | 'sl' | 'tp'
            this.drawings = []; // { id, type, points, color, lineWidth }
            this.position = { entry: null, sl: null, tp: null };

            this.isDragging = false;
            this.dragStart = null;
            this.dragCurrent = null;
            this.activeShape = null;

            this.priceLines = {}; // candleSeries.createPriceLine returns line refs
            this.recommendedLines = {};

            this.onPositionChange = cfg.onPositionChange || function () {};
            this.onDirectionChange = cfg.onDirectionChange || function () {};
            this.onSubmit = cfg.onSubmit || function () {};
            this.onError = cfg.onError || function () {};
            this.getRecommended = cfg.getRecommended || function () { return null; };

            this._elements = {};
            this._handlers = {};
            this._mounted = false;
        }

        // ============================================================
        // МОНТАЖ
        // ============================================================

        mount() {
            if (this._mounted) return;
            if (!this.chart || !this.candleSeries || !this.chartContainer) {
                console.error('[LabTerminal] Missing required dependencies');
                return;
            }
            this._renderToolbar();
            this._renderCompactPanel();
            this._createOverlay();
            this._attachChartEvents();
            this._attachKeyboard();
            this._mounted = true;
        }

        destroy() {
            if (!this._mounted) return;
            this._removeAllPriceLines();
            this._removeAllDrawings();
            if (this._overlay && this._overlay.parentNode) {
                this._overlay.parentNode.removeChild(this._overlay);
            }
            if (this._elements.toolbar && this._elements.toolbar.parentNode) {
                this._elements.toolbar.parentNode.removeChild(this._elements.toolbar);
            }
            if (this._elements.compactPanel && this._elements.compactPanel.parentNode) {
                this._elements.compactPanel.parentNode.removeChild(this._elements.compactPanel);
            }
            this._detachChartEvents();
            this._detachKeyboard();
            this._mounted = false;
        }

        // ============================================================
        // ПУБЛИЧНОЕ API
        // ============================================================

        setDirection(dir) {
            this.direction = dir;
            // Очистить рекомендуемые линии при смене направления
            this._clearRecommendedLines();
            this._renderCompactPanel();
            this.onDirectionChange(dir);
        }

        getDirection() { return this.direction; }

        setPosition(pos) {
            // pos: { entry, sl, tp }
            this._clearPositionLines();
            if (pos.entry !== undefined) this.position.entry = pos.entry;
            if (pos.sl !== undefined) this.position.sl = pos.sl;
            if (pos.tp !== undefined) this.position.tp = pos.tp;
            this._renderPositionLines();
            this._renderCompactPanel();
            this.onPositionChange(this.position);
        }

        getPosition() { return { ...this.position }; }

        clearPosition() {
            this._clearPositionLines();
            this.position = { entry: null, sl: null, tp: null };
            this._renderCompactPanel();
            this.onPositionChange(this.position);
        }

        clearDrawings() {
            this._removeAllDrawings();
        }

        /** Установить рекомендуемые уровни из Module X */
        showRecommended(rec) {
            this._clearRecommendedLines();
            if (!rec || !this.candleSeries) return;
            const LWC = global.LightweightCharts;
            if (!LWC) return;
            // rec: { entry: number, sl: number, tp: number, direction }
            const tag = ' · рекомендация';
            if (rec.entry !== null && rec.entry !== undefined) {
                this.recommendedLines.entry = this.candleSeries.createPriceLine({
                    price: rec.entry,
                    color: 'rgba(212, 175, 55, 0.6)',
                    lineWidth: 1,
                    lineStyle: LWC.LineStyle.Dotted,
                    axisLabelVisible: true,
                    title: 'Entry' + tag
                });
            }
            if (rec.sl !== null && rec.sl !== undefined) {
                this.recommendedLines.sl = this.candleSeries.createPriceLine({
                    price: rec.sl,
                    color: 'rgba(239, 83, 80, 0.6)',
                    lineWidth: 1,
                    lineStyle: LWC.LineStyle.Dotted,
                    axisLabelVisible: true,
                    title: 'SL' + tag
                });
            }
            if (rec.tp !== null && rec.tp !== undefined) {
                this.recommendedLines.tp = this.candleSeries.createPriceLine({
                    price: rec.tp,
                    color: 'rgba(38, 166, 154, 0.6)',
                    lineWidth: 1,
                    lineStyle: LWC.LineStyle.Dotted,
                    axisLabelVisible: true,
                    title: 'TP' + tag
                });
            }
        }

        clearRecommended() {
            this._clearRecommendedLines();
        }

        // ============================================================
        // РЕНДЕР TOOLBAR
        // ============================================================

        _renderToolbar() {
            const parent = this.chartContainer.parentElement;
            if (!parent) return;
            const toolbar = document.createElement('div');
            toolbar.className = 'lt-terminal-toolbar';
            toolbar.innerHTML = `
                <div class="lt-tb-group" data-tooltip="Курсор (H)">
                    <button class="lt-tb-btn active" data-tool="cursor" title="Курсор (H)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7 17 3-7 7-3z"/></svg>
                    </button>
                </div>
                <div class="lt-tb-divider"></div>
                <div class="lt-tb-group" data-tooltip="Горизонтальный уровень">
                    <button class="lt-tb-btn" data-tool="hline" title="Горизонтальный уровень">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18"/><circle cx="6" cy="12" r="1" fill="currentColor"/><circle cx="18" cy="12" r="1" fill="currentColor"/></svg>
                    </button>
                </div>
                <div class="lt-tb-group" data-tooltip="Трендовая линия">
                    <button class="lt-tb-btn" data-tool="trend" title="Трендовая линия">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 20l8-12 4 6 6-10"/></svg>
                    </button>
                </div>
                <div class="lt-tb-group" data-tooltip="Зона (спрос/предложение)">
                    <button class="lt-tb-btn" data-tool="rect" title="Зона (спрос/предложение)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="7" width="16" height="10" rx="1"/></svg>
                    </button>
                </div>
                <div class="lt-tb-divider"></div>
                <div class="lt-tb-group" data-tooltip="Поставить Entry (E)">
                    <button class="lt-tb-btn lt-tb-entry" data-tool="entry" title="Поставить Entry (E)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
                    </button>
                </div>
                <div class="lt-tb-group" data-tooltip="Поставить Stop Loss (1)">
                    <button class="lt-tb-btn lt-tb-sl" data-tool="sl" title="Поставить Stop Loss (1)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="18" r="2.5"/><path d="M12 5v10"/></svg>
                    </button>
                </div>
                <div class="lt-tb-group" data-tooltip="Поставить Take Profit (2)">
                    <button class="lt-tb-btn lt-tb-tp" data-tool="tp" title="Поставить Take Profit (2)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="6" r="2.5"/><path d="M12 11v8"/></svg>
                    </button>
                </div>
                <div class="lt-tb-divider"></div>
                <div class="lt-tb-group" data-tooltip="Очистить рисунки">
                    <button class="lt-tb-btn lt-tb-clear" data-action="clearDrawings" title="Очистить рисунки">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
                    </button>
                </div>
                <div class="lt-tb-group" data-tooltip="Очистить позицию">
                    <button class="lt-tb-btn lt-tb-clear" data-action="clearPosition" title="Очистить позицию">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>
                    </button>
                </div>
            `;
            // Адаптивное позиционирование
            toolbar.style.cssText = `
                position:absolute;top:14px;left:14px;
                display:flex;flex-direction:column;gap:4px;
                padding:6px;background:rgba(15,15,22,0.85);
                backdrop-filter:blur(10px);
                border:1px solid rgba(255,255,255,0.08);
                border-radius:10px;
                z-index:30;
                box-shadow:0 4px 16px rgba(0,0,0,0.4);
                transition:transform 0.25s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease;
            `;
            parent.style.position = 'relative';
            parent.appendChild(toolbar);

            // Обработчики кнопок
            toolbar.querySelectorAll('.lt-tb-btn').forEach(btn => {
                btn.addEventListener('click', e => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (btn.dataset.action === 'clearDrawings') {
                        this._removeAllDrawings();
                        return;
                    }
                    if (btn.dataset.action === 'clearPosition') {
                        this.clearPosition();
                        return;
                    }
                    const tool = btn.dataset.tool;
                    if (tool) this._setTool(tool);
                });
            });

            this._elements.toolbar = toolbar;
        }

        _setTool(tool) {
            this.tool = tool;
            this._updateToolbarUI();
            this._updateOverlayCursor();
            this._syncWrapperPointerEvents();
        }

        _updateToolbarUI() {
            if (!this._elements.toolbar) return;
            this._elements.toolbar.querySelectorAll('.lt-tb-btn[data-tool]').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tool === this.tool);
            });
        }

        _toggleToolbar() {
            if (!this._elements.toolbar) return;
            const t = this._elements.toolbar;
            if (t.classList.contains('collapsed')) {
                t.classList.remove('collapsed');
                t.style.transform = 'translateX(0)';
            } else {
                t.classList.add('collapsed');
                t.style.transform = 'translateX(-110%)';
            }
        }

        // ============================================================
        // БОКОВАЯ КОМПАКТНАЯ ПАНЕЛЬ (Entry/SL/TP инпуты)
        // ============================================================

        _renderCompactPanel() {
            if (!this.controlsContainer) return;
            // Не пересоздавать, если уже существует
            if (this._elements.compactPanel) {
                this._updateCompactPanel();
                return;
            }
            const panel = document.createElement('div');
            panel.className = 'lt-terminal-panel';
            panel.style.cssText = `
                background:linear-gradient(180deg,#1a1a20 0%,#121216 100%);
                border:1px solid rgba(255,255,255,0.08);
                border-radius:14px;
                padding:14px;
                margin-bottom:10px;
            `;
            panel.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                    <h3 style="
                        font-size:11px;
                        text-transform:uppercase;
                        letter-spacing:0.08em;
                        color:#d4af37;
                        font-weight:600;
                        margin:0;
                    ">📐 Торговая позиция</h3>
                    <span id="lt-position-status" style="
                        font-size:10px;
                        text-transform:uppercase;
                        letter-spacing:0.06em;
                        padding:3px 8px;
                        border-radius:999px;
                        background:rgba(255,255,255,0.05);
                        color:#8b8b96;
                        font-weight:600;
                    ">Не выбрано</span>
                </div>

                <div style="display:grid;gap:8px;">
                    <div class="lt-pos-row">
                        <label style="font-size:11px;color:#8b8b96;font-weight:600;">Entry</label>
                        <input id="lt-pos-entry" type="number" step="0.0001" placeholder="—"
                            style="background:#0a0a0c;border:1px solid rgba(255,255,255,0.08);color:#d4af37;padding:8px 10px;border-radius:8px;font-family:'JetBrains Mono',monospace;font-size:13px;width:100%;font-weight:600;"/>
                    </div>
                    <div class="lt-pos-row">
                        <label style="font-size:11px;color:#ef5350;font-weight:600;">Stop Loss</label>
                        <input id="lt-pos-sl" type="number" step="0.0001" placeholder="—"
                            style="background:#0a0a0c;border:1px solid rgba(255,255,255,0.08);color:#ef5350;padding:8px 10px;border-radius:8px;font-family:'JetBrains Mono',monospace;font-size:13px;width:100%;font-weight:600;"/>
                    </div>
                    <div class="lt-pos-row">
                        <label style="font-size:11px;color:#26a69a;font-weight:600;">Take Profit</label>
                        <input id="lt-pos-tp" type="number" step="0.0001" placeholder="—"
                            style="background:#0a0a0c;border:1px solid rgba(255,255,255,0.08);color:#26a69a;padding:8px 10px;border-radius:8px;font-family:'JetBrains Mono',monospace;font-size:13px;width:100%;font-weight:600;"/>
                    </div>
                </div>

                <div id="lt-pos-summary" style="
                    display:none;
                    margin-top:10px;
                    padding:10px;
                    background:#0a0a0c;
                    border:1px solid rgba(255,255,255,0.06);
                    border-radius:8px;
                ">
                    <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px;">
                        <span style="color:#8b8b96;">Risk:</span>
                        <span id="lt-pos-risk" style="color:#ef5350;font-family:'JetBrains Mono',monospace;font-weight:600;">—</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px;">
                        <span style="color:#8b8b96;">Reward:</span>
                        <span id="lt-pos-reward" style="color:#26a69a;font-family:'JetBrains Mono',monospace;font-weight:600;">—</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:11px;">
                        <span style="color:#8b8b96;">R/R:</span>
                        <span id="lt-pos-rr" style="color:#d4af37;font-family:'JetBrains Mono',monospace;font-weight:600;">—</span>
                    </div>
                </div>
            `;
            this.controlsContainer.insertBefore(panel, this.controlsContainer.firstChild);
            this._elements.compactPanel = panel;

            // Обработчики инпутов
            const entryInput = panel.querySelector('#lt-pos-entry');
            const slInput = panel.querySelector('#lt-pos-sl');
            const tpInput = panel.querySelector('#lt-pos-tp');

            const sync = () => {
                const entry = parseFloat(entryInput.value);
                const sl = parseFloat(slInput.value);
                const tp = parseFloat(tpInput.value);
                const pos = {};
                if (!Number.isNaN(entry)) pos.entry = entry;
                if (!Number.isNaN(sl)) pos.sl = sl;
                if (!Number.isNaN(tp)) pos.tp = tp;
                this.setPosition(pos);
            };

            entryInput.addEventListener('change', sync);
            slInput.addEventListener('change', sync);
            tpInput.addEventListener('change', sync);

            this._updateCompactPanel();
        }

        _updateCompactPanel() {
            if (!this._elements.compactPanel) return;
            const entryInput = this._elements.compactPanel.querySelector('#lt-pos-entry');
            const slInput = this._elements.compactPanel.querySelector('#lt-pos-sl');
            const tpInput = this._elements.compactPanel.querySelector('#lt-pos-tp');

            if (entryInput && document.activeElement !== entryInput) {
                entryInput.value = this.position.entry !== null ? this.position.entry : '';
            }
            if (slInput && document.activeElement !== slInput) {
                slInput.value = this.position.sl !== null ? this.position.sl : '';
            }
            if (tpInput && document.activeElement !== tpInput) {
                tpInput.value = this.position.tp !== null ? this.position.tp : '';
            }

            const summary = this._elements.compactPanel.querySelector('#lt-pos-summary');
            const status = this._elements.compactPanel.querySelector('#lt-position-status');
            const { entry, sl, tp } = this.position;
            const hasAll = entry !== null && sl !== null && tp !== null;

            if (hasAll) {
                summary.style.display = 'block';
                let risk = 0, reward = 0, rr = 0;
                if (this.direction === 'long') {
                    risk = entry - sl;
                    reward = tp - entry;
                } else if (this.direction === 'short') {
                    risk = sl - entry;
                    reward = entry - tp;
                }
                rr = risk > 0 ? reward / risk : 0;
                this._elements.compactPanel.querySelector('#lt-pos-risk').textContent = formatPrice(Math.abs(risk));
                this._elements.compactPanel.querySelector('#lt-pos-reward').textContent = formatPrice(Math.abs(reward));
                this._elements.compactPanel.querySelector('#lt-pos-rr').textContent = '1 : ' + rr.toFixed(2);
                status.textContent = 'Готова';
                status.style.background = 'rgba(38,166,154,0.15)';
                status.style.color = '#26a69a';
                status.style.border = '1px solid rgba(38,166,154,0.3)';
            } else {
                summary.style.display = 'none';
                const filled = [entry, sl, tp].filter(x => x !== null).length;
                if (filled === 0) {
                    status.textContent = 'Не выбрано';
                    status.style.background = 'rgba(255,255,255,0.05)';
                    status.style.color = '#8b8b96';
                    status.style.border = 'none';
                } else {
                    status.textContent = filled + ' / 3 установлено';
                    status.style.background = 'rgba(255,193,7,0.12)';
                    status.style.color = '#ffc107';
                    status.style.border = '1px solid rgba(255,193,7,0.3)';
                }
            }
        }

        // ============================================================
        // OVERLAY (Canvas для рисования)
        // ============================================================

        _createOverlay() {
            const chartArea = this.chartContainer;
            if (!chartArea) return;
            // Если уже есть overlay, не создавать повторно
            if (this._overlay) return;

            const overlay = document.createElement('canvas');
            overlay.className = 'lt-terminal-overlay';
            overlay.style.cssText = `
                position:absolute;
                top:0;left:0;
                width:100%;height:100%;
                pointer-events:none;
                z-index:5;
            `;

            // Wrapper: по умолчанию НЕ перехватывает события (pointer-events: none),
            // чтобы график работал в режиме курсора как нативный TradingView.
            // pointer-events включается ТОЛЬКО при активном инструменте рисования.
            const wrapper = document.createElement('div');
            wrapper.style.cssText = `
                position:absolute;inset:0;
                pointer-events:none;
                z-index:4;
            `;
            wrapper.className = 'lt-terminal-pointer';

            chartArea.style.position = 'relative';
            chartArea.appendChild(wrapper);
            chartArea.appendChild(overlay);

            this._overlay = overlay;
            this._overlayWrapper = wrapper;
            this._ctx = overlay.getContext('2d');
            // Синхронизируем текущее состояние с активным инструментом
            this._syncWrapperPointerEvents();

            const resize = () => this._resizeOverlay();
            this._handlers.resize = resize;
            window.addEventListener('resize', resize);

            // ResizeObserver тоже
            if (global.ResizeObserver) {
                const ro = new global.ResizeObserver(resize);
                ro.observe(chartArea);
                this._handlers.ro = ro;
            }

            setTimeout(resize, 50);
        }

        /**
         * Включает/выключает перехват событий мыши на wrapper в зависимости
         * от активного инструмента. В режиме 'cursor' события проходят сквозь
         * wrapper к графику, обеспечивая нативный Pan/Zoom как в TradingView.
         * В режиме рисования (hline/trend/rect/entry/sl/tp) wrapper активен
         * и ловит события для размещения фигур.
         */
        _syncWrapperPointerEvents() {
            if (!this._overlayWrapper) return;
            const drawingTools = ['hline', 'trend', 'rect', 'entry', 'sl', 'tp'];
            const isDrawing = drawingTools.indexOf(this.tool) !== -1;
            // Прозрачный для мыши: невидим для событий в режиме курсора
            this._overlayWrapper.style.pointerEvents = isDrawing ? 'auto' : 'none';
        }

        _resizeOverlay() {
            if (!this._overlay || !this.chartContainer) return;
            const w = this.chartContainer.clientWidth;
            const h = this.chartContainer.clientHeight;
            const dpr = global.devicePixelRatio || 1;
            this._overlay.width = w * dpr;
            this._overlay.height = h * dpr;
            this._overlay.style.width = w + 'px';
            this._overlay.style.height = h + 'px';
            this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            this._redrawOverlay();
        }

        _redrawOverlay() {
            if (!this._ctx || !this.chartContainer) return;
            const w = this.chartContainer.clientWidth;
            const h = this.chartContainer.clientHeight;
            this._ctx.clearRect(0, 0, w, h);

            // Отрисовка черновика (то, что рисуется прямо сейчас)
            if (this.isDragging && this.activeShape && this.dragStart && this.dragCurrent) {
                this._drawShape(this.activeShape, this.dragStart, this.dragCurrent, true);
            }

            // Отрисовка сохранённых фигур
            this.drawings.forEach(shape => {
                if (shape.points.length >= 2) {
                    this._drawShape(shape, shape.points[0], shape.points[shape.points.length - 1], false);
                }
            });

            // Подсветка цены на crosshair
            if (this._lastMousePrice !== undefined) {
                this._ctx.strokeStyle = 'rgba(212,175,55,0.5)';
                this._ctx.lineWidth = 1;
                this._ctx.setLineDash([4, 4]);
                const y = this._priceToY(this._lastMousePrice);
                if (y !== null) {
                    this._ctx.beginPath();
                    this._ctx.moveTo(0, y);
                    this._ctx.lineTo(w, y);
                    this._ctx.stroke();
                }
                this._ctx.setLineDash([]);
                // Метка цены
                this._ctx.fillStyle = 'rgba(212,175,55,0.9)';
                this._ctx.fillRect(w - 86, y - 10, 84, 20);
                this._ctx.fillStyle = '#0a0a0c';
                this._ctx.font = '600 11px JetBrains Mono, monospace';
                this._ctx.textBaseline = 'middle';
                this._ctx.fillText(formatPrice(this._lastMousePrice), w - 80, y);
            }
        }

        _drawShape(shape, p1, p2, isDraft) {
            if (!this._ctx) return;
            const ctx = this._ctx;
            ctx.save();

            const baseColor = shape.color || (shape.type === 'rect' ? 'rgba(123,97,255,0.4)' : 'rgba(212,175,55,0.9)');
            ctx.strokeStyle = baseColor;
            ctx.fillStyle = baseColor;
            ctx.lineWidth = shape.lineWidth || 1.5;

            if (shape.type === 'hline') {
                const y1 = this._priceToY(p1.price);
                if (y1 !== null) {
                    ctx.beginPath();
                    ctx.moveTo(0, y1);
                    ctx.lineTo(this.chartContainer.clientWidth, y1);
                    ctx.stroke();
                    // Метка цены слева
                    ctx.fillStyle = baseColor;
                    ctx.fillRect(0, y1 - 9, 60, 18);
                    ctx.fillStyle = '#0a0a0c';
                    ctx.font = '600 10px JetBrains Mono, monospace';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(formatPrice(p1.price), 6, y1);
                }
            } else if (shape.type === 'trend') {
                const x1 = this._timeToX(p1.time);
                const y1 = this._priceToY(p1.price);
                const x2 = this._timeToX(p2.time);
                const y2 = this._priceToY(p2.price);
                if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                    // Точки
                    ctx.fillStyle = baseColor;
                    ctx.beginPath();
                    ctx.arc(x1, y1, 4, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(x2, y2, 4, 0, Math.PI * 2);
                    ctx.fill();
                }
            } else if (shape.type === 'rect') {
                const x1 = this._timeToX(p1.time);
                const y1 = this._priceToY(p1.price);
                const x2 = this._timeToX(p2.time);
                const y2 = this._priceToY(p2.price);
                if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
                    const rx = Math.min(x1, x2);
                    const ry = Math.min(y1, y2);
                    const rw = Math.abs(x2 - x1);
                    const rh = Math.abs(y2 - y1);
                    ctx.fillStyle = shape.color || 'rgba(123,97,255,0.18)';
                    ctx.fillRect(rx, ry, rw, rh);
                    ctx.strokeStyle = shape.color || 'rgba(123,97,255,0.6)';
                    ctx.lineWidth = 1.5;
                    ctx.strokeRect(rx, ry, rw, rh);
                }
            }
            ctx.restore();
        }

        _priceToY(price) {
            try {
                return this.candleSeries.priceToCoordinate(price);
            } catch (e) {
                return null;
            }
        }

        _timeToX(time) {
            try {
                return this.chart.timeScale().timeToCoordinate(time);
            } catch (e) {
                return null;
            }
        }

        _xyToTimePrice(x, y) {
            try {
                const time = this.chart.timeScale().coordinateToTime(x);
                const price = this.candleSeries.coordinateToPrice(y);
                return { time, price };
            } catch (e) {
                return { time: null, price: null };
            }
        }

        _updateOverlayCursor() {
            if (!this._overlay) return;
            const cursorMap = {
                cursor: 'default',
                hline: 'crosshair',
                trend: 'crosshair',
                rect: 'crosshair',
                entry: 'cell',
                sl: 'ns-resize',
                tp: 'ns-resize'
            };
            this._overlay.style.cursor = cursorMap[this.tool] || 'default';
        }

        // ============================================================
        // ОБРАБОТЧИКИ СОБЫТИЙ ЧАРТА
        // ============================================================

        _attachChartEvents() {
            if (!this._overlayWrapper) return;
            this._handlers.mousemove = e => this._handleMouseMove(e);
            this._handlers.mousedown = e => this._handleMouseDown(e);
            this._handlers.mouseup = e => this._handleMouseUp(e);
            this._handlers.contextmenu = e => e.preventDefault();
            this._overlayWrapper.addEventListener('mousemove', this._handlers.mousemove);
            this._overlayWrapper.addEventListener('mousedown', this._handlers.mousedown);
            this._overlayWrapper.addEventListener('mouseup', this._handlers.mouseup);
            this._overlayWrapper.addEventListener('contextmenu', this._handlers.contextmenu);
        }

        _detachChartEvents() {
            if (!this._overlayWrapper) return;
            this._overlayWrapper.removeEventListener('mousemove', this._handlers.mousemove);
            this._overlayWrapper.removeEventListener('mousedown', this._handlers.mousedown);
            this._overlayWrapper.removeEventListener('mouseup', this._handlers.mouseup);
            this._overlayWrapper.removeEventListener('contextmenu', this._handlers.contextmenu);
        }

        _handleMouseMove(e) {
            const rect = this.chartContainer.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const tp = this._xyToTimePrice(x, y);
            if (tp.price !== null && tp.price !== undefined) {
                this._lastMousePrice = tp.price;
            } else {
                this._lastMousePrice = undefined;
            }

            if (this.isDragging) {
                this.dragCurrent = tp;
                this._redrawOverlay();
            }
        }

        _handleMouseDown(e) {
            if (e.button !== 0) return;
            const rect = this.chartContainer.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const tp = this._xyToTimePrice(x, y);
            if (!tp.price) return;

            // Если инструмент = курсор — НЕ перехватываем клики, чарт сам обработает
            if (this.tool === 'cursor') return;

            e.preventDefault();
            e.stopPropagation();

            // Размещение Entry/SL/TP
            if (this.tool === 'entry' || this.tool === 'sl' || this.tool === 'tp') {
                if (!this.direction || this.direction === 'wait' || this.direction === 'no_trade') {
                    this._showToast('Сначала выбери направление (Long/Short)');
                    this._setTool('cursor');
                    return;
                }
                if (this.tool === 'entry') this.position.entry = tp.price;
                if (this.tool === 'sl') this.position.sl = tp.price;
                if (this.tool === 'tp') this.position.tp = tp.price;
                this.setPosition({});
                this._redrawOverlay();
                // Возвращаемся в режим курсора после размещения
                this._setTool('cursor');
                this._flashCanvas(tp.price);
                return;
            }

            // Начинаем рисовать новую фигуру
            this.isDragging = true;
            this.dragStart = tp;
            this.dragCurrent = tp;
            this.activeShape = {
                id: 'shape_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                type: this.tool,
                points: [tp],
                color: this.tool === 'rect' ? 'rgba(123,97,255,0.55)' : 'rgba(212,175,55,0.85)',
                lineWidth: 1.5
            };
        }

        _handleMouseUp(e) {
            if (!this.isDragging) return;
            if (!this.activeShape) return;
            const rect = this.chartContainer.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const tp = this._xyToTimePrice(x, y);
            if (!tp.price) {
                this._cancelDrawing();
                return;
            }

            // Проверка на слишком маленькую фигуру
            let valid = false;
            if (this.activeShape.type === 'hline') {
                // Для hline есть только одна точка (price), время может быть любым
                this.activeShape.points = [this.dragStart];
                valid = true;
            } else {
                if (tp.time && this.dragStart.time &&
                    Math.abs(x - this._timeToX(this.dragStart.time)) > 3 &&
                    Math.abs(tp.price - this.dragStart.price) > 0.000001) {
                    this.activeShape.points = [this.dragStart, tp];
                    valid = true;
                }
            }

            if (valid) {
                this.drawings.push(this.activeShape);
            }
            this._cancelDrawing();
        }

        _cancelDrawing() {
            this.isDragging = false;
            this.dragStart = null;
            this.dragCurrent = null;
            this.activeShape = null;
            this._setTool('cursor');
            this._redrawOverlay();
        }

        _removeAllDrawings() {
            this.drawings = [];
            this._redrawOverlay();
        }

        _flashCanvas(price) {
            const y = this._priceToY(price);
            if (y === null || !this._ctx) return;
            this._ctx.save();
            this._ctx.fillStyle = 'rgba(212,175,55,0.25)';
            this._ctx.fillRect(0, y - 20, this.chartContainer.clientWidth, 40);
            this._ctx.restore();
        }

        // ============================================================
        // PRICE LINES (Entry/SL/TP на чарте)
        // ============================================================

        _renderPositionLines() {
            this._clearPositionLines();
            const LWC = global.LightweightCharts;
            if (!LWC || !this.candleSeries) return;
            const { entry, sl, tp } = this.position;
            if (entry !== null && entry !== undefined) {
                this.priceLines.entry = this.candleSeries.createPriceLine({
                    price: entry,
                    color: '#d4af37',
                    lineWidth: 2,
                    lineStyle: LWC.LineStyle.Solid,
                    axisLabelVisible: true,
                    title: '▲ ENTRY'
                });
            }
            if (sl !== null && sl !== undefined) {
                this.priceLines.sl = this.candleSeries.createPriceLine({
                    price: sl,
                    color: '#ef5350',
                    lineWidth: 2,
                    lineStyle: LWC.LineStyle.Solid,
                    axisLabelVisible: true,
                    title: '▼ SL'
                });
            }
            if (tp !== null && tp !== undefined) {
                this.priceLines.tp = this.candleSeries.createPriceLine({
                    price: tp,
                    color: '#26a69a',
                    lineWidth: 2,
                    lineStyle: LWC.LineStyle.Solid,
                    axisLabelVisible: true,
                    title: '▲ TP'
                });
            }
            this._updateCompactPanel();
        }

        _clearPositionLines() {
            const LWC = global.LightweightCharts;
            if (!LWC) return;
            Object.keys(this.priceLines).forEach(k => {
                try { this.candleSeries.removePriceLine(this.priceLines[k]); }
                catch (e) { /* noop */ }
            });
            this.priceLines = {};
        }

        _removeAllPriceLines() {
            this._clearPositionLines();
            this._clearRecommendedLines();
        }

        _clearRecommendedLines() {
            const LWC = global.LightweightCharts;
            if (!LWC) return;
            Object.keys(this.recommendedLines).forEach(k => {
                try { this.candleSeries.removePriceLine(this.recommendedLines[k]); }
                catch (e) { /* noop */ }
            });
            this.recommendedLines = {};
        }

        // ============================================================
        // КЛАВИАТУРА
        // ============================================================

        _attachKeyboard() {
            this._handlers.keydown = e => {
                // Не перехватываем, если пользователь в input
                if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
                if (e.ctrlKey || e.metaKey || e.altKey) return;

                switch (e.key.toLowerCase()) {
                    case 'h': this._toggleToolbar(); break;
                    case 'e': if (!this._isDirectionBlocked()) this._setTool('entry'); break;
                    case '1': if (!this._isDirectionBlocked()) this._setTool('sl'); break;
                    case '2': if (!this._isDirectionBlocked()) this._setTool('tp'); break;
                    case 'escape':
                        if (this.tool !== 'cursor') {
                            this._setTool('cursor');
                        } else {
                            this._cancelDrawing();
                        }
                        break;
                    case 'delete':
                    case 'backspace':
                        // Очистка фигур не по нажатию, чтобы случайно не сбросить
                        break;
                    default: break;
                }
            };
            document.addEventListener('keydown', this._handlers.keydown);
        }

        _detachKeyboard() {
            if (this._handlers.keydown) {
                document.removeEventListener('keydown', this._handlers.keydown);
            }
        }

        _isDirectionBlocked() {
            return !this.direction || this.direction === 'wait' || this.direction === 'no_trade';
        }

        // ============================================================
        // TOAST — краткие подсказки
        // ============================================================

        _showToast(msg) {
            let toast = document.getElementById('lt-terminal-toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'lt-terminal-toast';
                toast.style.cssText = `
                    position:fixed;
                    top:80px;
                    left:50%;
                    transform:translateX(-50%) translateY(-10px);
                    padding:10px 18px;
                    background:rgba(15,15,22,0.95);
                    border:1px solid rgba(255,193,7,0.4);
                    color:#ffc107;
                    border-radius:8px;
                    font-size:13px;
                    font-weight:500;
                    z-index:9999;
                    backdrop-filter:blur(10px);
                    box-shadow:0 4px 16px rgba(0,0,0,0.5);
                    opacity:0;
                    transition:opacity 0.25s ease, transform 0.25s cubic-bezier(0.4,0,0.2,1);
                    pointer-events:none;
                `;
                document.body.appendChild(toast);
            }
            toast.textContent = msg;
            requestAnimationFrame(() => {
                toast.style.opacity = '1';
                toast.style.transform = 'translateX(-50%) translateY(0)';
            });
            clearTimeout(this._toastTimeout);
            this._toastTimeout = setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(-50%) translateY(-10px)';
            }, 2200);
        }

        // ============================================================
        // СРАВНЕНИЕ С MODULE X
        // ============================================================

        /**
         * Получить рекомендацию из Module X для текущего направления.
         * Возвращает { entry, sl, tp, scenario, atr, lastPrice } или null.
         */
        pickRecommendation(analysisResult, direction) {
            if (!analysisResult || !analysisResult.scenarios) return null;
            const wanted = direction;
            if (wanted !== 'long' && wanted !== 'short') return null;

            // Сортируем сценарии по приоритету
            const candidates = (analysisResult.scenarios || [])
                .filter(s => s.direction === wanted && s.applicable)
                .sort((a, b) => (b.priority || 0) - (a.priority || 0));

            if (candidates.length === 0) return null;

            const best = candidates[0];
            const entryLow = (best.entryZone && best.entryZone.low) || best.entry || null;
            const entryHigh = (best.entryZone && best.entryZone.high) || best.entry || null;
            const entry = entryLow !== null && entryHigh !== null ?
                (entryLow + entryHigh) / 2 :
                (best.entry || null);

            return {
                entry,
                sl: best.stopLoss || null,
                tp: best.takeProfit || null,
                scenario: best,
                atr: analysisResult.volatility && analysisResult.volatility.atr ? analysisResult.volatility.atr : null,
                lastPrice: analysisResult.inputMeta && analysisResult.inputMeta.lastPrice
            };
        }
    }

    // ================================================================
    // ЭКСПОРТ
    // ================================================================

    global.TradingTerminal = global.TradingTerminal || {};
    global.TradingTerminal.LabTerminal = LabTerminal;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this)));
