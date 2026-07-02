const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await context.newPage();

    await page.goto('https://ejz9rkgnkjmq.space.minimax.io/lab.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const buttons = await page.$$('button');
    for (const btn of buttons) {
        const text = await btn.textContent();
        if (text && text.includes('Начать')) {
            await btn.click();
            break;
        }
    }

    await page.waitForSelector('canvas', { timeout: 30000 });
    await page.waitForTimeout(3500);

    const info = await page.evaluate(() => {
        const canvases = document.querySelectorAll('canvas');
        const chartCanvas = Array.from(canvases).find(cn => cn.width > 800);
        const rect = chartCanvas.getBoundingClientRect();
        return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
    });
    const cx = info.x + info.w / 2;
    const cy = info.y + info.h / 2;
    
    console.log('=== Перемещение в раннюю историю ===');
    const startRange = await page.evaluate(() => window.LabTrainer.instance.chart.timeScale().getVisibleLogicalRange());
    console.log('Начальный диапазон:', JSON.stringify(startRange));
    
    // Множественный pan влево
    for (let pass = 0; pass < 3; pass++) {
        await page.mouse.move(cx, cy);
        await page.mouse.down();
        await page.mouse.move(cx - 500, cy, { steps: 30 });
        await page.mouse.up();
        await page.waitForTimeout(400);
    }
    
    const endRange = await page.evaluate(() => window.LabTrainer.instance.chart.timeScale().getVisibleLogicalRange());
    console.log('Конечный диапазон:', JSON.stringify(endRange));
    const shift = endRange.from - startRange.from;
    console.log(`Сдвиг from: ${shift.toFixed(2)} свечей`);
    console.log(shift > 5 ? '✅ Успешно переместились далеко влево' : '❌ Не переместились');
    
    await page.screenshot({ path: '/workspace/far_left.png' });
    console.log('Скриншот: /workspace/far_left.png');

    await browser.close();
})();
