// Простая проверка свечей: показываем строку из 80 символов на каждой Y-линии
// где есть G (зелёный) или R (красный)
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto('https://pkczabpmnf37.space.minimax.io/lab.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const start = await page.$('button:has-text("Начать")');
    if (start) await start.click();
    await page.waitForTimeout(4000);

    await page.click('#lt-btn-next');
    await page.waitForTimeout(3000);

    // Считываем canvas попиксельно
    const ascii = await page.evaluate(() => {
        const container = document.getElementById('lt-chart-canvas');
        const canvases = container.querySelectorAll('canvas');
        // Найдём canvas с зелёными/красными пикселями
        for (let ci = 0; ci < canvases.length; ci++) {
            const c = canvases[ci];
            if (c.width < 500) continue;
            const ctx = c.getContext('2d', { willReadFrequently: true });
            const w = c.width, h = c.height;
            const imageData = ctx.getImageData(0, 0, w, h);
            const px = imageData.data;

            // Уменьшаем до 80x30
            const cols = 80, rows = 25;
            const sx = w / cols, sy = h / rows;
            const lines = [];
            for (let r = 0; r < rows; r++) {
                let line = '';
                for (let col = 0; col < cols; col++) {
                    let green = 0, red = 0, dark = 0, total = 0;
                    const x0 = Math.floor(col * sx);
                    const y0 = Math.floor(r * sy);
                    const x1 = Math.floor((col + 1) * sx);
                    const y1 = Math.floor((r + 1) * sy);
                    for (let y = y0; y < y1; y++) {
                        for (let x = x0; x < x1; x++) {
                            const i = (y * w + x) * 4;
                            const R = px[i], G = px[i+1], B = px[i+2];
                            total++;
                            if (R < 80 && G > 130 && B > 100) green++;
                            else if (R > 200 && G < 100 && B < 100) red++;
                            else if (R < 40 && G < 40 && B < 40) dark++;
                        }
                    }
                    if (green > red && green > 0) line += 'G';
                    else if (red > green && red > 0) line += 'R';
                    else if (dark > total * 0.5) line += '.';
                    else line += ' ';
                }
                lines.push(line);
            }
            return lines;
        }
        return null;
    });

    if (ascii) {
        console.log('========== ВИЗУАЛИЗАЦИЯ ГРАФИКА (G=зелёная свеча, R=красная) ==========');
        ascii.forEach(l => console.log(l));
    } else {
        console.log('Не удалось получить canvas');
    }

    await browser.close();
    process.exit(0);
})();
