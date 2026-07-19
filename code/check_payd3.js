const { chromium } = require('/tmp/.npm-global/lib/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    await page.goto('https://w0b8xdggvjg0.space.minimax.io/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (e) {}
  await page.waitForTimeout(8000);

  // Scroll to the intelligence section
  await page.evaluate(() => {
    const el = document.getElementById('intelligence');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
  });
  await page.waitForTimeout(2000);

  // Take a screenshot - skip font wait
  try {
    await page.screenshot({ path: '/workspace/payd_intel_top.png', fullPage: false, timeout: 15000, animations: 'disabled' });
    console.log('Screenshot 1 saved (top of intelligence).');
  } catch (e) { console.log('Screenshot 1 err:', e.message); }

  // Scroll within the intelligence section to see more
  await page.evaluate(() => {
    // Find the Market Snapshot heading
    const headings = document.querySelectorAll('h2, h3, h4');
    for (const h of headings) {
      if (/Market Snapshot|Top Opportunities|Risk Alerts|Upcoming Unlocks|Latest Research/i.test(h.textContent)) {
        h.scrollIntoView({ behavior: 'instant', block: 'start' });
        return;
      }
    }
    // Just scroll within intelligence
    const intel = document.getElementById('intelligence');
    if (intel) window.scrollBy(0, 500);
  });
  await page.waitForTimeout(2000);

  try {
    await page.screenshot({ path: '/workspace/payd_intel_mid.png', fullPage: false, timeout: 15000, animations: 'disabled' });
    console.log('Screenshot 2 saved (mid).');
  } catch (e) { console.log('Screenshot 2 err:', e.message); }

  // Scroll to bottom of intelligence
  await page.evaluate(() => {
    const intel = document.getElementById('intelligence');
    if (intel) {
      // Scroll to within intelligence
      const rect = intel.getBoundingClientRect();
      window.scrollBy(0, 1000);
    }
  });
  await page.waitForTimeout(2000);

  try {
    await page.screenshot({ path: '/workspace/payd_intel_bot.png', fullPage: false, timeout: 15000, animations: 'disabled' });
    console.log('Screenshot 3 saved (bottom).');
  } catch (e) { console.log('Screenshot 3 err:', e.message); }

  // Get the bounding box of the intelligence section
  const box = await page.evaluate(() => {
    const intel = document.getElementById('intelligence');
    if (!intel) return null;
    const r = intel.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, scrollY: window.scrollY, docHeight: document.body.scrollHeight };
  });
  console.log('intelligence box:', JSON.stringify(box));

  // Clip screenshot to the intelligence section
  if (box) {
    try {
      await page.screenshot({
        path: '/workspace/payd_intelligence_clipped.png',
        clip: { x: Math.max(0, box.x), y: Math.max(0, box.y), width: box.width, height: Math.min(2000, box.height) },
        timeout: 15000,
        animations: 'disabled'
      });
      console.log('Clipped screenshot saved.');
    } catch (e) { console.log('Clipped screenshot err:', e.message); }
  }

  // Also count visible project cards in the intel section
  const intelContent = await page.evaluate(() => {
    const intel = document.getElementById('intelligence');
    if (!intel) return { error: 'no intelligence' };
    // Get all direct children
    const out = {
      intel_section_text_preview: intel.textContent.substring(0, 800),
      intel_outerHTML_length: intel.outerHTML.length,
      // Count clickable/card-like elements
      intel_clickables: intel.querySelectorAll('button, a, [role="button"]').length,
      // Count all divs
      intel_divs: intel.querySelectorAll('div').length,
    };
    // Look for elements with project-related text
    const allText = intel.textContent;
    const matches = (allText.match(/\b(BTC|ETH|SOL|BNB|AVAX|DOGE|XRP|TAO|RENDER|FIL|NEAR|ATOM|ADA|MATIC|DOT|TRX|LTC|LINK|UNI|AAVE)\b/g) || []);
    out.ticker_mentions = [...new Set(matches)];

    // Check for grid-like layouts
    const grids = intel.querySelectorAll('[class*="grid"], [class*="card"], [class*="project"], [class*="tile"]');
    out.grid_card_elements = grids.length;

    return out;
  });
  console.log('\n=== Intel section content ===');
  console.log(JSON.stringify(intelContent, null, 2));

  await browser.close();
})();
