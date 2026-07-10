"""
Финальный скрипт для захвата 4 скриншотов элемента #payd-hero-3d
с разными фазами анимации.
"""
import asyncio
import json
import os
import time
from playwright.async_api import async_playwright

URL = "https://wxm4fuuqlj7f.space.minimax.io"
OUT = "/workspace/downloads/payd-screenshots"


async def main():
    os.makedirs(OUT, exist_ok=True)
    # Очищаем старые скриншоты
    for f in os.listdir(OUT):
        if f.startswith("payd-hero-3d-frame-"):
            os.remove(os.path.join(OUT, f))

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
        await page.wait_for_timeout(2000)

        # Скроллим к hero
        await page.evaluate(
            "document.querySelector('#payd-hero-3d')?.scrollIntoView({block:'center'})"
        )
        await page.wait_for_timeout(1000)

        # Получаем bounding box
        bbox = await page.evaluate(
            """() => {
                const el = document.querySelector('#payd-hero-3d');
                const r = el.getBoundingClientRect();
                return {x: r.x, y: r.y, width: r.width, height: r.height};
            }"""
        )
        print(f"BBox: {json.dumps(bbox)}")

        # Выполняем обязательные JS evaluations
        eval_result = await page.evaluate(
            """() => {
                const hero = window.__heroPremium;
                if (!hero) return {hasHero: false};
                let barsLen = null, barsType = null;
                try {
                    if (Array.isArray(hero.bars)) {
                        barsLen = hero.bars.length;
                        barsType = 'array';
                    } else if (hero.bars && typeof hero.bars.length === 'number') {
                        barsLen = hero.bars.length;
                        barsType = 'lengthy';
                    } else {
                        barsLen = hero.bars;
                        barsType = typeof hero.bars;
                    }
                } catch(e) { barsLen = String(e); }
                let fontReady = null, fontReadyType = null;
                try {
                    fontReady = hero.fontReady;
                    fontReadyType = typeof hero.fontReady;
                } catch(e) { fontReady = String(e); }
                return {
                    hasHero: true,
                    barsLength: barsLen,
                    barsType: barsType,
                    fontReady: fontReady,
                    fontReadyType: fontReadyType
                };
            }"""
        )
        print("=" * 60)
        print("JS EVALUATION RESULTS:")
        print(json.dumps(eval_result, indent=2))
        print("=" * 60)

        # Ждём, пока анимация стартует (elapsed > 0)
        anim_started = False
        for attempt in range(20):
            elapsed = await page.evaluate(
                "window.__heroPremium?.elapsed || 0"
            )
            print(f"[wait] attempt={attempt} elapsed={elapsed}")
            if elapsed and elapsed > 0.5:
                anim_started = True
                break
            await page.wait_for_timeout(500)

        print(f"Animation started: {anim_started}")

        # Сохраняем информацию об элементе
        info_path = os.path.join(OUT, "element-info.json")
        with open(info_path, "w") as f:
            json.dump({
                "box": bbox,
                "eval_result": eval_result,
                "anim_started": anim_started,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }, f, indent=2)

        # Делаем 4 скриншота с интервалом 3-4 секунды
        intervals = [3.5, 3.0, 4.0, 3.5]
        screenshots = []
        clip = {
            "x": max(0, bbox["x"]),
            "y": max(0, bbox["y"]),
            "width": min(bbox["width"], 1440),
            "height": min(bbox["height"], 900),
        }
        print(f"Clip: {json.dumps(clip)}")

        for i, delay in enumerate(intervals):
            await page.evaluate("window.scrollTo(0, 0);")
            await page.wait_for_timeout(int(delay * 1000))

            # Получаем bbox на текущий момент
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

            # Форсируем рендер перед скриншотом
            await page.evaluate(
                """() => {
                    const h = window.__heroPremium;
                    if (!h) return;
                    try { if (h.composer) h.composer.render(); } catch(e) {}
                    try { if (h.renderer && h.scene && h.camera) h.renderer.render(h.scene, h.camera); } catch(e) {}
                }"""
            )
            await page.wait_for_timeout(100)

            ts = int(time.time() * 1000)
            path = f"{OUT}/payd-hero-3d-frame-{i+1}-{ts}.png"
            await page.screenshot(path=path, clip=cur_clip)
            elapsed = await page.evaluate("window.__heroPremium?.elapsed || 0")
            print(f"[{i+1}/4] {path} elapsed={elapsed:.2f}s size={os.path.getsize(path)}b")
            screenshots.append(path)

        print("=" * 60)
        print("All screenshots:")
        for s in screenshots:
            print(f"  {s} ({os.path.getsize(s)} bytes)")

        # Проверяем, что все файлы разные
        import hashlib
        hashes = {}
        for s in screenshots:
            with open(s, "rb") as f:
                h = hashlib.md5(f.read()).hexdigest()
            hashes[s] = h
        print("Hashes:")
        for s, h in hashes.items():
            print(f"  {h}  {s}")
        unique_hashes = len(set(hashes.values()))
        print(f"Unique hashes: {unique_hashes}/{len(screenshots)}")

        await browser.close()
        print("Done.")


asyncio.run(main())