const { chromium } = require('/tmp/.npm-global/lib/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const errs = [];
  page.on('pageerror', err => errs.push('PAGEERROR: ' + err.message));

  try {
    await page.goto('https://w0b8xdggvjg0.space.minimax.io/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (e) {}
  await page.waitForTimeout(8000);

  await page.evaluate(() => {
    const headings = document.querySelectorAll('h1, h2, h3');
    for (const el of headings) {
      if (el.textContent && /PAYD Intelligence/i.test(el.textContent)) {
        el.scrollIntoView({ behavior: 'instant', block: 'start' });
        return;
      }
    }
  });
  await page.waitForTimeout(2000);

  const detail = await page.evaluate(() => {
    const out = {};
    const pi = window.PAYD_INTEL;
    if (!pi) return { error: 'no PAYD_INTEL' };

    if (pi.data && pi.data.projects) {
      out.projects_top_keys = Object.keys(pi.data.projects);
      if (pi.data.projects.projects) {
        const inner = pi.data.projects.projects;
        if (Array.isArray(inner)) {
          out.actual_projects_count = inner.length;
          out.first_3_projects = inner.slice(0, 3).map(p => ({
            id: p.id, name: p.name, sector: p.sector, tier: p.tier,
            has_score: typeof p.ai_score, keys: Object.keys(p).slice(0, 10)
          }));
        } else if (typeof inner === 'object') {
          out.actual_projects_count = 'object with ' + Object.keys(inner).length + ' keys';
          out.inner_projects_keys = Object.keys(inner).slice(0, 5);
          // Get one example
          const k = Object.keys(inner)[0];
          if (k) out.first_item_sample = inner[k];
        } else {
          out.actual_projects_count = 'type: ' + typeof inner;
        }
      } else {
        out.actual_projects_count = 'no inner projects array';
      }
    }

    if (pi.data && pi.data.aiInfra) {
      out.aiInfra_top_keys = Object.keys(pi.data.aiInfra);
      if (pi.data.aiInfra.projects) {
        out.aiInfra_projects_count = pi.data.aiInfra.projects.length;
      }
    }

    out.allH2H3 = [];
    document.querySelectorAll('h1, h2, h3, h4').forEach(h => {
      out.allH2H3.push(h.tagName + ': ' + h.textContent.trim().substring(0, 80));
    });

    out.sectionsById = [];
    document.querySelectorAll('section[id], div[id]').forEach(s => {
      if (s.id) out.sectionsById.push(s.id + ' (children: ' + s.children.length + ')');
    });

    return out;
  });
  console.log(JSON.stringify(detail, null, 2));

  console.log('\nPage errors:', errs.length);
  errs.slice(0, 5).forEach(e => console.log(' -', e));

  await page.screenshot({ path: '/workspace/payd_intel_section.png', fullPage: false, timeout: 10000 });
  console.log('Screenshot saved.');

  await browser.close();
})();
