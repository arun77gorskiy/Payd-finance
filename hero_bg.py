import asyncio, json, os, time, hashlib
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
                  "--disable-background-timer-throttling"])
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await context.new_page()
        await page.goto(URL, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_function(
            "() => window.__heroPremium && window.__heroPremium.renderer", timeout=30000)
        await page.wait_for_timeout(1500)
        await page.evaluate(
            "document.querySelector('#payd-hero-3d').scrollIntoView({block:'center', behavior:'instant'})")
        await page.wait_for_timeout(300)
        bbox = await page.evaluate(
            "() => { const r=document.querySelector('#payd-hero-3d').getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height};}")
        ev = await page.evaluate(
            "() => { const h=window.__heroPremium; if(!h) return {hasHero:false}; const bl=Array.isArray(h.bars)?h.bars.length:(h.bars&&typeof h.bars.length==='number'?h.bars.length:h.bars); return {hasHero:true,barsLength:bl,barsType:Array.isArray(h.bars)?'array':typeof h.bars,fontReady:h.fontReady,fontReadyType:typeof h.fontReady};}")
        clip = {"x": max(0, bbox["x"]), "y": max(0, bbox["y"]),
                "width": min(bbox["width"], 1440-max(0,bbox["x"])),
                "height": min(bbox["height"], 900-max(0,bbox["y"]))}
        with open(os.path.join(OUT, "element-info.json"), "w") as f:
            json.dump({"box": bbox, "clip": clip, "eval_result": ev,
                       "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}, f, indent=2)
        print("BBox:", json.dumps(bbox))
        print("Eval:", json.dumps(ev, indent=2))
        print("Clip:", json.dumps(clip))
        intervals = [3.5, 3.0, 4.0, 3.5]
        shots = []
        for i, d in enumerate(intervals):
            await page.wait_for_timeout(int(d * 1000))
            await page.evaluate(
                "() => { const h=window.__heroPremium; if(!h) return; try{if(h.composer)h.composer.render();}catch(e){} try{if(h.renderer&&h.scene&&h.camera)h.renderer.render(h.scene,h.camera);}catch(e){} }")
            elapsed = await page.evaluate("window.__heroPremium?.elapsed || 0")
            ts = int(time.time() * 1000)
            p_out = f"{OUT}/payd-hero-3d-frame-{i+1}-{ts}.png"
            await page.screenshot(path=p_out, clip=clip)
            sz = os.path.getsize(p_out)
            print(f"[{i+1}/4] elapsed={elapsed:.2f}s size={sz}b -> {p_out}")
            shots.append(p_out)
        hashes = {s: hashlib.md5(open(s,'rb').read()).hexdigest() for s in shots}
        for s, h in hashes.items():
            print(f"  {h} {s} ({os.path.getsize(s)}b)")
        print(f"Unique: {len(set(hashes.values()))}/{len(shots)}")
        await browser.close()
        print("Done.")

asyncio.run(main())