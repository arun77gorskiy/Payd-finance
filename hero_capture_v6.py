"""Финальный v6: захват через canvas.toDataURL() + force_render.
Обходит проблемы с GPU процессом в headless."""
import asyncio, json, os, time, hashlib, base64
from playwright.async_api import async_playwright

URL = "https://wxm4fuuqlj7f.space.minimax.io"
OUT = "/workspace/downloads/payd-screenshots"


async def get_canvas_png(page):
    """Форсирует рендер и возвращает PNG canvas как base64."""
    try:
        return await page.evaluate("""() => {
            const h = window.__heroPremium;
            if (!h) return null;
            // Принудительный рендер
            try { if (h.composer) h.composer.render(); } catch(e) {}
            try { if (h.renderer && h.scene && h.camera) h.renderer.render(h.scene, h.camera); } catch(e) {}
            // Берём canvas
            let canvas = h.renderer?.domElement;
            if (!canvas) {
                canvas = document.querySelector('#payd-hero-3d canvas');
            }
            if (!canvas) return null;
            return canvas.toDataURL('image/png');
        }""")
    except Exception as e:
        print(f"  [get_canvas_png error] {e}")
        return None


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
        await page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_function(
            "() => window.__heroPremium && window.__heroPremium.scene && window.__heroPremium.renderer",
            timeout=30000
        )
        await page.wait_for_timeout(2500)
        await page.evaluate("window.scrollTo(0, 0);")
        await page.wait_for_timeout(500)

        bbox = await page.evaluate("""() => {
            const el = document.querySelector('#payd-hero-3d');
            const r = el.getBoundingClientRect();
            return {x: r.x, y: r.y, width: r.width, height: r.height, scrollY: window.scrollY};
        }""")
        print(f"BBox: {json.dumps(bbox)}")

        if bbox["y"] < 0 or bbox["y"] +