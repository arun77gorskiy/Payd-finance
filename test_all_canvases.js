// Тест: сканируем КАЖДЫЙ canvas в контейнере и находим, на каком нарисованы свечи
const { chromium } = require('playwright');

const URL = 'https://pkczabpmnf37.space.minimax.io/lab.html';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    page.on('console', (msg) => {
        if (msg.text().includes('CHECK') || msg.text().includes('HEALTH') || msg.text().includes('🚨')) {
            console.log(`  [${msg.type()}] ${msg.text()}`);
        }
    });

    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const start = await page.$('button:has-text("Начать")');
    if (start) await start.click();
    await page.waitForTimeout(4000);

    // Первый переход
    await page.click('#lt-btn-next');
    await page.waitForTimeout(3000);

    // Сканируем КАЖДЫЙ canvas
    const result = await page.evaluate(() => {
        const container = document.getElementById('lt-chart-canvas');
        if (!container) return { error: 'no container' };

        // Найдём ВСЕ canvas, рекурсивно
        const allCanvases = container.querySelectorAll('canvas');

        const results = [];
        for (let i = 0; i < allCanvases.length; i++) {
            const c = allCanvases[i];
            try {
                const ctx = c.getContext('2d', { willReadFrequently: true });
                if (!ctx) {
                    results.push({ idx: i, w: c.width, h: c.height, error: 'no 2d context' });
                    continue;
                }
                const w = c.width, h = c.height;
                const imageData = ctx.getImageData(0, 0, w, h);
                const px = imageData.data;
                let green = 0, red = 0, total = 0, transparent = 0, bright = 0;
                for (let j = 0; j < px.length; j += 4) {
                    const r = px[j], g = px[j+1], b = px[j+2], a = px[j+3];
                    if (a < 100) { transparent++; continue; }
                    total++;
                    if (r < 80 && g > 130 && b > 100) green++;
                    else if (r > 200 && g < 100 && b < 100) red++;
                    if (r + g + b > 300) bright++;
                }
                results.push({
                    idx: i,
                    w, h,
                    totalPx: px.length / 4,
                    transparent,
                    opaque: total,
                    green, red,
                    bright,
                    sample: `rgb(${px[0]},${px[1]},${px[2]})`,
                    className: c.className,
                    style: c.getAttribute('style') || ''
                });
            } catch (e) {
                results.push({ idx: i, error: e.message });
            }
        }
        return { canvasCount: allCanvases.length, canvases: results };
    });

    console.log('\n========== АНАЛИЗ CANVAS ==========');
    console.log('Всего canvas:', result.canvasCount);
    result.canvases.forEach(c => {
        if (c.error) {
            console.log(`  Canvas #${c.idx}: ERROR — ${c.error}`);
        } else {
            console.log(`  Canvas #${c.idx}: ${c.w}x${c.h}, transparent=${c.transparent}, opaque=${c.opaque}, green=${c.green}, red=${c.red}, bright=${c.bright}, sample=${c.sample}`);
            console.log(`           class="${c.className}", style="${c.style.substring(0, 80)}"`);
        }
    });

    await browser.close();
    process.exit(0);
})().catch((e) => {
    console.error('[TEST] FATAL:', e);
    process.exit(1);
});
