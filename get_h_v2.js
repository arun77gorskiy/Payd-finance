const puppeteer = require('puppeteer-core');

(async () => {
  const wsEndpoint = 'ws://127.0.0.1:9222/devtools/page/9687537DB9ACA7E398E97C0775D8F2B3';
  try {
    const browser = await puppeteer.connect({
      browserWSEndpoint: wsEndpoint,
      defaultViewport: null,
      protocolTimeout: 120000
    });
    const pages = await browser.pages();
    const page = pages.find(p => p.url().includes('083kkiha0nsd'));
    if (!page) throw new Error('Page not found');

    // Set longer timeout
    page.setDefaultTimeout(120000);
    page.setDefaultNavigationTimeout(120000);

    // Wait a bit more for the page
    await new Promise(r => setTimeout(r, 3000));

    // Try to get the header text
    const result = await page.evaluate(() => {
      const h2s = Array.from(document.querySelectorAll('h2'));
      const h1s = Array.from(document.querySelectorAll('h1'));
      const h3s = Array.from(document.querySelectorAll('h3'));
      const allHeaders = [...h1s, ...h2s, ...h3s].map(h => ({tag: h.tagName, text: h.textContent.trim().substring(0, 200)}));
      const bodyText = document.body ? document.body.innerText.substring(0, 2000) : '';
      return { allHeaders, bodyText, readyState: document.readyState };
    });

    console.log('READY STATE:', result.readyState);
    console.log('HEADERS:');
    result.allHeaders.forEach(h => console.log(`  [${h.tag}] ${h.text}`));
    console.log('\nBODY TEXT (first 2000 chars):');
    console.log(result.bodyText);
  } catch (e) {
    console.error('ERROR:', e.message);
  }
  process.exit(0);
})();
