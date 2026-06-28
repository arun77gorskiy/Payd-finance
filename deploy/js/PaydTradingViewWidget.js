/**
 * PaydTradingViewWidget — Единый переиспользуемый компонент TradingView.
 *
 * Использует тот же подход, что и основная страница (index.html):
 *   - Загружает https://s3.tradingview.com/tv.js (один раз на страницу).
 *   - Создаёт виджет через new TradingView.widget({...}).
 *   - Символы в формате BINANCE:BTCUSDT.
 *
 * Архитектура (эквивалент React-компонента):
 *
 *   const containerRef = useRef(null);
 *   const initializedRef = useRef(false);
 *   useEffect(() => {
 *       // mount: init
 *       return () => {
 *           // unmount: cleanup
 *       };
 *   }, []);
 *
 * Использование:
 *
 *   const widget = new PaydTradingViewWidget('container-id', {
 *       symbol: 'BINANCE:BTCUSDT',
 *       interval: '60',
 *       theme: 'dark',
 *       height: 620,
 *       loaderEl: document.getElementById('loader'),
 *       onReady: () => { ... },
 *       onError: (msg) => { ... }
 *   });
 *   widget.init();
 *   // позже:
 *   widget.setSymbol('BINANCE:ETHUSDT');
 *   widget.setInterval('240');
 *   widget.destroy();
 *
 * Защита от проблем:
 *   - Двойная инициализация (initialized флаг + setInterval дедупликация).
 *   - tv.js загружается только один раз (не перезагружается).
 *   - Скрытые контейнеры (display:none) — ожидание через IntersectionObserver
 *     и ResizeObserver до тех пор, пока не появятся реальные размеры.
 *   - Каждый экземпляр получает уникальный container_id, чтобы не было конфликтов.
 *   - destroy() удаляет только iframe и содержимое контейнера,
 *     не трогая глобальный tv.js (он может использоваться другими виджетами).
 *   - Если tv.js уже загружен (например, основной страницей),
 *     новый экземпляр сразу начинает инициализацию, не дожидаясь onload.
 */

