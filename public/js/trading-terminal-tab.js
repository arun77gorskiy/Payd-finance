/**
 * trading-terminal-tab.js — вкладка "Trading Terminal" внутри PAYD Trading Lab.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  Назначение:
 *    Отображает профессиональный торговый терминал на базе TradingView и
 *    панели с результатами анализа Module X (coreAnalysisEngine) в
 *    реальном времени. Практика решений выполняется через Module 2
 *    (DecisionEvaluationEngine).
 *
 *  Архитектурные принципы (ВАЖНО):
 *    1. Терминал НЕ выполняет собственного анализа. Он только читает
 *       выходные данные Module X и прокидывает их в UI.
 *    2. Терминал НЕ модифицирует Module X / Module 1 / Module 2 / Trainer.
 *    3. Практические решения (Long/Short/Wait/No Trade) передаются в
 *       DecisionEvaluationEngine.evaluate() — существующий Module 2.
 *
 *  Использование:
 *    <div id="lab-pane-terminal" class="lab-pane">...</div>
 *    <script src="js/...trading-terminal-tab.js"></script>
 *    <script>TerminalTab.init();</script>
 * ════════════════════════════════════════════════════════════════════════════
 */

(function (global) {
    'use strict';

    if (!global) throw new Error('[TerminalTab] global is required');

    // ================================================================
    // КОНФИГУРАЦИЯ
    // ================================================================

    const SYMBOLS = [
        { id: 'BTCUSDT', tvSymbol: 'BINANCE:BTCUSDT', label: 'BTC/USDT', basePrice: 42000 },
        { id: 'ETHUSDT', tvSymbol: 'BINANCE:ETHUSDT', label: 'ETH/USDT', basePrice: 2300 },
        { id: 'SOLUSDT', tvSymbol: 'BINANCE:SOLUSDT', label: 'SOL/USDT', basePrice: 95 },
        { id: 'BNBUSDT', tvSymbol: 'BINANCE:BNBUSDT', label: 'BNB/USDT', basePrice: 310 },
        { id: 'XRPUSDT', tvSymbol: 'BINANCE:XRPUSDT', label: 'XRP/USDT', basePrice: 0.55 },
        { id: 'ADAUSDT', tvSymbol: 'BINANCE:ADAUSDT', label: 'ADA/USDT', basePrice: 0.45 },
        { id: 'DOGEUSDT', tvSymbol: 'BINANCE:DOGEUSDT', label: 'DOGE/USDT', basePrice: 0.08 },
        { id: 'AVAXUSDT', tvSymbol: 'BINANCE:AVAXUSDT', label: 'AVAX/USDT', basePrice: 28 },
        { id: 'LINKUSDT', tvSymbol: 'BINANCE:LINKUSDT', label: 'LINK/USDT', basePrice: 14 },
        { id: 'MATICUSDT', tvSymbol: 'BINANCE:MATICUSDT', label: 'MATIC/USDT', basePrice: 0.85 }
    ];

    const TIMEFRAMES = [
        { id: '1m',  binance: '1m',  tv: '1',   label: '1m',  seconds: 60 },
        { id: '5m',  binance: '5m',  tv: '5',   label: '5m',  seconds: 300 },
        { id: '15m', binance: '15m', tv: '15',  label: '15m', seconds: 900 },
        { id: '1H',  binance: '1h',  tv: '60',  label: '1H',  seconds: 3600 },
        { id: '4H',  binance: '4h',  tv: '240', label: '4H',  seconds: 14400 },
        { id: '1D',  binance: '1d',  tv: 'D',   label: '1D',  seconds: 86400 },
        { id: '1W',  binance: '1w',  tv: 'W',   label: '1W',  seconds: 604800 }
    ];

    // ================================================================
    // СОСТОЯНИЕ ТЕРМИНАЛА
    // ================================================================

    const state = {
        symbol: SYMBOLS[0],
        timeframe: TIMEFRAMES[3], // 1H по умолчанию
        candles: [],              // Текущие OHLCV-свечи
        analysis: null,           // Результат Module X
        verdict: null,            // Результат Module 2
        lastPrice: null,
        loading: false,
        tvWidget: null,
        initialized: false
    };

    // ================================================================
    // УТИЛИТЫ
    // ================================================================

    function $(id) { return document.getElementById(id); }
    function fmt(n, d) { d = d == null ? 2 : d; if (n == null || isNaN(n)) return '—'; return Number(n).toFixed(d); }
    function fmtPrice(n) {
        if (n == null || isNaN(n)) return '—';
        const v = Number(n);
        if (v >= 1000) return v.toFixed(2);
        if (v >= 1) return v.toFixed(4);
        return v.toFixed(6);
    }
    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function debounce(fn, ms) {
        let t; return function () { const a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); };
    }

    // ================================================================
    // ЗАГРУЗКА OHLCV С BINANCE (публичный API, без авторизации)
    // ================================================================

    async function fetchBinanceCandles(symbol, interval, limit) {
        limit = limit || 200;
        const params = 'symbol=' + symbol + '&interval=' + interval + '&limit=' + limit;
        // Список эндпоинтов Binance — пробуем по очереди при сбое
        const endpoints = [
            'https://api.binance.com/api/v3/klines?' + params,
            'https://api1.binance.com/api/v3/klines?' + params,
            'https://api2.binance.com/api/v3/klines?' + params,
            'https://api3.binance.com/api/v3/klines?' + params,
            'https://data-api.binance.vision/api/v3/klines?' + params
        ];
        for (let i = 0; i < endpoints.length; i++) {
            try {
                const resp = await fetch(endpoints[i], { method: 'GET', mode: 'cors' });
                if (!resp.ok) continue;
                const rows = await resp.json();
                if (!Array.isArray(rows) || rows.length === 0) continue;
                // Binance формат: [openTime, open, high, low, close, volume, closeTime, ...]
                return rows.map(function (r) {
                    return {
                        time: Math.floor(r[0] / 1000),
                        open: parseFloat(r[1]),
                        high: parseFloat(r[2]),
                        low: parseFloat(r[3]),
                        close: parseFloat(r[4]),
                        volume: parseFloat(r[5])
                    };
                });
            } catch (e) {
                console.warn('[TerminalTab] fetchBinanceCandles endpoint', i, 'failed:', e.message);
                continue;
            }
        }
        // Все эндпоинты не сработали — генерируем синтетические свечи
        // для демонстрации (на основе текущего времени и цены по умолчанию)
        console.warn('[TerminalTab] Все Binance эндпоинты недоступны, генерируем синтетические свечи');
        return generateSyntheticCandles(symbol, interval, limit);
    }

    /**
     * Генерация синтетических свечей на основе текущего времени.
     * Используется как fallback, когда все Binance эндпоинты недоступны.
     * Создаёт правдоподобный ценовой ряд с волатильностью.
     */
    function generateSyntheticCandles(symbol, interval, limit) {
        const intervalSeconds = {
            '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600,
            '2h': 7200, '4h': 14400, '1d': 86400, '1w': 604800
        };
        const step = intervalSeconds[interval] || 3600;
        // Базовая цена зависит от символа
        const basePrices = {
            'BTCUSDT': 62000, 'ETHUSDT': 2400, 'BNBUSDT': 580, 'SOLUSDT': 145,
            'XRPUSDT': 0.6, 'ADAUSDT': 0.45, 'DOGEUSDT': 0.13, 'AVAXUSDT': 35,
            'LINKUSDT': 14, 'DOTUSDT': 7, 'MATICUSDT': 0.7, 'LTCUSDT': 75
        };
        const basePrice = basePrices[symbol] || 100;
        const now = Math.floor(Date.now() / 1000);
        const candles = [];
        // Используем детерминированный seed на основе символа для повторяемости
        let seed = 0;
        for (let i = 0; i < symbol.length; i++) seed = (seed * 31 + symbol.charCodeAt(i)) & 0xffffffff;
        function rand() {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            return seed / 0x7fffffff;
        }
        let price = basePrice;
        for (let i = limit - 1; i >= 0; i--) {
            const time = now - i * step;
            // Дрейф цены с шумом
            const drift = (rand() - 0.5) * basePrice * 0.02;
            const open = price;
            const close = price + drift;
            const high = Math.max(open, close) + rand() * basePrice * 0.01;
            const low = Math.min(open, close) - rand() * basePrice * 0.01;
            const volume = 1000 + rand() * 5000;
            candles.push({ time, open, high, low, close, volume });
            price = close;
        }
        return candles;
    }

    // ================================================================
    // ВЫЗОВ MODULE X (coreAnalysisEngine)
    // ================================================================

    function runModuleX(candles) {
        if (!global.coreAnalysisEngine || typeof global.coreAnalysisEngine.analyzeMarket !== 'function') {
            console.error('[TerminalTab] coreAnalysisEngine не загружен');
            return null;
        }
        if (!candles || candles.length < 10) return null;
        // Берём последнюю цену как "уровень" для интерпретации position
        const last = candles[candles.length - 1].close;
        return global.coreAnalysisEngine.analyzeMarket({ history: candles, level: last });
    }

    // ================================================================
    // ВЫЗОВ MODULE 2 (DecisionEvaluationEngine)
    // ================================================================

    function runModule2(analysis, userDecision, userEvidence) {
        if (!global.DecisionEvaluationEngine || typeof global.DecisionEvaluationEngine.evaluate !== 'function') {
            console.error('[TerminalTab] DecisionEvaluationEngine не загружен');
            return null;
        }
        return global.DecisionEvaluationEngine.evaluate({
            marketAnalysis: analysis,
            userDecision: userDecision,
            userEvidence: userEvidence || []
        });
    }

    // ================================================================
    // TRADINGVIEW WIDGET
    // ================================================================

    function loadTradingViewScript() {
        return new Promise(function (resolve, reject) {
            if (global.TradingView && global.TradingView.widget) { resolve(); return; }
            const existing = document.querySelector('script[data-tv-script]');
            if (existing) {
                existing.addEventListener('load', resolve);
                existing.addEventListener('error', reject);
                return;
            }
            const s = document.createElement('script');
            s.src = 'https://s3.tradingview.com/tv.js';
            s.async = true;
            s.setAttribute('data-tv-script', 'terminal');
            s.onload = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    function renderTradingViewChart(symbol, tvInterval, containerId) {
        const container = $(containerId);
        if (!container) return;
        // TradingView требует уникальный id контейнера при пересоздании
        const cid = containerId + '_' + Date.now();
        container.innerHTML = '<div id="' + cid + '" style="height:100%;width:100%"></div>';

        function build() {
            if (!global.TradingView || !global.TradingView.widget) return;
            try {
                // Удаляем предыдущий виджет, если есть
                if (state.tvWidget && typeof state.tvWidget.remove === 'function') {
                    try { state.tvWidget.remove(); } catch (e) { /* noop */ }
                    state.tvWidget = null;
                }
                state.tvWidget = new global.TradingView.widget({
                    autosize: true,
                    symbol: symbol,
                    interval: tvInterval,
                    timezone: 'Etc/UTC',
                    theme: 'dark',
                    style: '1',
                    locale: 'ru',
                    toolbar_bg: '#0F0F11',
                    enable_publishing: false,
                    allow_symbol_change: true,
                    save_image: false,
                    hide_top_toolbar: false,
                    hide_legend: false,
                    withdateranges: true,
                    studies: ['Volume@tv-basicstudies'],
                    container_id: cid,
                    backgroundColor: '#0F0F11',
                    gridColor: 'rgba(255,255,255,0.05)'
                });
            } catch (e) {
                console.error('[TerminalTab] TV widget error:', e);
            }
        }

        if (global.TradingView && global.TradingView.widget) { build(); return; }
        loadTradingViewScript().then(build).catch(function (e) {
            console.error('[TerminalTab] Не удалось загрузить TradingView:', e);
        });
    }

    // ================================================================
    // РЕНДЕР ИНСТРУМЕНТОВ (symbols, timeframes, fullscreen)
    // ================================================================

    function renderSymbolSelect() {
        const sel = $('terminal-symbol-select');
        if (!sel) return;
        sel.innerHTML = SYMBOLS.map(function (s) {
            return '<option value="' + s.id + '"' + (s.id === state.symbol.id ? ' selected' : '') + '>' + escapeHtml(s.label) + '</option>';
        }).join('');
    }

    function renderTimeframeButtons() {
        const wrap = $('terminal-timeframes');
        if (!wrap) return;
        wrap.innerHTML = TIMEFRAMES.map(function (tf) {
            const active = tf.id === state.timeframe.id ? ' active' : '';
            return '<button data-tf="' + tf.id + '" class="terminal-tf-btn' + active + '">' + escapeHtml(tf.label) + '</button>';
        }).join('');
        wrap.querySelectorAll('.terminal-tf-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                const tf = TIMEFRAMES.find(function (t) { return t.id === btn.dataset.tf; });
                if (tf) switchTimeframe(tf);
            });
        });
    }

    function setActiveTimeframe() {
        document.querySelectorAll('.terminal-tf-btn').forEach(function (btn) {
            btn.classList.toggle('active', btn.dataset.tf === state.timeframe.id);
        });
    }

    // ================================================================
    // РЕНДЕР ПАНЕЛЕЙ АНАЛИЗА (из Module X)
    // ================================================================

    function renderPriceHeader(analysis, candles) {
        if (!candles || candles.length === 0) return;
        const last = candles[candles.length - 1];
        const prev = candles[candles.length - 2] || last;
        const change = last.close - prev.close;
        const changePct = prev.close ? (change / prev.close) * 100 : 0;
        const cls = change >= 0 ? 'text-green-400' : 'text-red-400';
        const sign = change >= 0 ? '+' : '';

        const elPrice = $('terminal-last-price');
        if (elPrice) elPrice.textContent = '$' + fmtPrice(last.close);
        const elCh = $('terminal-change');
        if (elCh) {
            elCh.textContent = sign + fmt(changePct, 2) + '%';
            elCh.className = 'font-mono text-sm ' + cls;
        }
        const elHi = $('terminal-high');
        if (elHi) elHi.textContent = '$' + fmtPrice(last.high);
        const elLo = $('terminal-low');
        if (elLo) elLo.textContent = '$' + fmtPrice(last.low);
        const elVol = $('terminal-vol');
        if (elVol) elVol.textContent = fmt(last.volume, 0);
    }

    // Универсальная панель с маркированным списком детекций
    function renderPanel(containerId, title, items) {
        const el = $(containerId);
        if (!el) return;
        if (!items || items.length === 0) {
            el.innerHTML = '<div class="terminal-panel-empty">Нет сигналов</div>';
            return;
        }
        el.innerHTML = items.map(function (it) {
            const tone = it.tone || 'neutral';
            return '<div class="terminal-signal terminal-signal-' + tone + '">' +
                '<span class="terminal-signal-dot"></span>' +
                '<span class="terminal-signal-label">' + escapeHtml(it.label) + '</span>' +
                (it.value ? '<span class="terminal-signal-value">' + escapeHtml(it.value) + '</span>' : '') +
                '</div>';
        }).join('');
    }

    // Цвет маркера: bullish (зелёный), bearish (красный), neutral (серый), info (синий), warn (жёлтый)
    function tone(kind, direction) {
        if (kind === 'bullish') return 'bullish';
        if (kind === 'bearish') return 'bearish';
        if (direction === 'bullish' || direction === 'long') return 'bullish';
        if (direction === 'bearish' || direction === 'short') return 'bearish';
        return 'neutral';
    }

    function renderAnalysisPanels(analysis) {
        if (!analysis) {
            ['terminal-panel-market-structure', 'terminal-panel-trend', 'terminal-panel-smart-money',
             'terminal-panel-price-action', 'terminal-panel-volume', 'terminal-panel-liquidity',
             'terminal-panel-volatility', 'terminal-panel-momentum', 'terminal-panel-levels',
             'terminal-panel-probability'].forEach(function (id) { renderPanel(id, '', []); });
            $('terminal-confidence').textContent = '—';
            $('terminal-bias').textContent = '—';
            return;
        }

        // --- 1. Market Structure ---
        const s = analysis.structure || {};
        const msItems = [];
        if (s.type) msItems.push({ label: 'Тип структуры', value: s.type, tone: tone(s.type) });
        if (typeof s.hh === 'number') msItems.push({ label: 'HH (Higher High)', value: String(s.hh), tone: 'bullish' });
        if (typeof s.hl === 'number') msItems.push({ label: 'HL (Higher Low)', value: String(s.hl), tone: 'bullish' });
        if (typeof s.lh === 'number') msItems.push({ label: 'LH (Lower High)', value: String(s.lh), tone: 'bearish' });
        if (typeof s.ll === 'number') msItems.push({ label: 'LL (Lower Low)', value: String(s.ll), tone: 'bearish' });
        if (s.structureShift && s.structureShift.type) {
            const dir = (s.structureShift.type.indexOf('bull') >= 0) ? 'bullish' : 'bearish';
            msItems.push({ label: 'BOS/CHoCH', value: s.structureShift.type.toUpperCase(), tone: tone(dir) });
        }
        renderPanel('terminal-panel-market-structure', '', msItems);

        // --- 2. Trend ---
        const tr = analysis.trend || {};
        const trItems = [];
        if (tr.type) {
            const tk = (tr.type.indexOf('bull') >= 0) ? 'bullish' : (tr.type.indexOf('bear') >= 0 ? 'bearish' : 'neutral');
            trItems.push({ label: 'Trend', value: tr.type, tone: tone(tk) });
        }
        if (typeof tr.strength === 'number') {
            trItems.push({ label: 'Сила', value: (tr.strength * 100).toFixed(0) + '%', tone: 'info' });
        }
        // Range / Consolidation / Expansion / Compression
        if (s.type === 'range') trItems.push({ label: 'Режим', value: 'Range', tone: 'warn' });
        if (s.type === 'consolidation') trItems.push({ label: 'Режим', value: 'Consolidation', tone: 'warn' });
        if (s.type === 'expansion') trItems.push({ label: 'Режим', value: 'Expansion', tone: 'info' });
        if (s.type === 'compression') trItems.push({ label: 'Режим', value: 'Compression', tone: 'warn' });
        renderPanel('terminal-panel-trend', '', trItems);

        // --- 3. Smart Money ---
        const smc = analysis.smc || {};
        const smcItems = [];
        if (Array.isArray(smc.bos) && smc.bos.length) smcItems.push({ label: 'BOS', value: smc.bos.length + ' событий', tone: 'info' });
        if (Array.isArray(smc.choch) && smc.choch.length) smcItems.push({ label: 'CHoCH', value: smc.choch.length + ' событий', tone: 'info' });
        if (Array.isArray(smc.orderBlocks) && smc.orderBlocks.length) smcItems.push({ label: 'Order Blocks', value: smc.orderBlocks.length + ' зон', tone: 'info' });
        if (Array.isArray(smc.fairValueGaps) && smc.fairValueGaps.length) smcItems.push({ label: 'Fair Value Gaps', value: smc.fairValueGaps.length + ' зон', tone: 'info' });
        if (Array.isArray(smc.liquiditySweeps) && smc.liquiditySweeps.length) smcItems.push({ label: 'Liquidity Sweeps', value: smc.liquiditySweeps.length, tone: 'warn' });
        if (Array.isArray(smc.equalHighs) && smc.equalHighs.length) smcItems.push({ label: 'Equal Highs', value: smc.equalHighs.length, tone: 'neutral' });
        if (Array.isArray(smc.equalLows) && smc.equalLows.length) smcItems.push({ label: 'Equal Lows', value: smc.equalLows.length, tone: 'neutral' });
        renderPanel('terminal-panel-smart-money', '', smcItems);

        // --- 4. Price Action ---
        const pa = analysis.priceAction || {};
        const paItems = [];
        if (Array.isArray(pa.patterns)) {
            pa.patterns.slice(-7).forEach(function (p) {
                const name = (p.type || '').replace(/_/g, ' ');
                const dir = (p.type || '').indexOf('bull') >= 0 ? 'bullish' : ((p.type || '').indexOf('bear') >= 0 ? 'bearish' : 'neutral');
                paItems.push({ label: name.charAt(0).toUpperCase() + name.slice(1), value: '', tone: tone(dir) });
            });
        }
        // Канонические имена из требований
        const reqPatterns = ['pin_bar', 'engulfing', 'harami', 'doji', 'morning_star', 'evening_star', 'inside_bar'];
        const lastDetected = {};
        if (Array.isArray(pa.patterns)) {
            pa.patterns.forEach(function (p) {
                const t = (p.type || '').toLowerCase();
                reqPatterns.forEach(function (rp) {
                    if (t.indexOf(rp.replace(/_/g, '')) >= 0 || t.indexOf(rp) >= 0) lastDetected[rp] = t;
                });
            });
        }
        const displayNames = {
            'pin_bar': 'Pin Bar', 'engulfing': 'Engulfing', 'harami': 'Harami',
            'doji': 'Doji', 'morning_star': 'Morning Star', 'evening_star': 'Evening Star',
            'inside_bar': 'Inside Bar'
        };
        Object.keys(displayNames).forEach(function (k) {
            if (lastDetected[k]) {
                const t = lastDetected[k];
                const dir = t.indexOf('bull') >= 0 ? 'bullish' : (t.indexOf('bear') >= 0 ? 'bearish' : 'neutral');
                if (!paItems.find(function (i) { return i.label === displayNames[k]; })) {
                    paItems.push({ label: displayNames[k], value: '', tone: tone(dir) });
                }
            }
        });
        renderPanel('terminal-panel-price-action', '', paItems);

        // --- 5. Volume ---
        const vol = analysis.volume || {};
        const volItems = [];
        if (typeof vol.ratio === 'number') {
            const r = vol.ratio;
            if (r > 1.3) volItems.push({ label: 'Volume Spike', value: '×' + r.toFixed(2), tone: 'info' });
            else if (r < 0.7) volItems.push({ label: 'Volume Spike', value: '×' + r.toFixed(2), tone: 'warn' });
            else volItems.push({ label: 'Volume Ratio', value: '×' + r.toFixed(2), tone: 'neutral' });
        }
        if (vol.type === 'bullish_volume_divergence') volItems.push({ label: 'Volume Divergence', value: 'Bullish', tone: 'bullish' });
        if (vol.type === 'bearish_volume_divergence') volItems.push({ label: 'Volume Divergence', value: 'Bearish', tone: 'bearish' });
        if (vol.type === 'accumulation') volItems.push({ label: 'Phase', value: 'Accumulation', tone: 'bullish' });
        if (vol.type === 'distribution') volItems.push({ label: 'Phase', value: 'Distribution', tone: 'bearish' });
        // Buying / Selling pressure (через последние свечи)
        if (state.candles.length >= 5) {
            const recent = state.candles.slice(-5);
            const buying = recent.filter(function (c) { return c.close > c.open; }).reduce(function (s, c) { return s + c.volume; }, 0);
            const selling = recent.filter(function (c) { return c.close < c.open; }).reduce(function (s, c) { return s + c.volume; }, 0);
            const total = buying + selling || 1;
            const bp = (buying / total) * 100;
            volItems.push({ label: 'Buying Pressure', value: bp.toFixed(0) + '%', tone: bp > 55 ? 'bullish' : (bp < 45 ? 'bearish' : 'neutral') });
            volItems.push({ label: 'Selling Pressure', value: (100 - bp).toFixed(0) + '%', tone: bp < 45 ? 'bearish' : (bp > 55 ? 'bullish' : 'neutral') });
        }
        renderPanel('terminal-panel-volume', '', volItems);

        // --- 6. Liquidity ---
        const liq = analysis.liquidity || {};
        const lqItems = [];
        if (liq.bslSwept) lqItems.push({ label: 'Buy Side Liquidity', value: 'Swept', tone: 'bearish' });
        if (liq.sslSwept) lqItems.push({ label: 'Sell Side Liquidity', value: 'Swept', tone: 'bullish' });
        if (liq.grab) lqItems.push({ label: 'Liquidity Grab', value: 'Detected', tone: 'warn' });
        if (liq.stopHunt) lqItems.push({ label: 'Stop Hunt', value: 'Detected', tone: 'warn' });
        if (Array.isArray(liq.sweeps) && liq.sweeps.length) lqItems.push({ label: 'Sweeps', value: liq.sweeps.length + ' событий', tone: 'info' });
        renderPanel('terminal-panel-liquidity', '', lqItems);

        // --- 7. Volatility ---
        const vlt = analysis.volatility || {};
        const vItems = [];
        if (typeof vlt.atr === 'number') vItems.push({ label: 'ATR', value: fmtPrice(vlt.atr), tone: 'info' });
        if (typeof vlt.atrPercent === 'number') vItems.push({ label: 'ATR %', value: vlt.atrPercent.toFixed(2) + '%', tone: 'neutral' });
        if (vlt.type === 'volatility_squeeze') vItems.push({ label: 'Volatility', value: 'Squeeze', tone: 'warn' });
        if (vlt.type === 'volatility_breakout') vItems.push({ label: 'Volatility', value: 'Breakout', tone: 'info' });
        if (vlt.type === 'explosive_expansion') vItems.push({ label: 'Volatility', value: 'Explosive', tone: 'warn' });
        renderPanel('terminal-panel-volatility', '', vItems);

        // --- 8. Momentum ---
        const mom = analysis.momentum || {};
        const mItems = [];
        if (typeof mom.rsi === 'number') {
            let mt = 'neutral';
            if (mom.rsi > 70) mt = 'bearish';
            else if (mom.rsi < 30) mt = 'bullish';
            else if (mom.rsi > 55) mt = 'bullish';
            else if (mom.rsi < 45) mt = 'bearish';
            mItems.push({ label: 'RSI', value: mom.rsi.toFixed(1), tone: mt });
        }
        if (mom.type === 'bullish_momentum_divergence') mItems.push({ label: 'Momentum Divergence', value: 'Bullish', tone: 'bullish' });
        if (mom.type === 'bearish_momentum_divergence') mItems.push({ label: 'Momentum Divergence', value: 'Bearish', tone: 'bearish' });
        if (mom.type === 'impulse_move' && mom.direction) {
            mItems.push({ label: 'Momentum', value: 'Impulse ' + mom.direction, tone: tone(mom.direction) });
        }
        renderPanel('terminal-panel-momentum', '', mItems);

        // --- 9. Support / Resistance ---
        const lv = analysis.levels || {};
        const lvItems = [];
        if (Array.isArray(lv.support)) lv.support.slice(0, 3).forEach(function (v) { lvItems.push({ label: 'Support', value: fmtPrice(v), tone: 'bullish' }); });
        if (Array.isArray(lv.resistance)) lv.resistance.slice(0, 3).forEach(function (v) { lvItems.push({ label: 'Resistance', value: fmtPrice(v), tone: 'bearish' }); });
        if (typeof lv.nearestSupport === 'number') lvItems.push({ label: 'Ближайшая поддержка', value: fmtPrice(lv.nearestSupport), tone: 'bullish' });
        if (typeof lv.nearestResistance === 'number') lvItems.push({ label: 'Ближайшее сопротивление', value: fmtPrice(lv.nearestResistance), tone: 'bearish' });
        renderPanel('terminal-panel-levels', '', lvItems);

        // --- 10. Probability / Confidence ---
        const pr = analysis.probability || {};
        const prItems = [];
        if (typeof pr.continuation === 'number') prItems.push({ label: 'Continuation', value: pr.continuation + '%', tone: pr.continuation > 55 ? 'bullish' : (pr.continuation < 45 ? 'bearish' : 'neutral') });
        if (typeof pr.reversal === 'number') prItems.push({ label: 'Reversal', value: pr.reversal + '%', tone: pr.reversal > 55 ? 'bearish' : (pr.reversal < 45 ? 'bullish' : 'neutral') });
        renderPanel('terminal-panel-probability', '', prItems);

        // Header bias / confidence
        const sum = analysis.summary || {};
        const biasEl = $('terminal-bias');
        if (biasEl) {
            const b = sum.bias || 'neutral';
            biasEl.textContent = b.toUpperCase();
            biasEl.className = 'terminal-bias terminal-bias-' + b;
        }
        const confEl = $('terminal-confidence');
        if (confEl) {
            const c = sum.confidence || 0;
            confEl.textContent = (typeof c === 'number' ? c.toFixed(0) : c) + '%';
        }
        // Context + signals count
        const ctxEl = $('terminal-context');
        if (ctxEl) {
            const ctxMap = {
                'uptrend': 'Восходящий тренд', 'downtrend': 'Нисходящий тренд',
                'range': 'Боковик (Range)', 'consolidation': 'Консолидация',
                'expansion': 'Экспансия', 'compression': 'Сжатие'
            };
            const ctx = sum.context || (analysis.structure && analysis.structure.type) || '—';
            ctxEl.textContent = ctxMap[ctx] || ctx;
        }
        const sigEl = $('terminal-signals-count');
        if (sigEl) {
            const cnt = (sum.keySignals && sum.keySignals.length) || 0;
            sigEl.textContent = String(cnt);
        }
    }

    // ================================================================
    // РЕШЕНИЯ (Long / Short / Wait / No Trade) → Module 2
    // ================================================================

    function setupDecisionButtons() {
        ['long', 'short', 'wait', 'no_trade'].forEach(function (id) {
            const btn = $('terminal-decision-' + id);
            if (!btn) return;
            btn.addEventListener('click', function () { submitDecision(id); });
        });
    }

    function submitDecision(decisionId) {
        if (!state.analysis) {
            showDecisionFeedback({ verdict: 'risky', verdictLabel: '~ Данные ещё загружаются', explanation: 'Дождитесь загрузки графика и анализа Module X.' });
            return;
        }
        // Подсветить активную кнопку
        ['long', 'short', 'wait', 'no_trade'].forEach(function (id) {
            const b = $('terminal-decision-' + id);
            if (b) b.classList.toggle('active', id === decisionId);
        });
        // Вызвать Module 2 — НЕ модифицируем, только прокидываем
        let verdict;
        try {
            verdict = runModule2(state.analysis, decisionId, []);
        } catch (e) {
            console.error('[TerminalTab] Module 2 error:', e);
            verdict = null;
        }
        if (!verdict) {
            showDecisionFeedback({ verdict: 'risky', verdictLabel: '~ Ошибка оценки', explanation: 'Не удалось получить вердикт от Module 2.' });
            return;
        }
        state.verdict = verdict;
        showDecisionFeedback(verdict);
    }

    function showDecisionFeedback(verdict) {
        const wrap = $('terminal-decision-feedback');
        if (!wrap) return;
        const cls = 'terminal-verdict-' + (verdict.verdict || 'risky');
        const label = verdict.verdictLabel || verdict.verdict || '—';
        const text = (verdict.explanation || '').split('\n').filter(Boolean).slice(0, 3).map(function (p) {
            return '<div class="terminal-verdict-bullet">• ' + escapeHtml(p) + '</div>';
        }).join('');
        wrap.innerHTML = '<div class="terminal-verdict ' + cls + '">' +
            '<div class="terminal-verdict-label">' + escapeHtml(label) + '</div>' +
            '<div class="terminal-verdict-body">' + text + '</div>' +
            '</div>';
    }

    function clearDecisionFeedback() {
        ['long', 'short', 'wait', 'no_trade'].forEach(function (id) {
            const b = $('terminal-decision-' + id);
            if (b) b.classList.remove('active');
        });
        const wrap = $('terminal-decision-feedback');
        if (wrap) wrap.innerHTML = '';
    }

    // ================================================================
    // ГЛАВНЫЙ PIPELINE: смена символа/таймфрейма
    // ================================================================

    async function switchSymbol(newSymbol) {
        if (state.loading) return;
        const sym = SYMBOLS.find(function (s) { return s.id === newSymbol; }) || SYMBOLS[0];
        state.symbol = sym;
        state.lastPrice = null;
        state.verdict = null;
        clearDecisionFeedback();
        await reloadAnalysis();
    }

    async function switchTimeframe(newTf) {
        if (state.loading) return;
        state.timeframe = newTf;
        setActiveTimeframe();
        state.verdict = null;
        clearDecisionFeedback();
        await reloadAnalysis();
    }

    async function reloadAnalysis() {
        if (state.loading) return;
        state.loading = true;
        setLoading(true);
        try {
            // 1. Получить свечи
            const candles = await fetchBinanceCandles(state.symbol.id, state.timeframe.binance, 200);
            state.candles = candles;
            state.lastPrice = candles[candles.length - 1] ? candles[candles.length - 1].close : null;
            // 2. Обновить заголовок цены
            renderPriceHeader(state.analysis || {}, candles);
            // 3. Перерисовать TradingView чарт
            renderTradingViewChart(state.symbol.tvSymbol, state.timeframe.tv, 'terminal-chart');
            // 4. Запустить Module X
            const analysis = runModuleX(candles);
            state.analysis = analysis;
            // 5. Обновить все панели
            renderPriceHeader(analysis, candles);
            renderAnalysisPanels(analysis);
        } catch (e) {
            console.error('[TerminalTab] reloadAnalysis error:', e);
            const wrap = $('terminal-decision-feedback');
            if (wrap) {
                wrap.innerHTML = '<div class="terminal-verdict terminal-verdict-risky">' +
                    '<div class="terminal-verdict-label">~ Ошибка загрузки</div>' +
                    '<div class="terminal-verdict-body"><div class="terminal-verdict-bullet">• ' + escapeHtml(e.message || String(e)) + '</div></div>' +
                    '</div>';
            }
        } finally {
            state.loading = false;
            setLoading(false);
        }
    }

    function setLoading(on) {
        const el = $('terminal-loading');
        if (el) el.style.display = on ? 'flex' : 'none';
    }

    // ================================================================
    // FULLSCREEN
    // ================================================================

    function setupFullscreen() {
        const btn = $('terminal-fullscreen-btn');
        if (!btn) return;
        btn.addEventListener('click', function () {
            const target = $('lab-pane-terminal');
            if (!target) return;
            if (!document.fullscreenElement) {
                (target.requestFullscreen || target.webkitRequestFullscreen || function () {}).call(target);
            } else {
                (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
            }
        });
    }

    // ================================================================
    // INIT
    // ================================================================

    function attachUI() {
        // Symbol select
        const sel = $('terminal-symbol-select');
        if (sel) {
            sel.addEventListener('change', function (e) { switchSymbol(e.target.value); });
        }
        renderSymbolSelect();
        renderTimeframeButtons();
        setupDecisionButtons();
        setupFullscreen();
    }

    function init() {
        const pane = $('lab-pane-terminal');
        if (!pane) {
            console.warn('[TerminalTab] #lab-pane-terminal не найден — Terminal не инициализирован');
            return;
        }
        if (state.initialized) return;
        state.initialized = true;
        attachUI();
        // Первая загрузка
        reloadAnalysis();
    }

    // ================================================================
    // ЭКСПОРТ
    // ================================================================

    global.TerminalTab = {
        init: init,
        reload: reloadAnalysis,
        switchSymbol: switchSymbol,
        switchTimeframe: switchTimeframe,
        submitDecision: submitDecision,
        state: state
    };

    // Авто-инициализация при загрузке страницы (если вкладка уже видима)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 50); });
    } else {
        setTimeout(init, 50);
    }

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : this));
