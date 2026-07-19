import json
from playwright.sync_api import sync_playwright

def run_tokens_page():
    url = "https://z9pkc33iymx7.space.minimax.io/tokens.html"
    js_code = """
    (function() {
        const result = {
            pageURL: window.location.href,
            pageTitle: document.title,
            bodyTextPreview: document.body.innerText.slice(0, 1500),
            tokenRows: document.querySelectorAll('tr, [class*="token"], [class*="Token"]').length,
            legacyKeywords: ['DEFAULT_PROJECTS', 'SEED_DATA', 'MOCK_DATA', 'HARDCODED', 'seedProjects', 'defaultProjects'].filter(k => {
                const scripts = Array.from(document.scripts);
                return scripts.some(s => s.textContent.includes(k));
            }),
            windowProjectVars: Object.keys(window).filter(k =>
                k.toLowerCase().includes('project') ||
                k.toLowerCase().includes('token') ||
                k.toLowerCase().includes('seed') ||
                k.toLowerCase().includes('default')
            ),
            localStorageKeys: Object.keys(localStorage),
            scripts: Array.from(document.scripts).map(s => s.src).filter(Boolean)
        };
        return result;
    })()
    """

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-setuid-sandbox'])
        context = browser.new_context()
        page = context.new_page()

        print(f"[*] Navigated to {url}")
        page.goto(url, wait_until='networkidle')
        print("[*] Waiting 3 seconds...")
        page.wait_for_timeout(3000)

        print("[*] Executing tokens page diagnostic...")
        result = page.evaluate(js_code)
        browser.close()
        return result

if __name__ == "__main__":
    result = run_tokens_page()
    print("\n" + "="*60)
    print("TOKENS PAGE REPORT:")
    print("="*60)
    print(json.dumps(result, ensure_ascii=False, indent=2))
