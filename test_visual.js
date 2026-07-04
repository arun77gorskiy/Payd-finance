// =====================================================
// РЕАЛЬНЫЙ тест: проверяет не только логи, но и пиксели
// на canvas графика после каждого перехода.
// =====================================================

const { chromium } = require('playwright');
const fs = require('fs');

const URL = 'https://zcskwb63t8il.space.minimax.io/lab.html';
const TRANSITIONS = 20;

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    const consoleLog = [];
    page.on('console', (msg) => consoleLog.push({ type: msg.type(), text: msg.text() }));
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message + ' :: ' + err.stack));

    console.log(`[TEST] Открываю ${URL}`);
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Запускаем первый сценарий
    const start = await page.$('button:has-text("Начать")');
    if (start) await start.click();
    await page.waitForTimeout(4000);

    // Скриншот первого сценария
    await page.screenshot({ path: 'screenshots/v3_scenario_0.png', fullPage: false });
    console.log('[TEST] Скриншот сценария 0 (первый) сохранён');

    for (let i = 1; i <= TRANSITIONS; i++) {
        console.log(`\n[TEST] ======= ПЕРЕХОД #${i} =======`);

        // Получаем состояние графика ДО клика
        const beforeState = await page.evaluate(() => {
            const ct = window.LabTrainer && window.LabTrainer.instance;
            const chart = ct && ct.chart;
            const candleSeries = ct && ct.candleSeries;
            const data = chart && candleSeries ? candleSeries.data ? candleSeries.data() : null : null;
            return {
                chartExists: !!chart,
                candleSeriesExists: !!candleSeries,
                chartUid: ct && ct._chartUid,
                dataLength: data ? data.length : -1,
                containerSize: (() => {
                    const el = document.getElementById('lt-chart-canvas');
                    if (!el) return null;
                    const r = el.getBoundingClientRect();
                    return { w: r.width, h: r.height };
                })(),
                // Сколько canvas существует внутри контейнера
                canvasCount: (() => {
                    const el = document.getElementById('lt-chart-canvas');
                    return el ? el.querySelectorAll('canvas').length : 0;
                })()
            };
        });
        console.log('[BEFORE] ' + JSON.stringify(beforeState, null, 2));

        // Кликаем "Дальше"
        await page.click('#lt-btn-next');
        await page.waitForTimeout(3000);

        // Получаем состояние графика ПОСЛЕ клика
        const afterState = await page.evaluate(() => {
            const ct = window.LabTrainer && window.LabTrainer.instance;
            const chart = ct && ct.chart;
            const candleSeries = ct && ct.candleSeries;
            const data = chart && candleSeries ? candleSeries.data ? candleSeries.data() : null : null;
            // Берём пиксели из canvas
            const canvasEl = document.querySelector('#lt-chart-canvas canvas');
            let pixelInfo = null;
            if (canvasEl) {
                try {
                    const ctx = canvasEl.getContext('2d');
                    const w = canvasEl.width, h = canvasEl.height;
                    const sample = ctx.getImageData(Math.floor(w/2), Math.floor(h/2), 1, 1).data;
                    const centerPixel = `rgba(${sample[0]},${sample[1]},${sample[2]},${sample[3]})`;
                    // Берём пробу с разных мест
                    const samples = [];
                    for (let x = 50; x < w; x += Math.floor(w/10)) {
                        for (let y = 50; y < h; y += Math.floor(h/10)) {
                            const p = ctx.getImageData(x, y, 1, 1).data;
                            samples.push(`(${p[0]},${p[1]},${p[2]})`);
                        }
                    }
                    const uniqueColors = [...new Set(samples)].length;
                    pixelInfo = { w, h, centerPixel, uniqueColors, totalSamples: samples.length };
                } catch (e) {
                    pixelInfo = { error: e.message };
                }
            }
            return {
                chartExists: !!chart,
                candleSeriesExists: !!candleSeries,
                chartUid: ct && ct._chartUid,
                dataLength: data ? data.length : -1,
                firstDataTime: data && data.length > 0 ? data[0].time : null,
                lastDataTime: data && data.length > 0 ? data[data.length-1].time : null,
                containerSize: (() => {
                    const el = document.getElementById('lt-chart-canvas');
                    if (!el) return null;
                    const r = el.getBoundingClientRect();
                    return { w: r.width, h: r.height };
                })(),
                canvasCount: (() => {
                    const el = document.getElementById('lt-chart-canvas');
                    return el ? el.querySelectorAll('canvas').length : 0;
                })(),
                pixelInfo
            };
        });
        console.log('[AFTER]  ' + JSON.stringify(afterState, null, 2));

        // Скриншот после перехода
        await page.screenshot({ path: `screenshots/v3_scenario_${i}.png`, fullPage: false });

        // Вердикт
        if (afterState.dataLength === 0 || afterState.dataLength === -1) {
            console.log(`❌ ПЕРЕХОД #${i}: candles data ПУСТЫЕ! (length=${afterState.dataLength})`);
        } else if (afterState.chartUid !== beforeState.chartUid) {
            console.log(`❌ ПЕРЕХОД #${i}: Chart UID ИЗМЕНИЛСЯ! ${beforeState.chartUid} → ${afterState.chartUid}`);
        } else if (afterState.pixelInfo && afterState.pixelInfo.uniqueColors < 3) {
            console.log(`⚠️  ПЕРЕХОД #${i}: Canvas почти пустой! Уникальных цветов: ${afterState.pixelInfo.uniqueColors}`);
        } else {
            console.log(`✅ ПЕРЕХОД #${i}: OK (data=${afterState.dataLength}, colors=${afterState.pixelInfo && afterState.pixelInfo.uniqueColors})`);
        }
    }

    console.log('\n========================================');
    console.log('[TEST] СВОДКА');
    console.log('========================================');
    console.log('JS-ошибок:', pageErrors.length);
    pageErrors.forEach(e => console.log('  • ' + e));

    // Сохраняем полный лог
    fs.writeFileSync('logs/v3_visual_test.log', consoleLog.map(l => `[${l.type}] ${l.text}`).join('\n'));

    await browser.close();
    process.exit(0);
})().catch((e) => {
    console.error('[TEST] FATAL:', e);
    process.exit(1);
});
