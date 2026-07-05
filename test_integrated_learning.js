// test_integrated_learning.js
// Проверяет state machine внутри ОДНОГО контейнера #lab-education-host
// Режимы: grid (6 уровней) → lesson (список уроков) → terminal (контент урока) → grid
// Без отдельного блока "Модули" и без переключателя.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots_integrated');
if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const LAB_URL = 'file://' + path.resolve(__dirname, 'public/lab.html');

let passed = 0, failed = 0;
function log(step, ok, detail = '') {
    const icon = ok ? '✅' : '❌';
    console.log(`${icon} ${step}${detail ? ' — ' + detail : ''}`);
    if (ok) passed++; else failed++;
    if (!ok) process.exitCode = 1;
    return ok;
}

async function shot(page, name) {
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, name + '.png'), fullPage: true });
}

(async () => {
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    const consoleErrors = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') {
            const text = msg.text();
            if (
                text.includes('binance.com') ||
                text.includes('ERR_FAILED') ||
                text.includes('ERR_FILE_NOT_FOUND') ||
                text.includes('CORS')
            ) return;
            consoleErrors.push(text);
        }
    });
    page.on('pageerror', (err) => consoleErrors.push('PAGE ERROR: ' + err.message));

    try {
        // ===== ШАГ 1: открыть lab.html и сразу перейти на вкладку "Сценарии" (modules) =====
        console.log('\n[STEP 1] Открытие lab.html, вкладка "Сценарии"');
        await page.goto(LAB_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(800);

        // Убедимся, что вкладка "Modules" (= "Сценарии") активна
        await page.click('#lab-tab-modules');
        await page.waitForTimeout(500);
        await shot(page, '01_scenarios_tab_active');

        // ===== ШАГ 2: проверка, что 6 карточек уровней в ОДНОМ контейнере =====
        console.log('\n[STEP 2] Проверка 6 карточек уровней в #lab-education-host');

        // Один контейнер — это и есть требование
        const hostExists = await page.locator('#lab-education-host').count();
        log('Контейнер #lab-education-host существует', hostExists === 1, `найдено: ${hostExists}`);

        // Проверим, что НЕТ других контейнеров уровней/модулей
        const oldHostCount = await page.locator('#lab-cards-mode, #lab-trainer-mode, #lab-mode-tab-scenarios, #lab-mode-tab-modules').count();
        log('Старые контейнеры и переключатель удалены', oldHostCount === 0, `найдено: ${oldHostCount}`);

        // Проверим, что в #lab-education-host 6 карточек
        const levelCount = await page.locator('#lab-education-host >> text=/Уровень \\d/').count();
        log('В #lab-education-host отрендерены 6 карточек уровней', levelCount === 6, `найдено: ${levelCount}`);

        // Заголовок Learning Center
        const hasHeader = await page.locator('#lab-education-host >> text=Learning Center').isVisible();
        log('Заголовок "Learning Center" отображается', hasHeader);

        await shot(page, '02_grid_state');

        // ===== ШАГ 3: кликнуть на "Уровень 1" → state = lessons =====
        console.log('\n[STEP 3] Клик на "Уровень 1" — переход в state="lessons"');
        await page.click('#lab-education-host >> text=Уровень 1');
        await page.waitForTimeout(500);
        await shot(page, '03_lessons_state');

        // В списке уроков должна быть кнопка "← Назад к сценариям"
        const backToScenariosBtn1 = await page.locator('#lab-education-host >> text=← Назад к сценариям').isVisible();
        log('Кнопка "← Назад к сценариям" есть в списке уроков', backToScenariosBtn1);

        // Проверим, что в #lab-education-host появились 6 уроков (карточки с разделами)
        const lessonCardsCount = await page.locator('#lab-education-host >> text=/разделов/').count();
        log('В списке 6 уроков', lessonCardsCount === 6, `найдено: ${lessonCardsCount}`);

        // ===== ШАГ 4: открыть урок 6 → state = terminal =====
        console.log('\n[STEP 4] Открыть урок 6 — переход в state="lesson" (terminal)');
        // Кликаем через API LearningCenterUI, чтобы не зависеть от DOM-селекторов
        await page.evaluate(() => {
            if (window.LearningCenterUI && typeof window.LearningCenterUI.openLesson === 'function') {
                window.LearningCenterUI.openLesson(1, 6);
            }
        });
        await page.waitForTimeout(500);
        await shot(page, '04_lesson_state');

        const lesson6Visible = await page.locator('#lab-education-host >> text=Урок 6 из 6').isVisible();
        log('Виден контент Урока 6', lesson6Visible);

        // В уроке 6 должна быть кнопка "Перейти в Trading Terminal"
        const goToTerminalBtn = await page.locator('#lab-education-host >> text=Перейти в Trading Terminal').isVisible();
        log('Кнопка "▶ Перейти в Trading Terminal" есть', goToTerminalBtn);

        // В уроке 6 тоже должна быть кнопка "← Назад к сценариям"
        const backToScenariosBtn2 = await page.locator('#lab-education-host >> text=← Назад к сценариям').isVisible();
        log('Кнопка "← Назад к сценариям" есть в уроке 6', backToScenariosBtn2);

        // ===== ШАГ 5: нажать "← Назад к сценариям" → state = grid =====
        console.log('\n[STEP 5] Возврат по "← Назад к сценариям" в state="grid"');
        await page.click('#lab-education-host >> text=← Назад к сценариям');
        await page.waitForTimeout(500);
        await shot(page, '05_back_to_grid');

        const levelCountAfter = await page.locator('#lab-education-host >> text=/Уровень \\d/').count();
        log('Снова 6 карточек уровней', levelCountAfter === 6, `найдено: ${levelCountAfter}`);

        const learningCenterHeader = await page.locator('#lab-education-host >> text=Learning Center').isVisible();
        log('Заголовок "Learning Center" снова виден', learningCenterHeader);

        // Проверим, что всё в одном контейнере, других блоков уровней/модулей нет
        const stillOneContainer = await page.locator('#lab-cards-mode, #lab-trainer-mode, [id*="mode-tab"]').count();
        log('Всё ещё один контейнер, никаких дополнительных блоков', stillOneContainer === 0, `найдено: ${stillOneContainer}`);

        // ===== ШАГ 6: проверка перехода в Trading Terminal =====
        console.log('\n[STEP 6] Проверка перехода в Trading Terminal по кнопке');
        // Снова откроем урок 6 уровня 1 через API
        await page.evaluate(() => {
            if (window.LearningCenterUI && typeof window.LearningCenterUI.openLesson === 'function') {
                window.LearningCenterUI.openLesson(1, 6);
            }
        });
        await page.waitForTimeout(300);
        await page.click('#lab-education-host >> text=Перейти в Trading Terminal');
        await page.waitForTimeout(800);
        await shot(page, '06_terminal_active');

        // Проверим, что вкладка Terminal активна
        const terminalActive = await page.evaluate(() => {
            const btn = document.getElementById('lab-tab-terminal');
            return btn && btn.classList.contains('active');
        });
        log('Вкладка Trading Terminal стала активной', terminalActive);

        const terminalPaneVisible = await page.locator('#lab-pane-terminal').isVisible();
        log('Панель #lab-pane-terminal видна', terminalPaneVisible);

        // ===== ШАГ 7: возврат в сценарии через вкладку =====
        console.log('\n[STEP 7] Возврат на вкладку "Сценарии" — состояние восстановлено');
        await page.click('#lab-tab-modules');
        await page.waitForTimeout(800);
        await shot(page, '07_back_to_scenarios_via_tab');

        // После возврата пользователь должен попасть на тот же view, на котором был
        // до перехода в Trading Terminal — на урок 6 уровня 1
        const lesson6StillVisible = await page.locator('#lab-education-host >> text=Урок 6 из 6').isVisible();
        log('Урок 6 сохранён (state machine восстановила состояние)', lesson6StillVisible);

        // Кнопка "← Назад к сценариям" должна быть
        const backBtnAfter = await page.locator('#lab-education-host >> text=← Назад к сценариям').isVisible();
        log('Кнопка "← Назад к сценариям" видна после возврата', backBtnAfter);

        // Кнопка "Перейти в Trading Terminal" должна быть (т.к. мы на уроке 6)
        const terminalBtnAfter = await page.locator('#lab-education-host >> text=Перейти в Trading Terminal').isVisible();
        log('Кнопка "▶ Перейти в Trading Terminal" видна после возврата', terminalBtnAfter);

        // И наконец проверим, что "← Назад к сценариям" возвращает в grid
        await page.click('#lab-education-host >> text=← Назад к сценариям');
        await page.waitForTimeout(500);
        const levelCountFinal = await page.locator('#lab-education-host >> text=/Уровень \\d/').count();
        log('Финальный возврат к 6 карточкам уровней', levelCountFinal === 6, `найдено: ${levelCountFinal}`);

        // ===== Проверка консоли =====
        console.log('\n[CONSOLE] Проверка отсутствия критических ошибок');
        log('Нет критических ошибок в консоли', consoleErrors.length === 0,
            consoleErrors.length ? consoleErrors.join(' | ') : '');

    } catch (err) {
        log('Необработанная ошибка теста', false, err.message);
        try { await shot(page, '99_error_state'); } catch (e) {}
    } finally {
        await browser.close();
    }

    console.log(`\n=== ИТОГ: ${passed} ✅ / ${failed} ❌ ===`);
    if (failed > 0) {
        console.log('❌ ТЕСТ ПРОВАЛЕН');
    } else {
        console.log('✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ');
    }
})();
