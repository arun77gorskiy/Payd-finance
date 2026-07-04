// Полный тест: проверяет и пиксели, и логи CHECK 1-8
const { chromium } = require('playwright');
const fs = require('fs');

const URL = 'https://pkczabpmnf37.space.minimax.io/lab.html';
const TRANSITIONS = 20;

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    const allLogs = [];
    page.on('console', (msg) => allLogs.push({ type: msg.type(), text: msg.text() }));
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    console.log(`[TEST] Открываю ${URL}`);
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const start = await page.$('button:has-text("Начать")');
    if (start) await start.click();
    await page.waitForTimeout(4000);

    for (let i = 1; i <= TRANSITIONS; i++) {
        const before = allLogs.length;
        await page.click('#lt-btn-next');
        await page.waitForTimeout(3500); // подождём, чтобы health check отработал

        // Выводим все логи этого перехода
        const transitionLogs = allLogs.slice(before);
        console.log(`\n========== ПЕРЕХОД #${i} ==========`);
        transitionLogs.forEach(l => {
            if (l.text.includes('CHECK') || l.text.includes('HEALTH') || l.text.includes('🚨')) {
                console.log(`  [${l.type}] ${l.text}`);
            }
        });

        // Считаем пиксели
        const result = await page.evaluate(() => {
            const ct = window.LabTrainer && window.LabTrainer.instance;
            const container = document.getElementById('lt-chart-canvas');
            if (!container) return { error: 'no container' };

            // Берём ПЕРВЫЙ canvas — это основной candle canvas (LWC рисует свечи на нём)
            const mainCanvas = document.querySelector('#lt-chart-canvas canvas');
            if (!mainCanvas) return { error: 'no main canvas' };

            try {
                const ctx = mainCanvas.getContext('2d', { willReadFrequently: true });
                const w = mainCanvas.width, h = mainCanvas.height;
                const imageData = ctx.getImageData(0, 0, w, h);
                const px = imageData.data;
                let green = 0, red = 0, total = 0;
                for (let i = 0; i < px.length; i += 4) {
                    const r = px[i], g = px[i+1], b = px[i+2], a = px[i+3];
                    if (a < 100) continue;
                    total++;
                    if (r < 80 && g > 130 && b > 100) green++;
                    else if (r > 200 && g < 100 && b < 100) red++;
                }
                return {
                    canvasSize: { w, h },
                    sampledPixels: total,
                    greenCount: green,
                    redCount: red,
                    greenPct: (green/total*100).toFixed(2),
                    redPct: (red/total*100).toFixed(2)
                };
            } catch (e) {
                return { error: e.message };
            }
        });
        console.log(`  [PIXELS] green=${result.greenCount} (${result.greenPct}%), red=${result.redCount} (${result.redPct}%)`);
        if (result.greenCount + result.redCount > 5000) {
            console.log(`  ✅ Свечи видны отлично (много пикселей)`);
        } else if (result.greenCount + result.redCount > 1000) {
            console.log(`  ✓ Свечи видны (нормально)`);
        } else if (result.greenCount + result.redCount > 0) {
            console.log(`  ⚠️  Свечи есть, но мало`);
        } else {
            console.log(`  ❌ СВЕЧЕЙ НЕТ!`);
        }
    }

    console.log('\n========================================');
    console.log('JS-ошибок:', pageErrors.length);
    pageErrors.forEach(e => console.log('  • ' + e));

    fs.writeFileSync('logs/v5_full_test.log', allLogs.map(l => `[${l.type}] ${l.text}`).join('\n'));
    await browser.close();
    process.exit(0);
})().catch((e) => {
    console.error('[TEST] FATAL:', e);
    process.exit(1);
});
