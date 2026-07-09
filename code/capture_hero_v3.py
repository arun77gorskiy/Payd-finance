"""Robust capture v3: forces scroll to top before every capture."""
from playwright.sync_api import sync_playwright
from PIL import Image
import os

URL = "https://kuaov26qgsfw.space.minimax.io"
OUT_DIR = "/workspace/screenshots/payd-hero"
os.makedirs(OUT_DIR, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={"width": 1440, "height": 900},
        device_scale_factor=2,
    )
    page = context.new_page()

    print(f"Navigating to {URL} ...")
    page.goto(URL, wait_until="networkidle", timeout=60000)

    # Disable smooth scroll & force scroll to top
    page.add_style_tag(content="""
        html { scroll-behavior: auto !important; }
        body { scroll-behavior: auto !important; }
    """)
    page.wait_for_timeout(1500)

    hero = page.locator("#payd-hero-3d")
    hero.wait_for(state="visible", timeout=30000)

    # Sanity check: where is the element now?
    rect0 = page.evaluate("""() => {
        const el = document.querySelector('#payd-hero-3d');
        const r = el.getBoundingClientRect();
        return {top: r.top, left: r.left, w: r.width, h: r.height,
                scrollY: window.scrollY, vh: window.innerHeight};
    }""")
    print(f"Initial rect (no scroll yet): {rect0}")

    # Force scroll
    page.evaluate("""() => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
    }""")
    page.wait_for_timeout(1500)

    rect1 = page.evaluate("""() => {
        const el = document.querySelector('#payd-hero-3d');
        const r = el.getBoundingClientRect();
        return {top: r.top, left: r.left, w: r.width, h: r.height,
                scrollY: window.scrollY};
    }""")
    print(f"After scroll: {rect1}")

    # If still off-screen, try scrollIntoView
    if rect1["top"] < 0 or rect1["top"] > 900:
        page.evaluate("""() => {
            const el = document.querySelector('#payd-hero-3d');
            el.scrollIntoView({block: 'start', behavior: 'instant'});
            window.scrollTo(0, 0);
        }""")
        page.wait_for_timeout(1500)
        rect2 = page.evaluate("""() => {
            const el = document.querySelector('#payd-hero-3d');
            const r = el.getBoundingClientRect();
            return {top: r.top, left: r.left, w: r.width, h: r.height,
                    scrollY: window.scrollY};
        }""")
        print(f"After scrollIntoView: {rect2}")

    # Use the current rect for cropping
    rect = page.evaluate("""() => {
        const el = document.querySelector('#payd-hero-3d');
        const r = el.getBoundingClientRect();
        return {top: r.top, left: r.left, w: r.width, h: r.height};
    }""")
    print(f"Final rect for cropping: {rect}")

    dsf = 2  # device_scale_factor
    print(f"device_scale_factor = {dsf}")

    print("Capturing 5 viewport screenshots with 3s gaps, then cropping ...")
    for i in range(1, 6):
        # Force scroll before each capture
        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(200)

        full_path = os.path.join(OUT_DIR, f"_viewport_{i}.png")
        page.screenshot(path=full_path, animations="allow", timeout=20000)
        img = Image.open(full_path)

        # Recompute rect right before crop (in case page scrolled)
        cur = page.evaluate("""() => {
            const el = document.querySelector('#payd-hero-3d');
            const r = el.getBoundingClientRect();
            return {top: r.top, left: r.left, w: r.width, h: r.height};
        }""")
        # If the element is in viewport, crop; otherwise fall back to top area
        if cur["top"] >= 0 and cur["top"] + cur["h"] <= 900:
            left = int(cur["left"] * dsf)
            top = int(cur["top"] * dsf)
            right = int((cur["left"] + cur["w"]) * dsf)
            bottom = int((cur["top"] + cur["h"]) * dsf)
        else:
            print(f"  ! element off-viewport (top={cur['top']:.0f}), using fallback top crop")
            left, top, right, bottom = 1490, 298, 2654, 1218

        crop = img.crop((left, top, right, bottom))
        out_path = os.path.join(OUT_DIR, f"payd-hero-3d_{i}.png")
        crop.save(out_path, optimize=True)
        os.remove(full_path)

        gs = crop.convert("L")
        pixels = list(gs.getdata())
        avg = sum(pixels) / len(pixels)
        sample_unique = len(set(pixels[::max(1, len(pixels)//2000)]))
        print(f"  [{i}/5] {out_path} "
              f"size={os.path.getsize(out_path):,}  avg_bright={avg:.0f}  "
              f"shades={sample_unique}  curTop={cur['top']:.0f}")
        if i < 5:
            page.wait_for_timeout(3000)

    browser.close()
print("Done.")
