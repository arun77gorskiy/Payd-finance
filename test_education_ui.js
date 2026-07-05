// Тест новой системы обучения через Playwright
const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const browser = await chromium.launch({
        headless: true,
        executablePath: '/home/minimax/.cache/ms-playwright/chromium-1169/chrome-linux/chrome'
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    // Перехват консоли
    const consoleLogs = [];
    page.on('console', msg => {
        consoleLogs.push({ type: msg.type(), text: msg.text() });
    });
    page.on('pageerror', err => {
        consoleLogs.push({ type: 'error', text: 'PAGE ERROR: ' + err.message });
    });

    console.log('=== STEP 1: Открываем страницу ===');
    await page.goto('http://localhost:7777/lab.html', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Скриншот начального состояния
    await page.screenshot({ path: '/workspace/screenshot_edu_1_levels.png', fullPage: true });
    console.log('  Скриншот списка уровней: /workspace/screenshot_edu_1_levels.png');

    // Проверяем, что карточки уровней появились
    const levelCardsCount = await page.locator('#lab-levels-grid > div').count();
    console.log('  Количество карточек уровней:', levelCardsCount);

    // Проверяем заголовки
    const levelTitles = await page.locator('#lab-levels-grid h3').allTextContents();
    console.log('  Названия уровней:', JSON.stringify(levelTitles));

    // Сколько сценариев у каждого уровня (проверяем через UI)
    const scenarioCounts = await page.locator('#lab-levels-grid .text-text-500.text-xs span:nth-child(3), #lab-levels-grid .text-text-500.text-xs').allTextContents();
    console.log('  Счётчики сценариев:', scenarioCounts);

    console.log('\n=== STEP 2: Открываем Уровень 1 ===');
    await page.click('#lab-levels-grid > div:nth-child(1) button');
    await page.waitForTimeout(1000);

    // Проверяем заголовок курса
    const courseTitle = await page.locator('#lab-course-title').textContent();
    console.log('  Заголовок курса:', courseTitle);
    const courseSubtitle = await page.locator('#lab-course-subtitle').textContent();
    console.log('  Подзаголовок:', courseSubtitle);

    // Скриншот курса
    await page.screenshot({ path: '/workspace/screenshot_edu_2_course_lesson1.png', fullPage: true });
    console.log('  Скриншот: /workspace/screenshot_edu_2_course_lesson1.png');

    // Проверяем, что урок 1 отображается
    const lessonTitle = await page.locator('#lab-lesson-title').textContent();
    console.log('  Заголовок урока 1:', lessonTitle);
    const lessonBadge = await page.locator('#lab-lesson-badge').textContent();
    console.log('  Бейдж урока:', lessonBadge);
    const sectionsCount = await page.locator('#lab-lesson-content > div').count();
    console.log('  Количество секций в уроке 1:', sectionsCount);

    // Проверяем sidebar
    const lessonsListCount = await page.locator('#lab-lessons-list button').count();
    console.log('  Количество уроков в sidebar:', lessonsListCount);

    // Проверяем, что кнопка "Предыдущий урок" disabled
    const prevDisabled = await page.locator('#lab-lesson-prev').isDisabled();
    console.log('  Кнопка "Предыдущий" disabled:', prevDisabled);

    // Проверяем, что практика скрыта на уроке 1
    const practiceHidden = await page.locator('#lab-lesson-practice-container').isHidden();
    console.log('  Практика скрыта на уроке 1:', practiceHidden);

    console.log('\n=== STEP 3: Переходим к уроку 3 ===');
    // Кликаем урок 3 в sidebar
    await page.click('#lab-lessons-list button[data-lesson-num="3"]');
    await page.waitForTimeout(500);

    const lesson3Title = await page.locator('#lab-lesson-title').textContent();
    console.log('  Заголовок урока 3:', lesson3Title);
    const lesson3Badge = await page.locator('#lab-lesson-badge').textContent();
    console.log('  Бейдж урока 3:', lesson3Badge);
    const sectionsCount3 = await page.locator('#lab-lesson-content > div').count();
    console.log('  Секций в уроке 3:', sectionsCount3);

    // Проверяем, что prev теперь enabled
    const prevEnabled = await page.locator('#lab-lesson-prev').isEnabled();
    console.log('  Кнопка "Предыдущий" enabled:', prevEnabled);

    console.log('\n=== STEP 4: Переходим к уроку 6 (практика) ===');
    await page.click('#lab-lessons-list button[data-lesson-num="6"]');
    await page.waitForTimeout(500);

    const lesson6Title = await page.locator('#lab-lesson-title').textContent();
    console.log('  Заголовок урока 6:', lesson6Title);

    // Проверяем, что кнопка "Перейти в Trading Terminal" появилась
    const practiceVisible = await page.locator('#lab-lesson-practice-container').isVisible();
    console.log('  Практика ВИДНА на уроке 6:', practiceVisible);

    // Скриншот урока 6
    await page.screenshot({ path: '/workspace/screenshot_edu_3_lesson6.png', fullPage: true });
    console.log('  Скриншот урока 6: /workspace/screenshot_edu_3_lesson6.png');

    console.log('\n=== STEP 5: Кликаем "Перейти в Trading Terminal" ===');
    await page.click('#lab-lesson-practice-container button');
    await page.waitForTimeout(3000);

    // Скриншот trainer
    await page.screenshot({ path: '/workspace/screenshot_edu_4_trainer.png', fullPage: true });
    console.log('  Скриншот trainer: /workspace/screenshot_edu_4_trainer.png');

    // Проверяем заголовок workspace
    const workspaceTitle = await page.locator('#lab-workspace-actions').textContent();
    console.log('  Workspace:', workspaceTitle);

    // Проверяем, что trainer смонтирован
    const trainerMounted = await page.locator('#lab-trainer-mount > *').count();
    console.log('  Trainer смонтирован (дочерних элементов):', trainerMounted);

    console.log('\n=== STEP 6: Возвращаемся к уровням ===');
    await page.click('button:has-text("Назад к уровням")');
    await page.waitForTimeout(1000);

    const levelsVisible = await page.locator('#lab-levels-mode').isVisible();
    console.log('  Список уровней виден:', levelsVisible);

    await page.screenshot({ path: '/workspace/screenshot_edu_5_back_to_levels.png', fullPage: true });
    console.log('  Скриншот: /workspace/screenshot_edu_5_back_to_levels.png');

    console.log('\n=== STEP 7: Открываем Уровень 3 (Тренд + ретест) ===');
    await page.click('#lab-levels-grid > div:nth-child(3) button');
    await page.waitForTimeout(1000);
    const lvl3Title = await page.locator('#lab-course-title').textContent();
    console.log('  Курс 3:', lvl3Title);
    const lvl3Lesson1 = await page.locator('#lab-lesson-title').textContent();
    console.log('  Урок 1 уровня 3:', lvl3Lesson1);

    // Проверяем, что в Level 3 контент урока 1 специфичный (Higher Low)
    const lesson3Text = await page.locator('#lab-lesson-content').textContent();
    const hasHigherLow = lesson3Text.includes('Higher Low') || lesson3Text.includes('высший минимум') || lesson3Text.includes('тренд');
    console.log('  Содержит текст о трендах:', hasHigherLow);

    // Скриншот уровня 3
    await page.screenshot({ path: '/workspace/screenshot_edu_6_level3.png', fullPage: true });
    console.log('  Скриншот уровня 3: /workspace/screenshot_edu_6_level3.png');

    console.log('\n=== STEP 8: Тест trainer start с фильтрацией ===');
    // Перейдём к уроку 6 уровня 3 и запустим практику
    await page.click('#lab-lessons-list button[data-lesson-num="6"]');
    await page.waitForTimeout(300);
    await page.click('#lab-lesson-practice-container button');
    await page.waitForTimeout(3000);

    // Проверяем активный уровень
    const activeLevel = await page.evaluate(() => {
        if (window.LabTrainer && window.LabTrainer.trainer) {
            return window.LabTrainer.trainer.getActiveLevel();
        }
        return null;
    });
    console.log('  Активный уровень в trainer:', activeLevel);

    // Получаем список сценариев
    const scenariosInfo = await page.evaluate(() => {
        if (window.LabTrainer && window.LabTrainer.trainer) {
            const ss = window.LabTrainer.trainer.scenarios;
            return {
                count: ss.length,
                first: ss[0] ? ss[0].id : null,
                firstName: ss[0] ? ss[0].name : null,
                firstLevel: ss[0] ? ss[0].level : null
            };
        }
        return null;
    });
    console.log('  Сценарии trainer:', JSON.stringify(scenariosInfo, null, 2));

    // Скриншот trainer для уровня 3
    await page.screenshot({ path: '/workspace/screenshot_edu_7_trainer_level3.png', fullPage: true });
    console.log('  Скриншот: /workspace/screenshot_edu_7_trainer_level3.png');

    // ════ ERRORS ════
    console.log('\n=== ОШИБКИ В КОНСОЛИ ===');
    const errors = consoleLogs.filter(l => l.type === 'error' || l.type === 'PAGE ERROR' || (l.text && l.text.includes('ERROR')));
    if (errors.length === 0) {
        console.log('  Ошибок нет ✓');
    } else {
        errors.forEach((e, i) => {
            console.log('  [' + (i+1) + '] ' + e.text.substring(0, 200));
        });
    }

    // Важные логи
    console.log('\n=== ВАЖНЫЕ ЛОГИ ===');
    const importantLogs = consoleLogs.filter(l =>
        l.text && (l.text.includes('LabTrainer') || l.text.includes('Trainer]') || l.text.includes('EducationContent') || l.text.includes('TrainerScenarios'))
    ).slice(0, 30);
    importantLogs.forEach(l => {
        console.log('  [' + l.type + '] ' + l.text.substring(0, 250));
    });

    await browser.close();
    console.log('\n=== ТЕСТ ЗАВЕРШЁН ===');
})();
