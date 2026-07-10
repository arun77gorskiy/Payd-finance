import asyncio
import json
from playwright.async_api import async_playwright

URL = "https://wxm4fuuqlj7f.space.minimax.io"


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox", "--use-gl=swiftshader", "--enable-webgl",
                "--disable-renderer-backgrounding", "--disable-background-timer-throttling",
            ],
        )
        ctx = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await ctx.new_page()
        await page.goto(URL, wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(2000)

        async def snap(label):
            return await page.evaluate(f"""() => {{
                const el = document.querySelector('#payd-hero-3d');
                const r = el ? el.getBoundingClientRect() : null;
                const h = window.__heroPremium;
                return {{
                    label: '{label}',
                    bbox: r ? {{x: r.x, y: r.y, w: r.width, h: r.height}} : null,
                    elapsed: h?.elapsed,
                    scroll: {{x: window.scrollX, y: window.scrollY}},
                    docH: document.documentElement.scrollHeight,
                }};
            }}""")

        print("T0:", json.dumps(await snap('t0'), indent=2))
        await page.wait_for_timeout(1500)
        print("T1:", json.dumps(await snap('t1'), indent=2))
        # Try scrolling hero into view
        await page.evaluate("document.querySelector('#payd-hero-3d')?.scrollIntoView({block:'center'})")
        await page.wait_for_timeout(1000)
        print("T2 (after scroll):", json.dumps(await snap('t2'), indent=2))

        # Now do screenshots at viewport, capturing what's actually at hero position
        # Hero bbox should be visible
        bbox = await page.evaluate(
            """() => {
                const el = document.querySelector('#payd-hero-3d');
                const r = el.getBoundingClientRect();
                return {x: r.x, y: r.y, width: r.width, height: r.height};
            }"""
        )
        print("BBox (in viewport):", json.dumps(bbox))
        clip = {
            "x": max(0, bbox["x"]),
            "y": max(0, bbox["y"]),
            "width": bbox["width"],
            "height": bbox["height"],
        }
        # Test 4 captures
        for i in range(4):
            await page.wait_for_timeout(3500)
            await page.screenshot(path=f"/workspace/browser/screenshots/dbg_{i+1}.png", clip=clip)

        await browser.close()


asyncio.run(main())
