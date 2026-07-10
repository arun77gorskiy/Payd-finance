"""Minimal playwright test"""
import asyncio
from playwright.async_api import async_playwright

async def main():
    print("Starting playwright test...")
    async with async_playwright() as p:
        print("Got playwright context")
        browser = await p.chromium.launch(headless=True)
        print("Browser launched")
        context = await browser.new_context(viewport={"width": 1400, "height": 800})
        page = await context.new_page()
        print("Page created")
        await page.goto("about:blank")
        print("Navigated to blank")
        await page.goto("https://wxm4fuuqlj7f.space.minimax.io/", timeout=30000)
        print("Navigated to URL")
        await page.wait_for_timeout(2000)
        print("Saving test screenshot")
        await page.screenshot(path="/workspace/imgs/test-screenshot.png")
        print("Test screenshot saved")
        await browser.close()
        print("Done")

asyncio.run(main())
