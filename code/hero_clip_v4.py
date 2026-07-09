from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, java_script_enabled=True)
    page = ctx.new_page()
    
    # Listen for console
    page.on("console", lambda msg: print(f"[{msg.type}] {msg.text}") if "HeroInst" in msg.text else None)
    
    page.goto("https://v22muh25h3wv.space.minimax.io", wait_until="domcontentloaded")
    time.sleep(3)
    
    # Check what hero is
    info = page.evaluate("""
        () => {
            const el = document.querySelector('#payd-hero-3d');
            const hero = window.__heroInst;
            return {
                heroExists: !!el,
                heroBbox: el ? el.getBoundingClientRect().toJSON() : null,
                heroState: hero ? 'exists' : 'NULL',
                heroKeys: hero ? Object.keys(hero).slice(0, 20) : null,
                heroIsVisible: hero?.isVisible,
                documentHeight: document.documentElement.scrollHeight,
                windowHeight: window.innerHeight,
                scrollY: window.scrollY
            };
        }
    """)
    print(f'Initial: {info}')
    
    # Try multiple scroll methods
    page.evaluate("window.scrollTo(0, 0)")
    time.sleep(0.5)
    page.evaluate("document.documentElement.style.scrollBehavior = 'auto'")
    page.evaluate("document.body.style.scrollBehavior = 'auto'")
    
    # Use force scroll
    for y in [500, 1000, 1500, 2000, 2500, 3000, 3500, 3691, 3800, 4000]:
        page.evaluate(f"window.scrollTo(0, {y})")
        time.sleep(0.3)
        y_check = page.evaluate("() => window.scrollY")
        if y_check == y:
            print(f'Scroll to {y} OK')
        else:
            print(f'Scroll to {y} BLOCKED, actual: {y_check}')
    
    # Final state
    final = page.evaluate("""
        () => {
            const el = document.querySelector('#payd-hero-3d');
            const hero = window.__heroInst;
            return {
                bbox: el?.getBoundingClientRect().toJSON(),
                isVisible: hero?.isVisible,
                scrollY: window.scrollY
            };
        }
    """)
    print(f'Final: {final}')
    
    # Now wait for animation
    time.sleep(12)
    
    state = page.evaluate("""
        () => {
            const hero = window.__heroInst;
            return {
                isVisible: hero?.isVisible,
                candlesRevealed: hero?.candles?.filter(c => c.revealed).length,
                labelVisible: hero?.labelGroup?.visible,
                cameraZ: hero?.camera?.position?.z?.toFixed(2),
                bloomStrength: hero?.bloomPass?.strength?.toFixed(2)
            };
        }
    """)
    print(f'After wait: {state}')
    
    # Take screenshot
    bbox = page.evaluate("() => document.querySelector('#payd-hero-3d').getBoundingClientRect().toJSON()")
    print(f'Screenshot bbox: {bbox}')
    if bbox['y'] >= 0:
        page.screenshot(
            path='/workspace/browser/screenshots/hero_v4.png',
            clip={'x': bbox['x'], 'y': bbox['y'], 'width': bbox['width'], 'height': bbox['height']}
        )
        print('Screenshot saved')
    
    browser.close()
