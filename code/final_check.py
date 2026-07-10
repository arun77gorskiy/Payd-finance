#!/usr/bin/env python3
"""Final check: clip via CDP + state."""
from playwright.sync_api import sync_playwright
import json, base64

URL = "https://pnz0g46p7ivf.space.minimax.io/"
OUTPUT_PATH = "/workspace/browser/screenshots/hero_final_clip.png"
STATE_PATH = "/workspace/browser/screenshots/hero_state.json"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1280, "height": 800})
    ctx.route("**/*", lambda r: r.abort() if any(r.request.url.endswith(e) for e in [".woff",".woff2",".ttf",".otf"]) else r.continue_())
    page = ctx.new_page()
    page.goto(URL, wait_until="domcontentloaded", timeout=90000)
    page.wait_for_selector("#payd-hero-3d", state="attached", timeout=60000)
    page.wait_for_timeout(12000)
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(800)

    rect = page.evaluate("""() => {
        const el = document.querySelector('#payd-hero-3d');
        const r = el.getBoundingClientRect();
        return {x: Math.max(0,r.x), y: Math.max(0,r.y), w: r.width, h: r.height};
    }""")
    print(f"[RECT] {rect}", flush=True)

    cdp = ctx.new_cdp_session(page)
    res = cdp.send("Page.captureScreenshot", {
        "format": "png",
        "clip": {"x": rect["x"], "y": rect["y"], "width": rect["w"], "height": rect["h"], "scale": 1},
        "captureBeyondViewport": False, "fromSurface": True,
    })
    with open(OUTPUT_PATH, "wb") as f:
        f.write(base64.b64decode(res["data"]))
    print(f"[OK] CDP clip: {rect['w']}x{rect['h']} -> {OUTPUT_PATH}", flush=True)

    state = page.evaluate("""() => {
        const hero = window.__heroPremium;
        const out = {
            heroPremiumExists: typeof hero !== 'undefined',
            heroPremium: hero ? {keys: Object.keys(hero), bars: hero.bars?.length, rings: hero.rings?.length, fontReady: hero.fontReady} : null,
            canvasExists: !!document.querySelector('#payd-hero-3d canvas'),
            fontsStatus: document.fonts.status,
            heroRelatedKeys: Object.keys(window).filter(k => k.toLowerCase().includes('hero') || k.startsWith('__')),
        };
        const cv = document.querySelector('#payd-hero-3d canvas');
        if (cv) { const r = cv.getBoundingClientRect(); out.canvasRect = {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}; }
        return out;
    }""")
    print(f"[STATE]\n{json.dumps(state, indent=2, ensure_ascii=False)}", flush=True)
    with open(STATE_PATH, "w") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)
    browser.close()
print("[DONE]")