from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch()
    # Use larger viewport to accommodate the requested clip area
    page = browser.new_page(viewport={"width": 1440, "height": 720})
    page.goto("https://wxm4fuuqlj7f.space.minimax.io", wait_until="networkidle")
    time.sleep(1)

    # Step 1: Scroll to top
    page.evaluate("window.scrollTo(0, 0)")
    time.sleep(1)

    # Step 2: Wait 15 seconds for animation to play
    print("Waiting 15 seconds for animation...")
    time.sleep(15)

    # Step 3: Execute window.scrollTo(0, 0)
    page.evaluate("window.scrollTo(0, 0)")
    time.sleep(0.5)

    # Step 4: Wait additional 2 seconds
    print("Waiting 2 more seconds...")
    time.sleep(2)

    # Get element bounding box for context
    try:
        bbox = page.evaluate("() => document.querySelector('#payd-hero-3d')?.getBoundingClientRect().toJSON()")
        print(f'Element #payd-hero-3d bbox: {bbox}')
    except Exception as e:
        print(f'Element query error: {e}')

    # Step 5: Bounding box clip screenshot with user-specified coordinates
    clip = {'x': 745, 'y': 129, 'width': 582, 'height': 460}
    page.screenshot(
        path='/workspace/browser/screenshots/payd-hero-3d-clip-user.png',
        clip=clip
    )
    print(f'Bounding box clip screenshot saved: {clip}')

    # Step 6: Full page screenshot
    page.screenshot(
        path='/workspace/browser/screenshots/full-page-user.png',
        full_page=True
    )
    print('Full page screenshot saved')

    browser.close()
    print('Done')