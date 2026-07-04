// Финальный 20-переходный тест с проверкой priceScale reset
const { chromium } = require('playwright');
const fs = require('fs');

const URL = 'https://f49bxi46q757.space.minimax.io/lab.html';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    fs.mkdirSync('screenshots/v7', { recursive: true });

    const allLogs = [];
    page.on('console', (msg) => allLogs.push({ type: msg.type(), text: msg.text() }));

    console.log(`[TEST] Открываю ${URL}`);
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const start = await page.$('button:has-text("Начать")');
    if (start) await start.click();
    await page.waitForTimeout(4000);

    const checkPixels = async (label) => {
        const result = await page.evaluate(() => {
            const container = document.getElementById('lt-chart-canvas');
            if (!container) return { error: 'no container' };
            const canvases = container.querySelectorAll('canvas');
            let totalGreen = 0, totalRed = 0;
            for (const c of canvases) {
                const ctx = c.getContext('2d', { willReadFrequently: true });
                if (!ctx) continue;
                try {
                    const id = ctx.getImageData(0, 0, c.width, c.height);
                    const px = id.data;
                    for (let i = 0; i < px.length; i += 4) {
                        if (px[i] < 80 && px[i+1] > 130 && px[i+2] > 100) totalGreen++;
                        else if (px[i+1] < 100 && px[i+2] < 100 && px[i] > 200) totalRed++;
                    }
                } catch (e) {}
            }
            return { totalGreen, totalRed };
        });
        const status = (result.totalGreen + result.totalRed) > 5000 ? '✅' : '❌ ПУСТО';
        console.log(`  [${label.padEnd(15)}] green=${String(result.totalGreen).padStart(6)}, red=${String(result.totalRed).padStart(6)}  ${status}`);
        return result;
    };

    console.log('\n=== ТЕСТ 20 ПЕРЕХОДОВ ===\n');
    const results = [];
    results.push({ n: 1, ...await checkPixels('СЦЕНАРИЙ 1') });
    await page.locator('#lt-chart-canvas').screenshot({ path: `screenshots/v7/01.png` });

    for (let i = 2; i <= 20; i++) {
        await page.click('#lt-btn-next');
        await page.waitForTimeout(4500);
        const r = await checkPixels(`СЦЕНАРИЙ ${i}`);
        results.push({ n: i, ...r });
        await page.locator('#lt-chart-canvas').screenshot({ path: `screenshots/v7/${String(i).padStart(2,'0')}.png` });
    }

    // Проверяем priceScale reset
    const priceScaleLogs = allLogs.filter(l => l.text.includes('CHECK 6.5') || l.text.includes('priceScale'));
    console.log(`\n[CHECK] priceScale reset логов: ${priceScaleLogs.length}`);

    // Детальный отчёт
    const failed = results.filter(r => (r.totalGreen + r.totalRed) < 5000);
    console.log(`\n[ИТОГ] Прошло: ${results.length - failed.length}/${results.length}`);
    if (failed.length) {
        console.log('  Провалились:');
        failed.forEach(f => console.log(`    Сценарий ${f.n}: green=${f.totalGreen}, red=${f.totalRed}`));
    } else {
        console.log('  ✅ Все 20 сценариев имеют видимые свечи');
    }

    await browser.close();
    process.exit(0);
})().catch((e) => {
    console.error('[TEST] FATAL:', e);
    process.exit(1);
});
