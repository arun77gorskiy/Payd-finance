from playwright.sync_api import sync_playwright
from PIL import Image
from collections import Counter
import time

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto("https://v22muh25h3wv.space.minimax.io", wait_until="networkidle")
    time.sleep(3)  # Wait for any auto-scroll to settle
    
    # Get current position
    bbox0 = page.evaluate("() => document.querySelector('#payd-hero-3d').getBoundingClientRect().toJSON()")
    print(f'Bbox initial: {bbox0}')
    
    # Now scroll to hero
    page.locator('#payd-hero-3d').scroll_into_view_if_needed()
    time.sleep(2)
    
    # Verify
    bbox1 = page.evaluate("() => document.querySelector('#payd-hero-3d').getBoundingClientRect().toJSON()")
    print(f'Bbox after scroll: {bbox1}')
    
    if bbox1['y'] < 0 or bbox1['y'] > 500:
        # Try again
        page.evaluate("window.scrollTo(0, 200)")
        time.sleep(1)
        bbox1 = page.evaluate("() => document.querySelector('#payd-hero-3d').getBoundingClientRect().toJSON()")
        print(f'Bbox after manual: {bbox1}')
    
    # Force isVisible = true and reset animation
    page.evaluate("""
        () => {
            const hero = window.__heroInst;
            if (hero) {
                hero.isVisible = true;
                hero.startTime = performance.now();
                hero.lastTime = performance.now();
            }
        }
    """)
    
    # Wait for full animation
    time.sleep(11)
    
    # Re-force isVisible (in case it was reset)
    page.evaluate("() => { if (window.__heroInst) window.__heroInst.isVisible = true; }")
    time.sleep(1)
    
    # Get state
    state = page.evaluate("""
        () => {
            const hero = window.__heroInst;
            return {
                isVisible: hero.isVisible,
                elapsed: hero.elapsed?.toFixed(2),
                labelVisible: hero.labelGroup?.visible,
                labelX: hero.labelGroup?.position?.x?.toFixed(2),
                candlesRevealed: hero.candles?.filter(c => c.revealed).length,
                baselineOpacity: hero.baseline?.material?.opacity?.toFixed(2),
                cameraX: hero.camera?.position?.x?.toFixed(2),
                cameraY: hero.camera?.position?.y?.toFixed(2),
                cameraZ: hero.camera?.position?.z?.toFixed(2)
            };
        }
    """)
    print(f'State: {state}')
    
    # Screenshot
    bbox = page.evaluate("() => document.querySelector('#payd-hero-3d').getBoundingClientRect().toJSON()")
    print(f'Bbox for screenshot: {bbox}')
    
    if bbox['y'] >= 0 and bbox['y'] + bbox['height'] <= 900:
        page.screenshot(
            path='/workspace/browser/screenshots/hero_force3.png',
            clip={'x': bbox['x'], 'y': bbox['y'], 'width': bbox['width'], 'height': bbox['height']}
        )
        print('Screenshot saved!')
        
        # Analyze
        im = Image.open('/workspace/browser/screenshots/hero_force3.png')
        pixels = list(im.getdata())
        counter = Counter(pixels)
        print(f'\nTop 10 colors:')
        for c, n in counter.most_common(10):
            print(f'  rgb{c}: {n/len(pixels)*100:.1f}%')
        
        golds = sum(1 for p in pixels if p[0] > 130 and p[1] > 90 and p[2] < 130)
        violets = sum(1 for p in pixels if p[0] > 60 and p[2] > 100 and p[1] < 80)
        greens = sum(1 for p in pixels if p[1] > 100 and p[0] < 100 and p[2] < 100)
        reds = sum(1 for p in pixels if p[0] > 150 and p[1] < 100 and p[2] < 100)
        bright = sum(1 for p in pixels if (p[0]+p[1]+p[2])/3 > 50)
        total = len(pixels)
        print(f'\n  Gold: {golds/total:.1%} ({golds})')
        print(f'  Violet: {violets/total:.1%} ({violets})')
        print(f'  Green: {greens/total:.1%} ({greens})')
        print(f'  Red: {reds/total:.1%} ({reds})')
        print(f'  Bright: {bright/total:.1%} ({bright})')
    else:
        print(f'Bbox invalid for clip screenshot: {bbox}')
    
    browser.close()
