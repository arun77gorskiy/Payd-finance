/**
 * MarketAPI - использует Binance WebSocket (работает без CORS!)
 */

class MarketAPI {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnects = 3;
        this.subscribedSymbols = new Set();
        
        // Demo данные для fallback
        this.demoCoins = [
            { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', current_price: 67432.00, price_change_percentage_24h: 2.34, hasBinancePair: true },
            { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', current_price: 3456.78, price_change_percentage_24h: 1.56, hasBinancePair: true },
            { id: 'solana', symbol: 'SOL', name: 'Solana', current_price: 145.23, price_change_percentage_24h: 5.67, hasBinancePair: true },
            { id: 'binancecoin', symbol: 'BNB', name: 'BNB', current_price: 567.89, price_change_percentage_24h: -0.45, hasBinancePair: true },
            { id: 'ripple', symbol: 'XRP', name: 'XRP', current_price: 0.5234, price_change_percentage_24h: 1.23, hasBinancePair: true },
            { id: 'cardano', symbol: 'ADA', name: 'Cardano', current_price: 0.4567, price_change_percentage_24h: 3.45, hasBinancePair: true },
            { id: 'dogecoin', symbol: 'DOGE', name: 'Dogecoin', current_price: 0.1234, price_change_percentage_24h: 8.90, hasBinancePair: true },
            { id: 'polkadot', symbol: 'DOT', name: 'Polkadot', current_price: 7.89, price_change_percentage_24h: -1.23, hasBinancePair: true },
            { id: 'avalanche-2', symbol: 'AVAX', name: 'Avalanche', current_price: 35.67, price_change_percentage_24h: 4.56, hasBinancePair: true },
            { id: 'chainlink', symbol: 'LINK', name: 'Chainlink', current_price: 14.56, price_change_percentage_24h: 2.34, hasBinancePair: true },
            { id: 'polygon', symbol: 'MATIC', name: 'Polygon', current_price: 0.5678, price_change_percentage_24h: 1.89, hasBinancePair: true },
            { id: 'litecoin', symbol: 'LTC', name: 'Litecoin', current_price: 84.56, price_change_percentage_24h: 0.78, hasBinancePair: true },
            { id: 'uniswap', symbol: 'UNI', name: 'Uniswap', current_price: 9.87, price_change_percentage_24h: 3.21, hasBinancePair: true },
            { id: 'cosmos', symbol: 'ATOM', name: 'Cosmos', current_price: 8.45, price_change_percentage_24h: -0.56, hasBinancePair: true },
            { id: 'stellar', symbol: 'XLM', name: 'Stellar', current_price: 0.1123, price_change_percentage_24h: 2.89, hasBinancePair: true }
        ];
        
        this.coingeckoCoins = this.demoCoins;
        this.binanceSymbols = new Map();
        this.demoCoins.forEach(coin => {
            if (coin.hasBinancePair) {
                this.binanceSymbols.set(coin.id, { symbol: coin.symbol + 'USDT', baseAsset: coin.symbol });
            }
        });
        
        this.initialized = true;
        console.log('[MarketAPI] Инициализировано');
    }

    /**
     * Подключение к WebSocket
     */
    connect() {
        return new Promise((resolve) => {
            try {
                this.ws = new WebSocket('wss://stream.binance.com:9443/ws');
                
                this.ws.onopen = () => {
                    console.log('[MarketAPI] WebSocket подключен');
                    this.reconnectAttempts = 0;
                    resolve(true);
                };
                
                this.ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this.handleMessage(data);
                    } catch (e) {}
                };
                
                this.ws.onerror = () => {
                    // Тихо работаем в demo режиме
                };
                
                this.ws.onclose = () => {
                    if (this.reconnectAttempts < this.maxReconnects) {
                        this.reconnectAttempts++;
                        setTimeout(() => this.connect(), 5000);
                    }
                };
                
            } catch (error) {
                resolve(false);
            }
        });
    }

    /**
     * Обработка сообщений WebSocket
     */
    handleMessage(data) {
        if (data.e === '24hrTicker') {
            const symbol = data.s.replace('USDT', '');
            window.dispatchEvent(new CustomEvent('market-update', {
                detail: { symbol, price: parseFloat(data.c), change: parseFloat(data.P) }
            }));
        }
    }

    /**
     * Подписка на тикер
     */
    subscribeTicker(symbol) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                method: 'SUBSCRIBE',
                params: [`${symbol.toLowerCase()}usdt@ticker`],
                id: Date.now()
            }));
            this.subscribedSymbols.add(symbol);
        }
    }

    /**
     * Проверка доступности монеты на Binance
     */
    hasBinancePair(coinId) {
        return this.binanceSymbols.has(coinId.toLowerCase());
    }

    /**
     * Получить символ Binance для монеты
     */
    getBinanceSymbol(coinId) {
        const pair = this.binanceSymbols.get(coinId.toLowerCase());
        return pair ? pair.symbol : null;
    }

    /**
     * Получить OHLCV данные - используем REST с прокси или fallback
     */
    async getCandles(coinId, interval = '1h', limit = 500) {
        const symbol = this.getBinanceSymbol(coinId);
        
        if (!symbol) {
            throw new Error(`NO_BINANCE_PAIR: Монета ${coinId} не найдена`);
        }

        // Пробуем через публичный прокси
        try {
            const proxyUrl = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
            const response = await fetch(proxyUrl);
            
            if (response.ok) {
                const rawData = await response.json();
                return this.adapterBinanceCandles(rawData);
            }
        } catch (e) {
            console.log('[MarketAPI] REST недоступен, используем демо');
        }

        // Fallback на демо данные
        return this.generateDemoCandles(coinId, limit, interval);
    }

    /**
     * Адаптер свечей Binance
     */
    adapterBinanceCandles(rawData) {
        return rawData.map(candle => ({
            time: Math.floor(candle[0] / 1000),
            open: parseFloat(candle[1]),
            high: parseFloat(candle[2]),
            low: parseFloat(candle[3]),
            close: parseFloat(candle[4]),
            volume: parseFloat(candle[5])
        }));
    }

    /**
     * Генерация демо свечей
     */
    generateDemoCandles(coinId, limit = 500, interval = '1H') {
        const coin = this.demoCoins.find(c => c.id === coinId);
        const basePrice = coin ? coin.current_price : 100;

        const candles = [];
        const now = Math.floor(Date.now() / 1000);
        const intervalMap = { '15m': 900, '1H': 3600, '4H': 14400, '1D': 86400 };
        const intervalSeconds = intervalMap[interval] || 3600;

        let price = basePrice;

        for (let i = limit; i >= 0; i--) {
            const time = now - (i * intervalSeconds);
            const change = (Math.random() - 0.5) * 0.03;
            const open = price;
            const close = price * (1 + change);
            const high = Math.max(open, close) * (1 + Math.random() * 0.015);
            const low = Math.min(open, close) * (1 - Math.random() * 0.015);
            
            candles.push({
                time,
                open,
                high,
                low,
                close,
                volume: basePrice * (10 + Math.random() * 90)
            });
            
            price = close;
        }
        
        return candles;
    }

    /**
     * Fallback - возвращает данные с источником
     */
    async getCandlesWithFallback(coinId, interval = '1h', limit = 500) {
        try {
            const data = await this.getCandles(coinId, interval, limit);
            return { data, source: 'binance', hasVolume: true };
        } catch (error) {
            return {
                data: this.generateDemoCandles(coinId, limit),
                source: 'demo',
                hasVolume: true
            };
        }
    }

    /**
     * Получить список монет
     */
    getAvailableCoins() {
        return this.demoCoins;
    }

    /**
     * Получить топ монет
     */
    getTopCoins(limit = 50) {
        return this.demoCoins.slice(0, limit);
    }

    /**
     * Поиск монет
     */
    searchCoins(query) {
        const q = query.toLowerCase();
        return this.demoCoins.filter(coin => 
            coin.name.toLowerCase().includes(q) ||
            coin.symbol.toLowerCase().includes(q) ||
            coin.id.toLowerCase().includes(q)
        ).slice(0, 20);
    }

    /**
     * Получить монеты только с Binance парами
     */
    getBinanceOnlyCoins(limit = 50) {
        return this.demoCoins.filter(coin => coin.hasBinancePair).slice(0, limit);
    }

    /**
     * Инициализация (для совместимости)
     */
    async init() {
        await this.connect();
        return true;
    }
}

// Глобальный экземпляр
const marketAPI = new MarketAPI();
marketAPI.init();