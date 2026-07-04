const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    // Проверка СТАРОГО URL
    console.log('=== Тест СТАРОГО URL (jxkson13hjjt) ===');
    await page.goto('https://jxkson13hjjt.space.minimax.io/lab.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    let start = await page.$('button:has-text("Начать")');
    if (start) await start.click();
    await page.waitForTimeout(4000);
    await page.click('#lt-btn-next');
    await page.waitForTimeout(3000);
    let r = await page.evaluate(() => {
        const c = document.querySelector('#lt-chart-canvas canvas');
        if (!c) return { error: 'no canvas' };
        const ctx = c.getContext('2d', { willReadFrequently: true });
        const px = ctx.getImageData(0, 0, c.width, c.height).data;
        let g = 0, red = 0;
        for (let i = 0; i < px.length; i += 4) {
            const R = px[i], G = px[i+1], B = px[i+2], A = px[i+3];
            if (A < 100) continue;
            if (R < 80 && G > 130 && B > 100) g++;
            else if (R > 200 && G < 100 && B < 100) red++;
        }
        return { canvasSize: `${c.width}x${c.height}`, green: g, red: red };
    });
    console.log('СТАРЫЙ URL после next:', r);

    // Проверка НОВОГО URL
    console.log('\n=== Тест НОВОГО URL (pkczabpmnf37) ===');
    await page.goto('https://pkczabpmnf37.space.minimax.io/lab.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    start = await page.$('button:has-text("Начать")');
    if (start) await start.click();
    await page.waitForTimeout(4000);
    await page.click('#lt-btn-next');
    await page.waitForTimeout(3000);
    r = await page.evaluate(() => {
        const c = document.querySelector('#lt-chart-canvas canvas');
        if (!c) return { error: 'no canvas' };
        const ctx = c.getContext('2d', { willReadFrequently: true });
        const px = ctx.getImageData(0, 0, c.width, c.height).data;
        let g = 0, red = 0;
        for (let i = 0; i < px.length; i += 4) {
            const R = px[i], G = px[i+1], B = px[i+2], A = px[i+3];
            if (A < 100) continue;
            if (R < 80 && G > 130 && B > 100) g++;
            else if (R > 200 && G < 100 && B < 100) red++;
        }
        return { canvasSize: `${c.width}x${c.height}`, green: g, red: red };
    });
    console.log('НОВЫЙ URL после next:', r);

    await browser.close();
})();
