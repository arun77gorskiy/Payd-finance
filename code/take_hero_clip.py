#!/usr/bin/env python3
"""
Take a bounding box clip screenshot of #payd-hero-3d element
using Playwright with font requests intercepted to avoid font-loading wait.
"""
from playwright.sync_api import sync_playwright
import sys
import json

URL = "https://pnz0g46p7ivf.space.minimax.io/"
OUTPUT_PATH = "/workspace/browser/screenshots/hero_final_clip.png"
STATE_PATH = "/workspace/browser/screenshots/hero_state.json"


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=[
            "--disable-web-security",
            "--disable-features=IsolateOrigins,site-per-process",
            "--font-render-hinting=none",
        ])
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            device_scale_factor=1.0,
        )
        page = context.new_page()

        # Intercept font requests and resolve them quickly with an empty response
        def handle_route(route):
            req = route.request
            url = req.url
            if "font" in url.lower() or url.endswith((".woff", ".woff2", ".ttf", ".otf")):
                # Abort font requests - this prevents the page from waiting for fonts
                route.abort()
            else:
                route.continue_()

        page.route("**/*", handle_route)

        print(f"[INFO] Navigating to {URL}...", flush=True)
        page.goto(URL, wait_until="domcontentloaded", timeout=90000)
        print("[INFO] Page loaded. Waiting for #payd-hero-3d...", flush=True)

        try:
            page.wait_for_selector("#payd-hero-3d", state="attached", timeout=60000)
            print("[INFO] #payd-hero-3d is attached.", flush=True)
        except Exception as e:
            print(f"[WARN] {e}", flush=True)

        print("[INFO] Waiting 12s for animations...", flush=True)
        page.wait_for_timeout(12000)

        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(800)

        # Get bounding rect via JS
        result = page.evaluate("""() => {
            const el = document.querySelector('#payd-hero-3d');
            if (!el) return {error: 'not found'};
            const r = el.getBoundingClientRect();
            return {
                x: Math.max(0, r.x),
                y: Math.max(0, r.y),
                width: r.width,
                height: r.height,
                dpr: window.devicePixelRatio || 1,
            };
        }""")
        print(f"[INFO] bounding rect: {result}", flush=True)

        if "error" in result or result.get("width", 0) <= 0:
            print("[ERROR] No valid bounding rect", flush=True)
            browser.close()
            sys.exit(2)

        x = result["x"]
        y = result["y"]
        w = result["width"]
        h = result["height"]

        # Use CDP directly to take screenshot without waiting for stability
        cdp = context.new_cdp_session(page)
        try:
            cdp_result = cdp.send("Page.captureScreenshot", {
                "format": "png",
                "clip": {
                    "x": x,
                    "y": y,
                    "width": w,
                    "height": h,
                    "scale": 1,
                },
                "captureBeyondViewport": False,
                "fromSurface": True,
            })
            with open(OUTPUT_PATH, "wb") as f:
                f.write(bytes.fromhex(cdp_result["data"]) if isinstance(cdp_result["data"], str) else cdp_result["data"])
            print(f"[SUCCESS] CDP clip screenshot saved to {OUTPUT_PATH} ({w}x{h})", flush=True)
        except Exception as e:
            print(f"[ERROR] CDP screenshot failed: {e}", flush=True)
            # Fallback to page.screenshot with animations disabled
            try:
                page.screenshot(
                    path=OUTPUT_PATH,
                    clip={"x": x, "y": y, "width": w, "height": h},
                    animations="disabled",
                    timeout=10000,
                )
                print(f"[SUCCESS] Fallback clip screenshot saved to {OUTPUT_PATH} ({w}x{h})", flush=True)
            except Exception as e2:
                print(f"[ERROR] Fallback failed too: {e2}", flush=True)
                browser.close()
                sys.exit(3)

        # Verify JS state
        try:
            state = page.evaluate("""() => {
                const h = window.__heroPremium;
                if (!h) return {error: "window.__heroPremium is undefined"};
                return {
                    barsLength: h.bars ? h.bars.length : null,
                    ringsLength: h.rings ? h.rings.length : null,
                    fontReady: h.fontReady,
                    hasH: typeof h === 'object',
                };
            }""")
            print(f"[STATE] {state}", flush=True)
            with open(STATE_PATH, "w") as f:
                json.dump(state, f, indent=2)
            print(f"[INFO] State written to {STATE_PATH}", flush=True)
        except Exception as e:
            print(f"[WARN] Could not evaluate JS state: {e}", flush=True)

        browser.close()


if __name__ == "__main__":
    main()