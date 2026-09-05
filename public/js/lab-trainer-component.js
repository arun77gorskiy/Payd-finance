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
    // MODULE CONFIGS — конфигурации учебных программ для вкладки "Modules"
    // ================================================================
    //
    // Каждый модуль = специализированный учебный режим одного и того же
    // Trading Terminal. Модуль подменяет глобальный TrainerScenarios.SCENARIOS
    // на ОТФИЛЬТРОВАННЫЙ набор сценариев по своей теме + задаёт подсказки UI.
    //
    // Темы модулей (синхронизированы с MODULE_META в index.html):
    //   0 = Module 1 «Почему уровень сам по себе ничего не значит»
    //   1 = Module 2 «Подтверждение входа (BOS / CHOCH)»
    //   2 = Module 3 «Рыночный контекст»
    //   3 = Module 4 «Управление риском»
    //
    // Фильтрация: каждый сценарий в ScenarioLibrary имеет `category` —
    // одна из 7 категорий. Мы используем её для группировки:
    //   - price-action (25)    — реакции цены на уровни
    //   - smart-money (25)     — BOS, CHoCH, OB, FVG
    //   - market-structure (20) — структура, тренд, пробои
    //   - liquidity (20)       — снятие ликвидности
    //   - volume (20)          — объём, моментум
    //   - risk-management (20) — SL, TP, R/R
    //   - psychology (10)      — no-trade, когнитивные искажения

    const MODULE_CONFIGS = {
        // ──────────────────────────────────────────────────────────
        // MODULE 1 — «Почему уровень сам по себе ничего не значит»
        // ──────────────────────────────────────────────────────────
        // Учит видеть: уровни, реакцию цены на уровень, ложные пробои,
        // отсутствие подтверждения. Категории: price-action + market-structure.
        0: {
            title: 'Уровень сам по себе — не сигнал',
            subtitle: 'Реакция цены важнее самого уровня',
            focus: 'Поддержка · Сопротивление · Реакция цены',
            learningPath: 'Уровень → Реакция → Подтверждение',
            categoryFilter: function (s) {
                return s && (s.category === 'price-action' || s.category === 'market-structure');
            },
            introBanner: '🎯 Module 1 · Уровень — это ориентир, а не сигнал. Учись видеть реакцию цены.',
            hintPrimary: 'Перед входом — определи реакцию цены на уровень.',
            hintSecondary: 'Касание уровня ≠ сигнал. Жди: ложный пробой, поглощение, пин-бар, доджи.',
            color: '#10b981'
        },

        // ──────────────────────────────────────────────────────────
        // MODULE 2 — «Подтверждение входа (BOS / CHOCH)»
        // ──────────────────────────────────────────────────────────
        // Учит ждать подтверждения: BOS, CHoCH, OB, FVG, Liquidity Sweep.
        // Категория: smart-money.
        1: {
            title: 'Подтверждение входа',
            subtitle: 'BOS · CHoCH · OB · FVG · Liquidity Sweep',
            focus: 'Никогда не входить без подтверждения',
            learningPath: 'Структура → Подтверждение → Точка входа',
            categoryFilter: function (s) {
                return s && s.category === 'smart-money';
            },
            introBanner: '✓ Module 2 · Структура + подтверждение = вход. Иначе — ждать.',
            hintPrimary: 'Структура → подтверждение → вход. Только в таком порядке.',
            hintSecondary: 'Ищи BOS/CHoCH + Order Block/FVG + реакцию цены. Без подтверждения — жди.',
            color: '#3b82f6'
        },

        // ──────────────────────────────────────────────────────────
        // MODULE 3 — «Рыночный контекст»
        // ──────────────────────────────────────────────────────────
        // Учит читать рынок: тренд, объём, моментум, фаза рынка.
        // Категории: market-structure + volume + psychology.
        2: {
            title: 'Рыночный контекст',
            subtitle: 'Тренд · Объём · Моментум · Фаза рынка',
            focus: 'Сначала контекст, потом сделка',
            learningPath: 'Тренд → Объём → Фаза → Решение',
            categoryFilter: function (s) {
                return s && (s.category === 'volume' || s.category === 'market-structure' || s.category === 'psychology');
            },
            introBanner: '🌊 Module 3 · Сначала прочитай контекст — потом ищи сделку.',
            hintPrimary: 'Тренд, объём, фаза. Входить только в свою сторону.',
            hintSecondary: 'Нет тренда — нет сделки. Нет объёма — нет подтверждения. Сомневаешься — не входи.',
            color: '#f59e0b'
        },

        // ──────────────────────────────────────────────────────────
        // MODULE 4 — «Управление риском»
        // ──────────────────────────────────────────────────────────
        // Учит не входить в плохие сделки: SL, TP, R/R, Liquidity Sweep,
        // invalid setup, причины отказаться от сделки.
        // Категории: liquidity + risk-management.
        3: {
            title: 'Управление риском',
            subtitle: 'SL · TP · R/R · Liquidity Sweep · Invalid Setup',
            focus: 'Научиться НЕ входить в плохие сделки',
            learningPath: 'Liquidity → SL → R/R → Решение',
            categoryFilter: function (s) {
                return s && (s.category === 'liquidity' || s.category === 'risk-management');
            },
            introBanner: '🛡 Module 4 · Главный навык — вовремя отказаться от сделки.',
            hintPrimary: 'Каждая сделка — риск. Сначала SL, потом R/R, потом вход.',
            hintSecondary: 'Liquidity Sweep + нет R:R ≥ 1:2 = не входить. No Trade — это решение.',
            color: '#f43f5e'
        }
    };

    // Оригинальный массив сценариев (копия) — для восстановления после модуля.
    let _originalScenarios = null;

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
            console.log('[LabTrainer] mount() ВХОД, containerId=' + containerId);

            // ════════════════════════════════════════════════════════════════════
            // ПРОСТОЙ И НАДЁЖНЫЙ LIFECYCLE (Error #2 fix):
            // Каждый вызов mount() = полная переинициализация.
            // Перед инициализацией гарантированно уничтожаем старый chart
            // (если он был), чтобы не было "orphaned canvas".
            // Это устраняет проблему с переключением модулей:
            // view.innerHTML='' в index.html уничтожает контейнер,
            // а наш mount() сразу создаёт новый chart в новом контейнере.
            // ════════════════════════════════════════════════════════════════════
            const container = typeof containerId === 'string'
                ? document.getElementById(containerId)
                : containerId;
            if (!container) {
                console.error('[LabTrainer] Container not found:', containerId);
                return;
            }

            // 1. Полная очистка предыдущего состояния
            this._disposeChart();
            this.container = null;
            this._elements = {};
            this.mounted = false;
            this.trainer = null;
            this.moduleXRenderer = null;
            console.log('[LabTrainer] mount() STEP 1 done');

            // 2. Устанавливаем новый контейнер
            this.container = container;
            console.log('[LabTrainer] mount() STEP 2 done, container=' + (container ? container.id : 'null'));

            // 3. Загружаем LWC если ещё не загружен
            try {
                console.log('[LabTrainer] mount() STEP 3a: about to await ensureLightweightCharts()');
                await ensureLightweightCharts();
                console.log('[LabTrainer] mount() STEP 3b: ensureLightweightCharts() resolved');
            } catch (err) {
                console.error('[LabTrainer] Lightweight Charts load failed:', err);
                container.innerHTML = `
                    <div style="padding:24px;color:#ef5350;background:#1a1a20;border:1px solid rgba(239,83,80,0.3);border-radius:12px;">
                        <h3 style="margin-bottom:8px;">Ошибка загрузки графика</h3>
                        <p style="color:#c8c8d0;font-size:13px;">${escapeHtml(err.message)}</p>
                    </div>`;
                return;
            }

            if (!global.PAYDTrainer) {
                console.error('[LabTrainer] PAYDTrainer не загружен');
                container.innerHTML = `<div>Trainer не загружен</div>`;
                return;
            }
            if (!global.TrainerScenarios || !global.TrainerScenarios.SCENARIOS) {
                console.error('[LabTrainer] TrainerScenarios не загружен');
                container.innerHTML = `<div>TrainerScenarios не загружен</div>`;
                return;
            }
            console.log('[LabTrainer] mount() STEP 3 done');

            // 4. Инициализация UI и графика
            console.log('[LabTrainer] mount() STEP 4a: _renderShell()');
            this._renderShell();
            console.log('[LabTrainer] mount() STEP 4b: _initChart()');
            this._initChart();
            console.log('[LabTrainer] mount() STEP 4c: _initTerminal()');
            this._initTerminal();
            console.log('[LabTrainer] mount() STEP 4d: _bindUIEvents()');
            this._bindUIEvents();
            console.log('[LabTrainer] mount() STEP 4e: _bindKeyboard()');
            this._bindKeyboard();
            console.log('[LabTrainer] mount() STEP 4f: _initModuleXUI()');
            this._initModuleXUI();
            console.log('[LabTrainer] mount() STEP 4 done');

            // 5. Создаём PAYDTrainer
            this.trainer = new global.PAYDTrainer({ ui: this._buildUIHooks() });

            this.mounted = true;
            console.log('[LabTrainer] mount() ЗАВЕРШЕН, mounted=true');
        }

        async start(moduleIndex) {
            // ════════════════════════════════════════════════════════════════════
            // MODULE-AWARE START
            // Параметр moduleIndex (0..3) определяет, в каком учебном режиме
            // работает терминал.
            // ════════════════════════════════════════════════════════════════════
            const idx = (typeof moduleIndex === 'number' && moduleIndex >= 0 && moduleIndex <= 3)
                ? moduleIndex
                : 0;
            console.log('[LabTrainer] start() ВХОД, moduleIndex=' + idx + ', mounted=' + this.mounted);

            // ВАЖНО: start() может быть вызван ДО завершения mount() (index.html
            // не использует await). Дожидаемся mounted=true с таймаутом.
            if (!this.mounted) {
                const waitStart = Date.now();
                while (!this.mounted && (Date.now() - waitStart) < 5000) {
                    await new Promise(r => setTimeout(r, 50));
                }
                if (!this.mounted) {
                    console.warn('[LabTrainer] start() — mount не завершился за 5с, выход');
                    return;
                }
            }

            this.activeModule = idx;

            // 1. Применяем модуль-специфичный конфиг (фильтр сценариев + UI-подсказки).
            const moduleConfig = this._applyModuleConfig(idx);
            console.log('[LabTrainer] start() модуль применён: ' + moduleConfig.title);

            // 2. Сбрасываем trainer на начало отфильтрованного списка.
            this.trainer.scenarioIndex = 0;

            // 3. Обновляем информационную панель.
            const totalScenarios = this.trainer.scenarios.length;
            this._updateInfoPanel(0, totalScenarios);

            // 4. Обновляем top-bar: показываем текущий модуль.
            this._updateModuleBanner(moduleConfig);

            // 5. Запускаем trainer (он загрузит сценарий и вызовет _renderChart)
            try {
                await this.trainer.start();
                console.log('[LabTrainer] start() OK, scenario loaded');
            } catch (err) {
                console.error('[LabTrainer] start() ошибка trainer.start():', err && err.message);
                throw err;
            }
        }

        // ============================================================
        // MODULE CONFIG — подмена сценариев + UI-подсказки
        // ============================================================

        /**
         * Применить конфиг модуля:
         *   - подменить global.TrainerScenarios.SCENARIOS на ОТФИЛЬТРОВАННЫЙ набор
         *   - вернуть объект moduleConfig для дальнейшего использования в UI
         *
         * Сохраняет оригинальный массив только ОДИН раз (lazy init).
         */
        _applyModuleConfig(moduleIndex) {
            const cfg = MODULE_CONFIGS[moduleIndex];
            if (!cfg) {
                console.warn('[LabTrainer] неизвестный moduleIndex=' + moduleIndex + ', используем Module 1');
                return this._applyModuleConfig(0);
            }

            // Lazy init: сохраняем оригинальный массив (копию) при первом вызове.
            if (_originalScenarios === null && global.TrainerScenarios && Array.isArray(global.TrainerScenarios.SCENARIOS)) {
                _originalScenarios = global.TrainerScenarios.SCENARIOS.slice();
                console.log('[LabTrainer] _originalScenarios сохранён, всего=' + _originalScenarios.length);
            }

            // Фильтруем сценарии по теме модуля.
            const filtered = _originalScenarios
                ? _originalScenarios.filter(cfg.categoryFilter)
                : [];

            console.log('[LabTrainer] Module ' + (moduleIndex + 1) + ': ' + filtered.length + ' сценариев отобрано из ' + (_originalScenarios ? _originalScenarios.length : 0));

            // Подменяем глобальный массив. Trainer.scenarios (getter) будет
            // динамически читать обновлённый SCENARIOS при каждом обращении.
            if (global.TrainerScenarios) {
                global.TrainerScenarios.SCENARIOS = filtered;
            }

            return cfg;
        }

        /**
         * Восстановить оригинальный набор сценариев (вызывается при back/reset).
         */
        _restoreOriginalScenarios() {
            if (_originalScenarios && global.TrainerScenarios) {
                global.TrainerScenarios.SCENARIOS = _originalScenarios;
                console.log('[LabTrainer] _restoreOriginalScenarios: восстановлено ' + _originalScenarios.length + ' сценариев');
            }
        }

        /**
         * Обновить top-bar терминала: показать активный модуль и его фокус.
         * Это визуальный якорь, чтобы пользователь всегда понимал,
         * в каком учебном режиме он находится.
         *
         * ВАЖНО: НЕ трогаем lt-hint-slot — он управляется _renderHintsPanel()
         * (стандартные подсказки тренажёра). Модульный фокус рендерим
         * в top-bar и в специальный элемент #lt-module-focus, чтобы
         * избежать конфликта с существующей логикой.
         */
        _updateModuleBanner(moduleConfig) {
            if (!moduleConfig) return;
            const E = this._elements;

            // 1. Subtitle в header: показываем название модуля.
            if (E.scenarioDesc) {
                E.scenarioDesc.textContent = moduleConfig.introBanner || moduleConfig.subtitle;
                E.scenarioDesc.style.color = moduleConfig.color || '#c8c8d0';
                E.scenarioDesc.style.fontWeight = '600';
            }

            // 2. Специальный модульный фокус-блок (вставка под scenario title).
            this._renderModuleFocusBlock(moduleConfig);
        }

        /**
         * Рендер модульного фокус-блока: вставляется в sidebar
         * как первый дочерний элемент, выше hint-slot.
         * Защищён ID 'lt-module-focus', поэтому при повторных вызовах
         * пересоздаётся корректно без дублирования.
         */
        _renderModuleFocusBlock(moduleConfig) {
            const sidebar = this._elements && this._elements.sidebar
                ? this._elements.sidebar
                : document.getElementById('lt-sidebar');
            if (!sidebar) return;

            // Удаляем предыдущий блок, если он есть.
            const existing = document.getElementById('lt-module-focus');
            if (existing) existing.remove();

            // Создаём новый блок.
            const block = document.createElement('div');
            block.id = 'lt-module-focus';
            block.style.cssText = 'margin-bottom: 4px;';
            block.innerHTML = `
                <div style="
                    background: ${moduleConfig.color}11;
                    border: 1px solid ${moduleConfig.color}44;
                    border-radius: 10px;
                    padding: 12px 14px;
                ">
                    <div style="
                        display: flex; align-items: center; gap: 6px;
                        font-size: 10px; font-weight: 700; color: ${moduleConfig.color};
                        text-transform: uppercase; letter-spacing: 0.06em;
                        margin-bottom: 6px;
                    ">
                        <span style="
                            display:inline-block;width:6px;height:6px;
                            background:${moduleConfig.color};border-radius:50%;
                        "></span>
                        <span>${escapeHtml(moduleConfig.title)}</span>
                    </div>
                    <div style="
                        font-size: 13px; color: #fff; font-weight: 600;
                        margin-bottom: 6px; line-height: 1.4;
                    ">${escapeHtml(moduleConfig.hintPrimary)}</div>
                    <div style="
                        font-size: 11px; color: #8b8b96; line-height: 1.5;
                    ">${escapeHtml(moduleConfig.hintSecondary)}</div>
                    <div style="
                        margin-top: 8px; padding-top: 8px;
                        border-top: 1px solid ${moduleConfig.color}22;
                        font-size: 10px; color: #8b8b96;
                        text-transform: uppercase; letter-spacing: 0.05em;
                        font-family: 'JetBrains Mono', monospace;
                    ">📍 ${escapeHtml(moduleConfig.learningPath)}</div>
                </div>
            `;

            // Вставляем ПЕРВЫМ элементом в sidebar.
            if (sidebar.firstChild) {
                sidebar.insertBefore(block, sidebar.firstChild);
            } else {
                sidebar.appendChild(block);
            }
        }

        async next() {
            if (!this.mounted || !this.trainer) {
                console.warn('[LabTrainer] next() — не mounted или нет trainer');
                return;
            }
            const totalScenarios = this.trainer && this.trainer.scenarios
                ? this.trainer.scenarios.length
                : (global.TrainerScenarios && global.TrainerScenarios.SCENARIOS.length) || 0;
            try {
                await this.trainer.next();
            } catch (err) {
                console.error('[LabTrainer] next() ошибка:', err && err.message);
                throw err;
            }
            this._updateInfoPanel(this.trainer.scenarioIndex, totalScenarios);
        }

        back() {
            console.log('[LabTrainer] back()');
            this._hideResultScreen();
            this._resetDecisionPanel();
            this.terminal && this.terminal.clearPosition();
            this.terminal && this.terminal.clearDrawings();
            this.terminal && this.terminal.clearRecommended();
            this.selectedDecision = null;
            this.isAnalyzing = false;
            this._restoreOriginalScenarios();
            this.activeModule = null;
            // Сбрасываем флаги, чтобы следующий mount() выполнил полную инициализацию
            this.mounted = false;
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
            // Восстанавливаем оригинальный набор сценариев при выходе из модуля.
            // Это вызывается из showModuleCards() → пользователь вернулся
            // к карточкам модулей, режим обучения сброшен.
            this._restoreOriginalScenarios();
            this.activeModule = null;
            // Удаляем модульный focus-блок, если он остался в DOM.
            const focusBlock = document.getElementById('lt-module-focus');
            if (focusBlock) focusBlock.remove();
        }

        destroy() {
            this._disposeChart();
            if (this.container) this.container.innerHTML = '';
            this.mounted = false;
            this._mountPromise = null;
        }

        /**
         * Корректно уничтожить chart и все связанные с ним ресурсы:
         *  - отписаться от wheel/resize/keydown обработчиков
         *  - вызвать chart.remove() (LWC освобождает canvas/listeners)
         *  - обнулить ссылки на chart/series
         *
         * Используется в двух сценариях:
         *  1) destroy() — полный teardown компонента
         *  2) _initChart() — когда старый chart ссылается на отсоединённый canvas
         *     (например, после view.innerHTML = '' при переключении модулей)
         */
        _disposeChart() {
            // Отписка от wheel handler (кастомный плавный zoom).
            if (this._wheelHandler && this._elements && this._elements.chartCanvas) {
                try { this._elements.chartCanvas.removeEventListener('wheel', this._wheelHandler); } catch (e) {}
            }
            this._wheelHandler = null;

            if (this._resizeHandler) {
                try { window.removeEventListener('resize', this._resizeHandler); } catch (e) {}
            }
            this._resizeHandler = null;

            if (this._escHandler) {
                try { document.removeEventListener('keydown', this._escHandler); } catch (e) {}
            }
            this._escHandler = null;

            if (this._hotkeyHandler) {
                try { document.removeEventListener('keydown', this._hotkeyHandler); } catch (e) {}
            }
            this._hotkeyHandler = null;

            if (this._rangeGuardHandler && this.chart && this.chart.timeScale) {
                try { this.chart.timeScale().unsubscribeVisibleTimeRangeChange(this._rangeGuardHandler); } catch (e) {}
            }
            this._rangeGuardHandler = null;

            if (this._hudUpdateTimer) {
                clearTimeout(this._hudUpdateTimer);
                this._hudUpdateTimer = null;
            }

            if (this.terminal && typeof this.terminal.destroy === 'function') {
                try { this.terminal.destroy(); } catch (e) {}
            }
            try {
                if (this.chart && this.chart.remove) this.chart.remove();
            } catch (e) { /* noop */ }
            this.chart = null;
            this.candleSeries = null;
            this.volumeSeries = null;
            this.terminal = null;
            this.moduleXRenderer = null;
            this._chartUid = null;
            this._candleSeriesUid = null;
            this._volumeSeriesUid = null;
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
                z-index:30;
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

<!-- RESULT PANEL — INLINE (не модальное окно).
     Появляется непосредственно под Trading Terminal после подтверждения решения.
     Содержит детальный вердикт и кнопки навигации. -->
<div id="lt-result-screen" style="
    display:none;
    margin:14px 0 0 0;
    background:#121216;
    border:1px solid rgba(255,255,255,0.08);
    border-radius:14px;
    overflow:hidden;
    animation:lt-fadeIn 0.3s ease;
">
    <div class="lt-result-modal" style="
        background:#121216;
        display:flex;
        flex-direction:column;
        overflow:hidden;
    ">
        <!-- HEADER: краткий вердикт -->
        <div id="lt-result-header" style="
            padding:22px 26px;
            border-bottom:1px solid rgba(255,255,255,0.08);
            display:flex;
            justify-content:space-between;
            align-items:flex-start;
            flex-shrink:0;
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

        <!-- TABS — каждый таб = один модуль со своей уникальной визуальной подачей -->
        <div id="lt-result-tabs" style="
            display:flex;
            gap:4px;
            padding:0 18px;
            background:#0e0e12;
            border-bottom:1px solid rgba(255,255,255,0.06);
            overflow-x:auto;
            flex-shrink:0;
        ">
            <button class="lt-result-tab" data-module="x" style="
                background:transparent;
                border:none;
                color:#c8c8d0;
                padding:14px 16px 12px;
                cursor:pointer;
                font-family:inherit;
                font-size:13px;
                font-weight:600;
                border-bottom:2px solid transparent;
                display:flex;
                flex-direction:column;
                align-items:flex-start;
                gap:2px;
                min-width:0;
                white-space:nowrap;
                transition:all 0.15s;
            ">
                <span style="display:flex;align-items:center;gap:6px;font-size:13px;">
                    <span style="font-size:14px;">📊</span> Module X
                </span>
                <span class="lt-result-tab-sub" style="font-size:10px;font-weight:500;color:#8b8b96;text-transform:uppercase;letter-spacing:0.05em;">Что видит рынок</span>
            </button>
            <button class="lt-result-tab" data-module="1" style="
                background:transparent;
                border:none;
                color:#c8c8d0;
                padding:14px 16px 12px;
                cursor:pointer;
                font-family:inherit;
                font-size:13px;
                font-weight:600;
                border-bottom:2px solid transparent;
                display:flex;
                flex-direction:column;
                align-items:flex-start;
                gap:2px;
                min-width:0;
                white-space:nowrap;
                transition:all 0.15s;
            ">
                <span style="display:flex;align-items:center;gap:6px;font-size:13px;">
                    <span style="font-size:14px;">📖</span> Module 1
                </span>
                <span class="lt-result-tab-sub" style="font-size:10px;font-weight:500;color:#8b8b96;text-transform:uppercase;letter-spacing:0.05em;">Почему сигнал</span>
            </button>
            <button class="lt-result-tab" data-module="2" style="
                background:transparent;
                border:none;
                color:#c8c8d0;
                padding:14px 16px 12px;
                cursor:pointer;
                font-family:inherit;
                font-size:13px;
                font-weight:600;
                border-bottom:2px solid transparent;
                display:flex;
                flex-direction:column;
                align-items:flex-start;
                gap:2px;
                min-width:0;
                white-space:nowrap;
                transition:all 0.15s;
            ">
                <span style="display:flex;align-items:center;gap:6px;font-size:13px;">
                    <span style="font-size:14px;">✓</span> Module 2
                </span>
                <span class="lt-result-tab-sub" style="font-size:10px;font-weight:500;color:#8b8b96;text-transform:uppercase;letter-spacing:0.05em;">Проверка решения</span>
            </button>
            <button class="lt-result-tab" data-module="3" style="
                background:transparent;
                border:none;
                color:#c8c8d0;
                padding:14px 16px 12px;
                cursor:pointer;
                font-family:inherit;
                font-size:13px;
                font-weight:600;
                border-bottom:2px solid transparent;
                display:flex;
                flex-direction:column;
                align-items:flex-start;
                gap:2px;
                min-width:0;
                white-space:nowrap;
                transition:all 0.15s;
            ">
                <span style="display:flex;align-items:center;gap:6px;font-size:13px;">
                    <span style="font-size:14px;">🎓</span> Module 3
                </span>
                <span class="lt-result-tab-sub" style="font-size:10px;font-weight:500;color:#8b8b96;text-transform:uppercase;letter-spacing:0.05em;">Обучение</span>
            </button>
            <button class="lt-result-tab" data-module="4" style="
                background:transparent;
                border:none;
                color:#c8c8d0;
                padding:14px 16px 12px;
                cursor:pointer;
                font-family:inherit;
                font-size:13px;
                font-weight:600;
                border-bottom:2px solid transparent;
                display:flex;
                flex-direction:column;
                align-items:flex-start;
                gap:2px;
                min-width:0;
                white-space:nowrap;
                transition:all 0.15s;
            ">
                <span style="display:flex;align-items:center;gap:6px;font-size:13px;">
                    <span style="font-size:14px;">📈</span> Module 4
                </span>
                <span class="lt-result-tab-sub" style="font-size:10px;font-weight:500;color:#8b8b96;text-transform:uppercase;letter-spacing:0.05em;">Аналитика</span>
            </button>
        </div>

        <!-- BODY — содержимое таба (разное для каждого модуля) -->
        <div id="lt-result-body" style="
            padding:24px 28px;
            overflow-y:auto;
            flex:1;
            min-height:0;
        "></div>

        <!-- FOOTER -->
        <div style="
            padding:14px 26px 18px;
            border-top:1px solid rgba(255,255,255,0.08);
            display:flex;
            gap:10px;
            justify-content:flex-end;
            background:#121216;
            flex-shrink:0;
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

/* ============================================
   Result Screen — Tabbed Modules Architecture
   ============================================ */

/* Активный таб */
.lt-result-tab.active {
    color: #d4af37 !important;
    border-bottom-color: #d4af37 !important;
    background:linear-gradient(180deg, rgba(212,175,55,0.06) 0%, transparent 100%) !important;
}
.lt-result-tab.active .lt-result-tab-sub {
    color:#d4af37 !important;
}
.lt-result-tab:hover:not(.active) {
    color:#fff !important;
    background:rgba(255,255,255,0.02) !important;
}
.lt-result-tab.skeleton {
    position:relative;
}
.lt-result-tab.skeleton::after {
    content:'СКОРО';
    position:absolute;
    top:6px;
    right:6px;
    font-size:8px;
    font-weight:700;
    padding:1px 4px;
    background:rgba(255,193,7,0.15);
    color:#ffc107;
    border-radius:3px;
    letter-spacing:0.05em;
}

/* Module X — карточки "что видит рынок" */
.lt-modulex-grid {
    display:grid;
    grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));
    gap:10px;
}
.lt-modulex-card {
    background:linear-gradient(180deg, rgba(212,175,55,0.06) 0%, rgba(212,175,55,0.01) 100%);
    border:1px solid rgba(212,175,55,0.18);
    border-radius:10px;
    padding:14px 16px;
    position:relative;
    overflow:hidden;
}
.lt-modulex-card::before {
    content:'';
    position:absolute;
    top:0;left:0;right:0;
    height:2px;
    background:linear-gradient(90deg, transparent, #d4af37, transparent);
    opacity:0.6;
}
.lt-modulex-card .lt-modulex-icon {
    font-size:18px;
    margin-bottom:6px;
}
.lt-modulex-card .lt-modulex-label {
    font-size:10px;
    color:#8b8b96;
    text-transform:uppercase;
    letter-spacing:0.06em;
    font-weight:600;
    margin-bottom:4px;
}
.lt-modulex-card .lt-modulex-value {
    font-size:14px;
    color:#fff;
    font-weight:600;
}
.lt-modulex-card .lt-modulex-value.bull { color:#26a69a; }
.lt-modulex-card .lt-modulex-value.bear { color:#ef5350; }
.lt-modulex-card .lt-modulex-value.neutral { color:#9e9e9e; }
.lt-modulex-card .lt-modulex-value.gold { color:#d4af37; }
.lt-modulex-hero {
    background:linear-gradient(135deg, rgba(212,175,55,0.12) 0%, rgba(38,166,154,0.08) 100%);
    border:1px solid rgba(212,175,55,0.3);
    border-radius:12px;
    padding:20px 24px;
    margin-bottom:18px;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:20px;
    flex-wrap:wrap;
}
.lt-modulex-hero h2 {
    margin:0 0 6px 0;
    font-size:18px;
    color:#fff;
}
.lt-modulex-hero p {
    margin:0;
    font-size:13px;
    color:#c8c8d0;
    max-width:520px;
    line-height:1.5;
}
.lt-modulex-hero .lt-modulex-hero-stat {
    text-align:right;
    flex-shrink:0;
}
.lt-modulex-hero .lt-modulex-hero-stat .num {
    font-size:32px;
    font-weight:700;
    color:#d4af37;
    font-family:'JetBrains Mono',monospace;
    line-height:1;
}
.lt-modulex-hero .lt-modulex-hero-stat .lbl {
    font-size:10px;
    color:#8b8b96;
    text-transform:uppercase;
    letter-spacing:0.06em;
    margin-top:4px;
}

/* Module 1 — guided reading */
.lt-module1-narrative {
    display:flex;
    flex-direction:column;
    gap:14px;
}
.lt-module1-intro {
    background:linear-gradient(135deg, rgba(33,150,243,0.1) 0%, rgba(33,150,243,0.02) 100%);
    border:1px solid rgba(33,150,243,0.25);
    border-radius:12px;
    padding:18px 22px;
    margin-bottom:6px;
}
.lt-module1-intro h2 {
    margin:0 0 8px 0;
    font-size:16px;
    color:#fff;
    display:flex;
    align-items:center;
    gap:8px;
}
.lt-module1-intro p {
    margin:0;
    color:#c8c8d0;
    font-size:13px;
    line-height:1.6;
}
.lt-module1-step {
    display:flex;
    gap:14px;
    background:#1a1a20;
    border:1px solid rgba(255,255,255,0.06);
    border-radius:10px;
    padding:14px 16px;
}
.lt-module1-step .lt-module1-num {
    flex-shrink:0;
    width:32px;
    height:32px;
    border-radius:50%;
    background:rgba(33,150,243,0.15);
    color:#42a5f5;
    display:grid;
    place-items:center;
    font-weight:700;
    font-size:13px;
    font-family:'JetBrains Mono',monospace;
}
.lt-module1-step .lt-module1-content {
    flex:1;
    min-width:0;
}
.lt-module1-step .lt-module1-q {
    font-size:12px;
    color:#8b8b96;
    text-transform:uppercase;
    letter-spacing:0.05em;
    font-weight:600;
    margin-bottom:4px;
}
.lt-module1-step .lt-module1-a {
    font-size:14px;
    color:#fff;
    font-weight:600;
    margin-bottom:6px;
}
.lt-module1-step .lt-module1-detail {
    font-size:12px;
    color:#c8c8d0;
    line-height:1.5;
}
.lt-module1-tag {
    display:inline-block;
    font-size:10px;
    font-weight:600;
    padding:2px 8px;
    border-radius:999px;
    margin-right:4px;
    margin-top:4px;
}
.lt-module1-tag.confirmed { background:rgba(38,166,154,0.15); color:#26a69a; border:1px solid rgba(38,166,154,0.3); }
.lt-module1-tag.weak { background:rgba(255,193,7,0.12); color:#ffc107; border:1px solid rgba(255,193,7,0.3); }
.lt-module1-tag.missing { background:rgba(239,83,80,0.12); color:#ef5350; border:1px solid rgba(239,83,80,0.3); }

/* Module 2 — verdict-centric */
.lt-module2-verdict {
    text-align:center;
    padding:28px 20px;
    border-radius:12px;
    margin-bottom:18px;
}
.lt-module2-verdict.correct {
    background:linear-gradient(135deg, rgba(38,166,154,0.12) 0%, rgba(38,166,154,0.02) 100%);
    border:1px solid rgba(38,166,154,0.3);
}
.lt-module2-verdict.wrong {
    background:linear-gradient(135deg, rgba(239,83,80,0.12) 0%, rgba(239,83,80,0.02) 100%);
    border:1px solid rgba(239,83,80,0.3);
}
.lt-module2-verdict .lt-verdict-mark {
    font-size:64px;
    line-height:1;
    margin-bottom:8px;
}
.lt-module2-verdict.correct .lt-verdict-mark { color:#26a69a; }
.lt-module2-verdict.wrong .lt-verdict-mark { color:#ef5350; }
.lt-module2-verdict .lt-verdict-title {
    font-size:22px;
    font-weight:700;
    color:#fff;
    margin-bottom:6px;
}
.lt-module2-verdict .lt-verdict-sub {
    font-size:13px;
    color:#c8c8d0;
}
.lt-module2-score-row {
    display:grid;
    grid-template-columns:1fr 1fr 1fr;
    gap:10px;
    margin-bottom:18px;
}
.lt-module2-score-cell {
    background:#1a1a20;
    border:1px solid rgba(255,255,255,0.06);
    border-radius:10px;
    padding:14px;
    text-align:center;
}
.lt-module2-score-cell .lbl {
    font-size:10px;
    color:#8b8b96;
    text-transform:uppercase;
    letter-spacing:0.06em;
    font-weight:600;
    margin-bottom:6px;
}
.lt-module2-score-cell .val {
    font-size:22px;
    font-weight:700;
    font-family:'JetBrains Mono',monospace;
    color:#d4af37;
    line-height:1;
}
.lt-module2-evidence-grid {
    display:grid;
    grid-template-columns:1fr 1fr;
    gap:10px;
    margin-bottom:18px;
}
@media (max-width: 700px) {
    .lt-module2-evidence-grid { grid-template-columns:1fr; }
    .lt-module2-score-row { grid-template-columns:1fr 1fr; }
}
.lt-module2-evidence-card {
    background:#1a1a20;
    border:1px solid rgba(255,255,255,0.06);
    border-radius:10px;
    padding:12px 14px;
}
.lt-module2-evidence-card h4 {
    margin:0 0 8px 0;
    font-size:11px;
    color:#8b8b96;
    text-transform:uppercase;
    letter-spacing:0.05em;
    font-weight:600;
    display:flex;
    align-items:center;
    gap:6px;
}
.lt-module2-evidence-card.noticed h4 { color:#26a69a; }
.lt-module2-evidence-card.missed h4 { color:#ef5350; }
.lt-module2-evidence-card ul {
    margin:0;
    padding-left:16px;
    font-size:12px;
    color:#c8c8d0;
    line-height:1.6;
}
.lt-module2-evidence-card li {
    margin-bottom:3px;
}
.lt-module2-compare {
    background:#1a1a20;
    border:1px solid rgba(255,255,255,0.06);
    border-radius:10px;
    padding:14px 16px;
    margin-bottom:12px;
}
.lt-module2-compare h3 {
    margin:0 0 10px 0;
    font-size:12px;
    color:#8b8b96;
    text-transform:uppercase;
    letter-spacing:0.05em;
    font-weight:600;
}

/* Module 3 / 4 — skeleton TODO */
.lt-module-skeleton {
    display:flex;
    flex-direction:column;
    gap:14px;
}
.lt-module-skeleton-hero {
    background:linear-gradient(135deg, rgba(255,193,7,0.1) 0%, rgba(255,193,7,0.02) 100%);
    border:1px solid rgba(255,193,7,0.25);
    border-radius:12px;
    padding:24px;
    text-align:center;
}
.lt-module-skeleton-hero .lt-skeleton-icon {
    font-size:48px;
    margin-bottom:8px;
    line-height:1;
}
.lt-module-skeleton-hero h2 {
    margin:0 0 6px 0;
    font-size:18px;
    color:#fff;
    font-weight:700;
}
.lt-module-skeleton-hero p {
    margin:0;
    font-size:13px;
    color:#c8c8d0;
    max-width:480px;
    margin-left:auto;
    margin-right:auto;
    line-height:1.5;
}
.lt-module-skeleton-todo {
    background:#1a1a20;
    border:1px solid rgba(255,255,255,0.06);
    border-radius:10px;
    padding:14px 16px;
}
.lt-module-skeleton-todo h3 {
    margin:0 0 10px 0;
    font-size:12px;
    color:#8b8b96;
    text-transform:uppercase;
    letter-spacing:0.05em;
    font-weight:600;
}
.lt-skeleton-item {
    display:flex;
    align-items:flex-start;
    gap:10px;
    padding:8px 0;
    border-bottom:1px solid rgba(255,255,255,0.04);
    font-size:13px;
    color:#c8c8d0;
}
.lt-skeleton-item:last-child { border-bottom:none; }
.lt-skeleton-item .lt-skeleton-checkbox {
    width:16px;
    height:16px;
    border-radius:3px;
    border:1.5px solid rgba(255,193,7,0.4);
    flex-shrink:0;
    margin-top:1px;
    display:grid;
    place-items:center;
    font-size:10px;
    color:#ffc107;
}
.lt-skeleton-item.done .lt-skeleton-checkbox {
    background:rgba(38,166,154,0.15);
    border-color:#26a69a;
    color:#26a69a;
}
.lt-skeleton-item .lt-skeleton-text {
    flex:1;
    line-height:1.5;
}
.lt-skeleton-item .lt-skeleton-tag {
    font-size:9px;
    padding:1px 5px;
    border-radius:3px;
    background:rgba(255,255,255,0.06);
    color:#8b8b96;
    text-transform:uppercase;
    letter-spacing:0.05em;
    font-weight:600;
    flex-shrink:0;
    align-self:flex-start;
    margin-top:2px;
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
                resultTabs: container.querySelectorAll('.lt-result-tab'),
                resultTabsContainer: container.querySelector('#lt-result-tabs'),
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
            if (!canvasEl) {
                console.error('[LabTrainer] _initChart: chartCanvas not found in elements');
                return;
            }

            console.log('[LabTrainer] _initChart() START');

            // Гарантируем непустые размеры для createChart
            const initWidth = canvasEl.clientWidth || 800;
            const initHeight = canvasEl.clientHeight || 400;

            try {
                this.chart = global.LightweightCharts.createChart(canvasEl, {
                    width: initWidth,
                    height: initHeight,
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
                    // ИСПРАВЛЕНО (Error #1): корректные отступы priceScale.
                    // 10% сверху + 20% снизу = 70% под свечи.
                    // Это предотвращает «растягивание» свечей на всю высоту.
                    rightPriceScale: {
                        borderColor: 'rgba(255, 255, 255, 0.08)',
                        scaleMargins: { top: 0.10, bottom: 0.20 }
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
                        vertLine: { color: '#d4af37', width: 1, style: 2, labelBackgroundColor: '#d4af37' },
                        horzLine: { color: '#d4af37', width: 1, style: 2, labelBackgroundColor: '#d4af37' }
                    },
                    handleScroll: {
                        vertTouchDrag: false,
                        mouseWheel: false,
                        pressedMouseMove: true,
                        shiftPressedMouseMove: true,
                        ctrlPressedMouseMove: false
                    },
                    handleScale: {
                        axisPressedMouseMove: true,
                        mouseWheel: false,
                        pinch: true
                    }
                });
                console.log('[LabTrainer] _initChart() chart created');

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

                // Кастомный плавный zoom после создания series
                this._setupMouseWheelZoom();

                // Resize handler — только window.resize, без ResizeObserver
                // (ResizeObserver иногда вызывает рекурсию через applyOptions)
                this._resizeHandler = () => {
                    if (!this.chart || !canvasEl) return;
                    try {
                        const w = canvasEl.clientWidth;
                        const h = canvasEl.clientHeight;
                        if (w > 0 && h > 0) {
                            this.chart.applyOptions({ width: w, height: h });
                        }
                    } catch (e) {}
                };
                window.addEventListener('resize', this._resizeHandler);

                console.log('[LabTrainer] _initChart() END');
            } catch (err) {
                console.error('[LabTrainer] Chart init error:', err);
                if (canvasEl) {
                    canvasEl.innerHTML = `<div style="padding:20px;color:#ef5350;font-size:13px;">Ошибка графика: ${escapeHtml(err.message)}</div>`;
                }
                return;
            }

            // Подписка на изменение видимого диапазона timeScale отключена.
            // Раньше она использовалась для динамического обновления "видно: N" в HUD,
            // но это создавало дополнительные проблемы. Теперь счётчик обновляется
            // только при загрузке нового сценария в _renderChart.

            // ModuleXRenderer — инициализируем АСИНХРОННО через requestAnimationFrame,
            // чтобы не блокировать event loop сразу после создания chart.
            // Также оборачиваем в try-catch, чтобы ошибка в ModuleXRenderer
            // не ломала весь mount().
            requestAnimationFrame(() => {
                try {
                    if (global.ModuleXRenderer && this.chart && this.candleSeries) {
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
                    }
                } catch (err) {
                    console.warn('[LabTrainer] ModuleXRenderer init error:', err && err.message);
                    this.moduleXRenderer = null;
                }
            });
        }

        /**
         * ════════════════════════════════════════════════════════════════════
         *  Кастомный плавный mouse-centered zoom через wheel.
         * ════════════════════════════════════════════════════════════════════
         *
         *  Заменяет встроенный LWC mouseWheel, который дёргал график
         *  (см. опции handleScroll.mouseWheel:false и handleScale.mouseWheel:false
         *  в _initChart()).
         *
         *  Преимущества по сравнению со встроенным zoom:
         *   1. Mouse-centered: точка под курсором остаётся на той же логической
         *      позиции, как в настоящем TradingView.
         *   2. Плавность: одна и та же математика для каждого wheel-события,
         *      никаких рывков и скачков.
         *   3. Предсказуемость: нет кинетической инерции, нет пересоздания
         *      логического диапазона — setVisibleLogicalRange() плавно его
         *      пересчитывает.
         *   4. Не конфликтует с pan (ЛКМ + drag), так как pan обрабатывается
         *      через pressedMouseMove.
         *
         *  Математика:
         *   - deltaY > 0 (прокрутка колеса вниз / от себя) → zoom OUT
         *     (расширяем видимый диапазон, factor > 1)
         *   - deltaY < 0 (прокрутка колеса вверх / к себе) → zoom IN
         *     (сужаем видимый диапазон, factor < 1)
         *   - Курсор остаётся привязанным к своей логической координате:
         *     new_from = cursorLogical - (cursorLogical - old_from) / factor
         *
         *  Ссылки на cleanup:
         *   - метод destroy() снимает обработчик через removeEventListener.
         * ════════════════════════════════════════════════════════════════════
         */
        _setupMouseWheelZoom() {
            const container = this._elements && this._elements.chartCanvas;
            if (!container) {
                console.warn('[LabTrainer] _setupMouseWheelZoom: chartCanvas не найден, zoom будет недоступен');
                return;
            }
            if (!this.chart) {
                console.warn('[LabTrainer] _setupMouseWheelZoom: chart не инициализирован, zoom будет недоступен');
                return;
            }

            // Защита от двойного навешивания (если _initChart() вызывается повторно
            // после reflow / re-mount — снимаем старый handler).
            if (this._wheelHandler) {
                container.removeEventListener('wheel', this._wheelHandler);
                this._wheelHandler = null;
            }

            // Сохраняем ссылку на функцию-обработчик в this,
            // чтобы destroy() мог корректно снять её через removeEventListener.
            this._wheelHandler = (event) => {
                // 1. Отключаем стандартное поведение браузера (прокрутку страницы
                //    при wheel над графиком). Для этого нужен {passive: false} ниже.
                event.preventDefault();

                if (!this.chart) return;

                try {
                    const timeScale = this.chart.timeScale();
                    // 2. Получаем текущий видимый логический диапазон timeScale.
                    //    { from, to } — координаты по оси X в логических единицах
                    //    (не пикселях, не таймстемпах).
                    const visibleRange = timeScale.getVisibleLogicalRange();
                    if (!visibleRange) return;

                    // 3. Чувствительность зума. 0.0015 означает:
                    //    при deltaY = 100 (типичная прокрутка колеса) получаем
                    //    zoomFactor ≈ 1.15 — это ≈15% изменения масштаба за щелчок,
                    //    что соответствует ощущениям TradingView.
                    //    Чем меньше значение — тем плавнее зум.
                    const ZOOM_SENSITIVITY = 0.0015;

                    // Используем event.deltaY; при отсутствии (старые браузеры) —
                    // event.wheelDelta (≈ -120 на щелчок). Нормализуем к deltaY.
                    const delta = typeof event.deltaY === 'number'
                        ? event.deltaY
                        : (-(event.wheelDelta || 0));

                    let zoomFactor = 1 + delta * ZOOM_SENSITIVITY;

                    // 4. Ограничиваем, чтобы не уйти в деление на ноль или
                    //    в чрезмерный zoom. 0.1x..10x — комфортный диапазон.
                    if (zoomFactor < 0.1) zoomFactor = 0.1;
                    if (zoomFactor > 10) zoomFactor = 10;

                    // 5. Положение курсора мыши внутри контейнера графика
                    //    как доля от ширины: 0 = левый край, 1 = правый край.
                    const rect = container.getBoundingClientRect();
                    if (rect.width === 0) return;
                    const xRatio = (event.clientX - rect.left) / rect.width;

                    // Если курсор вне видимой области — игнорируем событие
                    // (например, наехали на sidebar/legend).
                    if (xRatio < 0 || xRatio > 1) return;

                    // 6. Логическая координата X под курсором.
                    //    Это наш "якорь" — она останется под курсором и после зума.
                    const rangeWidth = visibleRange.to - visibleRange.from;
                    const cursorLogical = visibleRange.from + rangeWidth * xRatio;

                    // 7. Новый диапазон: ширина = старая / zoomFactor.
                    //    При factor > 1 (zoom out) → диапазон шире.
                    //    При factor < 1 (zoom in)  → диапазон у́же.
                    const newRangeWidth = rangeWidth / zoomFactor;

                    // 8. Пересчитываем from так, чтобы cursorLogical
                    //    остался на той же относительной позиции xRatio.
                    //    Из уравнения:
                    //      cursorLogical = new_from + newRangeWidth * xRatio
                    //    следует:
                    //      new_from = cursorLogical - newRangeWidth * xRatio
                    //               = cursorLogical - (cursorLogical - visibleRange.from) / zoomFactor
                    const newFrom = cursorLogical - (cursorLogical - visibleRange.from) / zoomFactor;
                    const newTo = newFrom + newRangeWidth;

                    // 9. Применяем новый диапазон. setVisibleLogicalRange() в LWC
                    //    работает плавно, без пересоздания chart instance и без
                    //    рывков прайс-шкалы (в отличие от дефолтного wheel zoom).
                    timeScale.setVisibleLogicalRange({ from: newFrom, to: newTo });
                } catch (err) {
                    // Не ломаем UI, если что-то пошло не так (например, chart
                    // уже отсоединён от DOM в момент события). Тихо логируем.
                    console.warn('[LabTrainer] mouse wheel zoom error:', err && err.message);
                }
            };

            // {passive: false} обязателен, иначе браузер проигнорирует
            // event.preventDefault() с предупреждением в консоли.
            container.addEventListener('wheel', this._wheelHandler, { passive: false });
            console.log('[LabTrainer] _setupMouseWheelZoom() кастомный плавный zoom установлен');
        }

        /**
         * Проверить живость графика: chart, candleSeries, container
         * @returns {{ok: boolean, reason: string}}
         */
        _verifyChartAlive() {
            if (!this.chart) return { ok: false, reason: 'chart == null' };
            if (typeof this.chart.addCandlestickSeries !== 'function') return { ok: false, reason: 'chart disposed' };
            if (!this.candleSeries) return { ok: false, reason: 'candleSeries == null' };
            if (!this._elements || !this._elements.chartCanvas) return { ok: false, reason: 'chartCanvas not in elements' };
            if (!document.body.contains(this._elements.chartCanvas)) return { ok: false, reason: 'canvas detached from DOM' };
            return { ok: true };
        }

        /**
         * Защищённый setData — блокирует вызовы с пустыми/null данными,
         * которые могут стереть график.
         */
        _safeSetData(series, data, label) {
            if (!series) {
                console.error('[LabTrainer] _safeSetData: series == null (' + label + ')');
                return false;
            }
            if (!data || !Array.isArray(data) || data.length === 0) {
                console.error('[LabTrainer] ⚠️ _safeSetData BLOCKED: ' + label + ' — пустой массив! Это бы стёрло график. Stack:', new Error().stack);
                return false;
            }
            series.setData(data);
            return true;
        }

        _renderChart(scenario) {
            if (!this.chart || !this.candleSeries || !this.volumeSeries) return;
            if (!scenario || !scenario.candles || scenario.candles.length === 0) {
                console.warn('[LabTrainer] _renderChart: пустые данные сценария');
                return;
            }

            // Сохраняем ссылку на текущий сценарий, чтобы _updateHud имел доступ к количеству свечей
            this.currentScenario = scenario;

            const candleData = scenario.candles.map(c => ({
                time: c.time, open: c.open, high: c.high, low: c.low, close: c.close
            }));
            const volumeData = scenario.candles.map(c => ({
                time: c.time, value: c.volume || 0, color: c.close >= c.open ? '#26a69a55' : '#ef535055'
            }));

            try {
                // 1. Загружаем данные
                this.candleSeries.setData(candleData);
                this.volumeSeries.setData(volumeData);

                // 2. Корректируем price scale: гарантируем правильные отступы
                //    (на случай если Module X или другие renderer'ы их сбросили)
                this.candleSeries.priceScale().applyOptions({
                    scaleMargins: { top: 0.10, bottom: 0.20 },
                    autoScale: true,
                    mode: 0
                });

                // 3. Показываем последние 80 свечей для естественного отображения
                const N = candleData.length;
                const visibleBars = Math.min(N, 80);
                const fromIdx = Math.max(0, N - visibleBars);
                this.chart.timeScale().setVisibleLogicalRange({
                    from: fromIdx,
                    to: N - 1 + 3
                });

                // 4. fitContent() — вызываем через setTimeout, чтобы LWC успел
                //    отрисовать данные. Это и есть ИСПРАВЛЕНИЕ Error #1.
                setTimeout(() => {
                    try {
                        if (this.chart && this.candleSeries) {
                            this.chart.timeScale().fitContent();
                        }
                        // Обновляем HUD после полной отрисовки, чтобы счётчик свечей
                        // отобразил реальное количество и видимый диапазон
                        this._updateHud();
                    } catch (e) {
                        console.warn('[LabTrainer] fitContent error:', e && e.message);
                    }
                }, 50);

                console.log('[LabTrainer] _renderChart OK: ' + candleData.length + ' candles, scenario=' + (scenario.id || 'unknown'));
            } catch (err) {
                console.error('[LabTrainer] renderChart error:', err && err.message);
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
            const items = [];

            // Всегда показываем счётчик свечей (если сценарий загружен).
            // Счётчик не зависит от терминала — он отображает данные графика.
            if (this.currentScenario && this.currentScenario.candles && this.currentScenario.candles.length > 0) {
                const candleCount = this.currentScenario.candles.length;
                items.push(`<span class="lt-hud-pill" style="border-color:rgba(212,175,55,0.35);" title="Общее число свечей в сценарии"><span class="lt-hud-label">🕯 CANDLES</span> ${candleCount}</span>`);
            }

            // Позиция (ENTRY/SL/TP) — показываем только если терминал инициализирован
            if (this.terminal) {
                try {
                    const pos = this.terminal.getPosition();
                    if (pos.entry !== null) {
                        items.push(`<span class="lt-hud-pill"><span class="lt-hud-label">ENTRY</span> ${formatPrice(pos.entry)}</span>`);
                    }
                    if (pos.sl !== null) {
                        items.push(`<span class="lt-hud-pill" style="border-color:rgba(239,83,80,0.3);"><span class="lt-hud-label">SL</span> ${formatPrice(pos.sl)}</span>`);
                    }
                    if (pos.tp !== null) {
                        items.push(`<span class="lt-hud-pill" style="border-color:rgba(38,166,154,0.3);"><span class="lt-hud-label">TP</span> ${formatPrice(pos.tp)}</span>`);
                    }
                } catch (e) { /* терминал ещё не готов — игнорируем */ }
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

            // ════════════════════════════════════════════════════════════════════
            // STEP 8 (lab-trainer): Module X render
            // ════════════════════════════════════════════════════════════════════
            console.log('[LabTrainer] >>> STEP 8: Module X render started — patterns in input=' + ((moduleXResult.bos || []).length + (moduleXResult.choch || []).length + (moduleXResult.orderBlocks || []).length + (moduleXResult.fairValueGaps || []).length) + ', candles=' + (candles ? candles.length : 0));
            // Если Exam Mode — не рисуем до подтверждения.
            // В этом методе рисование вызывается именно при показе результата,
            // что соответствует логике Exam Mode (показать разметку только после ответа).
            try {
                const result = this.moduleXRenderer.draw(moduleXResult, candles || []);
                // Обновить список паттернов в UI Panel
                if (this.moduleXPanel && result && result.patterns) {
                    this.moduleXPanel.setPatterns(result.patterns);
                }
                console.log('[LabTrainer] >>> STEP 8 DONE: Module X rendered — patterns=' + (result.patterns ? result.patterns.length : 0));
            } catch (err) {
                console.error('[LabTrainer] >>> STEP 8 ERROR: _drawModuleXResult error:', err.message, err.stack);
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
                    // Сразу обновляем HUD со счётчиком свечей — не дожидаемся setTimeout в _renderChart,
                    // чтобы пользователь видел количество сразу после загрузки графика
                    this.currentScenario = scenario;
                    this._updateHud();
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
                        // ДИАГНОСТИКА STEP 6: Module X started
                        console.log('[LabTrainer] >>> STEP 6: Module X started (mode=' + this.moduleXMode + ')');
                        const analysisForRender = this._getModuleXAnalysisForRender(scenario);
                        if (analysisForRender && scenario.candles) {
                            this._drawModuleXResult(analysisForRender, scenario.candles);
                            // ДИАГНОСТИКА STEP 7: Module X rendered
                            const patternsCount = (analysisForRender.bos || []).length + (analysisForRender.choch || []).length +
                                                  (analysisForRender.orderBlocks || []).length + (analysisForRender.fairValueGaps || []).length;
                            console.log('[LabTrainer] >>> STEP 7: Module X rendered — patterns=' + patternsCount);
                        } else {
                            console.warn('[LabTrainer] >>> STEP 7: Module X SKIPPED — no analysisForRender or no candles');
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
            console.log('[LabTrainer] _bindUIEvents: btnConfirm element =', this._elements.btnConfirm ? 'FOUND id=' + this._elements.btnConfirm.id : 'NULL');
            if (this._elements.btnConfirm) {
                this._elements.btnConfirm.addEventListener('click', async () => {
                    console.log('[LabTrainer] btnConfirm CLICKED, selectedDecision=' + this.selectedDecision + ', isAnalyzing=' + this.isAnalyzing + ', trainer=' + (this.trainer ? 'OK' : 'NULL') + ', state=' + (this.trainer ? this.trainer.state : '?'));
                    if (!this.selectedDecision || this.isAnalyzing) {
                        console.warn('[LabTrainer] btnConfirm EARLY RETURN: selectedDecision=' + this.selectedDecision + ', isAnalyzing=' + this.isAnalyzing);
                        return;
                    }
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
                    console.log('[LabTrainer] btnConfirm: calling this.trainer.submitDecision()...');
                    try {
                        await this.trainer.submitDecision(this.selectedDecision);
                        console.log('[LabTrainer] btnConfirm: submitDecision() returned');
                    } catch (e) {
                        console.error('[LabTrainer] btnConfirm: submitDecision() THREW:', e);
                    }
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

            // ════════════════════════════════════════════════════════════════════
            // TABS — переключение модулей в result screen
            // Каждый таб имеет data-module="x|1|2|3|4" и показывает
            // уникальный UI (НЕ копию одного и того же шаблона).
            // ════════════════════════════════════════════════════════════════════
            if (this._elements.resultTabs && this._elements.resultTabs.length) {
                // Помечаем табы Module 3 и Module 4 как skeleton (в разработке)
                this._elements.resultTabs.forEach(tab => {
                    const key = tab.getAttribute('data-module');
                    if (key === '3' || key === '4') {
                        tab.classList.add('skeleton');
                    }
                });

                // По умолчанию активный таб — Module 2 (самое важное после решения)
                // _showResultScreen() переключит на '2' явно при показе.

                this._elements.resultTabs.forEach(tab => {
                    tab.addEventListener('click', () => {
                        const moduleKey = tab.getAttribute('data-module');
                        if (!moduleKey) return;
                        this._switchResultTab(moduleKey);
                    });
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

        // ════════════════════════════════════════════════════════════════════════
        // RESULT SCREEN — TABBED ARCHITECTURE
        // ════════════════════════════════════════════════════════════════════════
        // Каждый модуль имеет СВОЙ уникальный визуальный интерфейс:
        //
        //   Module X  → 12 карточек "что видит рынок" + hero с bias/context
        //   Module 1  → narrative с пронумерованными шагами "почему сигнал"
        //   Module 2  → verdict-centric: большой вердикт, score, evidence, position compare
        //   Module 3  → SKELETON с TODO-карточками (методика обучения в разработке)
        //   Module 4  → SKELETON с TODO-карточками (аналитика в разработке)
        //
        // НИ ОДИН модуль не копирует layout другого.
        // ════════════════════════════════════════════════════════════════════════

        _showResultScreen(result) {
            const E = this._elements;
            console.log('[LabTrainer] _showResultScreen: building inline result block');

            // 1. Извлекаем данные из result
            const correctness = result.correctness || {};
            const m2 = result.module2 || {};
            const mX = result.moduleX || {};
            const m1 = result.module1 || {};
            const decision = result.userDecision || {};
            const correct = !!correctness.isCorrect;

            // Вердикт
            const verdictIcon = correct ? '✓' : '✗';
            const verdictTitle = correct ? 'Решение верное!' : 'Решение ошибочно';
            const verdictColor = correct ? '#22c55e' : '#ef4444';
            const verdictBg = correct ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)';

            // Score
            const score = (typeof m2.score === 'number') ? m2.score : 0;
            const scoreLabel = score >= 2 ? 'Отлично' : score >= 0 ? 'Нормально' : 'Плохо';
            const scoreColor = score >= 2 ? '#22c55e' : score >= 0 ? '#D4AF37' : '#ef4444';

            // Explanation
            const explanation = m2.explanation || 'Объяснение недоступно.';

            // Meta
            const meta = m2.meta || {};
            const bias = meta.bias || mX.bias || 'neutral';
            const biasLabel = bias === 'bullish' ? 'Бычий' : bias === 'bearish' ? 'Медвежий' : 'Нейтральный';
            const biasIcon = bias === 'bullish' ? '📈' : bias === 'bearish' ? '📉' : '➡️';
            const biasColor = bias === 'bullish' ? '#22c55e' : bias === 'bearish' ? '#ef4444' : '#D4AF37';
            const confidence = (typeof meta.confidence === 'number') ? meta.confidence :
                              (mX.confidence && (mX.confidence.percent || mX.confidence.value)) || 0;
            const confidencePct = (confidence * 100).toFixed(0) + '%';
            const context = meta.marketContext || mX.context || '—';
            const signalsCount = meta.signalsCount || (mX.signals && mX.signals.length) || 0;

            // Дополнительные данные из Module X
            const trend = (mX.trend && mX.trend.primaryTrend) || '—';
            const phase = (mX.marketPhase && mX.marketPhase.phase) || '—';

            // Evidence
            const evAnalysis = m2.evidenceAnalysis || {};
            const evMatches = evAnalysis.matches || [];
            const evMisses = evAnalysis.misses || [];

            // Решение пользователя
            const userDir = decision.direction || (typeof decision === 'string' ? decision : '—');
            const correctDir = correctness.correctDecision || '—';
            const userDirUpper = String(userDir).toUpperCase();
            const correctDirUpper = String(correctDir).toUpperCase();

            // Risk
            const correctDecisionObj = m2.decision || {};
            const userStopLoss = decision.stopLoss || decision.sl;
            const userTakeProfit = decision.takeProfit || decision.tp;
            const recStopLoss = correctDecisionObj.stopLoss || correctDecisionObj.sl;
            const recTakeProfit = correctDecisionObj.takeProfit || correctDecisionObj.tp;
            const riskDesc = (m2.explanation && (m2.explanation.risk || '')) || '';

            // 2. Строим HTML для inline-блока
            const html = `
<div class="lt-result-inline" style="font-family:'Inter',sans-serif;color:#c8c8d0;">

    <!-- HERO: вердикт + score -->
    <div style="
        display:grid;
        grid-template-columns: auto 1fr auto;
        gap:24px;
        align-items:center;
        padding:24px 28px;
        background:linear-gradient(135deg, ${verdictBg} 0%, rgba(212,175,55,0.05) 100%);
        border:1px solid rgba(255,255,255,0.08);
        border-radius:14px;
        margin-bottom:20px;
    ">
        <div style="
            width:78px;height:78px;
            border-radius:18px;
            display:grid;place-items:center;
            font-size:36px;font-weight:800;
            color:#fff;
            background:${verdictColor};
            box-shadow:0 0 0 4px ${verdictBg}, 0 8px 24px rgba(0,0,0,0.4);
            flex-shrink:0;
        ">${verdictIcon}</div>

        <div>
            <div style="font-size:11px;color:#8b8b96;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;font-weight:600;">Вердикт</div>
            <div style="font-size:24px;font-weight:800;color:#fff;margin-bottom:6px;line-height:1.2;">${verdictTitle}</div>
            <div style="font-size:13px;color:#a1a1aa;">
                Ваш выбор: <strong style="color:${correct ? '#22c55e' : '#ef4444'};">${userDirUpper}</strong>
                <span style="margin:0 8px;color:#52525b;">·</span>
                Правильно: <strong style="color:#D4AF37;">${correctDirUpper}</strong>
            </div>
        </div>

        <div style="text-align:right;">
            <div style="font-size:11px;color:#8b8b96;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;font-weight:600;">Оценка</div>
            <div style="font-size:42px;font-weight:800;color:${scoreColor};line-height:1;font-family:'JetBrains Mono',monospace;">${score > 0 ? '+' : ''}${score}</div>
            <div style="font-size:12px;color:${scoreColor};font-weight:600;margin-top:4px;">${scoreLabel}</div>
        </div>
    </div>

    <!-- РЫНОЧНЫЙ КОНТЕКСТ -->
    <div style="margin-bottom:20px;">
        <div style="font-size:11px;color:#8b8b96;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;font-weight:600;">📊 Рыночный контекст</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
            <div style="padding:14px;background:#0e0e12;border:1px solid rgba(255,255,255,0.06);border-radius:10px;">
                <div style="font-size:10px;color:#8b8b96;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Bias</div>
                <div style="display:flex;align-items:center;gap:6px;font-size:14px;font-weight:700;color:${biasColor};">
                    <span>${biasIcon}</span>${biasLabel}
                </div>
            </div>
            <div style="padding:14px;background:#0e0e12;border:1px solid rgba(255,255,255,0.06);border-radius:10px;">
                <div style="font-size:10px;color:#8b8b96;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Confidence</div>
                <div style="font-size:18px;font-weight:700;color:#fff;font-family:'JetBrains Mono',monospace;">${confidencePct}</div>
                <div style="height:4px;background:rgba(255,255,255,0.06);border-radius:2px;margin-top:6px;overflow:hidden;">
                    <div style="height:100%;width:${confidencePct};background:linear-gradient(90deg,#D4AF37,#22c55e);"></div>
                </div>
            </div>
            <div style="padding:14px;background:#0e0e12;border:1px solid rgba(255,255,255,0.06);border-radius:10px;">
                <div style="font-size:10px;color:#8b8b96;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Trend</div>
                <div style="font-size:14px;font-weight:700;color:#fff;text-transform:capitalize;">${trend}</div>
            </div>
            <div style="padding:14px;background:#0e0e12;border:1px solid rgba(255,255,255,0.06);border-radius:10px;">
                <div style="font-size:10px;color:#8b8b96;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Сигналов</div>
                <div style="font-size:18px;font-weight:700;color:#fff;font-family:'JetBrains Mono',monospace;">${signalsCount}</div>
            </div>
        </div>
        <div style="margin-top:10px;padding:10px 14px;background:rgba(212,175,55,0.05);border-left:3px solid #D4AF37;border-radius:6px;font-size:12px;color:#c8c8d0;">
            <strong style="color:#D4AF37;">Контекст:</strong> ${context}
        </div>
    </div>

    <!-- ОБЪЯСНЕНИЕ -->
    <div style="margin-bottom:20px;">
        <div style="font-size:11px;color:#8b8b96;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;font-weight:600;">💡 Объяснение AI</div>
        <div style="padding:18px 20px;background:#0e0e12;border:1px solid rgba(255,255,255,0.06);border-radius:10px;font-size:14px;line-height:1.7;color:#d4d4d8;">
            ${explanation}
        </div>
    </div>

    ${(evMatches.length > 0 || evMisses.length > 0) ? `
    <!-- EVIDENCE -->
    <div style="margin-bottom:20px;">
        <div style="font-size:11px;color:#8b8b96;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;font-weight:600;">🎯 Что вы оценили верно / неверно</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div style="padding:14px;background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.2);border-radius:10px;">
                <div style="font-size:11px;color:#22c55e;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;font-weight:700;">✓ Верно (${evMatches.length})</div>
                <ul style="margin:0;padding-left:18px;font-size:13px;color:#d4d4d8;line-height:1.6;">
                    ${evMatches.slice(0, 5).map(m => `<li>${m.label || m.name || m.id || JSON.stringify(m)}</li>`).join('')}
                </ul>
            </div>
            <div style="padding:14px;background:rgba(239,68,68,0.06);border:1px solid rgba(239,68,68,0.2);border-radius:10px;">
                <div style="font-size:11px;color:#ef4444;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px;font-weight:700;">✗ Пропущено (${evMisses.length})</div>
                <ul style="margin:0;padding-left:18px;font-size:13px;color:#d4d4d8;line-height:1.6;">
                    ${evMisses.slice(0, 5).map(m => `<li>${m.label || m.name || m.id || JSON.stringify(m)}</li>`).join('')}
                </ul>
            </div>
        </div>
    </div>
    ` : ''}

    ${(userStopLoss || userTakeProfit || recStopLoss || recTakeProfit) ? `
    <!-- РИСК-МЕНЕДЖМЕНТ -->
    <div style="margin-bottom:20px;">
        <div style="font-size:11px;color:#8b8b96;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px;font-weight:600;">🛡️ Риск-менеджмент</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
            <div style="padding:14px;background:#0e0e12;border:1px solid rgba(255,255,255,0.06);border-radius:10px;">
                <div style="font-size:10px;color:#8b8b96;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Stop Loss</div>
                <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;">
                    <span>Ваш: <strong style="color:#fff;">${userStopLoss || '—'}</strong></span>
                    <span>Рекомендация: <strong style="color:#D4AF37;">${recStopLoss || '—'}</strong></span>
                </div>
            </div>
            <div style="padding:14px;background:#0e0e12;border:1px solid rgba(255,255,255,0.06);border-radius:10px;">
                <div style="font-size:10px;color:#8b8b96;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;">Take Profit</div>
                <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px;">
                    <span>Ваш: <strong style="color:#fff;">${userTakeProfit || '—'}</strong></span>
                    <span>Рекомендация: <strong style="color:#D4AF37;">${recTakeProfit || '—'}</strong></span>
                </div>
            </div>
        </div>
    </div>
    ` : ''}

    <!-- КНОПКА "ПОКАЗАТЬ ПРОДОЛЖЕНИЕ" -->
    <div id="lt-result-continuation-wrap" style="text-align:center;padding:18px;background:linear-gradient(135deg,rgba(212,175,55,0.08) 0%,rgba(123,97,255,0.06) 100%);border:1px dashed rgba(212,175,55,0.3);border-radius:12px;">
        <button id="lt-btn-show-continuation" style="
            background:linear-gradient(135deg,#D4AF37 0%,#C5A028 100%);
            color:#0a0a0c;
            border:none;
            padding:14px 32px;
            border-radius:10px;
            font-size:14px;
            font-weight:700;
            cursor:pointer;
            font-family:inherit;
            box-shadow:0 4px 16px rgba(212,175,55,0.3);
            transition:all 0.18s ease;
            display:inline-flex;
            align-items:center;
            gap:8px;
        ">▶ Показать продолжение рынка</button>
        <div style="margin-top:10px;font-size:12px;color:#8b8b96;">Узнайте, как развивалась цена после вашего решения</div>
    </div>

</div>
`;

            // 3. Вставляем HTML в тело #lt-result-screen
            // Сохраняем полный результат для последующей обработки
            this._lastResult = result;

            // Скрываем табы (результат — единый блок)
            if (E.resultTabsContainer) {
                E.resultTabsContainer.style.display = 'none';
            }

            // Заменяем header (новый компактный вердикт)
            if (E.resultVerdictIcon) {
                E.resultVerdictIcon.style.background = verdictColor;
                E.resultVerdictIcon.textContent = verdictIcon;
            }
            if (E.resultTitle) {
                E.resultTitle.textContent = verdictTitle;
            }
            if (E.resultSubtitle) {
                E.resultSubtitle.textContent =
                    `Ваш выбор: ${userDirUpper} · Правильно: ${correctDirUpper} · Оценка: ${score > 0 ? '+' : ''}${score}`;
            }

            // Вставляем HTML в body
            if (E.resultBody) {
                E.resultBody.innerHTML = html;
                console.log('[LabTrainer] _showResultScreen: HTML injected into #lt-result-body');
            } else if (E.resultScreen) {
                E.resultScreen.innerHTML = html;
                console.log('[LabTrainer] _showResultScreen: HTML injected into #lt-result-screen');
            }

            // 4. Делаем контейнер видимым
            if (E.resultScreen) {
                E.resultScreen.style.display = 'block';
                // Плавный скролл к панели результата
                setTimeout(() => {
                    try {
                        E.resultScreen.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    } catch (e) { /* scrollTo может не работать в тестах */ }
                }, 100);
            }

            // Привязываем обработчик кнопки "Показать продолжение рынка"
            const contBtn = document.getElementById('lt-btn-show-continuation');
            if (contBtn) {
                contBtn.addEventListener('click', () => this._showMarketContinuation());
            }

            if (E.btnNext) E.btnNext.disabled = false;

            console.log('[LabTrainer] _showResultScreen: result screen visible, ready');
        }

        /**
         * Показать продолжение рынка (раскрыть весь график) и
         * заменить блок "Показать продолжение" на три кнопки навигации.
         */
        _showMarketContinuation() {
            console.log('[LabTrainer] _showMarketContinuation: revealing full chart');

            const E = this._elements;

            // 1. Показываем все свечи на графике (fitContent)
            try {
                if (this.chart && this.chart.timeScale) {
                    this.chart.timeScale().fitContent();
                }
            } catch (err) {
                console.warn('[LabTrainer] _showMarketContinuation: fitContent error:', err && err.message);
            }

            // 2. Заменяем блок "Показать продолжение" на блок с тремя кнопками навигации
            const contWrap = document.getElementById('lt-result-continuation-wrap');
            if (contWrap) {
                contWrap.innerHTML = `
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;padding:0;">
    <button id="lt-btn-continuation-back" style="
        background:#232329;
        color:#c8c8d0;
        border:1px solid rgba(255,255,255,0.08);
        padding:14px 16px;
        border-radius:10px;
        font-size:13px;
        font-weight:600;
        cursor:pointer;
        font-family:inherit;
        transition:all 0.15s ease;
        display:flex;align-items:center;justify-content:center;gap:8px;
    ">← Назад к модулям</button>
    <button id="lt-btn-continuation-retry" style="
        background:rgba(212,175,55,0.12);
        color:#D4AF37;
        border:1px solid rgba(212,175,55,0.3);
        padding:14px 16px;
        border-radius:10px;
        font-size:13px;
        font-weight:600;
        cursor:pointer;
        font-family:inherit;
        transition:all 0.15s ease;
        display:flex;align-items:center;justify-content:center;gap:8px;
    ">↻ Повторить сценарий</button>
    <button id="lt-btn-continuation-next" style="
        background:linear-gradient(135deg,#D4AF37 0%,#C5A028 100%);
        color:#0a0a0c;
        border:none;
        padding:14px 16px;
        border-radius:10px;
        font-size:13px;
        font-weight:700;
        cursor:pointer;
        font-family:inherit;
        transition:all 0.15s ease;
        display:flex;align-items:center;justify-content:center;gap:8px;
        box-shadow:0 4px 16px rgba(212,175,55,0.3);
    ">→ Следующий сценарий</button>
</div>
<div style="margin-top:12px;text-align:center;font-size:12px;color:#8b8b96;">
    📈 График раскрыт — вы видите полное движение цены
</div>
`;

                // Привязываем обработчики
                const backBtn = document.getElementById('lt-btn-continuation-back');
                const retryBtn = document.getElementById('lt-btn-continuation-retry');
                const nextBtn = document.getElementById('lt-btn-continuation-next');

                if (backBtn) {
                    backBtn.addEventListener('click', () => {
                        console.log('[LabTrainer] continuation: back to modules');
                        if (typeof this._hideResultScreen === 'function') {
                            this._hideResultScreen();
                        }
                        if (typeof this.back === 'function') {
                            this.back();
                        }
                    });
                }
                if (retryBtn) {
                    retryBtn.addEventListener('click', () => {
                        console.log('[LabTrainer] continuation: retry scenario');
                        if (typeof this._hideResultScreen === 'function') {
                            this._hideResultScreen();
                        }
                        if (typeof this.reset === 'function') {
                            this.reset();
                        }
                    });
                }
                if (nextBtn) {
                    nextBtn.addEventListener('click', () => {
                        console.log('[LabTrainer] continuation: next scenario');
                        if (typeof this._hideResultScreen === 'function') {
                            this._hideResultScreen();
                        }
                        if (typeof this.next === 'function') {
                            this.next();
                        }
                    });
                }
            }

            console.log('[LabTrainer] _showMarketContinuation: navigation buttons shown');
        }

        /**
         * Переключение активного таба и рендер уникального содержимого.
         * @param {string} moduleKey - 'x' | '1' | '2' | '3' | '4'
         */
        _switchResultTab(moduleKey) {
            if (!this._lastResult) return;
            const E = this._elements;
            if (!E.resultTabs) return;

            // 1. Подсветить активный таб
            E.resultTabs.forEach(tab => {
                if (tab.getAttribute('data-module') === moduleKey) {
                    tab.classList.add('active');
                } else {
                    tab.classList.remove('active');
                }
            });

            // 2. Получить данные модулей
            const m2 = this._lastResult.module2 || {};
            const m3 = this._lastResult.module3 || {};
            const mX = this._lastResult.moduleX || {};
            const m1 = this._lastResult.module1 || {};
            const decision = this._lastResult.userDecision;
            const userPos = this._getUserPositionForCurrent();
            const scenario = this._lastResult.scenario;

            // 3. Рендер уникального содержимого для каждого модуля
            let html = '';
            switch (moduleKey) {
                case 'x':
                    html = this._renderModuleXContent(mX);
                    break;
                case '1':
                    html = this._renderModule1Content(m1, mX, scenario);
                    break;
                case '2':
                    html = this._renderModule2Content(m2, decision, userPos, mX);
                    break;
                case '3':
                    html = this._renderModule3Content(m3);
                    break;
                case '4':
                    html = this._renderModule4Content();
                    break;
            }

            if (E.resultBody) E.resultBody.innerHTML = html;
        }

        // ────────────────────────────────────────────────────────────────────
        // MODULE X — "ЧТО ВИДИТ РЫНОК"
        // Уникальный UI: hero-блок + 12 карточек (Market Structure, Trend,
        // Smart Money, Price Action, Volume, Liquidity, Volatility, Momentum,
        // Support/Resistance, Probability, Scenarios, Evidence).
        // Это НЕ повторяется ни в одном другом модуле.
        // ────────────────────────────────────────────────────────────────────
        _renderModuleXContent(mX) {
            const bias = mX.bias || '—';
            const biasClass = bias === 'bullish' ? 'bull' : bias === 'bearish' ? 'bear' : 'neutral';
            const context = mX.context || '—';
            const confidence = (mX.confidence && (mX.confidence.percent || mX.confidence)) || '—';
            const trend = (mX.trend && mX.trend.primaryTrend) || '—';
            const phase = (mX.marketPhase && mX.marketPhase.phase) || '—';
            const moduleVer = mX.moduleXVersion || '?';

            // 12 уникальных карточек модуля
            const cards = [
                {
                    icon: '🏛️',
                    label: 'Market Structure',
                    value: mX.marketStructure && mX.marketStructure.type ? mX.marketStructure.type : '—',
                    cls: 'neutral'
                },
                {
                    icon: '📈',
                    label: 'Trend',
                    value: trend,
                    cls: biasClass
                },
                {
                    icon: '🐋',
                    label: 'Smart Money',
                    value: (mX.smartMoney && (mX.smartMoney.summary || (mX.smartMoney.signals && mX.smartMoney.signals[0]))) || (mX.smc && (mX.smc.bos ? mX.smc.bos.length + ' BOS' : '—')) || '—',
                    cls: 'gold'
                },
                {
                    icon: '🕯️',
                    label: 'Price Action',
                    value: (mX.priceAction && mX.priceAction.pattern) || '—',
                    cls: 'neutral'
                },
                {
                    icon: '📊',
                    label: 'Volume',
                    value: (mX.volume && (mX.volume.summary || mX.volume.trend)) || '—',
                    cls: 'neutral'
                },
                {
                    icon: '💧',
                    label: 'Liquidity',
                    value: mX.liquidity
                        ? (mX.liquidity.levels ? mX.liquidity.levels.length + ' уровн.' : (mX.liquidity.zones || '—'))
                        : '—',
                    cls: 'gold'
                },
                {
                    icon: '🌊',
                    label: 'Volatility',
                    value: (mX.volatility && (mX.volatility.regime || mX.volatility.signal)) || '—',
                    cls: 'neutral'
                },
                {
                    icon: '⚡',
                    label: 'Momentum',
                    value: (mX.momentum && mX.momentum.signal) || '—',
                    cls: biasClass
                },
                {
                    icon: '🧱',
                    label: 'Support / Resistance',
                    value: mX.supportResistance
                        ? (mX.supportResistance.summary || (mX.supportResistance.levels ? mX.supportResistance.levels.length + ' зон' : '—'))
                        : '—',
                    cls: 'gold'
                },
                {
                    icon: '🎯',
                    label: 'Probability',
                    value: (mX.probability && (mX.probability.percent || mX.probability.value))
                        ? (mX.probability.percent || mX.probability.value) + '%'
                        : (typeof mX.probability === 'number' ? mX.probability + '%' : '—'),
                    cls: 'gold'
                },
                {
                    icon: '🧭',
                    label: 'Market Bias',
                    value: bias,
                    cls: biasClass
                },
                {
                    icon: '📡',
                    label: 'Confidence',
                    value: confidence + (typeof confidence === 'number' || !isNaN(parseFloat(confidence)) ? '%' : ''),
                    cls: 'gold'
                }
            ];

            let html = '';
            // Hero-блок (отличается от других модулей)
            html += `<div class="lt-modulex-hero">
                <div>
                    <h2>📊 Что видит рынок</h2>
                    <p>Аналитический взгляд Module X на структуру и контекст текущего сценария. Это <strong>объективный слепок рынка</strong> — без оценки вашего решения. График с разметкой закрыт — чтобы вернуться к нему, закройте окно результатов.</p>
                </div>
                <div class="lt-modulex-hero-stat">
                    <div class="num">${formatNumber(phase !== '—' ? phase.length : '')}</div>
                    <div class="lbl">Phase · ${escapeHtml(phase)}</div>
                </div>
            </div>`;

            // Сетка карточек
            html += '<div class="lt-modulex-grid">';
            cards.forEach(c => {
                html += `<div class="lt-modulex-card">
                    <div class="lt-modulex-icon">${c.icon}</div>
                    <div class="lt-modulex-label">${escapeHtml(c.label)}</div>
                    <div class="lt-modulex-value ${c.cls}">${escapeHtml(String(c.value))}</div>
                </div>`;
            });
            html += '</div>';

            // Сценарии Module X (рекомендации) — отдельный блок, не дублирующийся
            const scenarios = mX.scenarios || [];
            if (scenarios.length > 0) {
                html += `<section class="lt-result-section" style="margin-top:24px;">
                    <h3 style="font-size:12px;color:#8b8b96;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;margin-bottom:10px;">🧭 Сценарии и рекомендации Module X</h3>
                    <div class="lt-signal-list">`;
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

            // Evidence-блок (если есть)
            const evidence = mX.evidence || [];
            if (evidence.length > 0) {
                html += `<section class="lt-result-section" style="margin-top:18px;">
                    <h3 style="font-size:12px;color:#8b8b96;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;margin-bottom:10px;">📐 Evidence (доказательства Module X)</h3>
                    <div class="lt-signal-list">`;
                evidence.slice(0, 6).forEach(e => {
                    const text = typeof e === 'string' ? e : (e.text || e.label || JSON.stringify(e));
                    html += `<div class="lt-signal-item supporting">${escapeHtml(text)}</div>`;
                });
                html += `</div></section>`;
            }

            // Footer
            html += `<div style="margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:#8b8b96;text-align:center;">
                Module X · PAYD v${escapeHtml(moduleVer)} · Core Analysis Engine
            </div>`;

            return html;
        }

        // ────────────────────────────────────────────────────────────────────
        // MODULE 1 — "ПОЧЕМУ ПОЯВИЛСЯ СИГНАЛ"
        // Уникальный UI: narrative-style с пронумерованными шагами.
        // Это не таблица карточек (как у X) и не verdict (как у 2).
        // Это guided reading: "Шаг 1. Что показывает структура? → ..."
        // ────────────────────────────────────────────────────────────────────
        _renderModule1Content(m1, mX, scenario) {
            // Извлекаем данные из m1 (MarketAnalysisEngine) и mX (Module X)
            // без повторения карточек из Module X
            const trend = (mX.trend && mX.trend.primaryTrend) || '—';
            const bias = mX.bias || '—';
            const structure = mX.marketStructure && mX.marketStructure.type ? mX.marketStructure.type : '—';
            const smcSignals = (mX.smartMoney && mX.smartMoney.signals) || [];
            const ob = (mX.smc && mX.smc.orderBlocks) || mX.orderBlocks || [];
            const fvg = (mX.smc && mX.smc.fairValueGaps) || mX.fairValueGaps || [];
            const bos = (mX.smc && mX.smc.bos) || mX.bos || [];
            const choch = (mX.smc && mX.smc.choch) || mX.choch || [];

            // Шаги чтения рынка (narrative)
            const steps = [
                {
                    num: 1,
                    q: 'Какая сейчас структура рынка?',
                    a: structure,
                    detail: 'Структура — это фундамент. ' +
                        (structure && structure.toLowerCase().includes('bull')
                            ? 'Восходящая структура: каждый новый максимум выше предыдущего (HH), каждый минимум — выше (HL).'
                            : structure && structure.toLowerCase().includes('bear')
                                ? 'Нисходящая структура: каждый максимум ниже предыдущего (LH), каждый минимум — ниже (LL).'
                                : 'Боковик / переходная фаза — направление не очевидно.'),
                    tags: [{ text: structure, cls: 'confirmed' }]
                },
                {
                    num: 2,
                    q: 'Куда указывает тренд?',
                    a: trend,
                    detail: 'Тренд подтверждает или опровергает направление сделки. ' +
                        (trend && (trend.toLowerCase().includes('up') || trend.toLowerCase().includes('bull'))
                            ? 'Восходящий тренд — ищем покупки на откатах.'
                            : trend && (trend.toLowerCase().includes('down') || trend.toLowerCase().includes('bear'))
                                ? 'Нисходящий тренд — ищем продажи на отскоках.'
                                : 'Флэт — лучше подождать пробоя.'),
                    tags: [{ text: trend, cls: 'confirmed' }]
                },
                {
                    num: 3,
                    q: 'Что делают крупные игроки (Smart Money)?',
                    a: smcSignals[0] || (bos.length > 0 ? 'BOS обнаружен' : choch.length > 0 ? 'CHoCH обнаружен' : 'Нет активности'),
                    detail: 'Smart Money показывает, что делают институционалы. ' +
                        (bos.length > 0
                            ? `Найдено ${bos.length} пробоев структуры (BOS) — крупный игрок входит в позицию.`
                            : choch.length > 0
                                ? `Найдено ${choch.length} смен характера движения (CHoCH) — возможен разворот.`
                                : 'Нет явных сигналов Smart Money — рынок в фазе накопления.'),
                    tags: [
                        ...(bos.length > 0 ? [{ text: `${bos.length} BOS`, cls: 'confirmed' }] : []),
                        ...(choch.length > 0 ? [{ text: `${choch.length} CHoCH`, cls: 'weak' }] : []),
                        ...(bos.length === 0 && choch.length === 0 ? [{ text: 'Нет сигналов', cls: 'missing' }] : [])
                    ]
                },
                {
                    num: 4,
                    q: 'Есть ли подтверждающие зоны?',
                    a: ob.length > 0 ? `${ob.length} Order Block` : fvg.length > 0 ? `${fvg.length} FVG` : 'Нет зон',
                    detail: 'Order Blocks и FVG — это зоны, от которых цена с высокой вероятностью отскочит. ' +
                        (ob.length > 0
                            ? `Найдено ${ob.length} ордер-блоков — возможны точки входа.`
                            : fvg.length > 0
                                ? `Найдено ${fvg.length} ценовых разрывов (FVG) — возможны зоны заполнения.`
                                : 'Подтверждающих зон нет — вход менее надёжен.'),
                    tags: [
                        ...(ob.length > 0 ? [{ text: `${ob.length} OB`, cls: 'confirmed' }] : []),
                        ...(fvg.length > 0 ? [{ text: `${fvg.length} FVG`, cls: 'confirmed' }] : []),
                        ...(ob.length === 0 && fvg.length === 0 ? [{ text: 'Нет зон', cls: 'missing' }] : [])
                    ]
                },
                {
                    num: 5,
                    q: 'Подтверждает ли объём намерение?',
                    a: (mX.volume && (mX.volume.summary || mX.volume.trend)) || '—',
                    detail: 'Объём подтверждает, что движение не случайно. ' +
                        'Без объёма даже идеальный сигнал может оказаться ложным.',
                    tags: [{ text: 'Volume', cls: mX.volume && mX.volume.trend === 'increasing' ? 'confirmed' : 'weak' }]
                },
                {
                    num: 6,
                    q: 'Какой вывод делает Module 1?',
                    a: `Bias: ${bias}`,
                    detail: 'Совокупность всех факторов указывает на ' +
                        (bias === 'bullish' ? 'бычий' : bias === 'bearish' ? 'медвежий' : 'нейтральный') +
                        ' сценарий. Это и есть объективная картина рынка, ' +
                        'которую вы должны были увидеть перед принятием решения.',
                    tags: [
                        { text: `Bias: ${bias}`, cls: bias === 'bullish' || bias === 'bearish' ? 'confirmed' : 'weak' }
                    ]
                }
            ];

            let html = '';
            // Intro (отличается от hero в Module X)
            html += `<div class="lt-module1-intro">
                <h2>📖 Почему появился сигнал</h2>
                <p>Module 1 — это <strong>обучающее чтение</strong> рынка. Здесь нет оценки вашего решения — только пошаговое объяснение, как из сырых данных формируется торговая идея. Пройдите 6 шагов, чтобы научиться видеть рынок глазами Module X.</p>
            </div>`;

            // Narrative steps
            html += '<div class="lt-module1-narrative">';
            steps.forEach(s => {
                const tagsHtml = s.tags.map(t => `<span class="lt-module1-tag ${t.cls}">${escapeHtml(t.text)}</span>`).join('');
                html += `<div class="lt-module1-step">
                    <div class="lt-module1-num">${s.num}</div>
                    <div class="lt-module1-content">
                        <div class="lt-module1-q">${escapeHtml(s.q)}</div>
                        <div class="lt-module1-a">${escapeHtml(s.a)}</div>
                        <div class="lt-module1-detail">${escapeHtml(s.detail)}</div>
                        <div style="margin-top:6px;">${tagsHtml}</div>
                    </div>
                </div>`;
            });
            html += '</div>';

            // Footer
            html += `<div style="margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:#8b8b96;text-align:center;">
                Module 1 · Market Analysis Engine · Обучающее чтение рынка
            </div>`;

            return html;
        }

        // ────────────────────────────────────────────────────────────────────
        // MODULE 2 — "ПРОВЕРКА РЕШЕНИЯ"
        // Уникальный UI: verdict-centric.
        // Большой вердикт (✓/✗), 3 ячейки со score, evidence-карточки,
        // сравнение позиции с Module X.
        // Это НЕ копия ни X (карточки), ни 1 (narrative).
        // ────────────────────────────────────────────────────────────────────
        _renderModule2Content(m2, decision, userPos, mX) {
            const correct = m2.isCorrect;
            const verdict = m2.verdict || (correct ? 'CORRECT' : 'INCORRECT');
            const score = m2.score || 0;
            const exp = m2.explanation || {};
            const evidenceList = Array.isArray(exp.evidence) ? exp.evidence : [];
            const missesList = Array.isArray(exp.evidenceMisses) ? exp.evidenceMisses : [];

            let html = '';

            // Большой вердикт-блок
            html += `<div class="lt-module2-verdict ${correct ? 'correct' : 'wrong'}">
                <div class="lt-verdict-mark">${correct ? '✓' : '✗'}</div>
                <div class="lt-verdict-title">${correct ? 'Решение верное' : 'Решение ошибочно'}</div>
                <div class="lt-verdict-sub">${escapeHtml(verdict)} · ваш выбор: <strong>${escapeHtml(String(decision || '—').toUpperCase())}</strong></div>
            </div>`;

            // 3 ячейки score / confidence / match
            const confidence = (mX.confidence && (mX.confidence.percent || mX.confidence)) || '—';
            const matchText = exp.match || (correct ? 'Ваше решение соответствует направлению рынка' : 'Ваше решение не соответствует направлению рынка');
            html += `<div class="lt-module2-score-row">
                <div class="lt-module2-score-cell">
                    <div class="lbl">Score</div>
                    <div class="val">${formatNumber(score)}</div>
                </div>
                <div class="lt-module2-score-cell">
                    <div class="lbl">Confidence</div>
                    <div class="val">${escapeHtml(String(confidence))}${typeof confidence === 'number' || !isNaN(parseFloat(confidence)) ? '%' : ''}</div>
                </div>
                <div class="lt-module2-score-cell">
                    <div class="lbl">Match</div>
                    <div class="val">${correct ? '100%' : '0%'}</div>
                </div>
            </div>`;

            // Risk-блок
            if (exp.risk) {
                html += `<div class="lt-module2-compare" style="border-left:3px solid #ffc107;">
                    <h3>⚠ Оценка риска</h3>
                    <div style="font-size:13px;color:#c8c8d0;line-height:1.5;">${escapeHtml(exp.risk)}</div>
                </div>`;
            }

            // Evidence-карточки (заметил / пропустил)
            html += '<div class="lt-module2-evidence-grid">';
            html += `<div class="lt-module2-evidence-card noticed">
                <h4>✓ Что вы заметили (${evidenceList.length})</h4>
                ${evidenceList.length > 0
                    ? `<ul>${evidenceList.map(e => `<li>${escapeHtml(typeof e === 'string' ? e : (e.text || JSON.stringify(e)))}</li>`).join('')}</ul>`
                    : '<div style="font-size:12px;color:#8b8b96;font-style:italic;">Сигналы не зафиксированы</div>'}
            </div>`;
            html += `<div class="lt-module2-evidence-card missed">
                <h4>✗ Что вы пропустили (${missesList.length})</h4>
                ${missesList.length > 0
                    ? `<ul>${missesList.map(e => `<li>${escapeHtml(typeof e === 'string' ? e : (e.text || JSON.stringify(e)))}</li>`).join('')}</ul>`
                    : '<div style="font-size:12px;color:#8b8b96;font-style:italic;">Всё учтено ✓</div>'}
            </div>`;
            html += '</div>';

            // Контекст решения
            if (exp.contextSummary && (exp.contextSummary.bias || exp.contextSummary.context)) {
                const ctx = exp.contextSummary;
                html += `<div class="lt-module2-compare">
                    <h3>🎯 Контекст вашего решения</h3>
                    <div style="font-size:12px;color:#c8c8d0;line-height:1.6;">
                        <div><strong>Bias:</strong> ${escapeHtml(ctx.bias || '—')}</div>
                        <div><strong>Context:</strong> ${escapeHtml(ctx.context || '—')}</div>
                        <div><strong>Confidence:</strong> ${escapeHtml(ctx.confidence || '—')}</div>
                        <div><strong>Continuation:</strong> ${escapeHtml(ctx.continuationPct || '—')}%</div>
                    </div>
                </div>`;
            }

            // Сравнение позиции (если было размещение)
            if (userPos && (decision === 'long' || decision === 'short')) {
                html += this._renderPositionComparison(userPos, decision, mX);
            }

            // Footer
            html += `<div style="margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:#8b8b96;text-align:center;">
                Module 2 · Decision Evaluation Engine · Проверка вашего решения
            </div>`;

            return html;
        }

        // ────────────────────────────────────────────────────────────────────
        // MODULE 3 — SKELETON (ЗАГЛУШКА)
        // Это НЕ копия Module 2 и не копия Module X.
        // Это каркас с TODO-карточками для будущей авторской методики обучения.
        // Внутренняя бизнес-логика НЕ реализована.
        // ────────────────────────────────────────────────────────────────────
        _renderModule3Content(m3) {
            // TODO-карточки: каждый пункт — будущая фича авторской методики.
            // Эти элементы НЕ подключены к TradingTerminal / DecisionEvaluationEngine.
            // Это интерфейс-заглушка для будущей логики.
            const todoItems = [
                {
                    done: true,
                    text: 'API-контракт модуля зафиксирован (m3.lesson, m3.whyExplanation, m3.missedSignals, m3.cognitiveBiases, m3.learningTips)',
                    tag: 'API'
                },
                {
                    done: false,
                    text: 'Авторская методика обучения: показ ошибочных паттернов мышления трейдера',
                    tag: 'TODO'
                },
                {
                    done: false,
                    text: 'Адаптивный learning path: подстройка сложности под прогресс пользователя',
                    tag: 'TODO'
                },
                {
                    done: false,
                    text: 'Когнитивные искажения: детекция и объяснение',
                    tag: 'TODO'
                },
                {
                    done: false,
                    text: 'Персональные рекомендации на основе истории решений',
                    tag: 'TODO'
                },
                {
                    done: false,
                    text: 'Связь с Module 4 (прогресс) для адаптации методики',
                    tag: 'TODO'
                }
            ];

            let html = '';

            // Hero-заглушка (отличается от hero в Module X)
            html += `<div class="lt-module-skeleton-hero">
                <div class="lt-skeleton-icon">🎓</div>
                <h2>Обучение</h2>
                <p>Здесь будет внедрена <strong>авторская методика обучения</strong> — отдельный модуль, который <em>не повторяет</em> Module 2 и не дублирует Module X. Каркас готов, контент в разработке.</p>
            </div>`;

            // TODO-карточка
            html += '<div class="lt-module-skeleton">';
            html += `<div class="lt-module-skeleton-todo">
                <h3>📋 Roadmap реализации</h3>`;
            todoItems.forEach(item => {
                html += `<div class="lt-skeleton-item ${item.done ? 'done' : ''}">
                    <div class="lt-skeleton-checkbox">${item.done ? '✓' : ''}</div>
                    <div class="lt-skeleton-text">${escapeHtml(item.text)}</div>
                    <div class="lt-skeleton-tag">${escapeHtml(item.tag)}</div>
                </div>`;
            });
            html += `</div>`;

            // Превью того, что вернёт m3 (текущая заглушка)
            html += `<div class="lt-module-skeleton-todo" style="margin-top:6px;">
                <h3>🔌 Текущий API (read-only preview)</h3>
                <div style="font-size:12px;color:#c8c8d0;line-height:1.6;font-family:'JetBrains Mono',monospace;background:#0a0a0c;padding:10px;border-radius:6px;">
                    <div>module3.lesson: ${m3 && m3.lesson ? '<span style="color:#26a69a;">"' + escapeHtml(String(m3.lesson).slice(0, 60)) + '..."</span>' : '<span style="color:#8b8b96;">null</span>'}</div>
                    <div>module3.missedSignals: ${m3 && Array.isArray(m3.missedSignals) ? '<span style="color:#26a69a;">[' + m3.missedSignals.length + ' items]</span>' : '<span style="color:#8b8b96;">[]</span>'}</div>
                    <div>module3.cognitiveBiases: ${m3 && Array.isArray(m3.cognitiveBiases) ? '<span style="color:#26a69a;">[' + m3.cognitiveBiases.length + ' items]</span>' : '<span style="color:#8b8b96;">[]</span>'}</div>
                    <div>module3.learningTips: ${m3 && Array.isArray(m3.learningTips) ? '<span style="color:#26a69a;">[' + m3.learningTips.length + ' items]</span>' : '<span style="color:#8b8b96;">[]</span>'}</div>
                </div>
                <div style="margin-top:8px;font-size:11px;color:#8b8b96;font-style:italic;">
                    Эти данные пока не обрабатываются UI. Методика обучения будет внедрена позже.
                </div>
            </div>`;

            html += '</div>';

            // Footer
            html += `<div style="margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:#8b8b96;text-align:center;">
                Module 3 · Learning Feedback Engine · В разработке
            </div>`;

            return html;
        }

        // ────────────────────────────────────────────────────────────────────
        // MODULE 4 — SKELETON (ЗАГЛУШКА)
        // Это НЕ повтор Module 2.
        // Это каркас для будущей системы аналитики и статистики.
        // Сохранён только публичный API, внутренняя логика НЕ реализована.
        // ────────────────────────────────────────────────────────────────────
        _renderModule4Content() {
            // TODO-карточки: будущая аналитика
            const todoItems = [
                {
                    done: true,
                    text: 'Публичный API Module 4 зафиксирован (getAnalytics, getHistory, getProgress)',
                    tag: 'API'
                },
                {
                    done: false,
                    text: 'Детальная статистика: распределение решений по типам (Long/Short/Wait/No Trade)',
                    tag: 'TODO'
                },
                {
                    done: false,
                    text: 'График прогресса: динамика accuracy/score по сценариям',
                    tag: 'TODO'
                },
                {
                    done: false,
                    text: 'R/R-аналитика: средний риск-реворд по сделкам',
                    tag: 'TODO'
                },
                {
                    done: false,
                    text: 'Слабые места: паттерны ошибок трейдера',
                    tag: 'TODO'
                },
                {
                    done: false,
                    text: 'Сравнение с Module 1/2: где чаще всего расходятся оценки',
                    tag: 'TODO'
                },
                {
                    done: false,
                    text: 'Экспорт статистики (CSV / JSON)',
                    tag: 'TODO'
                }
            ];

            // Получаем минимальный preview из API Module 4
            const m4 = global.PerformanceAnalyticsEngine;
            let apiPreview = '<span style="color:#ef5350;">PerformanceAnalyticsEngine unavailable</span>';
            if (m4 && typeof m4.getAnalytics === 'function') {
                try {
                    const a = m4.getAnalytics();
                    apiPreview = '<span style="color:#26a69a;">getAnalytics() OK</span> · history.total: ' +
                        (a && a.history ? a.history.total : 0) +
                        ' · accuracy: ' +
                        (a && a.accuracy && a.accuracy.overall ? a.accuracy.overall.percent : 0) + '%';
                } catch (e) {
                    apiPreview = '<span style="color:#ffc107;">getAnalytics() error: ' + escapeHtml(e.message) + '</span>';
                }
            }

            let html = '';

            // Hero-заглушка
            html += `<div class="lt-module-skeleton-hero">
                <div class="lt-skeleton-icon">📈</div>
                <h2>Аналитика и статистика</h2>
                <p>Этот модуль <strong>не повторяет</strong> Module 2 — он предназначен для глобальной аналитики вашего прогресса. Каркас с публичным API готов, бизнес-логика будет внедрена после стабилизации методики.</p>
            </div>`;

            // TODO-карточка
            html += '<div class="lt-module-skeleton">';
            html += `<div class="lt-module-skeleton-todo">
                <h3>📋 Roadmap реализации</h3>`;
            todoItems.forEach(item => {
                html += `<div class="lt-skeleton-item ${item.done ? 'done' : ''}">
                    <div class="lt-skeleton-checkbox">${item.done ? '✓' : ''}</div>
                    <div class="lt-skeleton-text">${escapeHtml(item.text)}</div>
                    <div class="lt-skeleton-tag">${escapeHtml(item.tag)}</div>
                </div>`;
            });
            html += `</div>`;

            // Preview публичного API
            html += `<div class="lt-module-skeleton-todo" style="margin-top:6px;">
                <h3>🔌 Публичный API (read-only)</h3>
                <div style="font-size:12px;color:#c8c8d0;line-height:1.6;font-family:'JetBrains Mono',monospace;background:#0a0a0c;padding:10px;border-radius:6px;">
                    <div>PerformanceAnalyticsEngine.getAnalytics() → ${apiPreview}</div>
                    <div>PerformanceAnalyticsEngine.getHistory() → <span style="color:#8b8b96;">[см. live-вызов]</span></div>
                    <div>PerformanceAnalyticsEngine.getProgress() → <span style="color:#8b8b96;">[см. live-вызов]</span></div>
                </div>
                <div style="margin-top:8px;font-size:11px;color:#8b8b96;font-style:italic;">
                    API доступен для внешних вызовов, но UI-визуализация аналитики — в разработке.
                </div>
            </div>`;

            html += '</div>';

            // Footer
            html += `<div style="margin-top:18px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:#8b8b96;text-align:center;">
                Module 4 · Performance Analytics Engine · В разработке
            </div>`;

            return html;
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
