"""
Финальный v4: форсирует рендер между снимками путем
перезаписи elapsed и ручного composer.render() + renderer.render()
"""
import asyncio
import json
import os
import time
import hashlib
from playwright.async_api import async_playwright

URL = "https://wxm4fuuqlj7f.space.minimax.io"
OUT = "/workspace/downloads/payd-screenshots"


async def force_render_and_screenshot(page, clip, out_path):
    """Форсирует много рендеров и сохраняет скриншот."""
    # Множественные рендеры, чтобы убедиться что RAF сработает
    for _ in range(5):
        await page.evaluate(
            """() => {
                const h = window.__heroPremium;
                if (!h) return;
                try { if (h.composer) h.composer.render(); } catch(e) {}
                try {
                    if (h.renderer && h.scene && h.camera) {
                        h.renderer.render(h.scene, h.camera);
                    }
                } catch(e) {}
            }"""
        )
        await page.wait_for_timeout(50)

    # Дополнительный tick - ждём реального RAF
    await page.evaluate(
        """() => new Promise(resolve => requestAnimationFrame(() =>
            new Promise(resolve2 => requestAnimationFrame(resolve2))))"""
    )

    await page.screenshot(path=out_path, clip=clip)
    return os.path.getsize(out_path)


async def main():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.startswith("payd-hero-3d-frame-"):
            os.remove(os.path.join(OUT, f))

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--use-gl=angle",
                "--use-angle=swiftshader",
                "--enable-webgl",
                "--ignore-gpu-blocklist",
                "--disable-renderer-backgrounding",
                "--disable-background-timer-throttling",
                "--disable-backgrounding-occluded-windows",
            ],
        )
        context = await browser.new_context(
            viewport={"width": 1440, "height": 900},
            device_scale_factor=1,
        )
        page = await context.new_page()
        page.on("console", lambda msg: None)
        page.on("pageerror", lambda exc: None)

        print(f"Navigating to {URL} ...")
        await page.goto(URL, wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(3000)
        await page.evaluate("window.scrollTo(0, 0);")
        await page.wait_for_timeout(500)

        bbox = await page.evaluate(
            """() => {
                const el = document.querySelector('#payd-hero-3d');
                const r = el.getBoundingClientRect();
                return {x: r.x, y: r.y, width: r.width, height: r.height,
                        scrollY: window.scrollY};
            }"""
        )
        print(f"BBox: {json.dumps(bbox)}")

        # Если не в viewport - scrollIntoView
        if bbox["y"] < 0 or bbox["y"] + bbox["height"] > 900:
            await page.evaluate(
                "document.querySelector('#payd-hero-3d').scrollIntoView({block:'center', behavior:'instant'})"
            )
            await page.wait_for_timeout(1500)
            bbox = await page.evaluate(
                """() => {
                    const el = document.querySelector('#payd-hero-3d');
                    const r = el.getBoundingClientRect();
                    return {x: r.x, y: r.y, width: r.width, height: r.height};
                }"""
            )
            print(f"BBox after scroll: {json.dumps(bbox)}")

        # JS evaluations
        eval_result = await page.evaluate(
            """() => {
                const hero = window.__heroPremium;
                if (!hero) return {hasHero: false};
                let barsLen = null, barsType = null;
                try {
                    if (Array.isArray(hero.bars)) { barsLen = hero.bars.length; barsType = 'array'; }
                    else if (hero.bars && typeof hero.bars.length === 'number') { barsLen = hero.bars.length; barsType = 'lengthy'; }
                    else { barsLen = hero.bars; barsType = typeof hero.bars; }
                } catch(e) { barsLen = String(e); }
                let fontReady = null, fontReadyType = null;
                try { fontReady = hero.fontReady; fontReadyType = typeof hero.fontReady; }
                catch(e) { fontReady = String(e); }
                return {
                    hasHero: true,
                    barsLength: barsLen, barsType: barsType,
                    fontReady: fontReady, fontReadyType: fontReadyType
                };
            }"""
        )
        print("=" * 60)
        print("JS EVALUATION RESULTS:")
        print(json.dumps(eval_result, indent=2))
        print("=" * 60)

        clip = {
            "x": max(0, bbox["x"]),
            "y": max(0, bbox["y"]),
            "width": min(bbox["width"], 1440 - max(0, bbox["x"])),
            "height": min(bbox["height"], 900 - max(0, bbox["y"])),
        }
        print(f"Clip: {json.dumps(clip)}")

        # Сохраняем информацию
        info_path = os.path.join(OUT, "element-info.json")
        with open(info_path, "w") as f:
            json.dump({
                "box": bbox,
                "clip": clip,
                "eval_result": eval_result,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }, f, indent=2)

        # Получаем начальный elapsed
        start_elapsed = await page.evaluate("window.__heroPremium?.elapsed || 0")
        print(f"Initial elapsed: {start_elapsed:.2f}s")

        # 4 скриншота - на разных elapsed
        intervals = [3.5, 3.0, 4.0, 3.5]
        screenshots = []

        for i, delay in enumerate(intervals):
            # Ждём указанный интервал
            await page.wait_for_timeout(int(delay * 1000))

            # Получаем bbox
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
                "width": min(bbox_now["w"], 1440 - max(0, bbox_now["x"])),
                "height": min(bbox_now["h"], 900 - max(0, bbox_now["y"])),
            }

            # Записываем реальный elapsed
            real_elapsed = await page.evaluate("window.__heroPremium?.elapsed || 0")
            print(f"[{i+1}/4] real_elapsed={real_elapsed:.2f}s clip={json.dumps(cur_clip)}")

            ts = int(time.time() * 1000)
            path = f"{OUT}/payd-hero-3d-frame-{i+1}-{ts}.png"
            size = await force_render_and_screenshot(page, cur_clip, path)
            print(f"  -> {path} size={size}b")
            screenshots.append(path)

        print("=" * 60)
        print("All screenshots:")
        hashes = {}
        for s in screenshots:
            with open(s, "rb") as f:
                h = hashlib.md5(f.read()).hexdigest()
            hashes[s] = h
            print(f"  {h}  {s}  ({os.path.getsize(s)} bytes)")

        unique_hashes = len(set(hashes.values()))
        print(f"Unique hashes: {unique_hashes}/{len(screenshots)}")

        await browser.close()
        print("Done.")


asyncio.run(main())