"""Capture 5 element screenshots using VIEWPORT screenshot + PIL crop.

Why this approach: page.screenshot(clip=...) may not capture WebGL/Canvas
content reliably (we got mostly black on first attempt). A viewport
screenshot captures the full composited output, and cropping with PIL
preserves canvas content.
"""
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
        device_scale_factor=2,  # retina
    )
    page = context.new_page()

    print(f"Navigating to {URL} ...")
    page.goto(URL, wait_until="networkidle", timeout=60000)
    page.evaluate("window.scrollTo({top: 0, behavior: 'instant'})")
    page.wait_for_timeout(2500)  # let the chart / 3D animation begin

    hero = page.locator("#payd-hero-3d")
    hero.wait_for(state="visible", timeout=30000)
    box = hero.bounding_box()
    if not box:
        raise RuntimeError("Bounding box missing")
    print(f"Element bbox (CSS px): x={box['x']:.1f} y={box['y']:.1f} "
          f"w={box['width']:.1f} h={box['height']:.1f}")

    # Multiply by device_scale_factor for the actual screenshot pixel coords
    dsf = page.evaluate("() => window.devicePixelRatio")
    print(f"devicePixelRatio = {dsf}")

    # Viewport screenshot gives us the full composited page (canvas included)
    print("Capturing 5 viewport screenshots with 3s gaps, then cropping ...")
    for i in range(1, 6):
        full_path = os.path.join(OUT_DIR, f"_viewport_{i}.png")
        page.screenshot(path=full_path, animations="allow", timeout=20000)
        # Crop to element bounds (in actual screenshot pixels)
        img = Image.open(full_path)
        left = int(box["x"] * dsf)
        top = int(box["y"] * dsf)
        right = int((box["x"] + box["width"]) * dsf)
        bottom = int((box["y"] + box["height"]) * dsf)
        crop = img.crop((left, top, right, bottom))

        out_path = os.path.join(OUT_DIR, f"payd-hero-3d_{i}.png")
        crop.save(out_path, optimize=True)
        os.remove(full_path)

        # Verify the cropped image has variation (not all-black)
        gs = crop.convert("L")
        pixels = list(gs.getdata())
        avg = sum(pixels) / len(pixels)
        sample_unique = len(set(pixels[::max(1, len(pixels)//2000)]))
        print(f"  [{i}/5] {out_path} "
              f"size={os.path.getsize(out_path):,}  avg_bright={avg:.0f}  "
              f"shades_in_sample={sample_unique}")
        if i < 5:
            page.wait_for_timeout(3000)

    browser.close()
print("Done.")
