/**
 * LabTrainer — Trainer как профессиональный торговый терминал внутри PAYD Trading Lab.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  Рендерит UI внутрь указанного контейнера, не открывая новых страниц.
 *  Инкапсулирует:
 *    - TradingView-style график (Lightweight Charts) ~70% рабочей области
 *    - TradingTerminal (рисование, размещение Entry/SL/TP)
 *    - PAYDTrainer (оркестратор Module X → 1 → 2 → 3 → 4)
 *    - Боковая панель с прогрессом, торговой позицией и контролами
 *    - Адаптивный toolbar для рисования
 *    - Детальный экран результата со сравнением с Module X
 *    - Горячие клавиши и плавные анимации
 *
 *  Использование:
 *    window.LabTrainer.mount('trainer-mount');
 *    window.LabTrainer.start(scenarioIndex);
 *    window.LabTrainer.next();
 *    window.LabTrainer.back();
 *    window.LabTrainer.reset();
 *
 *  Зависимости (должны быть загружены ДО этого файла):
 *    - lightweight-charts (LightweightCharts global)
 *    - window.TrainerScenarios
 *    - window.PAYDTrainer
 *    - window.TradingTerminal.LabTerminal
 *    - window.coreAnalysisEngine, MarketAnalysisEngine,
 *      DecisionEvaluationEngine, LearningFeedbackEngine,
 *      PerformanceAnalyticsEngine
 * ════════════════════════════════════════════════════════════════════════════
 */

