const { chromium } = require('/tmp/.npm-global/lib/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  // Capture console messages
  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push(msg.text());
  });

  await page.goto('https://zk95tcyjekoc.space.minimax.io/', { waitUntil: 'networkidle' });

  // Wait 5 seconds for scripts to load
  await page.waitForTimeout(5000);

  // Execute the JavaScript
  const result = await page.evaluate(() => {
    const results = {};

    // 1. Find the link by center coordinates
    const link = document.getElementById('nav-edu-link');
    if (!link) {
      results.linkFound = false;
      return results;
    }
    results.linkFound = true;

    const rect = link.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    results.linkRect = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      centerX: x,
      centerY: y
    };

    // 2. Determine what element is at this point
    const elementAtPoint = document.elementFromPoint(x, y);
    results.elementAtPoint = {
      tag: elementAtPoint ? elementAtPoint.tagName : 'none',
      id: elementAtPoint ? elementAtPoint.id : 'none',
      className: elementAtPoint ? elementAtPoint.className : 'none',
      textContent: elementAtPoint ? elementAtPoint.textContent.substring(0, 50) : 'none',
      isLink: elementAtPoint === link
    };

    // Also try elementsFromPoint
    const elementsAtPoint = document.elementsFromPoint(x, y);
    results.allElementsAtPoint = elementsAtPoint.slice(0, 10).map(el => ({
      tag: el.tagName,
      id: el.id || '',
      className: el.className || '',
      textContent: el.textContent ? el.textContent.substring(0, 30) : ''
    }));

    // 3. Check z-index of all parents
    const parents = [];
    let el = link;
    while (el) {
      const style = getComputedStyle(el);
      parents.push({
        tag: el.tagName,
        id: el.id || '',
        className: el.className || '',
        zIndex: style.zIndex,
        pointerEvents: style.pointerEvents,
        position: style.position
      });
      el = el.parentElement;
    }
    results.parents = parents;

    // 4. Check all elements at the top of the page that might be overlapping
    const allTopElements = [];
    const allElements = document.querySelectorAll('*');
    for (const e of allElements) {
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      if (r.top >= 0 && r.top <= 100 && r.left >= 200 && r.left <= 300 &&
          r.width > 0 && r.height > 0 && s.position !== 'static' && s.zIndex !== 'auto') {
        allTopElements.push({
          tag: e.tagName,
          id: e.id || '',
          className: typeof e.className === 'string' ? e.className.substring(0, 80) : '',
          zIndex: s.zIndex,
          pointerEvents: s.pointerEvents,
          position: s.position,
          top: r.top,
          left: r.left,
          width: r.width,
          height: r.height
        });
      }
    }
    results.allTopElements = allTopElements;

    return results;
  });

  console.log('========== INSPECTION RESULTS ==========');
  console.log(JSON.stringify(result, null, 2));
  console.log('========== CONSOLE LOGS ==========');
  consoleLogs.forEach(log => console.log(log));

  await browser.close();
})();
