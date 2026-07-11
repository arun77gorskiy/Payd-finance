from playwright.sync_api import sync_playwright
import time, base64

URL = 'https://vphetfmu42ow.space.minimax.io'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'])
    context = browser.new_context(viewport={'width': 1920, 'height': 1080})
    page = context.new_page()
    page.goto(URL, wait_until='domcontentloaded', timeout=30000)
    time.sleep(4)
    for label, seconds in [('p1_early', 2), ('p2_growing', 6), ('p3_late_grow', 9), ('p4_climax', 11), ('p5_correction', 13)]:
        data_url = page.evaluate(f"""() => {{
            return new Promise(resolve => {{
                if (window.__forceRender) window.__forceRender({seconds});
                setTimeout(() => {{
                    const canvas = document.querySelector('#payd-hero-3d canvas');
                    if (canvas) resolve(canvas.toDataURL('image/png'));
                    else resolve(null);
                }}, 200);
            }});
        }}""")
        if data_url:
            b64 = data_url.split(',')[1]
            with open(f'/workspace/tmp/hero_check/{label}.png', 'wb') as f:
                f.write(base64.b64decode(b64))
            print(f'{label} (t={seconds}s) saved')
    browser.close()
