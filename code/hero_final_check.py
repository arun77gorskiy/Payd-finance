from playwright.sync_api import sync_playwright
from PIL import Image
from collections import Counter
import time

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    
    page.add_init_script("""
        Element.prototype._origScrollIntoView = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function() {};
    """)
    
    page.goto("https://p1t6msnxhiku.space.minimax.io", wait_until="networkidle")
    time.sleep(4)
    
    bbox = page.evaluate("() => document.querySelector('#payd-hero-3d').getBoundingClientRect().toJSON()")
    print(f'Bbox: {bbox}')
    
    if bbox['y'] < 0 or bbox['y'] > 200:
        page.evaluate("""
            () => {
                const target = document.querySelector('#payd-hero-3d');
                const top = target.getBoundingClientRect().top + window.scrollY - 100;
                window.scrollTo({top: top, behavior: 'instant', left: 0});
            }
        """)
        time.sleep(1)
        bbox = page.evaluate("() => document.querySelector('#payd-hero-3d').getBoundingClientRect().toJSON()")
    
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
    time.sleep(12)
    page.evaluate("() => { if (window.__heroInst) window.__heroInst.isVisible = true; }")
    time.sleep(1)
    
    state = page.evaluate("""
        () => {
            const hero = window.__heroInst;
            return {
                isVisible: hero.isVisible,
                elapsed: hero.elapsed?.toFixed(2),
                labelVisible: hero.labelGroup?.visible,
                labelX: hero.labelGroup?.position?.x?.toFixed(2),
                candlesRevealed: hero.candles?.filter(c => c.revealed).length,
                bloomStrength: hero.bloomPass?.strength?.toFixed(2)
            };
        }
    """)
    print(f'State: {state}')
    
    bbox = page.evaluate("() => document.querySelector('#payd-hero-3d').getBoundingClientRect().toJSON()")
    if bbox['y'] >= 0 and bbox['y'] + bbox['height'] <= 900:
        page.screenshot(
            path='/workspace/browser/screenshots/hero_v4_final.png',
            clip={'x': bbox['x'], 'y': bbox['y'], 'width': bbox['width'], 'height': bbox['height']}
        )
        print('Saved hero_v4_final.png')
        
        im = Image.open('/workspace/browser/screenshots/hero_v4_final.png')
        pixels = list(im.getdata())
        counter = Counter(pixels)
        print(f'\nTop 12 colors:')
        for c, n in counter.most_common(12):
            print(f'  rgb{c}: {n/len(pixels)*100:.2f}%')
        
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
        print(f'Bad bbox: {bbox}')
    
    browser.close()
