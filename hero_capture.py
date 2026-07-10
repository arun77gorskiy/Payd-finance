import asyncio
import json
import os
from playwright.async_api import async_playwright

URL = "https://wxm4fuuqlj7f.space.minimax.io"
OUT = "/workspace/browser/screenshots"


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--use-gl=swiftshader",
                "--enable-webgl",
                "--disable-renderer-backgrounding",
                "--disable-background-timer-throttling",
            ],
        )
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()
        page.on("console", lambda msg: None)
        page.on("pageerror", lambda exc: None)

        print(f"Navigating to {URL} ...")
        await page.goto(URL, wait_until="networkidle", timeout=60000)
        # Capture bbox immediately while page is still at top
        await page.wait_for_timeout(800)

        # Make sure we are at top and hero is in view
        await page.evaluate("window.scrollTo(0, 0); document.querySelector('#payd-hero-3d')?.scrollIntoView({block:'start'});")
        await page.wait_for_timeout(300)
        await page.evaluate("window.scrollTo(0, 0);")

        bbox = await page.evaluate(
            """() => {
                const el = document.querySelector('#payd-hero-3d');
                const r = el.getBoundingClientRect();
                return {x: r.x, y: r.y, width: r.width, height: r.height};
            }"""
        )
        print("BBox:", json.dumps(bbox))
        if bbox["y"] < 0 or bbox["y"] + bbox["height"] > 900:
            print("Hero not in viewport, scrolling into view")
            await page.evaluate("document.querySelector('#payd-hero-3d').scrollIntoView({block:'center'})")
            await page.wait_for_timeout(400)
            bbox = await page.evaluate(
                """() => {
                    const el = document.querySelector('#payd-hero-3d');
                    const r = el.getBoundingClientRect();
                    return {x: r.x, y: r.y, width: r.width, height: r.height};
                }"""
            )
            print("BBox (after scroll):", json.dumps(bbox))

        # Required JS evaluations
        eval_result = await page.evaluate(
            """() => {
                const hero = window.__heroPremium;
                if (!hero) return {hasHero: false};
                let barsLen = null, barsType = null;
                try {
                    if (Array.isArray(hero.bars)) { barsLen = hero.bars.length; barsType = 'array'; }
                    else if (hero.bars && typeof hero.bars.length === 'number') {
                        barsLen = hero.bars.length; barsType = 'lengthy';
                    } else { barsLen = hero.bars; barsType = typeof hero.bars; }
                } catch(e) { barsLen = String(e); }
                let fontReady = null, fontReadyType = null;
                try { fontReady = hero.fontReady; fontReadyType = typeof hero.fontReady; }
                catch(e) { fontReady = String(e); }
                return {hasHero: true, barsLength: barsLen, barsType, fontReady, fontReadyType};
            }"""
        )
        print("Eval result:")
        print(json.dumps(eval_result, indent=2))

        os.makedirs(OUT, exist_ok=True)

        clip = {
            "x": max(0, bbox["x"]),
            "y": max(0, bbox["y"]),
            "width": min(bbox["width"], 1440),
            "height": min(bbox["height"], 900),
        }
        print("Clip:", json.dumps(clip))

        intervals = [3.5, 3.0, 4.0, 3.5]
        for i, delay in enumerate(intervals):
            # Block any auto-scroll attempts and wait the interval
            await page.evaluate("window.scrollTo(0, 0);")
            await page.wait_for_timeout(int(delay * 1000))
            # Make sure hero is still in view
            bbox_now = await page.evaluate(
                """() => {
                    const el = document.querySelector('#payd-hero-3d');
                    const r = el.getBoundingClientRect();
                    return {x: r.x, y: r.y, w: r.width, h: r.height};
                }"""
            )
            cur_clip = {
                "x": max(0, bbox_now["x"]),
                "y": max(0, bbox_now["y"]),
                "width": min(bbox_now["w"], 1440),
                "height": min(bbox_now["h"], 900),
            }
            # Trigger an explicit render right before screenshot
            await page.evaluate("""() => {
                const h = window.__heroPremium;
                if (!h) return;
                if (h.composer) { try { h.composer.render(); } catch(e) {} }
                else if (h.renderer && h.scene && h.camera) { try { h.renderer.render(h.scene, h.camera); } catch(e) {} }
            }""")
            await page.wait_for_timeout(50)
            idx = i + 1
            path = f"{OUT}/payd-hero-3d_{idx}.png"
            await page.screenshot(path=path, clip=cur_clip)
            print(f"Captured {path} (elapsed={await page.evaluate('window.__heroPremium?.elapsed?.toFixed(2)')})")

        await browser.close()
        print("Done.")


asyncio.run(main())
