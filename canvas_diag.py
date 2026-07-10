import asyncio
import json
from playwright.async_api import async_playwright

URL = "https://wxm4fuuqlj7f.space.minimax.io"

JS_SAMPLE = """async () => {
    function hashD(data) {
        // quick non-crypto hash
        let h = 5381;
        for (let i = 0; i < data.length; i += 64) { h = ((h<<5) + h) ^ data[i]; }
        return (h >>> 0).toString(16);
    }
    const canvas = document.querySelector('#payd-hero-3d canvas');
    if (!canvas) return {err: 'no canvas'};
    const url = canvas.toDataURL('image/png');
    const h1 = hashD(url);
    await new Promise(r => setTimeout(r, 1500));
    const url2 = canvas.toDataURL('image/png');
    const h2 = hashD(url2);
    await new Promise(r => setTimeout(r, 3500));
    const url3 = canvas.toDataURL('image/png');
    const h3 = hashD(url3);
    return {
        canvasW: canvas.width, canvasH: canvas.height,
        hash1: h1, hash2: h2, hash3: h3,
        url1Len: url.length, url3Len: url3.length,
        different: h1 !== h2 && h2 !== h3,
    };
}"""


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--use-gl=swiftshader",
                "--enable-webgl",
                "--ignore-gpu-blocklist",
            ],
        )
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()
        await page.goto(URL, wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(3000)
        result = await page.evaluate(JS_SAMPLE)
        print("CANVAS DIAG:", json.dumps(result, indent=2))
        await browser.close()


asyncio.run(main())
