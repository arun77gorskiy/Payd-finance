// Скриншоты первых 5 сценариев для визуального доказательства
const { chromium } = require('playwright');
const fs = require('fs');

const URL = 'https://pkczabpmnf37.space.minimax.io/lab.html';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    console.log(`[SHOT] Открываю ${URL}`);
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Запуск тренажёра
    const start = await page.$('button:has-text("Начать")');
    if (start) await start.click();
    await page.waitForTimeout(4000);

    // Скриншот 1: первый сценарий
    const chart = await page.$('#lt-chart-canvas');
    if (chart) {
        await chart.screenshot({ path: 'screenshots/scenario_1.png' });
        console.log('  ✓ Сценарий 1 сохранён');
    }

    // Сценарии 2-5
    for (let i = 2; i <= 5; i++) {
        await page.click('#lt-btn-next');
        await page.waitForTimeout(3500);
        const c = await page.$('#lt-chart-canvas');
        if (c) {
            await c.screenshot({ path: `screenshots/scenario_${i}.png` });
            console.log(`  ✓ Сценарий ${i} сохранён`);
        }
    }

    // Сценарий 10
    for (let i = 6; i <= 10; i++) {
        await page.click('#lt-btn-next');
        await page.waitForTimeout(3000);
    }
    const c10 = await page.$('#lt-chart-canvas');
    if (c10) {
        await c10.screenshot({ path: 'screenshots/scenario_10.png' });
        console.log('  ✓ Сценарий 10 сохранён');
    }

    await browser.close();
    process.exit(0);
})().catch((e) => {
    console.error('[SHOT] FATAL:', e);
    process.exit(1);
});
