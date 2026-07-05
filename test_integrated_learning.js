// test_integrated_learning.js
// Проверяет интегрированный режим обучения/практики внутри вкладки "Modules"
// (в текущей реализации — переключатель "Сценарии"/"Модули")

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots_integrated');
if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const LAB_URL = 'file://' + path.resolve(__dirname, 'public/lab.html');

function log(step, ok, detail = '') {
    const icon = ok ? '✅' : '❌';
    const msg = `${icon} ${step}${detail ? ' — ' + detail : ''}`;
    console.log(msg);
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

    // Сбор консольных сообщений
    const consoleErrors = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') {
            const text = msg.text();
            // Игнорируем ожидаемые ошибки при работе с file://:
            //  - CORS / сетевые ошибки от попыток фетча с Binance
            //    (наш fetch-враппер перехватывает их и подменяет ответом,
            //    но браузер всё равно логирует сам факт неудачной HTTP-загрузки)
            if (
                text.includes('binance.com') ||
                text.includes('ERR_FAILED') ||
                text.includes('ERR_FILE_NOT_FOUND') ||
                text.includes('CORS')
            ) {
                return;
            }
            consoleErrors.push(text);
        }
    });
    page.on('pageerror', (err) => consoleErrors.push('PAGE ERROR: ' + err.message));

    try {
        // ===== ШАГ 1: открыть lab.html =====
        console.log('\n[STEP 1] Открытие lab.html');
        await page.goto(LAB_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(800);

        // ===== ШАГ 2: по умолчанию активен "Сценарии" (= "Обучение") и виден #lab-education-host =====
        console.log('\n[STEP 2] Проверка режима по умолчанию');
        const scenariosActive = await page.evaluate(() => {
            const btn = document.getElementById('lab-mode-tab-scenarios');
            return btn ? btn.className.includes('border-accent-500') : false;
        });
        log('Кнопка "Сценарии" активна по умолчанию', scenariosActive);

        const educationVisible = await page.locator('#lab-education-host').isVisible();
        log('Контейнер #lab-education-host виден', educationVisible);

        const practiceHidden = !(await page.locator('#lab-cards-mode').isVisible());
        log('Контейнер #lab-cards-mode скрыт', practiceHidden);

        await shot(page, '01_default_scenarios_active');

        // ===== ШАГ 3: в #lab-education-host отрендерились 6 карточек уровней =====
        console.log('\n[STEP 3] Проверка 6 карточек уровней');
        await page.waitForTimeout(500);
        // Карточки уровней имеют текст "Уровень N"
        const levelCount = await page.locator('#lab-education-host >> text=/Уровень \\d/').count();
        log('Найдено 6 карточек уровней', levelCount === 6, `найдено: ${levelCount}`);

        // Доп. проверка: заголовок "Learning Center" должен быть
        const hasHeader = await page.locator('#lab-education-host >> text=Learning Center').isVisible();
        log('Заголовок Learning Center отображается', hasHeader);

        await shot(page, '02_levels_rendered');

        // ===== ШАГ 4: кликнуть на кнопку "Модули" (= "Практика") =====
        console.log('\n[STEP 4] Клик по кнопке "Модули"');
        await page.click('#lab-mode-tab-modules');
        await page.waitForTimeout(400);
        await shot(page, '03_modules_active');

        // ===== ШАГ 5: #lab-education-host скрыт, #lab-cards-mode виден =====
        console.log('\n[STEP 5] Проверка переключения областей');
        const educationHidden = !(await page.locator('#lab-education-host').isVisible());
        log('#lab-education-host скрыт', educationHidden);

        const cardsVisible = await page.locator('#lab-cards-mode').isVisible();
        log('#lab-cards-mode виден', cardsVisible);

        // Проверим стиль кнопок
        const modulesBtnActive = await page.evaluate(() => {
            const btn = document.getElementById('lab-mode-tab-modules');
            return btn ? btn.className.includes('border-accent-500') : false;
        });
        log('Кнопка "Модули" стала активной (белая с акцентом)', modulesBtnActive);

        // ===== ШАГ 6: внутри 4 карточки практических модулей =====
        console.log('\n[STEP 6] Проверка 4 карточек практических модулей');
        const moduleCount = await page.locator('#lab-cards-mode >> text=/МОДУЛЬ \\d/').count();
        log('Найдено 4 карточки практических модулей', moduleCount === 4, `найдено: ${moduleCount}`);

        // Проверим, что у каждой карточки есть кнопка "Начать сценарий"
        const startButtonsCount = await page.locator('#lab-cards-mode >> text=Начать сценарий').count();
        log('У всех модулей есть кнопка "Начать сценарий"', startButtonsCount === 4, `найдено: ${startButtonsCount}`);

        await shot(page, '04_practice_modules_visible');

        // ===== ШАГ 7: кликнуть обратно на "Сценарии" =====
        console.log('\n[STEP 7] Возврат в режим "Сценарии"');
        await page.click('#lab-mode-tab-scenarios');
        await page.waitForTimeout(400);
        await shot(page, '05_back_to_scenarios');

        // Финальные проверки
        const educationVisibleAgain = await page.locator('#lab-education-host').isVisible();
        log('#lab-education-host снова виден', educationVisibleAgain);

        const cardsHiddenAgain = !(await page.locator('#lab-cards-mode').isVisible());
        log('#lab-cards-mode снова скрыт', cardsHiddenAgain);

        const levelCountAgain = await page.locator('#lab-education-host >> text=/Уровень \\d/').count();
        log('Снова 6 карточек уровней', levelCountAgain === 6, `найдено: ${levelCountAgain}`);

        const scenariosActiveAgain = await page.evaluate(() => {
            const btn = document.getElementById('lab-mode-tab-scenarios');
            return btn ? btn.className.includes('border-accent-500') : false;
        });
        log('Кнопка "Сценарии" снова активна', scenariosActiveAgain);

        // ===== Проверка отсутствия критических ошибок =====
        console.log('\n[CONSOLE] Проверка отсутствия критических ошибок');
        log('Нет критических ошибок в консоли', consoleErrors.length === 0,
            consoleErrors.length ? consoleErrors.join(' | ') : '');

    } catch (err) {
        log('Необработанная ошибка теста', false, err.message);
        await shot(page, '99_error_state');
    } finally {
        await browser.close();
    }

    if (process.exitCode === 1) {
        console.log('\n❌ ТЕСТ ПРОВАЛЕН');
    } else {
        console.log('\n✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ');
    }
})();
