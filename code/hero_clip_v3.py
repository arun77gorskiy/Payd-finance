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
    
    # Wait for IntersectionObserver to fire
    time.sleep(2)
    
    # Verify isVisible became true
    state = page.evaluate("() => window.__heroInst?.isVisible")
    print(f'isVisible after wait: {state}')
    
    # Wait for full animation to complete (10+ seconds for 6 scenes)
    time.sleep(12)
    
    # Take screenshots at different moments
    bbox = page.evaluate("""
        () => {
            const el = document.querySelector('#payd-hero-3d');
            const r = el.getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height };
        }
    """)
    print(f'Bbox: {bbox}')
    
    if bbox['y'] >= 0 and bbox['w'] > 10:
        # Final state screenshot
        page.screenshot(
            path='/workspace/browser/screenshots/hero_final_1.png',
            clip={'x': bbox['x'], 'y': bbox['y'], 'width': bbox['w'], 'height': bbox['h']}
        )
        time.sleep(1)
        page.screenshot(
            path='/workspace/browser/screenshots/hero_final_2.png',
            clip={'x': bbox['x'], 'y': bbox['y'], 'width': bbox['w'], 'height': bbox['h']}
        )
        time.sleep(1)
        page.screenshot(
            path='/workspace/browser/screenshots/hero_final_3.png',
            clip={'x': bbox['x'], 'y': bbox['y'], 'width': bbox['w'], 'height': bbox['h']}
        )
        
        # Inspect the canvas
        canvas_info = page.evaluate("""
            () => {
                const canvas = document.querySelector('#payd-hero-3d canvas');
                const hero = window.__heroInst;
                return {
                    canvas: canvas ? {w: canvas.width, h: canvas.height, sw: canvas.style.width, sh: canvas.style.height} : null,
                    state: {
                        isVisible: hero.isVisible,
                        candlesRevealed: hero.candles?.filter(c => c.revealed).length,
                        labelVisible: hero.labelGroup?.visible,
                        labelX: hero.labelGroup?.position?.x?.toFixed(2)
                    }
                };
            }
        """)
        print(f'Canvas info: {canvas_info}')
    
    browser.close()
    print('Done')
