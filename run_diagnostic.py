"""
Execute JavaScript diagnostic on the PAYD Intelligence V2 page.
"""
from playwright.sync_api import sync_playwright
import time
import json

URL = "https://aqoqcla8xsrh.space.minimax.io/intelligence-v2.html"

JS_CODE = """
(function() {
    // 1. Проверка localStorage
    const lsKeys = [];
    for (let i = 0; i < localStorage.length; i++) lsKeys.push(localStorage.key(i));

    // 2. Проверка PAYD_INTEL namespace
    const PAID = window.PAYD_INTEL || {};

    // 3. Проверка isProjectVerified для первых 3 проектов
    const sample = (PAID.LocalJsonDataProvider && new PAID.LocalJsonDataProvider()) || null;

    // 4. Прямая проверка данных
    let directCount = 0;
    let verifiedCount = 0;
    let allProjectsArray = null;
    try {
        const fetchResult = fetch('/data/projects.json').then(r => r.json()).then(arr => {
            allProjectsArray = arr;
            directCount = arr.length;
            verifiedCount = arr.filter(p => p.verifiedStatus === 'verified').length;
        });
    } catch(e) {}

    return {
        localStorageKeys: lsKeys,
        localStorageCount: lsKeys.length,
        hasLocalJsonProvider: !!PAID.LocalJsonDataProvider,
        hasProjectService: !!PAID.ProjectService,
        hasProjectRepository: !!PAID.ProjectRepository,
        dataProvider: PAID.DataProviderConfig ? PAID.DataProviderConfig.getActiveProvider() : null,
        paydIntelKeys: Object.keys(PAID)
    };
})()
"""

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-setuid-sandbox'])
    context = browser.new_context()
    page = context.new_page()
    page.goto(URL)
    print(f"[*] Navigated to {URL}")
    print("[*] Waiting 15 seconds for initialization...")
    time.sleep(15)

    # Execute the JS code
    print("[*] Executing JavaScript diagnostic...")
    result = page.evaluate(JS_CODE)

    # Also try to fetch projects.json directly via the page
    projects_data = page.evaluate("""
        (async () => {
            const res = await fetch('/data/projects.json');
            const arr = await res.json();
            return {
                count: arr.length,
                verifiedCount: arr.filter(p => p.verifiedStatus === 'verified').length,
                first3: arr.slice(0, 3).map(p => ({ id: p.id, verified: p.verifiedStatus }))
            };
        })()
    """)

    print("\n" + "="*60)
    print("DIAGNOSTIC RESULTS:")
    print("="*60)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    print("\n--- Projects Data ---")
    print(json.dumps(projects_data, indent=2, ensure_ascii=False))

    # Take screenshot
    page.screenshot(path="/workspace/diagnostic_screenshot.png")
    print("\n[*] Screenshot saved to /workspace/diagnostic_screenshot.png")

    browser.close()
