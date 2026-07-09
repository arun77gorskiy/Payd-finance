from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto("https://v22muh25h3wv.space.minimax.io", wait_until="networkidle")
    time.sleep(1)
    
    # Scroll to hero
    page.evaluate("document.querySelector('#payd-hero-3d').scrollIntoView({block: 'center'})")
    time.sleep(1)
    
    # Wait for full animation to complete
    time.sleep(11)
    
    # Get hero element bbox AFTER scroll
    bbox = page.evaluate("""
        () => {
            const el = document.querySelector('#payd-hero-3d');
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height };
        }
    """)
    print(f'Hero bbox after scroll: {bbox}')
    
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
        print('Screenshots taken')
    else:
        print(f'Invalid bbox: {bbox}')
    
    # State inspection
    state = page.evaluate("""
        () => {
            const hero = window.__heroInst;
            if (!hero) return null;
            return {
                candlesTotal: hero.candles?.length,
                candlesRevealed: hero.candles?.filter(c => c.revealed).length,
                labelVisible: hero.labelGroup?.visible,
                labelX: hero.labelGroup?.position?.x?.toFixed(3),
                labelY: hero.labelGroup?.position?.y?.toFixed(3),
                baselineOpacity: hero.baseline?.material?.opacity?.toFixed(3),
                cameraX: hero.camera?.position?.x?.toFixed(3),
                cameraY: hero.camera?.position?.y?.toFixed(3),
                cameraZ: hero.camera?.position?.z?.toFixed(3),
                isVisible: hero.isVisible,
                candle0: hero.candles?.[0] ? {
                    revealed: hero.candles[0].revealed,
                    bodyVisible: hero.candles[0].body?.visible,
                    bodyX: hero.candles[0].body?.position?.x?.toFixed(3),
                    bodyY: hero.candles[0].body?.position?.y?.toFixed(3)
                } : null
            };
        }
    """)
    print(f'State: {state}')
    
    browser.close()
    print('Done')
