"""
Диагностический скрипт для анализа __heroPremium структуры.
"""
import asyncio
import json
from playwright.async_api import async_playwright

URL = "https://wxm4fuuqlj7f.space.minimax.io"


async def main():
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
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()
        page.on("console", lambda msg: None)
        page.on("pageerror", lambda exc: None)

        await page.goto(URL, wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(3000)

        # Проверяем структуру __heroPremium
        info = await page.evaluate(
            """() => {
                const h = window.__heroPremium;
                if (!h) return {hasHero: false};
                const keys = Object.keys(h);
                const result = {
                    hasHero: true,
                    keys: keys,
                    elapsed: h.elapsed,
                    barsLength: h.bars ? (Array.isArray(h.bars) ? h.bars.length : null) : null,
                    fontReady: h.fontReady,
                    hasScene: !!h.scene,
                    hasRenderer: !!h.renderer,
                    hasComposer: !!h.composer,
                    hasCamera: !!h.camera,
                    hasCanvas: !!h.canvas,
                    rafId: h.rafId,
                    paused: h.paused,
                    isPlaying: h.isPlaying,
                    time: h.time,
                    frame: h.frame,
                    visible: h.visible,
                    running: h.running,
                    active: h.active,
                    enabled: h.enabled,
                };
                return result;
            }"""
        )
        print("Hero inspection:")
        print(json.dumps(info, indent=2))

        # Проверяем canvas
        canvas_info = await page.evaluate(
            """() => {
                const c = document.querySelector('#payd-hero-3d canvas');
                if (!c) return {hasCanvas: false};
                return {
                    hasCanvas: true,
                    width: c.width,
                    height: c.height,
                    clientWidth: c.clientWidth,
                    clientHeight: c.clientHeight,
                    contextType: c.getContext('webgl') ? 'webgl' :
                                c.getContext('webgl2') ? 'webgl2' : 'none',
                };
            }"""
        )
        print("\nCanvas info:")
        print(json.dumps(canvas_info, indent=2))

        # Проверяем elapsed через 5 секунд
        for i in range(6):
            elapsed = await page.evaluate("window.__heroPremium?.elapsed || 0")
            print(f"[{i}s] elapsed={elapsed}")
            await page.wait_for_timeout(1000)

        await browser.close()


asyncio.run(main())