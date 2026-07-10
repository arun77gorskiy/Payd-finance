"""Финальный быстрый скрипт: 4 скриншота с короткими интервалами + canvas.toDataURL."""
import asyncio, json, os, time, hashlib, base64
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
            args=["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader",
                  "--enable-webgl", "--ignore-gpu-blocklist",
                  "--disable-renderer-backgrounding",
                  "--disable-background-timer-throttling"],
        )
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()

        await page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_function(
            "() => window.__heroPremium && window.__heroPremium.renderer",
            timeout=30000)
        await page.wait_for_timeout(2000)

        # ScrollIntoView
        await page.evaluate(
            "document.querySelector('#payd-hero-3d').scrollIntoView({block:'center', behavior:'instant'})")
        await page.wait_for_timeout(500)

        bbox = await page.evaluate("""() => {
            const el = document.querySelector('#payd-hero-3d');
            const r = el.getBoundingClientRect();
            return {x: r.x, y: r.y, width: r.width, height: r.height};
        }""")
        print(f"BBox: {json.dumps(bbox)}")

        # JS evaluations
        ev = await page.evaluate("""() => {
            const hero = window.__heroPremium;
            if (!hero) return {hasHero: false};
            const barsLen = Array.isArray(hero.bars) ? hero.bars.length :
                            (hero.bars && typeof hero.bars.length === 'number' ? hero.bars.length : hero.bars);
            return {hasHero: true, barsLength: barsLen,
                    barsType: Array.isArray(hero.bars) ? 'array' : typeof hero.bars,
                    fontReady: hero.fontReady, fontReadyType: typeof hero.fontReady};
        }""")
        print("=" * 60)
        print("JS EVALUATION RESULTS:")
        print(json.dumps(ev, indent=2))
        print("=" * 60)

        clip = {
            "x": max(0, bbox["x"]),
            "y": max(0, bbox["y"]),
            "width": min(bbox["width"], 1440 - max(0, bbox["x"])),
            "height": min(bbox["height"], 900 - max(0, bbox["y"])),
        }
        print(f"Clip: {json.dumps(clip)}")

        with open(os.path.join(OUT, "element-info.json"), "w") as f:
            json.dump({"box": bbox, "clip": clip, "eval_result": ev,
                       "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())},
                      f, indent=2)

        # 4 скриншота с интервалом 3-4 секунды
        intervals = [3.5, 3.0, 4.0, 3.5]
        screenshots = []
        for i, delay in enumerate(intervals):
            await page.wait_for_timeout(int(delay * 1000))
            try:
                # Принудительный рендер
                await page.evaluate("""() => {
                    const h = window.__heroPremium;
                    if (!h) return;
                    try { if (h.composer) h.composer.render(); } catch(e) {}
                    try { if (h.renderer && h.scene && h.camera) h.renderer.render(h.scene, h.camera); } catch(e) {}
                }""")
                elapsed = await page.evaluate("window.__heroPremium?.elapsed || 0")
                ts = int(time.time() * 1000)
                path = f"{OUT}/payd-hero-3d-frame-{i+1}-{ts}.png"
                await page.screenshot(path=path, clip=clip)
                size = os.path.getsize(path)
                print(f"[{i+1}/4] elapsed={elapsed:.2f}s size={size}b -> {path}")
                screenshots.append(path)
            except Exception as e:
                print(f"[{i+1}/4] error: {e}")

        # Проверка уникальности
        hashes = {}
        for s in screenshots:
            with open(s, "rb") as f:
                hashes[s] = hashlib.md5(f.read()).hexdigest()
        print("Hashes:")
        for s, h in hashes.items():
            print(f"  {h} {s} ({os.path.getsize(s)}b)")
        print(f"Unique: {len(set(hashes.values()))}/{len(screenshots)}")
        await browser.close()
        print("Done.")


asyncio.run(main())