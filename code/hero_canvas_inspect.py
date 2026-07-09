from playwright.sync_api import sync_playwright
from PIL import Image
from collections import Counter
import io
import base64
import time

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto("https://v22muh25h3wv.space.minimax.io", wait_until="networkidle")
    time.sleep(2)
    
    # Scroll to hero
    page.locator('#payd-hero-3d').scroll_into_view_if_needed()
    time.sleep(2)
    
    # Wait for full animation
    time.sleep(11)
    
    # Get canvas image data
    data_url = page.evaluate("""
        () => {
            const canvas = document.querySelector('#payd-hero-3d canvas');
            if (!canvas) return null;
            return canvas.toDataURL('image/png');
        }
    """)
    
    if data_url:
        # Decode and save
        b64 = data_url.split(',')[1]
        img_bytes = base64.b64decode(b64)
        with open('/workspace/browser/screenshots/hero_canvas_raw.png', 'wb') as f:
            f.write(img_bytes)
        
        # Analyze
        im = Image.open(io.BytesIO(img_bytes))
        print(f'Canvas size: {im.size}')
        pixels = list(im.getdata())
        counter = Counter(pixels)
        print(f'Top 10 colors:')
        for c, n in counter.most_common(10):
            print(f'  rgb{c}: {n} ({n/len(pixels)*100:.1f}%)')
        
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
        print('No canvas found!')
    
    # State
    state = page.evaluate("""
        () => {
            const hero = window.__heroInst;
            return {
                isVisible: hero.isVisible,
                labelVisible: hero.labelGroup?.visible,
                labelOpacity: hero.labelGlow?.material?.opacity,
                labelEmissive: hero.labelMaterial?.emissiveIntensity?.toFixed(3),
                elapsed: hero.elapsed?.toFixed(2),
                cameraZ: hero.camera?.position?.z?.toFixed(2),
                bloom: hero.bloomPass?.strength?.toFixed(2)
            };
        }
    """)
    print(f'\nState: {state}')
    
    browser.close()
