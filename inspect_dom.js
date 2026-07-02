// Интроспекция DOM: какие кнопки есть на странице после загрузки сценария?
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('https://2sa10j1ugjik.space.minimax.io/lab.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // Кликаем "Начать"
  const start = await page.$('button:has-text("Начать")');
  if (start) await start.click();
  await page.waitForTimeout(4000);

  // Получаем список всех видимых кнопок
  const buttons = await page.$$eval('button, a[role="button"], [role="button"]', (els) =>
    els
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          text: (el.textContent || '').trim().slice(0, 60),
          ariaLabel: el.getAttribute('aria-label') || '',
          id: el.id,
          cls: (el.className || '').toString().slice(0, 80),
          dataAttrs: Array.from(el.attributes)
            .filter((a) => a.name.startsWith('data-'))
            .map((a) => `${a.name}=${a.value}`),
          visible: rect.width > 0 && rect.height > 0,
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        };
      })
      .filter((b) => b.visible),
  );
  console.log('VISIBLE BUTTONS:');
  console.log(JSON.stringify(buttons, null, 2));

  await page.screenshot({ path: 'screenshots/dom_inspect.png', fullPage: true });
  await browser.close();
})();
