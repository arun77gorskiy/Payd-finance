import asyncio
import json
import os
from playwright.async_api import async_playwright

URL = "https://wxm4fuuqlj7f.space.minimax.io"


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--use-gl=swiftshader",
                "--enable-webgl",
                "--ignore-gpu-blocklist",
                "--enable-accelerated-2d-canvas",
            ],
        )
        context = await browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        page = await context.new_page()
        await page.goto(URL, wait_until="networkidle", timeout=60000)
        await page.wait_for_timeout(2500)

        info = await page.evaluate(
            """() => {
                function safeJSON(v, depth=1) {
                    const seen = new WeakSet();
                    function walk(x, d) {
                        if (x === null) return null;
                        if (typeof x !== 'object') return x;
                        if (d > 4) return '[truncated depth]';
                        if (seen.has(x)) return '[circular]';
                        seen.add(x);
                        if (Array.isArray(x)) {
                            const arr = [];
                            for (let i = 0; i < Math.min(x.length, 8); i++) arr.push(walk(x[i], d+1));
                            return {__isArray: true, __len: x.length, items: arr};
                        }
                        const out = {};
                        for (const k of Object.keys(x).slice(0, 60)) {
                            try { out[k] = walk(x[k], d+1); } catch(e) { out[k] = '[err:'+e+']'; }
                        }
                        return out;
                    }
                    return walk(v, 0);
                }
                const h = window.__heroPremium;
                if (!h) return {hasHero: false};
                const own = Object.getOwnPropertyNames(h);
                const proto = h.__proto__;
                const protoNames = proto ? Object.getOwnPropertyNames(proto) : [];
                const sample = (h.bars || []).slice(0, 3).map(b => safeJSON(b));
                const fonts = (document.fonts && document.fonts.status) || null;
                return {
                    hasHero: true,
                    ownNames: own,
                    protoNames,
                    barsLength: Array.isArray(h.bars) ? h.bars.length : null,
                    fontReady: h.fontReady,
                    fontsStatus: fonts,
                    sampleBar: sample,
                    heroSafe: safeJSON(h),
                };
            }"""
        )
        os.makedirs("/workspace/data", exist_ok=True)
        with open("/workspace/data/hero_inspect.json", "w") as f:
            json.dump(info, f, indent=2, default=str)
        # Brief print of top-level keys
        print("OWN:", info.get("ownNames"))
        print("PROTO:", info.get("protoNames"))
        print("barsLength:", info.get("barsLength"), "fontReady:", info.get("fontReady"))
        print("saved /workspace/data/hero_inspect.json")

        await browser.close()


asyncio.run(main())
