from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    
    page.on("console", lambda msg: print(f"[{msg.type}] {msg.text[:200]}"))
    
    page.goto("https://v22muh25h3wv.space.minimax.io", wait_until="domcontentloaded")
    time.sleep(5)
    
    info = page.evaluate("""
        () => {
            return {
                hasHero: !!window.__heroInst,
                heroKeys: window.__heroInst ? Object.keys(window.__heroInst).slice(0, 10) : null,
                scriptTags: Array.from(document.querySelectorAll('script[type="module"]')).map(s => s.src),
                errors: window.__labLogs?.filter(l => l.level === 'error').slice(0, 10) || []
            };
        }
    """)
    print(f'Info: {info}')
    
    browser.close()
