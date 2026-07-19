const { chromium } = require('/tmp/.npm-global/lib/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleMessages = [];
  page.on('console', msg => {
    consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', err => {
    consoleMessages.push(`[PAGEERROR] ${err.message}`);
  });

  console.log('Navigating...');
  try {
    await page.goto('https://w0b8xdggvjg0.space.minimax.io/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (e) {
    console.log('Navigation error (may be partial load):', e.message);
  }

  console.log('Waiting 8 seconds for JS to load...');
  await page.waitForTimeout(8000);

  console.log('Scrolling to PAYD Intelligence section...');
  await page.evaluate(() => {
    const headings = document.querySelectorAll('h1, h2, h3');
    for (const el of headings) {
      if (el.textContent && /PAYD Intelligence/i.test(el.textContent)) {
        el.scrollIntoView({ behavior: 'instant', block: 'start' });
        return;
      }
    }
    window.scrollTo(0, document.body.scrollHeight * 0.4);
  });
  await page.waitForTimeout(3000);

  await page.screenshot({ path: '/workspace/payd_intelligence.png', fullPage: false });
  console.log('Screenshot saved.');

  console.log('\n=== Evaluating window.PAYD_INTEL ===');
  const result = await page.evaluate(() => {
    const out = {};
    try {
      out.hasPAYD_INTEL = typeof window.PAYD_INTEL !== 'undefined';
      if (typeof window.PAYD_INTEL !== 'undefined') {
        const pi = window.PAYD_INTEL;
        out.state_loaded = pi.state ? pi.state.loaded : 'no state';
        out.state_keys = pi.state ? Object.keys(pi.state) : 'no state';

        if (pi.data) {
          out.data_keys = Object.keys(pi.data);

          if (pi.data.projects) {
            if (Array.isArray(pi.data.projects)) {
              out.projects_type = 'array';
              out.projects_count = pi.data.projects.length;
            } else if (typeof pi.data.projects === 'object') {
              out.projects_type = 'object';
              out.projects_count = Object.keys(pi.data.projects).length;
              out.projects_first_3_keys = Object.keys(pi.data.projects).slice(0, 3);
              const firstKey = Object.keys(pi.data.projects)[0];
              if (firstKey && Array.isArray(pi.data.projects[firstKey])) {
                out.projects_nested_array_size = pi.data.projects[firstKey].length;
              }
            } else {
              out.projects_type = typeof pi.data.projects;
            }
          } else {
            out.projects = 'undefined';
          }

          if (pi.data.overview) {
            out.overview_exists = true;
            out.overview_keys = Object.keys(pi.data.overview);
            if (pi.data.overview.totals) {
              out.overview_totals_keys = Object.keys(pi.data.overview.totals);
              out.projects_tracked = pi.data.overview.totals.projects_tracked;
            } else {
              out.overview_totals = 'undefined';
            }
          } else {
            out.overview = 'undefined';
          }

          if (pi.data.depin) {
            out.depin_keys = Object.keys(pi.data.depin);
            out.depin_total_projects = pi.data.depin.total_projects;
            if (Array.isArray(pi.data.depin.projects)) {
              out.depin_projects_count = pi.data.depin.projects.length;
            }
          } else {
            out.depin = 'undefined';
          }
        } else {
          out.data = 'undefined';
        }

        out.pi_keys = Object.keys(pi);
      }
    } catch (e) {
      out.error = e.message;
    }
    return out;
  });
  console.log(JSON.stringify(result, null, 2));

  console.log('\n=== Console Messages (filtered) ===');
  const relevant = consoleMessages.filter(m =>
    /intelligence|PAYD|depin|project|error|ERROR/i.test(m)
  );
  console.log(relevant.slice(-30).join('\n'));

  console.log('\n=== Counting rendered cards ===');
  const cardInfo = await page.evaluate(() => {
    const out = {};
    const headings = document.querySelectorAll('h1, h2, h3, h4');
    const found = [];
    headings.forEach(h => {
      const t = h.textContent.trim();
      if (/research library|ai infrastructure|projects|library|intel/i.test(t)) {
        found.push(t);
      }
    });
    out.foundHeadings = found.slice(0, 20);

    const cardSelectors = [
      '.project-card', '.card', '[data-project]', '.grid > div',
      '.projectCard', 'article', '.project-tile'
    ];
    out.cardCounts = {};
    for (const sel of cardSelectors) {
      try {
        out.cardCounts[sel] = document.querySelectorAll(sel).length;
      } catch (e) {}
    }
    return out;
  });
  console.log(JSON.stringify(cardInfo, null, 2));

  await page.screenshot({ path: '/workspace/payd_full.png', fullPage: true });

  await browser.close();
  console.log('\nDone.');
})();
