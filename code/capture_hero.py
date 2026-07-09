"""Capture 5 element screenshots of #payd-hero-3d at 3-second intervals."""
from playwright.sync_api import sync_playwright
import os

URL = "https://kuaov26qgsfw.space.minimax.io"
OUT_DIR = "/workspace/screenshots/payd-hero"
os.makedirs(OUT_DIR, exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(
        viewport={"width": 1440, "height": 900},
        device_scale_factor=2,  # retina-quality
    )
    page = context.new_page()

    print(f"Navigating to {URL} ...")
    page.goto(URL, wait_until="networkidle", timeout=60000)

    # Force scroll to absolute top so element sits in its natural spot
    page.evaluate("window.scrollTo({top: 0, behavior: 'instant'})")
    page.wait_for_timeout(2000)  # let 3D / canvas start animating

    # Verify the element and grab its bounding box
    hero = page.locator("#payd-hero-3d")
    hero.wait_for(state="visible", timeout=30000)
    box = hero.bounding_box()
    if not box or box["width"] <= 0 or box["height"] <= 0:
        raise RuntimeError(f"Invalid bounding box: {box}")
    print(f"Element bbox @ dsf=2: x={box['x']:.1f} y={box['y']:.1f} "
          f"w={box['width']:.1f} h={box['height']:.1f}")

    # page.screenshot clip uses CSS pixels (independent of dsf), so this works
    clip = {
        "x": box["x"],
        "y": box["y"],
        "width": box["width"],
        "height": box["height"],
    }

    # To capture different animation frames, we use page.screenshot with
    # `animations="allow"` (live animation state at click time) and a 3-second
    # gap between captures.
    print("Capturing 5 element screenshots with 3-second gaps ...")
    for i in range(1, 6):
        path = os.path.join(OUT_DIR, f"payd-hero-3d_{i}.png")
        page.screenshot(
            path=path,
            clip=clip,
            animations="allow",   # let canvas / CSS animation run
            timeout=20000,
        )
        size = os.path.getsize(path)
        print(f"  [{i}/5] {path}  ({size:,} bytes)")
        if i < 5:
            page.wait_for_timeout(3000)

    # Bonus: a viewport shot at the moment of last capture (for context)
    page.screenshot(path=os.path.join(OUT_DIR, "viewport_context.png"))
    print(f"\nViewport context saved.")

    # Cleanup intermediate debug screenshots
    for stale in ["test1.png", "initial-view.png", "check-top.png"]:
        fp = os.path.join(OUT_DIR, stale)
        if os.path.exists(fp):
            os.remove(fp)

    browser.close()
    print("\nDone.")
