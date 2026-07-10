const { chromium } = require('/workspace/node_modules/playwright/index.js');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Capture console logs and errors
  const consoleLogs = [];
  const consoleErrors = [];
  page.on('console', msg => {
    const entry = `[${msg.type()}] ${msg.text()}`;
    consoleLogs.push(entry);
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => {
    consoleErrors.push(`PageError: ${err.message}`);
  });

  console.log('=== NAVIGATING (no hash) ===');
  await page.goto('https://igfhaekyzazp.space.minimax.io/', { waitUntil: 'domcontentloaded', timeout: 30000 });

  // Force scroll to top and remove any hash
  await page.evaluate(() => {
    if (window.location.hash) history.replaceState(null, '', window.location.pathname);
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });

  console.log('=== WAITING 5 SECONDS FOR ANIMATION ===');
  await page.waitForTimeout(5000);

  // Force scroll to top again in case page auto-scrolled
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  // Get current scroll position and hero element info
  const scrollAndHeroInfo = await page.evaluate(() => {
    const el = document.querySelector('#payd-hero-3d');
    return {
      scrollY: window.scrollY,
      pageHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      currentURL: window.location.href,
      heroExists: !!el,
      heroRect: el ? el.getBoundingClientRect().toJSON() : null,
      heroComputedStyle: el ? {
        display: getComputedStyle(el).display,
        visibility: getComputedStyle(el).visibility,
        opacity: getComputedStyle(el).opacity,
        position: getComputedStyle(el).position,
        zIndex: getComputedStyle(el).zIndex
      } : null
    };
  });
  console.log('Scroll + Hero Info:', JSON.stringify(scrollAndHeroInfo, null, 2));

  // Force scroll to top once more before screenshots
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(500);

  // Get fresh bounding box AFTER scroll
  const finalBox = await page.evaluate(() => {
    const el = document.querySelector('#payd-hero-3d');
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, scrollY: window.scrollY };
  });
  console.log('Final box at scrollY=0:', JSON.stringify(finalBox));

  // Take full page screenshot
  console.log('=== TAKING FULL PAGE SCREENSHOT ===');
  await page.screenshot({ path: '/workspace/browser/screenshots/hero_full_page_t5.png', fullPage: true });

  // Take hero-only screenshot using clip
  console.log('=== TAKING HERO-ONLY SCREENSHOT (T=5s) ===');
  await page.screenshot({
    path: '/workspace/browser/screenshots/hero_element_t5.png',
    clip: {
      x: Math.max(0, finalBox.x),
      y: Math.max(0, finalBox.y),
      width: finalBox.width,
      height: finalBox.height
    }
  });

  // Get __heroPremium properties NOW
  console.log('=== __heroPremium PROPERTIES (T=5s) ===');
  const heroDataT5 = await page.evaluate(() => {
    const result = { timestamp: 'T=5s' };
    if (typeof window.__heroPremium === 'undefined') {
      result.exists = false;
    } else {
      result.exists = true;
      result.scene_children_length = window.__heroPremium.scene?.children?.length;
      result.bars_length = window.__heroPremium.bars?.length;
      result.orbitGroup_children_length = window.__heroPremium.orbitGroup?.children?.length;
      result.rings_length = window.__heroPremium.rings?.length;
      result.fontReady = window.__heroPremium.fontReady;
      result.isVisible = window.__heroPremium.isVisible;
      result.allKeys = Object.keys(window.__heroPremium);
      // Additional info
      result.dpr = window.__heroPremium.dpr;
      result.width = window.__heroPremium.width;
      result.height = window.__heroPremium.height;
      result.isLowEnd = window.__heroPremium.isLowEnd;
      result.isAutomated = window.__heroPremium.isAutomated;
      result.elapsed = window.__heroPremium.elapsed;
    }
    return result;
  });
  console.log('Hero Data T=5s:', JSON.stringify(heroDataT5, null, 2));

  // Wait another 5 seconds and take another hero screenshot
  console.log('=== WAITING ANOTHER 5 SECONDS ===');
  await page.waitForTimeout(5000);

  // Re-force scroll to top
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(300);

  const finalBoxT10 = await page.evaluate(() => {
    const el = document.querySelector('#payd-hero-3d');
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, scrollY: window.scrollY };
  });
  console.log('Final box at T=10s, scrollY=0:', JSON.stringify(finalBoxT10));

  console.log('=== TAKING HERO-ONLY SCREENSHOT (T=10s) ===');
  await page.screenshot({
    path: '/workspace/browser/screenshots/hero_element_t10.png',
    clip: {
      x: Math.max(0, finalBoxT10.x),
      y: Math.max(0, finalBoxT10.y),
      width: finalBoxT10.width,
      height: finalBoxT10.height
    }
  });

  // Get __heroPremium properties at T=10s
  console.log('=== __heroPremium PROPERTIES (T=10s) ===');
  const heroDataT10 = await page.evaluate(() => {
    const result = { timestamp: 'T=10s' };
    if (typeof window.__heroPremium === 'undefined') {
      result.exists = false;
    } else {
      result.exists = true;
      result.scene_children_length = window.__heroPremium.scene?.children?.length;
      result.bars_length = window.__heroPremium.bars?.length;
      result.orbitGroup_children_length = window.__heroPremium.orbitGroup?.children?.length;
      result.rings_length = window.__heroPremium.rings?.length;
      result.fontReady = window.__heroPremium.fontReady;
      result.isVisible = window.__heroPremium.isVisible;
      result.elapsed = window.__heroPremium.elapsed;
    }
    return result;
  });
  console.log('Hero Data T=10s:', JSON.stringify(heroDataT10, null, 2));

  // Take final full page screenshot
  await page.screenshot({ path: '/workspace/browser/screenshots/hero_full_page_t10.png', fullPage: true });

  // Take viewport screenshot too
  await page.screenshot({ path: '/workspace/browser/screenshots/hero_viewport_t10.png' });

  // Save results to JSON
  fs.writeFileSync('/workspace/hero_analysis_results.json', JSON.stringify({
    heroDataT5,
    heroDataT10,
    finalBoxT5: finalBox,
    finalBoxT10,
    scrollAndHeroInfo,
    consoleErrors,
    consoleLogsCount: consoleLogs.length,
    heroLogs: consoleLogs.filter(l => l.toLowerCase().includes('hero'))
  }, null, 2));

  console.log('\n=== HERO-SPECIFIC CONSOLE LOGS ===');
  consoleLogs.filter(l => l.toLowerCase().includes('hero')).forEach(log => console.log(log));

  console.log('\n=== CONSOLE ERRORS SUMMARY ===');
  console.log(`Total console errors: ${consoleErrors.length}`);
  console.log('Hero-related errors:');
  consoleErrors.filter(e => e.toLowerCase().includes('hero')).forEach(e => console.log('  ' + e));
  console.log('Other errors (CORS/network/etc):');
  consoleErrors.filter(e => !e.toLowerCase().includes('hero')).forEach(e => console.log('  ' + e));

  await browser.close();
  console.log('\n=== DONE ===');
})().catch(err => {
  console.error('SCRIPT ERROR:', err);
  process.exit(1);
});