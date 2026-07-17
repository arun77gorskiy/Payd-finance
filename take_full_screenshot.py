import asyncio
import json
from playwright.sync_api import sync_playwright

def take_full_screenshot():
    url = "https://z9pkc33iymx7.space.minimax.io/intelligence-v2.html"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-setuid-sandbox'])
        context = browser.new_context(viewport={'width': 1920, 'height': 1080})
        page = context.new_page()

        print(f"[*] Navigated to {url}")
        page.goto(url, wait_until='networkidle')
        print("[*] Waiting 5 seconds for full initialization...")
        page.wait_for_timeout(5000)

        # Wait until renderedCards = 339
        print("[*] Waiting for all 339 project cards to render...")
        try:
            page.wait_for_function(
                "document.querySelectorAll('.payd-v2-project-card').length >= 339",
                timeout=30000
            )
            print("[*] All 339 cards are rendered!")
        except Exception as e:
            current_count = page.evaluate("document.querySelectorAll('.payd-v2-project-card').length")
            print(f"[!] Timeout waiting for 339 cards. Current count: {current_count}")
            print(f"[!] Error: {e}")

        # Get scroll height
        scroll_height = page.evaluate("document.body.scrollHeight")
        viewport_height = page.evaluate("window.innerHeight")
        print(f"[*] Page scrollHeight: {scroll_height}px, viewport: {viewport_height}px")

        # Scroll down incrementally to ensure all lazy-loaded content loads
        print("[*] Scrolling incrementally to load all content...")
        scroll_position = 0
        scroll_step = 800
        while scroll_position < scroll_height:
            page.evaluate(f"window.scrollTo(0, {scroll_position})")
            page.wait_for_timeout(200)
            scroll_position += scroll_step
            new_scroll_height = page.evaluate("document.body.scrollHeight")
            if new_scroll_height > scroll_height:
                scroll_height = new_scroll_height
                print(f"[*] Page extended to: {scroll_height}px")

        # Scroll back to top before full page screenshot
        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(1000)

        # Take full-page screenshot
        screenshot_path = "/workspace/intelligence-v2-fullpage.png"
        print(f"[*] Taking full-page screenshot...")
        page.screenshot(path=screenshot_path, full_page=True)
        print(f"[✓] Full-page screenshot saved: {screenshot_path}")

        # Get final stats
        final_stats = page.evaluate("""
        ({
            totalCards: document.querySelectorAll('.payd-v2-project-card').length,
            totalSectors: document.querySelectorAll('.payd-v2-sector-card').length,
            totalHeight: document.body.scrollHeight,
            viewportHeight: window.innerHeight
        })
        """)
        print(f"\n[*] Final stats:")
        print(json.dumps(final_stats, indent=2))

        browser.close()
        return screenshot_path, final_stats

if __name__ == "__main__":
    path, stats = take_full_screenshot()
    print(f"\n✅ Done! Screenshot: {path}")
