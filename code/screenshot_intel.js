const { chromium } = require('/tmp/.npm-global/lib/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await page.goto('https://w0b8xdggvjg0.space.minimax.io/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (e) { console.log('navigation:', e.message); }
  await page.waitForTimeout(10000);

  // Scroll to the intelligence section
  await page.evaluate(() => {
    const el = document.getElementById('intelligence');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
  });
  await page.waitForTimeout(3000);

  // Get the bounding box of the intelligence section for a clean screenshot
  const box = await page.evaluate(() => {
    const intel = document.getElementById('intelligence');
    if (!intel) return null;
    const r = intel.getBoundingClientRect();
    return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.width, height: r.height, scrollY: window.scrollY };
  });
  console.log('intel box:', JSON.stringify(box));

  // Take viewport screenshot of the intelligence section
  try {
    await page.screenshot({ path: '/workspace/payd_intel_viewport.png', fullPage: false, timeout: 30000, animations: 'disabled' });
    console.log('Viewport screenshot saved.');
  } catch (e) { console.log('Viewport screenshot err:', e.message); }

  // Scroll a bit to capture different parts
  await page.evaluate(() => window.scrollBy(0, 600));
  await page.waitForTimeout(2000);
  try {
    await page.screenshot({ path: '/workspace/payd_intel_viewport2.png', fullPage: false, timeout: 30000, animations: 'disabled' });
    console.log('Viewport 2 saved.');
  } catch (e) { console.log('Viewport 2 err:', e.message); }

  // Scroll a bit more
  await page.evaluate(() => window.scrollBy(0, 600));
  await page.waitForTimeout(2000);
  try {
    await page.screenshot({ path: '/workspace/payd_intel_viewport3.png', fullPage: false, timeout: 30000, animations: 'disabled' });
    console.log('Viewport 3 saved.');
  } catch (e) { console.log('Viewport 3 err:', e.message); }

  // Get the rendered cards in Research Library
  const renderedCards = await page.evaluate(() => {
    const intel = document.getElementById('intelligence');
    if (!intel) return { error: 'no intelligence' };
    // Find tabs
    const tabs = intel.querySelectorAll('[role="tab"], .tab, [class*="tab-"], button[data-tab]');
    // Find any elements that look like project cards (contain ticker-like text)
    const tickerRegex = /\b(BTC|ETH|SOL|BNB|AVAX|DOGE|XRP|TAO|RENDER|FIL|NEAR|ATOM|ADA|MATIC|DOT|TRX|LTC|LINK|UNI|AAVE|ARB|OP|APT|SUI|SEI|TIA|JTO|JUP|STX|RNDR|PEPE|WIF|BOME|ONDO|ENA|ETHFI|PENDLE)\b/;
    const allElements = intel.querySelectorAll('div, article, section, li');
    const cardsWithTicker = [];
    allElements.forEach(el => {
      if (el.children.length > 0 && el.children.length < 10) {
        const text = el.textContent || '';
        if (tickerRegex.test(text) && text.length < 500) {
          const ticker = text.match(tickerRegex)[0];
          cardsWithTicker.push({
            ticker: ticker,
            textPreview: text.substring(0, 150).replace(/\s+/g, ' ').trim()
          });
        }
      }
    });

    return {
      tabs_count: tabs.length,
      tabs_text: Array.from(tabs).map(t => t.textContent?.trim() || '').filter(t => t),
      cards_with_ticker_count: cardsWithTicker.length,
      unique_cards: cardsWithTicker.slice(0, 30),
    };
  });
  console.log('\n=== Rendered Cards ===');
  console.log(JSON.stringify(renderedCards, null, 2));

  await browser.close();
})();
