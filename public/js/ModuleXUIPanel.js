/**
 * ModuleXUIPanel — UI-компонент для Module X.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  Управляет:
 *    - Панелью списка обнаруженных паттернов (правая/левая боковая)
 *    - Карточкой с подробной информацией о паттерне
 *    - Переключателем режимов: Training / Exam / Custom
 *    - Чекбоксами Custom Mode (какие элементы показывать)
 *
 *  Стиль: профессиональный, тёмная тема, как TradingView.
 *
 *  Использование:
 *    const panel = new ModuleXUIPanel({
 *        container: document.getElementById('module-x-panel'),
 *        renderer: moduleXRenderer,
 *        onModeChange: (mode) => { ... }
 *    });
 *    panel.setPatterns(patternsArray);
 *    panel.setMode('training');
 * ════════════════════════════════════════════════════════════════════════════
 */

(function (global) {
    'use strict';

    if (!global) {
        throw new Error('[ModuleXUIPanel] global is required');
    }

    const ICONS = {
        MarketStructure: '📐',
        SmartMoney: '💰',
        Liquidity: '💧',
        PriceAction: '🎯',
        Other: '🔍'
    };

    const CATEGORY_LABELS = {
        MarketStructure: 'Структура рынка',
        SmartMoney: 'Smart Money',
        Liquidity: 'Ликвидность',
        PriceAction: 'Price Action',
        Other: 'Другое'
    };

    const MODE_LABELS = {
        training: 'Training',
        exam: 'Exam',
        custom: 'Custom'
    };

    class ModuleXUIPanel {
        constructor(options) {
            this.container = options.container;
            this.renderer = options.renderer;
            this.onModeChange = options.onModeChange || function () {};
            this.onPatternClick = options.onPatternClick || function () {};

            this.mode = 'training'; // training | exam | custom
            this.customCategories = {
                MarketStructure: true,
                SmartMoney: true,
                Liquidity: true,
                PriceAction: true,
                Other: true
            };
            this.patterns = [];
            this.selectedPatternId = null;
            this.expanded = true;
            this.cardExpanded = false;

            this._render();
        }

        // ============================================================
        // ПУБЛИЧНЫЕ МЕТОДЫ
        // ============================================================

        setPatterns(patterns) {
            this.patterns = patterns || [];
            this._renderPatternsList();
        }

        setMode(mode) {
            if (!['training', 'exam', 'custom'].includes(mode)) {
                console.warn('[ModuleXUIPanel] Unknown mode:', mode);
                return;
            }
            this.mode = mode;
            this._updateModeUI();
            this.onModeChange(mode);
        }

        setCustomCategory(category, enabled) {
            this.customCategories[category] = !!enabled;
            this._updateCustomUI();
            this.onModeChange('custom', this.customCategories);
        }

        destroy() {
            if (this.container) {
                this.container.innerHTML = '';
            }
        }

        // ============================================================
        // РЕНДЕР
        // ============================================================

        _render() {
            if (!this.container) return;
            this.container.innerHTML = `
                <div class="mxuip-root">
                    <!-- HEADER -->
                    <div class="mxuip-header">
                        <div class="mxuip-title">
                            <span class="mxuip-title-icon">🔍</span>
                            <span>Module X</span>
                            <button class="mxuip-collapse-btn" title="Свернуть">⮜</button>
                        </div>
                        <div class="mxuip-subtitle">Автоматический анализ графика</div>
                    </div>

                    <!-- MODE SWITCHER -->
                    <div class="mxuip-modes">
                        <button class="mxuip-mode-btn" data-mode="training" title="Вся разметка видна сразу">
                            <span>👁️</span><span>Training</span>
                        </button>
                        <button class="mxuip-mode-btn" data-mode="exam" title="Разметка появится после подтверждения">
                            <span>📝</span><span>Exam</span>
                        </button>
                        <button class="mxuip-mode-btn" data-mode="custom" title="Свой набор элементов">
                            <span>⚙️</span><span>Custom</span>
                        </button>
                    </div>

                    <!-- CUSTOM CHECKBOXES (только для custom mode) -->
                    <div class="mxuip-custom-options" style="display:none;">
                        <label class="mxuip-checkbox">
                            <input type="checkbox" data-cat="MarketStructure" checked>
                            <span>${ICONS.MarketStructure} ${CATEGORY_LABELS.MarketStructure}</span>
                        </label>
                        <label class="mxuip-checkbox">
                            <input type="checkbox" data-cat="SmartMoney" checked>
                            <span>${ICONS.SmartMoney} ${CATEGORY_LABELS.SmartMoney}</span>
                        </label>
                        <label class="mxuip-checkbox">
                            <input type="checkbox" data-cat="Liquidity" checked>
                            <span>${ICONS.Liquidity} ${CATEGORY_LABELS.Liquidity}</span>
                        </label>
                        <label class="mxuip-checkbox">
                            <input type="checkbox" data-cat="PriceAction" checked>
                            <span>${ICONS.PriceAction} ${CATEGORY_LABELS.PriceAction}</span>
                        </label>
                    </div>

                    <!-- PATTERNS LIST -->
                    <div class="mxuip-patterns">
                        <div class="mxuip-patterns-header">
                            <span>Найдено паттернов:</span>
                            <span class="mxuip-patterns-count">0</span>
                        </div>
                        <div class="mxuip-patterns-list">
                            <div class="mxuip-empty">Нет данных. Запустите анализ Module X.</div>
                        </div>
                    </div>
                </div>

                <!-- INFO CARD (overlay) -->
                <div class="mxuip-card" style="display:none;">
                    <div class="mxuip-card-header">
                        <div class="mxuip-card-title">Детали паттерна</div>
                        <button class="mxuip-card-close" title="Закрыть">✕</button>
                    </div>
                    <div class="mxuip-card-body"></div>
                </div>
            `;

            this._injectStyles();
            this._bindEvents();
            this._updateModeUI();
        }

        _renderPatternsList() {
            const listEl = this.container.querySelector('.mxuip-patterns-list');
            const countEl = this.container.querySelector('.mxuip-patterns-count');
            if (!listEl) return;

            countEl.textContent = this.patterns.length;

            if (this.patterns.length === 0) {
                listEl.innerHTML = `<div class="mxuip-empty">Нет данных. Запустите анализ Module X.</div>`;
                return;
            }

            // Группируем по категориям
            const grouped = {};
            this.patterns.forEach(p => {
                const cat = p.category || 'Other';
                if (!grouped[cat]) grouped[cat] = [];
                grouped[cat].push(p);
            });

            let html = '';
            Object.keys(grouped).forEach(cat => {
                html += `
                    <div class="mxuip-cat-group">
                        <div class="mxuip-cat-label">${ICONS[cat] || '🔍'} ${CATEGORY_LABELS[cat] || cat} (${grouped[cat].length})</div>
                        ${grouped[cat].map(p => this._renderPatternItem(p)).join('')}
                    </div>
                `;
            });

            listEl.innerHTML = html;

            // Привязать обработчики кликов
            listEl.querySelectorAll('.mxuip-pattern-item').forEach(el => {
                el.addEventListener('click', () => {
                    const id = el.getAttribute('data-id');
                    this._selectPattern(id);
                });
            });
        }

        _renderPatternItem(p) {
            const selected = this.selectedPatternId === p.id ? 'selected' : '';
            const bullishClass = p.bullish === true ? 'bullish' : (p.bullish === false ? 'bearish' : '');
            return `
                <div class="mxuip-pattern-item ${selected} ${bullishClass}" data-id="${p.id}">
                    <div class="mxuip-pattern-name">${this._escape(p.name)}</div>
                    <div class="mxuip-pattern-meta">
                        <span class="mxuip-pattern-price">$${this._formatPrice(p.price)}</span>
                        <span class="mxuip-pattern-desc">${this._escape((p.description || '').substring(0, 60))}${p.description && p.description.length > 60 ? '…' : ''}</span>
                    </div>
                </div>
            `;
        }

        _renderCard(pattern) {
            const cardEl = this.container.querySelector('.mxuip-card');
            const bodyEl = this.container.querySelector('.mxuip-card-body');
            if (!cardEl || !bodyEl) return;

            const bullishText = pattern.bullish === true ? 'Бычий' : (pattern.bullish === false ? 'Медвежий' : 'Нейтральный');
            const bullishClass = pattern.bullish === true ? 'bullish' : (pattern.bullish === false ? 'bearish' : 'neutral');

            bodyEl.innerHTML = `
                <div class="mxuip-card-cat ${bullishClass}">
                    ${ICONS[pattern.category] || '🔍'} ${CATEGORY_LABELS[pattern.category] || pattern.category} • ${bullishText}
                </div>
                <h3 class="mxuip-card-h3">${this._escape(pattern.fullName || pattern.name)}</h3>
                <div class="mxuip-card-section">
                    <div class="mxuip-card-label">Что это</div>
                    <div class="mxuip-card-text">${this._escape(pattern.description || '—')}</div>
                </div>
                <div class="mxuip-card-section">
                    <div class="mxuip-card-label">Почему Module X это обнаружил</div>
                    <div class="mxuip-card-text">${this._escape(this._getDetectionReason(pattern))}</div>
                </div>
                <div class="mxuip-card-section">
                    <div class="mxuip-card-label">Сила сигнала (Confidence)</div>
                    <div class="mxuip-confidence">
                        <div class="mxuip-confidence-bar ${bullishClass}">
                            <div class="mxuip-confidence-fill" style="width: ${this._getConfidence(pattern)}%;"></div>
                        </div>
                        <div class="mxuip-confidence-text">${this._getConfidence(pattern)}% • ${this._getConfidenceLabel(pattern)}</div>
                    </div>
                </div>
                <div class="mxuip-card-section">
                    <div class="mxuip-card-label">Влияние на итоговый Bias</div>
                    <div class="mxuip-card-text">${this._escape(pattern.impact || '—')}</div>
                </div>
                <div class="mxuip-card-section">
                    <div class="mxuip-card-label">Почему это важно при принятии решения</div>
                    <div class="mxuip-card-text">${this._escape(pattern.importance || '—')}</div>
                </div>
            `;

            cardEl.style.display = 'block';
            this.cardExpanded = true;
        }

        _getDetectionReason(pattern) {
            // Логика объяснения, почему Module X обнаружил паттерн
            const type = pattern.type;
            const price = this._formatPrice(pattern.price);
            switch (type) {
                case 'HH':
                    return `Новый максимум на уровне ${price} превысил предыдущий свинг-хай. Подтверждение силы покупателей.`;
                case 'HL':
                    return `Минимум отката на ${price} оказался выше предыдущего свинг-лоя. Покупатели защищают уровень.`;
                case 'LH':
                    return `Максимум на ${price} не смог превысить предыдущий свинг-хай. Покупатели теряют силу.`;
                case 'LL':
                    return `Минимум на ${price} пробил предыдущий свинг-лой. Продавцы доминируют.`;
                case 'BOS':
                    return `Цена пробила значимый уровень (${price}) с подтверждённым импульсом. Структура рынка подтверждает тренд.`;
                case 'CHoCH':
                    return `Первый пробой структуры в противоположном направлении. Характер движения изменился с ${pattern.bullish ? 'бычьего на медвежий' : 'медвежьего на бычий'}.`;
                case 'MSS':
                    return `Сдвиг структуры после смены характера. Подтверждение нового тренда.`;
                case 'OB':
                    return `Последняя противоположная свеча перед сильным импульсом. Сформирован ${pattern.bullish ? 'бычий' : 'медвежий'} Order Block в зоне ${price}.`;
                case 'FVG':
                    return `Обнаружен разрыв (Fair Value Gap) между тремя свечами. Зона ${price} — вероятная цель для возврата цены.`;
                case 'LiquiditySweep':
                    return `Цена кратковременно пробила уровень ${price} (собрала стопы) и вернулась. Ловушка для розницы.`;
                case 'EqualHighs':
                case 'EqualLows':
                    return `Несколько экстремумов на одном уровне ${price} формируют зону скопления ликвидности.`;
                case 'Displacement':
                    return `Обнаружено импульсное движение с крупными свечами на уровне ${price}. Сильный сигнал продолжения.`;
                default:
                    return pattern.description || 'Обнаружен на основе технического анализа';
            }
        }

        _getConfidence(pattern) {
            // Эвристика: процент уверенности на основе типа паттерна
            const confidenceMap = {
                BOS: 90,
                CHoCH: 85,
                MSS: 85,
                OB: 75,
                FVG: 80,
                LiquiditySweep: 80,
                HH: 70,
                HL: 70,
                LH: 70,
                LL: 70,
                EqualHighs: 65,
                EqualLows: 65,
                Displacement: 75
            };
            return confidenceMap[pattern.type] || 60;
        }

        _getConfidenceLabel(pattern) {
            const conf = this._getConfidence(pattern);
            if (conf >= 85) return 'Очень сильный';
            if (conf >= 75) return 'Сильный';
            if (conf >= 65) return 'Умеренный';
            return 'Слабый';
        }

        // ============================================================
        // СОБЫТИЯ
        // ============================================================

        _bindEvents() {
            // Mode buttons
            this.container.querySelectorAll('.mxuip-mode-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.setMode(btn.getAttribute('data-mode'));
                });
            });

            // Custom checkboxes
            this.container.querySelectorAll('.mxuip-custom-options input[type="checkbox"]').forEach(cb => {
                cb.addEventListener('change', () => {
                    this.setCustomCategory(cb.getAttribute('data-cat'), cb.checked);
                });
            });

            // Collapse button
            const collapseBtn = this.container.querySelector('.mxuip-collapse-btn');
            if (collapseBtn) {
                collapseBtn.addEventListener('click', () => this._toggleCollapse());
            }

            // Card close
            const cardClose = this.container.querySelector('.mxuip-card-close');
            if (cardClose) {
                cardClose.addEventListener('click', () => {
                    const card = this.container.querySelector('.mxuip-card');
                    if (card) card.style.display = 'none';
                    this.cardExpanded = false;
                    this._clearSelection();
                });
            }
        }

        _selectPattern(id) {
            this.selectedPatternId = id;
            // Подсветить на графике
            if (this.renderer) {
                this.renderer.highlight(id);
            }
            // Обновить визуальный выбор
            this.container.querySelectorAll('.mxuip-pattern-item').forEach(el => {
                el.classList.toggle('selected', el.getAttribute('data-id') === id);
            });
            // Показать карточку
            const pattern = this.patterns.find(p => p.id === id);
            if (pattern) this._renderCard(pattern);
            // Callback
            this.onPatternClick(pattern, id);
        }

        _clearSelection() {
            this.selectedPatternId = null;
            this.container.querySelectorAll('.mxuip-pattern-item.selected').forEach(el => {
                el.classList.remove('selected');
            });
        }

        _toggleCollapse() {
            this.expanded = !this.expanded;
            const root = this.container.querySelector('.mxuip-root');
            if (root) {
                root.classList.toggle('collapsed', !this.expanded);
            }
        }

        _updateModeUI() {
            // Активировать кнопку
            this.container.querySelectorAll('.mxuip-mode-btn').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-mode') === this.mode);
            });
            // Показать/скрыть custom options
            const customOpts = this.container.querySelector('.mxuip-custom-options');
            if (customOpts) {
                customOpts.style.display = this.mode === 'custom' ? 'flex' : 'none';
            }
        }

        _updateCustomUI() {
            this.container.querySelectorAll('.mxuip-custom-options input[type="checkbox"]').forEach(cb => {
                cb.checked = this.customCategories[cb.getAttribute('data-cat')];
            });
        }

        // ============================================================
        // СТИЛИ (инжект)
        // ============================================================

        _injectStyles() {
            if (document.getElementById('mxuip-styles')) return;
            const style = document.createElement('style');
            style.id = 'mxuip-styles';
            style.textContent = `
                .mxuip-root {
                    background: #14141c;
                    border: 1px solid rgba(212, 175, 55, 0.25);
                    border-radius: 12px;
                    color: #e5e5e5;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                    font-size: 13px;
                    overflow: hidden;
                }
                .mxuip-root.collapsed .mxuip-modes,
                .mxuip-root.collapsed .mxuip-custom-options,
                .mxuip-root.collapsed .mxuip-patterns { display: none; }

                .mxuip-header {
                    padding: 12px 14px;
                    background: linear-gradient(135deg, rgba(212,175,55,0.12), rgba(212,175,55,0.04));
                    border-bottom: 1px solid rgba(212,175,55,0.2);
                }
                .mxuip-title {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-weight: 600;
                    font-size: 14px;
                    color: #fff;
                }
                .mxuip-title-icon { font-size: 16px; }
                .mxuip-collapse-btn {
                    margin-left: auto;
                    background: transparent;
                    border: 1px solid rgba(255,255,255,0.15);
                    color: #e5e5e5;
                    border-radius: 6px;
                    padding: 2px 8px;
                    cursor: pointer;
                    font-size: 12px;
                }
                .mxuip-collapse-btn:hover { background: rgba(255,255,255,0.08); }
                .mxuip-subtitle {
                    font-size: 11px;
                    color: #8b8b96;
                    margin-top: 4px;
                }

                .mxuip-modes {
                    display: flex;
                    gap: 4px;
                    padding: 10px;
                    border-bottom: 1px solid rgba(255,255,255,0.06);
                }
                .mxuip-mode-btn {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 4px;
                    background: rgba(255,255,255,0.04);
                    border: 1px solid rgba(255,255,255,0.08);
                    color: #c8c8d0;
                    padding: 6px 8px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 12px;
                    transition: all 0.15s;
                }
                .mxuip-mode-btn:hover {
                    background: rgba(255,255,255,0.08);
                    color: #fff;
                }
                .mxuip-mode-btn.active {
                    background: rgba(212,175,55,0.18);
                    border-color: rgba(212,175,55,0.5);
                    color: #d4af37;
                }

                .mxuip-custom-options {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    padding: 10px;
                    background: rgba(0,0,0,0.2);
                    border-bottom: 1px solid rgba(255,255,255,0.06);
                }
                .mxuip-checkbox {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    cursor: pointer;
                    padding: 3px 4px;
                    font-size: 12px;
                    color: #c8c8d0;
                }
                .mxuip-checkbox:hover { color: #fff; }
                .mxuip-checkbox input { cursor: pointer; }

                .mxuip-patterns {
                    max-height: 380px;
                    overflow-y: auto;
                }
                .mxuip-patterns-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 12px;
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                    color: #8b8b96;
                    background: rgba(0,0,0,0.15);
                }
                .mxuip-patterns-count {
                    background: rgba(212,175,55,0.18);
                    color: #d4af37;
                    padding: 1px 8px;
                    border-radius: 8px;
                    font-weight: 600;
                }
                .mxuip-patterns-list {
                    padding: 6px;
                }
                .mxuip-empty {
                    padding: 20px;
                    text-align: center;
                    color: #5b5b66;
                    font-size: 12px;
                    font-style: italic;
                }
                .mxuip-cat-group { margin-bottom: 8px; }
                .mxuip-cat-label {
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    color: #8b8b96;
                    padding: 4px 8px;
                    font-weight: 600;
                }
                .mxuip-pattern-item {
                    background: rgba(255,255,255,0.02);
                    border: 1px solid rgba(255,255,255,0.05);
                    border-left-width: 3px;
                    border-radius: 6px;
                    padding: 6px 8px;
                    margin-bottom: 3px;
                    cursor: pointer;
                    transition: all 0.15s;
                }
                .mxuip-pattern-item:hover {
                    background: rgba(255,255,255,0.06);
                    border-color: rgba(255,255,255,0.15);
                }
                .mxuip-pattern-item.bullish { border-left-color: #26a69a; }
                .mxuip-pattern-item.bearish { border-left-color: #ef5350; }
                .mxuip-pattern-item.selected {
                    background: rgba(212,175,55,0.12);
                    border-color: rgba(212,175,55,0.4);
                }
                .mxuip-pattern-name {
                    font-weight: 600;
                    color: #fff;
                    font-size: 12px;
                }
                .mxuip-pattern-meta {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    margin-top: 2px;
                    font-size: 11px;
                }
                .mxuip-pattern-price {
                    color: #d4af37;
                    font-family: 'JetBrains Mono', monospace;
                    font-weight: 600;
                }
                .mxuip-pattern-desc {
                    color: #8b8b96;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                /* CARD */
                .mxuip-card {
                    position: fixed;
                    top: 80px;
                    right: 20px;
                    width: 360px;
                    max-height: calc(100vh - 100px);
                    background: #1a1a24;
                    border: 1px solid rgba(212,175,55,0.4);
                    border-radius: 12px;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
                    z-index: 9999;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
                }
                .mxuip-card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px 16px;
                    background: linear-gradient(135deg, rgba(212,175,55,0.12), rgba(212,175,55,0.04));
                    border-bottom: 1px solid rgba(212,175,55,0.2);
                }
                .mxuip-card-title {
                    font-weight: 600;
                    color: #fff;
                    font-size: 14px;
                }
                .mxuip-card-close {
                    background: transparent;
                    border: 1px solid rgba(255,255,255,0.15);
                    color: #e5e5e5;
                    border-radius: 6px;
                    padding: 2px 8px;
                    cursor: pointer;
                }
                .mxuip-card-close:hover { background: rgba(255,255,255,0.08); }
                .mxuip-card-body {
                    padding: 14px 16px;
                    overflow-y: auto;
                    flex: 1;
                }
                .mxuip-card-cat {
                    display: inline-block;
                    font-size: 11px;
                    padding: 2px 8px;
                    border-radius: 6px;
                    margin-bottom: 8px;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                    font-weight: 600;
                }
                .mxuip-card-cat.bullish { background: rgba(38,166,154,0.2); color: #26a69a; }
                .mxuip-card-cat.bearish { background: rgba(239,83,80,0.2); color: #ef5350; }
                .mxuip-card-cat.neutral { background: rgba(212,175,55,0.2); color: #d4af37; }
                .mxuip-card-h3 {
                    color: #fff;
                    font-size: 16px;
                    margin: 0 0 12px 0;
                    font-weight: 600;
                }
                .mxuip-card-section {
                    margin-bottom: 12px;
                }
                .mxuip-card-label {
                    font-size: 11px;
                    text-transform: uppercase;
                    color: #d4af37;
                    font-weight: 600;
                    margin-bottom: 4px;
                    letter-spacing: 0.05em;
                }
                .mxuip-card-text {
                    color: #c8c8d0;
                    font-size: 13px;
                    line-height: 1.5;
                }
                .mxuip-confidence-bar {
                    height: 8px;
                    background: rgba(255,255,255,0.08);
                    border-radius: 4px;
                    overflow: hidden;
                    margin-bottom: 4px;
                }
                .mxuip-confidence-fill {
                    height: 100%;
                    transition: width 0.3s;
                }
                .mxuip-confidence-fill, .mxuip-confidence-bar.bullish .mxuip-confidence-fill { background: linear-gradient(90deg, #26a69a, #2dd4bf); }
                .mxuip-confidence-bar.bearish .mxuip-confidence-fill { background: linear-gradient(90deg, #ef5350, #f87171); }
                .mxuip-confidence-bar.neutral .mxuip-confidence-fill { background: linear-gradient(90deg, #d4af37, #fbbf24); }
                .mxuip-confidence-text {
                    font-size: 11px;
                    color: #8b8b96;
                }
            `;
            document.head.appendChild(style);
        }

        // ============================================================
        // УТИЛИТЫ
        // ============================================================

        _escape(s) {
            if (s === null || s === undefined) return '';
            return String(s)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        _formatPrice(price) {
            if (price === null || price === undefined || isNaN(price)) return '—';
            if (price >= 1000) return price.toFixed(2);
            if (price >= 1) return price.toFixed(4);
            return price.toFixed(6);
        }
    }

    ModuleXUIPanel.MODE_LABELS = MODE_LABELS;
    ModuleXUIPanel.CATEGORY_LABELS = CATEGORY_LABELS;

    global.ModuleXUIPanel = ModuleXUIPanel;

})(typeof window !== 'undefined' ? window : globalThis);
