// Проверяем, какие реальные символы есть в RealHistoricalData
const { chromium } = require('playwright');
const URL = 'https://f49bxi46q757.space.minimax.io/lab.html';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const result = await page.evaluate(() => {
        const stats = window.RealHistoricalData && window.RealHistoricalData.getStats();
        const symbols = window.RealHistoricalData && window.RealHistoricalData.getAvailableSymbols();
        const segments = window.RealHistoricalData && window.RealHistoricalData.getAllSegments();
        const segInfo = (segments || []).map(s => {
            const candles = s.candles;
            const first = candles[0];
            const last = candles[candles.length - 1];
            const minLow = candles.reduce((min, c) => Math.min(min, c.low), Infinity);
            const maxHigh = candles.reduce((max, c) => Math.max(max, c.high), -Infinity);
            return {
                id: s.id,
                symbol: s.symbol,
                interval: s.interval,
                candlesCount: candles.length,
                firstTime: first.time,
                firstClose: first.close,
                lastTime: last.time,
                lastClose: last.close,
                minPrice: minLow,
                maxPrice: maxHigh
            };
        });
        return { stats, symbols, segInfo };
    });

    console.log('=== ДОСТУПНЫЕ СИМВОЛЫ ===');
    console.log(result.symbols);
    console.log('\n=== СЕГМЕНТЫ С ЦЕНАМИ ===');
    result.segInfo.forEach(s => {
        console.log(`${s.id.padEnd(30)} | ${s.symbol.padEnd(10)} | ${s.interval} | N=${s.candlesCount} | price: ${s.minPrice.toFixed(2)} - ${s.maxPrice.toFixed(2)} | last=${s.lastClose.toFixed(2)}`);
    });

    await browser.close();
    process.exit(0);
})();
