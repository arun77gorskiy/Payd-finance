from playwright.sync_api import sync_playwright
import time
URL = 'https://vphetfmu42ow.space.minimax.io'
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])
    context = browser.new_context(viewport={'width': 1920, 'height': 1080})
    page = context.new_page()
    page.goto(URL, wait_until='domcontentloaded', timeout=45000)
    time.sleep(4)
    for label, seconds in [('p3', 9), ('p4', 11), ('p5', 13)]:
        data_url = page.evaluate("""() => { return new Promise(resolve => { if (window.__forceRender) window.__forceRender(""" + str(seconds) + """); setTimeout(() => { const c = document.querySelector('#payd-hero-3d canvas'); resolve(c ? c.toDataURL('image/png') : null); }, 200); }); }""")
        if data_url:
            b64 = data_url.split(',')[1]
            with open(f'/workspace/tmp/hero_check/{label}.png', 'wb') as f:
                f.write(base64.b64decode(b64))
            print(f'{label} (t={seconds}s) saved', flush=True)
    browser.close()
