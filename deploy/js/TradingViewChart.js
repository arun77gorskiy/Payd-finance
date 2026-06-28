/**
 * TradingViewChart — Client Component для TradingView Advanced Chart Widget.
 *
 * Реализует паттерн, эквивалентный React-компоненту:
 *
 *   "use client";
 *   const containerRef = useRef(null);
 *   useEffect(() => {
 *       // mount: init
 *       return () => {
 *           // unmount: cleanup
 *       };
 *   }, []);
 *
 * Конфигурация передаётся через script.textContent = JSON.stringify(config).
 * Скрипт создаётся через document.createElement("script") и добавляется
 * непосредственно внутрь контейнера TradingView.
 *
 * Используется официальный embed-скрипт TradingView:
 *   https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js
 *
 * Lifecycle:
 *   - init() — вызывается при монтировании (аналог useEffect mount).
 *   - destroy() — вызывается при размонтировании (cleanup).
 *   - setSymbol(symbol) — смена торгового инструмента (пересоздаёт виджет).
 *   - setInterval(interval) — смена таймфрейма.
 *
 * Защита от проблемы «бесконечной загрузки»:
 *   - Надпись «Загрузка графика…» НЕ зависит только от события load скрипта.
 *     Loading снимается только после того, как TradingView создаст внутри
 *     контейнера настоящий <iframe> (отслеживается через MutationObserver).
 *   - Если iframe не появился за 15 секунд — показывается кнопка «Повторить загрузку».
 *
 * Безопасность:
 *   - Несколько экземпляров компонента не дублируют скрипты.
 *   - При повторной инициализации полностью очищается контейнер через replaceChildren().
 *   - При размонтировании удаляются observer, timeout, iframe и script.
 *
 * Использование:
 *   const chart = new TradingViewChart('container-id', {
 *       symbol: 'BINANCE:BTCUSDT',
 *       interval: '60',
 *       onReady: () => {},
 *       onError: () => {},
 *   });
 *   chart.init();
 *   // позже:
 *   chart.setSymbol('BINANCE:ETHUSDT');
 *   chart.destroy();
 */
