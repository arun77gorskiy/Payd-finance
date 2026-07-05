// Финальный тест на проде
const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({
        headless: true,
        executablePath: '/home/minimax/.cache/ms-playwright/chromium-1169/chrome-linux/chrome'
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    const consoleLogs = [];
    page.on('console', msg => {
        consoleLogs.push({ type: msg.type(), text: msg.text() });
    });
    page.on('pageerror', err => {
        consoleLogs.push({ type: 'error', text: 'PAGE ERROR: ' + err.message });
    });

    const url = 'https://mmlaktcz5vvb.space.minimax.io/lab.html';
    console.log('=== Открываем: ' + url + ' ===');
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    await page.screenshot({ path: '/workspace/final_1_levels.png', fullPage: true });
    console.log('  Скриншот 1: /workspace/final_1_levels.png');

    // Проверяем уровни
    const levelTitles = await page.locator('#lab-levels-grid h3').allTextContents();
    console.log('  Уровни:', JSON.stringify(levelTitles));

    // Открываем уровень 1
    await page.click('#lab-levels-grid > div:nth-child(1) button');
    await page.waitForTimeout(1500);

    const courseTitle = await page.locator('#lab-course-title').textContent();
    console.log('  Курс:', courseTitle);

    await page.screenshot({ path: '/workspace/final_2_course.png', fullPage: true });

    // Проверяем урок 1
    const lesson1 = await page.locator('#lab-lesson-title').textContent();
    const sections1 = await page.locator('#lab-lesson-content > div').count();
    console.log('  Урок 1:', lesson1, '— секций:', sections1);

    // Урок 2
    await page.click('#lab-lessons-list button[data-lesson-num="2"]');
    await page.waitForTimeout(500);
    const lesson2 = await page.locator('#lab-lesson-title').textContent();
    const sections2 = await page.locator('#lab-lesson-content > div').count();
    console.log('  Урок 2:', lesson2, '— секций:', sections2);

    // Урок 6 — практика
    await page.click('#lab-lessons-list button[data-lesson-num="6"]');
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/workspace/final_3_lesson6.png', fullPage: true });

    const lesson6 = await page.locator('#lab-lesson-title').textContent();
    const practiceVisible = await page.locator('#lab-lesson-practice-container').isVisible();
    console.log('  Урок 6:', lesson6, '— практика ВИДНА:', practiceVisible);

    // Кликаем "Перейти в Trading Terminal"
    await page.click('#lab-lesson-practice-container button');
    await page.waitForTimeout(5000);

    await page.screenshot({ path: '/workspace/final_4_trainer.png', fullPage: true });

    // Проверяем trainer (правильная структура: window.LabTrainer.instance.trainer)
    const trainerInfo = await page.evaluate(() => {
        const inst = window.LabTrainer && (window.LabTrainer.instance || window.LabTrainer._instance);
        if (inst && inst.trainer) {
            const ss = inst.trainer.scenarios;
            return {
                count: ss.length,
                activeLevel: inst.trainer.getActiveLevel ? inst.trainer.getActiveLevel() : null,
                firstId: ss[0] ? ss[0].id : null,
                firstName: ss[0] ? ss[0].name : null,
                firstSymbol: ss[0] ? ss[0].symbol : null,
                firstLevel: ss[0] ? ss[0].level : null
            };
        }
        return null;
    });
    console.log('\n=== TRAINER ===');
    console.log('  Сценариев:', trainerInfo.count);
    console.log('  Активный уровень:', trainerInfo.activeLevel);
    console.log('  Первый сценарий:', JSON.stringify({
        id: trainerInfo.firstId,
        name: trainerInfo.firstName,
        symbol: trainerInfo.firstSymbol,
        level: trainerInfo.firstLevel
    }, null, 2));

    // Смотрим заголовок сценария
    const scenarioTitle = await page.locator('#lt-scenario-title').textContent().catch(() => 'не найден');
    console.log('  Заголовок сценария в UI:', scenarioTitle);

    // Проверяем, что есть свечи
    const candlesInfo = await page.evaluate(() => {
        const inst = window.LabTrainer && (window.LabTrainer.instance || window.LabTrainer._instance);
        if (inst && inst.trainer) {
            const c = inst.trainer.currentScenario;
            if (c && c.candles) {
                return {
                    count: c.candles.length,
                    firstClose: c.candles[0] ? c.candles[0].close : null,
                    lastClose: c.candles[c.candles.length-1] ? c.candles[c.candles.length-1].close : null
                };
            }
        }
        return null;
    });
    console.log('  Свечи:', candlesInfo);

    // Возврат к уровням
    await page.click('button:has-text("Назад к уровням")');
    await page.waitForTimeout(1000);

    // Открываем Уровень 5 (Волатильность)
    await page.click('#lab-levels-grid > div:nth-child(5) button');
    await page.waitForTimeout(1000);

    const lvl5Title = await page.locator('#lab-course-title').textContent();
    const lvl5Lesson1 = await page.locator('#lab-lesson-title').textContent();
    console.log('\n=== УРОВЕНЬ 5 ===');
    console.log('  Курс:', lvl5Title);
    console.log('  Урок 1:', lvl5Lesson1);

    await page.screenshot({ path: '/workspace/final_5_level5.png', fullPage: true });

    // Переходим к уроку 6 уровня 5
    await page.click('#lab-lessons-list button[data-lesson-num="6"]');
    await page.waitForTimeout(300);
    await page.click('#lab-lesson-practice-container button');
    await page.waitForTimeout(4000);

    const trainerInfo5 = await page.evaluate(() => {
        const inst = window.LabTrainer && (window.LabTrainer.instance || window.LabTrainer._instance);
        if (inst && inst.trainer) {
            const ss = inst.trainer.scenarios;
            return {
                count: ss.length,
                activeLevel: inst.trainer.getActiveLevel ? inst.trainer.getActiveLevel() : null,
                allIds: ss.map(s => s.id + '(L' + s.level + ')'),
                allTags: [...new Set(ss.flatMap(s => s.tags || []))].slice(0, 8)
            };
        }
        return null;
    });
    console.log('  Trainer для уровня 5:');
    console.log('    Сценариев:', trainerInfo5.count);
    console.log('    Активный уровень:', trainerInfo5.activeLevel);
    console.log('    IDs:', trainerInfo5.allIds.join(', '));
    console.log('    Tags (топ-8):', trainerInfo5.allTags.join(', '));

    await page.screenshot({ path: '/workspace/final_6_trainer_level5.png', fullPage: true });

    console.log('\n=== ОШИБКИ ===');
    const errors = consoleLogs.filter(l => l.type === 'error' || (l.text && l.text.includes('PAGE ERROR')));
    const filteredErrors = errors.filter(e => !e.text.includes('Binance') && !e.text.includes('CORS') && !e.text.includes('ERR_FAILED'));
    if (filteredErrors.length === 0) {
        console.log('  Серьёзных ошибок нет ✓');
    } else {
        filteredErrors.slice(0, 10).forEach((e, i) => {
            console.log('  [' + (i+1) + '] ' + e.text.substring(0, 300));
        });
    }

    await browser.close();
    console.log('\n=== ТЕСТ ЗАВЕРШЁН ===');
})();
