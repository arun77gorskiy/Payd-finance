"""
Улучшенный скрипт для захвата 4 скриншотов элемента #payd-hero-3d
с правильной обработкой scrollIntoView и WebGL canvas.
"""
import asyncio
import json
import os
import time
import hashlib
from playwright.async_api import async_playwright

URL = "https://wxm4fuuqlj7f.space.minimax.io"
OUT = "/workspace/downloads/payd-screenshots"


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
                "--enable-features=Vulkan",
                "--disable-renderer-backgrounding",
                "--disable-background-timer-throttling",
                "--disable-backgrounding-occluded-windows",
                "--disable-features=TranslateUI",
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
        # Дополнительное ожидание для инициализации Three.js
        await page.wait_for_timeout(3000)

        # Прокручиваем на самый верх
        await page.evaluate("window.scrollTo(0, 0);")
        await page.wait_for_timeout(500)

        # Получаем абсолютные координаты через getBoundingClientRect после scrollTo(0,0)
        bbox_initial = await page.evaluate(
            """() => {
                const el = document.querySelector('#payd-hero-3d');
                const r = el.getBoundingClientRect();
                return {
                    x: r.x, y: r.y, width: r.width, height: r.height,
                    scrollY: window.scrollY,
                    docHeight: document.documentElement.scrollHeight,
                    winHeight: window.innerHeight
                };
            }"""
        )
        print(f"BBox after scrollTo(0,0): {json.dumps(bbox_initial)}")

        # Если hero находится не в viewport, делаем scrollIntoView
        target_y = bbox_initial["y"]
        if target_y < 0 or target_y + bbox_initial["height"] > bbox_initial["winHeight"]:
            print("Hero not in viewport, performing scrollIntoView...")
            await page.evaluate(
                """() => {
                    const el = document.querySelector('#payd-hero-3d');
                    el.scrollIntoView({block: 'center', behavior: 'instant'});
                }"""
            )
            await page.wait_for_timeout(1500)

            bbox_after = await page.evaluate(
                """() => {
                    const el = document.querySelector('#payd-hero-3d');
                    const r = el.getBoundingClientRect();
                    return {
                        x: r.x, y: r.y, width: r.width, height: r.height,
                        scrollY: window.scrollY
                    };
                }"""
            )
            print(f"BBox after scrollIntoView: {json.dumps(bbox_after)}")
            target_y = bbox_after["y"]
            target_x = bbox_after["x"]
            target_w = bbox_after["width"]
            target_h = bbox_after["height"]
        else:
            target_x = bbox_initial["x"]
            target_w = bbox_initial["width"]
            target_h = bbox_initial["height"]

        print(f"Final clip region: x={target_x}, y={target_y}, w={target_w}, h={target_h}")

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

        # Ждём запуска анимации
        anim_started = False
        for attempt in range(30):
            elapsed = await page.evaluate("window.__heroPremium?.elapsed || 0")
            if elapsed and elapsed > 1:
                anim_started = True
                print(f"Animation already running, elapsed={elapsed:.2f}s")
                break
            await page.wait_for_timeout(500)
        print(f"Animation started: {anim_started}")

        # Сохраняем информацию
        info_path = os.path.join(OUT, "element-info.json")
        with open(info_path, "w") as f:
            json.dump({
                "box": {
                    "x": target_x, "y": target_y,
                    "width": target_w, "height": target_h,
                },
                "eval_result": eval_result,
                "anim_started": anim_started,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }, f, indent=2)

        # 4 скриншота с интервалом 3-4 секунды
        intervals = [3.5, 3.0, 4.0, 3.5]
        screenshots = []

        for i, delay in enumerate(intervals):
            await page.wait_for_timeout(int(delay * 1000))

            # Получаем актуальный bbox
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
            print(f"[{i+1}/4] clip={json.dumps(cur_clip)}")

            # Форсируем рендер
            await page.evaluate(
                """() => {
                    const h = window.__heroPremium;
                    if (!h) return;
                    try {
                        if (h.composer) h.composer.render();
                    } catch(e) {}
                    try {
                        if (h.renderer && h.scene && h.camera) {
                            h.renderer.render(h.scene, h.camera);
                        }
                    } catch(e) {}
                    // Форсируем resize canvas
                    try {
                        if (h.resize) h.resize();
                    } catch(e) {}
                }"""
            )
            await page.wait_for_timeout(150)

            ts = int(time.time() * 1000)
            path = f"{OUT}/payd-hero-3d-frame-{i+1}-{ts}.png"
            await page.screenshot(path=path, clip=cur_clip)
            elapsed = await page.evaluate("window.__heroPremium?.elapsed || 0")
            size = os.path.getsize(path)
            print(f"  -> {path} elapsed={elapsed:.2f}s size={size}b")
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