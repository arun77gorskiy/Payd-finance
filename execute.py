import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            executable_path='/home/minimax/.cache/ms-playwright/chromium-1169/chrome-linux/chrome',
            args=['--no-sandbox', '--disable-setuid-sandbox']
        )
        context = await browser.new_context()
        page = await context.new_page()

        # Capture console messages
        console_logs = []
        page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: console_logs.append(f"[pageerror] {err}"))

        # Navigate to the target URL
        print('Navigating to https://k4ushhz0zlzo.space.minimax.io/ ...')
        await page.goto('https://k4ushhz0zlzo.space.minimax.io/', wait_until='networkidle', timeout=60000)

        # Wait a bit for any async scripts to populate window.__labLogs
        await page.wait_for_timeout(5000)

        # Execute the user-specified JavaScript code
        print('\nExecuting user-specified JavaScript code...')
        result = await page.evaluate("""() => {
            try {
                const logs = (window.__labLogs || []).slice(-40).map(l => l.level + ':' + l.msg);
                document.title = 'LOGS:' + JSON.stringify(logs);
                return {
                    success: true,
                    title: document.title,
                    totalLogs: (window.__labLogs || []).length,
                    last40: logs
                };
            } catch (e) {
                return { success: false, error: String(e) };
            }
        }""")

        print('\n=== RESULT ===')
        import json
        print(json.dumps(result, indent=2, ensure_ascii=False))

        print('\n=== Browser Console Logs (from listener) ===')
        for log in console_logs:
            print(log)

        await browser.close()

asyncio.run(main())