(function (global) {
    'use strict';

    if (!global) {
        throw new Error('[LabTrainer] global is required');
    }

    // ================================================================
    // LAZY LOAD: lightweight-charts
    // ================================================================

    function ensureLightweightCharts() {
        return new Promise((resolve, reject) => {
            if (global.LightweightCharts) {
                resolve(global.LightweightCharts);
                return;
            }
            const existing = document.querySelector(
                'script[data-lab-trainer-lwc="1"]'
            );
            if (existing) {
                existing.addEventListener('load', () => resolve(global.LightweightCharts));
                existing.addEventListener('error', reject);
                return;
            }
            const script = document.createElement('script');
            script.src =
                'https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js';
            script.dataset.labTrainerLwc = '1';
            script.onload = () => {
                if (global.LightweightCharts) resolve(global.LightweightCharts);
                else reject(new Error('LightweightCharts global not found after load'));
            };
            script.onerror = () =>
                reject(new Error('Failed to load Lightweight Charts'));
            document.head.appendChild(script);
        });
    }

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

    function formatNumber(n) {
        if (n === null || n === undefined || Number.isNaN(n)) return '—';
        if (typeof n !== 'number') return String(n);
        if (Number.isInteger(n)) return String(n);
        return (Math.round(n * 100) / 100).toString();
    }

    function formatPrice(n) {
        if (n === null || n === undefined || Number.isNaN(n)) return '—';
        if (typeof n !== 'number') return String(n);
        if (n >= 1000) return n.toFixed(2);
        if (n >= 1) return n.toFixed(4);
        return n.toFixed(6);
    }

    // ================================================================
    // КОМПОНЕНТ
    // ================================================================

    class LabTrainerClass {
        constructor() {
            this.container = null;
            this.trainer = null;
            this.chart = null;
            this.candleSeries = null;
            this.volumeSeries = null;
            this.terminal = null;
            this.mounted = false;
            this._mountPromise = null; // идемпотентность mount()
            this.selectedDecision = null;
            this.isAnalyzing = false;
            this.lastResult = null;
            this.sidebarCollapsed = false;
            this._elements = {};
            this._handlers = {};
        }

        // ============================================================
        // ПУБЛИЧНЫЕ МЕТОДЫ
        // ============================================================

        async mount(containerId) {
            // ИДЕМПОТЕНТНОСТЬ: если mount() уже запущен, возвращаем существующий promise.
            // Это решает race condition, когда start() вызывается ДО завершения mount().
            if (this._mountPromise) {
                console.log('[LabTrainer] mount() уже выполняется, возвращаем существующий promise');
                return this._mountPromise;
            }
            console.log('[LabTrainer] mount() ВХОД, containerId=' + containerId);

            this._mountPromise = (async () => {
                const container =
                    typeof containerId === 'string'
                        ? document.getElementById(containerId)
                        : containerId;
                if (!container) {
                    console.error('[LabTrainer] Container not found:', containerId);
                    this._mountPromise = null;
                    return;
                }
                this.container = container;

                try {
                    console.log('[LabTrainer] mount() до ensureLightweightCharts()');
                    await ensureLightweightCharts();
                    console.log('[LabTrainer] mount() после ensureLightweightCharts()');
                } catch (err) {
                    console.error('[LabTrainer] Lightweight Charts load failed:', err);
                    container.innerHTML = `
                        <div style="padding:24px;color:#ef5350;background:#1a1a20;border:1px solid rgba(239,83,80,0.3);border-radius:12px;">
                            <h3 style="margin-bottom:8px;">Ошибка загрузки графика</h3>
                            <p style="color:#c8c8d0;font-size:13px;">${escapeHtml(err.message)}</p>
                        </div>`;
                    this._mountPromise = null;
                    return;
                }

                if (!global.PAYDTrainer) {
                    console.error('[LabTrainer] PAYDTrainer не загружен (global.PAYDTrainer === undefined)');
                    container.innerHTML = `
                        <div style="padding:24px;color:#ef5350;background:#1a1a20;border:1px solid rgba(239,83,80,0.3);border-radius:12px;">
                            <h3 style="margin-bottom:8px;">Trainer не загружен</h3>
                        </div>`;
                    this._mountPromise = null;
                    return;
                }
                if (!global.TrainerScenarios || !global.TrainerScenarios.SCENARIOS) {
                    console.error('[LabTrainer] TrainerScenarios не загружен (global.TrainerScenarios === undefined)');
                    container.innerHTML = `
                        <div style="padding:24px;color:#ef5350;background:#1a1a20;border:1px solid rgba(239,83,80,0.3);border-radius:12px;">
                            <h3 style="margin-bottom:8px;">TrainerScenarios не загружен</h3>
                        </div>`;
                    this._mountPromise = null;
                    return;
                }
                console.log('[LabTrainer] PAYDTrainer и TrainerScenarios OK');

                console.log('[LabTrainer] mount() ДО _renderShell()');
                this._renderShell();
                console.log('[LabTrainer] mount() ПОСЛЕ _renderShell(), ДО _initChart()');
                this._initChart();
                console.log('[LabTrainer] mount() ПОСЛЕ _initChart(), ДО _initTerminal()');
                this._initTerminal();
                console.log('[LabTrainer] mount() ПОСЛЕ _initTerminal(), ДО _bindUIEvents()');
                this._bindUIEvents();
                console.log('[LabTrainer] mount() ДО _bindKeyboard()');
                this._bindKeyboard();

                // Инициализация Module X UI Panel (Уровень 1)
                this._initModuleXUI();

                if (!this.trainer) {
                    console.log('[LabTrainer] mount() СОЗДАНИЕ new PAYDTrainer');
                    this.trainer = new global.PAYDTrainer({ ui: this._buildUIHooks() });
                    console.log('[LabTrainer] mount() PAYDTrainer создан:', this.trainer);
                } else {
                    console.log('[LabTrainer] mount() trainer уже существует, обновляем ui');
                    this.trainer.ui = this._buildUIHooks();
                }

                this.mounted = true;
                console.log('[LabTrainer] mount() ЗАВЕРШЕН, mounted=' + this.mounted);
            })();

            try {
                await this._mountPromise;
            } finally {
                // НЕ сбрасываем _mountPromise здесь — пусть живёт, пока компонент смонтирован.
                // Сбрасывается только при destroy().
            }
            return this._mountPromise;
        }

        async start(scenarioIndex) {
            console.log('[LabTrainer] start() ВХОД, scenarioIndex=' + scenarioIndex + ', mounted=' + this.mounted);
            // Если mount() ещё не завершён — дожидаемся его.
            if (this._mountPromise) {
                console.log('[LabTrainer] start() ожидает _mountPromise()');
                try {
                    await this._mountPromise;
                } catch (e) {
                    console.error('[LabTrainer] start() ошибка ожидания mount:', e);
                    throw e;
                }
            }
            if (!this.mounted) {
                console.warn('[LabTrainer] start() mount не завершён корректно, выход');
                return;
            }
            const totalScenarios =
                (global.TrainerScenarios && global.TrainerScenarios.SCENARIOS.length) || 0;
            const target = scenarioIndex || 0;
            if (this.trainer.scenarioIndex !== target) {
                this.trainer.scenarioIndex = target;
            }
            this._updateInfoPanel(target, totalScenarios);
            console.log('[LabTrainer] start() ДО await this.trainer.start()');
            try {
                await this.trainer.start();
                console.log('[LabTrainer] start() ПОСЛЕ await this.trainer.start()');
            } catch (err) {
                console.error('[LabTrainer] start() CATCH ошибка trainer.start():', err.message, err.stack);
                throw err;
            }
        }

        async next() {
            if (!this.mounted) return;
            const totalScenarios =
                (global.TrainerScenarios && global.TrainerScenarios.SCENARIOS.length) || 0;
            await this.trainer.next();
            this._updateInfoPanel(this.trainer.scenarioIndex, totalScenarios);
        }

        back() {
            console.log('[LabTrainer] back() — полный сброс state для повторного mount()');
            this._hideResultScreen();
            this._resetDecisionPanel();
            this.terminal && this.terminal.clearPosition();
            this.terminal && this.terminal.clearDrawings();
            this.terminal && this.terminal.clearRecommended();
            this.selectedDecision = null;
            this.isAnalyzing = false;
            // ВАЖНО: при возврате «Назад к модулям» контейнер #lab-trainer-mount
            // очищается вызывающим кодом. Нужно сбросить флаги, чтобы
            // следующий mount() выполнил полную инициализацию.
            this.mounted = false;
            this._mountPromise = null;
            this.trainer = null;
        }

        reset() {
            if (this.trainer && typeof this.trainer.reset === 'function') {
                this.trainer.reset();
            }
            this._hideResultScreen();
            this._resetDecisionPanel();
            this._updateProgress();
            this.terminal && this.terminal.clearPosition();
            this.terminal && this.terminal.clearDrawings();
            this.selectedDecision = null;
            this.isAnalyzing = false;
        }

        destroy() {
            if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
            if (this._escHandler) document.removeEventListener('keydown', this._escHandler);
            if (this._hotkeyHandler) document.removeEventListener('keydown', this._hotkeyHandler);
            if (this.terminal && typeof this.terminal.destroy === 'function') {
                this.terminal.destroy();
            }
            try {
                if (this.chart && this.chart.remove) this.chart.remove();
            } catch (e) { /* noop */ }
            this.chart = null;
            this.candleSeries = null;
            this.volumeSeries = null;
            this.terminal = null;
            if (this.container) this.container.innerHTML = '';
            this.mounted = false;
            this._mountPromise = null;
        }

        // ============================================================
        // ОБОЛОЧКА
        // ============================================================

        _renderShell() {
            const container = this.container;
            container.innerHTML = `
<div class="lab-trainer-root" style="
    display:flex;
    flex-direction:column;
    height:100%;
    min-height:calc(100vh - 100px);
    background:#0a0a0c;
    color:#fff;
    font-family:'Inter',system-ui,sans-serif;
    overflow:hidden;
    border-radius:14px;
    border:1px solid rgba(255,255,255,0.05);
">
    <!-- TOP BAR -->
    <div id="lt-top-bar" style="
        padding:12px 20px;
        border-bottom:1px solid rgba(255,255,255,0.08);
        background:linear-gradient(180deg,#15151b 0%,#0f0f14 100%);
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:16px;
        flex-shrink:0;
        min-height:60px;
    ">
        <div style="display:flex;align-items:center;gap:14px;min-width:0;flex:1;">
            <button id="lt-btn-back" style="
                background:transparent;
                border:1px solid rgba(255,255,255,0.1);
                color:#c8c8d0;
                width:34px;height:34px;
                border-radius:8px;
                cursor:pointer;
                font-size:14px;
                display:grid;place-items:center;
                transition:all 0.15s ease;
            " title="Назад к модулям">←</button>
            <div style="min-width:0;flex:1;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span id="lt-symbol" style="
                        font-family:'JetBrains Mono',monospace;
                        font-size:12px;
                        padding:4px 10px;
                        border-radius:6px;
                        background:#1a1a20;
                        border:1px solid rgba(255,255,255,0.08);
                        color:#c8c8d0;
                        font-weight:600;
                    ">—</span>
                    <span style="
                        font-family:'JetBrains Mono',monospace;
                        font-size:11px;
                        padding:3px 8px;
                        border-radius:4px;
                        background:rgba(38,166,154,0.1);
                        color:#26a69a;
                        border:1px solid rgba(38,166,154,0.2);
                    ">● LIVE</span>
                    <span id="lt-future-badge" style="
                        font-family:'JetBrains Mono',monospace;
                        font-size:11px;
                        padding:3px 8px;
                        border-radius:4px;
                        background:rgba(255,193,7,0.08);
                        color:#ffc107;
                        border:1px solid rgba(255,193,7,0.2);
                    ">Future hidden</span>
                </div>
                <div id="lt-scenario-title" style="font-size:15px;font-weight:600;color:#fff;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">Загрузка…</div>
                <div id="lt-scenario-desc" style="font-size:12px;color:#8b8b96;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">—</div>
            </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-shrink:0;">
            <span id="lt-difficulty" style="
                font-size:11px;
                font-weight:600;
                padding:5px 10px;
                border-radius:999px;
                text-transform:uppercase;
                letter-spacing:0.06em;
                background:rgba(255,255,255,0.05);
                color:#8b8b96;
                border:1px solid rgba(255,255,255,0.08);
            ">—</span>
            <button id="lt-btn-sidebar" style="
                background:transparent;
                border:1px solid rgba(255,255,255,0.1);
                color:#c8c8d0;
                width:34px;height:34px;
                border-radius:8px;
                cursor:pointer;
                font-size:14px;
                display:grid;place-items:center;
                transition:all 0.15s ease;
            " title="Свернуть панель (B)">▶</button>
        </div>
    </div>

    <!-- MAIN AREA: CHART (70%) + SIDEBAR (30%) -->
    <div class="lab-trainer-grid" style="
        flex:1;
        display:grid;
        grid-template-columns:minmax(0,1fr) 360px;
        min-height:0;
        overflow:hidden;
        transition:grid-template-columns 0.3s cubic-bezier(0.4,0,0.2,1);
    ">
        <!-- CHART -->
        <div id="lt-chart-wrap" style="
            position:relative;
            display:flex;
            flex-direction:column;
            background:#0a0a0c;
            min-height:0;
            min-width:0;
        ">
            <div id="lt-chart-canvas" style="
                flex:1;
                width:100%;
                min-height:0;
                background:#121216;
                border-right:1px solid rgba(255,255,255,0.08);
            "></div>
            <div id="lt-chart-loading" style="
                position:absolute;
                inset:0;
                display:grid;
                place-items:center;
                background:rgba(10,10,12,0.85);
                backdrop-filter:blur(8px);
                z-index:50;
                transition:opacity 0.3s ease;
            ">
                <div style="display:flex;flex-direction:column;gap:14px;align-items:center;color:#c8c8d0;font-size:13px;">
                    <div style="
                        width:42px;height:42px;
                        border:3px solid #232329;
                        border-top-color:#d4af37;
                        border-radius:50%;
                        animation:lt-spin 1s linear infinite;
                    "></div>
                    <div id="lt-loading-text">Загрузка сценария…</div>
                </div>
            </div>

            <!-- Bottom HUD: информация о позиции на графике -->
            <div id="lt-chart-hud" style="
                position:absolute;
                bottom:14px;
                left:14px;
                right:14px;
                display:flex;
                flex-wrap:wrap;
                gap:8px;
                pointer-events:none;
                z-index:6;
            "></div>
        </div>

        <!-- SIDEBAR -->
        <div id="lt-sidebar" style="
            background:#121216;
            border-left:1px solid rgba(255,255,255,0.08);
            padding:16px;
            display:flex;
            flex-direction:column;
            gap:14px;
            overflow-y:auto;
            min-height:0;
            transition:all 0.3s cubic-bezier(0.4,0,0.2,1);
        ">
            <!-- Placeholder containers; filled by JavaScript -->
            <div id="lt-terminal-slot"></div>
            <div id="lt-direction-slot"></div>
            <div id="lt-progress-slot"></div>
            <div id="lt-control-slot"></div>
            <div id="lt-hint-slot"></div>
            <!-- НОВОЕ: Module X панель (Уровень 1) -->
            <div id="lt-modulex-slot" style="margin-top:8px;"></div>
        </div>
    </div>
</div>

<!-- RESULT MODAL -->
<div id="lt-result-screen" style="
    position:fixed;
    inset:0;
    background:rgba(5,5,8,0.85);
    backdrop-filter:blur(12px);
    z-index:1000;
    display:none;
    align-items:center;
    justify-content:center;
    padding:24px;
    animation:lt-fadeIn 0.3s ease;
">
    <div style="
        background:#121216;
        border:1px solid rgba(255,255,255,0.08);
        border-radius:18px;
        width:100%;
        max-width:980px;
        max-height:90vh;
        overflow-y:auto;
        box-shadow:0 20px 60px rgba(0,0,0,0.5);
        animation:lt-slideUp 0.4s cubic-bezier(0.16,1,0.3,1);
    ">
        <div id="lt-result-header" style="
            padding:22px 26px;
            border-bottom:1px solid rgba(255,255,255,0.08);
            display:flex;
            justify-content:space-between;
            align-items:flex-start;
            position:sticky;
            top:0;
            background:#121216;
            z-index:2;
        ">
            <div style="display:flex;gap:14px;align-items:center;">
                <div id="lt-result-verdict-icon" style="
                    width:54px;height:54px;
                    border-radius:14px;
                    display:grid;place-items:center;
                    font-size:24px;font-weight:700;
                    color:#0a0a0c;
                    background:#26a69a;
                    flex-shrink:0;
                ">✓</div>
                <div>
                    <div id="lt-result-title" style="font-size:18px;font-weight:700;margin-bottom:4px;">Результат</div>
                    <div id="lt-result-subtitle" style="font-size:12px;color:#8b8b96;">—</div>
                </div>
            </div>
            <button id="lt-btn-result-close" style="
                background:#1a1a20;
                border:1px solid rgba(255,255,255,0.08);
                color:#c8c8d0;
                width:34px;height:34px;
                border-radius:8px;
                cursor:pointer;
                font-size:15px;
                display:grid;place-items:center;
                transition:all 0.15s ease;
            ">✕</button>
        </div>
        <div id="lt-result-body" style="padding:22px 26px;"></div>
        <div style="
            padding:14px 26px 22px;
            border-top:1px solid rgba(255,255,255,0.08);
            display:flex;
            gap:10px;
            justify-content:flex-end;
            background:#121216;
            position:sticky;
            bottom:0;
        ">
            <button id="lt-btn-result-close-footer" style="
                background:#232329;
                color:#c8c8d0;
                border:1px solid rgba(255,255,255,0.08);
                padding:11px 16px;
                border-radius:10px;
                font-size:13px;font-weight:600;
                cursor:pointer;
                font-family:inherit;
                transition:all 0.15s ease;
            ">Закрыть</button>
            <button id="lt-btn-result-next" style="
                background:linear-gradient(135deg,#d4af37 0%,#c5a028 100%);
                color:#0a0a0c;
                border:none;
                padding:11px 18px;
                border-radius:10px;
                font-size:13px;font-weight:700;
                cursor:pointer;
                font-family:inherit;
                transition:all 0.15s ease;
            ">→ Следующий сценарий</button>
        </div>
    </div>
</div>

<style>
@keyframes lt-spin { to { transform: rotate(360deg); } }
@keyframes lt-fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes lt-slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
@keyframes lt-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
@keyframes lt-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }

.lab-trainer-root * {
    box-sizing: border-box;
}

.lt-tb-btn {
    width:36px;height:36px;
    background:transparent;
    border:1px solid transparent;
    border-radius:7px;
    color:#c8c8d0;
    cursor:pointer;
    display:grid;place-items:center;
    transition:all 0.15s ease;
    padding:0;
}
.lt-tb-btn:hover {
    background:rgba(255,255,255,0.06);
    color:#fff;
    transform:translateY(-1px);
}
.lt-tb-btn.active {
    background:rgba(212,175,55,0.15);
    border-color:rgba(212,175,55,0.5);
    color:#d4af37;
    box-shadow:0 0 0 2px rgba(212,175,55,0.18);
}
.lt-tb-btn svg { width:16px;height:16px; }
.lt-tb-btn.lt-tb-entry.active { background:rgba(212,175,55,0.18); color:#d4af37; border-color:#d4af37; }
.lt-tb-btn.lt-tb-sl.active { background:rgba(239,83,80,0.18); color:#ef5350; border-color:#ef5350; }
.lt-tb-btn.lt-tb-tp.active { background:rgba(38,166,154,0.18); color:#26a69a; border-color:#26a69a; }

.lt-direction-btn {
    background:#1a1a20;
    border:1.5px solid rgba(255,255,255,0.08);
    padding:14px 10px;
    border-radius:10px;
    font-size:13px;
    font-weight:600;
    cursor:pointer;
    transition:all 0.15s ease;
    font-family:inherit;
    display:flex;flex-direction:column;align-items:center;gap:4px;
}
.lt-direction-btn:hover {
    transform:translateY(-1px);
    background:rgba(255,255,255,0.04);
}
.lt-direction-btn:disabled { opacity:0.4; cursor:not-allowed; transform:none; }
.lt-direction-btn.long.active {
    background:rgba(38,166,154,0.18);
    border-color:#26a69a;
    color:#26a69a;
    box-shadow:0 0 0 3px rgba(38,166,154,0.25);
    animation:lt-pulse 0.4s ease;
}
.lt-direction-btn.short.active {
    background:rgba(239,83,80,0.18);
    border-color:#ef5350;
    color:#ef5350;
    box-shadow:0 0 0 3px rgba(239,83,80,0.25);
    animation:lt-pulse 0.4s ease;
}
.lt-direction-btn.wait.active {
    background:rgba(255,193,7,0.18);
    border-color:#ffc107;
    color:#ffc107;
    box-shadow:0 0 0 3px rgba(255,193,7,0.25);
    animation:lt-pulse 0.4s ease;
}
.lt-direction-btn.no_trade.active {
    background:rgba(158,158,158,0.18);
    border-color:#9e9e9e;
    color:#9e9e9e;
    box-shadow:0 0 0 3px rgba(158,158,158,0.25);
    animation:lt-pulse 0.4s ease;
}

.lt-hotkey {
    display:inline-block;
    padding:1px 6px;
    background:rgba(255,255,255,0.06);
    border:1px solid rgba(255,255,255,0.1);
    border-radius:4px;
    font-family:'JetBrains Mono',monospace;
    font-size:10px;
    color:#c8c8d0;
    margin-left:6px;
}

.lt-progress-cell {
    background:#1a1a20;
    border:1px solid rgba(255,255,255,0.08);
    padding:10px 12px;
    border-radius:10px;
}

.lt-result-section { margin-bottom: 22px; }
.lt-result-section h3 {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #8b8b96;
    margin-bottom: 10px;
    font-weight: 600;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.lt-result-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 10px;
}
.lt-result-cell {
    background: #1a1a20;
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 10px;
    padding: 12px 14px;
}
.lt-result-cell .lt-label {
    font-size: 10px;
    color: #8b8b96;
    text-transform: uppercase;
    margin-bottom: 6px;
    letter-spacing: 0.06em;
    font-weight: 600;
}
.lt-result-cell .lt-value {
    font-size: 14px;
    font-weight: 700;
    color: #fff;
    font-family: 'JetBrains Mono', monospace;
    word-break:break-all;
}
.lt-result-cell .lt-value.bull { color: #26a69a; }
.lt-result-cell .lt-value.bear { color: #ef5350; }
.lt-result-cell .lt-value.neutral { color: #9e9e9e; }
.lt-result-cell .lt-value.gold { color: #d4af37; }

.lt-precision-bar {
    display:flex;
    align-items:center;
    gap:8px;
    padding:6px 0;
}
.lt-precision-track {
    flex:1;
    height:8px;
    background:#0a0a0c;
    border-radius:999px;
    overflow:hidden;
    position:relative;
}
.lt-precision-fill {
    height:100%;
    border-radius:999px;
    background:linear-gradient(90deg,#ef5350 0%,#ffc107 50%,#26a69a 100%);
    transition:width 0.6s cubic-bezier(0.16,1,0.3,1);
}
.lt-precision-fill.excellent { background:linear-gradient(90deg,#26a69a 0%,#26a69a 100%); }
.lt-precision-fill.good { background:linear-gradient(90deg,#ffc107 0%,#26a69a 100%); }
.lt-precision-fill.fair { background:linear-gradient(90deg,#ef5350 0%,#ffc107 100%); }
.lt-precision-fill.poor { background:#ef5350; }

.lt-error-card {
    background:rgba(239,83,80,0.08);
    border:1px solid rgba(239,83,80,0.3);
    border-radius:8px;
    padding:10px 12px;
    font-size:13px;
    color:#c8c8d0;
    margin-bottom:6px;
    display:flex;
    gap:10px;
    align-items:flex-start;
}
.lt-error-card::before {
    content:"⚠";
    color:#ef5350;
    font-size:14px;
    flex-shrink:0;
}

.lt-signal-list { display:flex; flex-direction:column; gap:6px; }
.lt-signal-item {
    background: #1a1a20;
    border-left: 3px solid #d4af37;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    color: #c8c8d0;
}
.lt-signal-item.supporting { border-left-color: #26a69a; }
.lt-signal-item.against { border-left-color: #ef5350; }
.lt-signal-item.missed { border-left-color: #ffc107; }
.lt-lesson-card {
    background: linear-gradient(180deg, rgba(212, 175, 55, 0.08) 0%, rgba(212, 175, 55, 0.02) 100%);
    border: 1px solid rgba(212, 175, 55, 0.2);
    border-radius: 10px;
    padding: 12px 16px;
    font-size: 13px;
    line-height: 1.6;
    color: #c8c8d0;
    margin-bottom: 8px;
}
.lt-lesson-card ul { margin: 6px 0 0 18px; }

.lt-difficulty.beginner {
    background: rgba(38, 166, 154, 0.15);
    color: #26a69a;
    border: 1px solid rgba(38, 166, 154, 0.3);
}
.lt-difficulty.intermediate {
    background: rgba(255, 193, 7, 0.12);
    color: #ffc107;
    border: 1px solid rgba(255, 193, 7, 0.3);
}
.lt-difficulty.advanced {
    background: rgba(239, 83, 80, 0.12);
    color: #ef5350;
    border: 1px solid rgba(239, 83, 80, 0.3);
}

.lab-trainer-grid.collapsed {
    grid-template-columns: minmax(0,1fr) 0 !important;
}
.lab-trainer-grid.collapsed #lt-sidebar {
    padding:0 !important;
    overflow:hidden !important;
    border-left:none !important;
}

.lt-hud-pill {
    display:inline-flex;
    align-items:center;
    gap:6px;
    padding:5px 10px;
    background:rgba(10,10,12,0.85);
    backdrop-filter:blur(8px);
    border:1px solid rgba(255,255,255,0.08);
    border-radius:6px;
    font-size:11px;
    color:#c8c8d0;
    font-family:'JetBrains Mono',monospace;
    font-weight:600;
    animation:lt-fadeIn 0.3s ease;
}
.lt-hud-pill .lt-hud-label {
    color:#8b8b96;
    font-weight:500;
}

@media (max-width: 980px) {
    .lab-trainer-grid { grid-template-columns: 1fr !important; }
    #lt-sidebar { display:none !important; }
}

::-webkit-scrollbar { width:8px; height:8px; }
::-webkit-scrollbar-track { background:transparent; }
::-webkit-scrollbar-thumb {
    background:rgba(255,255,255,0.1);
    border-radius:4px;
}
::-webkit-scrollbar-thumb:hover { background:rgba(255,255,255,0.2); }

/* ============================================
   Module X Filters Panel
   ============================================ */
.lt-modulex-filters {
    margin: 10px 0;
    background: rgba(20, 20, 28, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    font-size: 12px;
    color: #c8c8d0;
}
.lt-filters-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.02);
    border-radius: 8px 8px 0 0;
}
.lt-filters-title {
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.3px;
}
.lt-filters-toggle {
    background: transparent;
    border: none;
    color: #c8c8d0;
    cursor: pointer;
    font-size: 14px;
    padding: 0 4px;
    line-height: 1;
}
.lt-filters-toggle:hover { color: #d4af37; }
.lt-filters-body {
    padding: 10px;
}
.lt-filters-cats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 10px;
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.lt-filter-row {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    user-select: none;
    font-size: 11px;
    line-height: 1.3;
}
.lt-filter-row input[type="checkbox"] {
    margin: 0;
    cursor: pointer;
    accent-color: #d4af37;
    width: 13px;
    height: 13px;
}
.lt-filter-cat-label {
    font-weight: 500;
    font-size: 11px;
}
.lt-filters-limits {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 10px;
}
.lt-limit-row {
    display: grid;
    grid-template-columns: 90px 1fr 22px;
    align-items: center;
    gap: 6px;
    font-size: 11px;
}
.lt-limit-label {
    color: #8b8b96;
    font-weight: 500;
}
.lt-limit-range {
    width: 100%;
    height: 4px;
    background: rgba(255, 255, 255, 0.08);
    border-radius: 2px;
    -webkit-appearance: none;
    appearance: none;
    outline: none;
    cursor: pointer;
}
.lt-limit-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    background: #d4af37;
    border-radius: 50%;
    cursor: pointer;
    border: 1px solid rgba(0, 0, 0, 0.4);
}
.lt-limit-range::-moz-range-thumb {
    width: 12px;
    height: 12px;
    background: #d4af37;
    border-radius: 50%;
    cursor: pointer;
    border: 1px solid rgba(0, 0, 0, 0.4);
}
.lt-limit-value {
    text-align: right;
    color: #d4af37;
    font-weight: 600;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
}
.lt-filters-actions {
    display: flex;
    justify-content: flex-end;
}
.lt-filters-reset {
    background: rgba(212, 175, 55, 0.1);
    color: #d4af37;
    border: 1px solid rgba(212, 175, 55, 0.3);
    border-radius: 4px;
    padding: 4px 10px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 500;
    transition: all 0.15s;
}
.lt-filters-reset:hover {
    background: rgba(212, 175, 55, 0.2);
    border-color: #d4af37;
}

@media (max-width: 700px) {
    .lt-filters-cats { grid-template-columns: 1fr; }
    .lt-limit-row { grid-template-columns: 80px 1fr 20px; }
}
</style>
`;
            // Сохраняем ссылки на ключевые элементы
            this._elements = {
                root: container.querySelector('.lab-trainer-root'),
                topBar: container.querySelector('#lt-top-bar'),
                symbol: container.querySelector('#lt-symbol'),
                futureBadge: container.querySelector('#lt-future-badge'),
                scenarioTitle: container.querySelector('#lt-scenario-title'),
                scenarioDesc: container.querySelector('#lt-scenario-desc'),
                difficulty: container.querySelector('#lt-difficulty'),
                chartCanvas: container.querySelector('#lt-chart-canvas'),
                chartWrap: container.querySelector('#lt-chart-wrap'),
                chartHud: container.querySelector('#lt-chart-hud'),
                chartLoading: container.querySelector('#lt-chart-loading'),
                loadingText: container.querySelector('#lt-loading-text'),
                sidebar: container.querySelector('#lt-sidebar'),
                grid: container.querySelector('.lab-trainer-grid'),
                btnBack: container.querySelector('#lt-btn-back'),
                btnSidebar: container.querySelector('#lt-btn-sidebar'),
                terminalSlot: container.querySelector('#lt-terminal-slot'),
                directionSlot: container.querySelector('#lt-direction-slot'),
                progressSlot: container.querySelector('#lt-progress-slot'),
                controlSlot: container.querySelector('#lt-control-slot'),
                hintSlot: container.querySelector('#lt-hint-slot'),
                resultScreen: container.querySelector('#lt-result-screen'),
                resultVerdictIcon: container.querySelector('#lt-result-verdict-icon'),
                resultTitle: container.querySelector('#lt-result-title'),
                resultSubtitle: container.querySelector('#lt-result-subtitle'),
                resultBody: container.querySelector('#lt-result-body'),
                btnResultClose: container.querySelector('#lt-btn-result-close'),
                btnResultCloseFooter: container.querySelector('#lt-btn-result-close-footer'),
                btnResultNext: container.querySelector('#lt-btn-result-next')
            };

            // Рендерим содержимое sidebar (после chart инициализации)
            this._renderDirectionPanel();
            this._renderProgressPanel();
            this._renderControlPanel();
            this._renderHintsPanel();
        }

        // ============================================================
        // ГРАФИК
        // ============================================================

        _initChart() {
            const canvasEl = this._elements.chartCanvas;
            if (!canvasEl) return;

            try {
                this.chart = global.LightweightCharts.createChart(canvasEl, {
                    width: canvasEl.clientWidth,
                    height: canvasEl.clientHeight,
                    layout: {
                        background: { type: 'solid', color: '#121216' },
                        textColor: '#c8c8d0',
                        fontFamily: 'Inter, system-ui, sans-serif',
                        fontSize: 12
                    },
                    grid: {
                        vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
                        horzLines: { color: 'rgba(255, 255, 255, 0.04)' }
                    },
                    rightPriceScale: {
                        borderColor: 'rgba(255, 255, 255, 0.08)',
                        scaleMargins: { top: 0.08, bottom: 0.25 }
                    },
                    timeScale: {
                        borderColor: 'rgba(255, 255, 255, 0.08)',
                        timeVisible: true,
                        secondsVisible: false,
                        rightOffset: 12,
                        barSpacing: 10
                    },
                    crosshair: {
                        mode: global.LightweightCharts.CrosshairMode.Normal,
                        vertLine: {
                            color: '#d4af37',
                            width: 1,
                            style: 2,
                            labelBackgroundColor: '#d4af37'
                        },
                        horzLine: {
                            color: '#d4af37',
                            width: 1,
                            style: 2,
                            labelBackgroundColor: '#d4af37'
                        }
                    },
                    handleScroll: {
                        vertTouchDrag: false,
                        mouseWheel: true,
                        pressedMouseMove: true,
                        shiftPressedMouseMove: true,
                        ctrlPressedMouseMove: false
                    },
                    handleScale: {
                        axisPressedMouseMove: true,
                        mouseWheel: true,
                        pinch: true
                    },
                    kineticScroll: { mouse: true, touch: true }
                });

                this.candleSeries = this.chart.addCandlestickSeries({
                    upColor: '#26a69a',
                    downColor: '#ef5350',
                    borderUpColor: '#26a69a',
                    borderDownColor: '#ef5350',
                    wickUpColor: '#26a69a',
                    wickDownColor: '#ef5350',
                    priceLineColor: '#d4af37',
                    priceLineWidth: 1,
                    priceLineStyle: global.LightweightCharts.LineStyle.Dashed
                });

                this.volumeSeries = this.chart.addHistogramSeries({
                    priceFormat: { type: 'volume' },
                    priceScaleId: 'vol',
                    color: '#26a69a66',
                    priceLineVisible: false,
                    lastValueVisible: false
                });
                this.chart.priceScale('vol').applyOptions({
                    scaleMargins: { top: 0.82, bottom: 0 }
                });

                this._resizeHandler = () => {
                    if (!this.chart || !canvasEl) return;
                    this.chart.applyOptions({
                        width: canvasEl.clientWidth,
                        height: canvasEl.clientHeight
                    });
                };
                window.addEventListener('resize', this._resizeHandler);

                // ResizeObserver
                if (global.ResizeObserver) {
                    const ro = new global.ResizeObserver(() => this._resizeHandler());
                    ro.observe(canvasEl);
                }
            } catch (err) {
                console.error('[LabTrainer] Chart init error:', err);
                if (canvasEl) {
                    canvasEl.innerHTML = `
                        <div style="padding:20px;color:#ef5350;font-size:13px;">
                            Ошибка графика: ${escapeHtml(err.message)}
                        </div>`;
                }
            }

            // Инициализация Module X Renderer (Уровень 1)
            try {
                if (global.ModuleXRenderer) {
                    this.moduleXRenderer = new global.ModuleXRenderer(this.chart, this.candleSeries, {
                        showMarketStructure: true,
                        showSmartMoney: true,
                        showLiquidity: true,
                        showPriceAction: true,
                        showOBZones: true,
                        showFVGZones: true,
                        enabled: true
                    });
                    console.log('[LabTrainer] ModuleXRenderer initialized');
                } else {
                    console.warn('[LabTrainer] ModuleXRenderer not available');
                }
            } catch (err) {
                console.error('[LabTrainer] ModuleXRenderer init error:', err);
            }
        }

        _renderChart(scenario) {
            if (!this.chart || !this.candleSeries) return;
            try {
                // Сохраняем текущий видимый диапазон пользователя (если он двигал/зумил),
                // чтобы после setData он остался там же, где был.
                let userVisibleRange = null;
                try {
                    userVisibleRange = this.chart.timeScale().getVisibleLogicalRange();
                } catch (e) { /* первая загрузка — нет диапазона */ }

                const candleData = scenario.candles.map(c => ({
                    time: c.time,
                    open: c.open,
                    high: c.high,
                    low: c.low,
                    close: c.close
                }));
                const volumeData = scenario.candles.map(c => ({
                    time: c.time,
                    value: c.volume || 0,
                    color: c.close >= c.open ? '#26a69a55' : '#ef535055'
                }));
                this.candleSeries.setData(candleData);
                this.volumeSeries.setData(volumeData);

                // Применяем setVisibleRange ТОЛЬКО при первой инициализации графика.
                // При последующих сценариях сохраняем пользовательский viewport,
                // чтобы он мог свободно pan/zoom-ить без сброса.
                if (!this._chartInitialized) {
                    if (candleData.length > 0) {
                        const firstTime = candleData[0].time;
                        const lastTime = candleData[candleData.length - 1].time;
                        this.chart.timeScale().setVisibleRange({
                            from: firstTime,
                            to: lastTime + (lastTime - firstTime) * 0.06
                        });
                    }
                    this._chartInitialized = true;
                } else if (userVisibleRange) {
                    // Пытаемся восстановить пользовательский диапазон.
                    // setVisibleLogicalRange может бросить ошибку, если данные изменились
                    // координатно, поэтому оборачиваем в try/catch.
                    try {
                        this.chart.timeScale().setVisibleLogicalRange(userVisibleRange);
                    } catch (e) { /* noop — оставляем дефолтный range */ }
                }
            } catch (err) {
                console.error('[LabTrainer] renderChart error:', err);
            }
        }

        // ============================================================
        // TRADING TERMINAL
        // ============================================================

        _initTerminal() {
            if (!global.TradingTerminal || !global.TradingTerminal.LabTerminal) {
                console.warn('[LabTrainer] TradingTerminal not loaded; drawing tools unavailable');
                return;
            }
            this.terminal = new global.TradingTerminal.LabTerminal({
                chart: this.chart,
                candleSeries: this.candleSeries,
                chartContainer: this._elements.chartCanvas,
                controlsContainer: this._elements.terminalSlot,
                onDirectionChange: (dir) => {
                    this.selectedDecision = dir;
                    this._highlightDirection(dir);
                    this._updateSubmitButton();
                    if (this.terminal) {
                        const rec = this.terminal.pickRecommendation(this.lastAnalysisResult, dir);
                        if (rec && dir && dir !== 'wait' && dir !== 'no_trade') {
                            this.terminal.showRecommended(rec);
                        } else {
                            this.terminal.clearRecommended();
                        }
                    }
                },
                onPositionChange: (pos) => {
                    this._updateHud();
                    this._updateSubmitButton();
                },
                getRecommended: () => this.lastAnalysisResult
            });
            this.terminal.mount();
        }

        _highlightDirection(dir) {
            if (!this._elements.directionBtns) return;
            this._elements.directionBtns.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.direction === dir);
            });
        }

        _updateHud() {
            const hud = this._elements.chartHud;
            if (!hud) return;
            hud.innerHTML = '';
            if (!this.terminal) return;
            const pos = this.terminal.getPosition();
            const items = [];
            if (pos.entry !== null) {
                items.push(`<span class="lt-hud-pill"><span class="lt-hud-label">ENTRY</span> ${formatPrice(pos.entry)}</span>`);
            }
            if (pos.sl !== null) {
                items.push(`<span class="lt-hud-pill" style="border-color:rgba(239,83,80,0.3);"><span class="lt-hud-label">SL</span> ${formatPrice(pos.sl)}</span>`);
            }
            if (pos.tp !== null) {
                items.push(`<span class="lt-hud-pill" style="border-color:rgba(38,166,154,0.3);"><span class="lt-hud-label">TP</span> ${formatPrice(pos.tp)}</span>`);
            }
            if (items.length > 0) {
                hud.innerHTML = items.join('');
            }
        }

        // ============================================================
        // БОКОВАЯ ПАНЕЛЬ
        // ============================================================

        _renderDirectionPanel() {
            const slot = this._elements.directionSlot;
            if (!slot) return;
            slot.innerHTML = `
                <section style="
                    background:linear-gradient(180deg,#1a1a20 0%,#121216 100%);
                    border:1px solid rgba(255,255,255,0.08);
                    border-radius:14px;
                    padding:14px;
                ">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                        <h3 style="
                            font-size:11px;
                            text-transform:uppercase;
                            letter-spacing:0.08em;
                            color:#d4af37;
                            font-weight:600;
                            margin:0;
                        ">🎯 Направление</h3>
                        <span class="lt-hotkey">L/S/W/N</span>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                        <button class="lt-direction-btn long" data-direction="long" disabled>
                            <span style="font-size:18px;font-weight:700;">▲</span>
                            <span>Long</span>
                            <span class="lt-hotkey" style="margin:4px 0 0 0;">L</span>
                        </button>
                        <button class="lt-direction-btn short" data-direction="short" disabled>
                            <span style="font-size:18px;font-weight:700;">▼</span>
                            <span>Short</span>
                            <span class="lt-hotkey" style="margin:4px 0 0 0;">S</span>
                        </button>
                        <button class="lt-direction-btn wait" data-direction="wait" disabled>
                            <span style="font-size:18px;font-weight:700;">⏸</span>
                            <span>Wait</span>
                            <span class="lt-hotkey" style="margin:4px 0 0 0;">W</span>
                        </button>
                        <button class="lt-direction-btn no_trade" data-direction="no_trade" disabled>
                            <span style="font-size:18px;font-weight:700;">✕</span>
                            <span>No Trade</span>
                            <span class="lt-hotkey" style="margin:4px 0 0 0;">N</span>
                        </button>
                    </div>
                </section>
            `;
            this._elements.directionBtns = Array.from(slot.querySelectorAll('.lt-direction-btn'));
            this._elements.directionBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    if (btn.disabled) return;
                    const dir = btn.dataset.direction;
                    this.selectedDecision = dir;
                    if (this.terminal) {
                        this.terminal.setDirection(dir);
                    } else {
                        this._highlightDirection(dir);
                    }
                    this._updateSubmitButton();
                });
            });
        }

        _renderProgressPanel() {
            const slot = this._elements.progressSlot;
            if (!slot) return;
            slot.innerHTML = `
                <section>
                    <h3 style="
                        font-size:11px;
                        text-transform:uppercase;
                        letter-spacing:0.08em;
                        color:#8b8b96;
                        margin-bottom:10px;
                        font-weight:600;
                    ">📊 Прогресс</h3>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                        <div class="lt-progress-cell">
                            <div style="font-size:10px;color:#8b8b96;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;font-weight:600;">Сценариев</div>
                            <div id="lt-progress-count" style="font-size:20px;font-weight:700;color:#fff;font-family:'JetBrains Mono',monospace;">0</div>
                            <div id="lt-progress-total" style="font-size:11px;color:#8b8b96;margin-top:2px;">/ —</div>
                        </div>
                        <div class="lt-progress-cell">
                            <div style="font-size:10px;color:#8b8b96;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;font-weight:600;">Accuracy</div>
                            <div id="lt-progress-accuracy" style="font-size:20px;font-weight:700;color:#fff;font-family:'JetBrains Mono',monospace;">0%</div>
                            <div style="font-size:11px;color:#8b8b96;margin-top:2px;">общая</div>
                        </div>
                        <div class="lt-progress-cell">
                            <div style="font-size:10px;color:#8b8b96;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;font-weight:600;">Ср. score</div>
                            <div id="lt-progress-score" style="font-size:20px;font-weight:700;color:#fff;font-family:'JetBrains Mono',monospace;">—</div>
                            <div style="font-size:11px;color:#8b8b96;margin-top:2px;">decision</div>
                        </div>
                        <div class="lt-progress-cell">
                            <div style="font-size:10px;color:#8b8b96;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;font-weight:600;">R/R ср.</div>
                            <div id="lt-progress-rr" style="font-size:20px;font-weight:700;color:#d4af37;font-family:'JetBrains Mono',monospace;">—</div>
                            <div style="font-size:11px;color:#8b8b96;margin-top:2px;">risk:reward</div>
                        </div>
                    </div>
                </section>
            `;
            this._elements.progressCount = slot.querySelector('#lt-progress-count');
            this._elements.progressTotal = slot.querySelector('#lt-progress-total');
            this._elements.progressAccuracy = slot.querySelector('#lt-progress-accuracy');
            this._elements.progressScore = slot.querySelector('#lt-progress-score');
            this._elements.progressRR = slot.querySelector('#lt-progress-rr');
        }

        _renderControlPanel() {
            const slot = this._elements.controlSlot;
            if (!slot) return;
            slot.innerHTML = `
                <section style="display:flex;flex-direction:column;gap:8px;">
                    <button id="lt-btn-confirm" disabled style="
                        background:linear-gradient(135deg,#d4af37 0%,#c5a028 100%);
                        color:#0a0a0c;
                        border:none;
                        padding:14px 16px;
                        border-radius:10px;
                        font-size:14px;font-weight:700;
                        cursor:pointer;
                        width:100%;
                        font-family:inherit;
                        letter-spacing:0.01em;
                        transition:all 0.15s ease;
                    ">✓ Подтвердить решение <span class="lt-hotkey" style="background:rgba(0,0,0,0.2);border-color:rgba(0,0,0,0.3);color:#0a0a0c;margin-left:8px;">Enter</span></button>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                        <button id="lt-btn-next" disabled style="
                            background:#232329;
                            color:#c8c8d0;
                            border:1px solid rgba(255,255,255,0.08);
                            padding:11px 14px;
                            border-radius:10px;
                            font-size:12px;font-weight:600;
                            cursor:pointer;
                            font-family:inherit;
                            transition:all 0.15s ease;
                        ">→ Дальше</button>
                        <button id="lt-btn-reset" style="
                            background:#232329;
                            color:#c8c8d0;
                            border:1px solid rgba(255,255,255,0.08);
                            padding:11px 14px;
                            border-radius:10px;
                            font-size:12px;font-weight:600;
                            cursor:pointer;
                            font-family:inherit;
                            transition:all 0.15s ease;
                        ">⟲ Сброс</button>
                    </div>
                </section>
            `;
            this._elements.btnConfirm = slot.querySelector('#lt-btn-confirm');
            this._elements.btnNext = slot.querySelector('#lt-btn-next');
            this._elements.btnReset = slot.querySelector('#lt-btn-reset');
        }

        _renderHintsPanel() {
            const slot = this._elements.hintSlot;
            if (!slot) return;
            slot.innerHTML = `
                <div style="
                    margin-top:auto;
                    color:#8b8b96;
                    font-size:11px;
                    line-height:1.6;
                    padding-top:8px;
                    border-top:1px solid rgba(255,255,255,0.04);
                ">
                    <div style="font-weight:600;color:#c8c8d0;margin-bottom:6px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;">⌨ Горячие клавиши</div>
                    <div style="display:grid;grid-template-columns:auto 1fr;gap:6px 12px;font-size:11px;">
                        <span><span class="lt-hotkey">L</span></span><span>Выбрать Long</span>
                        <span><span class="lt-hotkey">S</span></span><span>Выбрать Short</span>
                        <span><span class="lt-hotkey">W</span></span><span>Выбрать Wait</span>
                        <span><span class="lt-hotkey">N</span></span><span>Выбрать No Trade</span>
                        <span><span class="lt-hotkey">E</span></span><span>Поставить Entry (клик)</span>
                        <span><span class="lt-hotkey">1</span></span><span>Поставить Stop Loss</span>
                        <span><span class="lt-hotkey">2</span></span><span>Поставить Take Profit</span>
                        <span><span class="lt-hotkey">Enter</span></span><span>Подтвердить решение</span>
                        <span><span class="lt-hotkey">B</span></span><span>Свернуть панель</span>
                        <span><span class="lt-hotkey">H</span></span><span>Скрыть/показать toolbar</span>
                        <span><span class="lt-hotkey">Esc</span></span><span>Отмена</span>
                    </div>
                </div>
            `;
        }

        _updateSubmitButton() {
            const btn = this._elements.btnConfirm;
            if (!btn) return;
            const dir = this.selectedDecision;
            const canSubmit = dir && !this.isAnalyzing;
            btn.disabled = !canSubmit;
            if (dir === 'wait') {
                btn.innerHTML = `✓ Подтвердить Wait <span class="lt-hotkey" style="background:rgba(0,0,0,0.2);border-color:rgba(0,0,0,0.3);color:#0a0a0c;margin-left:8px;">Enter</span>`;
            } else if (dir === 'no_trade') {
                btn.innerHTML = `✓ Подтвердить No Trade <span class="lt-hotkey" style="background:rgba(0,0,0,0.2);border-color:rgba(0,0,0,0.3);color:#0a0a0c;margin-left:8px;">Enter</span>`;
            } else if (dir === 'long' || dir === 'short') {
                btn.innerHTML = `✓ Подтвердить ${dir === 'long' ? 'Long' : 'Short'} <span class="lt-hotkey" style="background:rgba(0,0,0,0.2);border-color:rgba(0,0,0,0.3);color:#0a0a0c;margin-left:8px;">Enter</span>`;
            } else {
                btn.innerHTML = `✓ Подтвердить решение <span class="lt-hotkey" style="background:rgba(0,0,0,0.2);border-color:rgba(0,0,0,0.3);color:#0a0a0c;margin-left:8px;">Enter</span>`;
            }
        }

        // ============================================================
        // MODULE X UI — Инициализация и отрисовка
        // ============================================================

        _initModuleXUI() {
            try {
                if (!global.ModuleXUIPanel) {
                    console.warn('[LabTrainer] ModuleXUIPanel not available');
                    return;
                }
                const slot = this.container.querySelector('#lt-modulex-slot');
                if (!slot) {
                    console.warn('[LabTrainer] lt-modulex-slot not found');
                    return;
                }
                // Создаём контейнер для панели внутри слота
                const panelContainer = document.createElement('div');
                panelContainer.id = 'lt-modulex-panel';
                slot.appendChild(panelContainer);

                this.moduleXPanel = new global.ModuleXUIPanel({
                    container: panelContainer,
                    renderer: this.moduleXRenderer,
                    onModeChange: (mode, customCats) => {
                        this._onModuleXModeChange(mode, customCats);
                    },
                    onPatternClick: (pattern, id) => {
                        // Можно расширить — например, прокрутить график к нужной свече
                        if (pattern && this.chart) {
                            try {
                                this.chart.timeScale().scrollToPosition(0, false);
                            } catch (e) {}
                        }
                    }
                });

                // По умолчанию: training mode
                this.moduleXPanel.setMode('training');

                // Сохраняем ссылку на моду (training | exam | custom)
                this.moduleXMode = 'training';
                this.moduleXCustomCats = {
                    MarketStructure: true,
                    SmartMoney: true,
                    Liquidity: true,
                    PriceAction: true,
                    Other: true
                };

                // Панель фильтров и лимитов
                this._initModuleXFilters();

                console.log('[LabTrainer] ModuleX UI Panel initialized');
            } catch (err) {
                console.error('[LabTrainer] ModuleX UI Panel init error:', err);
            }
        }

        /**
         * Инициализация панели фильтров и лимитов.
         * Позволяет включать/выключать категории и настраивать количество отображаемых объектов.
         */
        _initModuleXFilters() {
            if (!this.moduleXRenderer) return;
            try {
                const slot = this.container.querySelector('#lt-modulex-slot');
                if (!slot) return;

                // Контейнер фильтров
                const filtersContainer = document.createElement('div');
                filtersContainer.id = 'lt-modulex-filters';
                filtersContainer.className = 'lt-modulex-filters';
                filtersContainer.innerHTML = `
                    <div class="lt-filters-header">
                        <span class="lt-filters-title">🎛️ Фильтры Module X</span>
                        <button class="lt-filters-toggle" id="lt-filters-toggle-btn" title="Свернуть/развернуть">▾</button>
                    </div>
                    <div class="lt-filters-body" id="lt-filters-body">
                        <div class="lt-filters-cats" id="lt-filters-cats"></div>
                        <div class="lt-filters-limits" id="lt-filters-limits"></div>
                        <div class="lt-filters-actions">
                            <button class="lt-filters-reset" id="lt-filters-reset">Сбросить</button>
                        </div>
                    </div>
                `;
                slot.appendChild(filtersContainer);

                // Категории для тогглов
                const categories = [
                    { key: 'Market Structure', label: 'Market Structure', color: '#26a69a' },
                    { key: 'Smart Money',      label: 'Smart Money',      color: '#d4af37' },
                    { key: 'Price Action',     label: 'Price Action',     color: '#7c4dff' },
                    { key: 'Volume',           label: 'Volume',           color: '#42a5f5' },
                    { key: 'Liquidity',        label: 'Liquidity',        color: '#ab47bc' },
                    { key: 'Support/Resistance', label: 'Support/Resistance', color: '#ef5350' }
                ];

                // Дефолтные лимиты
                const defaultLimits = {
                    fvg: 2, orderBlocks: 2, bos: 1, choch: 1, mss: 1,
                    displacement: 2, liquiditySweep: 2, equalHighsLows: 2,
                    support: 2, resistance: 2,
                    hh: 4, hl: 4, lh: 4, ll: 4
                };

                // Рендер тогглов категорий
                const catsContainer = filtersContainer.querySelector('#lt-filters-cats');
                categories.forEach(cat => {
                    const row = document.createElement('label');
                    row.className = 'lt-filter-row';
                    row.innerHTML = `
                        <input type="checkbox" class="lt-filter-cat-cb" data-category="${escapeHtml(cat.key)}" checked />
                        <span class="lt-filter-cat-label" style="color:${cat.color}">${escapeHtml(cat.label)}</span>
                    `;
                    catsContainer.appendChild(row);
                });

                // Рендер ползунков лимитов (минимальные значения по умолчанию)
                const limitsContainer = filtersContainer.querySelector('#lt-filters-limits');
                const limitDefs = [
                    { key: 'fvg',            label: 'FVG',             min: 0, max: 6, step: 1 },
                    { key: 'orderBlocks',    label: 'Order Blocks',    min: 0, max: 6, step: 1 },
                    { key: 'bos',            label: 'BOS',             min: 0, max: 3, step: 1 },
                    { key: 'choch',          label: 'CHoCH',           min: 0, max: 3, step: 1 },
                    { key: 'mss',            label: 'MSS',             min: 0, max: 3, step: 1 },
                    { key: 'displacement',   label: 'Displacement',    min: 0, max: 4, step: 1 },
                    { key: 'liquiditySweep', label: 'Liquidity Sweep', min: 0, max: 4, step: 1 },
                    { key: 'support',        label: 'Support',         min: 0, max: 4, step: 1 },
                    { key: 'resistance',     label: 'Resistance',      min: 0, max: 4, step: 1 }
                ];
                limitDefs.forEach(def => {
                    const wrap = document.createElement('div');
                    wrap.className = 'lt-limit-row';
                    wrap.innerHTML = `
                        <span class="lt-limit-label">${escapeHtml(def.label)}</span>
                        <input type="range" class="lt-limit-range" data-limit="${def.key}"
                               min="${def.min}" max="${def.max}" step="${def.step}"
                               value="${defaultLimits[def.key]}" />
                        <span class="lt-limit-value" id="lt-limit-val-${def.key}">${defaultLimits[def.key]}</span>
                    `;
                    limitsContainer.appendChild(wrap);
                });

                // Обработчики тогглов
                catsContainer.querySelectorAll('.lt-filter-cat-cb').forEach(cb => {
                    cb.addEventListener('change', (e) => {
                        const cat = e.target.getAttribute('data-category');
                        const filter = {};
                        filter[cat] = e.target.checked;
                        this.moduleXRenderer.setCategoryFilter(filter);
                    });
                });

                // Обработчики лимитов
                limitsContainer.querySelectorAll('.lt-limit-range').forEach(input => {
                    input.addEventListener('input', (e) => {
                        const key = e.target.getAttribute('data-limit');
                        const val = parseInt(e.target.value, 10);
                        const valSpan = filtersContainer.querySelector(`#lt-limit-val-${key}`);
                        if (valSpan) valSpan.textContent = String(val);
                        const limits = {};
                        limits[key] = val;
                        this.moduleXRenderer.setLimits(limits);
                    });
                });

                // Кнопка сброса
                filtersContainer.querySelector('#lt-filters-reset').addEventListener('click', () => {
                    catsContainer.querySelectorAll('.lt-filter-cat-cb').forEach(cb => {
                        cb.checked = true;
                    });
                    const allCats = {};
                    categories.forEach(c => { allCats[c.key] = true; });
                    this.moduleXRenderer.setCategoryFilter(allCats);

                    limitsContainer.querySelectorAll('.lt-limit-range').forEach(input => {
                        const key = input.getAttribute('data-limit');
                        if (defaultLimits[key] !== undefined) {
                            input.value = defaultLimits[key];
                            const valSpan = filtersContainer.querySelector(`#lt-limit-val-${key}`);
                            if (valSpan) valSpan.textContent = String(defaultLimits[key]);
                        }
                    });
                    this.moduleXRenderer.setLimits(defaultLimits);
                });

                // Кнопка сворачивания
                filtersContainer.querySelector('#lt-filters-toggle-btn').addEventListener('click', () => {
                    const body = filtersContainer.querySelector('#lt-filters-body');
                    const isHidden = body.style.display === 'none';
                    body.style.display = isHidden ? 'block' : 'none';
                    filtersContainer.querySelector('#lt-filters-toggle-btn').textContent = isHidden ? '▾' : '▸';
                });

                this._moduleXFiltersEl = filtersContainer;
            } catch (err) {
                console.error('[LabTrainer] _initModuleXFilters error:', err);
            }
        }

        _onModuleXModeChange(mode, customCats) {
            this.moduleXMode = mode;
            if (customCats) this.moduleXCustomCats = customCats;

            // Логика отображения в зависимости от режима
            if (mode === 'training') {
                // Показать всё
                if (this.moduleXRenderer) {
                    this.moduleXRenderer.setOptions({
                        showMarketStructure: true,
                        showSmartMoney: true,
                        showLiquidity: true,
                        showPriceAction: true,
                        showOBZones: true,
                        showFVGZones: true,
                        enabled: true
                    });
                    // Включить все категории фильтра
                    this.moduleXRenderer.setCategoryFilter({
                        'Market Structure': true,
                        'Smart Money': true,
                        'Price Action': true,
                        'Volume': true,
                        'Liquidity': true,
                        'Support/Resistance': true
                    });
                }
            } else if (mode === 'exam') {
                // Скрыть всё (показать только после подтверждения)
                if (this.moduleXRenderer) {
                    this.moduleXRenderer.setEnabled(false);
                }
            } else if (mode === 'custom') {
                // Показать только выбранные категории
                const cats = customCats || this.moduleXCustomCats;
                if (this.moduleXRenderer) {
                    this.moduleXRenderer.setOptions({
                        showMarketStructure: cats.MarketStructure !== false,
                        showSmartMoney: cats.SmartMoney !== false,
                        showLiquidity: cats.Liquidity !== false,
                        showPriceAction: cats.PriceAction !== false,
                        showOBZones: cats.SmartMoney !== false,
                        showFVGZones: cats.SmartMoney !== false,
                        enabled: true
                    });
                    // Применяем фильтр по категориям
                    this.moduleXRenderer.setCategoryFilter({
                        'Market Structure': cats.MarketStructure !== false,
                        'Smart Money': cats.SmartMoney !== false,
                        'Price Action': cats.PriceAction !== false,
                        'Volume': cats.Volume !== false,
                        'Liquidity': cats.Liquidity !== false,
                        'Support/Resistance': cats.SupportResistance !== false
                    });
                }
            }
        }

        /**
         * Отрисовать результат Module X на графике (вызывается при показе результата).
         * @param {object} moduleXResult — результат analyzeSMC() / analyzeMarketStructure()
         * @param {array} candles — массив свечей
         */
        _drawModuleXResult(moduleXResult, candles) {
            if (!this.moduleXRenderer) return;
            if (!moduleXResult) return;

            // Если Exam Mode — не рисуем до подтверждения.
            // В этом методе рисование вызывается именно при показе результата,
            // что соответствует логике Exam Mode (показать разметку только после ответа).
            try {
                const result = this.moduleXRenderer.draw(moduleXResult, candles || []);
                // Обновить список паттернов в UI Panel
                if (this.moduleXPanel && result && result.patterns) {
                    this.moduleXPanel.setPatterns(result.patterns);
                }
                console.log('[LabTrainer] ModuleX drawn, patterns:', result.patterns ? result.patterns.length : 0);
            } catch (err) {
                console.error('[LabTrainer] _drawModuleXResult error:', err);
            }
        }

        /**
         * Получить полный анализ Module X для отрисовки на графике.
         * Объединяет данные из correctAnalysisResult (если есть) с реальным анализом coreAnalysisEngine.
         */
        _getModuleXAnalysisForRender(scenario) {
            if (!scenario || !scenario.candles || !global.coreAnalysisEngine) return null;

            try {
                // Запускаем реальный анализ через coreAnalysisEngine
                const result = global.coreAnalysisEngine.analyzeMarket({
                    history: scenario.candles,
                    level: scenario.level || 'intermediate'
                });

                if (!result) return null;

                // result.marketStructure содержит HH/HL/LH/LL
                // result.smc содержит BOS, CHoCH, OB, FVG и т.д.
                const ms = result.marketStructure || {};
                const smc = result.smc || {};

                // Объединяем в формат, ожидаемый ModuleXRenderer
                return {
                    // Market Structure
                    swings: ms.swings || [],
                    higherHighs: ms.higherHighs || [],
                    higherLows: ms.higherLows || [],
                    lowerHighs: ms.lowerHighs || [],
                    lowerLows: ms.lowerLows || [],

                    // Smart Money
                    bos: smc.bos || [],
                    choch: smc.choch || [],
                    mss: smc.mss || [],
                    orderBlocks: smc.orderBlocks || [],
                    breakerBlocks: smc.breakerBlocks || [],
                    mitigationBlocks: smc.mitigationBlocks || [],

                    // Fair Value Gap
                    fairValueGaps: smc.fairValueGaps || [],
                    inverseFVG: smc.inverseFVG || [],

                    // Liquidity
                    liquiditySweeps: smc.liquiditySweeps || [],
                    equalHighs: smc.equalHighs || [],
                    equalLows: smc.equalLows || [],

                    // Price Action
                    displacement: smc.displacement || [],

                    // Контекст
                    bias: (scenario.correctAnalysisResult && scenario.correctAnalysisResult.bias) || null,
                    confidence: (scenario.correctAnalysisResult && scenario.correctAnalysisResult.confidence) || null
                };
            } catch (err) {
                console.error('[LabTrainer] _getModuleXAnalysisForRender error:', err);
                return null;
            }
        }

        /**
         * Очистить отрисовку Module X (при переходе к новому сценарию).
         */
        _clearModuleXResult() {
            if (this.moduleXRenderer) {
                try { this.moduleXRenderer.clear(); } catch (e) {}
            }
            if (this.moduleXPanel) {
                this.moduleXPanel.setPatterns([]);
            }
        }

        // ============================================================
        // UI HOOKS ДЛЯ PAYDTRAINER
        // ============================================================

        _buildUIHooks() {
            return {
                loading: ({ scenarioIndex }) => {
                    this._showChartLoading(scenarioIndex);
                    this.isAnalyzing = false;
                    this.lastAnalysisResult = null;
                    // Очистить предыдущую отрисовку Module X при загрузке нового сценария
                    this._clearModuleXResult();
                },

                ready: ({ scenario, scenarioIndex, totalScenarios }) => {
                    this._hideChartLoading();
                    this._setScenarioInfo(scenario);
                    this._renderChart(scenario);
                    this._resetDecisionPanel();
                    this._enableDecisionPanel();
                    if (this._elements.btnNext) this._elements.btnNext.disabled = false;
                    this._hideResultScreen();
                    this._updateInfoPanel(scenarioIndex, totalScenarios);
                    this._updateProgress();
                    if (this.terminal) {
                        this.terminal.clearPosition();
                        this.terminal.clearDrawings();
                        this.terminal.clearRecommended();
                        this.terminal.setDirection(null);
                    }
                    this.lastAnalysisResult = scenario.correctAnalysisResult || null;
                    // Если в сценарии есть рекомендуемый сценарий для подсказки
                    this._showScenarioHint(scenario);
                    // Если режим Training или Custom — показать разметку Module X сразу при загрузке.
                    // Используем coreAnalysisEngine.analyzeMarket() напрямую для получения полной структуры SMC-паттернов.
                    if (this.moduleXMode === 'training' || this.moduleXMode === 'custom') {
                        const analysisForRender = this._getModuleXAnalysisForRender(scenario);
                        if (analysisForRender && scenario.candles) {
                            this._drawModuleXResult(analysisForRender, scenario.candles);
                        }
                    }
                },

                analyzing: ({ decision }) => {
                    this._showChartLoading(null, 'analysis');
                    this.isAnalyzing = true;
                    this._disableDecisionPanel();
                    if (this.terminal) {
                        this.terminal._disableForAnalysis = true;
                    }
                    this.lastUserDecision = decision;
                },

                result: (result) => {
                    this.isAnalyzing = false;
                    this.lastResult = result;
                    // Получаем Module X анализ (он в result.moduleX)
                    if (result.moduleX) {
                        this.lastAnalysisResult = result.moduleX;
                        // Отрисовать результат Module X на графике
                        // (В Exam Mode разметка также показывается здесь, после подтверждения)
                        // Получаем полную структуру с BOS/CHoCH/OB/FVG из coreAnalysisEngine
                        const scenario = result.scenario;
                        if (scenario) {
                            const fullAnalysis = this._getModuleXAnalysisForRender(scenario);
                            if (fullAnalysis) {
                                this._drawModuleXResult(fullAnalysis, scenario.candles);
                            }
                        }
                    }
                    this._updateProgress();
                    this._showResultScreen(result);
                },

                error: ({ message }) => {
                    this.isAnalyzing = false;
                    this._hideChartLoading();
                    this._enableDecisionPanel();
                    console.error('[LabTrainer] error:', message);
                    if (this._elements.resultBody) {
                        this._elements.resultBody.innerHTML = `
                            <div class="lt-lesson-card" style="border-color:rgba(239,83,80,0.3);color:#ef5350;">
                                <strong>Ошибка:</strong> ${escapeHtml(message)}
                            </div>`;
                    }
                    if (this._elements.resultScreen) {
                        this._elements.resultScreen.style.display = 'flex';
                    }
                },

                warning: ({ message, level = 'info' }) => {
                    console.warn('[LabTrainer] warning:', message);
                    if (typeof document === 'undefined') return;
                    const existing = document.getElementById('lt-warning-toast');
                    if (existing) existing.remove();
                    const colors = {
                        info:    'background:rgba(33,150,243,0.95);color:#fff;',
                        warn:    'background:rgba(255,152,0,0.95);color:#fff;',
                        error:   'background:rgba(244,67,54,0.95);color:#fff;'
                    };
                    const toast = document.createElement('div');
                    toast.id = 'lt-warning-toast';
                    toast.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:10000;padding:12px 20px;border-radius:8px;font-size:13px;font-weight:500;box-shadow:0 4px 16px rgba(0,0,0,0.3);max-width:600px;text-align:center;' + (colors[level] || colors.info);
                    toast.textContent = message;
                    document.body.appendChild(toast);
                    setTimeout(() => { if (toast.parentNode) toast.remove(); }, 6000);
                },

                progress: () => this._updateProgress()
            };
        }

        _showChartLoading(scenarioIndex, type) {
            const el = this._elements.chartLoading;
            if (!el) return;
            el.style.display = 'grid';
            el.style.opacity = '1';
            el.style.pointerEvents = 'auto';
            if (this._elements.loadingText) {
                if (type === 'analysis') {
                    this._elements.loadingText.textContent = 'Анализируем решение…';
                } else {
                    this._elements.loadingText.textContent = `Загрузка сценария ${(scenarioIndex || 0) + 1}…`;
                }
            }
        }

        _hideChartLoading() {
            const el = this._elements.chartLoading;
            if (!el) return;
            el.style.opacity = '0';
            el.style.pointerEvents = 'none';
            setTimeout(() => { el.style.display = 'none'; }, 280);
        }

        _showScenarioHint(scenario) {
            // Если у сценария есть готовый correctAnalysisResult и он содержит сценарии Module X,
            // покажем HUD-подсказку о направлении (как ненавязчивый совет для новичков)
            if (!scenario) return;
            // Только для intermediate/advanced сценариев
            const correctDecision = scenario.correctDecision;
            const difficulty = scenario.difficulty;
            if (correctDecision && (difficulty === 'intermediate' || difficulty === 'advanced')) {
                // Подсказка не показывается автоматически, чтобы не убивать процесс обучения
            }
        }

        // ============================================================
        // СОБЫТИЯ
        // ============================================================

        _bindUIEvents() {
            // Back
            if (this._elements.btnBack) {
                this._elements.btnBack.addEventListener('click', () => {
                    this.back();
                    if (typeof global.backToLabCards === 'function') {
                        global.backToLabCards();
                    }
                });
            }

            // Sidebar toggle
            if (this._elements.btnSidebar) {
                this._elements.btnSidebar.addEventListener('click', () => this._toggleSidebar());
            }

            // Confirm
            if (this._elements.btnConfirm) {
                this._elements.btnConfirm.addEventListener('click', async () => {
                    if (!this.selectedDecision || this.isAnalyzing) return;
                    // Сбор данных о позиции для возможного будущего использования
                    const pos = this.terminal ? this.terminal.getPosition() : null;
                    if (!global.LabTrainer._userPositions) global.LabTrainer._userPositions = {};
                    global.LabTrainer._userPositions[this.trainer.scenarioIndex] = {
                        decision: this.selectedDecision,
                        entry: pos && pos.entry,
                        sl: pos && pos.sl,
                        tp: pos && pos.tp,
                        drawings: this.terminal ? this.terminal.drawings.length : 0
                    };
                    await this.trainer.submitDecision(this.selectedDecision);
                });
            }

            if (this._elements.btnNext) {
                this._elements.btnNext.addEventListener('click', async () => {
                    if (!this.trainer) return;
                    await this.next();
                });
            }

            if (this._elements.btnReset) {
                this._elements.btnReset.addEventListener('click', () => {
                    if (!this.trainer) return;
                    if (global.confirm && global.confirm('Сбросить весь прогресс?')) {
                        this.reset();
                    }
                });
            }

            const closeResult = () => {
                this._hideResultScreen();
                this._enableDecisionPanel();
                this._resetDecisionPanel();
                this.selectedDecision = null;
            };

            if (this._elements.btnResultClose) {
                this._elements.btnResultClose.addEventListener('click', closeResult);
            }
            if (this._elements.btnResultCloseFooter) {
                this._elements.btnResultCloseFooter.addEventListener('click', closeResult);
            }
            if (this._elements.btnResultNext) {
                this._elements.btnResultNext.addEventListener('click', async () => {
                    this._hideResultScreen();
                    if (this.trainer) await this.next();
                });
            }

            if (this._elements.resultScreen) {
                this._elements.resultScreen.addEventListener('click', e => {
                    if (e.target === this._elements.resultScreen) closeResult();
                });
            }
        }

        _bindKeyboard() {
            this._hotkeyHandler = e => {
                if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
                if (e.ctrlKey || e.metaKey || e.altKey) return;
                if (this.isAnalyzing) return;

                switch (e.key.toLowerCase()) {
                    case 'l':
                        if (this.trainer && this.trainer.state === 'ready') {
                            e.preventDefault();
                            this._selectDirection('long');
                        }
                        break;
                    case 's':
                        if (this.trainer && this.trainer.state === 'ready') {
                            e.preventDefault();
                            this._selectDirection('short');
                        }
                        break;
                    case 'w':
                        if (this.trainer && this.trainer.state === 'ready') {
                            e.preventDefault();
                            this._selectDirection('wait');
                        }
                        break;
                    case 'n':
                        if (this.trainer && this.trainer.state === 'ready') {
                            e.preventDefault();
                            this._selectDirection('no_trade');
                        }
                        break;
                    case 'enter':
                        if (this.selectedDecision && !this.isAnalyzing && this.trainer && this.trainer.state === 'ready') {
                            e.preventDefault();
                            if (this._elements.btnConfirm && !this._elements.btnConfirm.disabled) {
                                this._elements.btnConfirm.click();
                            }
                        }
                        break;
                    case 'b':
                        this._toggleSidebar();
                        break;
                    case 'escape':
                        // Закрытие экрана результата или отмена
                        if (this._elements.resultScreen && this._elements.resultScreen.style.display === 'flex') {
                            this._hideResultScreen();
                            this._enableDecisionPanel();
                            this._resetDecisionPanel();
                            this.selectedDecision = null;
                            e.preventDefault();
                        }
                        break;
                }
            };
            document.addEventListener('keydown', this._hotkeyHandler);
        }

        _selectDirection(dir) {
            this.selectedDecision = dir;
            if (this.terminal) {
                this.terminal.setDirection(dir);
            } else {
                this._highlightDirection(dir);
            }
            this._updateSubmitButton();
        }

        _toggleSidebar() {
            if (!this._elements.grid) return;
            const collapsed = !this.sidebarCollapsed;
            this.sidebarCollapsed = collapsed;
            if (collapsed) {
                this._elements.grid.classList.add('collapsed');
                this._elements.btnSidebar.innerHTML = '◀';
            } else {
                this._elements.grid.classList.remove('collapsed');
                this._elements.btnSidebar.innerHTML = '▶';
            }
            // Resize chart после изменения layout
            setTimeout(() => {
                if (this.chart && this._elements.chartCanvas) {
                    this.chart.applyOptions({
                        width: this._elements.chartCanvas.clientWidth,
                        height: this._elements.chartCanvas.clientHeight
                    });
                }
            }, 350);
        }

        // ============================================================
        // HELPERS
        // ============================================================

        _setScenarioInfo(scenario) {
            if (!scenario) return;
            const E = this._elements;
            // Форматируем символ: BTCUSDT → BTC/USDT для отображения
            if (E.symbol) {
                let displaySymbol = scenario.symbol || '—';
                if (displaySymbol && displaySymbol.length >= 6 && !displaySymbol.includes(':') && !displaySymbol.includes('/')) {
                    // Пробуем вставить "/" перед USDT/USDC/BUSD
                    displaySymbol = displaySymbol.replace(/(USDT|USDC|BUSD|USD)$/i, '/$1');
                }
                E.symbol.textContent = displaySymbol;
            }
            if (E.scenarioTitle) E.scenarioTitle.textContent = scenario.name || '—';
            if (E.scenarioDesc) E.scenarioDesc.textContent = scenario.description || '—';
            if (E.difficulty) {
                E.difficulty.textContent = scenario.difficulty || '—';
                E.difficulty.className = 'lt-difficulty ' + (scenario.difficulty || '');
            }
            // Обновляем индикатор "Future hidden" — теперь это указывает
            // на скрытые реальные свечи будущего, а не на синтетику
            if (E.futureBadge) {
                E.futureBadge.textContent = 'Future hidden (real market)';
            }
        }

        _updateInfoPanel(scenarioIndex, totalScenarios) {
            const ev = new CustomEvent('lab-trainer-progress', {
                detail: {
                    scenarioIndex,
                    totalScenarios,
                    current: (scenarioIndex || 0) + 1
                }
            });
            document.dispatchEvent(ev);
        }

        _resetDecisionPanel() {
            this.selectedDecision = null;
            (this._elements.directionBtns || []).forEach(btn => {
                btn.classList.remove('active');
                btn.disabled = false;
            });
            this._updateSubmitButton();
            if (this.terminal) {
                this.terminal.setDirection(null);
            }
        }

        _disableDecisionPanel() {
            (this._elements.directionBtns || []).forEach(btn => {
                btn.disabled = true;
                btn.classList.remove('active');
            });
            if (this._elements.btnConfirm) this._elements.btnConfirm.disabled = true;
            if (this._elements.btnNext) this._elements.btnNext.disabled = true;
        }

        _enableDecisionPanel() {
            (this._elements.directionBtns || []).forEach(btn => {
                btn.disabled = false;
            });
            if (this._elements.btnNext) this._elements.btnNext.disabled = false;
        }

        _updateProgress() {
            if (!this.trainer || typeof this.trainer.getProgress !== 'function') return;
            const E = this._elements;
            try {
                const p = this.trainer.getProgress();
                if (E.progressCount) E.progressCount.textContent = p.completedScenarios || 0;
                if (E.progressTotal) {
                    E.progressTotal.textContent = '/ ' + (this.trainer.scenarios.length || '—');
                }
                if (E.progressAccuracy) {
                    E.progressAccuracy.textContent = (p.accuracy || 0).toFixed(0) + '%';
                }
                if (E.progressScore) {
                    E.progressScore.textContent =
                        p.averageScore > 0 ? p.averageScore.toFixed(0) + '%' : '—';
                }
                if (E.progressRR) {
                    // R/R из последних решений пользователя (если были)
                    const items = p.history || [];
                    let sumRR = 0, countRR = 0;
                    items.forEach(it => {
                        const userData = global.LabTrainer._userPositions && global.LabTrainer._userPositions[it.scenarioIndex];
                        if (userData && userData.entry && userData.sl && userData.tp) {
                            let risk = 0, reward = 0;
                            if (userData.decision === 'long') {
                                risk = userData.entry - userData.sl;
                                reward = userData.tp - userData.entry;
                            } else if (userData.decision === 'short') {
                                risk = userData.sl - userData.entry;
                                reward = userData.entry - userData.tp;
                            }
                            if (risk > 0) { sumRR += reward / risk; countRR++; }
                        }
                    });
                    E.progressRR.textContent = countRR > 0 ? '1:' + (sumRR / countRR).toFixed(1) : '—';
                }
            } catch (err) {
                console.error('[LabTrainer] updateProgress error:', err);
            }
        }

        // ============================================================
        // ЭКРАН РЕЗУЛЬТАТА (со сравнением с Module X)
        // ============================================================

        _showResultScreen(result) {
            const correct = result.correctness && result.correctness.isCorrect;
            const decision = result.userDecision;
            const correctDecision = (result.correctness && result.correctness.correctDecision) || '—';
            const E = this._elements;

            if (E.resultVerdictIcon) {
                E.resultVerdictIcon.style.background = correct ? '#26a69a' : '#ef5350';
                E.resultVerdictIcon.textContent = correct ? '✓' : '✗';
            }
            if (E.resultTitle) {
                E.resultTitle.textContent = correct ? 'Решение верное!' : 'Решение ошибочно';
            }
            if (E.resultSubtitle) {
                E.resultSubtitle.textContent =
                    `Ваш выбор: ${String(decision || '—').toUpperCase()} · Правильно: ${String(correctDecision).toUpperCase()}`;
            }

            const m2 = result.module2 || {};
            const m3 = result.module3 || {};
            const mX = result.moduleX || {};
            const m1 = result.module1 || {};

            let html = '';

            // 1. Главный блок метрик
            html += `<section class="lt-result-section">
                <div class="lt-result-grid">
                    <div class="lt-result-cell"><div class="lt-label">Verdict</div><div class="lt-value">${escapeHtml(m2.verdict || '—')}</div></div>
                    <div class="lt-result-cell"><div class="lt-label">Score</div><div class="lt-value gold">${formatNumber(m2.score)}</div></div>
                    <div class="lt-result-cell"><div class="lt-label">Confidence</div><div class="lt-value gold">${escapeHtml((mX.confidence && mX.confidence.percent) || '—')}</div></div>
                    <div class="lt-result-cell"><div class="lt-label">Market Bias</div><div class="lt-value ${
                        mX.bias === 'bullish' ? 'bull' : mX.bias === 'bearish' ? 'bear' : 'neutral'
                    }">${escapeHtml(mX.bias || '—')}</div></div>
                    <div class="lt-result-cell"><div class="lt-label">Context</div><div class="lt-value">${escapeHtml(mX.context || '—')}</div></div>
                    <div class="lt-result-cell"><div class="lt-label">Trend</div><div class="lt-value">${escapeHtml((mX.trend && mX.trend.primaryTrend) || '—')}</div></div>
                    <div class="lt-result-cell"><div class="lt-label">Phase</div><div class="lt-value">${escapeHtml((mX.marketPhase && mX.marketPhase.phase) || '—')}</div></div>
                    <div class="lt-result-cell"><div class="lt-label">Module</div><div class="lt-value gold">PAYD v${escapeHtml(mX.moduleXVersion || '?')}</div></div>
                </div>
            </section>`;

            // 2. Сравнение с Module X (если было размещение позиции)
            const userPos = this._getUserPositionForCurrent();
            const scenarioKey = this.trainer ? this.trainer.scenarioIndex : null;
            if (userPos && (decision === 'long' || decision === 'short')) {
                html += this._renderPositionComparison(userPos, decision, mX);
            }

            // 3. Module 2 explanation
            if (m2.explanation) {
                const exp = m2.explanation;
                const matchText = exp.match || '';
                const evidenceList = Array.isArray(exp.evidence) ? exp.evidence : [];
                const missesList = Array.isArray(exp.evidenceMisses) ? exp.evidenceMisses : [];
                const riskText = exp.risk || '';
                const ctx = exp.contextSummary || {};
                html += `<section class="lt-result-section">
                    <h3>Почему эта оценка</h3>
                    ${matchText ? `<div class="lt-lesson-card"><strong>Совпадение:</strong> ${escapeHtml(matchText)}</div>` : ''}
                    ${evidenceList.length > 0 ? `<div class="lt-lesson-card"><strong>Подтверждающие сигналы:</strong><ul>${evidenceList.map(e =>
                        `<li>${escapeHtml(typeof e === 'string' ? e : (e.text || JSON.stringify(e)))}</li>`
                    ).join('')}</ul></div>` : ''}
                    ${missesList.length > 0 ? `<div class="lt-lesson-card"><strong>Несоответствия:</strong><ul>${missesList.map(e =>
                        `<li>${escapeHtml(typeof e === 'string' ? e : (e.text || JSON.stringify(e)))}</li>`
                    ).join('')}</ul></div>` : ''}
                    ${riskText ? `<div class="lt-lesson-card"><strong>Риск:</strong> ${escapeHtml(riskText)}</div>` : ''}
                    ${ctx.bias || ctx.context ? `<div class="lt-lesson-card"><strong>Контекст:</strong> bias=${escapeHtml(ctx.bias || '—')}, context=${escapeHtml(ctx.context || '—')}, confidence=${escapeHtml(ctx.confidence || '—')}, продолжение=${escapeHtml(ctx.continuationPct || '—')}%</div>` : ''}
                </section>`;
            }

            // 4. Module X — рекомендованные сценарии
            const scenarios = mX.scenarios || [];
            if (scenarios.length > 0) {
                html += `<section class="lt-result-section"><h3>Сценарии Module X (рекомендации)</h3>`;
                html += `<div class="lt-signal-list">`;
                // Сортируем по приоритету
                const sortedSc = [...scenarios].sort((a, b) => (b.priority || 0) - (a.priority || 0));
                sortedSc.slice(0, 4).forEach(s => {
                    const sl = s.stopLoss ? `SL ${formatPrice(s.stopLoss)}` : '';
                    const tp = s.takeProfit ? `TP ${formatPrice(s.takeProfit)}` : '';
                    const entry = s.entryZone ? `[${formatPrice(s.entryZone.low)} - ${formatPrice(s.entryZone.high)}]` : '';
                    html += `<div class="lt-signal-item supporting">
                        <strong>${escapeHtml(s.title || s.id)}</strong>
                        ${s.direction ? ` <span style="color:${s.direction === 'long' ? '#26a69a' : s.direction === 'short' ? '#ef5350' : '#9e9e9e'};">${escapeHtml(s.direction)}</span>` : ''}
                        ${entry ? ` — ${entry}` : ''}
                        ${sl ? ` · ${escapeHtml(sl)}` : ''}
                        ${tp ? ` · ${escapeHtml(tp)}` : ''}
                        ${s.riskRewardRatio ? ` · R:R ${escapeHtml(s.riskRewardRatio)}` : ''}
                    </div>`;
                });
                html += `</div></section>`;
            }

            // 5. SMC / Price Action / Volume
            const smc = mX.smartMoney || {};
            const pa = mX.priceAction || {};
            const vol = mX.volume || {};
            const liq = mX.liquidity || {};
            const cells = [];
            if (smc.signals || smc.orderBlocks) {
                cells.push(`<div class="lt-result-cell"><div class="lt-label">SMC</div><div class="lt-value">${escapeHtml(smc.signals && smc.signals[0] || (smc.orderBlocks && smc.orderBlocks.length) || '—')}</div></div>`);
            }
            if (pa.pattern) {
                cells.push(`<div class="lt-result-cell"><div class="lt-label">Price Action</div><div class="lt-value">${escapeHtml(pa.pattern)}</div></div>`);
            }
            if (vol.summary || vol.trend) {
                cells.push(`<div class="lt-result-cell"><div class="lt-label">Volume</div><div class="lt-value">${escapeHtml(vol.summary || vol.trend)}</div></div>`);
            }
            if (liq) {
                cells.push(`<div class="lt-result-cell"><div class="lt-label">Liquidity</div><div class="lt-value">${escapeHtml(liq.levels ? liq.levels.length + ' уровн.' : (liq.zones || '—'))}</div></div>`);
            }
            if (mX.momentum && mX.momentum.signal) {
                cells.push(`<div class="lt-result-cell"><div class="lt-label">Momentum</div><div class="lt-value">${escapeHtml(mX.momentum.signal)}</div></div>`);
            }
            if (mX.volatility) {
                const v = mX.volatility;
                cells.push(`<div class="lt-result-cell"><div class="lt-label">Volatility</div><div class="lt-value">${escapeHtml(v.regime || v.signal || '—')}</div></div>`);
            }
            if (cells.length > 0) {
                html += `<section class="lt-result-section"><h3>Smart Money / Price Action / Volume / Liquidity</h3>
                <div class="lt-result-grid">${cells.join('')}</div></section>`;
            }

            // 6. Module 3 — обратная связь
            if (m3.lesson) {
                html += `<section class="lt-result-section"><h3>Обратная связь (Module 3)</h3><div class="lt-lesson-card">${escapeHtml(m3.lesson)}</div></section>`;
            }
            if (m3.whyExplanation) {
                html += `<section class="lt-result-section"><h3>Объяснение Module 3</h3><div class="lt-lesson-card">${escapeHtml(m3.whyExplanation)}</div></section>`;
            }
            if (Array.isArray(m3.missedSignals) && m3.missedSignals.length > 0) {
                html += `<section class="lt-result-section"><h3>Пропущенные сигналы</h3><div class="lt-signal-list">`;
                m3.missedSignals.forEach(s => {
                    html += `<div class="lt-signal-item missed">${escapeHtml(typeof s === 'string' ? s : (s.signal || s.type || s.label || JSON.stringify(s)))}</div>`;
                });
                html += `</div></section>`;
            }
            if (Array.isArray(m3.cognitiveBiases) && m3.cognitiveBiases.length > 0) {
                html += `<section class="lt-result-section"><h3>Когнитивные искажения</h3><div class="lt-signal-list">`;
                m3.cognitiveBiases.forEach(b => {
                    html += `<div class="lt-signal-item missed">${escapeHtml(typeof b === 'string' ? b : (b.label || b.type || JSON.stringify(b)))}</div>`;
                });
                html += `</div></section>`;
            }
            if (Array.isArray(m3.learningTips) && m3.learningTips.length > 0) {
                html += `<section class="lt-result-section"><h3>Роветы для следующего сценария</h3><div class="lt-signal-list">`;
                m3.learningTips.forEach(t => {
                    html += `<div class="lt-signal-item supporting">${escapeHtml(typeof t === 'string' ? t : (t.text || t.label || JSON.stringify(t)))}</div>`;
                });
                html += `</div></section>`;
            }

            if (E.resultBody) E.resultBody.innerHTML = html;
            if (E.resultScreen) E.resultScreen.style.display = 'flex';
            if (E.btnNext) E.btnNext.disabled = false;
        }

        _getUserPositionForCurrent() {
            if (!global.LabTrainer._userPositions) return null;
            const idx = this.trainer ? this.trainer.scenarioIndex : null;
            if (idx === null) return null;
            return global.LabTrainer._userPositions[idx] || null;
        }

        _renderPositionComparison(userPos, decision, mX) {
            // Получаем рекомендацию Module X для сравнения
            const recommended = this.terminal ? this.terminal.pickRecommendation(mX, decision) : null;
            if (!recommended) return '';
            const lastPrice = (mX.inputMeta && mX.inputMeta.lastPrice) ||
                              (mX.summary && mX.summary.lastPrice) || null;
            const atr = (mX.volatility && mX.volatility.atr) || null;

            let html = '<section class="lt-result-section">';
            html += '<h3>📐 Сравнение твоей позиции с Module X</h3>';

            // Точность Entry
            if (userPos.entry !== null && userPos.entry !== undefined && recommended.entry !== null) {
                const entryDiff = Math.abs(userPos.entry - recommended.entry);
                const entryPct = recommended.entry !== 0 ? (entryDiff / recommended.entry) * 100 : 0;
                const entryScore = this._scoreAccuracy(entryPct);
                html += `<div class="lt-result-cell" style="margin-bottom:10px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                        <span class="lt-label" style="margin:0;">Точка входа</span>
                        <span style="font-size:11px;color:${entryScore.color};font-weight:600;">${entryScore.label}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;">
                        <span>Ты: <strong style="color:#d4af37;font-family:'JetBrains Mono',monospace;">${formatPrice(userPos.entry)}</strong></span>
                        <span>Module X: <strong style="color:#26a69a;font-family:'JetBrains Mono',monospace;">${formatPrice(recommended.entry)}</strong></span>
                    </div>
                    <div class="lt-precision-bar">
                        <div class="lt-precision-track">
                            <div class="lt-precision-fill ${entryScore.cls}" style="width:${entryScore.percent}%;"></div>
                        </div>
                        <span style="font-size:11px;font-family:'JetBrains Mono',monospace;color:#c8c8d0;">${formatPrice(entryDiff)}${atr ? ` (${(entryDiff/atr).toFixed(2)} ATR)` : ''}</span>
                    </div>
                </div>`;
            }

            // Точность SL
            if (userPos.sl !== null && userPos.sl !== undefined && recommended.sl !== null) {
                const userRisk = decision === 'long' ? userPos.entry - userPos.sl : userPos.sl - userPos.entry;
                const recRisk = decision === 'long' ? recommended.entry - recommended.sl : recommended.sl - recommended.entry;
                const slDiffPct = recRisk > 0 ? Math.abs(userRisk - recRisk) / recRisk * 100 : 0;
                // SL хорошо если он не слишком тугой и не слишком широкий
                let slScore = this._scoreAccuracy(slDiffPct);
                if (userRisk <= 0) slScore = { label: 'некорректный', color: '#ef5350', cls: 'poor', percent: 10 };
                html += `<div class="lt-result-cell" style="margin-bottom:10px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                        <span class="lt-label" style="margin:0;">Stop Loss</span>
                        <span style="font-size:11px;color:${slScore.color};font-weight:600;">${slScore.label}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;">
                        <span>Ты: <strong style="color:#ef5350;font-family:'JetBrains Mono',monospace;">${formatPrice(userPos.sl)}</strong></span>
                        <span>Module X: <strong style="color:#26a69a;font-family:'JetBrains Mono',monospace;">${formatPrice(recommended.sl)}</strong></span>
                    </div>
                    <div class="lt-precision-bar">
                        <div class="lt-precision-track">
                            <div class="lt-precision-fill ${slScore.cls}" style="width:${slScore.percent}%;"></div>
                        </div>
                        <span style="font-size:11px;font-family:'JetBrains Mono',monospace;color:#c8c8d0;">риск ${userRisk > 0 ? formatPrice(userRisk) : '?'}${atr ? ` (${(userRisk/atr).toFixed(2)} ATR)` : ''}</span>
                    </div>
                </div>`;
            }

            // Точность TP
            if (userPos.tp !== null && userPos.tp !== undefined && recommended.tp !== null) {
                const userReward = decision === 'long' ? userPos.tp - userPos.entry : userPos.entry - userPos.tp;
                const recReward = decision === 'long' ? recommended.tp - recommended.entry : recommended.entry - recommended.tp;
                const tpDiffPct = recReward > 0 ? Math.abs(userReward - recReward) / recReward * 100 : 0;
                const tpScore = this._scoreAccuracy(tpDiffPct);
                html += `<div class="lt-result-cell" style="margin-bottom:10px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                        <span class="lt-label" style="margin:0;">Take Profit</span>
                        <span style="font-size:11px;color:${tpScore.color};font-weight:600;">${tpScore.label}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;">
                        <span>Ты: <strong style="color:#26a69a;font-family:'JetBrains Mono',monospace;">${formatPrice(userPos.tp)}</strong></span>
                        <span>Module X: <strong style="color:#26a69a;font-family:'JetBrains Mono',monospace;">${formatPrice(recommended.tp)}</strong></span>
                    </div>
                    <div class="lt-precision-bar">
                        <div class="lt-precision-track">
                            <div class="lt-precision-fill ${tpScore.cls}" style="width:${tpScore.percent}%;"></div>
                        </div>
                        <span style="font-size:11px;font-family:'JetBrains Mono',monospace;color:#c8c8d0;">прибыль ${formatPrice(userReward)}${atr ? ` (${(userReward/atr).toFixed(2)} ATR)` : ''}</span>
                    </div>
                </div>`;
            }

            // Risk/Reward
            if (userPos.entry !== null && userPos.sl !== null && userPos.tp !== null) {
                const userRisk = decision === 'long' ? userPos.entry - userPos.sl : userPos.sl - userPos.entry;
                const userReward = decision === 'long' ? userPos.tp - userPos.entry : userPos.entry - userPos.tp;
                const rr = userRisk > 0 ? userReward / userRisk : 0;
                const recRR = (recommended.sl && recommended.tp && recommended.entry) ?
                    (decision === 'long'
                        ? (recommended.tp - recommended.entry) / Math.max(0.0000001, recommended.entry - recommended.sl)
                        : (recommended.entry - recommended.tp) / Math.max(0.0000001, recommended.sl - recommended.entry))
                    : null;
                html += `<div class="lt-result-cell">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                        <span class="lt-label" style="margin:0;">Risk / Reward Ratio</span>
                        <span style="font-size:13px;color:${rr >= 2 ? '#26a69a' : rr >= 1 ? '#ffc107' : '#ef5350'};font-weight:700;">1 : ${rr.toFixed(2)}</span>
                    </div>
                    <div style="display:flex;gap:10px;font-size:12px;">
                        <div style="flex:1;background:#0a0a0c;padding:8px 10px;border-radius:6px;">
                            <div style="color:#8b8b96;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;">Твой R/R</div>
                            <div style="font-family:'JetBrains Mono',monospace;font-weight:700;color:#fff;margin-top:2px;">1:${rr.toFixed(2)}</div>
                        </div>
                        ${recRR !== null ? `<div style="flex:1;background:#0a0a0c;padding:8px 10px;border-radius:6px;">
                            <div style="color:#8b8b96;font-size:10px;text-transform:uppercase;letter-spacing:0.06em;">Module X R/R</div>
                            <div style="font-family:'JetBrains Mono',monospace;font-weight:700;color:#d4af37;margin-top:2px;">1:${recRR.toFixed(2)}</div>
                        </div>` : ''}
                    </div>
                </div>`;

                // Каталог ошибок
                const errors = [];
                if (userRisk <= 0) {
                    errors.push('Stop Loss установлен некорректно (не в направлении убытка). Пересмотри направление SL относительно Entry.');
                } else if (userRisk > 0 && atr && userRisk < atr * 0.3) {
                    errors.push('Stop Loss слишком близко к Entry. Высокий риск выноса стоп-лосса шумом рынка.');
                }
                if (rr < 1 && userPos.tp !== null) {
                    errors.push('Risk/Reward меньше 1 — статистически убыточная сделка на дистанции.');
                } else if (rr < 2 && userPos.tp !== null) {
                    errors.push('Risk/Reward ниже оптимального (рекомендуется ≥ 1:2). Увеличь Take Profit или уменьши Stop Loss.');
                }
                if (userPos.tp === null) {
                    errors.push('Take Profit не установлен. Всегда имей чёткий план выхода из прибыли.');
                }
                if (userPos.sl === null) {
                    errors.push('Stop Loss не установлен. Это критическая ошибка управления рисками.');
                }
                if (decision === 'long' && recommended.entry && userPos.entry < recommended.entry * 0.95 && lastPrice && userPos.entry < lastPrice) {
                    errors.push('Entry ниже рекомендуемой зоны — слишком агрессивный вход. Лучше дождаться подтверждения.');
                }
                if (decision === 'short' && recommended.entry && userPos.entry > recommended.entry * 1.05 && lastPrice && userPos.entry > lastPrice) {
                    errors.push('Entry выше рекомендуемой зоны — слишком ранний вход в шорт.');
                }

                if (errors.length > 0) {
                    html += '<div style="margin-top:14px;"><div class="lt-label" style="margin-bottom:8px;">⚠ Ошибки и рекомендации</div>';
                    errors.forEach(e => { html += `<div class="lt-error-card">${escapeHtml(e)}</div>`; });
                    html += '</div>';
                }
            }

            html += '</section>';
            return html;
        }

        _scoreAccuracy(diffPct) {
            if (diffPct < 0.5) return { label: 'отлично', color: '#26a69a', cls: 'excellent', percent: 95 };
            if (diffPct < 1.5) return { label: 'хорошо', color: '#26a69a', cls: 'excellent', percent: 80 };
            if (diffPct < 3) return { label: 'нормально', color: '#ffc107', cls: 'good', percent: 65 };
            if (diffPct < 6) return { label: 'средне', color: '#ffc107', cls: 'fair', percent: 45 };
            return { label: 'плохо', color: '#ef5350', cls: 'poor', percent: 25 };
        }

        _hideResultScreen() {
            if (this._elements.resultScreen) {
                this._elements.resultScreen.style.display = 'none';
            }
        }
    }

    // ================================================================
    // ГЛОБАЛЬНЫЙ API
    // ================================================================

    let _instance = null;

    global.LabTrainer = {
        mount(containerId) {
            if (!_instance) _instance = new LabTrainerClass();
            return _instance.mount(containerId);
        },
        start(scenarioIndex) {
            if (!_instance) {
                console.warn('[LabTrainer] mount() must be called before start()');
                return Promise.resolve();
            }
            return _instance.start(scenarioIndex);
        },
        next() {
            if (!_instance) return Promise.resolve();
            return _instance.next();
        },
        back() {
            if (!_instance) return;
            _instance.back();
        },
        reset() {
            if (!_instance) return;
            _instance.reset();
        },
        destroy() {
            if (_instance) {
                _instance.destroy();
                _instance = null;
            }
        },
        get instance() {
            return _instance;
        }
    };
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this)));
