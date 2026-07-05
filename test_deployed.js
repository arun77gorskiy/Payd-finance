// Тест развёрнутого сайта
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  
  const url = 'https://yyt9adelsanj.space.minimax.io/lab.html';
  console.log('Открываю:', url);
  
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  // Скриншот
  await page.screenshot({ path: 'deployed_initial.png', fullPage: true });
  
  // Ищем вкладку
  const hasLearningTab = await page.evaluate(() => {
    const btn = document.getElementById('lab-tab-learning');
    if (!btn) return { found: false, text: '' };
    return { 
      found: true, 
      text: btn.textContent.trim(),
      visible: btn.offsetParent !== null,
      rect: btn.getBoundingClientRect()
    };
  });
  console.log('Вкладка Learning Center:', JSON.stringify(hasLearningTab, null, 2));
  
  // Ищем все кнопки навигации
  const allTabs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.lab-tab-btn')).map(b => ({
      id: b.id,
      text: b.textContent.trim(),
      visible: b.offsetParent !== null
    }));
  });
  console.log('Все вкладки навигации:');
  allTabs.forEach(t => console.log(' -', t.id, '|', t.text, '| visible:', t.visible));
  
  // Проверяем, загрузились ли скрипты
  const scripts = await page.evaluate(() => {
    return {
      hasEducation: typeof window.EducationContent !== 'undefined',
      hasLearningUI: typeof window.LearningCenterUI !== 'undefined',
      hasPanes: Array.from(document.querySelectorAll('.lab-pane')).map(p => p.id)
    };
  });
  console.log('Скрипты:', JSON.stringify(scripts, null, 2));
  
  // Проверяем HTML
  const html = await page.content();
  console.log('Содержит "Learning Center":', html.includes('Learning Center'));
  console.log('Содержит "lab-tab-learning":', html.includes('lab-tab-learning'));
  console.log('Содержит "lab-pane-learning":', html.includes('lab-pane-learning'));
  
  await browser.close();
})();
