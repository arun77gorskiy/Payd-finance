const { chromium } = require('/tmp/.npm-global/lib/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleMessages = [];
  page.on('console', (msg) => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
  });
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  try {
    await page.goto('https://w0b8xdggvjg0.space.minimax.io/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (e) { console.log('navigation:', e.message); }
  await page.waitForTimeout(8000);

  // Verify window.PAYD_INTEL object first
  const intelData = await page.evaluate(() => {
    const pi = window.PAYD_INTEL;
    if (!pi) return { exists: false };
    const projectValues = pi.data?.projects?.projects ? Object.values(pi.data.projects.projects) : [];
    return {
      exists: true,
      state_loaded: pi.state?.loaded,
      projects_tracked: pi.data?.overview?.totals?.projects_tracked,
      depin_total: pi.data?.depin?.total_projects,
      projects_count_in_data: projectValues.length,
      first_3_tickers: projectValues.slice(0, 3).map(p => p.ticker || p.symbol || Object.keys(p)[0]),
    };
  });
  console.log('window.PAYD_INTEL:', JSON.stringify(intelData, null, 2));

  // Scroll to the intelligence section
  await page.evaluate(() => {
    const el = document.getElementById('intelligence');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
  });
  await page.waitForTimeout(3000);

  // Take a screenshot of the top of intelligence
  try {
    await page.screenshot({ path: '/workspace/payd_intel_top.png', fullPage: false, timeout: 30000, animations: 'disabled' });
    console.log('Screenshot 1 saved (top).');
  } catch (e) { console.log('Screenshot 1 err:', e.message); }

  // Count visible project cards in different sections within the intel section
  const cardCount = await page.evaluate(() => {
    const intel = document.getElementById('intelligence');
    if (!intel) return { error: 'no intelligence section found' };

    // Look for any element with a class containing project, card, tile
    const cards = intel.querySelectorAll('[class*="project"], [class*="card"], [class*="tile"], [class*="row-item"]');
    const buttons = intel.querySelectorAll('button');
    const links = intel.querySelectorAll('a[href]');

    // Find specific research library / AI infrastructure sections
    const sections = {};
    const allH = intel.querySelectorAll('h1, h2, h3, h4, h5');
    allH.forEach(h => {
      sections[h.textContent.trim()] = h.parentElement ? h.parentElement.children.length : 0;
    });

    // Look for elements that show project names with tickers
    const tickerRegex = /^[A-Z]{2,6}$/;
    const tickersFound = [];
    const allElements = intel.querySelectorAll('*');
    allElements.forEach(el => {
      const text = el.textContent?.trim();
      if (text && tickerRegex.test(text) && el.children.length === 0) {
        tickersFound.push(text);
      }
    });

    return {
      cards_count: cards.length,
      buttons_count: buttons.length,
      links_count: links.length,
      headings: Array.from(allH).map(h => h.textContent.trim()),
      tickers_found: tickersFound.slice(0, 30),
      unique_tickers: [...new Set(tickersFound)].length,
    };
  });
  console.log('Card count:', JSON.stringify(cardCount, null, 2));

  // Scroll a bit and take another screenshot
  await page.evaluate(() => window.scrollBy(0, 700));
  await page.waitForTimeout(2000);
  try {
    await page.screenshot({ path: '/workspace/payd_intel_mid.png', fullPage: false, timeout: 30000, animations: 'disabled' });
    console.log('Screenshot 2 saved (mid).');
  } catch (e) { console.log('Screenshot 2 err:', e.message); }

  // Get the dimensions of the intelligence section
  const box = await page.evaluate(() => {
    const intel = document.getElementById('intelligence');
    if (!intel) return null;
    const r = intel.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, scrollY: window.scrollY };
  });
  console.log('intel box:', JSON.stringify(box));

  // Take a clipped screenshot of the full intelligence section
  if (box) {
    try {
      // scroll back to top of intel
      await page.evaluate(() => {
        const intel = document.getElementById('intelligence');
        if (intel) intel.scrollIntoView({ behavior: 'instant', block: 'start' });
      });
      await page.waitForTimeout(1500);
      await page.screenshot({
        path: '/workspace/payd_intelligence_full.png',
        fullPage: true,
        timeout: 60000,
        animations: 'disabled'
      });
      console.log('Full page screenshot saved.');
    } catch (e) { console.log('Full page err:', e.message); }
  }

  // Output console messages
  console.log('\n=== Console errors ===');
  const errors = consoleMessages.filter(m => m.type === 'error');
  errors.forEach(e => console.log('ERROR:', e.text.substring(0, 300)));
  console.log('\n=== Page errors ===');
  pageErrors.forEach(e => console.log('PAGE_ERR:', e.substring(0, 300)));

  await browser.close();
})();
