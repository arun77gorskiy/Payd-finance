import asyncio
import json
from playwright.async_api import async_playwright

URL = "https://wxm4fuuqlj7f.space.minimax.io"

DIAG_JS = """async () => {
    const h = window.__heroPremium;
    if (!h) return {err: 'no hero'};
    const initial = {
        rafId: h.rafId, elapsed: h.elapsed,
        startTime: h.startTime, lastTime: h.lastTime,
        isVisible: h.isVisible, isAutomated: h.isAutomated,
        isLowEnd: h.isLowEnd, barsCount: h.bars ? h.bars.length : 0,
        webglCtx: (() => {
            const c = document.querySelector('#payd-hero-3d canvas');
            if (!c) return null;
            const gl = c.getContext('webgl2') || c.getContext('webgl');
            if (!gl) return null;
            return {
                lost: gl.isContextLost(),
                vendor: gl.getParameter(gl.VENDOR),
                renderer: gl.getParameter(gl.RENDERER),
                version: gl.getParameter(gl.VERSION),
            };
        })(),
    };
    await new Promise(r => setTimeout(r, 1500));
    const after = {
        rafId: h.rafId, elapsed: h.elapsed, lastTime: h.lastTime,
    };
    return {initial, after};
}"""


async def main():
    async with async_playwright() as p:
        for opts in [
            ["--no-sandbox", "--use-gl=swiftshader", "--enable-webgl"],
            [
                "--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader-webgl",
                "--enable-webgl", "--ignore-gpu-blocklist",
                "--disable-renderer-backgrounding", "--disable-background-timer-throttling",
                "--disable-features=CalculateNativeWinOcclusion",
            ],
        ]:
            print("ARGS:", opts)
            browser = await p.chromium.launch(headless=True, args=opts)
            ctx = await browser.new_context(viewport={"width": 1440, "height": 900})
            page = await ctx.new_page()
            await page.goto(URL, wait_until="networkidle", timeout=60000)
            await page.wait_for_timeout(2500)
            res = await page.evaluate(DIAG_JS)
            print(json.dumps(res, indent=2, default=str))
            await browser.close()


asyncio.run(main())