(function (global) {
    'use strict';

    const TV_SCRIPT_URL = 'https://s3.tradingview.com/tv.js';

    // === Глобальный кеш состояния загрузки tv.js ===
    let tvScriptLoadPromise = null;
    let tvScriptElement = null;

    /**
     * Загрузить tv.js (один раз на страницу).
     * Возвращает Promise, который резолвится, когда TradingView глобально доступен.
     */
    function loadTradingViewScript() {
        // 1) Если tv.js уже загружен ранее (например, основной страницей)
        if (typeof global.TradingView !== 'undefined' && global.TradingView && global.TradingView.widget) {
            return Promise.resolve(global.TradingView);
        }

        // 2) Если уже идёт загрузка — возвращаем существующий Promise
        if (tvScriptLoadPromise) {
            return tvScriptLoadPromise;
        }

        // 3) Запускаем загрузку
        tvScriptLoadPromise = new Promise((resolve, reject) => {
            // Проверяем, может script уже в DOM, но ещё не выполнен
            const existing = document.querySelector('script[data-payd-tv="1"]');
            if (existing) {
                tvScriptElement = existing;
                if (typeof global.TradingView !== 'undefined' && global.TradingView && global.TradingView.widget) {
                    resolve(global.TradingView);
                    return;
                }
                // script ещё не выполнился — ждём onload
                existing.addEventListener('load', () => {
                    if (typeof global.TradingView !== 'undefined' && global.TradingView) {
                        resolve(global.TradingView);
                    } else {
                        reject(new Error('[PaydTradingViewWidget] tv.js загружен, но TradingView недоступен'));
                    }
                });
                existing.addEventListener('error', () => {
                    reject(new Error('[PaydTradingViewWidget] Ошибка загрузки tv.js'));
                });
                return;
            }

            // Создаём новый script
            const script = document.createElement('script');
            script.type = 'text/javascript';
            script.src = TV_SCRIPT_URL;
            script.async = true;
            script.dataset.paydTv = '1'; // уникальный атрибут для дедупликации
            script.addEventListener('load', () => {
                if (typeof global.TradingView !== 'undefined' && global.TradingView) {
                    resolve(global.TradingView);
                } else {
                    reject(new Error('[PaydTradingViewWidget] tv.js загружен, но TradingView недоступен'));
                }
            });
            script.addEventListener('error', () => {
                tvScriptLoadPromise = null;
                reject(new Error('[PaydTradingViewWidget] Ошибка загрузки tv.js'));
            });
            tvScriptElement = script;
            document.head.appendChild(script);
        });

        return tvScriptLoadPromise;
    }

    /**
     * Генерация уникального container_id для каждого экземпляра виджета.
     * TradingView требует уникальный ID для каждого экземпляра.
     */
    function makeContainerId(prefix) {
        const base = (prefix || 'tv_container')
            .replace(/[^a-zA-Z0-9_]/g, '_')
            .substring(0, 30);
        return base + '_' + Date.now() + '_' + Math.floor(Math.random() * 100000);
    }

    /**
     * PaydTradingViewWidget — класс-обёртка.
     */
    class PaydTradingViewWidget {
        /**
         * @param {string|HTMLElement} container — id контейнера или сам элемент
         * @param {Object} [options]
         *   @prop {string}  [options.symbol='BINANCE:BTCUSDT']
         *   @prop {string}  [options.interval='60']
         *   @prop {string}  [options.theme='dark']
         *   @prop {string}  [options.locale='ru']
         *   @prop {number|string} [options.height=620]
         *   @prop {number|string} [options.width='100%']
         *   @prop {boolean} [options.autosize=true]
         *   @prop {string}  [options.timezone='Etc/UTC']
         *   @prop {boolean} [options.allow_symbol_change=true]
         *   @prop {HTMLElement} [options.loaderEl]   — внешний лоадер
         *   @prop {HTMLElement} [options.errorEl]    — внешний блок ошибки
         *   @prop {Function}     [options.onReady]
         *   @prop {Function}     [options.onError]
         *   @prop {number}       [options.timeoutMs=15000]
         *   @prop {string}       [options.containerIdPrefix] — префикс для уникального id
         */
        constructor(container, options) {
            options = options || {};

            // === Резолв контейнера ===
            this.userContainer = typeof container === 'string'
                ? document.getElementById(container)
                : container;

            if (!this.userContainer) {
                throw new Error('[PaydTradingViewWidget] Контейнер не найден: ' + container);
            }

            // === Опции по умолчанию ===
            this.options = Object.assign(
                {
                    symbol: 'BINANCE:BTCUSDT',
                    interval: '60',
                    theme: 'dark',
                    locale: 'ru',
                    height: 620,
                    width: '100%',
                    autosize: true,
                    timezone: 'Etc/UTC',
                    allow_symbol_change: true,
                    save_image: false,
                    enable_publishing: false,
                    hide_top_toolbar: false,
                    hide_legend: false,
                    hide_side_toolbar: false,
                    withdateranges: true,
                    toolbar_bg: '#0F0F11',
                    backgroundColor: '#0F0F11',
                    gridColor: 'rgba(255, 255, 255, 0.05)',
                    timeoutMs: 15000,
                    containerIdPrefix: 'payd_tv'
                },
                options
            );

            // === Состояние (аналог useRef) ===
            this.state = {
                initialized: false,        // === useRef: защита от двойной инициализации ===
                mounted: false,
                widget: null,
                innerContainer: null,      // уникальный контейнер внутри userContainer
                innerContainerId: null,
                resizeObserver: null,
                intersectionObserver: null,
                loadTimeout: null,
                initPromise: null
            };

            // === Сохраняем размеры дочернего контейнера (если заданы пользователем) ===
            this._userWidth = this.options.width;
            this._userHeight = this.options.height;
        }

        // ============================================================
        // Public API
        // ============================================================

        /**
         * Инициализация виджета (аналог useEffect mount).
         * Идемпотентно: повторные вызовы возвращают тот же Promise.
         */
        init() {
            if (this.state.initialized) {
                return this.state.initPromise || Promise.resolve(this);
            }
            this.state.initialized = true;
            this.state.initPromise = this._mount();
            return this.state.initPromise;
        }

        /**
         * Размонтирование (аналог useEffect cleanup).
         * Удаляет только iframe и содержимое контейнера,
         * не трогая глобальный tv.js.
         */
        destroy() {
            this._unmount();
            this.state.initialized = false;
        }

        /**
         * Смена символа.
         * Пересоздаёт виджет (TradingView widget API не имеет надёжного setSymbol).
         */
        setSymbol(symbol) {
            if (!symbol) return;
            this.options.symbol = symbol;
            if (this.state.mounted) {
                this._rebuild();
            }
        }

        /**
         * Смена таймфрейма.
         */
        setInterval(interval) {
            if (!interval) return;
            this.options.interval = interval;
            if (this.state.mounted) {
                this._rebuild();
            }
        }

        /**
         * Готов ли виджет.
         */
        isReady() {
            return !!(this.state.widget && this.state.mounted);
        }

        /**
         * Получить экземпляр TradingView.widget.
         */
        getWidget() {
            return this.state.widget;
        }

        // ============================================================
        // Private: mount / unmount
        // ============================================================

        async _mount() {
            // 1) Показываем loader
            this._setStatus('loading');

            // 2) Проверяем реальные размеры контейнера
            // (не инициализируем, пока контейнер имеет width=0/height=0)
            const visible = await this._waitForVisible();
            if (!visible) {
                this._setStatus('error', 'Контейнер не имеет видимых размеров');
                if (typeof this.options.onError === 'function') {
                    this.options.onError('Контейнер не имеет видимых размеров');
                }
                return null;
            }

            // 3) Загружаем tv.js (если ещё не загружен)
            let TV;
            try {
                TV = await loadTradingViewScript();
            } catch (e) {
                console.error('[PaydTradingViewWidget] tv.js load failed:', e);
                this._setStatus('error', 'Не удалось загрузить TradingView. Проверьте соединение.');
                if (typeof this.options.onError === 'function') {
                    this.options.onError('tv.js load failed');
                }
                return null;
            }

            // 4) Подготавливаем уникальный контейнер для TradingView внутри нашего контейнера
            this._prepareInnerContainer();

            // 5) Запускаем таймаут
            this._armTimeout();

            // 6) Создаём виджет
            try {
                this.state.widget = new TV.widget(this._buildWidgetConfig());
                this.state.mounted = true;
            } catch (e) {
                console.error('[PaydTradingViewWidget] widget creation failed:', e);
                this._setStatus('error', 'Ошибка создания виджета TradingView');
                if (typeof this.options.onError === 'function') {
                    this.options.onError('widget creation failed');
                }
                return null;
            }

            // 7) Снимаем loader — как только iframe создан
            this._waitForIframe().then(() => {
                this._setStatus('ready');
                if (this.state.loadTimeout) {
                    clearTimeout(this.state.loadTimeout);
                    this.state.loadTimeout = null;
                }
                if (typeof this.options.onReady === 'function') {
                    try { this.options.onReady(); } catch (_) {}
                }
            });

            return this.state.widget;
        }

        _unmount() {
            this.state.mounted = false;

            // === Очищаем observers ===
            if (this.state.resizeObserver) {
                try { this.state.resizeObserver.disconnect(); } catch (_) {}
                this.state.resizeObserver = null;
            }
            if (this.state.intersectionObserver) {
                try { this.state.intersectionObserver.disconnect(); } catch (_) {}
                this.state.intersectionObserver = null;
            }

            // === Очищаем таймаут ===
            if (this.state.loadTimeout) {
                clearTimeout(this.state.loadTimeout);
                this.state.loadTimeout = null;
            }

            // === Удаляем TradingView widget (он сам чистит iframe) ===
            if (this.state.widget) {
                try {
                    if (typeof this.state.widget.remove === 'function') {
                        this.state.widget.remove();
                    }
                } catch (_) {}
                this.state.widget = null;
            }

            // === Удаляем наш внутренний контейнер ===
            if (this.state.innerContainer && this.state.innerContainer.parentNode) {
                try {
                    this.state.innerContainer.parentNode.removeChild(this.state.innerContainer);
                } catch (_) {}
            }
            this.state.innerContainer = null;
            this.state.innerContainerId = null;

            // === НЕ удаляем глобальный tv.js — он может быть нужен другим виджетам ===
        }

        _rebuild() {
            if (!this.state.mounted) return;
            this._unmount();
            return this._mount();
        }

        // ============================================================
        // Private: ожидание видимости контейнера
        // ============================================================

        _waitForVisible() {
            return new Promise((resolve) => {
                // Быстрая проверка: если контейнер уже видим — резолвим сразу
                if (this._isContainerVisible()) {
                    resolve(true);
                    return;
                }

                // Долгое ожидание: через IntersectionObserver + ResizeObserver
                let resolved = false;
                const tryResolve = () => {
                    if (resolved) return;
                    if (this._isContainerVisible()) {
                        resolved = true;
                        if (this.state.intersectionObserver) {
                            try { this.state.intersectionObserver.disconnect(); } catch (_) {}
                        }
                        if (this.state.resizeObserver) {
                            try { this.state.resizeObserver.disconnect(); } catch (_) {}
                        }
                        this.state.intersectionObserver = null;
                        this.state.resizeObserver = null;
                        resolve(true);
                    }
                };

                // IntersectionObserver
                if (typeof IntersectionObserver !== 'undefined') {
                    this.state.intersectionObserver = new IntersectionObserver(
                        (entries) => {
                            for (const entry of entries) {
                                if (entry.isIntersecting) {
                                    tryResolve();
                                }
                            }
                        },
                        { threshold: 0 }
                    );
                    this.state.intersectionObserver.observe(this.userContainer);
                }

                // ResizeObserver — ловит появление ненулевой ширины/высоты
                if (typeof ResizeObserver !== 'undefined') {
                    this.state.resizeObserver = new ResizeObserver((entries) => {
                        for (const entry of entries) {
                            if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
                                tryResolve();
                            }
                        }
                    });
                    this.state.resizeObserver.observe(this.userContainer);
                }

                // Failsafe: 5 секунд ожидания
                setTimeout(() => {
                    if (!resolved) {
                        tryResolve();
                    }
                }, 5000);
            });
        }

        _isContainerVisible() {
            if (!this.userContainer) return false;
            const rect = this.userContainer.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return false;

            // Проверяем, не скрыт ли контейнер через display:none
            const style = window.getComputedStyle(this.userContainer);
            if (style.display === 'none' || style.visibility === 'hidden') return false;

            // Проверяем предков — если хоть один ancestor скрыт, контейнер тоже считается скрытым
            let parent = this.userContainer.parentElement;
            while (parent) {
                const ps = window.getComputedStyle(parent);
                if (ps.display === 'none' || ps.visibility === 'hidden') return false;
                parent = parent.parentElement;
            }

            return true;
        }

        // ============================================================
        // Private: конфигурация и уникальный контейнер
        // ============================================================

        _prepareInnerContainer() {
            // TradingView требует контейнер с известным id.
            // Создаём уникальный id, чтобы не было конфликтов между экземплярами.
            const prefix = this.options.containerIdPrefix || 'payd_tv';
            this.state.innerContainerId = makeContainerId(prefix);

            // Создаём div внутри userContainer
            this.state.innerContainer = document.createElement('div');
            this.state.innerContainer.id = this.state.innerContainerId;
            this.state.innerContainer.style.width = '100%';
            this.state.innerContainer.style.height = '100%';

            // Очищаем userContainer и вставляем наш внутренний
            this._clearContainer(this.userContainer);
            this.userContainer.appendChild(this.state.innerContainer);

            // Гарантируем минимальные размеры userContainer
            const rect = this.userContainer.getBoundingClientRect();
            if (rect.width < 100) {
                this.userContainer.style.width = '100%';
            }
            const minH = typeof this._userHeight === 'number' ? this._userHeight : 620;
            if (rect.height < minH) {
                this.userContainer.style.height = minH + 'px';
            }
            const computed = window.getComputedStyle(this.userContainer);
            if (parseInt(computed.minHeight, 10) < minH) {
                this.userContainer.style.minHeight = minH + 'px';
            }
        }

        _buildWidgetConfig() {
            return {
                autosize: this.options.autosize !== false,
                width: this.options.autosize ? '100%' : (this.options.width || '100%'),
                height: this.options.autosize ? '100%' : (this.options.height || 620),
                symbol: this.options.symbol || 'BINANCE:BTCUSDT',
                interval: this.options.interval || '60',
                timezone: this.options.timezone || 'Etc/UTC',
                theme: this.options.theme || 'dark',
                style: '1',
                locale: this.options.locale || 'ru',
                toolbar_bg: this.options.toolbar_bg || '#0F0F11',
                enable_publishing: !!this.options.enable_publishing,
                hide_top_toolbar: !!this.options.hide_top_toolbar,
                hide_legend: !!this.options.hide_legend,
                hide_side_toolbar: !!this.options.hide_side_toolbar,
                withdateranges: this.options.withdateranges !== false,
                allow_symbol_change: this.options.allow_symbol_change !== false,
                save_image: !!this.options.save_image,
                backgroundColor: this.options.backgroundColor || '#0F0F11',
                gridColor: this.options.gridColor || 'rgba(255, 255, 255, 0.05)',
                container_id: this.state.innerContainerId
            };
        }

        _clearContainer(el) {
            if (!el) return;
            if (typeof el.replaceChildren === 'function') {
                el.replaceChildren();
            } else {
                while (el.firstChild) {
                    el.removeChild(el.firstChild);
                }
            }
        }

        // ============================================================
        // Private: ожидание iframe и loader management
        // ============================================================

        _waitForIframe() {
            return new Promise((resolve) => {
                const target = this.state.innerContainer;
                if (!target) {
                    resolve(false);
                    return;
                }

                // Быстрая проверка — iframe уже есть
                const existing = target.querySelector('iframe');
                if (existing) {
                    resolve(true);
                    return;
                }

                // MutationObserver
                if (typeof MutationObserver === 'undefined') {
                    setTimeout(() => {
                        const iframe = target.querySelector('iframe');
                        resolve(!!iframe);
                    }, 2000);
                    return;
                }

                const observer = new MutationObserver(() => {
                    const iframe = target.querySelector('iframe');
                    if (iframe) {
                        try { observer.disconnect(); } catch (_) {}
                        resolve(true);
                    }
                });
                observer.observe(target, { childList: true, subtree: true });

                // Failsafe: 8 секунд
                setTimeout(() => {
                    try { observer.disconnect(); } catch (_) {}
                    const iframe = target.querySelector('iframe');
                    resolve(!!iframe);
                }, 8000);
            });
        }

        _armTimeout() {
            if (this.state.loadTimeout) clearTimeout(this.state.loadTimeout);
            const ms = this.options.timeoutMs || 15000;
            this.state.loadTimeout = setTimeout(() => {
                if (this.isReady() && this.state.innerContainer && this.state.innerContainer.querySelector('iframe')) {
                    return;
                }
                this._setStatus('error', 'Превышено время ожидания загрузки графика TradingView (15 секунд).');
                if (typeof this.options.onError === 'function') {
                    this.options.onError('timeout');
                }
            }, ms);
        }

        _setStatus(status, message) {
            if (this.options.loaderEl) {
                const loader = this.options.loaderEl;
                if (status === 'loading') {
                    loader.classList.remove('hidden');
                    loader.innerHTML = '<div class="text-text-500 text-sm">Загрузка графика…</div>';
                } else if (status === 'ready') {
                    loader.classList.add('hidden');
                    loader.innerHTML = '';
                } else if (status === 'error') {
                    loader.classList.remove('hidden');
                    loader.innerHTML =
                        '<div class="text-red-400 text-sm p-4 text-center max-w-md">' +
                        '<div class="mb-3">' + (message || 'Ошибка загрузки графика.') + '</div>' +
                        '<button type="button" data-payd-tv-retry="1" ' +
                        'class="px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white rounded-lg text-sm transition-colors">' +
                        'Повторить загрузку</button></div>';
                    const btn = loader.querySelector('[data-payd-tv-retry="1"]');
                    if (btn) {
                        btn.addEventListener('click', () => this.retry());
                    }
                }
            }
        }

        /**
         * Повторная загрузка: уничтожает старый виджет и создаёт новый.
         */
        retry() {
            this._unmount();
            this.state.initialized = true;
            this.state.initPromise = this._mount();
            return this.state.initPromise;
        }
    }

    // === Глобальный экспорт ===
    global.PaydTradingViewWidget = PaydTradingViewWidget;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = PaydTradingViewWidget;
    }
})(typeof window !== 'undefined' ? window : globalThis);
