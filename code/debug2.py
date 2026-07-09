"""Debug version 2: print positions and try screenshot."""
from playwright.sync_api import sync_playwright

URL = "https://kuaov26qgsfw.space.minimax.io"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={"width": 1440, "height": 900},
        device_scale_factor=1,  # no retina to avoid coordinate mismatches
    )
    page = context.new_page()

    page.goto(URL, wait_until="networkidle", timeout=60000)
    page.wait_for_timeout(3000)

    # Force scroll to absolute top
    page.evaluate("window.scrollTo({top: 0, behavior: 'instant'})")
    page.wait_for_timeout(1000)

    # Get scroll height and viewport info
    info = page.evaluate("""
        () => ({
            scrollY: window.scrollY,
            scrollHeight: document.body.scrollHeight,
            innerHeight: window.innerHeight,
            innerWidth: window.innerWidth,
        })
    """)
    print("Page info:", info)

    # Get element rect via JS
    rect = page.evaluate("""
        () => {
            const el = document.querySelector('#payd-hero-3d');
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const s = getComputedStyle(el);
            return {
                top: r.top, left: r.left, w: r.width, h: r.height,
                bottom: r.bottom, right: r.right,
                position: s.position, display: s.display, visibility: s.visibility,
                opacity: s.opacity, zIndex: s.zIndex, transform: s.transform,
            };
        }
    """)
    print("Element rect:", rect)

    # Try clip screenshot with dsf=1
    box = rect
    clip = {
        "x": int(box["left"]),
        "y": int(box["top"]),
        "width": int(box["w"]),
        "height": int(box["h"]),
    }
    print("Clip:", clip)

    page.screenshot(path="/workspace/screenshots/payd-hero/test1.png", clip=clip)
    print("Test screenshot saved")

    browser.close()
