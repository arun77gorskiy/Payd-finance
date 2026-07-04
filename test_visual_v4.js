// Улучшенный визуальный тест: ищет зелёные (растущие) и красные (падающие) свечи
const { chromium } = require('playwright');
const fs = require('fs');

const URL = 'https://pkczabpmnf37.space.minimax.io/lab.html';
const TRANSITIONS = 10;

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    console.log(`[TEST] Открываю ${URL}`);
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const start = await page.$('button:has-text("Начать")');
    if (start) await start.click();
    await page.waitForTimeout(4000);

    await page.screenshot({ path: 'screenshots/v4_scenario_0.png' });

    for (let i = 1; i <= TRANSITIONS; i++) {
        await page.click('#lt-btn-next');
        await page.waitForTimeout(3000);

        // ДЕТАЛЬНЫЙ анализ canvas
        const result = await page.evaluate(() => {
            const ct = window.LabTrainer && window.LabTrainer.instance;
            const chart = ct && ct.chart;
            const candleSeries = ct && ct.candleSeries;
            const data = candleSeries && candleSeries.data ? candleSeries.data() : null;

            // Получаем ВСЕ canvas внутри chart container
            const container = document.getElementById('lt-chart-canvas');
            if (!container) return { error: 'no container' };

            const canvases = container.querySelectorAll('canvas');

            // Пробуем взять пиксели с ГЛАВНОГО canvas (он обычно последний)
            let mainCanvas = null;
            for (const c of canvases) {
                if (c.width > 500 && c.height > 300) {
                    mainCanvas = c;
                    break;
                }
            }
            if (!mainCanvas) {
                // Возьмём самый большой
                let maxArea = 0;
                for (const c of canvases) {
                    const a = c.width * c.height;
                    if (a > maxArea) { maxArea = a; mainCanvas = c; }
                }
            }

            if (!mainCanvas) return { error: 'no main canvas', canvasCount: canvases.length };

            try {
                const ctx = mainCanvas.getContext('2d', { willReadFrequently: true });
                const w = mainCanvas.width, h = mainCanvas.height;
                const imageData = ctx.getImageData(0, 0, w, h);
                const px = imageData.data;

                let greenCount = 0, redCount = 0, darkCount = 0, total = 0;
                // Сэмплируем каждый 5-й пиксель
                for (let i = 0; i < px.length; i += 20) {
                    const r = px[i], g = px[i+1], b = px[i+2], a = px[i+3];
                    if (a < 100) continue;
                    total++;
                    // Зелёная свеча (#26a69a): R<60, G>140, B>120
                    if (r < 80 && g > 130 && b > 100) greenCount++;
                    // Красная свеча (#ef5350): R>200, G<100, B<100
                    else if (r > 200 && g < 100 && b < 100) redCount++;
                    // Тёмный фон (#121216 / #0a0a0c): все компоненты <40
                    else if (r < 40 && g < 40 && b < 40) darkCount++;
                }
                return {
                    canvasCount: canvases.length,
                    canvasSize: { w, h },
                    sampledPixels: total,
                    greenCount,
                    redCount,
                    darkCount,
                    greenPct: total > 0 ? (greenCount / total * 100).toFixed(2) : 0,
                    redPct: total > 0 ? (redCount / total * 100).toFixed(2) : 0,
                    darkPct: total > 0 ? (darkCount / total * 100).toFixed(2) : 0,
                    dataLength: data ? data.length : -1
                };
            } catch (e) {
                return { error: e.message, canvasCount: canvases.length };
            }
        });

        await page.screenshot({ path: `screenshots/v4_scenario_${i}.png` });

        console.log(`\n[TEST] ======= ПЕРЕХОД #${i} =======`);
        console.log('Результат:', JSON.stringify(result, null, 2));

        if (result.error) {
            console.log(`❌ Ошибка: ${result.error}`);
        } else if (result.greenCount === 0 && result.redCount === 0) {
            console.log(`❌ СВЕЧЕЙ НЕТ! green=${result.greenCount}, red=${result.redCount}`);
        } else if (result.greenCount + result.redCount < 100) {
            console.log(`⚠️  Очень мало свечей: green=${result.greenCount}, red=${result.redCount}`);
        } else {
            console.log(`✅ Свечи отрисованы: green=${result.greenCount} (${result.greenPct}%), red=${result.redCount} (${result.redPct}%)`);
        }
    }

    console.log('\n========================================');
    console.log('[TEST] JS-ошибок:', pageErrors.length);
    pageErrors.forEach(e => console.log('  • ' + e));

    await browser.close();
    process.exit(0);
})().catch((e) => {
    console.error('[TEST] FATAL:', e);
    process.exit(1);
});
