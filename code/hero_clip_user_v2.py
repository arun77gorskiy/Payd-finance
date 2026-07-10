from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch()
    # Use larger viewport to accommodate the requested clip area
    page = browser.new_page(viewport={"width": 1440, "height": 720})
    page.set_default_timeout(60000)

    page.goto("https://wxm4fuuqlj7f.space.minimax.io", wait_until="domcontentloaded")
    time.sleep(2)

    # Step 1: Scroll to top
    page.evaluate("window.scrollTo(0, 0)")
    time.sleep(1)

    # Step 2: Wait 15 seconds for animation
    print("Waiting 15 seconds for animation to play multiple cycles...")
    time.sleep(15)

    # Step 3: Execute window.scrollTo(0, 0)
    page.evaluate("window.scrollTo(0, 0)")
    time.sleep(0.5)

    # Step 4: Wait additional 2 seconds
    print("Waiting 2 more seconds...")
    time.sleep(2)

    # Get element bounding box
    try:
        bbox = page.evaluate("() => document.querySelector('#payd-hero-3d')?.getBoundingClientRect().toJSON()")
        print(f'Element #payd-hero-3d bbox: {bbox}')
    except Exception as e:
        print(f'Element query error: {e}')
        bbox = None

    # Step 5: Bounding box clip screenshot with user-specified coordinates
    clip = {'x': 745, 'y': 129, 'width': 582, 'height': 460}
    print(f'Taking bounding box clip screenshot with: {clip}')

    try:
        page.screenshot(
            path='/workspace/browser/screenshots/payd-hero-3d-clip-user.png',
            clip=clip,
            type='png',
            timeout=60000
        )
        print('Bounding box clip screenshot saved')
    except Exception as e:
        print(f'Clip screenshot error: {e}')
        # Fallback: take viewport screenshot only
        page.screenshot(
            path='/workspace/browser/screenshots/payd-hero-3d-clip-user.png',
            timeout=60000
        )
        print('Fallback viewport screenshot saved')

    # Step 6: Full page screenshot
    try:
        page.screenshot(
            path='/workspace/browser/screenshots/full-page-user.png',
            full_page=True,
            timeout=60000
        )
        print('Full page screenshot saved')
    except Exception as e:
        print(f'Full page error: {e}')

    browser.close()
    print('Done')