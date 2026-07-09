from playwright.sync_api import sync_playwright
from PIL import Image
from collections import Counter
import time

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto("https://v22muh25h3wv.space.minimax.io", wait_until="domcontentloaded")
    time.sleep(4)  # Wait for full load
    
    # Wait for hero to be initialized
    page.wait_for_function("window.__heroInst && window.__heroInst.scene", timeout=10000)
    
    # Force scroll
    for attempt in range(5):
        page.locator('#payd-hero-3d').scroll_into_view_if_needed()
        time.sleep(1)
        bbox = page.evaluate("() => document.querySelector('#payd-hero-3d').getBoundingClientRect().toJSON()")
        if 0 <= bbox['y'] <= 400:
            print(f'Scroll OK on attempt {attempt+1}: y={bbox["y"]}')
            break
        else:
            print(f'Attempt {attempt+1}: y={bbox["y"]} - bad')
    
    print(f'Final bbox: {bbox}')
    
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
    
    # Wait for animation
    time.sleep(11)
    
    # Take screenshot
    bbox = page.evaluate("() => document.querySelector('#payd-hero-3d').getBoundingClientRect().toJSON()")
    print(f'Bbox for screenshot: {bbox}')
    
    if bbox['y'] >= 0 and bbox['width'] > 0:
        page.screenshot(
            path='/workspace/browser/screenshots/hero_force2.png',
            clip={'x': bbox['x'], 'y': bbox['y'], 'width': bbox['width'], 'height': bbox['height']}
        )
        print('Screenshot saved')
    
    state = page.evaluate("""
        () => {
            const hero = window.__heroInst;
            return {
                isVisible: hero.isVisible,
                elapsed: hero.elapsed?.toFixed(2),
                labelVisible: hero.labelGroup?.visible,
                labelX: hero.labelGroup?.position?.x?.toFixed(2),
                candlesRevealed: hero.candles?.filter(c => c.revealed).length,
                baselineOpacity: hero.baseline?.material?.opacity?.toFixed(2)
            };
        }
    """)
    print(f'State: {state}')
    
    if os.path.exists('/workspace/browser/screenshots/hero_force2.png'):
        im = Image.open('/workspace/browser/screenshots/hero_force2.png')
        pixels = list(im.getdata())
        counter = Counter(pixels)
        print(f'\nTop 10:')
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
    
    browser.close()

import os