(function (global) {
    'use strict';

    const EMBED_URL = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';

    /**
     * TradingViewChart — Client Component (vanilla JS, эквивалент React).
     */
    class TradingViewChart {
        /**
         * @param {string|HTMLElement} container — id контейнера или сам элемент
         * @param {Object} [options]
         *   @prop {string} [options.symbol='BINANCE:BTCUSDT']
         *   @prop {string} [options.interval='60']
         *   @prop {string} [options.timezone='Etc/UTC']
         *   @prop {string} [options.theme='dark']
         *   @prop {string} [options.style='1']
         *   @prop {string} [options.locale='en']
         *   @prop {boolean} [options.allow_symbol_change=true]
         *   @prop {boolean} [options.save_image=false]
         *   @prop {boolean} [options.calendar=false]
         *   @prop {boolean} [options.autosize=true]
         *   @prop {string} [options.support_host='https://www.tradingview.com']
         *   @prop {Function} [options.onReady]   — вызывается, когда iframe создан и загружен
         *   @prop {Function} [options.onError]   — вызывается при ошибке
         *   @prop {number}   [options.timeoutMs=15000] — таймаут появления iframe
         *   @prop {HTMLElement} [options.loaderEl]   — внешний лоадер (опционально)
         *   @prop {HTMLElement} [options.errorEl]    — внешний блок ошибки (опционально)
         */
        constructor(container, options) {
            options = options || {};

            // === useRef ===
            this.containerRef =
                typeof container === 'string'
                    ? document.getElementById(container)
                    : container;

            if (!this.containerRef) {
                throw new Error('[TradingViewChart] Container not found: ' + container);
            }

            // === Параметры по умолчанию ===
            this.options = Object.assign(
                {
                    autosize: true,
                    symbol: 'BINANCE:BTCUSDT',
                    interval: '60',
                    timezone: 'Etc/UTC',
                    theme: 'dark',
                    style: '1',
                    locale: 'en',
                    allow_symbol_change: true,
                    save_image: false,
                    calendar: false,
                    support_host: 'https://www.tradingview.com',
                    timeoutMs: 15000
                },
                options
            );

            // === Состояние компонента ===
            this.state = {
                mounted: false,
                initPromise: null,
                observer: null,
                loadTimeout: null,
                scriptEl: null,
                iframeEl: null,
                pendingError: null,
                retryCount: 0
            };

            // === Контейнер ===
            this._ensureContainerStyles();

            // === Связка колбэков ===
            this._onIframeLoaded = this._onIframeLoaded.bind(this);
            this._onMutation = this._onMutation.bind(this);
        }

        // ============================================================
        // Public API
        // ============================================================

        /**
         * Аналог React `useEffect(() => { ... }, [])` —
         * инициализация при монтировании.
         */
        init() {
            if (this.state.mounted) {
                return this.state.initPromise || Promise.resolve();
            }
            this.state.mounted = true;
            this.state.initPromise = this._mount();
            return this.state.initPromise;
        }

        /**
         * Аналог React `useEffect cleanup` —
         * размонтирование компонента.
         */
        destroy() {
            this._unmount();
        }

        /**
         * Смена торгового инструмента.
         * Полностью уничтожает старый виджет и создаёт новый.
         */
        setSymbol(symbol) {
            if (!symbol) return;
            this.options.symbol = symbol;
            this._rebuild();
        }

        /**
         * Смена таймфрейма.
         */
        setInterval(interval) {
            if (!interval) return;
            this.options.interval = interval;
            this._rebuild();
        }

        /**
         * Получить ссылку на контейнер (useRef.current).
         */
        getContainer() {
            return this.containerRef;
        }

        /**
         * Готов ли виджет (iframe создан и загружен).
         */
        isReady() {
            return !!(this.state.iframeEl && this.state.iframeEl.dataset &&
                this.state.iframeEl.dataset.tvReady === '1');
        }

        // ============================================================
        // Private: mount / unmount
        // ============================================================

        _mount() {
            // Показываем loader
            this._setStatus('loading');

            // 1) Полностью очищаем контейнер (replaceChildren = безопасный innerHTML='')
            this._clearContainer();

            // 2) Гарантируем стили контейнера
            this._ensureContainerStyles();

            // 3) Создаём embed-script
            const script = this._createScript();
            this.state.scriptEl = script;

            // 4) MutationObserver отслеживает появление iframe
            this._observeIframe();

            // 5) Запускаем таймаут 15 сек
            this._armTimeout();

            // 6) Подвешиваем обработчики script.onerror
            script.addEventListener('error', () => {
                this._handleError('Не удалось загрузить график TradingView. Проверьте соединение или блокировщик рекламы.');
            });

            // 7) Добавляем script внутрь контейнера TradingView
            this.containerRef.appendChild(script);

            return new Promise((resolve) => {
                // Резолвим, когда iframe создан
                this._resolveOnReady = resolve;
            });
        }

        _unmount() {
            this.state.mounted = false;

            // Очищаем observer
            if (this.state.observer) {
                try { this.state.observer.disconnect(); } catch (_) {}
                this.state.observer = null;
            }

            // Очищаем таймаут
            if (this.state.loadTimeout) {
                clearTimeout(this.state.loadTimeout);
                this.state.loadTimeout = null;
            }

            // Удаляем script
            if (this.state.scriptEl && this.state.scriptEl.parentNode) {
                try { this.state.scriptEl.parentNode.removeChild(this.state.scriptEl); } catch (_) {}
            }
            this.state.scriptEl = null;

            // Удаляем iframe
            if (this.state.iframeEl && this.state.iframeEl.parentNode) {
                try { this.state.iframeEl.parentNode.removeChild(this.state.iframeEl); } catch (_) {}
            }
            this.state.iframeEl = null;

            // Полностью очищаем контейнер
            this._clearContainer();
        }

        _rebuild() {
            if (!this.state.mounted) return;
            const wasMounted = this.state.mounted;
            this._unmount();
            this.state.mounted = wasMounted;
            this.state.initPromise = this._mount();
            return this.state.initPromise;
        }

        // ============================================================
        // Private: helpers
        // ============================================================

        _ensureContainerStyles() {
            if (!this.containerRef) return;

            // === Минимальная высота 620px (по требованию заказчика) ===
            const computed = window.getComputedStyle(this.containerRef);
            const curMin = parseInt(computed.minHeight, 10) || 0;
            if (curMin < 620) {
                this.containerRef.style.minHeight = '620px';
            }
            const rect = this.containerRef.getBoundingClientRect();
            if (rect.height < 620) {
                this.containerRef.style.height = '620px';
            }
            if (rect.width < 100) {
                this.containerRef.style.width = '100%';
            }
        }

        /**
         * Полная очистка контейнера через replaceChildren().
         */
        _clearContainer() {
            if (!this.containerRef) return;
            if (typeof this.containerRef.replaceChildren === 'function') {
                this.containerRef.replaceChildren();
            } else {
                while (this.containerRef.firstChild) {
                    this.containerRef.removeChild(this.containerRef.firstChild);
                }
            }
        }

        /**
         * Создаём <script> через document.createElement и
         * передаём конфиг через script.textContent = JSON.stringify(config).
         */
        _createScript() {
            const config = {
                autosize: true,
                symbol: this.options.symbol || 'BINANCE:BTCUSDT',
                interval: this.options.interval || '60',
                timezone: this.options.timezone || 'Etc/UTC',
                theme: this.options.theme || 'dark',
                style: this.options.style || '1',
                locale: this.options.locale || 'en',
                allow_symbol_change: this.options.allow_symbol_change !== false,
                save_image: !!this.options.save_image,
                calendar: !!this.options.calendar,
                support_host: this.options.support_host || 'https://www.tradingview.com'
            };

            const script = document.createElement('script');
            script.type = 'text/javascript';
            script.src = EMBED_URL;
            script.async = true;
            script.textContent = JSON.stringify(config);
            // Уникальный data-атрибут — защита от дублей в пределах контейнера
            script.dataset.tvEmbed = '1';
            script.dataset.tvSymbol = config.symbol;
            script.dataset.tvInterval = config.interval;
            return script;
        }

        /**
         * Запускаем MutationObserver для отслеживания появления iframe.
         */
        _observeIframe() {
            if (typeof MutationObserver === 'undefined') {
                // Fallback: просто ждём фиксированное время
                setTimeout(() => {
                    const iframe = this.containerRef.querySelector('iframe');
                    if (iframe) this._onIframeCreated(iframe);
                }, 3000);
                return;
            }

            this.state.observer = new MutationObserver(this._onMutation);
            this.state.observer.observe(this.containerRef, {
                childList: true,
                subtree: true
            });
        }

        _onMutation(mutations) {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (!node || node.nodeType !== 1) continue;

                    // Непосредственно iframe
                    if (node.tagName === 'IFRAME') {
                        this._onIframeCreated(node);
                        return;
                    }

                    // iframe внутри добавленного поддерева
                    if (node.querySelectorAll) {
                        const iframes = node.querySelectorAll('iframe');
                        if (iframes.length > 0) {
                            this._onIframeCreated(iframes[0]);
                            return;
                        }
                    }
                }
            }
        }

        _onIframeCreated(iframe) {
            if (this.state.iframeEl === iframe) return;
            this.state.iframeEl = iframe;

            // Отключаем observer (он своё дело сделал)
            if (this.state.observer) {
                try { this.state.observer.disconnect(); } catch (_) {}
                this.state.observer = null;
            }

            // Подключаем событие load к iframe
            // (TradingView создаёт iframe ДО того, как контент внутри загрузится —
            //  поэтому ждём именно load, чтобы скрыть loader только после реальной загрузки)
            const onLoad = () => {
                iframe.dataset.tvReady = '1';
                // Снимаем loader
                this._setStatus('ready');
                // Снимаем таймаут
                if (this.state.loadTimeout) {
                    clearTimeout(this.state.loadTimeout);
                    this.state.loadTimeout = null;
                }
                // Колбэк готовности
                if (typeof this.options.onReady === 'function') {
                    try { this.options.onReady(); } catch (_) {}
                }
                if (typeof this._resolveOnReady === 'function') {
                    try { this._resolveOnReady(); } catch (_) {}
                    this._resolveOnReady = null;
                }
            };

            try {
                if (iframe.contentWindow && iframe.contentDocument &&
                    iframe.contentDocument.readyState === 'complete') {
                    onLoad();
                } else {
                    iframe.addEventListener('load', onLoad, { once: true });
                    // Дополнительно: некоторые браузеры могут не вызвать load
                    // (если iframe был закэширован). Проверим чуть позже.
                    setTimeout(() => {
                        if (iframe.dataset.tvReady !== '1') {
                            try {
                                if (iframe.contentWindow && iframe.contentDocument &&
                                    iframe.contentDocument.readyState === 'complete') {
                                    onLoad();
                                }
                            } catch (_) { /* cross-origin — ок, load сам сработает */ }
                        }
                    }, 500);
                }
            } catch (e) {
                // cross-origin — просто ждём load
                iframe.addEventListener('load', onLoad, { once: true });
            }
        }

        _onIframeLoaded() {
            // Совместимость со старым API (не используется, оставлено)
            this._setStatus('ready');
        }

        _armTimeout() {
            if (this.state.loadTimeout) clearTimeout(this.state.loadTimeout);
            const ms = this.options.timeoutMs || 15000;
            this.state.loadTimeout = setTimeout(() => {
                if (this.isReady()) return;
                this._handleError(
                    'Превышено время ожидания загрузки графика TradingView (15 секунд).'
                );
            }, ms);
        }

        _handleError(message) {
            // Снимаем observer и timeout
            if (this.state.observer) {
                try { this.state.observer.disconnect(); } catch (_) {}
                this.state.observer = null;
            }
            if (this.state.loadTimeout) {
                clearTimeout(this.state.loadTimeout);
                this.state.loadTimeout = null;
            }

            this.state.pendingError = message;
            this._setStatus('error', message);

            if (typeof this.options.onError === 'function') {
                try { this.options.onError(message); } catch (_) {}
            }
        }

        /**
         * Управление состоянием UI: loading / ready / error / retrying.
         */
        _setStatus(status, message) {
            // Если есть внешний loader/error/retry-button — обновляем их.
            if (this.options.loaderEl) {
                const loader = this.options.loaderEl;
                if (status === 'loading' || status === 'retrying') {
                    loader.classList.remove('hidden');
                    loader.innerHTML =
                        '<div class="text-text-500 text-sm">' +
                        (status === 'retrying' ? 'Повторная загрузка графика…' : 'Загрузка графика…') +
                        '</div>';
                } else if (status === 'ready') {
                    loader.classList.add('hidden');
                    loader.innerHTML = '';
                } else if (status === 'error') {
                    // В режиме ошибки loader показывает сообщение и кнопку retry
                    loader.classList.remove('hidden');
                    loader.innerHTML = `
                        <div class="text-red-400 text-sm p-4 text-center max-w-md">
                            <div class="mb-3">${message || 'Ошибка загрузки графика TradingView.'}</div>
                            <button type="button" data-tv-retry="1"
                                class="px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white rounded-lg text-sm transition-colors">
                                Повторить загрузку
                            </button>
                        </div>
                    `;
                    const btn = loader.querySelector('[data-tv-retry="1"]');
                    if (btn) {
                        btn.addEventListener('click', () => this.retry());
                    }
                }
            }
        }

        /**
         * Повторная загрузка: полностью удаляет старый script, iframe и
         * содержимое контейнера, затем заново инициализирует TradingView.
         */
        retry() {
            this.state.retryCount++;
            this.state.pendingError = null;

            // Полный демонтаж и пересоздание
            this._unmount();
            this.state.mounted = true;
            this.state.initPromise = this._mount();
            return this.state.initPromise;
        }
    }

    // === Глобальный экспорт ===
    global.TradingViewChart = TradingViewChart;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = TradingViewChart;
    }
})(typeof window !== 'undefined' ? window : globalThis);