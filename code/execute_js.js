const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to the target URL and wait for it to load
    await page.goto('https://edbbcrjqt5pu.space.minimax.io/', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // Wait a bit more for dynamic content
    await page.waitForTimeout(3000);

    // Execute the JavaScript to set document.title
    await page.evaluate(() => {
      document.title = JSON.stringify({
        loadingDisplay: document.getElementById('lt-chart-loading')?.style.display,
        loadingText: document.getElementById('lt-loading-text')?.textContent,
        resultDisplay: document.getElementById('lt-result-screen')?.style.display,
        resultVerdict: document.getElementById('lt-result-title')?.textContent,
        resultSubtitle: document.getElementById('lt-result-subtitle')?.textContent
      });
    });

    // Read back document.title
    const title = await page.title();
    console.log('TITLE_RESULT:', title);

    // Also try to extract more info if elements exist
    const elementsExist = await page.evaluate(() => {
      return {
        chartLoading: !!document.getElementById('lt-chart-loading'),
        loadingText: !!document.getElementById('lt-loading-text'),
        resultScreen: !!document.getElementById('lt-result-screen'),
        resultTitle: !!document.getElementById('lt-result-title'),
        resultSubtitle: !!document.getElementById('lt-result-subtitle')
      };
    });
    console.log('ELEMENTS_EXIST:', JSON.stringify(elementsExist));

  } catch (error) {
    console.error('ERROR:', error.message);
  } finally {
    await browser.close();
  }
})();