from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto("https://v22muh25h3wv.space.minimax.io", wait_until="networkidle")
    time.sleep(3)
    
    # Use Playwright's built-in scroll
    page.locator('#payd-hero-3d').scroll_into_view_if_needed()
    time.sleep(1)
    
    bbox = page.evaluate("() => document.querySelector('#payd-hero-3d').getBoundingClientRect().toJSON()")
    print(f'After scroll: {bbox}')
    
    # Make sure element is in viewport
    if bbox['y'] < 0 or bbox['y'] > 900:
        page.evaluate("window.scrollBy(0, 500)")
        time.sleep(0.5)
        bbox = page.evaluate("() => document.querySelector('#payd-hero-3d').getBoundingClientRect().toJSON()")
        print(f'After scrollBy: {bbox}')
    
    # Wait for full animation (10+ seconds)
    time.sleep(11)
    
    state = page.evaluate("""
        () => {
            const hero = window.__heroInst;
            return {
                isVisible: hero?.isVisible,
                labelVisible: hero?.labelGroup?.visible,
                candlesRevealed: hero?.candles?.filter(c => c.revealed).length,
                bloomStrength: hero?.bloomPass?.strength?.toFixed(2),
                baselineOpacity: hero?.baseline?.material?.opacity?.toFixed(2)
            };
        }
    """)
    print(f'State: {state}')
    
    # Final screenshot
    page.screenshot(
        path='/workspace/browser/screenshots/hero_v5_final.png',
        clip={'x': bbox['x'], 'y': bbox['y'], 'width': bbox['width'], 'height': bbox['height']}
    )
    print(f'Final screenshot saved, bbox: {bbox}')
    
    # Also full viewport for context
    page.screenshot(path='/workspace/browser/screenshots/hero_v5_context.png')
    
    browser.close()
    print('Done')
