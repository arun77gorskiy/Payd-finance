// fetch_real_data.js — загружает реальные исторические OHLCV с Binance Vision
// и сохраняет их в JSON-файл для последующего встраивания в приложение.

const https = require('https');
const fs = require('fs');
const path = require('path');

const ENDPOINTS = [
    'https://data-api.binance.vision/api/v3/klines',
    'https://api.binance.com/api/v3/klines',
    'https://api1.binance.com/api/v3/klines',
    'https://api2.binance.com/api/v3/klines',
    'https://api3.binance.com/api/v3/klines'
];

// Символы и таймфреймы для сбора данных
const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'MATICUSDT'];
const TIMEFRAMES = [
    { interval: '1h',  count: 200 },  // 1h × 200 = ~8.3 дня
    { interval: '4h',  count: 200 },  // 4h × 200 = ~33 дня
    { interval: '1d',  count: 200 },  // 1d × 200 = ~200 дней
];

// Исторические точки в прошлом (для получения разных рыночных сегментов)
const HISTORICAL_OFFSETS_DAYS = [60, 120, 180, 240, 320, 400, 500, 650];

function fetchFromUrl(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { timeout: 15000 }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
                } else {
                    reject(new Error('HTTP ' + res.statusCode));
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    });
}

async function fetchCandles(symbol, interval, endTime) {
    const params = 'symbol=' + symbol + '&interval=' + interval + '&endTime=' + endTime + '&limit=200';
    for (let i = 0; i < ENDPOINTS.length; i++) {
        try {
            const url = ENDPOINTS[i] + '?' + params;
            const rows = await fetchFromUrl(url);
            if (Array.isArray(rows) && rows.length > 0) {
                return rows.map(r => ({
                    time: Math.floor(r[0] / 1000),
                    open: parseFloat(r[1]),
                    high: parseFloat(r[2]),
                    low: parseFloat(r[3]),
                    close: parseFloat(r[4]),
                    volume: parseFloat(r[5])
                }));
            }
        } catch (e) {
            continue;
        }
    }
    return null;
}

async function main() {
    const dataset = {
        meta: {
            generated: new Date().toISOString(),
            source: 'Binance Vision (data-api.binance.vision)',
            description: 'Real historical OHLCV data for PAYD Trading Lab training scenarios'
        },
        segments: []
    };

    const now = Math.floor(Date.now() / 1000);
    let success = 0, fail = 0;

    for (const symbol of SYMBOLS) {
        for (const tf of TIMEFRAMES) {
            for (const offsetDays of HISTORICAL_OFFSETS_DAYS) {
                const endTime = (now - offsetDays * 86400) * 1000; // ms
                const segmentId = symbol + '_' + tf.interval + '_d' + offsetDays;
                process.stdout.write('[' + segmentId + '] ');
                try {
                    const candles = await fetchCandles(symbol, tf.interval, endTime);
                    if (candles && candles.length > 0) {
                        dataset.segments.push({
                            id: segmentId,
                            symbol: symbol,
                            interval: tf.interval,
                            offsetDays: offsetDays,
                            endTime: Math.floor(endTime / 1000),
                            candleCount: candles.length,
                            candles: candles
                        });
                        process.stdout.write('OK (' + candles.length + ' свечей)\n');
                        success++;
                    } else {
                        process.stdout.write('FAIL (empty)\n');
                        fail++;
                    }
                } catch (e) {
                    process.stdout.write('FAIL (' + e.message + ')\n');
                    fail++;
                }
                // Пауза чтобы не упереться в rate limit
                await new Promise(r => setTimeout(r, 250));
            }
        }
    }

    console.log('\n=== Итог ===');
    console.log('Успешно: ' + success);
    console.log('Не удалось: ' + fail);
    console.log('Всего сегментов: ' + dataset.segments.length);

    const outPath = path.join(__dirname, 'real_historical_dataset.json');
    fs.writeFileSync(outPath, JSON.stringify(dataset));
    console.log('Сохранено в: ' + outPath);
    const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
    console.log('Размер: ' + sizeKb + ' KB');
}

main().catch(err => {
    console.error('Критическая ошибка:', err);
    process.exit(1);
});
