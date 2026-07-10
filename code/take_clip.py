"""
Take a bounding box clip screenshot of #payd-hero-3d with exact coords.
Also takes a full page screenshot for reference.
"""
import asyncio
from playwright.async_api import async_playwright

URL = "https://wxm4fuuqlj7f.space.minimax.io/"
CLIP_X = 745
CLIP_Y = 129
CLIP_W = 582
CLIP_H = 460

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # Set viewport wider than the clip requirement (745+582=1327)
        context = await browser.new_context(viewport={"width": 1400, "height": 800})
        page = await context.new_page()
        await page.goto(URL, wait_until="networkidle")
        # Wait for animation cycles (15s)
        await page.wait_for_timeout(15000)
        # Execute window.scrollTo(0, 0)
        await page.evaluate("window.scrollTo(0, 0)")
        # Wait 2 more seconds
        await page.wait_for_timeout(2000)

        # Verify element exists
        elem = await page.query_selector("#payd-hero-3d")
        if elem:
            box = await elem.bounding_box()
            print(f"#payd-hero-3d actual bounding box: {box}")
        else:
            print("#payd-hero-3d NOT FOUND")

        # Take bounding box clip screenshot
        await page.screenshot(
            path="/workspace/imgs/payd-hero-3d-clip.png",
            clip={"x": CLIP_X, "y": CLIP_Y, "width": CLIP_W, "height": CLIP_H}
        )
        print(f"Saved clip: x={CLIP_X}, y={CLIP_Y}, w={CLIP_W}, h={CLIP_H}")

        # Take full page screenshot too
        await page.screenshot(
            path="/workspace/imgs/full-page-playwright.png",
            full_page=True
        )
        print("Saved full page")

        # Capture console errors
        print("Done")
        await browser.close()

asyncio.run(main())
