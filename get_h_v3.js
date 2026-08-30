const puppeteer = require('puppeteer-core');

(async () => {
  try {
    const browser = await puppeteer.connect({
      browserURL: 'http://127.0.0.1:9222',
      defaultViewport: null,
      protocolTimeout: 120000
    });
    const pages = await browser.pages();
    console.log('Total pages:', pages.length);
    pages.forEach((p, i) => console.log(`  Page ${i}: ${p.url()}`));

    const page = pages.find(p => p.url().includes('083kkiha0nsd'));
    if (!page) {
      console.log('Page not found in existing pages. Creating new one...');
      throw new Error('Page not found');
    }

    page.setDefaultTimeout(120000);
    page.setDefaultNavigationTimeout(120000);

    await new Promise(r => setTimeout(r, 2000));

    const result = await page.evaluate(() => {
      const h2s = Array.from(document.querySelectorAll('h2'));
      const h1s = Array.from(document.querySelectorAll('h1'));
      const h3s = Array.from(document.querySelectorAll('h3'));
      const allHeaders = [...h1s, ...h2s, ...h3s].map(h => ({tag: h.tagName, text: h.textContent.trim().substring(0, 300)}));
      const bodyText = document.body ? document.body.innerText.substring(0, 3000) : '';
      return { allHeaders, bodyText, readyState: document.readyState, title: document.title };
    });

    console.log('\n=== READY STATE:', result.readyState);
    console.log('=== TITLE:', result.title);
    console.log('=== HEADERS:');
    result.allHeaders.forEach(h => console.log(`  [${h.tag}] ${h.text}`));
    console.log('\n=== BODY TEXT (first 3000 chars):');
    console.log(result.bodyText);

    await browser.disconnect();
  } catch (e) {
    console.error('ERROR:', e.message);
  }
  process.exit(0);
})();
