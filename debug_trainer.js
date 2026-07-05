// Отладочный тест: проверка структуры LabTrainer
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
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Проверяем наличие LabTrainer
    const labTrainerInfo = await page.evaluate(() => {
        return {
            hasLabTrainer: typeof window.LabTrainer !== 'undefined',
            hasTrainerScenarios: typeof window.TrainerScenarios !== 'undefined',
            hasEducationContent: typeof window.EducationContent !== 'undefined',
            labTrainerKeys: window.LabTrainer ? Object.keys(window.LabTrainer) : null,
            labTrainerType: typeof window.LabTrainer
        };
    });
    console.log('=== LAB TRAINER INFO ===');
    console.log(JSON.stringify(labTrainerInfo, null, 2));

    // Открываем уровень 1
    await page.click('#lab-levels-grid > div:nth-child(1) button');
    await page.waitForTimeout(1500);

    // Урок 6
    await page.click('#lab-lessons-list button[data-lesson-num="6"]');
    await page.waitForTimeout(500);

    // Кликаем "Перейти в Trading Terminal"
    await page.click('#lab-lesson-practice-container button');
    await page.waitForTimeout(4000);

    // Теперь проверяем trainer
    const afterClickInfo = await page.evaluate(() => {
        const result = {
            hasLabTrainer: typeof window.LabTrainer !== 'undefined',
            keys: window.LabTrainer ? Object.keys(window.LabTrainer) : null,
            fullInfo: null
        };
        if (window.LabTrainer) {
            // Сохраняем всю доступную информацию
            const info = {
                type: typeof window.LabTrainer,
                hasTrainerProp: 'trainer' in window.LabTrainer,
                hasInstanceProp: '_instance' in window.LabTrainer,
                hasStartProp: typeof window.LabTrainer.start === 'function'
            };
            if ('trainer' in window.LabTrainer) {
                info.trainerType = typeof window.LabTrainer.trainer;
            }
            result.fullInfo = info;
        }
        return result;
    });
    console.log('=== AFTER CLICK INFO ===');
    console.log(JSON.stringify(afterClickInfo, null, 2));

    // Проверяем наличие DOM
    const domInfo = await page.evaluate(() => {
        return {
            ltScenarioTitle: !!document.getElementById('lt-scenario-title'),
            ltScenarioTitleText: document.getElementById('lt-scenario-title')?.textContent || null,
            labTrainerModeVisible: !document.getElementById('lab-trainer-mode')?.classList.contains('hidden'),
            courseModeVisible: !document.getElementById('lab-course-mode')?.classList.contains('hidden'),
            levelsModeVisible: !document.getElementById('lab-levels-mode')?.classList.contains('hidden')
        };
    });
    console.log('=== DOM INFO ===');
    console.log(JSON.stringify(domInfo, null, 2));

    console.log('\n=== CONSOLE LOGS (последние 30) ===');
    consoleLogs.slice(-30).forEach(log => {
        console.log('[' + log.type + '] ' + log.text.substring(0, 300));
    });

    await browser.close();
    console.log('\n=== ДЕБАГ ЗАВЕРШЁН ===');
})();
