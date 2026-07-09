from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto("https://v22muh25h3wv.space.minimax.io", wait_until="networkidle")
    time.sleep(1)
    
    # Force scroll directly
    page.evaluate("""
        () => {
            const el = document.querySelector('#payd-hero-3d');
            const targetY = el.getBoundingClientRect().top + window.scrollY - 100;
            window.scrollTo({top: targetY, behavior: 'instant'});
        }
    """)
    time.sleep(2)
    
    bbox = page.evaluate("""
        () => {
            const el = document.querySelector('#payd-hero-3d');
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height };
        }
    """)
    print(f'Hero bbox: {bbox}')
    
    if bbox and bbox['w'] > 10 and bbox['y'] >= 0:
        page.screenshot(
            path='/workspace/browser/screenshots/hero_clip_1.png',
            clip={'x': bbox['x'], 'y': bbox['y'], 'width': bbox['w'], 'height': bbox['h']}
        )
        time.sleep(2)
        page.screenshot(
            path='/workspace/browser/screenshots/hero_clip_2.png',
            clip={'x': bbox['x'], 'y': bbox['y'], 'width': bbox['w'], 'height': bbox['h']}
        )
        time.sleep(2)
        page.screenshot(
            path='/workspace/browser/screenshots/hero_clip_3.png',
            clip={'x': bbox['x'], 'y': bbox['y'], 'width': bbox['w'], 'height': bbox['h']}
        )
        print('3 screenshots taken')
    else:
        print(f'BAD bbox: {bbox}')
        # fallback: full viewport after scroll
        page.screenshot(path='/workspace/browser/screenshots/hero_clip_full.png')
    
    state = page.evaluate("""
        () => {
            const hero = window.__heroInst;
            return {
                isVisible: hero.isVisible,
                cameraZ: hero.camera?.position?.z?.toFixed(2)
            };
        }
    """)
    print(f'State: {state}')
    
    browser.close()
