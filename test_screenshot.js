// Скриншот только canvas, чтобы убедиться визуально
const { chromium } = require('playwright');
const fs = require('fs');

const URL = 'https://pkczabpmnf37.space.minimax.io/lab.html';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const start = await page.$('button:has-text("Начать")');
    if (start) await start.click();
    await page.waitForTimeout(4000);

    // Скриншот 1: первый сценарий
    const canvasEl0 = await page.$('#lt-chart-canvas');
    if (canvasEl0) await canvasEl0.screenshot({ path: 'screenshots/canvas_scenario_0.png' });
    await page.screenshot({ path: 'screenshots/full_scenario_0.png' });
    console.log('Скриншот сценария 0 (ПЕРВЫЙ) сохранён');

    // Кликаем "Дальше"
    await page.click('#lt-btn-next');
    await page.waitForTimeout(3000);

    const canvasEl1 = await page.$('#lt-chart-canvas');
    if (canvasEl1) await canvasEl1.screenshot({ path: 'screenshots/canvas_scenario_1.png' });
    await page.screenshot({ path: 'screenshots/full_scenario_1.png' });
    console.log('Скриншот сценария 1 (ПОСЛЕ NEXT) сохранён');

    // Проверим содержимое canvas
    const result = await page.evaluate(() => {
        const container = document.getElementById('lt-chart-canvas');
        if (!container) return { error: 'no container' };
        const canvases = container.querySelectorAll('canvas');
        const data = [];
        for (let i = 0; i < canvases.length; i++) {
            const c = canvases[i];
            try {
                const ctx = c.getContext('2d', { willReadFrequently: true });
                const w = c.width, h = c.height;
                const imageData = ctx.getImageData(0, 0, w, h);
                const px = imageData.data;
                let green = 0, red = 0, total = 0, transp = 0;
                for (let j = 0; j < px.length; j += 4) {
                    const r = px[j], g = px[j+1], b = px[j+2], a = px[j+3];
                    if (a < 100) { transp++; continue; }
                    total++;
                    if (r < 80 && g > 130 && b > 100) green++;
                    else if (r > 200 && g < 100 && b < 100) red++;
                }
                data.push({ idx: i, w, h, opaque: total, transparent: transp, green, red });
            } catch (e) {
                data.push({ idx: i, error: e.message });
            }
        }
        return data;
    });
    console.log('\nCanvas данные:');
    result.forEach(c => {
        if (c.error) console.log(`  #${c.idx}: ERROR ${c.error}`);
        else console.log(`  #${c.idx}: ${c.w}x${c.h}, opaque=${c.opaque}, transparent=${c.transparent}, green=${c.green}, red=${c.red}`);
    });

    await browser.close();
    process.exit(0);
})().catch((e) => {
    console.error('[TEST] FATAL:', e);
    process.exit(1);
});
