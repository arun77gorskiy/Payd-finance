"""Debug the #payd-hero-3d element position."""
from playwright.sync_api import sync_playwright

URL = "https://kuaov26qgsfw.space.minimax.io"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={"width": 1440, "height": 900},
        device_scale_factor=1,
    )
    page = context.new_page()

    page.goto(URL, wait_until="networkidle", timeout=60000)
    page.wait_for_timeout(3000)

    # Count occurrences
    count = page.locator("#payd-hero-3d").count()
    print(f"#payd-hero-3d count: {count}")

    # Scroll to absolute top first
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(1000)

    # Get all bounding boxes
    for i in range(count):
        loc = page.locator("#payd-hero-3d").nth(i)
        box = loc.bounding_box()
        is_visible = loc.is_visible()
        tag = loc.evaluate("el => el.tagName")
        cls = loc.evaluate("el => el.className")
        text_preview = loc.evaluate("el => (el.innerText || '').substring(0, 100)")
        print(f"\n[{i}] tag={tag} visible={is_visible} box={box}")
        print(f"    class={cls!r}")
        print(f"    text={text_preview!r}")

    # scroll down step by step and see which one becomes visible
    info = page.evaluate("""
        () => {
            const els = document.querySelectorAll('#payd-hero-3d');
            return Array.from(els).map((el, i) => {
                const r = el.getBoundingClientRect();
                return {
                    i,
                    top: r.top, bottom: r.bottom, h: r.height, w: r.width,
                    text: (el.innerText || '').substring(0, 80),
                };
            });
        }
    """)
    print("\nAt scrollY=0, getBoundingClientRect:")
    for x in info:
        print(x)

    browser.close()
